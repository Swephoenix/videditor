'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const tests = [
  'timeline-track-model-test.js',
  'bugfix-regression-test.js',
  'export-render-test.js',
  'multitrack-test.js',
  'transcription-search-test.js',
  'text-color-stripes-test.js',
  'persist-test.js',
  'autosplit-test.js',
  'crop-overlay-test.js',
  'menu-test.js',
  'overlay-e2e-test.js',
  'word-overlay-test.js',
  'sync-logic-test.js',
  'word-logic-test.js',
  'audio-export-test.js',
  'audio-integrity-test.js',
  'audio-tools-test.js',
  'audio-api-contract-test.js',
  'local-ai-test.js',
  'text-animation-logic-test.js',
  'text-scale-handle-test.js'
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`\n${tests.length} TESTFILER OK`);
