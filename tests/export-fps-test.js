'use strict';

const assert = require('assert');
const { chooseProjectFrameRate, parseFrameRate } = require('../server');

assert.strictEqual(parseFrameRate('25/1'), 25);
assert(Math.abs(parseFrameRate('30000/1001') - 29.97002997) < 0.000001);
assert.strictEqual(parseFrameRate('0/0'), null);

const dominant25Fps = [
  { kind: 'video', trimStart: 0, trimEnd: 120, media: { frameRate: 25 } },
  { kind: 'video', trimStart: 0, trimEnd: 10, media: { frameRate: 30000 / 1001 } },
  { kind: 'image', trimStart: 0, trimEnd: 300, media: {} }
];
assert.strictEqual(
  chooseProjectFrameRate(dominant25Fps),
  25,
  'Projektet ska följa bildfrekvensen hos det dominerande videomaterialet.'
);

const repeatedSource = [
  { kind: 'video', trimStart: 0, trimEnd: 40, media: { id: 'main', frameRate: 25 } },
  { kind: 'video', trimStart: 40, trimEnd: 80, media: { id: 'main', frameRate: 25 } },
  { kind: 'video', trimStart: 0, trimEnd: 60, media: { id: 'insert', frameRate: 30 } }
];
assert.strictEqual(
  chooseProjectFrameRate(repeatedSource),
  25,
  'Alla använda klipplängder ska bidra när projektets bildfrekvens väljs.'
);

assert.strictEqual(
  chooseProjectFrameRate([{ kind: 'image', trimStart: 0, trimEnd: 5, media: {} }]),
  30,
  'Bildprojekt och äldre metadata ska falla tillbaka till 30 fps.'
);

console.log('EXPORT FPS OK');
