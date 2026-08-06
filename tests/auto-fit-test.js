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
window.fetch = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => ({ ffmpeg: true, nvenc: true })
});

try {
  window.eval(timelineModelJs);
  window.eval(`${appJs}
    window.__test = { state, contentBounds, fitProjectToContent };
  `);
} catch (e) {
  console.log('SCRIPT ERROR:', e.message, e.stack);
  process.exit(1);
}

const { state, contentBounds, fitProjectToContent } = window.__test;

function makeImageClip(id, posX = 0, posY = 0, visualScale = 1, crop = null) {
  return {
    id, kind: 'image', mediaId: 'm' + id, name: 'bild', start: 0, trimStart: 0, trimEnd: 5,
    mediaDuration: 100, sourceWidth: 800, sourceHeight: 600,
    crop: crop || { left: 0, right: 0, top: 0, bottom: 0 },
    visualScale, posX, posY, trackIndex: 0
  };
}

function makeVideoClip(id) {
  return {
    id, kind: 'video', mediaId: 'm' + id, name: 'video', start: 0, trimStart: 0, trimEnd: 5,
    mediaDuration: 10, sourceWidth: 1280, sourceHeight: 720,
    crop: { left: 0, right: 0, top: 0, bottom: 0 },
    visualScale: 1, posX: 0, posY: 0, trackIndex: 0
  };
}

function makeColorClip() {
  return {
    id: 'c1', kind: 'color', name: 'Färg', start: 0, trimStart: 0, trimEnd: 3, trackIndex: 0,
    color: { color: '#ff0000', x: 0.5, y: 0.5, width: 0.5, height: 0.5 }
  };
}

