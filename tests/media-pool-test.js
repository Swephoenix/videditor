'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { installDomStubs } = require('./jsdom-helpers');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(ROOT, 'timeline-model.js'), 'utf8');
const media = [
  { id: 'video-1', name: 'intervju.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 12 },
  { id: 'image-1', name: 'logga.png', kind: 'image', hasVideo: true, hasAudio: false, width: 800, height: 200, duration: 0 },
  { id: 'audio-1', name: 'musik.wav', kind: 'audio', hasVideo: false, hasAudio: true, width: 0, height: 0, duration: 8 }
];
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;
installDomStubs(window);
window.crypto = window.crypto || {};
if (!window.crypto.randomUUID) window.crypto.randomUUID = () => 'id-test';
window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
window.CSS = window.CSS || {};
window.CSS.escape = (value) => value;
window.structuredClone = window.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));
window.alert = (message) => { throw new Error(`Oväntad dialog: ${message}`); };
window.fetch = async (url, options = {}) => {
  if (url === '/api/media' && (!options.method || options.method === 'GET')) return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => media };
  if (url === '/api/status') return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ nvenc: true }) };
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({}) };
};
(async () => {
  window.eval(timelineModelJs);
window.eval(`${appJs}\nwindow.__mediaPoolTest = { state, addMediaClip, confirmTrackPlacement, ensureAudioTrack };`);
  await new Promise((resolve) => setTimeout(resolve, 40));
  if (document.querySelectorAll('.media-pool-item').length !== 3) throw new Error('Importerade media visas inte i mediehanteraren.');
  if (document.querySelector('#media-pool-count').textContent !== '3') throw new Error('Medieantalet visas fel.');
  window.__mediaPoolTest.state.clips.push({ id: 'existing-audio', kind: 'audio', start: 0, trimStart: 0, trimEnd: 8, mediaDuration: 8, trackIndex: 0 });
  window.__mediaPoolTest.ensureAudioTrack(1);
  document.querySelectorAll('.media-pool-add')[2].click();
  document.querySelector('#track-placement-select').value = 'track:1';
  window.__mediaPoolTest.confirmTrackPlacement();
  if (window.__mediaPoolTest.state.clips.find((clip) => clip.mediaId === 'audio-1')?.trackIndex !== 1) throw new Error(`Valt ljudspår sparades inte: ${JSON.stringify(window.__mediaPoolTest.state.clips)}`);
  if (!window.__mediaPoolTest.state.clips.some((clip) => clip.mediaId === 'audio-1')) throw new Error('Media från biblioteket lades inte på tidslinjen.');
  if (window.__mediaPoolTest.state.mediaBin.length !== 3) throw new Error('Media försvann ur biblioteket när det lades på tidslinjen.');
  console.log('MEDIA POOL OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
