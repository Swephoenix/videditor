const assert = require('assert');
const {
  firstFreeTrack,
  topActiveVisual,
  linkedPartner,
  compactTrackAssignments
} = require('../timeline-model');

const clip = (kind, start, end, trackIndex = 0, id = `${kind}-${start}-${trackIndex}`) => ({
  id,
  kind,
  start,
  trimStart: 0,
  trimEnd: end - start,
  trackIndex
});

assert.strictEqual(firstFreeTrack([], ['video', 'image'], 0, 4), 0, 'Tom timeline ska börja på V1.');
assert.strictEqual(
  firstFreeTrack([clip('video', 0, 5)], ['video', 'image'], 5, 9),
  0,
  'Kant-i-kant ska återanvända V1.'
);
assert.strictEqual(
  firstFreeTrack([clip('video', 0, 5)], ['video', 'image'], 4.999, 9),
  1,
  'Tidsöverlapp ska placeras på nästa visuella spår.'
);
assert.strictEqual(
  firstFreeTrack([
    clip('text', 0, 4, 0),
    clip('text', 1, 3, 1)
  ], ['text'], 2, 5),
  2,
  'Tre samtidiga texter ska få T3.'
);

const active = [
  clip('video', 0, 10, 0, 'base'),
  clip('image', 0, 10, 0, 'middle'),
  clip('video', 0, 10, 0, 'top')
];
assert.strictEqual(topActiveVisual(active, 3)?.id, 'top', 'Sista klippet i arrayn vinner (lagerordning).');
assert.strictEqual(topActiveVisual(active, 10), null, 'Klippets sluttid ska vara exklusiv.');

const linked = [
  { id: 'video', kind: 'video', linkGroupId: 'av-1' },
  { id: 'audio', kind: 'audio', linkGroupId: 'av-1' },
  { id: 'other', kind: 'audio' }
];
assert.strictEqual(linkedPartner(linked, linked[0])?.id, 'audio', 'Video ska hitta länkat ljud.');
assert.strictEqual(linkedPartner(linked, linked[1])?.id, 'video', 'Ljud ska hitta länkad video.');
assert.strictEqual(linkedPartner(linked, linked[2]), null, 'Olänkat klipp ska sakna partner.');

const compacted = compactTrackAssignments([
  clip('video', 0, 4, 0, 'v1'),
  clip('video', 4, 8, 0, 'v2'),
  clip('text', 0, 4, 0, 't1'),
  clip('text', 2, 6, 0, 't2')
]);
assert.deepStrictEqual(
  compacted.map((item) => [item.id, item.trackIndex]),
  [['v1', 0], ['v2', 0], ['t1', 1], ['t2', 2]],
  'Överlappande klipp får unika trackIndex.'
);

const frameStart = 1 / 30;
const frameTrimStart = 2 / 30;
const framePlayhead = 3 / 30;
const frameSourceSplit = frameTrimStart + framePlayhead - frameStart;
const splitAtFrame = compactTrackAssignments([
  { id: 'split-left', kind: 'video', start: frameStart, trimStart: frameTrimStart, trimEnd: frameSourceSplit, trackIndex: 0 },
  { id: 'split-right', kind: 'video', start: framePlayhead, trimStart: frameSourceSplit, trimEnd: frameSourceSplit + 1, trackIndex: 0 }
]);
assert.deepStrictEqual(
  splitAtFrame.map((item) => [item.id, item.trackIndex]),
  [['split-left', 0], ['split-right', 0]],
  'Flyttalsavrundning vid delning får inte flytta högerhalvan till V2.'
);

const lifted = compactTrackAssignments([
  clip('video', 0, 4, 0, 'top'),
  clip('video', 0, 4, 0, 'bottom')
], ['bottom', 'top']);
assert.deepStrictEqual(
  lifted.map((item) => [item.id, item.trackIndex]),
  [['top', 1], ['bottom', 0]],
  'Flera lyfta klipp ska behålla lagerordningen som anges från botten till toppen.'
);

const denseTracks = compactTrackAssignments([
  clip('video', 0, 4, 2, 'gap-bottom'),
  clip('video', 0, 4, 5, 'gap-top')
]);
assert.deepStrictEqual(
  denseTracks.map((item) => [item.id, item.trackIndex]),
  [['gap-bottom', 0], ['gap-top', 1]],
  'Tomma spår ska kompakteras utan att basspåret byts ut.'
);

const denseAudioTracks = compactTrackAssignments([
  clip('audio', 0, 4, 1, 'audio-lower'),
  clip('audio', 4, 8, 3, 'audio-upper')
]);
assert.deepStrictEqual(
  denseAudioTracks.map((item) => [item.id, item.trackIndex]),
  [['audio-lower', 1], ['audio-upper', 3]],
  'Ljudspårens explicita placering ska bevaras efter dragning.'
);

console.log('TIMELINE TRACK MODEL OK');
