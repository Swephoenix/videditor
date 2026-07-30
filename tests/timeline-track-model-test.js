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

console.log('TIMELINE TRACK MODEL OK');
