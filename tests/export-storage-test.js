'use strict';

const assert = require('assert');
const {
  estimateExportStorageBytes,
  ensureExportStorage,
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

assert.throws(
  () => ensureExportStorage(longLosslessProject, 1_517_408_256, 0),
  (error) => error.status === 507 && /ledigt/i.test(error.message) && /behöver/i.test(error.message),
  'Exporten stoppades inte begripligt innan en full disk.'
);

assert.doesNotThrow(
  () => ensureExportStorage(longLosslessProject, required + 1024, 0),
  'Exporten blockerades trots tillräckligt ledigt utrymme.'
);

assert.throws(
  () => ensureExportStorage(longLosslessProject, required * 2, required + 2048),
  (error) => error.status === 507,
  'Reserverat utrymme för ett annat exportjobb räknades inte av.'
);

const diskFull = ffmpegFailureMessage(228, 'Error writing trailer: No space left on device');
assert.match(diskFull, /disken blev full/i);
assert.doesNotMatch(diskFull, /Error writing trailer/);

const ordinaryFailure = ffmpegFailureMessage(1, 'vanligt ffmpeg-fel');
assert.match(ordinaryFailure, /FFmpeg misslyckades \(kod 1\)/);
assert.match(ordinaryFailure, /vanligt ffmpeg-fel/);

console.log('EXPORT STORAGE OK');
