const { JSDOM } = require('jsdom');
const dom = new JSDOM(`<!DOCTYPE html><body>
  <div id="preview-window" style="height:400px"></div>
  <div id="text-layer"></div>
</body>`);
const { window } = dom;
const document = window.document;
global.window = window;
global.document = document;

// Replicate the relevant constants/functions from app.js
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function computeBox(text, time, clipStart, duration) {
  const box = document.createElement('div');
  box.style.left = `${text.x * 100}%`;
  box.style.top = `${text.y * 100}%`;
  box.style.fontSize = `${Math.round(text.fontSize * 400)}px`;

  const elapsed = time - clipStart;
  const inAnim = text.animIn;
  const outAnim = text.animOut;
  let opacity = 1;
  let animTransform = '';
  let displayText = text.text;

  if (inAnim && elapsed < inAnim.duration) {
    const progress = inAnim.duration > 0 ? clamp(elapsed / inAnim.duration, 0, 1) : 1;
    const eased = 1 - Math.pow(1 - progress, 2);
    if (inAnim.type === 'fade') opacity = eased;
    else if (inAnim.type === 'slide-left') animTransform = `translateX(${(1 - eased) * -100}%)`;
    else if (inAnim.type === 'slide-right') animTransform = `translateX(${(1 - eased) * 100}%)`;
    else if (inAnim.type === 'slide-up') animTransform = `translateY(${(1 - eased) * -100}%)`;
    else if (inAnim.type === 'slide-down') animTransform = `translateY(${(1 - eased) * 100}%)`;
    else if (inAnim.type === 'scale') animTransform = `scale(${eased})`;
    else if (inAnim.type === 'typewriter') displayText = text.text.slice(0, Math.ceil(eased * text.text.length)) || ' ';
  }
  if (outAnim && elapsed > duration - outAnim.duration) {
    const outProgress = outAnim.duration > 0 ? clamp((elapsed - (duration - outAnim.duration)) / outAnim.duration, 0, 1) : 1;
    const eased = 1 - Math.pow(1 - outProgress, 2);
    if (outAnim.type === 'fade') opacity = 1 - eased;
    else if (outAnim.type === 'slide-left') animTransform = `translateX(${eased * -100}%)`;
    else if (outAnim.type === 'slide-right') animTransform = `translateX(${eased * 100}%)`;
    else if (outAnim.type === 'slide-up') animTransform = `translateY(${eased * -100}%)`;
    else if (outAnim.type === 'slide-down') animTransform = `translateY(${eased * 100}%)`;
    else if (outAnim.type === 'scale') animTransform = `scale(${1 - eased})`;
    else if (outAnim.type === 'typewriter') displayText = text.text.slice(0, Math.ceil((1 - eased) * text.text.length)) || ' ';
  }
  if (opacity < 1 || animTransform) {
    box.style.opacity = String(opacity);
    box.style.transform = `translate(-50%, -50%)${animTransform ? ' ' + animTransform : ''}`;
  } else {
    box.style.opacity = '';
    box.style.transform = '';
  }
  box.textContent = displayText;
  return box;
}

const text = { x: 0.3, y: 0.7, fontSize: 0.08, text: 'Hej världen', animIn: { type: 'slide-left', duration: 1 }, animOut: null };

let fail = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) fail++;
}

// Before animation (elapsed < 0 is not rendered, but at start elapsed=0)
let b = computeBox(text, 0, 0, 4);
check('slide-left @0% keeps center translate', b.style.transform.startsWith('translate(-50%, -50%)'));
check('slide-left @0% has translateX(-100%)', b.style.transform.includes('translateX(-100%)'));
check('slide-left @0% position left=30%', b.style.left === '30%');
check('slide-left @0% position top=70%', b.style.top === '70%');

// Mid animation
b = computeBox(text, 0.5, 0, 4);
check('slide-left @50% keeps center', b.style.transform.startsWith('translate(-50%, -50%)'));
const midMatch = b.style.transform.match(/translateX\((-?[\d.]+)%\)/);
check('slide-left @50% X between -100 and 0', midMatch && parseFloat(midMatch[1]) < 0 && parseFloat(midMatch[1]) > -100);

// End of animation
b = computeBox(text, 1, 0, 4);
check('slide-left @100% no animTransform (cleared)', b.style.transform === '');

// After animation
b = computeBox(text, 2, 0, 4);
check('slide-left after: transform empty', b.style.transform === '');
check('slide-left after: opacity empty', b.style.opacity === '');
check('slide-left after: position stable', b.style.left === '30%' && b.style.top === '70%');

// scale animation
const textScale = { x: 0.5, y: 0.5, fontSize: 0.08, text: 'Hi', animIn: { type: 'scale', duration: 1 }, animOut: null };
b = computeBox(textScale, 0, 0, 4);
check('scale @0% keeps center + scale(0)', b.style.transform.startsWith('translate(-50%, -50%) scale(0)'));
b = computeBox(textScale, 1, 0, 4);
check('scale @100% cleared', b.style.transform === '');

// typewriter
const textTw = { x: 0.5, y: 0.5, fontSize: 0.08, text: 'ABCDE', animIn: { type: 'typewriter', duration: 1 }, animOut: null };
b = computeBox(textTw, 0, 0, 4);
check('typewriter @0% shows space fallback', b.textContent === ' ');
b = computeBox(textTw, 0.5, 0, 4);
check('typewriter @50% shows prefix', b.textContent === 'ABCD');
b = computeBox(textTw, 1, 0, 4);
check('typewriter @100% shows full', b.textContent === 'ABCDE');

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
