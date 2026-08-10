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
if (!window.crypto.randomUUID) window.crypto.randomUUID = () => 'id-test';
window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
window.CSS = window.CSS || {};
window.CSS.escape = (value) => value;
window.structuredClone = window.structuredClone || ((value) => JSON.parse(JSON.stringify(value)));
window.alert = (message) => { throw new Error(`Oväntad dialog: ${message}`); };
window.confirm = () => true;
window.prompt = () => 'Mitt första projekt';
window.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ nvenc: true }) });
window.eval(timelineModelJs);
window.eval(`${appJs}\nwindow.__projectNameTest = { state, editorSnapshot };`);

const state = window.__projectNameTest.state;
document.querySelector('#new-project').click();
if (!state.projectName) throw new Error('Nytt projekt fick inget namn.');
const display = document.querySelector('#project-name-display');
if (display.textContent !== state.projectName) throw new Error('Projektnamnet visas inte uppe till höger.');

display.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
const editor = document.querySelector('#project-name-editor');
editor.value = 'Omdöpt projekt';
editor.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
if (state.projectName !== 'Omdöpt projekt' || display.textContent !== 'Omdöpt projekt') {
  throw new Error('Dubbelklick-redigeringen sparade inte projektnamnet.');
}
const snapshot = window.__projectNameTest.editorSnapshot();
if (snapshot.projectName !== 'Omdöpt projekt') throw new Error('Projektnamnet följde inte med i snapshot.');
console.log('PROJECT NAME OK');
