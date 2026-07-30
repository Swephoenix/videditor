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
const makeResponse = (body) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body });
window.fetch = async (url) => {
  if (url === '/api/status') return makeResponse({ ffmpeg: true, nvenc: true, version: '0.5.0' });
  return makeResponse({});
};

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message); process.exit(1); }

setTimeout(() => {
  const menus = [...document.querySelectorAll('.menu')];
  console.log('Antal menyer:', menus.length, '(expect 3)');
  console.log('Kategorier:', menus.map(m => m.querySelector('.menu-toggle').textContent.trim()).join(', '));
  // Verify key buttons still present by id
  const ids = ['import-files','add-blur','add-text','split','remove','separate-audio','transcribe','export','export-mp3','export-wav','use-nvidia','use-upscale','burn-transcription','transcript-words'];
  const missing = ids.filter(id => !document.getElementById(id));
  console.log('Saknade element:', missing.length ? missing.join(',') : 'inga');

  // Test toggle Ljud menu
  const ljud = menus.find(m => /Ljud/.test(m.querySelector('.menu-toggle').textContent));
  const toggle = ljud.querySelector('.menu-toggle');
  toggle.dispatchEvent(new window.Event('click'));
  console.log('Ljud-meny öppen efter klick:', ljud.classList.contains('open'), '(expect true)');
  console.log('aria-expanded:', toggle.getAttribute('aria-expanded'), '(expect true)');
  // Click elsewhere closes
  document.dispatchEvent(new window.Event('click'));
  console.log('Ljud-meny stängd efter klick utanför:', !ljud.classList.contains('open'), '(expect true)');

  // Clicking an item inside a menu closes that menu
  const redigera = menus.find(m => /Redigera/.test(m.querySelector('.menu-toggle').textContent));
  redigera.querySelector('.menu-toggle').dispatchEvent(new window.Event('click'));
  const blurBtn = redigera.querySelector('#add-blur');
  blurBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  console.log('Redigera-meny stängd efter val av alternativ:', !redigera.classList.contains('open'), '(expect true)');

  // Interacting with a control inside a menu also closes it
  const ljud2 = menus.find(m => /Ljud/.test(m.querySelector('.menu-toggle').textContent));
  ljud2.querySelector('.menu-toggle').dispatchEvent(new window.Event('click', { bubbles: true }));
  const words = ljud2.querySelector('#transcript-words');
  words.dispatchEvent(new window.Event('click', { bubbles: true }));
  console.log('Ljud-meny stängd efter val av kontroll:', !ljud2.classList.contains('open'), '(expect true)');
  console.log('DONE');
}, 100);
