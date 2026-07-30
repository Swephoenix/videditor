'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const {
  validateBlur,
  validateText,
  validateTransitionIn,
  validateCanvas,
  parseNoiseFloor,
  textAnimationExpressions,
  buildAssSubtitle
} = require('../server');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(ROOT, 'timeline-model.js'), 'utf8');

function response(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0)
  };
}

function makeWindow(confirmAnswers = [], customFetch = null) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://localhost/'
  });
  const { window } = dom;
  window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  window.CSS = window.CSS || {};
  window.CSS.escape = (value) => value;
  window.structuredClone = window.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));
  window.alert = (message) => { throw new Error(`Oväntad dialog: ${message}`); };
  window.confirm = () => confirmAnswers.shift() ?? true;
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.play = async () => {};
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (_target, property) => property === 'measureText' ? (() => ({ width: 0 })) : (() => {}),
    set: () => true
  });
  window.fetch = customFetch || (async () => response({ ffmpeg: true, nvenc: false }));
  Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
    configurable: true,
    get() { return this._testFiles || null; },
    set(value) { this._testFiles = value; }
  });
  window.eval(timelineModelJs);
  window.eval(`${appJs}
    window.__test = {
      state, setPlayhead, removeSelectedClip, undoEdit, loadProject,
      syncPlaybackMedia, createClipElement, selectClips, splitSelectedClip,
      applyTransition, removeSelectedTransition, applyVisualLayout,
      startVisualScaleDrag, moveVisualScaleDrag, stopVisualScaleDrag
    };
  `);
  return window;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function testServerContracts() {
  const points = [
    { x: 0.1, y: 0.1 }, { x: 0.4, y: 0.1 },
    { x: 0.4, y: 0.4 }, { x: 0.1, y: 0.4 }
  ];
  const blur = validateBlur({
    strength: 18,
    boxes: [
      { points, strength: 12 },
      { points: points.map((point) => ({ x: point.x + 0.4, y: point.y + 0.4 })), strength: 24 }
    ]
  });
  assert(blur.boxes.length === 2, 'Servern tappade ett blur-område.');
  assert(blur.boxes[0].points[0].x === 0.1, 'Servern ersatte anpassade blur-punkter.');
  assert(blur.boxes[1].strength === 24, 'Servern tappade blur-styrka per område.');

  const text = validateText({
    text: 'Animerad text',
    color: '#abcdef',
    background: 'none',
    scaleX: 1.4,
    animIn: { type: 'slide-left', duration: 0.6 },
    animOut: { type: 'fade', duration: 0.4 }
  });
  assert(text.scaleX === 1.4, 'Servern tappade textskalan.');
  assert(text.animIn?.type === 'slide-left' && text.animOut?.type === 'fade', 'Servern tappade textanimationer.');

  const expressions = textAnimationExpressions(text, 1, 5, 72);
  assert(expressions.x.includes('t-1.000'), 'Slide-animationen saknar tidsuttryck.');
  assert(expressions.alpha.includes('t-4.600'), 'Uttoningen saknar tidsuttryck.');
  assert(parseNoiseFloor('mean_volume: -47.2 dB') === -47.2, 'Brusgolvet analyserades fel.');
  const transition = validateTransitionIn({ type: 'slide-left', duration: 0.6, cut: 4 }, 3.4, 8);
  assert(transition.type === 'slide-left' && transition.duration === 0.6, 'Servern validerade inte övergången.');
  const canvas = validateCanvas({ width: 1081, height: 1921 }, 1920, 1080);
  assert(canvas.width === 1080 && canvas.height === 1920, 'Servern normaliserade inte exportytan till jämna mått.');
}

async function testDeleteUndo() {
  const window = makeWindow();
  window.document.querySelector('#add-text').click();
  window.__test.removeSelectedClip();
  window.__test.undoEdit();
  assert(window.__test.state.clips.length === 1, 'Delete återställdes inte med ett enda undo.');
}

async function testProjectCancel() {
  const window = makeWindow([false]);
  window.document.querySelector('#add-text').click();
  const projectInput = window.document.querySelector('#project-input');
  projectInput.files = [{
    text: async () => JSON.stringify({
      canvas: { width: 1920, height: 1080 },
      playhead: 0,
      clips: [{
        kind: 'text',
        name: 'IMPORTERAD',
        start: 0,
        trimStart: 0,
        trimEnd: 2,
        mediaDuration: 100,
        trackIndex: 0,
        text: { text: 'importerad' }
      }]
    })
  }];
  await window.__test.loadProject();
  assert(window.__test.state.clips[0]?.name !== 'IMPORTERAD', 'Avbryt ersatte ändå det öppna projektet.');
  assert(projectInput.value === '', 'Projektfilens input återställdes inte efter Avbryt.');
}

