const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { installDomStubs } = require('./jsdom-helpers');

const ROOT = '/mnt/games/home-relocated/Downloads/videditor';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const timelineModelJs = fs.readFileSync(path.join(ROOT, 'timeline-model.js'), 'utf8');

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;
installDomStubs(window);

window.crypto = window.crypto || {};
if (!window.crypto.randomUUID) window.crypto.randomUUID = () => 'id-' + Math.random().toString(36).slice(2);
window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
window.CSS = window.CSS || {}; window.CSS.escape = (s) => s;
window.alert = (m) => { throw new Error('ALERT: ' + m); };
if (!window.structuredClone) window.structuredClone = (v) => JSON.parse(JSON.stringify(v));
Object.defineProperty(window.HTMLInputElement.prototype, 'files', {
  configurable: true,
  get() { return this._files || null; },
  set(v) { this._files = v; }
});

const makeResponse = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => body
});
window.fetch = async (url, opts) => {
  if (url === '/api/status') return makeResponse({ ffmpeg: true, nvenc: true, version: '0.5.0' });
  if (url === '/api/media' && opts && opts.method === 'POST') {
    return makeResponse({ id: 'v1', name: 'v.mp4', kind: 'video', hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 10 });
  }
  return makeResponse({});
};

try { window.eval(timelineModelJs); window.eval(appJs); } catch (e) { console.log('SCRIPT ERROR:', e.message, e.stack); process.exit(1); }

