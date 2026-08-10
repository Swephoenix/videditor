'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { installDomStubs } = require('./jsdom-helpers');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(ROOT, 'timeline-model.js'), 'utf8');
const requests = [];

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;
installDomStubs(window);

window.crypto = window.crypto || {};
if (!window.crypto.randomUUID) window.crypto.randomUUID = () => `id-${Math.random().toString(36).slice(2)}`;
window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
window.CSS = window.CSS || {};
window.CSS.escape = (value) => value;
window.alert = (message) => { throw new Error(`Oväntad dialog: ${message}`); };
if (!window.structuredClone) window.structuredClone = (value) => JSON.parse(JSON.stringify(value));

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body
});
window.fetch = async (url, options = {}) => {
  if (url === '/api/status') return response({ ffmpeg: true, nvenc: true });
  if (url === '/api/export/select-folder' && options.method === 'POST') {
    return response({ token: 'selected-folder', path: '/tmp/selected-export', name: 'selected-export' });
  }
  if (url === '/api/export' && options.method === 'POST') {
    requests.push(JSON.parse(options.body));
    return response({ id: `job-${requests.length}` }, 202);
  }
  if (/^\/api\/jobs\/job-\d+$/.test(url)) {
    return response({ status: 'completed', progress: 100, outputDirectory: '/tmp', outputFileName: 'selection.mp4' });
  }
  return response({});
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

(async () => {
  window.eval(timelineModelJs);
  window.eval(`${appJs}\nwindow.__selectedExportTest = { state, selectClips, renderSegmentSelection };`);
  await wait(30);

  const { state, selectClips, renderSegmentSelection } = window.__selectedExportTest;
  state.canvas = { width: 1280, height: 720 };
  state.clips = [
    { id: 'outside', name: 'Utanför', kind: 'color', start: 0, trimStart: 0, trimEnd: 4, trackIndex: 0, color: {} },
    { id: 'video', name: 'Video', kind: 'video', mediaId: 'video-1', start: 10, trimStart: 2, trimEnd: 8, trackIndex: 0 },
    { id: 'audio', name: 'Ljud', kind: 'audio', mediaId: 'audio-1', start: 10, trimStart: 2, trimEnd: 8, trackIndex: 0 },
    { id: 'logo', name: 'Logga', kind: 'image', mediaId: 'image-1', start: 12, trimStart: 0, trimEnd: 2, trackIndex: 1 }
  ];

  const exportSelection = document.querySelector('#export-selection');
  selectClips(['video', 'audio'], 'video');
  if (exportSelection.disabled) throw new Error('Exportera val aktiverades inte för markerade klipp.');
  exportSelection.click();
  if (!document.querySelector('#export-title').textContent.includes('2 markerade klipp')) {
    throw new Error('Exportmodalen beskriver inte klippurvalet.');
  }
  document.querySelector('#choose-output-folder').click();
  await wait(20);
  document.querySelector('#start-export').click();
  await wait(30);
  if (requests.length !== 1) throw new Error('Klippurvalet startade inte en export.');
  if (requests[0].clips.length !== 2 || requests[0].clips.some((clip) => clip.start !== 0)) {
    throw new Error(`Markerade klipp exporterades inte ensamma från tiden noll: ${JSON.stringify(requests[0].clips)}`);
  }

  state.segmentSelectionActive = true;
  state.segmentRange = { start: 11, end: 13 };
  renderSegmentSelection();
  if (exportSelection.textContent !== 'Exportera segment som MP4') {
    throw new Error('Exportknappen växlade inte till segmentexport.');
  }
  exportSelection.click();
  document.querySelector('#start-export').click();
  await wait(30);
  const segmentRequest = requests[1];
  if (!segmentRequest || segmentRequest.clips.length !== 3) {
    throw new Error('Segmentexporten tog inte med alla tre överlappande lager.');
  }
  const video = segmentRequest.clips.find((clip) => clip.mediaId === 'video-1');
  const logo = segmentRequest.clips.find((clip) => clip.mediaId === 'image-1');
  if (video.start !== 0 || video.trimStart !== 3 || video.trimEnd !== 5) {
    throw new Error(`Videon trimmades fel vid segmentgränserna: ${JSON.stringify(video)}`);
  }
  if (logo.start !== 1 || logo.trimStart !== 0 || logo.trimEnd !== 1) {
    throw new Error(`Bildlagret trimmades fel i segmentexporten: ${JSON.stringify(logo)}`);
  }
  console.log('SELECTED EXPORT OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
