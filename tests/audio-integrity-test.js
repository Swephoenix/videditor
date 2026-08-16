'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

assert.match(
  appSource,
  /element\.readyState < 1 \|\| element\.seeking/,
  'Förhandslyssningen ska vänta på en pågående seek innan en ny synkning görs.'
);
assert.match(
  appSource,
  /synchronizeMediaElementTime\(player, targetTime, seek\)/,
  'Ljudspelaren ska använda den gemensamma seek-synkningen.'
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
