'use strict';

const assert = require('assert');
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

window.requestAnimationFrame = () => 1;
window.cancelAnimationFrame = () => {};
window.CSS = window.CSS || {};
window.CSS.escape = (value) => value;
window.structuredClone = window.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));
window.alert = (message) => { throw new Error(`Oväntad dialog: ${message}`); };
window.fetch = async () => ({
  ok: true, status: 200,
  headers: { get: () => 'application/json' },
  json: async () => ({ ffmpeg: true, nvenc: true })
});

window.eval(timelineModelJs);
window.eval(`${appJs}\nwindow.__selectionTest = { state, createClipElement, defaultText };`);

const { state, createClipElement, defaultText } = window.__selectionTest;
const scroll = document.querySelector('#timeline-scroll');
Object.defineProperty(scroll, 'clientWidth', { configurable: true, get: () => 500 });
Object.defineProperty(scroll, 'scrollWidth', { configurable: true, get: () => 8000 });

const common = { trimStart: 0, trimEnd: 5, mediaDuration: 5, trackIndex: 0 };
const clips = [
  { ...common, id: 'text-1', name: 'Text', kind: 'text', start: 30, text: defaultText() },
  {
    ...common, id: 'image-1', mediaId: 'image-media', name: 'Bild', kind: 'image', start: 40,
    sourceWidth: 1280, sourceHeight: 720, crop: { left: 0, right: 0, top: 0, bottom: 0 },
    visualScale: 1, posX: 0, posY: 0
  },
  {
    ...common, id: 'video-1', mediaId: 'video-media', name: 'Video', kind: 'video', start: 50,
    sourceWidth: 1280, sourceHeight: 720, crop: { left: 0, right: 0, top: 0, bottom: 0 },
    visualScale: 1, posX: 0, posY: 0
  }
];
state.clips = clips;
clips.forEach(createClipElement);

function clickClip(id) {
  const clip = document.querySelector(`.clip[data-id="${id}"]`);
  assert(clip, `Blocket ${id} saknas.`);
  const target = clip.querySelector('span') || clip;
  target.dispatchEvent(new window.MouseEvent('mousedown', { button: 0, clientX: 1200, clientY: 20, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mouseup', { button: 0, clientX: 1200, clientY: 20, bubbles: true }));
}

for (const clip of clips) {
  state.playhead = 0;
  scroll.scrollLeft = 1000;
  clickClip(clip.id);
  assert.strictEqual(state.selectedId, clip.id, `${clip.kind}-blocket markerades inte.`);
  assert.strictEqual(state.playhead, 0, `${clip.kind}-markering flyttade playheadens tid.`);
  assert.strictEqual(scroll.scrollLeft, 1000, `${clip.kind}-markering scrollade tidslinjen till playhead.`);

  // Repeated selection is a separate edge: it must not trigger viewport sync either.
  scroll.scrollLeft = 1000;
  clickClip(clip.id);
  assert.strictEqual(scroll.scrollLeft, 1000, `Ommarkering av ${clip.kind} flyttade tidslinjen.`);
}

console.log('CLIP SELECTION SCROLL OK');
