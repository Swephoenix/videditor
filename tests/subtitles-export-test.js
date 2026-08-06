const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { installDomStubs } = require('./jsdom-helpers');
const { buildSubtitleAss } = require('../server');

// ---- Server: ASS-generator ----
const ass = buildSubtitleAss(
  [{ start: 0.5, end: 2.0, text: 'Hej alla' }, { start: 2.5, end: 3.0, text: 'hur är' }],
  1920, 1080
);
if (!ass.includes('Alignment,MarginL,MarginR,MarginV') || !ass.includes(',1,2,40,40,')) {
  throw new Error('ASS-stilen för undertexter saknar bottencentrerad placering.');
}
if (!ass.includes('Dialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,Hej alla')) {
  throw new Error('Undertextcue saknas eller har fel tid i ASS-filen.');
}
if (!ass.includes('0:00:02.50,0:00:03.00')) throw new Error('Andra undertextcuen saknas.');
console.log('Server-ASS OK');

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
window.alert = (m) => { throw new Error('ALERT: ' + m); };
if (!window.structuredClone) window.structuredClone = (v) => JSON.parse(JSON.stringify(v));
Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
  configurable: true,
  get() { return this._files || null; },
  set(v) { this._files = v; }
});
window.fetch = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => ({ ffmpeg: true, nvenc: true })
});

try {
  window.eval(timelineModelJs);
  window.eval(`${appJs}
    window.__test = { state, exportSubtitleCues, fitProjectToContent, contentBounds, syncExportSubtitlesPrefill };
  `);
} catch (e) {
  console.log('SCRIPT ERROR:', e.message, e.stack);
  process.exit(1);
}

const { state, exportSubtitleCues, fitProjectToContent, contentBounds, syncExportSubtitlesPrefill } = window.__test;
const exportSubtitles = document.querySelector('#export-subtitles');

setTimeout(() => {
  try {
    state.canvas = { width: 1280, height: 720 };
    state.clips = [
      { id: 'v1', kind: 'video', mediaId: 'vid1', start: 5, trimStart: 1, trimEnd: 9, duration: 10,
        sourceWidth: 640, sourceHeight: 480, crop: { left: 0, right: 0, top: 0, bottom: 0 },
        visualScale: 1, posX: 0, posY: 0, trackIndex: 0 }
    ];
    state.transcriptionMediaId = 'vid1';
    state.transcriptionSegments = [
      { start: 2.0, end: 3.0, text: 'Hej alla' },
      { start: 4.0, end: 5.0, text: 'hur är det' }
    ];

    // 1. Förifyllning: transkribering finns -> kryssrutan kryssas i.
    exportSubtitles.checked = false;
    syncExportSubtitlesPrefill();
    console.log('Förifyllning av kryssruta:', exportSubtitles.checked, '(expect true)');
    if (!exportSubtitles.checked) throw new Error('Kryssrutan förifylldes inte.');

    // 2. Cue-tider: klippet startar vid 5 med trimStart 1 -> offset 4.
    const cues = exportSubtitleCues();
    console.log('Cues:', JSON.stringify(cues));
    if (!cues || cues.length !== 2) throw new Error('Fel antal cues.');
    if (Math.abs(cues[0].start - 6) > 1e-9 || Math.abs(cues[0].end - 7) > 1e-9) {
      throw new Error(`Cue 1 fel tid: ${cues[0].start}-${cues[0].end} (förväntat 6-7)`);
    }
    if (Math.abs(cues[1].start - 8) > 1e-9 || Math.abs(cues[1].end - 9) > 1e-9) {
      throw new Error(`Cue 2 fel tid: ${cues[1].start}-${cues[1].end} (förväntat 8-9)`);
    }

    // 3. Utan kryssruta -> inga cues.
    exportSubtitles.checked = false;
    if (exportSubtitleCues() !== null) throw new Error('Cues skapades utan kryssruta.');
    exportSubtitles.checked = true;

    // 4. Autofit utan undertexter croppar marginalerna (960x720)...
    exportSubtitles.checked = false;
    const fitWithout = fitProjectToContent();
    console.log('Fit utan undertexter:', fitWithout ? JSON.stringify(fitWithout.canvas) : 'null', '(expect 960x720)');
    if (!fitWithout || fitWithout.canvas.width !== 960 || fitWithout.canvas.height !== 720) {
      throw new Error(`Fit utan undertexter fel: ${JSON.stringify(fitWithout && fitWithout.canvas)}`);
    }

    // 5. ...men med undertexter behålls hela bredden + bottenremsan (ingen crop).
    exportSubtitles.checked = true;
    const fitWith = fitProjectToContent();
    console.log('Fit med undertexter:', fitWith ? JSON.stringify(fitWith.canvas) : 'null', '(expect null = hela ytan)');
    if (fitWith !== null) {
      throw new Error(`Autofit croppade bort undertextytan: ${JSON.stringify(fitWith.canvas)}`);
    }

    console.log('DONE');
    process.exit(0);
  } catch (e) {
    console.log('TEST ERROR:', e.message);
    process.exit(1);
  }
}, 100);
