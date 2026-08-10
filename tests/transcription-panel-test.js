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
window.fetch = async () => ({
  ok: true, status: 200, headers: { get: () => 'application/json' },
  json: async () => ({ ffmpeg: true, nvenc: false })
});
let copiedText = '';
Object.defineProperty(window.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async (value) => { copiedText = value; } }
});

window.eval(timelineModelJs);
window.eval(`${appJs}\nwindow.__transcriptionPanelTest = { state, createClipElement, renderTranscription, selectClip, setPlayhead };`);

const source = {
  id: 'audio-source', name: 'Intervju', kind: 'audio', mediaId: 'audio-1', mediaDuration: 12,
  start: 3, trimStart: 0, trimEnd: 10, trackIndex: 0
};
window.__transcriptionPanelTest.state.clips = [source];
window.__transcriptionPanelTest.state.transcriptionMediaId = 'audio-1';
window.__transcriptionPanelTest.state.transcriptionSegments = [
  { start: 0, end: 2, text: 'Första meningen' },
  { start: 2.5, end: 5, text: 'Andra meningen' }
];
window.__transcriptionPanelTest.createClipElement(source);
window.__transcriptionPanelTest.renderTranscription();

(async () => {
  if (!document.querySelector('#transcription-track').hidden) {
    throw new Error('Transkriptionsspåret finns fortfarande synligt i tidslinjen.');
  }
  if (document.querySelectorAll('.clip.transcription').length !== 0) {
    throw new Error('Transkriptionssegment renderas fortfarande på tidslinjen.');
  }
  window.__transcriptionPanelTest.selectClip('audio-source');
  const panel = document.querySelector('#transcription-tools');
  if (!panel || panel.hidden) throw new Error('Högerpanelen öppnades inte när det transkriberade källklippet markerades.');
  if (!panel.contains(document.querySelector('#transcript-search-input'))) {
    throw new Error('Transkriptionssökningen ligger inte i högerpanelens transkriptionssektion.');
  }
  const quickToggle = document.querySelector('#qt-transcription');
  const panelToggle = document.querySelector('#toggle-transcription');
  const burnTranscription = document.querySelector('#burn-transcription');
  if (!quickToggle?.querySelector('svg use')) {
    throw new Error('SVG-knappen för transkription saknas i verktygsfältet under previewn.');
  }
  quickToggle.click();
  if (!burnTranscription.checked || !quickToggle.classList.contains('active') || !panelToggle.classList.contains('active')) {
    throw new Error('Verktygsfältets transkriptionsknapp synkroniserades inte med högerpanelen.');
  }
  panelToggle.click();
  if (burnTranscription.checked || quickToggle.classList.contains('active') || panelToggle.classList.contains('active')) {
    throw new Error('Högerpanelens transkriptionsknapp synkroniserades inte tillbaka till verktygsfältet.');
  }
  const editor = document.querySelector('#transcription-editor-all');
  if (!editor || !editor.value.includes('[00:00.000–00:02.000] Första meningen') || !editor.value.includes('Andra meningen')) {
    throw new Error('Högerpanelen visar inte hela transkriberingen i ett samlat fält.');
  }
  if (document.querySelectorAll('.transcription-panel-row').length !== 0) throw new Error('Transkriberingen är fortfarande uppdelad i separata fält.');

  window.__transcriptionPanelTest.setPlayhead(3, false);
  const highlightLines = document.querySelectorAll('.transcription-editor-highlight-line');
  if (highlightLines.length !== 2 || !highlightLines[0].classList.contains('active')) {
    throw new Error('Aktuellt transkriptionssegment markeras inte i textfältet.');
  }
  Object.defineProperty(editor, 'clientHeight', { configurable: true, value: 25 });
  editor.scrollTop = 0;
  window.__transcriptionPanelTest.setPlayhead(6, false);
  if (!highlightLines[1].classList.contains('active') || highlightLines[0].classList.contains('active')) {
    throw new Error('Den gula markeringen följer inte playhead till nästa segment.');
  }
  if (editor.scrollTop <= 0) {
    throw new Error('Textfältet scrollar inte automatiskt till det markerade segmentet.');
  }

  editor.value = editor.value.replace('Andra meningen', 'Osparad andra');
  editor.dispatchEvent(new window.Event('input', { bubbles: true }));
  const secondLineOffset = editor.value.indexOf('\n') + 12;
  editor.setSelectionRange(secondLineOffset, secondLineOffset);
  editor.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  if (Math.abs(window.__transcriptionPanelTest.state.playhead - 5.5) > 0.001) {
    throw new Error('Klick i transkriptionstexten flyttade inte playhead till radens starttid.');
  }
  if (!editor.value.includes('Osparad andra')) {
    throw new Error('Klick i texten skrev över osparade transkriptionsändringar.');
  }

  editor.value = '[00:00.500–00:02.750] Manuellt ändrad text\n[00:02.750–00:05.500] Andra ändrad';
  document.querySelector('#save-all-transcription').click();

  const first = window.__transcriptionPanelTest.state.transcriptionSegments[0];
  if (first.start !== 0.5 || first.end !== 2.75 || first.text !== 'Manuellt ändrad text') {
    throw new Error('Manuella tidsstämplar och text sparades inte.');
  }
  if (!Array.isArray(first.words) || first.words.length !== 3) throw new Error('Ord-tiderna byggdes inte om efter manuell redigering.');
  if (!document.querySelector('#transcription-editor-all').value.includes('Manuellt ändrad text')) {
    throw new Error('Högerpanelens transkription uppdaterades inte efter redigering.');
  }

  const second = window.__transcriptionPanelTest.state.transcriptionSegments[1];
  if (second.start !== 2.75 || second.end !== 5.5 || second.text !== 'Andra ändrad') {
    throw new Error('Alla rader i det samlade fältet sparades inte.');
  }

  const combinedEditor = document.querySelector('#transcription-editor-all');
  combinedEditor.value = '[00:06.000–00:04.000] Ogiltig tid\n[00:02.750–00:05.500] Ska inte sparas';
  document.querySelector('#save-all-transcription').click();
  if (first.start !== 0.5 || first.end !== 2.75) throw new Error('Ogiltiga tider skrev över giltig transkriptionsdata.');
  if (second.text !== 'Andra ändrad') throw new Error('En senare rad sparades trots att en annan rad var ogiltig.');
  if (!document.querySelector('#transcription-editor-error').textContent) throw new Error('Ogiltiga tider gav inget synligt felmeddelande.');

  document.querySelector('#copy-all-transcription').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (!copiedText.includes('[00:00.500–00:02.750] Manuellt ändrad text') || !copiedText.includes('Andra ändrad')) {
    throw new Error('Kopiera allt gav inte tidsstämplad transkription.');
  }

  window.__transcriptionPanelTest.selectClip(null);
  if (!document.querySelector('#transcription-tools').hidden) throw new Error('Transkriptionspanelen stängdes inte när källklippet avmarkerades.');

  console.log('TRANSCRIPTION PANEL OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
