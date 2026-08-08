'use strict';

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');
const {
  IMPLEMENTED_DETECTORS,
  AUDIO_OPERATIONS,
  validateAnalyzeRequest,
  validateAlignRequest,
  validateSearchRequest,
  validateProcessRangeRequest,
  validateMasterRequest,
  parseSilenceEvents,
  parseLoudnormSummary,
  buildProcessFilter,
  buildMasterFilter,
  searchAnalysis,
  speechEventsFromSilence
} = require('./audio-tools');

const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const EXPORT_DIR = path.join(ROOT, 'exports');
const LIBRARY_FILE = path.join(ROOT, 'library.json');
const AUDIO_ANALYSIS_FILE = path.join(ROOT, 'audio-analyses.json');
const REALESRGAN_SCRIPT = path.join(ROOT, 'upscale_realesrgan.py');
const REALESRGAN_FAST_MODEL = path.join(ROOT, 'models', 'realesr-general-x4v3.pth');
const REALESRGAN_QUALITY_MODEL = path.join(ROOT, 'models', 'RealESRGAN_x4plus.pth');
const PORT = Number(process.env.PORT) || 3000;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_CLIPS = 200;
const MAX_BLUR_BOXES = 20;
const MAX_DURATION = 4 * 60 * 60;
const MAX_AUDIO_ANALYSES = 200;
const MAX_AUDIO_TASKS = 2;
const AUDIO_TASK_TIMEOUT_MS = 30 * 60 * 1000;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff', '.svg']);
const ALLOWED_EXTENSIONS = new Set([
  '.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v',
  '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus',
  ...IMAGE_EXTENSIONS
]);

for (const dir of [UPLOAD_DIR, EXPORT_DIR]) fs.mkdirSync(dir, { recursive: true });

function updateEta(job) {
  const phaseStart = job.phaseStartedAt ? Date.parse(job.phaseStartedAt) : NaN;
  if (!Number.isFinite(phaseStart) || !(job.progress > 0) || !job.phase) {
    job.etaSeconds = null;
    return;
  }
  const phaseElapsed = (Date.now() - phaseStart) / 1000;
  const within = job.progress / 100;

  if (within <= 0.01 || phaseElapsed < 2) { job.etaSeconds = null; return; }

  const remaining = (phaseElapsed / within) * (1 - within);
  job.etaSeconds = Math.max(0, Math.round(remaining));
}

let mediaLibrary = loadLibrary();
let audioAnalyses = loadAudioAnalyses();
const jobs = new Map();
const transcribeJobs = new Map();
let nvencCheck = null;
let librarySaveQueue = Promise.resolve();
let audioAnalysisSaveQueue = Promise.resolve();
let activeAudioTasks = 0;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function loadLibrary() {
  try {
    const entries = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
    return new Map(entries.filter((item) => item && item.id).map((item) => [item.id, item]));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Kunde inte läsa library.json:', error.message);
    return new Map();
  }
}

function loadAudioAnalyses() {
  try {
    const entries = JSON.parse(fs.readFileSync(AUDIO_ANALYSIS_FILE, 'utf8'));
    return new Map(entries.filter((item) => item && item.id).map((item) => [item.id, item]));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Kunde inte läsa audio-analyses.json:', error.message);
    return new Map();
  }
}

function saveLibrary() {
  const temporary = `${LIBRARY_FILE}.${crypto.randomUUID()}.tmp`;
  const write = async () => {
    try {
      const snapshot = JSON.stringify([...mediaLibrary.values()], null, 2);
      await fsp.writeFile(temporary, snapshot);
      await fsp.rename(temporary, LIBRARY_FILE);
    } catch (error) {
      await fsp.unlink(temporary).catch(() => {});
      throw error;
    }
  };
  const pending = librarySaveQueue.then(write, write);
  librarySaveQueue = pending.catch(() => {});
  return pending;
}

function saveAudioAnalyses() {
  const temporary = `${AUDIO_ANALYSIS_FILE}.${crypto.randomUUID()}.tmp`;
  const write = async () => {
    try {
      const entries = [...audioAnalyses.values()]
        .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
        .slice(-MAX_AUDIO_ANALYSES);
      audioAnalyses = new Map(entries.map((item) => [item.id, item]));
      await fsp.writeFile(temporary, JSON.stringify(entries, null, 2));
      await fsp.rename(temporary, AUDIO_ANALYSIS_FILE);
    } catch (error) {
      await fsp.unlink(temporary).catch(() => {});
      throw error;
    }
  };
  const pending = audioAnalysisSaveQueue.then(write, write);
  audioAnalysisSaveQueue = pending.catch(() => {});
  return pending;
}

async function withAudioTask(callback) {
  if (activeAudioTasks >= MAX_AUDIO_TASKS) {
    const error = new Error('För många ljudjobb körs samtidigt. Försök igen om en stund.');
    error.status = 429;
    throw error;
  }
  activeAudioTasks += 1;
  try {
    return await callback();
  } finally {
    activeAudioTasks -= 1;
  }
}

function requireAudioMedia(id) {
  let item = mediaLibrary.get(id);
  if (!item) {
    const refreshedLibrary = loadLibrary();
    item = refreshedLibrary.get(id);
    if (item) mediaLibrary = refreshedLibrary;
  }
  if (!item) {
    const error = new Error('Mediefilen finns inte.');
    error.status = 404;
    throw error;
  }
  if (!item.hasAudio) throw badRequest('Mediefilen saknar ljud.');
  if (path.basename(item.storedName) !== item.storedName) throw badRequest('Mediefilens lagringsnamn är ogiltigt.');
  const filePath = path.resolve(UPLOAD_DIR, item.storedName);
  if (path.dirname(filePath) !== path.resolve(UPLOAD_DIR)) throw badRequest('Mediefilens sökväg är ogiltig.');
  return { item, filePath };
}

function flattenTranscriptionWords(item) {
  return (item.transcription?.segments || []).flatMap((segment) =>
    (segment.words || []).map((word) => ({
      word: String(word.word || '').trim(),
      start: Number(word.start),
      end: Number(word.end),
      confidence: Number.isFinite(Number(word.confidence)) ? Number(word.confidence) : 0.8,
      speaker: word.speaker || null
    }))
  ).filter((word) => word.word && Number.isFinite(word.start) && Number.isFinite(word.end) && word.end >= word.start);
}

async function registerProcessedAudio(source, outputPath, id, suffix, operation) {
  const metadata = await probeMedia(outputPath, path.extname(outputPath).toLowerCase());
  const item = {
    id,
    name: `${source.name.replace(/\.[^.]+$/, '')}_${suffix}${path.extname(outputPath)}`.slice(0, 200),
    storedName: path.basename(outputPath),
    size: (await fsp.stat(outputPath)).size,
    createdAt: new Date().toISOString(),
    kind: 'audio',
    duration: metadata.duration,
    hasVideo: false,
    hasAudio: true,
    width: 0,
    height: 0,
    rotation: 0,
    videoCodec: null,
    audioCodec: metadata.audioCodec,
    processedFrom: source.id,
    audioOperation: operation
  };
  mediaLibrary.set(id, item);
  await saveLibrary();
  return item;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} avslutades med kod ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

