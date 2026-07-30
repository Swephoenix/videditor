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
if (presets.length !== 11) throw new Error(`Förväntade elva textpresets, fick ${presets.length}.`);
document.querySelector('[data-text-preset="rainbow-pop"]').click();

const overlay = document.querySelector('.text-overlay.text-color-stripes');
if (!overlay) throw new Error('Färgrandsvarianten applicerades inte i previewn.');
if (overlay.style.color !== 'transparent') throw new Error('Textens gradientmaskering aktiverades inte.');
if (!document.querySelector('[data-text-preset="rainbow-pop"]').classList.contains('active')) throw new Error('Valt preset markerades inte.');

const rpPanel = document.querySelector('.preset-panel[data-preset="rainbow-pop"]');
if (!rpPanel) throw new Error('Rainbow-pop-panelen visas inte.');
if (rpPanel.style.display === 'none') throw new Error('Rainbow-pop-panelen är gömd.');

document.querySelector('[data-text-preset="lower-third"]').click();
const ltPanel = document.querySelector('.preset-panel[data-preset="lower-third"]');
if (!ltPanel || ltPanel.style.display === 'none') throw new Error('Lower-third-panelen visas inte.');
if (rpPanel.style.display !== 'none') throw new Error('Rainbow-pop-panelen stängdes inte.');

const color = ltPanel.querySelector('[data-property="background"]');
if (!color) throw new Error('Lower-third-panelen saknar bakgrundsväljare.');

if (!document.querySelector('.text-preset.active')) throw new Error('Presetmarkeringen försvann inte efter byte.');
const selectedClip = document.querySelector('.clip.text.selected');
if (!selectedClip) throw new Error('Textklippet förlorade markeringen.');

document.querySelector('[data-text-preset="effect-four"]').click();
const e4Panel = document.querySelector('.preset-panel[data-preset="effect-four"]');
if (!e4Panel || e4Panel.style.display === 'none') throw new Error('Effect 4-panelen visas inte.');
const e4text = e4Panel.querySelector('[data-property="text"]');
if (!e4text || e4text.value !== 'Ready\nSet\nGo!') throw new Error('Effect 4 laddade inte sekvenstexten.');
if (!document.querySelector('.text-overlay.text-effect-four')) throw new Error('Effect 4 renderades inte i previewn.');
if (!document.querySelector('.effect-four-word')) throw new Error('Effect 4 saknar ett playhead-styrt aktivt ord.');
if (parseFloat(document.querySelector('.clip.text.selected').style.width) < 260) throw new Error('Effect 4 förlängde inte textklippet till en hel sekvens.');

document.querySelector('[data-text-preset="effect-fifteen"]').click();
if (document.querySelectorAll('.effect-fifteen-word').length !== 2) throw new Error('Effect 15 renderade inte båda zoomorden.');
document.querySelector('[data-text-preset="effect-eleven"]').click();
if (!document.querySelector('.effect-eleven-line') || !document.querySelector('.text-effect-eleven .effect-letter')) throw new Error('Effect 11 saknar skrivlinje eller bokstavsreveal.');
document.querySelector('[data-text-preset="effect-six"]').click();
if (!document.querySelector('.text-effect-six .effect-letter')) throw new Error('Effect 6 saknar bokstavsanimationen.');
console.log('TEXT PRESETS OK');
