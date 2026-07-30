'use strict';

const { app } = require('../server');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

(async () => {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const manifest = await request(baseUrl, '/api/audio/tools');
    assert(manifest.status === 200, 'Verktygsmanifestet kunde inte hämtas.');
    assert(manifest.body.tools?.length === 5, 'Manifestet beskriver inte fem AI-verktyg.');
    assert(manifest.body.security?.input_reference === 'media_id', 'Manifestet saknar säker mediareferens.');

    const pathAttempt = await request(baseUrl, '/api/audio/analyze', {
      audio_path: '../../etc/passwd',
      detect: ['speech']
    });
    assert(pathAttempt.status === 400 && pathAttempt.body.error.includes('media_id'), 'audio_path avvisades inte säkert.');

    const missingMedia = await request(baseUrl, '/api/audio/analyze', {
      media_id: 'does-not-exist',
      detect: ['speech']
    });
    assert(missingMedia.status === 404, 'Okänt media-ID gav inte 404.');

    const missingAnalysis = await request(baseUrl, '/api/audio/search', {
      analysis_id: 'does-not-exist',
      query: { words: ['klimat'] }
    });
    assert(missingAnalysis.status === 404, 'Okänt analys-ID gav inte 404.');

    console.log('AUDIO API CONTRACT OK');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