function runProcessBuffer(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    const stdout = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ buffer: Buffer.concat(stdout), stderr });
      else reject(new Error(`${command} avslutades med kod ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

function waveformPeaksFromPcm(buffer, width) {
  const sampleCount = Math.floor(buffer.length / 4);
  const peaks = new Float32Array(Math.max(1, width));
  if (!sampleCount) return peaks;
  const samplesPerPeak = Math.max(1, sampleCount / peaks.length);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const peakIndex = Math.min(peaks.length - 1, Math.floor(sampleIndex / samplesPerPeak));
    const amplitude = Math.abs(buffer.readFloatLE(sampleIndex * 4));
    if (amplitude > peaks[peakIndex]) peaks[peakIndex] = amplitude;
  }
  return peaks;
}

function probeSvg(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const svgTag = content.match(/<svg[^>]*>/i);
  if (!svgTag) throw badRequest('Kunde inte läsa SVG-filen.');
  const attr = (name) => {
    const m = svgTag[0].match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
    return m ? m[1] : null;
  };
  let width = 0, height = 0;
  const wStr = attr('width');
  const hStr = attr('height');
  const vb = attr('viewBox');
  if (wStr) width = parseFloat(wStr);
  if (hStr) height = parseFloat(hStr);
  if ((!width || !height) && vb) {
    const parts = vb.split(/[\s,]+/).map(Number);
    if (parts.length >= 4) { if (!width) width = parts[2]; if (!height) height = parts[3]; }
  }
  if (!width || !Number.isFinite(width) || width <= 0) width = 300;
  if (!height || !Number.isFinite(height) || height <= 0) height = 150;
  return {
    kind: 'image', duration: 5, hasVideo: true, hasAudio: false,
    width: Math.round(width), height: Math.round(height),
    rotation: 0, videoCodec: 'svg', audioCodec: null
  };
}

async function probeMedia(filePath, extension) {
  if (extension === '.svg') return probeSvg(filePath);
  const { stdout } = await runProcess('ffprobe', [
    '-v', 'error', '-show_entries',
    'format=duration:stream=index,codec_type,codec_name,width,height,duration:' +
    'stream_tags=rotate:stream_side_data=rotation',
    '-of', 'json', filePath
  ]);
  const result = JSON.parse(stdout);
  const video = result.streams?.find((stream) => stream.codec_type === 'video');
  const audio = result.streams?.find((stream) => stream.codec_type === 'audio');
  const isImage = IMAGE_EXTENSIONS.has(extension);
  const duration = Number(result.format?.duration || video?.duration || audio?.duration);
  if ((!video && !audio) || (!isImage && (!Number.isFinite(duration) || duration <= 0))) {
    throw badRequest('Filen innehåller ingen användbar video eller ljudström.');
  }
  if (isImage && !video) throw badRequest('Bildfilen kunde inte avkodas.');
  const rotationValue = video?.side_data_list?.find((item) => Number.isFinite(Number(item.rotation)))?.rotation
    ?? video?.tags?.rotate
    ?? 0;
  const rotation = ((Math.round(Number(rotationValue) / 90) * 90) % 360 + 360) % 360;
  const swapsDimensions = rotation === 90 || rotation === 270;
  const encodedWidth = Number(video?.width || 0);
  const encodedHeight = Number(video?.height || 0);
  return {
    kind: isImage ? 'image' : (video ? 'video' : 'audio'),
    duration: isImage ? 5 : duration,
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    width: swapsDimensions ? encodedHeight : encodedWidth,
    height: swapsDimensions ? encodedWidth : encodedHeight,
    rotation,
    videoCodec: video?.codec_name || null,
    audioCodec: audio?.codec_name || null
  };
}

async function refreshLegacyVideoMetadata() {
  let changed = false;
  for (const [id, item] of mediaLibrary) {
    if (item.kind !== 'video' || Number.isFinite(item.rotation)) continue;
    const filePath = path.join(UPLOAD_DIR, item.storedName);
    try {
      const metadata = await probeMedia(filePath, path.extname(item.storedName).toLowerCase());
      mediaLibrary.set(id, { ...item, ...metadata });
      changed = true;
    } catch (error) {
      console.warn(`Kunde inte uppdatera metadata för ${item.name}:`, error.message);
    }
  }
  if (changed) await saveLibrary();
}

async function hasWorkingNvenc(force = false) {
  if (nvencCheck && !force) return nvencCheck;
  nvencCheck = runProcess('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'color=black:s=256x256:d=0.1', '-frames:v', '1', '-c:v', 'h264_nvenc', '-f', 'null', '-'
  ]).then(() => true).catch(() => false);
  return nvencCheck;
}

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(ALLOWED_EXTENSIONS.has(extension) ? null : badRequest('Filtypen stöds inte.'), ALLOWED_EXTENSIONS.has(extension));
  }
});

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use('/api/audio', (request, response, next) => {
  const address = request.socket.remoteAddress || '';
  const loopback = address === '::1' || address === '127.0.0.1' || address.startsWith('::ffff:127.');
  if (!loopback) return response.status(403).json({ error: 'Ljudverktygen är endast tillgängliga lokalt.' });
  next();
});

app.get('/api/status', async (_request, response) => {
  response.json({
    ffmpeg: true,
    nvenc: await hasWorkingNvenc(),
    audioApi: true,
    version: '0.10.1'
  });
});

app.get('/api/media', (_request, response) => response.json([...mediaLibrary.values()]));

app.post('/api/media', upload.single('media'), async (request, response, next) => {
  if (!request.file) return response.status(400).json({ error: 'Ingen fil skickades.' });
  let item = null;
  try {
    const extension = path.extname(request.file.originalname).toLowerCase();
    const metadata = await probeMedia(request.file.path, extension);
    item = {
      id: crypto.randomUUID(),
      name: path.basename(request.file.originalname).slice(0, 200),
      storedName: request.file.filename,
      size: request.file.size,
      createdAt: new Date().toISOString(),
      ...metadata
    };
    mediaLibrary.set(item.id, item);
    await saveLibrary();
    response.status(201).json(item);
  } catch (error) {
    if (item) mediaLibrary.delete(item.id);
    await fsp.unlink(request.file.path).catch(() => {});
    if (!error.status) error.status = 400;
    next(error);
  }
});

app.post('/api/media/html', async (request, response, next) => {
  try {
    const body = request.body || {};
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!code) throw badRequest('Ingen HTML-kod angiven.');
    if (code.length > MAX_HTML_CODE) throw badRequest('HTML-koden är för lång.');
    const width = Math.max(2, Math.min(4096, Math.round(Number(body.width) || 1280)));
    const height = Math.max(2, Math.min(4096, Math.round(Number(body.height) || 720)));
    const duration = Math.max(0.1, Math.min(300, Number(body.duration) || 5));
    const fps = Math.max(1, Math.min(60, Math.round(Number(body.fps) || 30)));
    const background = /^#[0-9a-f]{6}$/i.test(String(body.background || '')) ? body.background : '#000000';
    const name = (typeof body.name === 'string' && body.name.trim())
      ? `${path.basename(body.name.trim()).replace(/\.mp4$/i, '')}.mp4`.slice(0, 200)
      : 'HTML-animation.mp4';
    const item = await renderHtmlClipToMedia({ code, width, height, duration, fps, background, name });
    response.status(201).json(item);
  } catch (error) {
    if (!error.status) error.status = 400;
    next(error);
  }
});

app.get('/api/media/:id/file', (request, response) => {
  const item = mediaLibrary.get(request.params.id);
  if (!item) return response.status(404).json({ error: 'Mediefilen finns inte.' });
  response.setHeader('Cache-Control', 'private, max-age=3600');
  response.sendFile(path.join(UPLOAD_DIR, item.storedName));
});

app.get('/api/media/:id/waveform', async (request, response, next) => {
  try {
    const { item, filePath } = requireAudioMedia(request.params.id);
    const width = Math.round(clamp(Number(request.query.width) || 400, 32, 2000));
    const start = clamp(Number(request.query.start) || 0, 0, item.duration || MAX_DURATION);
    const requestedEnd = Number(request.query.end);
    const end = clamp(Number.isFinite(requestedEnd) ? requestedEnd : (item.duration || MAX_DURATION), start, item.duration || MAX_DURATION);
    const duration = end - start;
    if (duration <= 0) throw badRequest('Waveformens intervall är tomt.');
    const sampleRate = 2000;
    const result = await withAudioTask(() => runProcessBuffer('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-ss', String(start), '-i', filePath, '-t', String(duration),
      '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1'
    ], { timeout: AUDIO_TASK_TIMEOUT_MS, killSignal: 'SIGKILL' }));
    const peaks = waveformPeaksFromPcm(result.buffer, width);
    const maxPeak = peaks.reduce((max, peak) => Math.max(max, peak), 0) || 1;
    response.json({
      peaks: Array.from(peaks, (peak) => Math.min(1, peak / maxPeak)),
      duration,
      sampleRate
    });
  } catch (error) {
    if (!error.status) error.status = 400;
    next(error);
  }
});

app.post('/api/media/:id/transcribe', async (request, response, next) => {
  try {
    const item = mediaLibrary.get(request.params.id);
    if (!item) return response.status(404).json({ error: 'Mediefilen finns inte.' });
    if (item.kind !== 'video' && item.kind !== 'audio') {
      return response.status(400).json({ error: 'Endast video- och ljudklipp kan transkriberas.' });
    }
    if (!item.hasAudio) return response.status(400).json({ error: 'Klippet saknar ljud att transkribera.' });

    const model = typeof request.body?.model === 'string' ? request.body.model : 'small';
    if (!ALLOWED_WHISPER_MODELS.has(model)) throw badRequest('Okänd Whisper-modell.');
    const language = typeof request.body?.language === 'string' && request.body.language ? request.body.language : null;
    if (language && !ALLOWED_WHISPER_LANGUAGES.has(language)) throw badRequest('Språket stöds inte.');

    const jobId = crypto.randomUUID();
    const job = { id: jobId, mediaId: item.id, status: 'queued', progress: 0, createdAt: new Date().toISOString() };
    transcribeJobs.set(jobId, job);
    response.status(202).json(job);
    setImmediate(() => {
      runTranscriptionJob(jobId, item, model, language).catch((error) => {
        Object.assign(job, { status: 'failed', error: error.message || 'Transkriberingen kunde inte startas.' });
      });
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/transcribe/:id', (request, response) => {
  const job = transcribeJobs.get(request.params.id);
  if (!job) return response.status(404).json({ error: 'Transkriberingsjobbet finns inte.' });
  response.json(job);
});

app.post('/api/transcribe/:id/cancel', (request, response) => {
  const job = transcribeJobs.get(request.params.id);
  if (!job) return response.status(404).json({ error: 'Transkriberingsjobbet finns inte.' });
  if (['completed', 'failed', 'cancelled'].includes(job.status)) return response.json({ status: job.status });
  Object.assign(job, { status: 'cancelled', error: 'Avbruten av användaren.' });
  if (job.pid) {
    try { process.kill(job.pid, 'SIGKILL'); } catch (_error) { /* redan död */ }
  }
  response.json({ status: 'cancelled' });
});

app.post('/api/media/:id/extract-audio', async (request, response, next) => {
  try {
    const item = mediaLibrary.get(request.params.id);
    if (!item) return response.status(404).json({ error: 'Mediefilen finns inte.' });
    if (!item.hasAudio) return response.status(400).json({ error: 'Källan saknar ljud att extrahera.' });
    const sourcePath = path.join(UPLOAD_DIR, item.storedName);
    const audioId = crypto.randomUUID();
    const canCopyWithoutLoss = item.audioCodec === 'aac';
    const extension = canCopyWithoutLoss ? '.m4a' : '.wav';
    const audioName = `${item.name.replace(/\.[^.]+$/, '')}_ljud${extension}`;
    const storedName = `${audioId}${extension}`;
    const audioPath = path.join(UPLOAD_DIR, storedName);
    const audioStreamIndex = canCopyWithoutLoss
      ? ['-map', '0:a:0', '-c:a', 'copy']
      : ['-map', '0:a:0', '-c:a', 'pcm_s16le'];
    await runProcess('ffmpeg', [
      '-hide_banner', '-y', '-i', sourcePath, '-vn', ...audioStreamIndex, audioPath
    ]);
    const probe = await probeMedia(audioPath, extension).catch(() => null);
    const duration = probe?.duration || item.duration || 0;
    const audioItem = {
      id: audioId,
      name: audioName.slice(0, 200),
      storedName,
      size: (await fsp.stat(audioPath)).size,
      createdAt: new Date().toISOString(),
      kind: 'audio',
      duration,
      hasVideo: false,
      hasAudio: true,
      width: 0,
      height: 0,
      rotation: 0,
      videoCodec: null,
      audioCodec: canCopyWithoutLoss ? 'aac' : 'pcm_s16le',
      extractedFrom: item.id
    };
    mediaLibrary.set(audioId, audioItem);
    await saveLibrary();
    response.status(201).json(audioItem);
  } catch (error) {
    if (!error.status) error.status = 400;
    next(error);
  }
});

const noiseProfiles = new Map();

app.post('/api/media/:id/noise-print', async (request, response, next) => {
  try {
    const item = mediaLibrary.get(request.params.id);
    if (!item) return response.status(404).json({ error: 'Mediefilen finns inte.' });
    if (!item.hasAudio) return response.status(400).json({ error: 'Filen har inget ljud.' });
    const duration = item.duration || 0;
    const startTime = Number(request.body?.startTime) || 0;
    const endTime = Number(request.body?.endTime) || Math.min(startTime + 0.5, duration);
    if (startTime < 0 || endTime > duration || endTime - startTime < 0.05) {
      return response.status(400).json({ error: 'Ogiltigt tidsintervall.' });
    }
    const profileId = crypto.randomUUID();
    const sampleName = `${profileId}.wav`;
    const samplePath = path.join(UPLOAD_DIR, sampleName);
    const sourcePath = path.join(UPLOAD_DIR, item.storedName);
    await runProcess('ffmpeg', [
      '-hide_banner', '-y', '-i', sourcePath,
      '-ss', String(startTime), '-to', String(endTime),
      '-ac', '1', '-ar', '16000', '-sample_fmt', 's16',
      samplePath
    ]);
    const probe = await probeMedia(samplePath, '.wav').catch(() => null);
    const volumeAnalysis = await runProcess('ffmpeg', [
      '-hide_banner', '-i', samplePath, '-af', 'volumedetect', '-f', 'null', '-'
    ]);
    const noiseFloorDb = parseNoiseFloor(volumeAnalysis.stderr);
    noiseProfiles.set(profileId, {
      id: profileId, mediaId: item.id, samplePath, sampleDuration: probe?.duration || (endTime - startTime),
      createdAt: new Date().toISOString(), startTime, endTime, noiseFloorDb
    });
    response.status(201).json({ id: profileId, sampleDuration: endTime - startTime, noiseFloorDb });
  } catch (error) {
    if (!error.status) error.status = 400;
    next(error);
  }
});

app.post('/api/media/:id/reduce-noise', async (request, response, next) => {
  try {
    const item = mediaLibrary.get(request.params.id);
    if (!item) return response.status(404).json({ error: 'Mediefilen finns inte.' });
    if (!item.hasAudio) return response.status(400).json({ error: 'Filen har inget ljud.' });
    const amount = clamp(Number(request.body?.amount ?? 0.8), 0, 1);
    const noiseProfileId = String(request.body?.noiseProfileId || '');
    const noiseProfile = noiseProfiles.get(noiseProfileId);
    if (!noiseProfileId || !noiseProfile) {
      return response.status(400).json({ error: 'Inget brusprofil hittades. Fånga en brusprofil först.' });
    }
    if (noiseProfile.mediaId !== item.id) {
      return response.status(400).json({ error: 'Brusprofilen tillhör ett annat ljudklipp.' });
    }
    const newId = crypto.randomUUID();
    const storedName = `${newId}.m4a`;
    const outputPath = path.join(UPLOAD_DIR, storedName);
    const sourcePath = path.join(UPLOAD_DIR, item.storedName);
    const noiseReductionDb = 0.01 + amount * 29.99;
    const noiseFloorDb = clamp(noiseProfile.noiseFloorDb, -80, -20);
    await runProcess('ffmpeg', [
      '-hide_banner', '-y', '-i', sourcePath,
      '-af', `afftdn=nf=${noiseFloorDb.toFixed(1)}:nr=${noiseReductionDb.toFixed(1)}:nt=w:gs=8`,
      '-c:a', 'aac', '-b:a', '192k', outputPath
    ]);
    const probe = await probeMedia(outputPath, '.m4a').catch(() => null);
    const audioItem = {
      id: newId, name: `${item.name.replace(/\.[^.]+$/, '')}_denoist.m4a`,
      storedName, size: (await fsp.stat(outputPath)).size,
      createdAt: new Date().toISOString(), kind: 'audio', duration: probe?.duration || item.duration || 0,
      hasVideo: false, hasAudio: true, width: 0, height: 0, rotation: 0, videoCodec: null, audioCodec: 'aac',
      processedFrom: item.id, noiseProfileId
    };
    mediaLibrary.set(newId, audioItem);
    await saveLibrary();
    response.status(201).json(audioItem);
  } catch (error) {
    if (!error.status) error.status = 400;
    next(error);
  }
});

app.post('/api/media/:id/noise-gate', async (request, response, next) => {
  try {
    const item = mediaLibrary.get(request.params.id);
    if (!item) return response.status(404).json({ error: 'Mediefilen finns inte.' });
    if (!item.hasAudio) return response.status(400).json({ error: 'Filen har inget ljud.' });
    const threshold = clamp(Number(request.body?.threshold ?? 0.05), 0.001, 1);
    const attack = clamp(Number(request.body?.attack ?? 2), 0.1, 100);
    const release = clamp(Number(request.body?.release ?? 10), 1, 500);
    const newId = crypto.randomUUID();
    const storedName = `${newId}.m4a`;
    const outputPath = path.join(UPLOAD_DIR, storedName);
    const sourcePath = path.join(UPLOAD_DIR, item.storedName);
    await runProcess('ffmpeg', [
      '-hide_banner', '-y', '-i', sourcePath,
      '-af', `agate=threshold=${threshold.toFixed(4)}:attack=${attack.toFixed(2)}:release=${release.toFixed(2)}:makeup=1:ratio=10`,
      '-c:a', 'aac', '-b:a', '192k', outputPath
    ]);
    const probe = await probeMedia(outputPath, '.m4a').catch(() => null);
    const audioItem = {
      id: newId, name: `${item.name.replace(/\.[^.]+$/, '')}_gate.m4a`,
      storedName, size: (await fsp.stat(outputPath)).size,
      createdAt: new Date().toISOString(), kind: 'audio', duration: probe?.duration || item.duration || 0,
      hasVideo: false, hasAudio: true, width: 0, height: 0, rotation: 0, videoCodec: null, audioCodec: 'aac',
      processedFrom: item.id
    };
    mediaLibrary.set(newId, audioItem);
    await saveLibrary();
    response.status(201).json(audioItem);
  } catch (error) {
    if (!error.status) error.status = 400;
    next(error);
  }
});

app.get('/api/audio/tools', (_request, response) => {
  response.json({
    version: '1.0',
    base_url: '/api/audio',
    security: {
      input_reference: 'media_id',
      network: 'loopback_only',
      note: 'Filsökvägar accepteras inte. Hämta media_id från GET /api/media.'
    },
    capabilities: {
      detectors: [...IMPLEMENTED_DETECTORS],
      optional_detectors_not_installed: ['noise', 'background_noise', 'music', 'laughter', 'cough'],
      operations: [...AUDIO_OPERATIONS],
      presets: ['spoken_podcast']
    },
    tools: [
      {
        name: 'analyze_audio',
        method: 'POST',
        path: '/api/audio/analyze',
        required: ['media_id'],
        optional: ['window_ms', 'detect']
      },
      {
        name: 'align_transcript',
        method: 'POST',
        path: '/api/audio/align',
        required: ['media_id', 'transcript'],
        optional: ['language'],
        prerequisite: 'Mediet måste först ha transkriberats med POST /api/media/:id/transcribe.'
      },
      {
        name: 'search_audio',
        method: 'POST',
        path: '/api/audio/search',
        required: ['analysis_id', 'query']
      },
      {
        name: 'process_audio_range',
        method: 'POST',
        path: '/api/audio/process-range',
        required: ['media_id', 'start', 'end', 'operations']
      },
      {
        name: 'master_podcast',
        method: 'POST',
        path: '/api/audio/master',
        required: ['media_id'],
        optional: ['analysis_id', 'preset', 'settings']
      }
    ]
  });
});

app.get('/api/audio/analysis/:id', (request, response) => {
  const analysis = audioAnalyses.get(request.params.id);
  if (!analysis) return response.status(404).json({ error: 'Analysen finns inte.' });
  response.json(analysis);
});

app.post('/api/audio/analyze', async (request, response, next) => {
  try {
    const input = validateAnalyzeRequest(request.body);
    const { item, filePath } = requireAudioMedia(input.mediaId);
    const result = await withAudioTask(async () => {
      const wantsSilence = input.detect.includes('silence') || input.detect.includes('speech');
      const wantsLoudness = input.detect.includes('loudness') || input.detect.includes('clipping');
      const [silenceResult, loudnessResult] = await Promise.all([
        wantsSilence
          ? runProcess('ffmpeg', [
            '-hide_banner', '-nostats', '-i', filePath, '-vn',
            '-af', 'silencedetect=noise=-45dB:d=0.25', '-f', 'null', '-'
          ], { timeout: AUDIO_TASK_TIMEOUT_MS, killSignal: 'SIGKILL' })
          : Promise.resolve({ stderr: '' }),
        wantsLoudness
          ? runProcess('ffmpeg', [
            '-hide_banner', '-nostats', '-i', filePath, '-vn',
            '-af', 'loudnorm=I=-16:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'
          ], { timeout: AUDIO_TASK_TIMEOUT_MS, killSignal: 'SIGKILL' })
          : Promise.resolve({ stderr: '' })
      ]);

      const duration = Number(item.duration);
      const silences = wantsSilence ? parseSilenceEvents(silenceResult.stderr, duration) : [];
      const loudness = wantsLoudness
        ? parseLoudnormSummary(loudnessResult.stderr)
        : { integratedLufs: null, truePeakDb: null, loudnessRangeLu: null, thresholdLufs: null };
      const events = [];
      if (input.detect.includes('silence')) events.push(...silences);
      if (input.detect.includes('speech')) events.push(...speechEventsFromSilence(silences, duration));
      if (input.detect.includes('clipping') && loudness.truePeakDb !== null && loudness.truePeakDb >= -0.1) {
        events.push({
          start: 0,
          end: duration,
          type: 'clipping',
          confidence: 0.7,
          scope: 'file',
          peak_db: loudness.truePeakDb
        });
      }
      events.sort((left, right) => left.start - right.start || left.end - right.end);
      const analysis = {
        id: crypto.randomUUID(),
        media_id: item.id,
        duration,
        integrated_lufs: loudness.integratedLufs,
        true_peak_db: loudness.truePeakDb,
        loudness_range_lu: loudness.loudnessRangeLu,
        events,
        words: flattenTranscriptionWords(item),
        requested_detect: input.detect,
        unsupported_detect: input.detect.filter((detector) => !IMPLEMENTED_DETECTORS.has(detector)),
        window_ms: input.windowMs,
        createdAt: new Date().toISOString()
      };
      audioAnalyses.set(analysis.id, analysis);
      await saveAudioAnalyses();
      return analysis;
    });
    response.status(201).json({ analysis_id: result.id, ...result });
  } catch (error) {
    next(error);
  }
});

app.post('/api/audio/align', async (request, response, next) => {
  try {
    const input = validateAlignRequest(request.body);
    const { item } = requireAudioMedia(input.mediaId);
    const words = flattenTranscriptionWords(item);
    if (!words.length) {
      const error = new Error('Ord-tidskoder saknas. Transkribera mediet först via POST /api/media/:id/transcribe.');
      error.status = 409;
      throw error;
    }
    const requestedWords = input.transcript.toLocaleLowerCase(input.language === 'auto' ? 'sv' : input.language)
      .match(/[\p{L}\p{N}]+/gu) || [];
    const recognized = new Set(words.map((word) => word.word.toLocaleLowerCase('sv').replace(/[^\p{L}\p{N}]/gu, '')));
    const matched = requestedWords.filter((word) => recognized.has(word)).length;
    for (const analysis of audioAnalyses.values()) {
      if (analysis.media_id === item.id) analysis.words = words;
    }
    await saveAudioAnalyses();
    response.json({
      media_id: item.id,
      language: input.language,
      source: 'whisper_word_timestamps',
      transcript_match: requestedWords.length ? matched / requestedWords.length : 0,
      words
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/audio/search', (request, response, next) => {
  try {
    const input = validateSearchRequest(request.body);
    const analysis = audioAnalyses.get(input.analysisId);
    if (!analysis) return response.status(404).json({ error: 'Analysen finns inte.' });
    response.json({ analysis_id: analysis.id, matches: searchAnalysis(analysis, input) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/audio/process-range', async (request, response, next) => {
  let outputPath = null;
  try {
    const input = validateProcessRangeRequest(request.body);
    const { item, filePath } = requireAudioMedia(input.mediaId);
    if (input.end > item.duration) throw badRequest('Tidsintervallet ligger utanför mediefilen.');
    const id = crypto.randomUUID();
    outputPath = path.join(UPLOAD_DIR, `${id}.wav`);
    const filter = buildProcessFilter(input.operations);
    const processed = await withAudioTask(async () => {
      await runProcess('ffmpeg', [
        '-hide_banner', '-nostats', '-y',
        '-ss', String(input.start), '-i', filePath, '-t', String(input.end - input.start),
        '-vn', '-af', filter, '-c:a', 'pcm_s24le', outputPath
      ], { timeout: AUDIO_TASK_TIMEOUT_MS, killSignal: 'SIGKILL' });
      return registerProcessedAudio(item, outputPath, id, 'processed_range', {
        type: 'process_range',
        start: input.start,
        end: input.end,
        operations: input.operations
      });
    });
    response.status(201).json({
      media_id: processed.id,
      source_media_id: item.id,
      start: input.start,
      end: input.end,
      operations: input.operations,
      media: processed
    });
  } catch (error) {
    if (outputPath) await fsp.unlink(outputPath).catch(() => {});
    next(error);
  }
});

app.post('/api/audio/master', async (request, response, next) => {
  let outputPath = null;
  try {
    const input = validateMasterRequest(request.body);
    const { item, filePath } = requireAudioMedia(input.mediaId);
    if (input.analysisId) {
      const analysis = audioAnalyses.get(input.analysisId);
      if (!analysis) return response.status(404).json({ error: 'Analysen finns inte.' });
      if (analysis.media_id !== item.id) throw badRequest('Analysen tillhör en annan mediefil.');
    }
    const id = crypto.randomUUID();
    outputPath = path.join(UPLOAD_DIR, `${id}.wav`);
    const filter = buildMasterFilter(input.settings);
    const mastered = await withAudioTask(async () => {
      await runProcess('ffmpeg', [
        '-hide_banner', '-nostats', '-y', '-i', filePath, '-vn',
        '-af', filter, '-c:a', 'pcm_s24le', outputPath
      ], { timeout: AUDIO_TASK_TIMEOUT_MS, killSignal: 'SIGKILL' });
      return registerProcessedAudio(item, outputPath, id, 'mastered', {
        type: 'master',
        analysisId: input.analysisId,
        preset: input.preset,
        settings: input.settings
      });
    });
    response.status(201).json({
      media_id: mastered.id,
      source_media_id: item.id,
      analysis_id: input.analysisId,
      preset: input.preset,
      settings: input.settings,
      media: mastered
    });
  } catch (error) {
    if (outputPath) await fsp.unlink(outputPath).catch(() => {});
    next(error);
  }
});

app.post('/api/export', (request, response, next) => {
  try {
    const project = validateProject(request.body);
    const id = crypto.randomUUID();
    const job = { id, format: project.format, status: 'queued', progress: 0, createdAt: new Date().toISOString() };
    jobs.set(id, job);
    response.status(202).json(job);
    setImmediate(() => {
      renderProject(id, project).catch((error) => {
        Object.assign(job, { status: 'failed', error: error.message || 'Exporten kunde inte startas.' });
      });
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/jobs/:id', (request, response) => {
  const job = jobs.get(request.params.id);
  if (!job) return response.status(404).json({ error: 'Exportjobbet finns inte.' });
  response.json(job);
});

app.get('/api/jobs/:id/download', (request, response) => {
  const job = jobs.get(request.params.id);
  if (!job || job.status !== 'completed' || !job.outputPath) {
    return response.status(404).json({ error: 'Exportfilen är inte klar.' });
  }
  const prefix = job.format === 'mp4' ? 'video' : 'ljud';
  response.download(job.outputPath, `${prefix}-${job.id.slice(0, 8)}.${job.format}`);
});

app.post('/api/jobs/:id/cancel', (request, response) => {
  const job = jobs.get(request.params.id);
  if (!job) return response.status(404).json({ error: 'Exportjobbet finns inte.' });
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    return response.json({ status: job.status });
  }
  Object.assign(job, { aborted: true, status: 'cancelled', progress: job.progress || 0, message: 'Avbruten av användaren.' });
  const pid = job.encodePid;
  if (pid) {
    try { process.kill(pid, 'SIGKILL'); } catch (_error) { /* redan död */ }
  }
  const p = path.join(EXPORT_DIR, `${job.id}.${job.format || 'mp4'}`);
  fsp.unlink(p).catch(() => {});
  response.json({ status: 'cancelled' });
});

const AUTOSAVE_FILE = path.join(UPLOAD_DIR, '..', 'autosave.json');

app.post('/api/project/autosave', express.json({ limit: '50mb' }), (request, response) => {
  try {
    const data = JSON.stringify(request.body, null, 2);
    fs.writeFileSync(AUTOSAVE_FILE, data, 'utf8');
    response.json({ saved: true });
  } catch (error) {
    response.status(500).json({ error: 'Kunde inte spara autosave.' });
  }
});

app.get('/api/project/autoload', (_request, response) => {
  try {
    if (!fs.existsSync(AUTOSAVE_FILE)) return response.status(404).json({ error: 'Ingen autosave.' });
    const data = JSON.parse(fs.readFileSync(AUTOSAVE_FILE, 'utf8'));
    response.json(data);
  } catch {
    response.status(500).json({ error: 'Kunde inte läsa autosave.' });
  }
});

function finiteNumber(value, name, minimum = 0, maximum = MAX_DURATION) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw badRequest(`${name} har ett ogiltigt värde.`);
  }
  return number;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value) || 0));
}

function parseNoiseFloor(stderr) {
  const match = String(stderr || '').match(/mean_volume:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dB/i);
  if (!match || match[1].toLowerCase() === '-inf') return -80;
  return clamp(Number(match[1]), -80, -20);
}

function validateProject(body) {
  if (!body || !Array.isArray(body.clips) || body.clips.length === 0) throw badRequest('Tidslinjen är tom.');
  if (body.clips.length > MAX_CLIPS) throw badRequest(`Max ${MAX_CLIPS} klipp kan exporteras.`);
  const format = ['mp4', 'mp3', 'wav'].includes(body.format) ? body.format : 'mp4';
  const clips = body.clips.map((clip) => {
    const kind = ['video', 'audio', 'image', 'blur', 'text', 'color', 'html'].includes(clip.kind) ? clip.kind : 'video';
    const start = finiteNumber(clip.start, 'Starttid');
    const trackIndex = Math.floor(finiteNumber(clip.trackIndex ?? 0, 'Spårnummer', 0, MAX_CLIPS));
    if (kind === 'blur') {
      const trimStart = finiteNumber(clip.trimStart, 'Trimstart');
      const trimEnd = finiteNumber(clip.trimEnd, 'Trimslut');
      if (trimEnd - trimStart < 0.05) throw badRequest('Ett blur-klipp är för kort.');
      return { media: null, kind, start, trimStart, trimEnd, blur: validateBlur(clip.blur), trackIndex };
    }
    if (kind === 'text') {
      const trimStart = finiteNumber(clip.trimStart, 'Trimstart');
      const trimEnd = finiteNumber(clip.trimEnd, 'Trimslut');
      if (trimEnd - trimStart < 0.05) throw badRequest('Ett text-klipp är för kort.');
      return { media: null, kind, start, trimStart, trimEnd, trackIndex, text: validateText(clip.text) };
    }
    if (kind === 'color') {
      const trimStart = finiteNumber(clip.trimStart, 'Trimstart');
      const trimEnd = finiteNumber(clip.trimEnd, 'Trimslut');
      if (trimEnd - trimStart < 0.05) throw badRequest('Ett färgblock är för kort.');
      return { media: null, kind, start, trimStart, trimEnd, color: validateColorBlock(clip.color), trackIndex };
    }
    if (kind === 'html') {
      const trimStart = finiteNumber(clip.trimStart, 'Trimstart');
      const trimEnd = finiteNumber(clip.trimEnd, 'Trimslut');
      if (trimEnd - trimStart < 0.05) throw badRequest('Ett HTML-block är för kort.');
      return { media: null, kind, start, trimStart, trimEnd, html: validateHtml(clip.html), trackIndex };
    }
    const media = mediaLibrary.get(String(clip.mediaId || ''));
    if (!media) throw badRequest('Ett klipp hänvisar till en saknad mediefil.');
    if ((kind === 'video' || kind === 'image') && !media.hasVideo) throw badRequest(`${media.name} saknar bildström.`);
    if (kind === 'audio' && !media.hasAudio) throw badRequest(`${media.name} saknar ljud.`);
    const sourceLimit = kind === 'image' ? MAX_DURATION : media.duration;
    const trimStart = finiteNumber(clip.trimStart, 'Trimstart', 0, sourceLimit);
    const trimEnd = finiteNumber(clip.trimEnd, 'Trimslut', 0, sourceLimit + 0.05);
    if (trimEnd - trimStart < 0.05) throw badRequest('Ett klipp är för kort.');
    const crop = validateCrop(clip.crop, kind);
    const muted = clip.muted === true;
    const visualScale = (kind === 'video' || kind === 'image')
      ? finiteNumber(clip.visualScale ?? 1, 'Bildskala', 0.1, 4)
      : 1;
    const transitionIn = (kind === 'video' || kind === 'image')
      ? validateTransitionIn(clip.transitionIn, start, start + trimEnd - trimStart)
      : null;
    const animIn = (kind === 'video' || kind === 'image') ? validateClipAnimation(clip.animIn) : null;
    const posX = (kind === 'video' || kind === 'image') ? clamp(clip.posX ?? 0, -1, 1) : 0;
    const posY = (kind === 'video' || kind === 'image') ? clamp(clip.posY ?? 0, -1, 1) : 0;
    const circular = (kind === 'video' || kind === 'image') && clip.circular
      ? { size: clamp(Number(clip.circular.size) || 0.5, 0.1, 0.5) }
      : null;
    return { media, kind, start, trimStart, trimEnd, crop, muted, trackIndex, transitionIn, visualScale, animIn, posX, posY, circular };
  });
  const duration = Math.max(...clips.map((clip) => clip.start + clip.trimEnd - clip.trimStart));
  if (duration > MAX_DURATION) throw badRequest('Projektet är längre än fyra timmar.');
  const hiddenLayers = Array.isArray(body.hiddenLayers)
    ? [...new Set(body.hiddenLayers.map(Number).filter((value) => Number.isFinite(value) && value >= 0))]
    : [];
  const subtitles = Array.isArray(body.subtitles)
    ? body.subtitles
        .slice(0, 2000)
        .map((cue) => {
          const start = finiteNumber(cue.start, 'Undertext start', 0, MAX_DURATION);
          const end = finiteNumber(cue.end, 'Undertext slut', 0, MAX_DURATION + 0.05);
          const text = String(cue.text || '').slice(0, 500);
          return { start, end: Math.max(start + 0.05, end), text };
        })
        .filter((cue) => cue.text.trim().length > 0)
    : [];
  const visibleClips = clips.filter((clip) => clip.kind === 'audio' || !hiddenLayers.includes(clip.trackIndex));
  const visibleDuration = Math.max(0, ...visibleClips.map((clip) => clip.start + clip.trimEnd - clip.trimStart));
  const hardware = ['auto', 'nvidia', 'cpu'].includes(body.hardware) ? body.hardware : 'auto';
  const upscale = format === 'mp4' && body.upscale === true;
  const quality = format === 'mp4' ? Math.round(clamp(Number(body.quality) || 5, 1, 5)) : null;
  if (format !== 'mp4' && !visibleClips.some((clip) => clip.media?.hasAudio && !clip.muted)) {
    throw badRequest('Tidslinjen saknar hörbart ljud att exportera.');
  }
  const firstVisual = visibleClips.find((clip) => clip.kind === 'video' || clip.kind === 'image');
  const canvas = validateCanvas(body.canvas, firstVisual?.media.width, firstVisual?.media.height);
  return { clips: visibleClips, hiddenLayers, subtitles, currentDuration: duration, duration: Math.max(visibleDuration, 0.1), format, hardware, upscale, canvas, quality };
}

function validateBlur(rawBlur) {
  const raw = rawBlur && typeof rawBlur === 'object' ? rawBlur : {};
  const strength = finiteNumber(raw.strength ?? 20, 'Blur-styrka', 1, 40);
  if (Array.isArray(raw.boxes)) {
    if (raw.boxes.length === 0 || raw.boxes.length > MAX_BLUR_BOXES) {
      throw badRequest(`Ett blur-klipp måste ha mellan 1 och ${MAX_BLUR_BOXES} områden.`);
    }
    return {
      strength,
      boxes: raw.boxes.map((box, index) => validateBlurBox(box, strength, `Blur-område ${index + 1}`))
    };
  }
  return {
    strength,
    boxes: [validateBlurBox(raw, strength, 'Blur-område')]
  };
}

function validateBlurBox(rawBox, fallbackStrength, name) {
  const raw = rawBox && typeof rawBox === 'object' ? rawBox : {};
  let rawPoints = raw.points;
  if (!Array.isArray(rawPoints) || rawPoints.length !== 4) {
    const x = finiteNumber(raw.x ?? 0.25, 'Blur X-position', 0, 0.95);
    const y = finiteNumber(raw.y ?? 0.25, 'Blur Y-position', 0, 0.95);
    const width = finiteNumber(raw.width ?? 0.5, 'Blur-bredd', 0.05, 1);
    const height = finiteNumber(raw.height ?? 0.5, 'Blur-höjd', 0.05, 1);
    if (x + width > 1 || y + height > 1) throw badRequest('Blur-området måste ligga helt innanför bilden.');
    rawPoints = [
      { x, y }, { x: x + width, y },
      { x: x + width, y: y + height }, { x, y: y + height }
    ];
  }
  const points = rawPoints.map((point, index) => ({
    x: finiteNumber(point?.x, `${name}, punkt ${index + 1} X`, 0, 1),
    y: finiteNumber(point?.y, `${name}, punkt ${index + 1} Y`, 0, 1)
  }));
  if (!polygonIsValid(points)) throw badRequest('Blur-punkterna måste bilda en sammanhängande fyrhörning.');
  return {
    points,
    strength: finiteNumber(raw.strength ?? fallbackStrength, `${name}, styrka`, 1, 40)
  };
}

function validateText(rawText) {
  const text = typeof rawText?.text === 'string' ? rawText.text : String(rawText ?? '');
  const trimmed = text.replace(/\s+$/, '');
  if (!trimmed) throw badRequest('Text-klippet saknar text.');
  if (trimmed.length > 200) throw badRequest('Text-klippet får vara högst 200 tecken.');
  const fontSize = clamp(Number(rawText?.fontSize ?? 0.06), 0.01, 0.5);
  const color = /^#?[0-9a-fA-F]{6}$/.test(rawText?.color ?? '') ? normalizeHex(rawText.color) : '#FFFFFF';
  const background = rawText?.background === 'none'
    ? null
    : (rawText?.background && /^#?[0-9a-fA-F]{6}$/.test(rawText.background)
      ? normalizeHex(rawText.background)
      : '#000000');
  const x = clamp(Number(rawText?.x ?? 0.5), 0, 1);
  const y = clamp(Number(rawText?.y ?? 0.5), 0, 1);
  const variant = rawText?.variant === 'color-stripes' ? 'color-stripes' : 'standard';
  const scaleX = clamp(Number(rawText?.scaleX ?? 1), 0.1, 6);
  const presetId = typeof rawText?.presetId === 'string' ? rawText.presetId.slice(0, 40) : null;
  const wordCycle = rawText?.wordCycle === true;
  const cycleStyle = ['scale-sequence', 'word-zoom', 'line-reveal', 'letter-rise'].includes(rawText?.cycleStyle)
    ? rawText.cycleStyle
    : 'standard';
  const cycleSpeed = clamp(Number(rawText?.cycleSpeed ?? 5), 2, 15);
  const prefixText = typeof rawText?.prefixText === 'string' ? rawText.prefixText.slice(0, 50) : '';
  return {
    text: trimmed,
    presetId,
    variant,
    fontSize,
    color,
    background,
    x,
    y,
    scaleX,
    wordCycle,
    cycleStyle,
    cycleSpeed,
    prefixText,
    animIn: validateTextAnimation(rawText?.animIn),
    animOut: validateTextAnimation(rawText?.animOut)
  };
}

function validateTextAnimation(rawAnimation) {
  if (!rawAnimation || typeof rawAnimation !== 'object') return null;
  const allowed = new Set(['fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'scale', 'typewriter']);
  if (!allowed.has(rawAnimation.type)) return null;
  return {
    type: rawAnimation.type,
    duration: finiteNumber(rawAnimation.duration ?? 0.5, 'Textanimationens längd', 0.1, 4)
  };
}

function validateColorBlock(raw) {
  const color = raw?.color && /^#?[0-9a-fA-F]{6}$/.test(raw.color) ? normalizeHex(raw.color) : '#e50914';
  const x = clamp(Number(raw?.x ?? 0.5), 0, 1);
  const y = clamp(Number(raw?.y ?? 0.5), 0, 1);
  const width = clamp(Number(raw?.width ?? 0.5), 0.05, 1);
  const height = clamp(Number(raw?.height ?? 0.5), 0.05, 1);
  if (x + width / 2 > 1 || x - width / 2 < 0 || y + height / 2 > 1 || y - height / 2 < 0) {
    throw badRequest('Färgblocket måste ligga helt innanför bilden.');
  }
  return { color, x, y, width, height };
}

function validateHtml(raw) {
  const code = typeof raw?.code === 'string' ? raw.code.trim() : '';
  if (!code) throw badRequest('HTML-blocket saknar kod.');
  if (code.length > 200000) throw badRequest('HTML-koden är för lång (max 200 000 tecken).');
  const x = clamp(Number(raw?.x ?? 0.5), 0, 1);
  const y = clamp(Number(raw?.y ?? 0.5), 0, 1);
  const width = clamp(Number(raw?.width ?? 0.5), 0.05, 1);
  const height = clamp(Number(raw?.height ?? 0.5), 0.05, 1);
  if (x + width / 2 > 1 || x - width / 2 < 0 || y + height / 2 > 1 || y - height / 2 < 0) {
    throw badRequest('HTML-blocket måste ligga helt innanför bilden.');
  }
  return { code, x, y, width, height };
}

function normalizeHex(value) {
  const hex = value.startsWith('#') ? value.slice(1) : value;
  return `#${hex.toUpperCase()}`;
}

function polygonIsValid(points) {
  const crosses = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const after = points[(index + 2) % points.length];
    return (next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x);
  });
  const sameDirection = crosses.every((value) => value > 0.0005) || crosses.every((value) => value < -0.0005);
  const area = Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
  return sameDirection && area >= 0.005;
}

