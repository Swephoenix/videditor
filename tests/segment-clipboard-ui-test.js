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
window.alert = (message) => { throw new Error(`Oväntad dialog: ${message}`); };
window.fetch = async () => ({
  ok: true, status: 200, headers: { get: () => 'application/json' },
  json: async () => ({ ffmpeg: true, nvenc: false })
});

window.eval(timelineModelJs);
window.eval(`${appJs}\nwindow.__segmentTest = { state, editorHistory, createClipElement, setPlayhead, undoEdit, confirmTrackPlacement };`);

const clips = [
  { id: 'video', name: 'Video', kind: 'video', mediaId: 'v1', mediaDuration: 10, start: 1, trimStart: 0, trimEnd: 8, trackIndex: 0, linkGroupId: 'av' },
  { id: 'audio', name: 'Ljud', kind: 'audio', mediaId: 'a1', mediaDuration: 10, start: 1, trimStart: 0, trimEnd: 8, trackIndex: 0, linkGroupId: 'av' },
  { id: 'logo', name: 'Logga', kind: 'image', mediaId: 'i1', mediaDuration: 10, sourceWidth: 200, sourceHeight: 100, start: 4, trimStart: 0, trimEnd: 2, trackIndex: 1 }
];
window.__segmentTest.state.clips = clips;
clips.forEach(window.__segmentTest.createClipElement);

const timeline = document.querySelector('#timeline-tracks');
timeline.getBoundingClientRect = () => ({ left: 0, top: 0, right: 4000, bottom: 400, width: 4000, height: 400 });
const ruler = document.querySelector('#ruler');
const rulerLabels = [...ruler.querySelectorAll('span')].map((label) => label.textContent);
if (!rulerLabels.length || !rulerLabels.every((label) => /^\d{2}:\d{2}:\d{2}:\d{2}$/.test(label))) {
  throw new Error(`Tidslinjens linjal använder inte HH:MM:SS:FF: ${rulerLabels.slice(0, 3).join(', ')}`);
}

document.querySelector('#qt-segment-copy').click();
if (document.querySelector('#segment-copy-popover').hidden) throw new Error('Segmentverktyget öppnade inte markeringspanelen.');
if (document.querySelector('#qt-segment-copy').getAttribute('aria-pressed') !== 'true') throw new Error('Segmentverktyget visar inte aktivt läge.');

document.querySelector('#new-segment-button').click();
ruler.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 120, clientY: 10 }));
ruler.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 240, clientY: 10 }));
const copyButton = document.querySelector('#copy-segment');
if (copyButton.disabled) throw new Error('Kopiera aktiverades inte efter två giltiga punkter.');
if (document.querySelector('#segment-selection').hidden) throw new Error('Segmentmarkeringen syns inte i tidslinjen.');

copyButton.click();
const clipboard = document.querySelector('#program-clipboard');
if (clipboard.hidden) throw new Error('Programurklippet visas inte uppe till höger efter kopiering.');
if (!document.querySelector('#program-clipboard-summary').textContent.includes('3 klipp')) throw new Error('Urklippet visar fel antal klipp.');

window.__segmentTest.setPlayhead(12, false);
document.querySelector('#paste-program-clipboard').click();
window.__segmentTest.confirmTrackPlacement();
const pasted = window.__segmentTest.state.clips.filter((clip) => !['video', 'audio', 'logo'].includes(clip.id));
if (pasted.length !== 3) throw new Error(`Segmentinklistring skapade ${pasted.length} i stället för 3 klipp.`);
if (Math.min(...pasted.map((clip) => clip.start)) !== 12 || Math.max(...pasted.map((clip) => clip.start)) !== 13) {
  throw new Error('Segmentets relativa timing bevarades inte vid inklistring.');
}
if (window.__segmentTest.state.selectedIds.size !== 3) throw new Error('De inklistrade klippen markerades inte tillsammans.');

window.__segmentTest.undoEdit();
if (window.__segmentTest.state.clips.length !== 3) throw new Error('Segmentinklistringen gick inte att ångra i ett steg.');

window.__segmentTest.setPlayhead(3, false);
document.querySelector('#paste-program-clipboard').click();
window.__segmentTest.confirmTrackPlacement();
const originalsAfterCollision = new Map(
  window.__segmentTest.state.clips.filter((clip) => ['video', 'audio', 'logo'].includes(clip.id)).map((clip) => [clip.id, clip])
);
const collisionCopies = window.__segmentTest.state.clips.filter((clip) => !originalsAfterCollision.has(clip.id));
if (originalsAfterCollision.get('video').trackIndex !== 0 || originalsAfterCollision.get('logo').trackIndex !== 1 ||
    originalsAfterCollision.get('video').start !== 1 || originalsAfterCollision.get('logo').start !== 4) {
  throw new Error('Standardspåret för inklistring flyttade originalklippen oväntat.');
}
if (!collisionCopies.filter((clip) => clip.kind !== 'audio').every((clip) => clip.trackIndex <= 3)) {
  throw new Error('Ripple-inklistring placerade kopiorna på oväntade lager.');
}

console.log('SEGMENT CLIPBOARD UI OK');
