const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { installDomStubs } = require('./jsdom-helpers');

const ROOT = path.resolve(__dirname, '..');
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

const makeResponse = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => body
});
window.fetch = async (url, opts) => {
  if (url === '/api/status') return makeResponse({ ffmpeg: true, nvenc: true, version: '0.5.0' });
  if (url === '/api/media' && opts && opts.method === 'POST') {
    return makeResponse({ id: 'v1', name: 'v.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 10 });
  }
  return makeResponse({});
};

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message, e.stack); process.exit(1); }

const scroll = document.querySelector('#timeline-scroll');
const bar = document.querySelector('#timeline-dragbar');
const thumb = document.querySelector('#timeline-dragbar-thumb');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

setTimeout(() => {
  (async () => {
    try {
      Object.defineProperty(scroll, 'clientWidth', { configurable: true, get: () => 500 });
      Object.defineProperty(scroll, 'scrollWidth', { configurable: true, get: () => 4200 });
      Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => 500 });
      scroll.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 200, right: 500, bottom: 200 });
      bar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 28, right: 500, bottom: 28 });
      scroll.scrollLeft = 0;

      scroll.scrollLeft = 0;
      scroll.dispatchEvent(new window.Event('scroll'));
      await wait(30);
      console.log('Dragbar synlig:', !bar.hidden, '(expect true)');
      if (bar.hidden) throw new Error('Dragbaren visas inte när innehållet är bredare än vyn.');

      const thumbWidth = parseFloat(thumb.style.width);
      console.log('Tumme bredd:', thumbWidth, 'px (expect >= 28 och proportionell)');
      if (!(thumbWidth >= 28 && thumbWidth < 500)) throw new Error('Tummens bredd är felaktig.');

      // Scrolla till mitten och verifiera att tummen flyttar sig.
      scroll.scrollLeft = 1850;
      scroll.dispatchEvent(new window.Event('scroll'));
      await wait(30);
      const thumbLeft = parseFloat(thumb.style.left);
      console.log('Tumme vänster vid scroll 1850:', thumbLeft, 'px (expect > 0)');
      if (!(thumbLeft > 0)) throw new Error('Tummen följde inte scrollningen.');

      // Dra tummen till höger ände -> scrollLeft ska gå till max.
      const maxScroll = 4200 - 500;
      const startX = thumbLeft + thumbWidth / 2;
      thumb.dispatchEvent(new window.MouseEvent('mousedown', { button: 0, clientX: startX, clientY: 10, bubbles: true }));
      document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 499, clientY: 10, bubbles: true }));
      document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 499, clientY: 10, bubbles: true }));
      await wait(30);
      console.log('ScrollLeft efter drag till höger:', scroll.scrollLeft, 'px (expect ~', maxScroll, ')');
      if (Math.abs(scroll.scrollLeft - maxScroll) > 30) throw new Error('Drag i tummen förflyttade inte tidslinjen korrekt.');

      // Klick på spåret (utanför tummen) hoppar till positionen.
      scroll.scrollLeft = 0;
      bar.dispatchEvent(new window.MouseEvent('mousedown', { button: 0, clientX: 250, clientY: 10, bubbles: true }));
      document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: 250, clientY: 10, bubbles: true }));
      await wait(30);
      console.log('ScrollLeft efter klick i mitten av spåret:', scroll.scrollLeft, 'px (expect ~', maxScroll / 2, ')');
      if (Math.abs(scroll.scrollLeft - maxScroll / 2) > 30) throw new Error('Klick på spåret förflyttade inte tidslinjen korrekt.');

      // När allt får plats ska dragbaren döljas.
      Object.defineProperty(scroll, 'scrollWidth', { configurable: true, get: () => 400 });
      scroll.dispatchEvent(new window.Event('scroll'));
      await wait(30);
      console.log('Dragbar dold när allt syns:', bar.hidden, '(expect true)');
      if (!bar.hidden) throw new Error('Dragbaren ska döljas när inget behöver scrollas.');

      console.log('DONE');
      process.exit(0);
    } catch (e) {
      console.log('TEST ERROR:', e.message, e.stack);
      process.exit(1);
    }
  })();
}, 100);
