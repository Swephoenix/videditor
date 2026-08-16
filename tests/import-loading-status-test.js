'use strict';

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
window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
window.CSS = window.CSS || {};
window.CSS.escape = (value) => value;
window.structuredClone = window.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));

function response(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body
  };
}

let pendingSelection = null;
window.fetch = async (url) => {
  if (url === '/api/status') return response({ ffmpeg: true, nvenc: true });
  if (url === '/api/media') return response([]);
  if (url === '/api/media/select') return new Promise((resolve) => { pendingSelection = resolve; });
  return response({});
};

function wait(milliseconds = 0) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

(async () => {
  window.eval(timelineModelJs);
  window.eval(appJs);
  await wait(30);

  const status = document.querySelector('#status');
  status.textContent = 'Redo';
  document.querySelector('#import-files').click();
  if (status.textContent !== 'Laddar media…') throw new Error(`Tidslinjeimport visar inte laddningsstatus: ${status.textContent}`);
  if (status.getAttribute('aria-busy') !== 'true') throw new Error('Tidslinjeimport markeras inte som upptagen.');
  pendingSelection(response({ cancelled: true, media: [] }));
  await wait();
  if (status.textContent !== 'Redo') throw new Error('Avbruten tidslinjeimport återställde inte föregående status.');
  if (status.hasAttribute('aria-busy')) throw new Error('Tidslinjeimport fastnade i upptaget läge efter avbrott.');

  const poolStatus = document.querySelector('#media-pool-status');
  poolStatus.textContent = '3 filer';
  pendingSelection = null;
  document.querySelector('#import-to-media-pool').click();
  if (poolStatus.textContent !== 'Laddar media…') throw new Error(`Biblioteksimport visar inte laddningsstatus: ${poolStatus.textContent}`);
  if (poolStatus.getAttribute('aria-busy') !== 'true') throw new Error('Biblioteksimport markeras inte som upptagen.');
  pendingSelection(response({ cancelled: true, media: [] }));
  await wait();
  if (poolStatus.textContent !== '3 filer') throw new Error('Avbruten biblioteksimport återställde inte föregående status.');
  if (poolStatus.hasAttribute('aria-busy')) throw new Error('Biblioteksimport fastnade i upptaget läge efter avbrott.');

  console.log('IMPORT LOADING STATUS OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
