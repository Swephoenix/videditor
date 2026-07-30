'use strict';

const { chromium } = require('playwright');

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const media = await fetch('/api/media').then((response) => response.json());
    addMediaClip(media.find((item) => item.kind === 'video'));
  });
  const clipCount = () => page.locator('.clip').count();
  if (await clipCount() !== 1) throw new Error('Testvideon lades inte till.');

  await page.keyboard.press('Control+c');
  await page.evaluate(() => setPlayhead(0.5));
  await page.keyboard.press('Control+v');
  if (await clipCount() !== 2) throw new Error('Ctrl+V skapade ingen kopia.');
  await page.keyboard.press('Control+z');
  if (await clipCount() !== 1) throw new Error('Ctrl+Z ångrade inte klistra in.');
  await page.keyboard.press('Control+y');
  if (await clipCount() !== 2) throw new Error('Ctrl+Y återställde inte klistra in.');

  await page.keyboard.press('Delete');
  if (await clipCount() !== 1) throw new Error('Delete tog inte bort markerat klipp.');
  await page.keyboard.press('Control+z');
  if (await clipCount() !== 2) throw new Error('Delete kunde inte ångras.');
  await page.keyboard.press('Control+d');
  if (await clipCount() !== 3) throw new Error('Ctrl+D duplicerade inte klippet.');
  await page.keyboard.press('Control+z');
  if (await clipCount() !== 2) throw new Error('Duplicering kunde inte ångras.');

  await page.keyboard.press('Control+x');
  if (await clipCount() !== 1) throw new Error('Ctrl+X klippte inte ut klippet.');
  await page.keyboard.press('Control+v');
  if (await clipCount() !== 2) throw new Error('Ctrl+V klistrade inte in ur intern clipboard.');

  await page.evaluate(() => {
    const selected = document.querySelector('.clip.selected');
    setPlayhead(Number.parseFloat(selected.style.left) / 40 + 0.5);
    document.body.focus();
  });
  await page.keyboard.press('s');
  if (await clipCount() !== 3) throw new Error('S delade inte markerat klipp.');
  await page.keyboard.press('Control+z');
  if (await clipCount() !== 2) throw new Error('Split kunde inte ångras.');

  await page.keyboard.press('Space');
  if (await page.locator('#toggle-play use').getAttribute('href') !== '#icon-pause') throw new Error('Space startade inte uppspelningen.');
  await page.keyboard.press('Space');
  if (await page.locator('#toggle-play use').getAttribute('href') !== '#icon-play') throw new Error('Space pausade inte uppspelningen.');
  await page.evaluate(() => { setPlayhead(0.5); document.body.focus(); });
  const beforeArrow = await page.locator('#timecode').textContent();
  await page.keyboard.press('ArrowRight');
  const afterArrow = await page.locator('#timecode').textContent();
  if (beforeArrow === afterArrow) throw new Error('Högerpil flyttade inte playhead.');

  await page.evaluate(() => document.querySelector('#add-blur').click());
  const originalPolygon = await page.locator('.blur-region').evaluate((region) => region.style.clipPath);
  const layer = await page.locator('#blur-layer').boundingBox();
  const handle = await page.locator('.blur-handle[data-point-index="0"]').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(layer.x + layer.width * 0.15, layer.y + layer.height * 0.35, { steps: 4 });
  await page.mouse.up();
  const changedPolygon = await page.locator('.blur-region').evaluate((region) => region.style.clipPath);
  if (changedPolygon === originalPolygon) throw new Error('Blur-punkten flyttades inte.');
  await page.keyboard.press('Control+z');
  const restoredPolygon = await page.locator('.blur-region').evaluate((region) => region.style.clipPath);
  if (restoredPolygon !== originalPolygon) throw new Error('Ctrl+Z återställde inte blur-punkten.');
  await page.keyboard.press('Control+Shift+z');
  const redonePolygon = await page.locator('.blur-region').evaluate((region) => region.style.clipPath);
  if (redonePolygon !== changedPolygon) throw new Error('Ctrl+Shift+Z gjorde inte om blur-punkten.');
  await page.locator('.clip.blur.selected').click();
  await page.keyboard.press('Control+z');
  const afterPlainClickUndo = await page.locator('.blur-region').evaluate((region) => region.style.clipPath);
  if (afterPlainClickUndo !== originalPolygon) throw new Error('Ett vanligt klick skapade ett tomt undo-steg.');

  if (errors.length) throw new Error(`Browserfel: ${errors.join(' | ')}`);
  console.log(JSON.stringify({
    status: 'PASS', shortcuts: ['Delete', 'Ctrl+C/V/X/D', 'Ctrl+Z/Y', 'Ctrl+Shift+Z', 'S', 'Space', 'ArrowRight'],
    clipCount: await clipCount(), originalPolygon, changedPolygon, plainClickUndo: 'PASS'
  }));
  await browser.close();
})().catch(async (error) => {
  console.error(error.stack || error.message);
  if (browser) await browser.close().catch(() => {});
  process.exitCode = 1;
});
