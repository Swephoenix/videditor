'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

assert.match(
  appSource,
  /Math\.abs\(player\.currentTime - sourceTime\) > 0\.5/,
  'Förhandslyssningen ska inte tvångssöka ljudet vid små normala klockavvikelser.'
);
assert.match(
  serverSource,
  /item\.audioCodec === 'aac'/,
  'AAC ska kunna kopieras utan omkodning.'
);
assert.match(
  serverSource,
  /\['-map', '0:a:0', '-c:a', 'copy'\]/,
  'AAC-extrahering ska använda bitbevarande stream copy.'
);
assert.match(
  serverSource,
  /\['-map', '0:a:0', '-c:a', 'pcm_s16le'\]/,
  'Andra codecs ska avkodas förlustfritt till PCM i stället för AAC-omkodning.'
);

console.log('AUDIO INTEGRITY OK');
