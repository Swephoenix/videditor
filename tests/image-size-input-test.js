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

window.crypto = window.crypto || {};
if (!window.crypto.randomUUID) window.crypto.randomUUID = () => `id-${Math.random().toString(36).slice(2)}`;
window.requestAnimationFrame = (callback) => callback(performance.now());
window.CSS = window.CSS || {};
window.CSS.escape = (value) => value;
if (!window.structuredClone) window.structuredClone = (value) => JSON.parse(JSON.stringify(value));
window.alert = (message) => { throw new Error(`Oväntad dialog: ${message}`); };
window.fetch = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => ({ ffmpeg: true, nvenc: true })
});

window.eval(timelineModelJs);
window.eval(`${appJs}\nwindow.__test = { state, selectClip, imageSizeMetrics };`);

const { state, selectClip, imageSizeMetrics } = window.__test;
const previewWindow = document.querySelector('.preview-window');
Object.defineProperty(previewWindow, 'clientWidth', { configurable: true, value: 1280 });
Object.defineProperty(previewWindow, 'clientHeight', { configurable: true, value: 720 });
state.canvas = { width: 1280, height: 720 };
const image = {
  id: 'image-1', mediaId: 'media-1', name: 'bild.png', kind: 'image', mediaDuration: 30,
  sourceWidth: 800, sourceHeight: 600, start: 0, trimStart: 0, trimEnd: 5,
  crop: { left: 0, right: 0, top: 0, bottom: 0 }, visualScale: 1,
  posX: 0, posY: 0, circular: null, trackIndex: 0
};
state.clips = [image];
selectClip(image.id);

const tools = document.querySelector('#image-size-tools');
const widthInput = document.querySelector('#image-width');
const heightInput = document.querySelector('#image-height');
if (tools.hidden) throw new Error('Bildstorleken visas inte när en bild markeras.');
if (widthInput.value !== '960' || heightInput.value !== '720') {
  throw new Error(`Fel initial bildstorlek: ${widthInput.value}×${heightInput.value}.`);
}

widthInput.value = '480';
widthInput.dispatchEvent(new window.Event('change', { bubbles: true }));
if (Math.abs(image.visualScale - 0.5) > 0.000001) throw new Error(`Bredden gav fel skala: ${image.visualScale}.`);
if (widthInput.value !== '480' || heightInput.value !== '360') {
  throw new Error(`Höjden följde inte bredden proportionellt: ${widthInput.value}×${heightInput.value}.`);
}

heightInput.value = '720';
heightInput.dispatchEvent(new window.Event('change', { bubbles: true }));
const metrics = imageSizeMetrics(image);
if (Math.round(metrics.width) !== 960 || Math.round(metrics.height) !== 720) {
  throw new Error(`Bredden följde inte höjden proportionellt: ${metrics.width}×${metrics.height}.`);
}

state.clips = [{ ...image, id: 'video-1', kind: 'video' }];
selectClip('video-1');
if (!tools.hidden) throw new Error('Bildstorleken visas för ett videoklipp.');

console.log('IMAGE SIZE INPUT OK');
