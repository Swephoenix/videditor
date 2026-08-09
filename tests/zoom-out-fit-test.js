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

let mediaIdx = 0;
const mediaSeq = [
  { id: 'v1', name: 'video1.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 10 },
  { id: 'v2', name: 'video2.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 8 },
];
const makeResponse = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => body
});
window.fetch = async (url, opts) => {
  if (url === '/api/status') return makeResponse({ ffmpeg: true, nvenc: true, version: '0.5.0' });
  if (url === '/api/media' && opts && opts.method === 'POST') {
    const m = mediaSeq[mediaIdx++] || mediaSeq[0];
    return makeResponse(m);
  }
  return makeResponse({});
};

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message, e.stack); process.exit(1); }

const timeline = document.querySelector('#timeline-tracks');
const scroll = document.querySelector('#timeline-scroll');

function importFile(name) {
  const input = document.querySelector('#media-input');
  input.files = [{ name }];
  input.dispatchEvent(new window.Event('change'));
}

function zoomTicks(count) {
  for (let i = 0; i < count; i += 1) {
    scroll.dispatchEvent(new window.WheelEvent('wheel', { ctrlKey: true, deltaY: 10, bubbles: true, cancelable: true }));
  }
}

function zoomOutTicks(count) {
  zoomTicks(count);
}

function zoomInTicks(count) {
  for (let i = 0; i < count; i += 1) {
    scroll.dispatchEvent(new window.WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }));
  }
}

function currentScale() {
  const duration = Number(timeline.dataset.duration) || 90;
  return parseFloat(timeline.style.width) / duration;
}

setTimeout(() => {
  try {
    importFile('video1.mp4');
    setTimeout(() => {
      importFile('video2.mp4');
      setTimeout(() => {
        scroll.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 200, right: 1000, bottom: 200 });
        scroll.clientWidth = 1000;

        const duration = Number(timeline.dataset.duration);
        console.log('Project duration:', duration, 's');
        if (duration < 17) throw new Error('Projektet borde vara minst ~18 s (10+8).');

        zoomOutTicks(200);
        const scale = currentScale();
        const width = parseFloat(timeline.style.width);
        console.log('After max zoom-out: scale =', scale.toFixed(3), 'px/s, width =', width.toFixed(1), 'px');
        const fits = width <= 1000 * 1.05 + 1;
        console.log('Fits viewport + 5% margin:', fits ? 'yes' : 'no');
        if (!fits) throw new Error('Timelinen får inte plats i viewport + marginal vid max-utzoomning.');

        const visibleSeconds = 1000 / scale;
        console.log('Visible at max zoom-out:', visibleSeconds.toFixed(1), 's (expect >= duration)');
        if (visibleSeconds < duration - 0.01) throw new Error('Hela projektet syns inte vid max-utzoomning.');

        zoomInTicks(200);
        const scaleAfterZoomIn = currentScale();
        console.log('After zoom-in ticks: scale =', scaleAfterZoomIn.toFixed(3), 'px/s (expect > max-out scale)');
        if (scaleAfterZoomIn <= scale + 0.01) throw new Error('Det går inte att zooma in igen efter max-utzoomning.');

        // 3. Long project: import many clips so duration grows to ~190s.
        const imports = [];
        for (let i = 0; i < 10; i += 1) imports.push(new Promise((resolve) => {
          importFile('video1.mp4');
          setTimeout(resolve, 60);
        }));
        Promise.all(imports).then(() => {
          const longDuration = Number(timeline.dataset.duration);
          console.log('Long project duration:', longDuration, 's');
          if (longDuration < 110) throw new Error('Det långa projektet borde vara > 110 s.');
          zoomOutTicks(200);
          const longScale = currentScale();
          const longWidth = parseFloat(timeline.style.width);
          console.log('Long project max zoom-out: scale =', longScale.toFixed(3), 'px/s, width =', longWidth.toFixed(1), 'px');
          const longFits = longWidth <= 1000 * 1.05 + 1;
          console.log('Fits viewport + 5% margin:', longFits ? 'yes' : 'no');
          if (!longFits) throw new Error('Långt projekt får inte plats vid max-utzoomning.');
          const longVisible = 1000 / longScale;
          console.log('Visible:', longVisible.toFixed(1), 's (expect >= duration)');
          if (longVisible < longDuration - 0.01) throw new Error('Hela det långa projektet syns inte vid max-utzoomning.');
          console.log('DONE');
          process.exit(0);
        });
      }, 200);
    }, 200);
  } catch (e) {
    console.log('TEST ERROR:', e.message, e.stack);
    process.exit(1);
  }
}, 100);