function polygonMaskExpression(points) {
  const crosses = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const dx = (next.x - point.x).toFixed(6);
    const dy = (next.y - point.y).toFixed(6);
    return `((${dx})*(Y/H-${point.y.toFixed(6)})-(${dy})*(X/W-${point.x.toFixed(6)}))`;
  });
  const positive = crosses.map((term) => `gte(${term},0)`).join('*');
  const negative = crosses.map((term) => `lte(${term},0)`).join('*');
  return `255*max(${positive},${negative})`;
}

function validateCrop(rawCrop, kind) {
  if (kind === 'audio') return { left: 0, right: 0, top: 0, bottom: 0 };
  const raw = rawCrop && typeof rawCrop === 'object' ? rawCrop : {};
  const crop = {
    left: finiteNumber(raw.left ?? 0, 'Beskärning vänster', 0, 0.95),
    right: finiteNumber(raw.right ?? 0, 'Beskärning höger', 0, 0.95),
    top: finiteNumber(raw.top ?? 0, 'Beskärning överkant', 0, 0.95),
    bottom: finiteNumber(raw.bottom ?? 0, 'Beskärning underkant', 0, 0.95)
  };
  if (crop.left + crop.right > 0.95 || crop.top + crop.bottom > 0.95) {
    throw badRequest('Beskärningen måste lämna minst fem procent av klippet kvar.');
  }
  return crop;
}

