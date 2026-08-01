const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(ROOT, 'timeline-model.js'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;

window.crypto = window.crypto || {};
if (!window.crypto.randomUUID) window.crypto.randomUUID = () => `id-${Math.random().toString(36).slice(2)}`;
window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
window.CSS = window.CSS || {};
window.CSS.escape = (value) => value;
window.structuredClone = window.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));
window.alert = (message) => { throw new Error(`Oväntad alert: ${message}`); };
window.HTMLMediaElement.prototype.pause = () => {};
window.HTMLMediaElement.prototype.play = async () => {};
window.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ffmpeg: true, nvenc: false }) });

window.eval(timelineModelJs);
window.eval(appJs);
document.querySelector('#add-text').click();
const presets = [...document.querySelectorAll('[data-text-preset]')];
const expectedPresets = ['simple', 'slide', 'scale', 'typewriter'];
if (presets.length !== expectedPresets.length) throw new Error(`Förväntade fyra textpresets, fick ${presets.length}.`);
for (const presetId of expectedPresets) {
  const button = document.querySelector(`[data-text-preset="${presetId}"]`);
  button.click();
  if (!button.classList.contains('active')) throw new Error(`${presetId} markerades inte som aktiv.`);
  const panel = document.querySelector(`.preset-panel[data-preset="${presetId}"]`);
  if (!panel || panel.style.display === 'none') throw new Error(`${presetId}-panelen visas inte.`);
  const visiblePanels = [...document.querySelectorAll('.preset-panel')].filter((item) => item.style.display !== 'none');
  if (visiblePanels.length !== 1 || visiblePanels[0] !== panel) throw new Error(`${presetId} lämnade flera preset-paneler öppna.`);
}
if (!document.querySelector('.clip.text.selected')) throw new Error('Textklippet förlorade markeringen efter presetbyte.');
if (!document.querySelector('.text-overlay')) throw new Error('Textpreset renderades inte i previewn.');
console.log('TEXT PRESETS OK');
