const { JSDOM } = require('jsdom');
const dom = new JSDOM(`<!DOCTYPE html><body>
  <div id="preview-window" style="height:400px"></div>
</body>`);
const { window } = dom;
const document = window.document;
global.window = window;
global.document = document;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function computeBox(text, time, clipStart, duration) {
  const box = document.createElement('div');
  box.style.left = `${text.x * 100}%`;
  box.style.top = `${text.y * 100}%`;
  const elapsed = time - clipStart;
  const inAnim = text.animIn;
  const outAnim = text.animOut;
  let opacity = 1;
  let animTransform = '';
  let displayText = text.text;
  if (inAnim && elapsed < inAnim.duration) {
    const progress = inAnim.duration > 0 ? clamp(elapsed / inAnim.duration, 0, 1) : 1;
    const eased = 1 - Math.pow(1 - progress, 2);
    if (inAnim.type === 'slide-left') animTransform = `translateX(${(1 - eased) * -100}%)`;
    else if (inAnim.type === 'scale') animTransform = `scale(${eased})`;
  }
  if (opacity < 1 || animTransform || (text.scaleX && text.scaleX !== 1)) {
    box.style.opacity = String(opacity);
    const base = `translate(-50%, -50%)`;
    const scale = (text.scaleX && text.scaleX !== 1) ? ` scale(${text.scaleX})` : '';
    box.style.transform = `${base}${scale}${animTransform ? ' ' + animTransform : ''}`;
  } else {
    box.style.transform = '';
  }
  return box;
}

let fail = 0;
const check = (n, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) fail++; };

const t = { x: 0.5, y: 0.5, text: 'Hi', scaleX: 2, animIn: null, animOut: null };
let b = computeBox(t, 0, 0, 4);
check('scaleX=2 includes center + scale(2)', b.style.transform === 'translate(-50%, -50%) scale(2)');

const t1 = { x: 0.5, y: 0.5, text: 'Hi', scaleX: 1, animIn: null, animOut: null };
b = computeBox(t1, 0, 0, 4);
check('scaleX=1 clears transform', b.style.transform === '');

const t2 = { x: 0.5, y: 0.5, text: 'Hi', scaleX: 2, animIn: { type: 'slide-left', duration: 1 }, animOut: null };
b = computeBox(t2, 0, 0, 4);
check('scaleX + slide-left composes', b.style.transform === 'translate(-50%, -50%) scale(2) translateX(-100%)');

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
