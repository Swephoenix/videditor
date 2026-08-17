'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const { buildScaleAnimationFilter } = require('../server');

const scaleFilter = buildScaleAnimationFilter({
  animIn: { type: 'scale', duration: 0.5 }
}, 25);

const graph = `[0:v]format=rgba,${scaleFilter}[scaled];` +
  'color=black@0:s=160x90:r=25:d=1,format=rgba[base];' +
  '[base][scaled]overlay=x=(W-w)/2:y=(H-h)/2:eval=frame:shortest=1[out]';

const frameHashes = execFileSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error',
  '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=25:duration=1',
  '-filter_complex', graph, '-map', '[out]',
  '-t', '1', '-an', '-f', 'framemd5', '-'
], { encoding: 'utf8' })
  .split('\n')
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split(',').at(-1).trim());

assert.strictEqual(frameHashes.length, 25, 'Skalningsanimationen ska behålla klippets bildfrekvens.');
assert(
  new Set(frameHashes).size > 20,
  'Skalningsanimationen får inte hålla samma källbild genom hela klippet.'
);

const scaleSignal = execFileSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error',
  '-f', 'lavfi', '-i', 'color=white:size=160x90:rate=25:duration=1',
  '-filter_complex', `${graph};[out]signalstats,metadata=print:file=-[measured]`, '-map', '[measured]',
  '-t', '1', '-an', '-f', 'null', '-'
], { encoding: 'utf8' });
const brightness = [...scaleSignal.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)]
  .map((match) => Number(match[1]));
assert.strictEqual(brightness.length, 25, 'Skalningstestet ska mäta varje exporterad bildruta.');
assert(
  brightness[0] < brightness[12] * 0.1,
  'Skalningsanimationen ska växa från en liten centrerad bild till full storlek.'
);

console.log('SCALE ANIMATION EXPORT OK');
