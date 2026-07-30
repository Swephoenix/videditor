const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { installDomStubs } = require('./jsdom-helpers');

const ROOT = '/mnt/games/home-relocated/Downloads/videditor';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(ROOT, 'timeline-model.js'), 'utf8');

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;
installDomStubs(window);

window.crypto = window.crypto || {};
if (!window.crypto.randomUUID) window.crypto.randomUUID = () => 'id-' + Math.random().toString(36).slice(2);
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
window.CSS = window.CSS || {}; window.CSS.escape = (s) => s;
if (!window.structuredClone) window.structuredClone = (v) => JSON.parse(JSON.stringify(v));
window.alert = () => {};
Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
  configurable: true, get() { return this._files || null; }, set(v) { this._files = v; }
});

const vidMedia = { id: 'vid1', name: 'v.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 10 };
const makeResponse = (body) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body });
window.fetch = async (url, opts) => {
  if (url === '/api/status') return makeResponse({ ffmpeg: true, nvenc: true, version: '0.5.0' });
  if (url === '/api/media' && opts && opts.method === 'POST') return makeResponse(vidMedia);
  if (url.includes('/extract-audio')) return makeResponse({ id: 'aud1', name: 'v_ljud.m4a', kind: 'audio', hasAudio: true, duration: 10, storedName: 'a.m4a' });
  return makeResponse({});
};

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message, e.stack); process.exit(1); }

setTimeout(() => {
  const videoInput = document.querySelector('#media-input');
  videoInput.files = [{ name: 'v.mp4' }];
  videoInput.dispatchEvent(new window.Event('change'));
  setTimeout(() => {
    const videoClips = document.querySelectorAll('.clip.video');
    const audioClips = document.querySelectorAll('.clip.audio');
    const mutedVideos = document.querySelectorAll('.clip.video.muted');
    console.log('video clips:', videoClips.length, '(expect 1)');
    console.log('audio clips (auto-split):', audioClips.length, '(expect 1)');
    console.log('muted video clips:', mutedVideos.length, '(expect 1)');
    const linkedVideo = [...videoClips][0];
    const linkedAudio = [...audioClips][0];
    const groupMatches = Boolean(
      linkedVideo?.querySelector('.clip-link-toggle')?.dataset.linkGroupId &&
      linkedVideo.querySelector('.clip-link-toggle').dataset.linkGroupId ===
        linkedAudio?.querySelector('.clip-link-toggle')?.dataset.linkGroupId
    );
    console.log('video/audio linked:', groupMatches, '(expect true)');
    console.log('chain buttons:', document.querySelectorAll('.clip-link-toggle').length, '(expect 2)');
    if (!groupMatches || document.querySelectorAll('.clip-link-toggle').length !== 2) process.exitCode = 1;
    const videoStart = Number.parseFloat(linkedVideo.style.left);
    const audioStart = Number.parseFloat(linkedAudio.style.left);
    linkedVideo.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 20 }));
    document.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 100 }));
    document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
    const movedVideo = document.querySelector('.clip.video');
    const movedAudio = document.querySelector('.clip.audio');
    const videoDelta = Number.parseFloat(movedVideo.style.left) - videoStart;
    const audioDelta = Number.parseFloat(movedAudio.style.left) - audioStart;
    console.log('linked drag delta:', videoDelta, audioDelta, '(expect equal)');
    if (videoDelta !== audioDelta || videoDelta <= 0) process.exitCode = 1;
    movedVideo.querySelector('.clip-link-toggle').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    console.log('chain buttons after unlock:', document.querySelectorAll('.clip-link-toggle').length, '(expect 0)');
    if (document.querySelectorAll('.clip-link-toggle').length !== 0) process.exitCode = 1;
    console.log('DONE');
  }, 300);
}, 100);
