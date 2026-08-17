'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { installDomStubs } = require('./jsdom-helpers');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(root, 'timeline-model.js'), 'utf8');
const missingMedia = {
  id: 'missing-image', name: 'bild.png', sourcePath: '/gammal/bild.png', storedName: 'bild.png',
  kind: 'image', hasVideo: true, hasAudio: false, width: 800, height: 600, duration: 5, available: false
};
const relinkedMedia = { ...missingMedia, name: 'flyttad.png', sourcePath: '/ny/flyttad.png', available: true };
let relinkRequest = null;

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;
installDomStubs(window);
window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
window.CSS = window.CSS || {};
window.CSS.escape = (value) => value;
window.structuredClone = window.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));
window.fetch = async (url, options = {}) => {
  const response = (body, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body
  });
  if (url === '/api/status') return response({ ffmpeg: true, nvenc: true });
  if (url === '/api/media' && (!options.method || options.method === 'GET')) return response([missingMedia]);
  if (url === '/api/media/missing-image/relink' && options.method === 'POST') {
    relinkRequest = JSON.parse(options.body);
    return response({ cancelled: false, media: relinkedMedia });
  }
  return response({});
};

function wait(milliseconds = 0) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

(async () => {
  window.eval(timelineModelJs);
  window.eval(`${appJs}\nwindow.__mediaRelinkTest = { state, createClipElement };`);
  await wait(40);

  const clips = [
    { id: 'clip-a', name: 'bild.png', kind: 'image', mediaId: 'missing-image', mediaDuration: 5, start: 0, trimStart: 0, trimEnd: 5, trackIndex: 0 },
    { id: 'clip-b', name: 'bild.png', kind: 'image', mediaId: 'missing-image', mediaDuration: 5, start: 6, trimStart: 0, trimEnd: 4, trackIndex: 1 }
  ];
  window.__mediaRelinkTest.state.clips = clips;
  clips.forEach(window.__mediaRelinkTest.createClipElement);

  const firstClip = document.querySelector('.clip[data-id="clip-a"]');
  if (!firstClip.classList.contains('media-missing')) throw new Error('Saknat media markeras inte i tidslinjen.');
  if (!firstClip.textContent.includes('Media saknas')) throw new Error('Klippet saknar synlig feltext.');
  const poolItem = document.querySelector('.media-pool-item[data-media-id="missing-image"]');
  if (!poolItem?.classList.contains('media-missing')) throw new Error('Saknat media markeras inte i mediebiblioteket.');
  if (!poolItem.querySelector('.media-pool-add').disabled) throw new Error('Saknat media kan fortfarande läggas till på tidslinjen.');

  firstClip.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 80, clientY: 80 }));
  const relinkButton = document.querySelector('#relink-media');
  if (!relinkButton || relinkButton.hidden) throw new Error('Högerklicksmenyn saknar “Länka om media…”.');
  relinkButton.click();
  await wait(20);

  if (relinkRequest?.requiredDuration !== 5) throw new Error(`Fel minimilängd skickades: ${JSON.stringify(relinkRequest)}`);
  if (document.querySelectorAll('.clip.media-missing').length !== 0) throw new Error('Alla klipp med samma media-ID reparerades inte.');
  if (window.__mediaRelinkTest.state.mediaBin.find((item) => item.id === 'missing-image')?.sourcePath !== '/ny/flyttad.png') {
    throw new Error('Mediebiblioteket uppdaterades inte med den nya sökvägen.');
  }
  if (!document.querySelector('#status').textContent.includes('länkades om')) throw new Error('Användaren får ingen bekräftelse efter omlänkning.');

  console.log('MEDIA RELINK UI OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
