'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'upscale_realesrgan.py');
const MODEL = path.join(ROOT, 'models', 'realesr-general-x4v3.pth');
const PYTHON_CANDIDATES = [
  process.env.REALESRGAN_PYTHON,
  path.join(ROOT, '.venv', 'bin', 'python'),
  path.join(ROOT, '..', 'venv', 'bin', 'python')
].filter(Boolean);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const python = PYTHON_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  assert(python, 'Ingen Python-miljö för Real-ESRGAN hittades.');
  assert(fs.existsSync(MODEL), 'realesr-general-x4v3.pth saknas.');
  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), 'videditor-ai-upscale-'));
  const input = path.join(temporaryDirectory, 'input.mp4');
  const output = path.join(temporaryDirectory, 'output.mp4');
  try {
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=32x24:rate=1:duration=1',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', input
    ]);
    const modelCheck = execFileSync(python, [
      SCRIPT, '--model', MODEL, '--check-model', '--tile', '32'
    ], { encoding: 'utf8' });
    assert(modelCheck.includes('architecture=RealEsrganCompactX4'), 'Den kompakta modellarkitekturen laddades inte.');
    execFileSync(python, [
      SCRIPT, input, output, '--model', MODEL, '--tile', '32', '--encoder', 'libx264'
    ], { stdio: 'inherit' });
    const probe = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error', '-show_streams', '-of', 'json', output
    ], { encoding: 'utf8' }));
    const video = probe.streams.find((stream) => stream.codec_type === 'video');
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
    assert(video?.width === 64 && video?.height === 48, 'AI-motorn skapade inte exakt 2× upplösning.');
    assert(audio, 'AI-motorn tappade ljudströmmen.');
    console.log('AI UPSCALE OK');
  } finally {
    await fsp.rm(temporaryDirectory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
