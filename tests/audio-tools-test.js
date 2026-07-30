'use strict';

const {
  validateAnalyzeRequest,
  validateAlignRequest,
  validateSearchRequest,
  validateProcessRangeRequest,
  validateMasterRequest,
  parseSilenceEvents,
  parseLoudnormSummary,
  buildProcessFilter,
  buildMasterFilter,
  searchAnalysis
} = require('../audio-tools');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectBadRequest(callback, expectedText) {
  let error = null;
  try { callback(); } catch (caught) { error = caught; }
  assert(error?.status === 400, `Förväntade 400-fel, fick ${error?.status || 'inget fel'}.`);
  assert(error.message.includes(expectedText), `Fel felmeddelande: ${error.message}`);
}

const analyze = validateAnalyzeRequest({
  media_id: 'media-1',
  window_ms: 20,
  detect: ['speech', 'silence', 'clipping', 'loudness']
});
assert(analyze.mediaId === 'media-1' && analyze.windowMs === 20, 'Analysrequest normaliserades fel.');
expectBadRequest(
  () => validateAnalyzeRequest({ audio_path: '../../etc/passwd', detect: ['speech'] }),
  'media_id'
);
expectBadRequest(
  () => validateAnalyzeRequest({ media_id: 'media-1', detect: ['unknown_detector'] }),
  'Okänd detektor'
);

const alignment = validateAlignRequest({
  media_id: 'media-1',
  transcript: 'I dag pratar vi om klimat.',
  language: 'sv'
});
assert(alignment.language === 'sv', 'Språket validerades inte.');
expectBadRequest(
  () => validateAlignRequest({ media_id: 'media-1', transcript: '', language: 'sv' }),
  'transcript'
);

const search = validateSearchRequest({
  analysis_id: 'analysis-1',
  query: { words: ['klimat'], sounds: ['background_noise'], minimum_confidence: 0.75 }
});
assert(search.minimumConfidence === 0.75, 'Sökgränsen normaliserades fel.');

const range = validateProcessRangeRequest({
  media_id: 'media-1',
  start: 10,
  end: 12,
  operations: [{ type: 'noise_reduction', strength: 0.65 }, { type: 'declip' }]
});
assert(range.operations.length === 2, 'Operationerna tappades.');
expectBadRequest(
  () => validateProcessRangeRequest({
    media_id: 'media-1',
    start: 12,
    end: 10,
    operations: [{ type: 'normalize' }]
  }),
  'tidsintervall'
);
expectBadRequest(
  () => validateProcessRangeRequest({
    media_id: 'media-1',
    start: 0,
    end: 1,
    operations: [{ type: 'shell_command' }]
  }),
  'Okänd ljudoperation'
);

const master = validateMasterRequest({
  media_id: 'media-1',
  analysis_id: 'analysis-1',
  preset: 'spoken_podcast',
  settings: { target_lufs: -16, true_peak_limit_db: -1 }
});
assert(master.settings.targetLufs === -16, 'Master-LUFS normaliserades fel.');

const silenceLog = [
  '[silencedetect] silence_start: 1.25',
  '[silencedetect] silence_end: 2.75 | silence_duration: 1.5',
  '[silencedetect] silence_start: 8.5'
].join('\n');
const events = parseSilenceEvents(silenceLog, 10);
assert(events.length === 2 && events[0].start === 1.25 && events[1].end === 10, 'Tystnadsevents parsades fel.');

const loudness = parseLoudnormSummary('noise\\n{"input_i":"-21.40","input_tp":"-0.20","input_lra":"4.10"}');
assert(loudness.integratedLufs === -21.4 && loudness.truePeakDb === -0.2, 'Loudnorm-resultatet parsades fel.');

const processFilter = buildProcessFilter(range.operations);
assert(processFilter.includes('afftdn=') && processFilter.includes('alimiter='), 'Processfiltret saknar valda operationer.');
const masterFilter = buildMasterFilter(master.settings);
assert(masterFilter.includes('loudnorm=I=-16') && masterFilter.includes('TP=-1'), 'Masterfiltret har fel mål.');

const matches = searchAnalysis({
  events: [{ start: 4, end: 5, type: 'background_noise', confidence: 0.9 }],
  words: [{ word: 'klimat', start: 1, end: 1.4, confidence: 0.95 }]
}, search);
assert(matches.length === 2 && matches[0].start === 1, 'Sökningen hittade inte ord och ljudhändelse i tidsordning.');

console.log('AUDIO TOOLS OK');
