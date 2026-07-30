'use strict';

const { chromium } = require('playwright');

let browser;
(async () => {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await page.click('#qt-blur');
  await page.waitForTimeout(100);

  const initial = await page.evaluate(() => ({
    clipCount: document.querySelectorAll('#blur-track .clip.blur').length,
    toolsVisible: !document.querySelector('#blur-tools').hidden,
    cropHidden: document.querySelector('#crop-tools').hidden,
    regionCount: document.querySelectorAll('#blur-layer .blur-region').length,
    handleCount: document.querySelectorAll('#blur-layer .blur-handle').length,
    preview: document.querySelector('.preview-window').getBoundingClientRect().toJSON(),
    area: document.querySelector('.preview-area').getBoundingClientRect().toJSON()
  }));
  if (initial.clipCount !== 1 || !initial.toolsVisible || !initial.cropHidden ||
      initial.regionCount !== 1 || initial.handleCount !== 4) {
    throw new Error(`Fel initialt blur-läge: ${JSON.stringify(initial)}`);
  }
  if (initial.preview.top < initial.area.top || initial.preview.bottom > initial.area.bottom) {
    throw new Error(`Preview utanför sin yta: ${JSON.stringify(initial)}`);
  }

  const previewBox = await page.locator('#blur-layer').boundingBox();
  const firstHandle = await page.locator('.blur-handle[data-point-index="0"]').boundingBox();
  await page.mouse.move(firstHandle.x + firstHandle.width / 2, firstHandle.y + firstHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(previewBox.x + previewBox.width * 0.15, previewBox.y + previewBox.height * 0.35, { steps: 5 });
  await page.mouse.up();
  await page.locator('.blur-input[data-property="strength"]').fill('30');
  const styled = await page.locator('.blur-region').evaluate((region) => ({
    polygon: region.style.clipPath, radius: region.style.getPropertyValue('--blur-radius'),
    backdrop: getComputedStyle(region).backdropFilter
  }));
  if (!styled.polygon.includes('15% 35%')) throw new Error(`Hörnpunkten flyttades inte fritt: ${styled.polygon}`);
  if (styled.radius !== '30px') throw new Error(`Fel radius: ${styled.radius}`);
  if (!styled.backdrop.includes('blur(30px)')) throw new Error(`Blur saknas i preview: ${styled.backdrop}`);

  await page.evaluate(() => setPlayhead(3.1));
  if (await page.locator('.blur-region').count()) throw new Error('Blur visas efter klippets slut.');
  await page.evaluate(async () => {
    const media = await fetch('/api/media').then((response) => response.json());
    const video = media.find((item) => item.kind === 'video');
    if (!video) throw new Error('Testvideon saknas.');
    addMediaClip(video);
  });
  await page.evaluate(() => setPlayhead(0.2));
  await page.waitForFunction(() => !document.querySelector('#preview').hidden);
  await page.evaluate(() => document.querySelector('#toggle-play').click());
  await page.waitForTimeout(300);
  if (await page.locator('.blur-region').count() !== 1) throw new Error('Blur försvann under uppspelning.');
  const playback = await page.locator('#preview').evaluate((video) => ({ hidden: video.hidden, currentTime: video.currentTime }));
  if (playback.hidden || playback.currentTime <= 0.2) throw new Error(`Videon spelades inte korrekt: ${JSON.stringify(playback)}`);
  await page.evaluate(() => document.querySelector('#toggle-play').click());

  if (errors.length) throw new Error(`Browserfel: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ status: 'PASS', initial, styled, playback }));
  await browser.close();
})().catch((error) => {
  console.error(error.stack || error.message);
  if (browser) browser.close().catch(() => {});
  process.exitCode = 1;
});
