'use strict';

const assert = require('assert');
const {
  estimateExportStorageBytes,
  ffmpegFailureMessage
} = require('../server');

const longLosslessProject = {
  format: 'mp4',
  quality: 5,
  upscale: false,
  duration: 1178.96,
  canvas: { width: 1280, height: 720 }
};

const required = estimateExportStorageBytes(longLosslessProject);
assert(
  required > 1_517_408_256,
  `Lång lossless-export uppskattades till för lite utrymme: ${required} byte.`
);
assert(
  required < 15 * 1024 ** 3,
  `Lossless-exporten överskattas orimligt mycket: ${required} byte.`
);

const upscaledRequired = estimateExportStorageBytes({ ...longLosslessProject, upscale: true });
assert(
  upscaledRequired > required,
  'Uppskalad export måste reservera mer arbetsutrymme än vanlig export.'
);

const diskFull = ffmpegFailureMessage(228, 'Error writing trailer: No space left on device');
assert.match(diskFull, /disken blev full/i);
assert.doesNotMatch(diskFull, /Error writing trailer/);

const ordinaryFailure = ffmpegFailureMessage(1, 'vanligt ffmpeg-fel');
assert.match(ordinaryFailure, /FFmpeg misslyckades \(kod 1\)/);
assert.match(ordinaryFailure, /vanligt ffmpeg-fel/);

console.log('EXPORT STORAGE OK');