setTimeout(() => {
  try {
    state.canvas = { width: 1920, height: 1080 };

    // 1. Helbildsvideo (1280x720 i 1920x1080) fyller hela ytan -> ingen anpassning.
    state.clips = [makeVideoClip('v1')];
    const fullBounds = contentBounds();
    console.log('Fullcanvas-video bounds:', JSON.stringify(fullBounds), '(expect hela ytan)');
    const noFit = fitProjectToContent();
    console.log('fit med fullcanvas:', noFit, '(expect null)');
    if (!fullBounds || fullBounds.minX !== 0 || fullBounds.maxX !== 1920) throw new Error('Fullcanvas-video beräknades fel.');
    if (noFit !== null) throw new Error('Anpassning kördes trots att innehållet redan fyller ytan.');

    // 2. Bara bilden (800x600) centrerad -> bounds ska bli 240,0,1680,1080.
    state.clips = [makeImageClip('img1')];
    const imgBounds = contentBounds();
    console.log('Bild bounds:', JSON.stringify(imgBounds), '(expect 240,0,1680,1080)');
    if (imgBounds.minX !== 240 || imgBounds.minY !== 0 || imgBounds.maxX !== 1680 || imgBounds.maxY !== 1080) {
      throw new Error(`Bildbounds fel: ${JSON.stringify(imgBounds)}`);
    }
    const fitted = fitProjectToContent();
    console.log('Fit-resultat:', JSON.stringify(fitted.canvas), 'posX=', fitted.clips[0].posX);
    if (fitted.canvas.width !== 1440 || fitted.canvas.height !== 1080) throw new Error('Fit-canvas fel storlek.');
    if (Math.abs(fitted.clips[0].posX) > 1e-9 || Math.abs(fitted.clips[0].posY) > 1e-9) {
      throw new Error(`Bilden fyller inte den anpassade ytan korrekt: posX=${fitted.clips[0].posX} posY=${fitted.clips[0].posY}`);
    }

    // 3. Originalet får inte muteras (djupkopia).
    if (state.clips[0].posX !== 0) throw new Error('fitProjectToContent muterade originalklippet.');

    // 3b. Beskuren bild (crop.left=0.2, top=0.1): synlig region 640x540 -> contain 1280x1080 centrerad vid x=320.
    state.clips = [makeImageClip('imgCrop', 0, 0, 1, { left: 0.2, right: 0, top: 0.1, bottom: 0 })];
    const cropBounds = contentBounds();
    console.log('Beskuren bild bounds:', JSON.stringify(cropBounds), '(expect 320,0,1600,1080)');
    if (cropBounds.minX !== 320 || cropBounds.maxX !== 1600 || cropBounds.minY !== 0) {
      throw new Error(`Crop förskjöt bounds felaktigt: ${JSON.stringify(cropBounds)}`);
    }
    const fittedCrop = fitProjectToContent();
    if (Math.abs(fittedCrop.clips[0].posX) > 1e-9) {
      throw new Error(`Beskuren bild fyller inte ytan: posX=${fittedCrop.clips[0].posX}`);
    }
    if (state.clips[0].crop.left !== 0.2) throw new Error('Crop i state muterades.');

    // 3d. Cirkulärt maskad video (1280x720, storlek 0.5 i 1920x1080): bounds ska bli
    //     cirkelns omslutande fyrkant (1080x1080 centrerad) – inte hela rektangeln.
    state.clips = [{
      id: 'circ1', kind: 'video', mediaId: 'mc', name: 'video', start: 0, trimStart: 0, trimEnd: 5,
      mediaDuration: 10, sourceWidth: 1280, sourceHeight: 720,
      crop: { left: 0, right: 0, top: 0, bottom: 0 },
      visualScale: 1, posX: 0, posY: 0, circular: { size: 0.5 }, trackIndex: 0
    }];
    const circleBounds = contentBounds();
    console.log('Cirkulär video bounds:', JSON.stringify(circleBounds), '(expect 420,0,1500,1080)');
    if (circleBounds.minX !== 420 || circleBounds.maxX !== 1500 || circleBounds.minY !== 0 || circleBounds.maxY !== 1080) {
      throw new Error(`Cirkulär video bounds fel: ${JSON.stringify(circleBounds)}`);
    }
    const circleFit = fitProjectToContent();
    console.log('Cirkulär video fit:', JSON.stringify(circleFit.canvas), '(expect 1080x1080 fyrkant)');
    if (circleFit.canvas.width !== 1080 || circleFit.canvas.height !== 1080) {
      throw new Error(`Cirkulär video fit är inte en fyrkant: ${JSON.stringify(circleFit.canvas)}`);
    }

    // 3e. Förskjuten bild (posX=0.25): synlig högerkant klipps vid canvas-kanten som i exporten.
    state.clips = [makeImageClip('imgOff', 0.25)];
    const offFit = fitProjectToContent();
    console.log('Förskjuten bild fit:', JSON.stringify(offFit.canvas), 'posX=', offFit.clips[0].posX, '(expect 1200 bredd, posX=0.1)');
    if (offFit.canvas.width !== 1200 || offFit.canvas.height !== 1080) throw new Error('Fit-canvas för förskjuten bild fel.');
    if (Math.abs(offFit.clips[0].posX - 0.1) > 1e-9) throw new Error('Förskjuten bild posX fel.');

    // 4. Färgblock följer med till den nya ytan utan att ändra absolut position.
    state.clips = [makeImageClip('img2'), makeColorClip()];
    const fitted2 = fitProjectToContent();
    const color = fitted2.clips.find((c) => c.kind === 'color').color;
    console.log('Färgblock efter fit:', JSON.stringify(color), '(x/y ska förbli 0.5, bredd ~0.667)');
    if (Math.abs(color.x - 0.5) > 1e-9 || Math.abs(color.y - 0.5) > 1e-9) throw new Error('Färgblockets position flyttades fel.');
    if (Math.abs(color.width - 0.5 * 1920 / 1440) > 1e-9) throw new Error('Färgblockets bredd skalades fel.');
    if (state.clips.find((c) => c.kind === 'color').color.width !== 0.5) throw new Error('Färgblocket i state muterades.');

    // 5. Klipp som tryckts delvis utanför ytan: bounds klampar till canvas.
    state.clips = [makeImageClip('img3', 0.5)];
    const offBounds = contentBounds();
    console.log('Förskjuten bild bounds:', JSON.stringify(offBounds), '(expect 1200,0,1920,1080)');
    if (offBounds.minX !== 1200 || offBounds.maxX !== 1920) throw new Error('Klamning mot canvas-kanten fel.');

    console.log('DONE');
    process.exit(0);
  } catch (e) {
    console.log('TEST ERROR:', e.message, e.stack);
    process.exit(1);
  }
}, 100);
