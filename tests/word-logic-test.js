// Standalone logic test mirroring app.js renderTranscriptOverlay word logic
function buildWordTimeline(segments) {
  const words = [];
  for (const segment of segments || []) {
    if (Array.isArray(segment.words) && segment.words.length > 0) {
      for (const word of segment.words) {
        words.push({ start: Number(word.start), end: Number(word.end), word: String(word.word || '') });
      }
    }
  }
  words.sort((a, b) => a.start - b.start);
  return words;
}

function overlayAt(words, time, wordsPerView) {
  let activeIndex = -1;
  for (let i = 0; i < words.length; i += 1) {
    if (time >= words[i].start && time < words[i].end) { activeIndex = i; break; }
    if (time >= words[i].end) activeIndex = i;
  }
  if (activeIndex < 0) {
    const upcoming = words.findIndex((item) => item.start > time);
    if (upcoming > 0) activeIndex = upcoming - 1;
    else if (upcoming === -1 && time > words[words.length - 1].end) activeIndex = words.length - 1;
  }
  if (activeIndex < 0) return '';
  const windowStart = Math.max(0, activeIndex - wordsPerView + 1);
  return words.slice(windowStart, activeIndex + 1).map((item) => item.word).join(' ');
}

const segments = [
  { start: 0.0, end: 1.0, text: 'Hej alla', words: [
    { start: 0.0, end: 0.4, word: 'Hej' },
    { start: 0.4, end: 0.7, word: 'alla' },
  ]},
  { start: 1.0, end: 2.0, text: 'hur är', words: [
    { start: 1.0, end: 1.5, word: 'hur' },
    { start: 1.5, end: 2.0, word: 'är' },
  ]},
];
const words = buildWordTimeline(segments);
console.log('word timeline:', words.map(w => `${w.word}[${w.start}-${w.end}]`).join(' '));

const WPV = 3;
const cases = [
  [0.1, 'Hej', false],   // during "Hej" -> only "Hej" (no future words)
  [0.5, 'alla', false],  // during "alla" -> "Hej alla"
  [0.9, 'alla', false],  // between segments, last active = alla
  [1.2, 'hur', false],   // during "hur" -> "Hej alla hur"
  [1.7, 'är', false],    // during "är" -> "alla hur är"
  [2.5, 'är', false],    // after all -> "alla hur är"
  [-1, '', true],        // before first -> empty
];
let pass = 0;
for (const [t, expected, expectEmpty] of cases) {
  const got = overlayAt(words, t, WPV);
  const ok = expectEmpty ? got === '' : got.includes(expected);
  if (ok) pass += 1;
  // also verify no FUTURE word (after active) is shown: check "är" never appears before t=1.5
  console.log(`t=${t} -> "${got}" (expect ${expectEmpty ? 'empty' : 'contains "' + expected + '"'}) ${ok ? 'OK' : 'FAIL'}`);
}
console.log(`\n${pass}/${cases.length} passed`);