function validateTransitionIn(rawTransition, clipStart, clipEnd) {
  if (!rawTransition || typeof rawTransition !== 'object') return null;
  const allowedTypes = new Set(['dissolve', 'slide-left', 'slide-right', 'slide-up', 'slide-down']);
  if (!allowedTypes.has(rawTransition.type)) throw badRequest('Okänd övergångstyp.');
  const duration = finiteNumber(rawTransition.duration, 'Övergångens längd', 0.15, 2);
  const cut = finiteNumber(rawTransition.cut, 'Övergångens klippgräns', clipStart, clipEnd);
  if (Math.abs(cut - clipStart - duration) > 0.06) {
    throw badRequest('Övergångens tid stämmer inte med klippets start.');
  }
  return { type: rawTransition.type, duration, cut };
}

function validateClipAnimation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const allowed = new Set(['fade', 'scale', 'slide-up']);
  if (!allowed.has(raw.type)) return null;
  return { type: raw.type, duration: finiteNumber(raw.duration ?? 0.5, 'Animationens längd', 0.1, 3) };
}

function fitCanvas(sourceWidth, sourceHeight) {
  const width = Number(sourceWidth) || 1920;
  const height = Number(sourceHeight) || 1080;
  const scale = Math.min(1, 3840 / width, 3840 / height);
  return {
    width: Math.max(2, Math.floor(width * scale / 2) * 2),
    height: Math.max(2, Math.floor(height * scale / 2) * 2)
  };
}

