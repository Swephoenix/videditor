'use strict';

const assert = require('assert');
const path = require('path');
const { whisperPython } = require('../server');

const expected = path.resolve(__dirname, '..', 'whisper-venv', 'bin', 'python');
assert.strictEqual(
  whisperPython(),
  expected,
  'Servern använder inte projektets egen flyttbara Whisper-miljö.'
);

console.log('TRANSCRIBE RUNTIME OK');
