'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const tests = [
  'timeline-track-model-test.js',
  'bugfix-regression-test.js',
  'project-json-roundtrip-test.js',
  'ai-upscale-test.js',
  'export-render-test.js',
  'export-fps-test.js',
  'export-storage-test.js',
  'gpu-export-input-test.js',
  'multitrack-test.js',
  'transcription-search-test.js',
  'transcribe-language-test.js',
  'transcribe-runtime-test.js',
  'transcription-edit-test.js',
  'text-color-stripes-test.js',
  'persist-test.js',
  'autosplit-test.js',
  'crop-overlay-test.js',
  'menu-test.js',
  'overlay-e2e-test.js',
  'word-overlay-test.js',
  'sync-logic-test.js',
  'snap-test.js',
  'flag-test.js',
  'split-all-at-playhead-test.js',
  'zoom-out-fit-test.js',
  'playhead-follow-test.js',
  'dragbar-test.js',
  'video-thumbs-test.js',
  'waveform-queue-test.js',
  'word-logic-test.js',
  'audio-export-test.js',
  'audio-integrity-test.js',
  'audio-tools-test.js',
  'audio-api-contract-test.js',
  'text-animation-logic-test.js',
  'text-scale-handle-test.js',
  'layers-test.js',
  'layer-context-menu-test.js',
  'clipboard-paste-test.js',
  'preview-drag-test.js',
  'select-all-test.js',
  'auto-fit-test.js',
  'circle-mask-test.js',
  'crop-scale-overlay-z-test.js',
  'transcript-overlay-test.js',
  'subtitles-export-test.js',
  'canvas-slider-test.js'
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`\n${tests.length} TESTFILER OK`);