function validateCanvas(rawCanvas, sourceWidth, sourceHeight) {
  if (!rawCanvas || typeof rawCanvas !== 'object') return fitCanvas(sourceWidth, sourceHeight);
  const width = Math.floor(finiteNumber(rawCanvas.width, 'Exportbredd', 64, 4096) / 2) * 2;
  const height = Math.floor(finiteNumber(rawCanvas.height, 'Exporthöjd', 64, 4096) / 2) * 2;
  return { width, height };
}

function textAnimationExpressions(text, start, end, fontSize) {
  const baseX = `${Number(text.x).toFixed(6)}*w-text_w/2`;
  const baseY = `${Number(text.y).toFixed(6)}*h-text_h/2`;
  const alphaFactors = ['1'];
  const scaleFactors = [Number(text.scaleX || 1).toFixed(6)];
  const xOffsets = [];
  const yOffsets = [];

  const progress = (from, duration) =>
    `min(1,max(0,(t-${from.toFixed(3)})/${Math.max(0.001, duration).toFixed(3)}))`;
  const addSlide = (animation, amount) => {
    if (!animation) return;
    if (animation.type === 'slide-left') xOffsets.push(`text_w*(${amount})`);
    if (animation.type === 'slide-right') xOffsets.push(`-text_w*(${amount})`);
    if (animation.type === 'slide-up') yOffsets.push(`text_h*(${amount})`);
    if (animation.type === 'slide-down') yOffsets.push(`-text_h*(${amount})`);
  };

  const clipDuration = end - start;
  if (text.animIn) {
    const inDur = Math.min(text.animIn.duration, clipDuration * 0.4);
    const inProgress = progress(start, inDur);
    if (text.animIn.type === 'fade') alphaFactors.push(inProgress);
    if (text.animIn.type === 'scale') scaleFactors.push(`max(0.01,${inProgress})`);
    addSlide(text.animIn, `1-${inProgress}`);
  }
  if (text.animOut) {
    const outDur = Math.min(text.animOut.duration, clipDuration * 0.3);
    const outStart = Math.max(start, end - outDur);
    const outProgress = progress(outStart, Math.min(outDur, clipDuration));
    if (text.animOut.type === 'fade') alphaFactors.push(`1-${outProgress}`);
    if (text.animOut.type === 'scale') scaleFactors.push(`max(0.01,1-${outProgress})`);
    addSlide(text.animOut, outProgress);
  }

  const x = xOffsets.length ? `${baseX}-${xOffsets.map((item) => `(${item})`).join('-')}` : baseX;
  const y = yOffsets.length ? `${baseY}-${yOffsets.map((item) => `(${item})`).join('-')}` : baseY;
  const alpha = alphaFactors.reduce((combined, factor) => `min(${combined},${factor})`);
  return {
    x,
    y,
    alpha: alphaFactors.length === 1 ? '1' : `max(0,${alpha})`,
    fontSize: `${fontSize}*(${scaleFactors.join('*')})`
  };
}

function buildSubtitleAss(cues, width, height) {
  const fontSize = Math.max(14, Math.round(height * 0.045));
  const outline = Math.max(1, Math.round(fontSize * 0.08));
  const marginV = Math.max(12, Math.round(height * 0.05));
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
    `Style: Default,DejaVu Sans,${fontSize},&H00FFFFFF,&H00FFFFFF,&H80000000,&H80000000,0,0,0,0,100,100,0,0,1,${outline},1,2,40,40,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text'
  ];
  const events = cues.map((cue) => {
    const safe = String(cue.text)
      .replace(/\{/g, '(')
      .replace(/\}/g, ')')
      .replace(/\r?\n/g, ' ');
    return `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${safe}`;
  });
  return [...header, ...events].join('\n');
}

function assColor(hex, alpha = '00') {
  const normalized = normalizeHex(hex).slice(1);
  return `&H${alpha}${normalized.slice(4, 6)}${normalized.slice(2, 4)}${normalized.slice(0, 2)}`;
}

function assTime(seconds) {
  const centiseconds = Math.max(0, Math.round(Number(seconds) * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const fraction = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`;
}

function escapeAssText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N');
}

function assBaseTags(text, width, height, positionTag = null) {
  const x = Math.round(text.x * width);
  const y = Math.round(text.y * height);
  const scale = Math.max(1, Math.round((text.scaleX || 1) * 100));
  return [
    '\\an5',
    positionTag || `\\pos(${x},${y})`,
    `\\fs${Math.max(2, Math.round(text.fontSize * height))}`,
    `\\fscx${scale}`,
    `\\fscy${scale}`
  ].join('');
}

function karaokeAssText(value, durationSeconds) {
  const characters = [...String(value)];
  if (characters.length === 0) return '';
  const duration = Math.max(1, Math.round((durationSeconds * 100) / characters.length));
  return characters.map((character) => {
    const escaped = character === '\n' ? '\\N' : escapeAssText(character);
    return `{\\kf${duration}}${escaped}`;
  }).join('');
}

