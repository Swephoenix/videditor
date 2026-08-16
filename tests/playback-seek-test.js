'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { JSDOM } = require('jsdom');
const { installDomStubs } = require('./jsdom-helpers');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(ROOT, 'timeline-model.js'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/'
});
const { window } = dom;
installDomStubs(window);
window.requestAnimationFrame = () => 1;
window.cancelAnimationFrame = () => {};

Object.defineProperties(window.HTMLMediaElement.prototype, {
  currentTime: {
    configurable: true,
    get() { return this._testCurrentTime || 0; },
    set(value) {
      this._testCurrentTime = Number(value) || 0;
      this._testSeekWrites = (this._testSeekWrites || 0) + 1;
      this._testSeeking = true;
    }
  },
  readyState: { configurable: true, get() { return this._testReadyState ?? 4; } },
  seeking: { configurable: true, get() { return this._testSeeking === true; } },
  paused: { configurable: true, get() { return this._testPaused !== false; } },
  ended: { configurable: true, get() { return false; } }
});
window.HTMLMediaElement.prototype.pause = function pause() { this._testPaused = true; };
window.HTMLMediaElement.prototype.play = function play() {
  this._testPaused = false;
  return Promise.resolve();
};

window.CSS = window.CSS || {};
window.CSS.escape = (value) => value;
window.structuredClone = window.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));
window.alert = (message) => { throw new Error(`Oväntad dialog: ${message}`); };
window.confirm = () => true;
window.fetch = async (url) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => url === '/api/status' ? { ffmpeg: true, nvenc: true } : []
});

window.eval(timelineModelJs);
window.eval(`${appJs}\nwindow.__playbackTest = { state, syncPlaybackMedia, renderLayerMedia, playbackTick };`);

function audioClip() {
  return {
    id: 'audio-clip', mediaId: 'audio-media', name: 'Ljud', kind: 'audio',
    start: 0, trimStart: 0, trimEnd: 60, mediaDuration: 60, trackIndex: 0
  };
}

function videoClip() {
  return {
    id: 'video-clip', mediaId: 'video-media', name: 'Video', kind: 'video',
    start: 0, trimStart: 0, trimEnd: 60, mediaDuration: 60, trackIndex: 0,
    sourceWidth: 1280, sourceHeight: 720,
    crop: { left: 0, right: 0, top: 0, bottom: 0 }, visualScale: 1, posX: 0, posY: 0
  };
}

// A slow seek must remain the only seek in flight even while the wall clock
// advances and syncPlaybackMedia runs every animation frame.
window.__playbackTest.state.clips = [audioClip()];
window.__playbackTest.state.playing = true;
window.__playbackTest.syncPlaybackMedia(10);
const player = window.__playbackTest.state.timelineAudioPlayers.get('audio-clip');
assert(player, 'Ljudspelaren skapades inte.');
assert.strictEqual(player._testSeekWrites, 1, 'Första synkningen ska starta en seek.');

const startedAt = performance.now();
for (let frame = 1; frame <= 200; frame += 1) {
  window.__playbackTest.syncPlaybackMedia(10 + frame / 60);
}
const elapsedMs = performance.now() - startedAt;
assert.strictEqual(
  player._testSeekWrites,
  1,
  'En pågående ljud-seek får inte startas om varje bildruta.'
);

// Once seeked, a large genuine drift is allowed to trigger exactly one new correction.
player._testSeeking = false;
player._testCurrentTime = 10;
window.__playbackTest.syncPlaybackMedia(10.1);
assert.strictEqual(player._testSeekWrites, 1, 'Små klockavvikelser ska tolereras.');
window.__playbackTest.syncPlaybackMedia(10.5);
assert.strictEqual(player._testSeekWrites, 2, 'En slutförd seek ska kunna följas av en ny nödvändig korrigering.');

// Slow metadata loading must install one readiness callback, not one per frame.
window.__playbackTest.state.timelineAudioPlayers.clear();
window.__playbackTest.state.clips = [videoClip()];
const preview = window.document.querySelector('#preview');
preview._testReadyState = 0;
preview._testSeeking = false;
let metadataListeners = 0;
const originalAddEventListener = preview.addEventListener.bind(preview);
preview.addEventListener = (type, listener, options) => {
  if (type === 'loadedmetadata') metadataListeners += 1;
  return originalAddEventListener(type, listener, options);
};
for (let frame = 0; frame < 20; frame += 1) {
  window.__playbackTest.renderLayerMedia(5 + frame / 60, true);
}
assert.strictEqual(metadataListeners, 1, 'Metadata-lyssnaren ska dedupliceras medan videon laddas.');

// Image -> video must preload during playback and must never bounce the
// playhead back into the image while the new video is buffering.
const image = {
  id: 'image-clip', mediaId: 'image-media', name: 'Bild', kind: 'image',
  start: 0, trimStart: 0, trimEnd: 5, mediaDuration: 14400, trackIndex: 0,
  sourceWidth: 1280, sourceHeight: 720
};
const followingVideo = { ...videoClip(), start: 5, trimEnd: 5, mediaDuration: 5 };
window.__playbackTest.state.clips = [image, followingVideo];
window.__playbackTest.state.mediaPreloaders.clear();
window.__playbackTest.state.lastMediaPreloadAt = -Infinity;
window.__playbackTest.state.playing = true;
window.__playbackTest.state.playbackEnd = 10;
window.__playbackTest.state.playbackOrigin = 0;
window.__playbackTest.state.playbackStartedAt = 0;
window.__playbackTest.state.playhead = 0;
window.__playbackTest.playbackTick(1000);
assert(
  window.__playbackTest.state.mediaPreloaders.has('video-media'),
  'Videon efter bilden ska förladdas medan uppspelningen närmar sig klippgränsen.'
);

preview._testReadyState = 0;
preview._testSeeking = false;
window.__playbackTest.state.playbackOrigin = 4.99;
window.__playbackTest.state.playbackStartedAt = 0;
window.__playbackTest.state.playhead = 4.99;
window.__playbackTest.playbackTick(20);
const bufferingBoundary = window.__playbackTest.state.playhead;
assert(
  bufferingBoundary >= 5,
  `Playheaden studsade tillbaka till bilden vid ${bufferingBoundary.toFixed(3)} s.`
);
window.__playbackTest.playbackTick(40);
assert.strictEqual(
  window.__playbackTest.state.playhead,
  bufferingBoundary,
  'Playheaden ska stå stabilt inne i videoklippet medan samma video buffrar.'
);

console.log(`PLAYBACK SEEK OK · 200 sync-varv ${elapsedMs.toFixed(1)} ms · ${player._testSeekWrites} kontrollerade seeks`);
