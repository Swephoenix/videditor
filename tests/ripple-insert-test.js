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
if (!window.crypto.randomUUID) {
  let id = 0;
  window.crypto.randomUUID = () => `id-${++id}`;
}
window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
window.CSS = window.CSS || {};
window.CSS.escape = (value) => value;
window.structuredClone = window.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));
window.alert = (message) => { throw new Error(`Oväntad dialog: ${message}`); };
window.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ nvenc: true }) });
window.eval(timelineModelJs);
window.eval(`${appJs}\nwindow.__rippleTest = { state, addMediaClip, pasteClipboard, confirmTrackPlacement, editorHistory, setPlayhead };`);

const { state, addMediaClip, pasteClipboard, confirmTrackPlacement, editorHistory, setPlayhead } = window.__rippleTest;
state.clips = [{ id: 'existing', name: 'Befintlig', kind: 'video', mediaId: 'old', mediaDuration: 20, start: 2, trimStart: 0, trimEnd: 4, trackIndex: 0 }];
setPlayhead(2);
addMediaClip({ id: 'new', name: 'Ny', kind: 'video', hasVideo: true, hasAudio: false, width: 1280, height: 720, duration: 2 }, { insertAtPlayhead: true });
const imported = state.clips.find((clip) => clip.mediaId === 'new');
const shifted = state.clips.find((clip) => clip.id === 'existing');
if (imported.start !== 2 || shifted.start !== 4) throw new Error(`Importen gjorde ingen ripple-insättning: ${JSON.stringify(state.clips)}`);

state.clips = [{ id: 'later', name: 'Senare', kind: 'video', mediaId: 'later', mediaDuration: 20, start: 6, trimStart: 0, trimEnd: 3, trackIndex: 0 }];
state.selectedIds = new Set();
editorHistory.clipboard = {
  type: 'segment',
  duration: 2,
  clips: [{ id: 'copy-source', name: 'Kopia', kind: 'video', mediaId: 'copy', mediaDuration: 10, start: 0, trimStart: 0, trimEnd: 2, trackIndex: 0 }]
};
setPlayhead(2);
pasteClipboard();
confirmTrackPlacement();
const pasted = state.clips.find((clip) => clip.mediaId === 'copy');
const shiftedPaste = state.clips.find((clip) => clip.id === 'later');
if (pasted.start !== 2 || shiftedPaste.start !== 6) throw new Error(`Klistra in flyttade ett klipp utan överlapp: ${JSON.stringify(state.clips)}`);
console.log('RIPPLE INSERT OK');
