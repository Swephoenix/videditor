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

// Polyfills
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

let mediaPosts = 0;
const makeResponse = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => body
});
window.fetch = async (url, opts) => {
  if (url === '/api/status') return makeResponse({ ffmpeg: true, nvenc: true, version: '0.5.0' });
  if (url === '/api/media' && opts && opts.method === 'POST') {
    mediaPosts += 1;
    return makeResponse({ id: 'img' + mediaPosts, name: 'klistrad-bild.png', kind: 'image', hasVideo: true, width: 800, height: 600, duration: 0 });
  }
  return makeResponse({});
};

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message, e.stack); process.exit(1); }

function pasteImages(files) {
  const event = new window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files } });
  document.dispatchEvent(event);
  return event;
}

function ctrlKey(key, options = {}) {
  const event = new window.KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...options });
  document.dispatchEvent(event);
  return event;
}

setTimeout(() => {
  try {
    // 1. Ctrl+V utan kopierat klipp får inte blockeras (så att paste-händelsen kan importera bild).
    const vEvent = ctrlKey('v');
    console.log('Ctrl+V utan klipp-urklipp preventDefault:', vEvent.defaultPrevented, '(expect false)');
    if (vEvent.defaultPrevented) throw new Error('Ctrl+V utan kopierat klipp blockerades felaktigt.');

    // 2. Klistra in en bild från systemets urklipp -> ny bildklipp läggs på tidslinjen.
    const png = new window.File(['x'], 'screenshot.png', { type: 'image/png' });
    pasteImages([png]);
    setTimeout(() => {
      document.querySelector('#confirm-track-placement').click();
      const imageClips = document.querySelectorAll('.clip.image');
      console.log('After paste image:');
      console.log('  media POSTs:', mediaPosts, '(expect 1)');
      console.log('  image clips:', imageClips.length, '(expect 1)');
      if (mediaPosts !== 1 || imageClips.length !== 1) throw new Error('Inklistrad bild importerades inte.');

      // 3. Kopiera ett befintligt klipp (Ctrl+C) -> nu vinner klipp-urklippet.
      imageClips[0].dispatchEvent(new window.Event('click'));
      const copyEvent = ctrlKey('c');
      console.log('Ctrl+C preventDefault:', copyEvent.defaultPrevented, '(expect true)');
      if (!copyEvent.defaultPrevented) throw new Error('Ctrl+C kopierade inte klippet.');

      // 4. Ctrl+V med kopierat klipp -> klistrar in klippet (inte bild).
      const pasteEvent = ctrlKey('v');
      console.log('Ctrl+V med klipp-urklipp preventDefault:', pasteEvent.defaultPrevented, '(expect true)');
      if (!pasteEvent.defaultPrevented) throw new Error('Ctrl+V klistrade inte in det kopierade klippet.');
      setTimeout(() => {
        document.querySelector('#confirm-track-placement').click();
        const imageClips2 = document.querySelectorAll('.clip.image');
        console.log('  image clips after clip-paste:', imageClips2.length, '(expect 2)');
        if (imageClips2.length !== 2) throw new Error('Klippet klistrades inte in som kopia.');

        // 5. Paste-händelse med bild när klipp-urklipp finns -> importerar INTE bild.
        const postsBefore = mediaPosts;
        pasteImages([new window.File(['y'], 'bild2.png', { type: 'image/png' })]);
        setTimeout(() => {
          console.log('Paste bild med klipp-urklipp:');
          console.log('  media POSTs:', mediaPosts, '(expect unchanged', postsBefore + ')');
          if (mediaPosts !== postsBefore) throw new Error('Bild importerades trots att ett klipp var kopierat.');
          console.log('DONE');
          process.exit(0);
        }, 200);
      }, 200);
    }, 200);
  } catch (e) {
    console.log('TEST ERROR:', e.message, e.stack);
    process.exit(1);
  }
}, 100);
