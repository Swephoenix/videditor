'use strict';
const assert = require('assert');
const fsp = require('fs').promises;
const { app, jobs, TaskQueue, ffmpegFailureMessage } = require('../server');

(async () => {
  const route = app._router.stack.find(layer => layer.route?.path === '/api/export').route.stack[0].handle;
  const originalStatfs = fsp.statfs;
  const originalEnqueue = TaskQueue.prototype.enqueue;
  let result;
  fsp.statfs = async () => ({ bavail: 1, bsize: 1 });
  TaskQueue.prototype.enqueue = () => Promise.resolve();
  const req = { body: { format: 'mp4', quality: 5, canvas: { width: 1920, height: 1080 }, clips: [{ kind: 'color', start: 0, trimStart: 0, trimEnd: 7200, color: { color: '#000000' } }] } };
  const res = { status(code) { this.statusCode = code; return this; }, json(body) { result = body; return this; } };
  try {
    let failure;
    await route(req, res, error => { failure = error; });
    assert.ifError(failure);
    assert.equal(res.statusCode, 202, 'En osäker uppskattning ska inte stoppa exporten.');
    assert(result.id && jobs.has(result.id));
    assert.match(ffmpegFailureMessage(1, 'No space left on device'), /disken blev full/i);
    console.log('EXPORT WITHOUT ESTIMATE BLOCK OK');
  } finally {
    if (result?.id) jobs.delete(result.id);
    fsp.statfs = originalStatfs;
    TaskQueue.prototype.enqueue = originalEnqueue;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
