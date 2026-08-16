'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  BoundedLruCache,
  chooseThumbnailStrategy,
  filesHaveSameContent,
  mediaMetadataNeedsRefresh,
  resampleWaveformPeaks,
  waveformSampleRate
} = require('../server');

async function main() {
  assert.strictEqual(waveformSampleRate(3600, 2000), 32,
    'En timslång vågform ska inte avkodas till miljontals PCM-sampel.');
  assert.strictEqual(waveformSampleRate(1, 2000), 2000,
    'Korta intervall ska behålla hög detaljnivå.');
  assert(waveformSampleRate(3600, 2000) * 3600 <= 2000 * 64,
    'Vågformsbufferten ska vara proportionell mot ritbredden.');
  assert.deepStrictEqual(resampleWaveformPeaks([0.1, 0.8, 0.2, 0.6], 2), [0.8, 0.6],
    'Zoomad vågform ska kunna återanvända cachedata utan ny avkodning.');

  assert.strictEqual(chooseThumbnailStrategy(20, 8), 'single-input');
  assert.strictEqual(chooseThumbnailStrategy(600, 8), 'multi-seek');

  const cache = new BoundedLruCache({ maxEntries: 2, maxBytes: 5 });
  cache.set('a', Buffer.from('aa'));
  cache.set('b', Buffer.from('bb'));
  cache.get('a');
  cache.set('c', Buffer.from('cc'));
  assert(cache.has('a') && cache.has('c') && !cache.has('b'), 'LRU-ordningen ska styra eviktion.');
  cache.set('large', Buffer.from('123456'));
  assert(!cache.has('large') && cache.totalBytes <= 5, 'För stora cacheposter ska inte sparas.');

  assert.strictEqual(mediaMetadataNeedsRefresh({ kind: 'video', metadataVersion: 2, frameRate: null }), false,
    'En redan migrerad WebM utan bildfrekvens ska inte probas vid varje start.');
  assert.strictEqual(mediaMetadataNeedsRefresh({ kind: 'video', frameRate: null }), true);
  assert.strictEqual(mediaMetadataNeedsRefresh({ kind: 'audio' }), false);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'videditor-dedup-'));
  try {
    const first = path.join(directory, 'first.bin');
    const same = path.join(directory, 'same.bin');
    const different = path.join(directory, 'different.bin');
    fs.writeFileSync(first, 'abcdef');
    fs.writeFileSync(same, 'abcdef');
    fs.writeFileSync(different, 'abcdeg');
    assert.strictEqual(await filesHaveSameContent(first, same), true);
    assert.strictEqual(await filesHaveSameContent(first, different), false,
      'Samma filstorlek får inte räcka för deduplicering.');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }

  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert(source.includes('boundedCacheSet(waveformCache'), 'Klientens vågformscache ska vara begränsad.');
  assert(source.includes('boundedCacheSet(thumbnailImageCache'), 'Klientens thumbnailcache ska vara begränsad.');
  console.log('Prestandaskydd för media OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
