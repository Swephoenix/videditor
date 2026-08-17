'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const {
  TaskQueue,
  AUDIO_MIX_LIMITER,
  appendNvencVideoArgs,
  cancellableDelay,
  renderHtmlBlockFrames
} = require('../server');

function frameDigest(args) {
  return execFileSync('ffmpeg', [...args, '-an', '-f', 'framemd5', '-'], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(',').at(-1).trim())
    .join('\n');
}

(async () => {
  const losslessArgs = [];
  const lossless = appendNvencVideoArgs(losslessArgs, 5);
  assert.strictEqual(lossless.lossless, true);
  assert.deepStrictEqual(losslessArgs, [
    '-c:v', 'h264_nvenc', '-preset', 'p7', '-tune', 'lossless',
    '-rc', 'constqp', '-qp', '0', '-profile:v', 'high'
  ]);

  const lossyArgs = [];
  const lossy = appendNvencVideoArgs(lossyArgs, 4);
  assert.strictEqual(lossy.lossless, false);
  assert.deepStrictEqual(lossyArgs, [
    '-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '13', '-profile:v', 'high'
  ]);

  const outputPath = path.join('/tmp', `nvenc-lossless-${crypto.randomUUID()}.mp4`);
  try {
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=25:duration=0.4',
      ...losslessArgs, '-pix_fmt', 'yuv420p', outputPath
    ]);
    const sourceFrames = frameDigest([
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=25:duration=0.4'
    ]);
    const decodedFrames = frameDigest(['-hide_banner', '-loglevel', 'error', '-i', outputPath]);
    assert.strictEqual(decodedFrames, sourceFrames, 'Lossless-exporten ändrade avkodade YUV-bildrutor.');
  } finally {
    fs.rmSync(outputPath, { force: true });
  }

  const audio = spawnSync('ffmpeg', [
    '-hide_banner',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2',
    '-filter_complex',
    `[0:a]volume=8[a0];[1:a]volume=8[a1];` +
      `[a0][a1]amix=inputs=2:normalize=0,${AUDIO_MIX_LIMITER},astats=metadata=1:reset=0`,
    '-f', 'null', '-'
  ], { encoding: 'utf8' });
  assert.strictEqual(audio.status, 0, audio.stderr);
  const peaks = [...audio.stderr.matchAll(/Peak level dB:\s*(-?[\d.]+)/g)].map((match) => Number(match[1]));
  assert(peaks.length > 0, 'Ljudtestet gav ingen peak-mätning.');
  assert(Math.max(...peaks) <= -0.44, `Limitern släppte igenom för hög peak: ${Math.max(...peaks)} dB.`);

  const queue = new TaskQueue(1);
  let active = 0;
  let maxActive = 0;
  const order = [];
  const tasks = [1, 2, 3].map((id) => queue.enqueue(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    order.push(`start-${id}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    order.push(`end-${id}`);
    active -= 1;
  }));
  await Promise.all(tasks);
  assert.strictEqual(maxActive, 1, 'Exportkön körde fler än ett jobb samtidigt.');
  assert.deepStrictEqual(order, [
    'start-1', 'end-1', 'start-2', 'end-2', 'start-3', 'end-3'
  ]);

  let aborted = false;
  setTimeout(() => { aborted = true; }, 10);
  await assert.rejects(
    cancellableDelay(500, () => aborted),
    (error) => error.code === 'EXPORT_CANCELLED'
  );

  const htmlFrames = fs.mkdtempSync(path.join('/tmp', 'html-cancel-'));
  const htmlStarted = Date.now();
  try {
    await assert.rejects(
      renderHtmlBlockFrames(
        { code: '<div style="width:100%;height:100%;background:white"></div>' },
        160,
        90,
        5,
        25,
        htmlFrames,
        () => Date.now() - htmlStarted > 250
      ),
      (error) => error.code === 'EXPORT_CANCELLED'
    );
    assert(Date.now() - htmlStarted < 3000, 'HTML-renderingen reagerade för långsamt på avbrytning.');
  } finally {
    fs.rmSync(htmlFrames, { recursive: true, force: true });
  }

  console.log('EXPORT SAFETY OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
