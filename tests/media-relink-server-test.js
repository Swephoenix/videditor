'use strict';

const assert = require('assert');
const {
  mediaItemAvailability,
  relinkMediaItem
} = require('../server');

(async () => {
  const original = {
    id: 'media-1',
    name: 'gammal.mp4',
    sourcePath: '/media/gammal.mp4',
    storedName: 'gammal.mp4',
    size: 100,
    kind: 'video',
    duration: 12,
    hasVideo: true,
    hasAudio: true
  };

  assert.strictEqual(mediaItemAvailability(original, () => false), false);
  assert.strictEqual(mediaItemAvailability(original, (candidate) => candidate === '/media/gammal.mp4'), true);

  const dependencies = {
    realpath: async () => '/media/flyttad.mp4',
    stat: async () => ({ isFile: () => true, size: 120 }),
    probe: async () => ({
      kind: 'video', duration: 14, hasVideo: true, hasAudio: true,
      width: 1920, height: 1080, rotation: 0, videoCodec: 'h264', audioCodec: 'aac'
    })
  };
  const relinked = await relinkMediaItem(original, '/ny/flyttad.mp4', { requiredDuration: 10 }, dependencies);
  assert.strictEqual(relinked.id, original.id, 'Omlänkning måste behålla media-ID.');
  assert.strictEqual(relinked.sourcePath, '/media/flyttad.mp4');
  assert.strictEqual(relinked.name, 'flyttad.mp4');
  assert.strictEqual(relinked.duration, 14);
  assert.strictEqual(original.sourcePath, '/media/gammal.mp4', 'Originalposten muterades före lyckad omlänkning.');

  await assert.rejects(
    () => relinkMediaItem(original, '/ny/fel.wav', {}, {
      ...dependencies,
      realpath: async () => '/media/fel.wav',
      probe: async () => ({ kind: 'audio', duration: 14, hasVideo: false, hasAudio: true })
    }),
    /samma mediatyp/i,
    'En ljudfil accepterades som ersättning för video.'
  );
  await assert.rejects(
    () => relinkMediaItem(original, '/ny/kort.mp4', { requiredDuration: 10 }, {
      ...dependencies,
      probe: async () => ({ kind: 'video', duration: 4, hasVideo: true, hasAudio: true })
    }),
    /för kort/i,
    'En ersättningsfil som inte täcker klippens trimning accepterades.'
  );

  console.log('MEDIA RELINK SERVER OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
