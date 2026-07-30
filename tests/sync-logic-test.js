// Standalone test mirroring renderTranscriptOverlay with clip-start/trimStart sync translation
function buildWordTimeline(segments) {
  const words = [];
  for (const segment of segments || []) {
    if (Array.isArray(segment.words) && segment.words.length > 0) {
      for (const word of segment.words) words.push({ start: Number(word.start), end: Number(word.end), word: String(word.word || '') });
    }
  }
  words.sort((a, b) => a.start - b.start);
  return words;
}

function renderAt(words, time, transcriptionMediaId, clips, wordsPerView) {
  if (!transcriptionMediaId) return '(no media)';
  let localTime = time;
  const clip = clips.find((c) => c.kind === 'video' && c.mediaId === transcriptionMediaId &&
    time >= c.start && time < c.start + (c.trimEnd - c.trimStart));
  if (clip) localTime = time - clip.start + clip.trimStart;
  else localTime = -1;

  let activeIndex = -1;
  for (let i = 0; i < words.length; i += 1) {
    if (localTime >= words[i].start && localTime < words[i].end) { activeIndex = i; break; }
    if (localTime >= words[i].end) activeIndex = i;
  }
  if (activeIndex < 0) {
    const upcoming = words.findIndex((w) => w.start > localTime);
    if (upcoming > 0) activeIndex = upcoming - 1;
    else if (upcoming === -1 && localTime > words[words.length - 1].end) activeIndex = words.length - 1;
  }
  if (activeIndex < 0) return '';
  const windowStart = Math.max(0, activeIndex - wordsPerView + 1);
  return words.slice(windowStart, activeIndex + 1).map((w) => w.word).join(' ');
}

const segments = [{ start: 0, end: 2, text: 'Hej alla hur', words: [
  { start: 0, end: 0.4, word: 'Hej' },
  { start: 0.4, end: 0.7, word: 'alla' },
  { start: 1.0, end: 1.5, word: 'hur' },
]}];
const words = buildWordTimeline(segments);
const mediaId = 'vid1';
// Video placed at start=3, trimStart=1, trimEnd=3 (duration 2)
const clips = [{ kind: 'video', mediaId, start: 3, trimStart: 1, trimEnd: 3 }];

const WPV = 3;
const cases = [
  [3.0, 'Hej alla hur'], // local=1.0 -> "hur" active, 3-word window shows all 3
  [3.5, 'Hej alla hur'], // local=1.5 -> "hur" still active (>=end), window all 3
  [4.0, 'Hej alla hur'], // local=2.0 -> last active "hur", window all 3
  [2.5, ''],      // before clip -> local -1 -> empty
  [5.0, ''],      // after clip end (3+2=5, not <5) -> local -1 -> empty
];
let pass = 0;
for (const [t, expected] of cases) {
  const got = renderAt(words, t, mediaId, clips, WPV);
  const ok = got === expected;
  if (ok) pass += 1;
  console.log(`playhead=${t} -> "${got}" (expect "${expected}") ${ok ? 'OK' : 'FAIL'}`);
}
console.log(`\n${pass}/${cases.length} passed`);
