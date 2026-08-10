'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { installDomStubs } = require('./jsdom-helpers');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(ROOT, 'timeline-model.js'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;
installDomStubs(window);

window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
window.CSS = window.CSS || {};
window.CSS.escape = (value) => value;
window.structuredClone = window.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));
window.alert = (message) => { throw new Error(`Oväntad dialog: ${message}`); };

const requests = [];
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body
});
window.fetch = async (url, options = {}) => {
  if (url === '/api/status') return response({ ffmpeg: true, nvenc: false });
  if (url === '/api/media/video-1/still' && options.method === 'POST') {
    requests.push({ url, body: JSON.parse(options.body) });
    return response({
      id: 'still-1', name: 'Intervju_still_00-00-03.png', kind: 'image', duration: 5,
      hasVideo: true, hasAudio: false, width: 1920, height: 1080
    }, 201);
  }
  return response({});
};

window.eval(timelineModelJs);
window.eval(`${appJs}\nwindow.__stillFrameTest = { state, createClipElement, setPlayhead };`);

(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (!serverJs.includes("app.post('/api/media/:id/still'")) throw new Error('Serverns stillbilds-endpoint saknas.');
  const button = document.querySelector('#qt-still-frame');
  if (!button?.querySelector('svg use')) throw new Error('Stillbildsknappen med SVG saknas under previewn.');

  button.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (requests.length !== 0) throw new Error('Stillbilds-API anropades utan aktiv video.');
  if (!document.querySelector('#status').textContent.includes('Ingen video')) {
    throw new Error('Användaren fick inget meddelande när playhead saknade video.');
  }

  const video = {
    id: 'video-clip', name: 'Intervju', kind: 'video', mediaId: 'video-1', mediaDuration: 12,
    start: 0, trimStart: 1, trimEnd: 8, sourceWidth: 1920, sourceHeight: 1080,
    trackIndex: 0, crop: { left: 0, right: 0, top: 0, bottom: 0 }, visualScale: 1, posX: 0, posY: 0
  };
  window.__stillFrameTest.state.clips = [video];
  window.__stillFrameTest.state.canvas = { width: 1920, height: 1080 };
  window.__stillFrameTest.createClipElement(video);
  window.__stillFrameTest.setPlayhead(2, false);

  button.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  if (requests.length !== 1 || requests[0].body.time !== 3) {
    throw new Error(`Fel källtid skickades för stillbilden: ${JSON.stringify(requests)}`);
  }
  const still = window.__stillFrameTest.state.clips.find((clip) => clip.mediaId === 'still-1');
  if (!still || still.kind !== 'image' || still.start !== 2 || still.trimEnd !== 5) {
    throw new Error(`Stillbildsklippet skapades med fel timing: ${JSON.stringify(still)}`);
  }
  if (!(still.trackIndex > video.trackIndex) || video.trackIndex !== 0) {
    throw new Error('Stillbilden placerades inte ovanpå videon utan att flytta originalet.');
  }
  if (button.disabled) throw new Error('Stillbildsknappen förblev låst efter lyckad bildtagning.');

  console.log('STILL FRAME OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