function scrubTo(seconds) {
  const timeline = document.querySelector('#timeline-tracks');
  const x = seconds * 40;
  const rect = { left: 0, top: 0, width: 4000, height: 200, bottom: 200, right: 4000 };
  timeline.getBoundingClientRect = () => rect;
  timeline.dispatchEvent(new window.MouseEvent('mousedown', { clientX: x, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: x, clientY: 10, bubbles: true }));
  document.dispatchEvent(new window.MouseEvent('mouseup', { clientX: x, clientY: 10, bubbles: true }));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

setTimeout(() => {
  (async () => {
    try {
      scrubTo(2);
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'f', bubbles: true }));
      const modal = document.querySelector('#flag-edit-modal');
      console.log('Modal öppen:', !modal.hidden, '| tid:', document.querySelector('#flag-edit-time').textContent);
      if (modal.hidden) throw new Error('Flag-modal öppnades inte.');
      if (document.querySelector('#flag-edit-time').textContent !== '00:02.000') throw new Error('Fel flaggtid.');
      document.querySelector('#flag-edit-note').value = 'Första flaggan';
      document.querySelector('#save-flag').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await wait(60);

      scrubTo(7);
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'f', bubbles: true }));
      document.querySelector('#close-flag-edit').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await wait(60);

      let markers = document.querySelectorAll('.flag-marker');
      console.log('Markeringar:', markers.length, '(expect 2)');
      if (markers.length !== 2) throw new Error('Flaggor renderades inte.');
      if (!markers[0].title.includes('Första flaggan')) throw new Error('Anteckning saknas i tooltip.');

      scrubTo(0);
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: ']', bubbles: true }));
      console.log('Efter ] :', document.querySelector('#timecode').textContent, '(expect 00:02.000)');
      if (document.querySelector('#timecode').textContent !== '00:02.000') throw new Error('Hopp till nästa flagga misslyckades.');
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: ']', bubbles: true }));
      console.log('Efter andra ] :', document.querySelector('#timecode').textContent, '(expect 00:07.000)');
      if (document.querySelector('#timecode').textContent !== '00:07.000') throw new Error('Hopp till andra flaggan misslyckades.');
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: '[', bubbles: true }));
      console.log('Efter [ :', document.querySelector('#timecode').textContent, '(expect 00:02.000)');
      if (document.querySelector('#timecode').textContent !== '00:02.000') throw new Error('Hopp till föregående flagga misslyckades.');

      scrubTo(4);
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'f', bubbles: true }));
      await wait(60);
      markers = document.querySelectorAll('.flag-marker');
      console.log('Efter F-knapp:', markers.length, '(expect 3)');
      if (markers.length !== 3) throw new Error('F-knappen skapade inte flagga.');

      document.querySelector('#flag-edit-note').value = 'Tredje';
      document.querySelector('#save-flag').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await wait(400);

      const saved = JSON.parse(window.localStorage.getItem('videoeditor:editor') || '{}');
      console.log('Sparade flaggor:', (saved.flags || []).length, '(expect 3)');
      if ((saved.flags || []).length !== 3) throw new Error('Flaggor sparades inte i projektet.');

      // Regression: layout – flag-label ska matcha flag-lane-höjden.
      const htmlSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      if (!htmlSource.includes('class="flag-label"')) throw new Error('Flag-etikettraden saknas i label-kolumnen.');
      console.log('Flag-label-rad finns i label-kolumnen: true');

      // Regression: nytt projekt rensar flaggor.
      window.confirm = () => true;
      document.querySelector('#new-project').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await wait(60);
      markers = document.querySelectorAll('.flag-marker');
      console.log('Efter nytt projekt:', markers.length, '(expect 0)');
      if (markers.length !== 0) throw new Error('Flaggorna rensades inte vid nytt projekt.');

      // Högerklick på flagga öppnar redigeraren och Ta bort fungerar.
      scrubTo(2);
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'f', bubbles: true }));
      await wait(60);
      document.querySelector('#flag-edit-note').value = 'Att ta bort';
      document.querySelector('#save-flag').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await wait(60);
      const single = document.querySelector('.flag-marker');
      single.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }));
      await wait(60);
      console.log('Redigeraren öppen via högerklick:', !document.querySelector('#flag-edit-modal').hidden, '(expect true)');
      if (document.querySelector('#flag-edit-modal').hidden) throw new Error('Högerklick öppnade inte redigeraren.');
      document.querySelector('#delete-flag').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await wait(60);
      markers = document.querySelectorAll('.flag-marker');
      console.log('Efter Ta bort via högerklick:', markers.length, '(expect 0)');
      if (markers.length !== 0) throw new Error('Ta bort via högerklick fungerade inte.');

      // Flagg-popover: skapa två flaggor, öppna menyn, sök och hoppa.
      scrubTo(2);
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'f', bubbles: true }));
      await wait(60);
      document.querySelector('#flag-edit-note').value = 'Första sök';
      document.querySelector('#save-flag').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await wait(60);
      scrubTo(5);
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'f', bubbles: true }));
      await wait(60);
      document.querySelector('#flag-edit-note').value = 'Andra anteckning';
      document.querySelector('#save-flag').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await wait(60);

      const popover = document.querySelector('#flag-popover');
      document.querySelector('#qt-flag').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await wait(60);
      console.log('Popover öppen:', !popover.hidden, '(expect true)');
      if (popover.hidden) throw new Error('Flagg-popoveren öppnades inte.');
      let items = [...document.querySelectorAll('.flag-popover-item')];
      console.log('Flagglista:', items.length, '(expect 2)');
      if (items.length !== 2) throw new Error(`Flagglistan visar ${items.length} flaggor.`);

      const search = document.querySelector('#flag-search-input');
      search.value = 'sök';
      search.dispatchEvent(new window.Event('input', { bubbles: true }));
      await wait(60);
      items = [...document.querySelectorAll('.flag-popover-item')];
      console.log('Sök "sök":', items.length, '(expect 1)');
      if (items.length !== 1) throw new Error('Sökningen filtrerade inte flaggorna.');

      items[0].click();
      await wait(60);
      console.log('Hopp till flagga från lista:', document.querySelector('#timecode').textContent, '(expect 00:02.000)');
      if (document.querySelector('#timecode').textContent !== '00:02.000') throw new Error('Klick på flagga i listan hoppade inte dit.');
      console.log('Popover stängd efter klick:', popover.hidden, '(expect true)');
      if (!popover.hidden) throw new Error('Popoveren stängdes inte efter klick.');

      // Nästa-knappen i popoveren hoppar framåt.
      document.querySelector('#qt-flag').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await wait(60);
      document.querySelector('#flag-popover-next').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await wait(60);
      console.log('Efter Nästa i popover:', document.querySelector('#timecode').textContent, '(expect 00:05.000)');
      if (document.querySelector('#timecode').textContent !== '00:05.000') throw new Error('Nästa-knappen i popoveren hoppade fel.');

      // Klick på flaggmarkeringen i tidslinjen hoppar playhead dit (full mussekvens).
      scrubTo(0);
      const marker = document.querySelector('.flag-marker');
      marker.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 200, clientY: 50 }));
      document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true, clientX: 200, clientY: 50 }));
      marker.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await wait(60);
      console.log('Efter klick på flaggmarkering:', document.querySelector('#timecode').textContent, '(expect 00:02.000)');
      if (document.querySelector('#timecode').textContent !== '00:02.000') {
        throw new Error('Klick på flaggmarkeringen hoppade inte till flaggan.');
      }

      // Markera flaggan igen och ta bort med Delete.
      markers = document.querySelectorAll('.flag-marker');
      const deleteTarget = markers[0];
      deleteTarget.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 200, clientY: 50 }));
      document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true, clientX: 200, clientY: 50 }));
      deleteTarget.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await wait(60);
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      await wait(60);
      markers = document.querySelectorAll('.flag-marker');
      console.log('Efter Delete på markerad flagga:', markers.length, '(expect 1)');
      if (markers.length !== 1) throw new Error('Delete tog inte bort den markerade flaggan.');

      // Avmarkera flagga vid klick på tom tidslinje – Delete ska då inte ta bort flagga.
      const remaining = document.querySelector('.flag-marker');
      remaining.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 200, clientY: 50 }));
      document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true, clientX: 200, clientY: 50 }));
      remaining.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await wait(60);
      scrubTo(0);
      await wait(60);
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      await wait(60);
      markers = document.querySelectorAll('.flag-marker');
      console.log('Delete efter avmarkering (klick på tom yta):', markers.length, '(expect 1 – flaggan kvar)');
      if (markers.length !== 1) throw new Error('Delete tog bort flaggan trots avmarkering.');

      console.log('DONE');
      process.exit(0);
    } catch (e) {
      console.log('TEST ERROR:', e.message, e.stack);
      process.exit(1);
    }
  })();
}, 100);