function buildAssSubtitle(text, start, end, width, height) {
  const fontSize = Math.max(2, Math.round(text.fontSize * height));
  const background = text.background
    ? assColor(text.background)
    : '&HFF000000';
  const borderStyle = text.background ? 3 : 1;
  const outline = text.background ? Math.max(2, Math.round(fontSize * 0.15)) : 0;
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
    `Style: Default,DejaVu Sans,${fontSize},${assColor(text.color)},${assColor(text.color, 'FF')},${background},${background},0,0,0,0,100,100,0,0,${borderStyle},${outline},0,5,0,0,0,1`,
    '',
    '[Events]',
    'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text'
  ];
  const events = [];
  const addEvent = (eventStart, eventEnd, tags, content) => {
    if (eventEnd - eventStart < 0.01) return;
    events.push(
      `Dialogue: 0,${assTime(eventStart)},${assTime(eventEnd)},Default,,0,0,0,,{${tags}}${content}`
    );
  };
  const baseTags = assBaseTags(text, width, height);
  const clipDuration = end - start;

  if (text.animIn?.type === 'typewriter') {
    const revealDuration = Math.min(text.animIn.duration, clipDuration * 0.4);
    const fadeOut = text.animOut?.type === 'fade' ? Math.round(Math.min(text.animOut.duration, clipDuration * 0.3) * 1000) : 0;
    addEvent(
      start,
      end,
      `${baseTags}\\fad(0,${fadeOut})`,
      karaokeAssText(text.text, revealDuration)
    );
  } else {
    addEvent(start, end, baseTags, escapeAssText(text.text));
  }

  return `${header.concat(events).join('\n')}\n`;
}

const UPSCALE_DIR = path.join(ROOT, 'nvidia-upscaler-custom');
const UPSCALE_CANDIDATES = [
  path.join(UPSCALE_DIR, 'build', 'video-upscale'),
  path.join(UPSCALE_DIR, 'video-upscale')
];

function findUpscaler() {
  for (const candidate of UPSCALE_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    const which = require('child_process').execSync('command -v video-upscale', { shell: '/bin/sh' }).toString().trim();
    if (which) return which;
  } catch (_error) { /* inte på PATH */ }
  return null;
}

function runUpscale(job, inputPath, outputPath) {
  const pythonCandidates = [
    process.env.REALESRGAN_PYTHON,
    path.join(ROOT, '.venv', 'bin', 'python'),
    path.join(ROOT, '..', 'venv', 'bin', 'python')
  ].filter(Boolean);
  const python = pythonCandidates.find((candidate) => fs.existsSync(candidate));
  let command;
  let args;
  const realesrganModel = fs.existsSync(REALESRGAN_FAST_MODEL)
    ? REALESRGAN_FAST_MODEL
    : REALESRGAN_QUALITY_MODEL;
  if (python && fs.existsSync(REALESRGAN_SCRIPT) && fs.existsSync(realesrganModel)) {
    command = python;
    args = [
      REALESRGAN_SCRIPT, inputPath, outputPath,
      '--model', realesrganModel,
      '--tile', '512',
      '--encoder', 'h264_nvenc',
      '--require-cuda'
    ];
  } else {
    const bin = findUpscaler();
    if (!bin) {
      throw new Error('Ingen riktig AI-upscaler hittades. Installera Real-ESRGAN-miljön eller NVIDIA Maxine VFX SDK.');
    }
    command = bin;
    args = [
      inputPath, outputPath,
      '--engine', 'maxine-upscale',
      '--codec', 'h264',
      '--preset', 'p7',
      '--quality', '12'
    ];
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    job.encodePid = child.pid;
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-4000);
      for (const match of stdout.matchAll(/PROGRESS\s+(\d+)/g)) {
        job.progress = Math.min(99, Number(match[1]));
        updateEta(job);
      }
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-8000); });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`AI upscaling misslyckades (kod ${code}). ${stderr.slice(-1200)}`));
      else resolve();
    });
  });
}

function buildCircleMaskFilter(size) {
  const radius = `${clamp(Number(size) || 0.5, 0.1, 0.5).toFixed(4)}*min(W,H)`;
  const distance = `sqrt((X-W/2)*(X-W/2)+(Y-H/2)*(Y-H/2))`;
  return `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
    `a='if(lte(${distance},${radius}),alpha(X,Y),0)',`;
}

function buildCircleMaskGraph(clip, width, height, length) {
  const size = clamp(Number(clip.circular.size) || 0.5, 0.1, 0.5);
  const radius = `${size.toFixed(4)}*min(W,H)`;
  const distance = `sqrt((X-W/2)*(X-W/2)+(Y-H/2)*(Y-H/2))`;
  const sW = Math.max(1, Math.round(Number(clip.media?.width) || 1));
  const sH = Math.max(1, Math.round(Number(clip.media?.height) || 1));
  const crop = clip.crop || { left: 0, right: 0, top: 0, bottom: 0 };
  const cw = Math.max(2, Math.round(sW * (1 - crop.left - crop.right)));
  const ch = Math.max(2, Math.round(sH * (1 - crop.top - crop.bottom)));
  const frames = Math.ceil(Math.max(0, length) * 30) + 60;
  return {
    graph: `color=c=white:s=${cw}x${ch}:r=1:d=1,` +
      buildVisualContentFilter(clip, width, height) +
      `format=gray,geq=lum='if(lte(${distance},${radius}),255,0)',` +
      `loop=loop=${frames}:size=1:start=0,fps=30[mask${clip._renderIndex}];`,
    label: `[vcirc${clip._renderIndex}][mask${clip._renderIndex}]alphamerge,`
  };
}

function buildVisualContentFilter(clip, width, height) {
  const visualScale = Number.isFinite(clip.visualScale) ? clip.visualScale : 1;
  const scaleToCanvas = `scale=${width}:${height}:force_original_aspect_ratio=decrease,`;
  const zoomSteps = visualScale !== 1
    ? `scale=w='trunc(iw*${visualScale.toFixed(6)}/2)*2':` +
      `h='trunc(ih*${visualScale.toFixed(6)}/2)*2',`
    : '';
  return scaleToCanvas + zoomSteps;
}

function buildVisualFrameFilter(clip, width, height) {
  const posX = Number.isFinite(clip.posX) ? clamp(clip.posX, -1, 1) : 0;
  const posY = Number.isFinite(clip.posY) ? clamp(clip.posY, -1, 1) : 0;
  const visualScale = Number.isFinite(clip.visualScale) ? clip.visualScale : 1;
  if (Math.abs(posX) < 1e-9 && Math.abs(posY) < 1e-9) {
    const clipOversize = visualScale !== 1
      ? `crop=w='min(iw,${width})':h='min(ih,${height})',`
      : '';
    return `${clipOversize}pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black@0,`;
  }
  const margin = Math.max(width, height);
  const offX = (posX * width).toFixed(4);
  const offY = (posY * height).toFixed(4);
  return `pad=${width + margin * 2}:${height + margin * 2}:` +
    `(ow-iw)/2+${offX}:(oh-ih)/2+${offY}:black@0,` +
    `crop=${width}:${height}:${margin}:${margin},`;
}

function buildVisualSizeFilter(clip, width, height) {
  return buildVisualContentFilter(clip, width, height) + buildVisualFrameFilter(clip, width, height);
}

const WHISPER_VENV = path.join(ROOT, '..', 'whisper', '.venv');
const TRANSCRIBE_SCRIPT = path.join(ROOT, 'transcribe.py');
const ALLOWED_WHISPER_MODELS = new Set(['tiny', 'base', 'small', 'medium', 'large-v2', 'large-v3']);
const ALLOWED_WHISPER_LANGUAGES = new Set([
  'auto', 'sv', 'en', 'da', 'no', 'de', 'fr', 'es', 'it', 'nl', 'fi', 'pt', 'pl', 'ru', 'ja', 'zh', 'ko', 'ar'
]);

function whisperPython() {
  const candidate = path.join(WHISPER_VENV, 'bin', 'python');
  return fs.existsSync(candidate) ? candidate : 'python3';
}

function whisperEnv() {
  const cublasDir = path.join(WHISPER_VENV, 'lib', 'python3.11', 'site-packages', 'nvidia', 'cublas', 'lib');
  const extra = fs.existsSync(cublasDir) ? cublasDir : '';
  const current = process.env.LD_LIBRARY_PATH || '';
  return { ...process.env, LD_LIBRARY_PATH: extra ? `${extra}:${current}` : current };
}

async function runTranscriptionJob(jobId, item, model, language) {
  const job = transcribeJobs.get(jobId);
  job.status = 'transcribing';
  job.message = 'Extraherar ljud och laddar modell…';
  const inputPath = path.join(UPLOAD_DIR, item.storedName);
  const outputJson = path.join(EXPORT_DIR, `${jobId}-transcription.json`);
  const args = [TRANSCRIBE_SCRIPT, inputPath, outputJson, model];
  if (language) args.push(language);

  await new Promise((resolve, reject) => {
    const child = spawn(whisperPython(), args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: whisperEnv()
    });
    job.pid = child.pid;
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr = (stderr + text).slice(-8000);
      for (const line of text.split('\n')) {
        const match = line.match(/^PROGRESS (\d+)$/);
        if (match) {
          job.progress = Number(match[1]);
          job.message = `Transkriberar… ${match[1]} %`;
        } else if (line.includes('Laddar modell')) {
          job.message = 'Laddar Whisper-modell…';
        } else if (line.includes('Extraherar ljud')) {
          job.message = 'Extraherar ljud…';
        } else if (line.includes('Transkriberar')) {
          job.message = 'Transkriberar…';
        }
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (job.status === 'cancelled') return resolve();
      if (code !== 0) return reject(new Error(`Transkriberingen misslyckades (kod ${code}). ${stderr.slice(-1500)}`));
      resolve();
    });
  });

  if (job.status === 'cancelled') {
    await fsp.unlink(outputJson).catch(() => {});
    return;
  }

  let segments;
  try {
    segments = JSON.parse(await fsp.readFile(outputJson, 'utf8'));
  } catch (error) {
    throw new Error('Kunde inte läsa transkriberingsresultatet.');
  } finally {
    await fsp.unlink(outputJson).catch(() => {});
  }
  if (!Array.isArray(segments)) throw new Error('Transkriberingen gav inget giltigt resultat.');

  item.transcription = { model, language, segments, createdAt: new Date().toISOString() };
  mediaLibrary.set(item.id, item);
  await saveLibrary();
  Object.assign(job, { status: 'completed', progress: 100, message: 'Transkribering klar.', segments });
}

function trackFfmpegProgress(child, job, duration, outputPath) {
  let stderr = '';
  let progressBuffer = '';
  let spawnError = null;
  child.stdout.on('data', (chunk) => {
    progressBuffer += chunk.toString();
    const lines = progressBuffer.split('\n');
    progressBuffer = lines.pop();
    for (const line of lines) {
      const match = line.match(/^out_time_ms=(\d+)$/);
      if (match) {
        job.progress = Math.min(99, Math.round((Number(match[1]) / 1_000_000 / duration) * 100));
        updateEta(job);
      }
    }
  });
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-8000); });
  child.on('error', (error) => {
    spawnError = error;
    Object.assign(job, { status: 'failed', error: error.message });
  });
  return new Promise((resolve) => {
    child.on('close', (code) => {
      if (job.aborted || spawnError) return resolve(false);
      if (code !== 0) {
        Object.assign(job, { status: 'failed', error: `FFmpeg misslyckades (kod ${code}). ${stderr.slice(-1200)}` });
        return resolve(false);
      }
      Object.assign(job, { status: 'completed', progress: 100, outputPath });
      resolve(true);
    });
  });
}

async function renderAudioProject(jobId, project) {
  const job = jobs.get(jobId);
  const outputPath = path.join(EXPORT_DIR, `${jobId}.${project.format}`);
  const args = ['-hide_banner', '-y'];
  const audibleClips = project.clips.filter((clip) => clip.media?.hasAudio && !clip.muted);
  audibleClips.forEach((clip, inputIndex) => {
    clip.inputIndex = inputIndex;
    args.push('-i', path.join(UPLOAD_DIR, clip.media.storedName));
  });

  const filters = [];
  const audios = [];
  audibleClips.forEach((clip, index) => {
    const delay = Math.round(clip.start * 1000);
    filters.push(
      `[${clip.inputIndex}:a]atrim=start=${clip.trimStart.toFixed(3)}:end=${clip.trimEnd.toFixed(3)},` +
      `asetpts=PTS-STARTPTS,adelay=${delay}:all=1[a${index}]`
    );
    audios.push(`a${index}`);
  });
  const finishAudio = `apad,atrim=duration=${project.duration.toFixed(3)},` +
    'aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo[aout]';
  if (audios.length === 1) {
    filters.push(`[${audios[0]}]${finishAudio}`);
  } else {
    filters.push(
      `${audios.map((label) => `[${label}]`).join('')}amix=inputs=${audios.length}:duration=longest:` +
      `normalize=0,${finishAudio}`
    );
  }

  args.push('-filter_complex', filters.join(';'), '-map', '[aout]', '-vn');
  if (project.format === 'mp3') {
    args.push('-c:a', 'libmp3lame', '-b:a', '192k', '-id3v2_version', '3');
    job.encoder = 'MP3 (libmp3lame, 192 kbit/s)';
  } else {
    args.push('-c:a', 'pcm_s16le');
    job.encoder = 'WAV (PCM, 16-bit)';
  }
  args.push(
    '-t', project.duration.toFixed(3), '-progress', 'pipe:1', '-nostats', outputPath
  );

  Object.assign(job, {
    status: 'rendering',
    phase: 'encode',
    phaseStartedAt: new Date().toISOString()
  });
  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  job.encodePid = child.pid;
  await trackFfmpegProgress(child, job, project.duration, outputPath);
}

async function convertSvgToPng(svgPath, outputDir) {
  const pngName = path.basename(svgPath).replace(/\.svg$/i, '.png');
  const pngPath = path.join(outputDir, pngName);
  await runProcess('python3', ['-m', 'cairosvg', svgPath, '-o', pngPath]);
  return pngPath;
}

const MAX_HTML_CODE = 200000;

function loadPuppeteer() {
  try {
    return require('puppeteer');
  } catch (_error) {
    throw new Error('puppeteer saknas. Installera det med: npm install puppeteer');
  }
}

function wrapHtmlDocument(code) {
  if (/<html[\s>]/i.test(code) || /<!doctype/i.test(code)) return code;
  return `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `html,body{margin:0;padding:0;width:100%;height:100%;box-sizing:border-box;overflow:hidden;background:transparent}` +
    `</style></head><body>${code}</body></html>`;
}

