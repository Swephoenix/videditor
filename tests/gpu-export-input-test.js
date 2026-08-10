'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appendMediaInputArgs } = require('../server');

const args = [];
const clip = {
  kind: 'video', trimStart: 1822.287, trimEnd: 2676.001,
  media: { videoCodec: 'h264' }
};
appendMediaInputArgs(args, clip, '/tmp/source.mp4');

assert.deepStrictEqual(args, [
  '-ss', '1822.287',
  '-t', '853.714',
  '-i', '/tmp/source.mp4'
]);

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const serverSource = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
assert.match(appSource, /hardware: normalizedFormat === 'mp4' \? 'nvidia' : 'cpu'/);
assert.match(indexSource, /id="use-nvidia"[^>]*checked disabled/);
assert.match(appSource, /FFmpeg söker direkt till klippens startpunkter/);
assert.doesNotMatch(serverSource, /_cuvid/, 'Exporten får inte tvinga CUVID-avkodare som ändrar bildruteordningen.');

const codecIndependentArgs = [];
appendMediaInputArgs(codecIndependentArgs, { ...clip, media: { videoCodec: 'theora' } }, '/tmp/source.ogv');
assert.deepStrictEqual(
  codecIndependentArgs,
  [...args.slice(0, -1), '/tmp/source.ogv'],
  'FFmpeg ska själv välja en stabil avkodare för källans codec.'
);

console.log('GPU EXPORT INPUT OK');
