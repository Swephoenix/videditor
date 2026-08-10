'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(ROOT, 'timeline-model.js'), 'utf8');

function response(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0)
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeWindow() {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://localhost/'
  });
  const { window } = dom;
  window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  window.CSS = window.CSS || {};
  window.CSS.escape = (value) => value;
  window.structuredClone = window.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));
  const alerts = [];
  window.confirm = () => true;
  window.alert = (message) => alerts.push(String(message));
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.play = async () => {};
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (_target, property) => property === 'measureText' ? (() => ({ width: 0 })) : (() => {}),
    set: () => true
  });
  window.fetch = async (url) => {
    if (url === '/api/status') return response({ ffmpeg: true, nvenc: true });
    return response({});
  };
  Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
    configurable: true,
    get() { return this._testFiles || null; },
    set(value) { this._testFiles = value; }
  });

  let savedJson = null;
  window.Blob = class TestBlob {
    constructor(parts) { this.text = parts.join(''); }
  };
  window.URL.createObjectURL = (blob) => {
    savedJson = blob.text;
    return 'blob:test-project';
  };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = () => {};

  window.eval(timelineModelJs);
  window.eval(`${appJs}\nwindow.__projectTest = { state, loadProject };`);
  return { window, alerts, getSavedJson: () => savedJson };
}

async function saveAndImportCompleteProject() {
  const { window, getSavedJson } = makeWindow();
  const state = window.__projectTest.state;
  state.canvas = { width: 1080, height: 1920 };
  state.exportWindow = { x: 0.1, y: 0.2, width: 0.7, height: 0.6 };
  state.playhead = 3.25;
  state.hiddenLayers = new Set([1]);
  state.flags = [{ id: 'flag-1', time: 2.5, note: 'Viktig bild' }];
  state.projectName = 'Detaljrikt projekt';
  state.projectMediaIds = new Set(['media-video', 'media-image']);
  state.importLayer = 1;
  state.transcriptionMediaId = 'media-video';
  state.transcriptionSegments = [{ start: 1, end: 2, text: 'sparad transkribering' }];
  state.clips = [
    {
      id: 'video-clip', mediaId: 'media-video', mediaDuration: 12, sourceWidth: 1920, sourceHeight: 1080,
      kind: 'video', name: 'Video', start: 1, trimStart: 0.5, trimEnd: 8, trackIndex: 0,
      crop: { left: 0.1, right: 0.2, top: 0.05, bottom: 0 }, muted: true,
      linkGroupId: 'linked-1', transitionIn: { type: 'fade', duration: 0.4, cut: 1 },
      visualScale: 1.25, posX: 0.2, posY: -0.1, circular: { size: 0.45 }
    },
    {
      id: 'color-clip', kind: 'color', name: 'Färg', mediaDuration: 100,
      start: 0, trimStart: 0, trimEnd: 4, trackIndex: 1,
      color: { color: '#123456', x: 0.4, y: 0.6, width: 0.7, height: 0.3 }
    },
    {
      id: 'html-clip', kind: 'html', name: 'HTML', mediaDuration: 100,
      start: 2, trimStart: 0, trimEnd: 5, trackIndex: 2,
      html: { code: '<strong>Bevara mig</strong>', x: 0.3, y: 0.4, width: 0.6, height: 0.2 }
    },
    {
      id: 'text-clip', kind: 'text', name: 'Text', mediaDuration: 100,
      start: 3, trimStart: 0, trimEnd: 6, trackIndex: 3,
      text: { text: 'Allt ska sparas', presetId: 'simple', fontSize: 0.09, color: '#abcdef', background: 'none', x: 0.2, y: 0.8, scaleX: 1.4, animIn: { type: 'fade', duration: 0.3 }, animOut: null }
    }
  ];

  window.document.querySelector('#save-project').click();
  const savedJson = getSavedJson();
  assert(savedJson, 'Spara-knappen skapade ingen projektfil.');
  const saved = JSON.parse(savedJson);
  assert(saved.version >= 3, 'Projektfilen använder inte det kompletta, versionshanterade formatet.');
  assert(saved.projectName === 'Detaljrikt projekt', 'Projektnamnet försvann vid spara.');
  assert(saved.projectMediaIds.includes('media-image'), 'Projektets mediareferenser försvann vid spara.');
  assert(saved.importLayer === 1, 'Importlagret försvann vid spara.');
  assert(saved.flags?.[0]?.note === 'Viktig bild', 'Flaggor försvann vid Spara.');
  assert(saved.clips.find((clip) => clip.kind === 'color')?.color?.color === '#123456', 'Färgblockets data försvann vid Spara.');
  assert(saved.clips.find((clip) => clip.kind === 'html')?.html?.code.includes('Bevara mig'), 'HTML-blockets kod försvann vid Spara.');

  state.clips = [];
  state.flags = [];
  state.transcriptionSegments = [];
  state.canvas = null;
  state.exportWindow = null;
  const projectInput = window.document.querySelector('#project-input');
  projectInput.files = [{ text: async () => savedJson }];
  await window.__projectTest.loadProject();

  assert(state.clips.length === 4, 'Import återskapade inte alla klipp.');
  assert(state.flags[0]?.note === 'Viktig bild', 'Import återskapade inte flaggorna.');
  assert(state.transcriptionSegments[0]?.text === 'sparad transkribering', 'Import återskapade inte transkriberingen.');
  assert(state.canvas?.width === 1080 && state.canvas?.height === 1920, 'Import återskapade inte canvasformatet.');
  assert(state.exportWindow?.x === 0.1 && state.exportWindow?.height === 0.6, 'Import återskapade inte exportområdet.');
  assert(state.playhead === 3.25, 'Import återskapade inte tidspositionen.');
  assert(state.hiddenLayers.has(1), 'Import återskapade inte dolda lager.');
  assert(state.projectName === 'Detaljrikt projekt', 'Import återskapade inte projektnamnet.');
  assert(state.projectMediaIds.has('media-image'), 'Import återskapade inte projektets mediareferenser.');
  assert(state.importLayer === 1, 'Import återskapade inte importlagret.');
  assert(state.clips.find((clip) => clip.kind === 'color')?.color?.color === '#123456', 'Import återskapade inte färgblocket.');
  assert(state.clips.find((clip) => clip.kind === 'html')?.html?.code.includes('Bevara mig'), 'Import återskapade inte HTML-blocket.');
  assert(state.clips.find((clip) => clip.kind === 'text')?.text?.text === 'Allt ska sparas', 'Import återskapade inte texten.');
}

