const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(ROOT, 'timeline-model.js'), 'utf8');
const requests = [];
let folderSelections = 0;

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'http://localhost/'
});
const { window } = dom;
const { document } = window;

window.crypto = window.crypto || {};
if (!window.crypto.randomUUID) window.crypto.randomUUID = () => `id-${Math.random().toString(36).slice(2)}`;
window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
window.CSS = window.CSS || {};
window.CSS.escape = (value) => value;
window.alert = (message) => { throw new Error(`Oväntad dialog: ${message}`); };
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
  get: (_target, property) => property === 'measureText' ? (() => ({ width: 0 })) : (() => {}),
  set: () => true
});
window.HTMLMediaElement.prototype.pause = () => {};
window.HTMLMediaElement.prototype.play = async () => {};
if (!window.structuredClone) window.structuredClone = (value) => JSON.parse(JSON.stringify(value));
Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
  configurable: true,
  get() { return this._files || null; },
  set(value) { this._files = value; }
});

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body
  };
}

window.fetch = async (url, options = {}) => {
  if (url === '/api/status') return response({ ffmpeg: true, nvenc: true });
  if (url === '/api/media' && options.method === 'POST') {
    return response({
      id: 'audio-1',
      name: 'musik.wav',
      kind: 'audio',
      hasAudio: true,
      width: 0,
      height: 0,
      duration: 2
    }, 201);
  }
  if (url === '/api/export' && options.method === 'POST') {
    requests.push(JSON.parse(options.body));
    return response({ id: `job-${requests.length}` }, 202);
  }
  if (url === '/api/export/select-folder' && options.method === 'POST') {
    folderSelections += 1;
    return response({ token: 'folder-token', path: '/tmp/exports', name: 'exports' });
  }
  if (/^\/api\/jobs\/job-\d+$/.test(url)) {
    return response({
      status: 'completed', progress: 100, encoder: 'test',
      outputDirectory: '/tmp/exports', outputFileName: 'ljud-test.wav'
    });
  }
  return response({});
};

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

(async () => {
  window.eval(timelineModelJs);
  window.eval(appJs);

  const input = document.querySelector('#media-input');
  input.files = [{ name: 'musik.wav' }];
  input.dispatchEvent(new window.Event('change'));
  await wait(30);

  document.querySelector('#export-mp3').click();
  await wait(10);
  if (requests.length !== 0) throw new Error('Exporten startade innan användaren tryckte Exportera i modalrutan.');
  if (!document.querySelector('#start-export').disabled) throw new Error('Exportknappen aktiverades utan output-mapp.');
  document.querySelector('#choose-output-folder').click();
  await wait(20);
  document.querySelector('#start-export').click();
  await wait(30);
  document.querySelector('#export-wav').click();
  await wait(10);
  document.querySelector('#start-export').click();
  await wait(30);

  const formats = requests.map((request) => request.format);
  const audioSettingsAreSafe = requests.every((request) => request.hardware === 'cpu' && request.upscale === false);
  const folderTokensAreIncluded = requests.every((request) => request.outputDirectoryToken === 'folder-token');
  const labelsAreUpdated = document.querySelector('#export-title').textContent === 'Exporterar WAV';
  const obsoleteDownloadButtonIsGone = document.querySelector('#download') === null;

  if (formats.join(',') !== 'mp3,wav') throw new Error(`Fel exportformat: ${formats.join(',')}`);
  if (!audioSettingsAreSafe) throw new Error('Ljudexport försökte använda videoacceleration eller uppskalning.');
  if (!folderTokensAreIncluded || folderSelections !== 1) throw new Error('Den valda output-mappen följde inte med exporterna.');
  if (!labelsAreUpdated) throw new Error('Exportdialogen visar inte valt ljudformat.');
  if (!obsoleteDownloadButtonIsGone) throw new Error('Den gamla nedladdningsknappen finns kvar i exportdialogen.');
  console.log('AUDIO EXPORT OK');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