async function renderHtmlBlockFrames(html, blockWidth, blockHeight, duration, fps, outputDir) {
  const puppeteer = loadPuppeteer();
  const totalFrames = Math.max(1, Math.round(duration * fps));
  await fsp.mkdir(outputDir, { recursive: true });
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: blockWidth, height: blockHeight, deviceScaleFactor: 1 });
    await page.setContent(wrapHtmlDocument(html.code), { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    const startTime = Date.now();
    for (let frame = 1; frame <= totalFrames; frame += 1) {
      const target = startTime + (frame / fps) * 1000;
      const wait = target - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      await page.screenshot({
        path: path.join(outputDir, `frame-${String(frame).padStart(4, '0')}.png`),
        type: 'png',
        omitBackground: true
      });
    }
  } finally {
    await browser.close();
  }
  return totalFrames;
}

async function renderHtmlClipToMedia({ code, width, height, duration, fps, background, name }) {
  const framesDir = path.join(EXPORT_DIR, `htmlclip-${crypto.randomUUID()}`);
  const outputName = `${crypto.randomUUID()}.mp4`;
  const outputPath = path.join(UPLOAD_DIR, outputName);
  try {
    await renderHtmlBlockFrames({ code }, width, height, duration, fps, framesDir);
    const args = [
      '-hide_banner', '-y', '-framerate', String(fps), '-start_number', '1',
      '-i', path.join(framesDir, 'frame-%04d.png'),
      '-filter_complex',
      `color=c=${background.replace('#', '0x')}:s=${width}x${height}:r=${fps}[bg];` +
      `[bg][0:v]overlay=0:0:shortest=1,format=yuv420p[v]`,
      '-map', '[v]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-level', '41',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', duration.toFixed(3),
      '-progress', 'pipe:1', '-nostats', outputPath
    ];
    await runProcess('ffmpeg', args);
    const metadata = await probeMedia(outputPath, '.mp4');
    const item = {
      id: crypto.randomUUID(),
      name,
      storedName: outputName,
      size: (await fsp.stat(outputPath)).size,
      createdAt: new Date().toISOString(),
      ...metadata
    };
    mediaLibrary.set(item.id, item);
    await saveLibrary();
    return item;
  } finally {
    await fsp.rm(framesDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function renderProject(jobId, project) {
  if (project.format !== 'mp4') {
    await renderAudioProject(jobId, project);
    return;
  }
  const job = jobs.get(jobId);
  job.status = 'rendering';
  const useNvenc = project.hardware === 'cpu' ? false : await hasWorkingNvenc();
  if (project.hardware === 'nvidia' && !useNvenc) {
    Object.assign(job, { status: 'failed', error: 'NVENC är inte tillgängligt. Kontrollera NVIDIA-drivrutin och FFmpeg.' });
    return;
  }

  const outputPath = path.join(EXPORT_DIR, `${jobId}.mp4`);
  const args = ['-hide_banner', '-y'];
  let inputIndex = 0;
  const svgClips = project.clips.filter((clip) => clip.media?.storedName?.toLowerCase().endsWith('.svg'));
  const tempPngs = [];
  await Promise.all(svgClips.map(async (clip) => {
    const svgPath = path.join(UPLOAD_DIR, clip.media.storedName);
    const pngPath = await convertSvgToPng(svgPath, EXPORT_DIR);
    clip._svgPngPath = pngPath;
    tempPngs.push(pngPath);
  }));
  const { width, height } = project.canvas;
  const htmlClips = project.clips.filter((clip) => clip.kind === 'html');
  let htmlIndex = 0;
  for (const clip of htmlClips) {
    const html = clip.html;
    const blockWidth = Math.max(2, Math.round(html.width * width));
    const blockHeight = Math.max(2, Math.round(html.height * height));
    const length = clip.trimEnd - clip.trimStart;
    const framesDir = path.join(EXPORT_DIR, `html-${jobId}-${htmlIndex}`);
    tempPngs.push(framesDir);
    job.phase = 'html-render';
    job.phaseStartedAt = new Date().toISOString();
    await renderHtmlBlockFrames(html, blockWidth, blockHeight, length, 30, framesDir);
    clip._htmlFramesDir = framesDir;
    clip._htmlBlockWidth = blockWidth;
    clip._htmlBlockHeight = blockHeight;
    htmlIndex += 1;
  }
  if (htmlClips.length > 0) {
    job.phase = 'encode';
    job.phaseStartedAt = new Date().toISOString();
  }
  project.clips.forEach((clip) => {
    if (clip.kind === 'blur' || clip.kind === 'text' || clip.kind === 'color' || clip.kind === 'html') return;
    clip.inputIndex = inputIndex;
    inputIndex += 1;
    if (clip.kind === 'image') args.push('-loop', '1', '-framerate', '30');
    const inputPath = clip._svgPngPath || path.join(UPLOAD_DIR, clip.media.storedName);
    args.push('-i', inputPath);
  });
  for (const clip of project.clips) {
    if (clip.kind !== 'html') continue;
    clip.inputIndex = inputIndex;
    inputIndex += 1;
    args.push('-framerate', '30', '-start_number', '1', '-i', path.join(clip._htmlFramesDir, 'frame-%04d.png'));
  }
  const filters = [`color=c=black:s=${width}x${height}:r=30:d=${project.duration.toFixed(3)}[base]`];
  const videos = [];
  const audios = [];

  project.clips.forEach((clip, index) => {
    const length = clip.trimEnd - clip.trimStart;
    if (clip.kind === 'video' || clip.kind === 'image') {
      const trim = clip.kind === 'image'
        ? `trim=duration=${length.toFixed(3)}`
        : `trim=start=${clip.trimStart.toFixed(3)}:end=${clip.trimEnd.toFixed(3)}`;
      const cropWidth = 1 - clip.crop.left - clip.crop.right;
      const cropHeight = 1 - clip.crop.top - clip.crop.bottom;
      const cropFilter = cropWidth < 1 || cropHeight < 1
        ? `crop=iw*${cropWidth.toFixed(6)}:ih*${cropHeight.toFixed(6)}:` +
          `iw*${clip.crop.left.toFixed(6)}:ih*${clip.crop.top.toFixed(6)},`
        : '';
      const circleFilter = clip.circular
        ? (() => {
            clip._renderIndex = index;
            const mask = buildCircleMaskGraph(clip, width, height, length);
            return `format=rgba[vcirc${index}];${mask.graph}${mask.label}`;
          })()
        : '';
      const contentFilter = buildVisualContentFilter(clip, width, height);
      const frameFilter = buildVisualFrameFilter(clip, width, height);
      let animPost = '';
      if (clip.animIn?.type === 'fade') {
        animPost = `format=rgba,fade=t=in:st=${clip.start.toFixed(3)}:` +
          `d=${clip.animIn.duration.toFixed(3)}:alpha=1,`;
      } else if (clip.animIn?.type === 'scale') {
        const totalFrames = Math.ceil(length * 30);
        const animFrames = Math.ceil(clip.animIn.duration * 30);
        animPost = `zoompan=z='min(1,0.01+0.99*on/${animFrames})':` +
          `d=${totalFrames}:s=${width}x${height}:fps=30,format=rgba,` +
          `setpts=PTS-STARTPTS+${clip.start.toFixed(3)}/TB,`;
      }
      const baseLabel = clip.transitionIn?.type === 'dissolve' ? `vbase${index}` : `v${index}`;
      filters.push(
        `[${clip.inputIndex}:v]${trim},` +
        (clip.kind === 'image' ? 'format=rgba,' : '') +
        cropFilter +
        `setpts=PTS-STARTPTS+${clip.start.toFixed(3)}/TB,` +
        contentFilter +
        circleFilter +
        frameFilter +
        animPost +
        `setsar=1` +
        `[${baseLabel}]`
      );
      if (clip.transitionIn?.type === 'dissolve') {
        filters.push(
          `[${baseLabel}]format=rgba,fade=t=in:st=${clip.start.toFixed(3)}:` +
          `d=${clip.transitionIn.duration.toFixed(3)}:alpha=1[v${index}]`
        );
      }
      videos.push({
        label: `v${index}`,
        start: clip.start,
        end: clip.start + length,
        trackIndex: clip.trackIndex || 0,
        transitionIn: clip.transitionIn,
        animIn: clip.animIn
      });
    }
    if (clip.kind === 'color') {
      const c = clip.color;
      const blockLabel = `colorblock${index}`;
      const pw = Math.round(c.width * width);
      const ph = Math.round(c.height * height);
      const px = Math.max(0, Math.round(c.x * width - pw / 2));
      const py = Math.max(0, Math.round(c.y * height - ph / 2));
      filters.push(
        `color=c=${c.color.replace('#', '0x')}:s=${width}x${height}:r=30:d=${project.duration.toFixed(3)}` +
        `[colorfull${index}];` +
        `[colorfull${index}]crop=w=${pw}:h=${ph}:x=${px}:y=${py}` +
        `[${blockLabel}]`
      );
      videos.push({
        label: blockLabel,
        start: clip.start,
        end: clip.start + length,
        trackIndex: clip.trackIndex || 0,
        transitionIn: null,
        overlayX: px,
        overlayY: py
      });
    }
    if (clip.kind === 'html') {
      const html = clip.html;
      const blockLabel = `htmlblock${index}`;
      const pw = clip._htmlBlockWidth;
      const ph = clip._htmlBlockHeight;
      const px = Math.max(0, Math.round(html.x * width - pw / 2));
      const py = Math.max(0, Math.round(html.y * height - ph / 2));
      filters.push(
        `[${clip.inputIndex}:v]setpts=PTS-STARTPTS+${clip.start.toFixed(3)}/TB,` +
        `format=rgba,scale=${pw}:${ph},setsar=1[${blockLabel}]`
      );
      videos.push({
        label: blockLabel,
        start: clip.start,
        end: clip.start + length,
        trackIndex: clip.trackIndex || 0,
        transitionIn: null,
        overlayX: px,
        overlayY: py
      });
    }
    if (clip.media?.hasAudio && !clip.muted) {
      const delay = Math.round(clip.start * 1000);
      filters.push(
        `[${clip.inputIndex}:a]atrim=start=${clip.trimStart.toFixed(3)}:end=${clip.trimEnd.toFixed(3)},` +
        `asetpts=PTS-STARTPTS,adelay=${delay}:all=1[a${index}]`
      );
      audios.push(`a${index}`);
    }
  });

  let videoLabel = 'base';
  videos.sort((a, b) => a.trackIndex - b.trackIndex).forEach((video, index) => {
    const next = `overlay${index}`;
    const transition = video.transitionIn;
    const progress = transition
      ? `(t-${video.start.toFixed(3)})/${transition.duration.toFixed(3)}`
      : null;
    let x = video.overlayX != null ? String(video.overlayX) : '0';
    let y = video.overlayY != null ? String(video.overlayY) : '0';
    if (transition?.type === 'slide-left') x = `if(lt(t,${transition.cut.toFixed(3)}),W-W*${progress},0)`;
    if (transition?.type === 'slide-right') x = `if(lt(t,${transition.cut.toFixed(3)}),-W+W*${progress},0)`;
    if (transition?.type === 'slide-up') y = `if(lt(t,${transition.cut.toFixed(3)}),H-H*${progress},0)`;
    if (transition?.type === 'slide-down') y = `if(lt(t,${transition.cut.toFixed(3)}),-H+H*${progress},0)`;
    if (!transition && video.animIn?.type === 'slide-up') {
      y = `H-H*min(1,max(0,(t-${video.start.toFixed(3)})/${video.animIn.duration.toFixed(3)}))`;
    }
    filters.push(
      `[${videoLabel}][${video.label}]overlay=x='${x}':y='${y}':eval=frame:eof_action=pass:shortest=0:` +
      `enable='between(t,${video.start.toFixed(3)},${video.end.toFixed(3)})'[${next}]`
    );
    videoLabel = next;
  });

  const blurs = project.clips.filter((clip) => clip.kind === 'blur');
  let blurIndex = 0;
  blurs.forEach((clip) => {
    const start = clip.start;
    const end = start + clip.trimEnd - clip.trimStart;
    clip.blur.boxes.forEach((blur) => {
      const index = blurIndex;
      filters.push(`[${videoLabel}]split=2[blurbase${index}][blursource${index}]`);
      filters.push(
        `[blursource${index}]gblur=sigma=${blur.strength.toFixed(2)}:steps=2[blurred${index}]`
      );
      filters.push(
        `color=c=black:s=${width}x${height}:r=30:d=${project.duration.toFixed(3)},format=gray,` +
        `geq=lum='${polygonMaskExpression(blur.points)}'[blurmask${index}]`
      );
      filters.push(
        `[blurred${index}][blurmask${index}]alphamerge[blurredalpha${index}]`
      );
      const next = `blurresult${index}`;
      filters.push(
        `[blurbase${index}][blurredalpha${index}]overlay=x=0:y=0:eof_action=pass:shortest=0:` +
        `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'[${next}]`
      );
      videoLabel = next;
      blurIndex += 1;
    });
  });

  const texts = project.clips
    .filter((clip) => clip.kind === 'text')
    .sort((a, b) => (a.trackIndex || 0) - (b.trackIndex || 0));
  const temporaryTextFiles = [];
  let textIndex = 0;
  for (const clip of texts) {
    const text = clip.text;
    const start = clip.start;
    const end = start + clip.trimEnd - clip.trimStart;
    const fontSize = Math.max(2, Math.round(text.fontSize * height));
    const expressions = textAnimationExpressions(text, start, end, fontSize);
    const safeColor = text.color.replace(/^#/, '0x');
    const boxOpts = text.background
      ? `box=1:boxcolor=${text.background.replace(/^#/, '0x')}@1.0:boxborderw=${Math.max(2, Math.round(fontSize * 0.15))}`
      : 'box=0';
    if (text.animIn?.type === 'typewriter') {
      const assFile = path.join(EXPORT_DIR, `${jobId}-text-${textIndex}.ass`);
      temporaryTextFiles.push(assFile);
      await fsp.writeFile(assFile, buildAssSubtitle(text, start, end, width, height), 'utf8');
      const escapedAssFile = assFile.replace(/'/g, "'\\''");
      const next = `textresult${textIndex}`;
      filters.push(`[${videoLabel}]ass=filename='${escapedAssFile}'[${next}]`);
      videoLabel = next;
      textIndex += 1;
      continue;
    }

    const textFile = path.join(EXPORT_DIR, `${jobId}-text-${textIndex}.txt`);
    temporaryTextFiles.push(textFile);
    await fsp.writeFile(textFile, text.text, 'utf8');
    const escapedTextFile = textFile.replace(/'/g, "'\\''");
    const next = `textresult${textIndex}`;
    filters.push(
      `[${videoLabel}]drawtext=font='DejaVu Sans':fontsize='${expressions.fontSize}':` +
      `fontcolor=${safeColor}:alpha='${expressions.alpha}':${boxOpts}:` +
      `textfile='${escapedTextFile}':` +
      `x='${expressions.x}':y='${expressions.y}':` +
      `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'[${next}]`
    );
    videoLabel = next;
    textIndex += 1;
  }

  if (project.subtitles && project.subtitles.length > 0) {
    const subtitleFile = path.join(EXPORT_DIR, `${jobId}-subtitles.ass`);
    temporaryTextFiles.push(subtitleFile);
    await fsp.writeFile(subtitleFile, buildSubtitleAss(project.subtitles, width, height), 'utf8');
    const escapedSubtitleFile = subtitleFile.replace(/'/g, "'\\''");
    const subtitleLabel = 'subtitleResult';
    filters.push(`[${videoLabel}]ass=filename='${escapedSubtitleFile}'[${subtitleLabel}]`);
    videoLabel = subtitleLabel;
  }

  filters.push(`[${videoLabel}]null[vout]`);

  if (audios.length === 0) {
    filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${project.duration.toFixed(3)}[aout]`);
  } else if (audios.length === 1) {
    filters.push(`[${audios[0]}]apad,atrim=duration=${project.duration.toFixed(3)}[aout]`);
  } else {
    filters.push(
      `${audios.map((label) => `[${label}]`).join('')}amix=inputs=${audios.length}:duration=longest:` +
      `normalize=0,apad,atrim=duration=${project.duration.toFixed(3)}[aout]`
    );
  }

  const CRF_MAP = [null, 28, 24, 20, 15, 0];
  const CQ_MAP = [null, 34, 27, 20, 13, 1];
  const q = project.upscale ? 5 : (project.quality != null ? project.quality : 5);
  const crf = CRF_MAP[q] ?? 20;
  const cq = CQ_MAP[q] ?? 20;
  const lossless = crf === 0;
  const qualityLabel = lossless ? 'lossless' : (['', 'låg', '', 'standard', '', ''][q] || `nivå ${q}`);

  args.push('-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]');
  if (useNvenc) {
    args.push('-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', String(cq), '-profile:v', 'high');
  } else {
    args.push('-c:v', 'libx264', '-preset', 'medium');
    if (lossless) {
      args.push('-x264-params', 'lossless=1');
    } else {
      args.push('-crf', String(crf));
    }
    args.push('-profile:v', 'high', '-level', '41');
  }
  args.push(
    '-c:a', 'aac', '-b:a', '192k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-t', project.duration.toFixed(3), '-progress', 'pipe:1', '-nostats', outputPath
  );
  const hwLabel = useNvenc ? 'NVIDIA NVENC' : 'CPU (libx264)';
  const encoderLabel = lossless ? `${hwLabel} · lossless` : `${hwLabel} · ${qualityLabel} (CRF ${crf})`;
  job.encoder = encoderLabel;
  job.phase = 'encode';
  job.phaseStartedAt = new Date().toISOString();
  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  job.encodePid = child.pid;
  let stderr = '';
  let progressBuffer = '';
  child.stdout.on('data', (chunk) => {
    progressBuffer += chunk.toString();
    const lines = progressBuffer.split('\n');
    progressBuffer = lines.pop();
    for (const line of lines) {
      const match = line.match(/^out_time_ms=(\d+)$/);
      if (match) {
        job.progress = Math.min(99, Math.round((Number(match[1]) / 1_000_000 / project.duration) * 100));
        updateEta(job);
      }
    }
  });
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-8000); });
  child.on('error', (error) => Object.assign(job, { status: 'failed', error: error.message }));
  child.on('close', (code) => {
    if (job.aborted) return;
    if (code !== 0) {
      Object.assign(job, { status: 'failed', error: `FFmpeg misslyckades (kod ${code}). ${stderr.slice(-1200)}` });
      cleanupTextFiles();
      return;
    }
    cleanupTextFiles();
    if (!project.upscale) {
      Object.assign(job, { status: 'completed', progress: 100, outputPath });
      return;
    }
    runUpscaleStep(jobId, project, outputPath);
  });

  async function runUpscaleStep(jobId, project, renderedPath) {
    const job = jobs.get(jobId);
    const upscaledPath = path.join(EXPORT_DIR, `${jobId}-upscaled.mp4`);
    Object.assign(job, {
      status: 'upscaling',
      phase: 'upscale',
      phaseStartedAt: new Date().toISOString(),
      progress: 0,
      encoder: 'Snabb AI super-resolution 2× (Real-ESRGAN/Maxine)'
    });
    try {
      await runUpscale(job, renderedPath, upscaledPath);
      if (job.aborted) return;
      await fsp.unlink(renderedPath).catch(() => {});
      Object.assign(job, { status: 'completed', progress: 100, outputPath: upscaledPath });
    } catch (error) {
      if (job.aborted) return;
      Object.assign(job, { status: 'failed', error: error.message });
    }
  }

  function cleanupTextFiles() {
    for (const file of temporaryTextFiles) fsp.unlink(file).catch(() => {});
    for (const file of tempPngs) fsp.rm(file, { recursive: true, force: true }).catch(() => {});
  }
}

const noCache = { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } };
app.get('/', (_request, response) => response.sendFile(path.join(ROOT, 'index.html'), noCache));
app.get('/styles.css', (_request, response) => response.sendFile(path.join(ROOT, 'styles.css'), noCache));
app.get('/timeline-model.js', (_request, response) => response.sendFile(path.join(ROOT, 'timeline-model.js'), noCache));
app.get('/app.js', (_request, response) => response.sendFile(path.join(ROOT, 'app.js'), noCache));
app.get('/chain.svg', (_request, response) => response.type('image/svg+xml').sendFile(path.join(ROOT, 'chain.svg'), noCache));
app.get('/favicon.ico', (_request, response) => response.status(204).end());

app.use((error, _request, response, _next) => {
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : (error instanceof multer.MulterError ? 400 : 500);
  if (status >= 500) console.error(error);
  response.status(status).json({ error: error.message || 'Ett oväntat serverfel uppstod.' });
});

async function startServer() {
  await refreshLegacyVideoMetadata()
    .catch((error) => console.warn('Kunde inte migrera äldre videometadata:', error.message));
  const listen = (port, host, message) => new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      console.log(message);
      resolve(server);
    });
    server.once('error', reject);
  });
  const editorServer = await listen(PORT, '0.0.0.0', `Videoeditorn kör på http://localhost:${PORT}`);
  return editorServer;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      console.log(`Fick ${signal}, stoppar server…`);
      process.exit(0);
    });
  }
}

module.exports = {
  app,
  startServer,
  validateProject,
  validateCanvas,
  validateTransitionIn,
  validateBlur,
  validateText,
  parseNoiseFloor,
  textAnimationExpressions,
  buildAssSubtitle,
  renderProject,
  renderHtmlBlockFrames,
  renderHtmlClipToMedia,
  waveformPeaksFromPcm,
  buildVisualSizeFilter,
  buildVisualContentFilter,
  buildVisualFrameFilter,
  buildCircleMaskFilter,
  buildCircleMaskGraph,
  buildSubtitleAss,
  jobs
};
