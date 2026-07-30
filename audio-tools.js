'use strict';

const MAX_AUDIO_DURATION = 4 * 60 * 60;
const MAX_TRANSCRIPT_LENGTH = 1_000_000;
const MAX_OPERATIONS = 20;
const DETECTORS = new Set([
  'speech', 'silence', 'noise', 'background_noise', 'music',
  'laughter', 'cough', 'clipping', 'loudness'
]);
const IMPLEMENTED_DETECTORS = new Set(['speech', 'silence', 'clipping', 'loudness']);
const AUDIO_OPERATIONS = new Set([
  'noise_reduction', 'voice_enhancement', 'declick', 'declip', 'deesser',
  'remove_hum', 'remove_reverb', 'normalize', 'compress', 'equalize'
]);
const LANGUAGES = new Set([
  'auto', 'sv', 'en', 'da', 'no', 'de', 'fr', 'es', 'it',
  'nl', 'fi', 'pt', 'pl', 'ru', 'ja', 'zh', 'ko', 'ar'
]);

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function object(value, field = 'request') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest(`${field} måste vara ett objekt.`);
  return value;
}

function rejectUnknown(value, allowed, field = 'request') {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw badRequest(`Okända fält i ${field}: ${unknown.join(', ')}.`);
}

function mediaId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw badRequest('Ett giltigt media_id krävs; godtyckliga audio_path tillåts inte.');
  }
  return value;
}

function finiteNumber(value, field, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw badRequest(`${field} måste vara ett tal mellan ${minimum} och ${maximum}.`);
  }
  return number;
}

function validateAnalyzeRequest(raw) {
  const body = object(raw);
  if (Object.hasOwn(body, 'audio_path')) {
    throw badRequest('Använd media_id i stället för audio_path; godtyckliga filsökvägar tillåts inte.');
  }
  rejectUnknown(body, new Set(['media_id', 'window_ms', 'detect']));
  const detect = body.detect === undefined ? [...IMPLEMENTED_DETECTORS] : body.detect;
  if (!Array.isArray(detect) || detect.length < 1 || detect.length > DETECTORS.size) {
    throw badRequest('detect måste innehålla 1–9 detektorer.');
  }
  const normalizedDetect = [...new Set(detect.map((item) => String(item)))];
  const unknown = normalizedDetect.find((item) => !DETECTORS.has(item));
  if (unknown) throw badRequest(`Okänd detektor: ${unknown}.`);
  return {
    mediaId: mediaId(body.media_id),
    windowMs: finiteNumber(body.window_ms ?? 20, 'window_ms', 10, 1000),
    detect: normalizedDetect
  };
}

function validateAlignRequest(raw) {
  const body = object(raw);
  rejectUnknown(body, new Set(['media_id', 'transcript', 'language']));
  if (typeof body.transcript !== 'string' || !body.transcript.trim() || body.transcript.length > MAX_TRANSCRIPT_LENGTH) {
    throw badRequest(`transcript måste vara 1–${MAX_TRANSCRIPT_LENGTH} tecken.`);
  }
  const language = String(body.language || 'auto').toLowerCase();
  if (!LANGUAGES.has(language)) throw badRequest('Språket stöds inte.');
  return { mediaId: mediaId(body.media_id), transcript: body.transcript.trim(), language };
}

function validateSearchRequest(raw) {
  const body = object(raw);
  rejectUnknown(body, new Set(['analysis_id', 'query']));
  const analysisId = typeof body.analysis_id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(body.analysis_id)
    ? body.analysis_id
    : null;
  if (!analysisId) throw badRequest('Ett giltigt analysis_id krävs.');
  const query = object(body.query, 'query');
  rejectUnknown(query, new Set(['words', 'sounds', 'minimum_confidence']), 'query');
  const words = query.words === undefined ? [] : query.words;
  const sounds = query.sounds === undefined ? [] : query.sounds;
  if (!Array.isArray(words) || words.length > 100 || words.some((word) => typeof word !== 'string' || !word.trim() || word.length > 100)) {
    throw badRequest('query.words måste vara högst 100 korta sökord.');
  }
  if (!Array.isArray(sounds) || sounds.length > 100 || sounds.some((sound) => typeof sound !== 'string' || !DETECTORS.has(sound))) {
    throw badRequest('query.sounds innehåller en okänd ljudtyp.');
  }
  if (!words.length && !sounds.length) throw badRequest('Minst ett ord eller ljudmönster krävs.');
  return {
    analysisId,
    words: [...new Set(words.map((word) => word.trim()))],
    sounds: [...new Set(sounds)],
    minimumConfidence: finiteNumber(query.minimum_confidence ?? 0, 'minimum_confidence', 0, 1)
  };
}