async function testDelayedAutoSplitPersistence() {
  const delayedFetch = async (url, options = {}) => {
    if (url === '/api/status') return response({ ffmpeg: true, nvenc: false });
    if (url === '/api/media' && options.method === 'POST') {
      return response({
        id: 'video-1',
        name: 'video.mp4',
        kind: 'video',
        hasVideo: true,
        hasAudio: true,
        width: 640,
        height: 360,
        duration: 2
      });
    }
    if (url.includes('/extract-audio')) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return response({
        id: 'audio-1',
        name: 'audio.m4a',
        kind: 'audio',
        hasAudio: true,
        duration: 2
      });
    }
    return response({});
  };
  const window = makeWindow([], delayedFetch);
  const input = window.document.querySelector('#media-input');
  input.files = [{ name: 'video.mp4' }];
  input.dispatchEvent(new window.Event('change'));
  await new Promise((resolve) => setTimeout(resolve, 750));
  const persisted = JSON.parse(window.localStorage.getItem('videoeditor:editor'));
  assert(window.__test.state.clips.length === 2, 'Ljudsepareringen skapade inte två klipp.');
  assert(persisted.clips.length === 2, 'Det extraherade ljudklippet sparades inte.');
}

async function testMultiClipSplit() {
  const window = makeWindow();
  const clips = [
    {
      id: 'video', name: 'Video', kind: 'video', mediaId: 'video-media', mediaDuration: 8,
      start: 0, trimStart: 0, trimEnd: 6, trackIndex: 0, linkGroupId: 'linked-av'
    },
    {
      id: 'audio', name: 'Ljud', kind: 'audio', mediaId: 'audio-media', mediaDuration: 8,
      start: 0, trimStart: 0, trimEnd: 6, trackIndex: 0, linkGroupId: 'linked-av'
    },
    {
      id: 'text', name: 'Text', kind: 'text', mediaDuration: 100,
      start: 0, trimStart: 0, trimEnd: 4, trackIndex: 0,
      text: { text: 'Delbar text' }
    },
    {
      id: 'outside', name: 'Utanför', kind: 'image', mediaDuration: 100,
      start: 5, trimStart: 0, trimEnd: 3, trackIndex: 1
    }
  ];
  window.__test.state.clips = clips;
  clips.forEach(window.__test.createClipElement);
  window.__test.selectClips(clips.map((clip) => clip.id), 'video');
  window.__test.setPlayhead(2, false);
  window.__test.splitSelectedClip();

  const result = window.__test.state.clips;
  assert(result.length === 7, 'Alla tre markerade klipp vid spelhuvudet delades inte.');
  assert(result.filter((clip) => clip.start === 2).length === 3, 'De högra halvorna fick fel starttid.');
  assert(result.find((clip) => clip.id === 'outside')?.start === 5, 'Markerat klipp utanför spelhuvudet ändrades.');
  const leftVideo = result.find((clip) => clip.id === 'video');
  const leftAudio = result.find((clip) => clip.id === 'audio');
  const rightLinked = result.filter((clip) => clip.start === 2 && (clip.kind === 'video' || clip.kind === 'audio'));
  assert(leftVideo.linkGroupId === leftAudio.linkGroupId, 'De vänstra A/V-halvorna tappade sin länk.');
  assert(
    rightLinked.length === 2 &&
    rightLinked[0].linkGroupId === rightLinked[1].linkGroupId &&
    rightLinked[0].linkGroupId !== leftVideo.linkGroupId,
    'De högra A/V-halvorna fick inte en egen gemensam länk.'
  );
  assert(window.__test.state.selectedIds.size === 3, 'De nya högra halvorna förblev inte markerade.');

  window.__test.undoEdit();
  assert(window.__test.state.clips.length === 4, 'Multidelningen gick inte att ångra i ett steg.');
}

async function testSynchronizedMultiDrag() {
  const window = makeWindow();
  const clips = [
    { id: 'v1', name: 'V1', kind: 'video', mediaId: 'm1', mediaDuration: 10, start: 1, trimStart: 0, trimEnd: 3, trackIndex: 0 },
    { id: 'a1', name: 'A1', kind: 'audio', mediaId: 'm2', mediaDuration: 10, start: 2, trimStart: 0, trimEnd: 3, trackIndex: 0 },
    { id: 't1', name: 'T1', kind: 'text', mediaDuration: 100, start: 3, trimStart: 0, trimEnd: 3, trackIndex: 0, text: { text: 'Text' } }
  ];
  window.__test.state.clips = clips;
  clips.forEach(window.__test.createClipElement);
  window.__test.selectClips(clips.map((clip) => clip.id), 'v1');
  const videoElement = window.document.querySelector('.clip[data-id="v1"]');
  videoElement.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 40 }));
  window.document.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 120 }));
  window.document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
  assert(clips[0].start === 3 && clips[1].start === 4 && clips[2].start === 5, 'Multmarkeringen flyttades inte synkroniserat.');
  assert(window.__test.state.selectedIds.size === 3, 'Multmarkeringen försvann när ett markerat klipp drogs.');
}

