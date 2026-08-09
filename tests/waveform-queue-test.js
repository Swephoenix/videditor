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

const makeResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body
});

let inFlight = 0;
let maxInFlight = 0;
let waveformCalls = 0;
let retried = false;

window.fetch = async (url, opts) => {
  if (typeof url === 'string' && url.includes('/waveform?')) {
    waveformCalls += 1;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 20));
    inFlight -= 1;
    if (waveformCalls === 1 || waveformCalls === 3) {
      retried = true;
      return makeResponse({ error: 'För många jobb' }, 429);
    }
    return makeResponse({ peaks: Array(100).fill(0.5) });
  }
  return makeResponse({});
};

window.eval(timelineModelJs);
window.eval(`${appJs}
  window.__test = { getWaveformData, waveformFetchQueue, activeWaveformFetches };
`);
const getWaveformData = window.__test.getWaveformData;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  try {
    const entries = [];
    for (let i = 0; i < 6; i += 1) {
      entries.push(getWaveformData('media-' + i, 0, 10, 400));
    }
    await wait(3200);
    console.log('Vågforms-förfrågningar totalt:', waveformCalls, '(>= 7 = minst en retry utöver de 6)');
    console.log('Max samtidiga fetches:', maxInFlight, '(expect <= 2)');
    if (maxInFlight > 2) throw new Error('Fler än 2 waveform-fetches körde samtidigt.');
    if (waveformCalls < 7) throw new Error(`Förväntade minst 7 anrop (6 + retry), fick ${waveformCalls}.`);
    if (!retried) throw new Error('429 gav inte retry.');
    const loaded = entries.filter((entry) => !entry.loading && entry.peaks).length;
    console.log('Laddade vågformer:', loaded, '(expect 6)');
    if (loaded !== 6) throw new Error(`Endast ${loaded} av 6 vågformer laddades.`);
    console.log('DONE');
    process.exit(0);
  } catch (e) {
    console.log('TEST ERROR:', e.message, e.stack);
    process.exit(1);
  }
})();
