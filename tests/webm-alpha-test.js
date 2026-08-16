'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { appendMediaInputArgs, buildVisualSizeFilter, probeMedia } = require('../server');

const fixtureDirectory = fs.mkdtempSync('/tmp/videditor-webm-alpha-');
const alphaFixture = path.join(fixtureDirectory, 'alpha.webm');
const opaqueFixture = path.join(fixtureDirectory, 'opaque.webm');
const durationlessFixture = path.join(fixtureDirectory, 'durationless.webm');

function makeVp9Fixture(outputPath, transparent) {
  const source = transparent
    ? 'color=c=black@0.0:s=64x64:d=0.2:r=10,format=rgba,' +
      'drawbox=x=16:y=16:w=32:h=32:color=red@1:t=fill:replace=1,format=yuva420p'
    : 'color=c=red:s=64x64:d=0.2:r=10,format=yuv420p';
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', source,
    '-c:v', 'libvpx-vp9', '-auto-alt-ref', '0', outputPath
  ]);
}

function makeDurationlessWebm(outputPath) {
  const buffer = execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=s=64x64:r=25:d=0.4',
    '-c:v', 'libvpx', '-f', 'webm', 'pipe:1'
  ]);
  fs.writeFileSync(outputPath, buffer);
}

function decodePixel(inputArgs, x, y) {
  const visualFilter = buildVisualSizeFilter({ visualScale: 1, posX: 0, posY: 0 }, 64, 64);
  return execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', ...inputArgs,
    '-f', 'lavfi', '-i', 'color=c=green:s=64x64:d=0.2:r=10',
    '-filter_complex', `[0:v]${visualFilter}setsar=1[fg];[1:v][fg]overlay,format=rgb24,crop=1:1:${x}:${y}`,
    '-frames:v', '1', '-f', 'rawvideo', '-'
  ]);
}

(async () => {
  makeVp9Fixture(alphaFixture, true);
  makeVp9Fixture(opaqueFixture, false);
  makeDurationlessWebm(durationlessFixture);

  const durationlessMetadata = await probeMedia(durationlessFixture, '.webm');
  assert.strictEqual(durationlessMetadata.videoCodec, 'vp8');
  assert(
    durationlessMetadata.duration >= 0.36 && durationlessMetadata.duration <= 0.44,
    `WebM utan duration-metadata ska få paketbaserad längd, fick ${durationlessMetadata.duration}.`
  );

  const alphaMetadata = await probeMedia(alphaFixture, '.webm');
  assert.strictEqual(alphaMetadata.videoCodec, 'vp9');
  assert.strictEqual(alphaMetadata.hasAlpha, true, 'VP9-WebM:s alpha_mode-tagg ska identifieras.');

  const alphaArgs = [];
  appendMediaInputArgs(alphaArgs, {
    kind: 'video', trimStart: 0, trimEnd: 0.2,
    media: alphaMetadata
  }, alphaFixture);
  assert.deepStrictEqual(alphaArgs.slice(0, 2), ['-c:v', 'libvpx-vp9']);
  assert(alphaArgs.indexOf('libvpx-vp9') < alphaArgs.indexOf('-i'), 'Decodern måste anges före WebM-inputen.');

  const corner = decodePixel(alphaArgs, 0, 0);
  const center = decodePixel(alphaArgs, 32, 32);
  assert(corner[1] > corner[0] * 1.5, 'Det transparenta hörnet ska visa den gröna bakgrunden.');
  assert(center[0] > center[1] * 1.5, 'Den röda animationen ska vara synlig över bakgrunden.');

  const opaqueMetadata = await probeMedia(opaqueFixture, '.webm');
  assert.strictEqual(opaqueMetadata.hasAlpha, false);
  const opaqueArgs = [];
  appendMediaInputArgs(opaqueArgs, {
    kind: 'video', trimStart: 0, trimEnd: 0.2,
    media: opaqueMetadata
  }, opaqueFixture);
  assert(!opaqueArgs.includes('libvpx-vp9'), 'Ogenomskinlig VP9 ska behålla FFmpegs automatiska decoder-val.');

  const vp8AlphaArgs = [];
  appendMediaInputArgs(vp8AlphaArgs, {
    kind: 'video', trimStart: 0, trimEnd: 0.2,
    media: { videoCodec: 'vp8', hasAlpha: true }
  }, '/tmp/alpha-vp8.webm');
  assert.deepStrictEqual(vp8AlphaArgs.slice(0, 2), ['-c:v', 'libvpx']);

  console.log('WEBM ALPHA OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(() => {
  fs.rmSync(fixtureDirectory, { recursive: true, force: true });
});