async function testTransitions() {
  const window = makeWindow();
  const clips = [
    { id: 'out', name: 'Ut', kind: 'video', mediaId: 'm1', mediaDuration: 10, start: 0, trimStart: 0, trimEnd: 4, trackIndex: 0 },
    { id: 'in', name: 'In', kind: 'video', mediaId: 'm2', mediaDuration: 10, start: 4, trimStart: 0, trimEnd: 4, trackIndex: 0 }
  ];
  window.__test.state.clips = clips;
  clips.forEach(window.__test.createClipElement);
  window.__test.selectClips(['in'], 'in');
  window.__test.applyTransition('slide-left');
  const incoming = window.__test.state.clips.find((clip) => clip.id === 'in');
  assert(Math.abs(incoming.start - 3.4) < 0.001, 'Övergången skapade inget överlapp.');
  assert(incoming.transitionIn?.type === 'slide-left', 'Övergångstypen sparades inte.');
  assert(window.document.querySelector('.clip[data-id="in"] .clip-transition-marker'), 'Tidslinjen saknar övergångsmarkör.');
  window.__test.removeSelectedTransition();
  assert(incoming.start === 4 && !incoming.transitionIn, 'Övergången kunde inte tas bort rent.');
}

async function testCanvasFormatAndVisualScale() {
  const window = makeWindow();
  const format = window.document.querySelector('#canvas-format');
  format.value = '9:16';
  format.dispatchEvent(new window.Event('change'));
  assert(
    window.__test.state.canvas.width === 1080 && window.__test.state.canvas.height === 1920,
    '9:16-formatet uppdaterade inte projektets exportyta.'
  );
  assert(
    window.document.querySelector('#export-frame-label').textContent.includes('1080×1920'),
    'Previewn visar inte exportytans exakta upplösning.'
  );

  const clip = {
    id: 'visual', name: 'Visual', kind: 'video', mediaId: 'media', mediaDuration: 10,
    sourceWidth: 1920, sourceHeight: 1080, start: 0, trimStart: 0, trimEnd: 4,
    trackIndex: 0, crop: { left: 0, right: 0, top: 0, bottom: 0 }, visualScale: 1
  };
  window.__test.state.clips = [clip];
  window.__test.selectClips(['visual'], 'visual');
  const previewWindow = window.document.querySelector('.preview-window');
  Object.defineProperty(previewWindow, 'clientWidth', { configurable: true, value: 360 });
  Object.defineProperty(previewWindow, 'clientHeight', { configurable: true, value: 640 });
  previewWindow.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 640, right: 360, bottom: 640 });
  window.__test.applyVisualLayout(clip, window.document.querySelector('#preview'));
  const handle = window.document.querySelector('#visual-scale-overlay button[data-corner="se"]');
  const downEvent = {
    pointerId: 7, clientX: 280, clientY: 420, currentTarget: handle,
    preventDefault() {}, stopPropagation() {}
  };
  window.__test.startVisualScaleDrag(downEvent);
  window.__test.moveVisualScaleDrag({ pointerId: 7, clientX: 360, clientY: 520, preventDefault() {} });
  window.__test.stopVisualScaleDrag({ pointerId: 7 });
  assert(clip.visualScale > 1, 'Hörndragningen ökade inte bildens skala.');
}

async function testOverlappingAudioPreview() {
  const window = makeWindow();
  const clips = [
    { id: 'a1', mediaId: 'm1', name: 'A1', kind: 'audio', start: 0, trimStart: 0, trimEnd: 2, mediaDuration: 2, trackIndex: 0 },
    { id: 'a2', mediaId: 'm2', name: 'A2', kind: 'audio', start: 0, trimStart: 0, trimEnd: 2, mediaDuration: 2, trackIndex: 1 }
  ];
  window.__test.state.clips = clips;
  clips.forEach(window.__test.createClipElement);
  window.__test.syncPlaybackMedia(0.5);
  assert(window.__test.state.timelineAudioPlayers.size === 2, 'Previewn skapade inte en spelare per överlappande ljudklipp.');
}

(async () => {
  await testServerContracts();
  await testDeleteUndo();
  await testProjectCancel();
  await testDelayedAutoSplitPersistence();
  await testMultiClipSplit();
  await testSynchronizedMultiDrag();
  await testTransitions();
  await testCanvasFormatAndVisualScale();
  await testOverlappingAudioPreview();
  console.log('BUGFIX REGRESSIONS OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
