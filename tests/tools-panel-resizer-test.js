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
window.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ffmpeg: true, nvenc: true }) });
window.eval(timelineModelJs);
window.eval(appJs);

const handle = document.querySelector('#tools-panel-resizer');
const panel = document.querySelector('#tools-panel');
handle.hidden = false;
panel.hidden = false;
panel.getBoundingClientRect = () => ({ width: 420 });

handle.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: 500 }));
handle.dispatchEvent(new window.PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 440 }));
handle.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: 440 }));
const widthAfterDrag = document.documentElement.style.getPropertyValue('--desktop-inspector-width');
if (widthAfterDrag !== '480px') throw new Error(`Panelbredden ändrades fel vid dragning: ${widthAfterDrag}`);
if (handle.getAttribute('aria-valuenow') !== '480') throw new Error('Resizerns ARIA-värde uppdaterades inte.');

handle.focus();
handle.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
const widthAfterKeyboard = document.documentElement.style.getPropertyValue('--desktop-inspector-width');
if (widthAfterKeyboard !== '404px') throw new Error(`Tangentbordsjustering fungerade inte: ${widthAfterKeyboard}`);
if (!window.localStorage.getItem('videoeditor:tools-panel-width')) throw new Error('Panelbredden sparades inte.');
console.log('TOOLS PANEL RESIZER OK');
