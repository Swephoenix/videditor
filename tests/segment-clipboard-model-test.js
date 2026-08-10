'use strict';

const assert = require('assert');
const { sliceClipsToSegment, materializeSegmentClips } = require('../timeline-model');

const clips = [
  {
    id: 'video', name: 'Video', kind: 'video', mediaId: 'v1',
    start: 1, trimStart: 2, trimEnd: 8, trackIndex: 0, linkGroupId: 'av',
    crop: { left: 0.1, right: 0, top: 0, bottom: 0 }
  },
  {
    id: 'audio', name: 'Ljud', kind: 'audio', mediaId: 'a1',
    start: 1, trimStart: 2, trimEnd: 8, trackIndex: 0, linkGroupId: 'av'
  },
  {
    id: 'image', name: 'Logga', kind: 'image', mediaId: 'i1',
    start: 4, trimStart: 0, trimEnd: 2, trackIndex: 1
  },
  {
    id: 'outside', name: 'Utanför', kind: 'text',
    start: 9, trimStart: 0, trimEnd: 2, trackIndex: 2
  }
];

const segment = sliceClipsToSegment(clips, 3, 6);
assert(segment, 'Ett giltigt segment skapades inte.');
assert.strictEqual(segment.duration, 3, 'Segmentets längd blev fel.');
assert.deepStrictEqual(segment.clips.map((clip) => clip.id), ['video', 'audio', 'image'], 'Fel klipp kopierades.');
assert.deepStrictEqual(
  segment.clips.map((clip) => [clip.id, clip.start, clip.trimStart, clip.trimEnd]),
  [['video', 0, 4, 7], ['audio', 0, 4, 7], ['image', 1, 0, 2]],
  'Delvis överlappande klipp trimmades eller placerades fel.'
);
assert(segment.clips[0].linkGroupId === 'av' && segment.clips[1].linkGroupId === 'av', 'Intern A/V-länk tappades i urklippet.');
assert.deepStrictEqual(segment.clips[0].crop, clips[0].crop, 'Klippets visuella egenskaper följde inte med.');

let nextId = 0;
const pasted = materializeSegmentClips(segment, 12, () => `new-${++nextId}`);
assert.deepStrictEqual(
  pasted.map((clip) => [clip.start, clip.trackIndex]),
  [[12, 0], [12, 0], [13, 1]],
  'Segmentet klistrades inte in med rätt relativa timing och lager.'
);
assert.strictEqual(new Set(pasted.map((clip) => clip.id)).size, 3, 'Inklistrade klipp fick inte unika ID:n.');
assert(
  pasted[0].linkGroupId && pasted[0].linkGroupId === pasted[1].linkGroupId && pasted[0].linkGroupId !== 'av',
  'Inklistringen skapade inte en ny gemensam länkgrupp.'
);
assert(pasted.every((clip) => clip.name.endsWith('(kopia)')), 'Kopierade klipp märktes inte som kopior.');

const loneLinked = sliceClipsToSegment([clips[0]], 3, 6);
assert(!loneLinked.clips[0].linkGroupId, 'En extern länk följde med utan sin partner.');
assert.strictEqual(sliceClipsToSegment(clips, 4, 4), null, 'Ett nollångt segment accepterades.');
assert.strictEqual(sliceClipsToSegment(clips, 20, 22), null, 'Ett tomt segment accepterades.');

console.log('SEGMENT CLIPBOARD MODEL OK');