function validateOperations(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_OPERATIONS) {
    throw badRequest(`operations måste innehålla 1–${MAX_OPERATIONS} operationer.`);
  }
  return raw.map((entry, index) => {
    const operation = object(entry, `operations[${index}]`);
    rejectUnknown(operation, new Set(['type', 'strength']), `operations[${index}]`);
    if (!AUDIO_OPERATIONS.has(operation.type)) throw badRequest(`Okänd ljudoperation: ${operation.type}.`);
    return {
      type: operation.type,
      strength: finiteNumber(operation.strength ?? 0.5, `operations[${index}].strength`, 0, 1)
    };
  });
}

function validateProcessRangeRequest(raw) {
  const body = object(raw);
  rejectUnknown(body, new Set(['media_id', 'start', 'end', 'operations']));
  const start = finiteNumber(body.start, 'start', 0, MAX_AUDIO_DURATION);
  const end = finiteNumber(body.end, 'end', 0, MAX_AUDIO_DURATION);
  if (end <= start) throw badRequest('Ogiltigt tidsintervall: end måste vara större än start.');
  return { mediaId: mediaId(body.media_id), start, end, operations: validateOperations(body.operations) };
}

function validateMasterRequest(raw) {
  const body = object(raw);
  rejectUnknown(body, new Set(['media_id', 'analysis_id', 'preset', 'settings']));
  const preset = body.preset || 'spoken_podcast';
  if (preset !== 'spoken_podcast') throw badRequest('Endast preset spoken_podcast stöds.');
  const settings = object(body.settings || {}, 'settings');
  rejectUnknown(settings, new Set([
    'reduce_background_noise', 'enhance_voices', 'remove_clicks',
    'repair_clipping', 'target_lufs', 'true_peak_limit_db'
  ]), 'settings');
  const boolean = (field, fallback) => {
    if (settings[field] === undefined) return fallback;
    if (typeof settings[field] !== 'boolean') throw badRequest(`${field} måste vara true eller false.`);
    return settings[field];
  };
  return {
    mediaId: mediaId(body.media_id),
    analysisId: body.analysis_id === undefined ? null : validateSearchRequest({
      analysis_id: body.analysis_id,
      query: { sounds: ['loudness'] }
    }).analysisId,
    preset,
    settings: {
      reduceBackgroundNoise: boolean('reduce_background_noise', true),
      enhanceVoices: boolean('enhance_voices', true),
      removeClicks: boolean('remove_clicks', true),
      repairClipping: boolean('repair_clipping', true),
      targetLufs: finiteNumber(settings.target_lufs ?? -16, 'target_lufs', -36, -8),
      truePeakLimitDb: finiteNumber(settings.true_peak_limit_db ?? -1, 'true_peak_limit_db', -6, -0.1)
    }
  };
}

function parseSilenceEvents(log, duration) {
  const events = [];
  let openStart = null;
  for (const line of String(log || '').split(/\r?\n/)) {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
    if (startMatch) openStart = Number(startMatch[1]);
    const endMatch = line.match(/silence_end:\s*([0-9.]+)/);
    if (endMatch && openStart !== null) {
      const end = Number(endMatch[1]);
      events.push({ start: openStart, end, type: 'silence', confidence: 0.98 });
      openStart = null;
    }
  }
  if (openStart !== null && Number.isFinite(duration) && duration > openStart) {
    events.push({ start: openStart, end: duration, type: 'silence', confidence: 0.98 });
  }
  return events;
}