async function invalidProjectDoesNotReplaceOpenWork() {
  const { window, alerts } = makeWindow();
  const state = window.__projectTest.state;
  state.clips = [{
    id: 'keep-me', kind: 'text', name: 'Pågående arbete', mediaDuration: 100,
    start: 0, trimStart: 0, trimEnd: 3, trackIndex: 0,
    text: { text: 'Får inte försvinna', presetId: 'simple' }
  }];
  const projectInput = window.document.querySelector('#project-input');

  projectInput.files = [{ text: async () => JSON.stringify({ version: 999, clips: [] }) }];
  await window.__projectTest.loadProject();
  assert(state.clips[0]?.id === 'keep-me', 'En för ny projektfil ersatte det öppna projektet.');
  assert(alerts.at(-1)?.includes('nyare editor'), 'En för ny projektversion gav inget begripligt fel.');

  projectInput.files = [{ text: async () => '{trasig json' }];
  await window.__projectTest.loadProject();
  assert(state.clips[0]?.id === 'keep-me', 'Trasig JSON ersatte det öppna projektet.');
  assert(alerts.at(-1)?.includes('Kunde inte öppna projektet'), 'Trasig JSON gav inget importfel.');
}

(async () => {
  await saveAndImportCompleteProject();
  await invalidProjectDoesNotReplaceOpenWork();
  console.log('PROJECT JSON ROUNDTRIP OK');
  process.exit(0);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
