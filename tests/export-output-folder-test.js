'use strict';

const assert = require('assert');
const path = require('path');
const {
  createExportFilename,
  rememberOutputDirectory,
  resolveOutputDirectorySelection
} = require('../server');

(async () => {
  const id = '12345678-abcd-4000-8000-123456789abc';
  const filename = createExportFilename('mp4', id, new Date('2026-08-10T12:34:56Z'));
  assert.strictEqual(filename, 'video-2026-08-10_12-34-56-12345678.mp4');
  assert.strictEqual(path.basename(filename), filename, 'Exportfilnamnet innehåller en sökväg.');

  const selection = await rememberOutputDirectory('/tmp');
  assert(selection.token && selection.directory === await resolveOutputDirectorySelection(selection.token));
  await assert.rejects(
    () => resolveOutputDirectorySelection('saknad-token'),
    /Output-mappen har gått ut/,
    'En godtycklig output-sökväg kunde användas utan serverutfärdad token.'
  );
  console.log('EXPORT OUTPUT FOLDER OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
