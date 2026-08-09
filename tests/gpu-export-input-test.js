'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appendMediaInputArgs, cudaDecoderForMedia } = require('../server');

const args = [];
const clip = {
  kind: 'video', trimStart: 1822.287, trimEnd: 2676.001,
  media: { videoCodec: 'h264' }
};
appendMediaInputArgs(args, clip, '/tmp/source.mp4', true);

assert.strictEqual(cudaDecoderForMedia({ videoCodec: 'h264' }), 'h264_cuvid');
assert.deepStrictEqual(args, [
  '-c:v', 'h264_cuvid',
  '-ss', '1822.287',
  '-t', '853.714',
  '-i', '/tmp/source.mp4'
]);

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');
const indexSource = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
assert.match(appSource, /hardware: normalizedFormat === 'mp4' \? 'nvidia' : 'cpu'/);
assert.match(indexSource, /id="use-nvidia"[^>]*checked disabled/);
assert.match(appSource, /CUDA\/NVDEC söker direkt till klippens startpunkter/);

assert.throws(
  () => appendMediaInputArgs([], { ...clip, media: { videoCodec: 'theora' } }, '/tmp/source.ogv', true),
  /CUDA\/NVDEC saknar stöd/
);

console.log('GPU EXPORT INPUT OK');
