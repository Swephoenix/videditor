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
    window.__test = { state, setCanvas, syncCanvasSliders };
  `);
} catch (e) {
  console.log('SCRIPT ERROR:', e.message, e.stack);
  process.exit(1);
}

const { state, setCanvas } = window.__test;

setTimeout(() => {
  try {
    // Sätt canvas 1920x1080 och verifiera att reglagen synkas.
    setCanvas({ width: 1920, height: 1080 }, false);
    const widthSlider = document.querySelector('#canvas-width-slider');
    const heightSlider = document.querySelector('#canvas-height-slider');
    const widthValue = document.querySelector('#canvas-width-value');
    const heightValue = document.querySelector('#canvas-height-value');
    console.log('Efter setCanvas 1920x1080: slider=', widthSlider.value, 'x', heightSlider.value);
    if (widthSlider.value !== '1920' || heightSlider.value !== '1080') throw new Error('Reglagen synkas inte med canvas.');
    if (widthValue.textContent !== '1920' || heightValue.textContent !== '1080') throw new Error('Output-värdena uppdateras inte.');

    // Dra bredd-reglaget till 1280.
    widthSlider.value = '1280';
    widthSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
    const previewWindow = document.querySelector('.preview-window');
    console.log('Efter drag till 1280: canvas=', state.canvas.width, 'x', state.canvas.height,
      'nummerfält=', document.querySelector('#canvas-width').value, 'aspectRatio=', previewWindow.style.aspectRatio);
    if (state.canvas.width !== 1280 || state.canvas.height !== 1080) throw new Error('Canvas uppdaterades inte av reglaget.');
    if (document.querySelector('#canvas-width').value !== '1280') throw new Error('Nummerfältet synkas inte med reglaget.');
    if (previewWindow.style.aspectRatio !== '1280 / 1080') throw new Error('Previewn uppdaterar inte sitt format.');

    // Formatet ska växla till "Egen storlek" automatiskt.
    const formatSelect = document.querySelector('#canvas-format');
    const customDiv = document.querySelector('#custom-canvas-size');
    console.log('Format efter drag:', formatSelect.value, 'synlig custom:', !customDiv.hidden);
    if (formatSelect.value !== 'custom' || customDiv.hidden) throw new Error('Formatet växlade inte till egen storlek.');

    // Höjd-reglaget också.
    heightSlider.value = '600';
    heightSlider.dispatchEvent(new window.Event('input', { bubbles: true }));
    console.log('Efter drag höjd till 600: canvas=', state.canvas.width, 'x', state.canvas.height);
    if (state.canvas.height !== 600) throw new Error('Höjd-reglaget uppdaterade inte canvas.');

    // Verktygsknappen: öppna popovern, verifiera innehåll, stäng med utanför-klick.
    const qtCanvas = document.querySelector('#qt-canvas');
    const popover = document.querySelector('#canvas-size-popover');
    if (popover.hidden) {
      qtCanvas.dispatchEvent(new window.Event('click', { bubbles: true }));
    }
    console.log('Popover efter klick på Yta-knappen: hidden=', popover.hidden, '(expect false)');
    if (popover.hidden) throw new Error('Popovern öppnades inte av Yta-knappen.');
    if (qtCanvas.getAttribute('aria-expanded') !== 'true') throw new Error('aria-expanded sattes inte.');
    if (document.querySelector('#canvas-width-slider').value !== '1280') throw new Error('Reglagen synkas inte i popovern.');

    document.body.dispatchEvent(new window.Event('click', { bubbles: true }));
    console.log('Popover efter klick utanför: hidden=', popover.hidden, '(expect true)');
    if (!popover.hidden) throw new Error('Popovern stängdes inte vid klick utanför.');

    // Öppna igen och stäng med Escape.
    qtCanvas.dispatchEvent(new window.Event('click', { bubbles: true }));
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    console.log('Popover efter Escape: hidden=', popover.hidden, '(expect true)');
    if (!popover.hidden) throw new Error('Popovern stängdes inte med Escape.');

    console.log('DONE');
    process.exit(0);
  } catch (e) {
    console.log('TEST ERROR:', e.message);
    process.exit(1);
  }
}, 100);
