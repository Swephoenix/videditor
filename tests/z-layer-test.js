'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const previewRule = css.match(/\.preview-window\s*\{([^}]*)\}/);

assert(previewRule, 'CSS-regeln för preview-fönstret saknas.');
assert.match(
  previewRule[1],
  /\bisolation\s*:\s*isolate\s*;/,
  'Preview-fönstret måste kapsla sina höga interna z-index så de inte täcker globala menyer.'
);
assert.match(html, /styles\.css\?v=0\.17\.9/, 'CSS-cacheversionen uppdaterades inte.');

console.log('Z-LAYER ORDER OK');