function parseLoudnormSummary(log) {
  const matches = String(log || '').match(/\{\s*"input_i"[\s\S]*?\}/g);
  if (!matches?.length) throw new Error('FFmpeg returnerade ingen loudness-sammanfattning.');
  const summary = JSON.parse(matches.at(-1));
  const value = (field) => {
    const number = Number(summary[field]);
    return Number.isFinite(number) ? number : null;
  };
  return {
    integratedLufs: value('input_i'),
    truePeakDb: value('input_tp'),
    loudnessRangeLu: value('input_lra'),
    thresholdLufs: value('input_thresh')
  };
}

function buildProcessFilter(operations) {
  const filters = [];
  for (const operation of operations) {
    const strength = operation.strength;
    if (operation.type === 'noise_reduction') filters.push(`afftdn=nf=-45:nr=${(5 + strength * 25).toFixed(1)}:nt=w`);
    if (operation.type === 'voice_enhancement') {
      filters.push('highpass=f=75', 'lowpass=f=14000', `equalizer=f=3000:t=q:w=1:g=${(strength * 4).toFixed(1)}`);
    }
    if (operation.type === 'declick') filters.push(`adeclick=t=${(1 + strength * 3).toFixed(2)}`);
    if (operation.type === 'declip') filters.push(`alimiter=limit=${(0.98 - strength * 0.08).toFixed(2)}`);
    if (operation.type === 'deesser') filters.push(`deesser=i=${(0.1 + strength * 0.8).toFixed(2)}`);
    if (operation.type === 'remove_hum') filters.push('highpass=f=80');
    if (operation.type === 'remove_reverb') filters.push(`afftdn=nf=-50:nr=${(3 + strength * 12).toFixed(1)}:nt=w`);
    if (operation.type === 'normalize') filters.push('loudnorm=I=-16:TP=-1:LRA=11');
    if (operation.type === 'compress') filters.push(`acompressor=threshold=-18dB:ratio=${(2 + strength * 4).toFixed(1)}:attack=20:release=250`);
    if (operation.type === 'equalize') filters.push(`equalizer=f=3000:t=q:w=1:g=${(-2 + strength * 6).toFixed(1)}`);
  }
  return filters.join(',');
}

function buildMasterFilter(settings) {
  const filters = ['highpass=f=70'];
  if (settings.reduceBackgroundNoise) filters.push('afftdn=nf=-45:nr=12:nt=w');
  if (settings.enhanceVoices) filters.push('equalizer=f=3000:t=q:w=1:g=2.5');
  if (settings.removeClicks) filters.push('adeclick=t=2');
  if (settings.repairClipping) filters.push('alimiter=limit=0.95');
  filters.push(`loudnorm=I=${settings.targetLufs}:TP=${settings.truePeakLimitDb}:LRA=11`);
  return filters.join(',');
}

function normalizeToken(value) {
  return String(value || '').trim().toLocaleLowerCase('sv');
}

function searchAnalysis(analysis, query) {
  const wantedWords = new Set(query.words.map(normalizeToken));
  const wantedSounds = new Set(query.sounds);
  const matches = [];
  for (const word of analysis.words || []) {
    const confidence = Number(word.confidence ?? 1);
    if (wantedWords.has(normalizeToken(word.word)) && confidence >= query.minimumConfidence) {
      matches.push({ start: word.start, end: word.end, type: 'word', value: word.word, confidence });
    }
  }
  for (const event of analysis.events || []) {
    const confidence = Number(event.confidence ?? 1);
    if (wantedSounds.has(event.type) && confidence >= query.minimumConfidence) matches.push({ ...event });
  }
  return matches.sort((left, right) => left.start - right.start || left.end - right.end);
}

function speechEventsFromSilence(silences, duration) {
  const events = [];
  let cursor = 0;
  for (const silence of silences) {
    if (silence.start > cursor) events.push({ start: cursor, end: silence.start, type: 'speech', confidence: 0.65 });
    cursor = Math.max(cursor, silence.end);
  }
  if (cursor < duration) events.push({ start: cursor, end: duration, type: 'speech', confidence: 0.65 });
  return events.filter((event) => event.end - event.start >= 0.05);
}

module.exports = {
  DETECTORS,
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
};
