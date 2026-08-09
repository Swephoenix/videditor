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

const segments = [];
const response = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => body
});
let transcribeBody = null;
let transcribeStarted = false;
window.fetch = async (url, options) => {
  if (url === '/api/status') return response({ ffmpeg: true, nvenc: true });
  if (url === '/api/media' && options?.method === 'POST') {
    return response({ id: 'video-1', name: 'tal.mp4', kind: 'video', hasAudio: true, width: 1280, height: 720, duration: 5 });
  }
  if (url.includes('/extract-audio')) {
    return response({ id: 'audio-1', name: 'tal.m4a', kind: 'audio', hasAudio: true, duration: 5 });
  }
  if (url === '/api/media/audio-1/transcribe' && options?.method === 'POST') {
    transcribeStarted = true;
    transcribeBody = JSON.parse(options.body);
    return response({ id: 'job-1' });
  }
  if (url === '/api/transcribe/job-1') {
    return response({ id: 'job-1', mediaId: 'audio-1', status: 'completed', progress: 100, segments });
  }
  return response({});
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

(async () => {
  try {
    window.eval(timelineModelJs);
    window.eval(appJs);
    await wait(30);
    const input = document.querySelector('#media-input');
    input.files = [{ name: 'tal.mp4' }];
    input.dispatchEvent(new window.Event('change'));
    await wait(80);

    const audioClip = document.querySelector('.clip.audio');
    const select = document.querySelector('#transcribe-language');
    const startBtn = document.querySelector('#start-transcribe');

    // 1. Öppna modalen via högerklick -> Transkribera.
    audioClip.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }));
    document.querySelector('#transcribe').click();
    await wait(100);
    const modal = document.querySelector('#transcribe-modal');
    console.log('Modal öppen:', !modal.hidden, '| start-knapp synlig:', !startBtn.hidden);
    if (modal.hidden) throw new Error('Modalen öppnades inte.');
    if (startBtn.hidden) throw new Error('Transkribera-knappen saknas.');
    console.log('Transkribering startad utan klick:', transcribeStarted, '(expect false)');
    if (transcribeStarted) throw new Error('Transkriberingen startade för tidigt (innan knapptryck).');

    // 2. Välj svenska, tryck Transkribera.
    select.value = 'sv';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    startBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await wait(100);
    console.log('Svenska valt:', transcribeBody?.language, '(expect sv)');
    if (transcribeBody?.language !== 'sv') throw new Error('Svenska skickades inte som språk.');
    if (!transcribeStarted) throw new Error('Transkriberingen startade inte efter knapptryck.');

    // 3. Efter klar: start-knapp dold, språk åter aktiverad.
    console.log('Efter klar – start-knapp dold:', startBtn.hidden, '| språk disabled:', select.disabled);
    if (!startBtn.hidden) throw new Error('Start-knappen ska vara dold efter klar transkribering.');
    if (select.disabled) throw new Error('Språk-väljaren ska vara aktiv efter klar transkribering.');

    // 4. Öppna igen, välj engelska, transkribera igen.
    document.querySelector('#close-transcribe-modal').click();
    audioClip.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }));
    document.querySelector('#transcribe').click();
    await wait(100);
    select.value = 'en';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    startBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await wait(100);
    console.log('Engelska valt:', transcribeBody?.language, '(expect en)');
    if (transcribeBody?.language !== 'en') throw new Error('Engelska skickades inte som språk.');

    const saved = window.localStorage.getItem('videoeditor:transcribe-language');
    console.log('Sparat i localStorage:', saved, '(expect en)');
    if (saved !== 'en') throw new Error('Språkvalet sparades inte.');

    console.log('DONE');
    process.exit(0);
  } catch (e) {
    console.log('TEST ERROR:', e.message, e.stack);
    process.exit(1);
  }
})();
