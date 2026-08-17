'use strict';

const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  runDirectoryPickerCommand,
  pickOutputDirectory,
  outputDirectoryPickerCommands
} = require('../server');

(async () => {
  const commands = outputDirectoryPickerCommands();
  assert.strictEqual(commands[0][0], 'python3');
  assert.strictEqual(path.basename(commands[0][1][0]), 'pick_directory.py');
  assert.strictEqual(commands[1][0], 'zenity');

  const probe = execFileSync('python3', [commands[0][1][0], '--check'], { encoding: 'utf8' }).trim();
  assert.match(probe, /^tkinter\s+\d/);

  const selected = await runDirectoryPickerCommand(process.execPath, [
    '-e', 'process.stdout.write("/tmp\\n")'
  ]);
  assert.strictEqual(selected, '/tmp');

  const cancelled = await runDirectoryPickerCommand(process.execPath, ['-e', 'process.exit(1)']);
  assert.strictEqual(cancelled, null);

  const fallback = await pickOutputDirectory([
    [process.execPath, ['-e', 'process.stderr.write("trasig väljare"); process.exit(2)']],
    [process.execPath, ['-e', 'process.stdout.write("/tmp\\n")']]
  ]);
  assert.strictEqual(fallback, '/tmp');

  console.log('DIRECTORY PICKER OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
