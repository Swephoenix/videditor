'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { execFileSync } = require('child_process');
const {
  jobs,
  renderProject,
  validateBlur,
  validateText
} = require('../server');

const ROOT = path.resolve(__dirname, '..');
const id = `test-${crypto.randomUUID()}`;
const fixtureName = `${id}.mp4`;
const fixturePath = path.join(ROOT, 'uploads', fixtureName);
const outputPath = path.join(ROOT, 'exports', `${id}.mp4`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForJob(job, timeoutMilliseconds = 20000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!['completed', 'failed', 'cancelled'].includes(job.status)) {
    if (Date.now() >= deadline) throw new Error('FFmpeg-exporten tog för lång tid.');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

(async () => {
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=1.2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fixturePath
  ]);

  const media = {
    id: 'fixture',
    storedName: fixtureName,
    width: 320,
    height: 180,
    duration: 1.2,
    hasVideo: true,
    hasAudio: false
  };
  const textClips = [
    {
      media: null, kind: 'text', start: 0, trimStart: 0, trimEnd: 1.2, trackIndex: 0,
      text: validateText({
        text: 'Slide',
        color: '#FFFFFF',
        background: 'none',
        x: 0.5,
        y: 0.3,
        fontSize: 0.1,
        scaleX: 1.1,
        animIn: { type: 'slide-left', duration: 0.3 },
        animOut: { type: 'fade', duration: 0.2 }
      })
    },
    {
      media: null, kind: 'text', start: 0, trimStart: 0, trimEnd: 1.2, trackIndex: 1,
      text: validateText({
        text: 'Skrivs',
        color: '#69F0AE',
        background: '#000000',
        x: 0.5,
        y: 0.55,
        fontSize: 0.08,
        animIn: { type: 'typewriter', duration: 0.7 }
      })
    },
    {
      media: null, kind: 'text', start: 0, trimStart: 0, trimEnd: 1.2, trackIndex: 2,
      text: validateText({
        text: 'Rad avslöjas',
        color: '#F1B211',
        background: 'none',
        x: 0.5,
        y: 0.75,
        fontSize: 0.07,
        wordCycle: true,
        cycleStyle: 'line-reveal',
        cycleSpeed: 2
      })
    }
  ];
  const blur = validateBlur({
    strength: 5,
    boxes: [
      {
        points: [
          { x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 },
          { x: 0.3, y: 0.3 }, { x: 0.1, y: 0.3 }
        ]
      },
      {
        points: [
          { x: 0.6, y: 0.6 }, { x: 0.8, y: 0.6 },
          { x: 0.8, y: 0.8 }, { x: 0.6, y: 0.8 }
        ]
      }
    ]
  });
  const project = {
    format: 'mp4',
    hardware: 'cpu',
    upscale: false,
    canvas: { width: 320, height: 180 },
    duration: 1.2,
    currentDuration: 1.2,
    clips: [
      {
        media,
        kind: 'video',
        start: 0,
        trimStart: 0,
        trimEnd: 0.8,
        crop: { left: 0, right: 0, top: 0, bottom: 0 },
        muted: true,
        trackIndex: 0
      },
      {
        media,
        kind: 'video',
        start: 0.4,
        trimStart: 0.4,
        trimEnd: 1.2,
        crop: { left: 0, right: 0, top: 0, bottom: 0 },
        muted: true,
        trackIndex: 1,
        visualScale: 1.2,
        transitionIn: { type: 'dissolve', duration: 0.4, cut: 0.8 }
      },
      { media: null, kind: 'blur', start: 0, trimStart: 0, trimEnd: 1.2, blur },
      ...textClips
    ]
  };

  const job = { id, format: 'mp4', status: 'queued', progress: 0, createdAt: new Date().toISOString() };
  jobs.set(id, job);
  await renderProject(id, project);
  await waitForJob(job);
  assert(job.status === 'completed', job.error || `Oväntad jobbstatus: ${job.status}`);
  assert((await fsp.stat(outputPath)).size > 1000, 'Exportfilen är tom.');

  const signalOutput = execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-i', outputPath,
    '-vf', 'crop=20:20:0:0,signalstats,metadata=print:file=-',
    '-frames:v', '1', '-f', 'null', '-'
  ], { encoding: 'utf8' });
  const yAverage = Number(signalOutput.match(/lavfi\.signalstats\.YAVG=([\d.]+)/)?.[1]);
  assert(Number.isFinite(yAverage) && yAverage > 25, 'Textlagret gjorde videobilden svart.');
  console.log('EXPORT RENDER OK');
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(async () => {
  jobs.delete(id);
  await Promise.all([
    fsp.unlink(fixturePath).catch(() => {}),
    fsp.unlink(outputPath).catch(() => {})
  ]);
});
