(function exposeTimelineModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TimelineModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function createTimelineModel() {
  const VISUAL = new Set(['video', 'image', 'text', 'blur', 'color', 'html']);

  function clipEnd(clip) {
    const start = Number(clip?.start) || 0;
    const duration = Math.max(0, (Number(clip?.trimEnd) || 0) - (Number(clip?.trimStart) || 0));
    return start + duration;
  }

  function overlaps(startA, endA, startB, endB) {
    return startA < endB && startB < endA;
  }

  function firstFreeTrack(clips, kinds, start, end, ignoreId = null) {
    const acceptedKinds = new Set(kinds);
    const relevant = (clips || []).filter((clip) =>
      acceptedKinds.has(clip.kind) && clip.id !== ignoreId
    );
    for (let trackIndex = 0; ; trackIndex += 1) {
      const occupied = relevant.some((clip) =>
        (Number.isFinite(clip.trackIndex) ? clip.trackIndex : 0) === trackIndex &&
        overlaps(start, end, Number(clip.start) || 0, clipEnd(clip))
      );
      if (!occupied) return trackIndex;
    }
  }

  function topActiveVisual(clips, time) {
    let winner = null;
    let winnerTrack = -1;
    for (const clip of clips || []) {
      if (clip.kind !== 'video' && clip.kind !== 'image') continue;
      if (time < clip.start || time >= clipEnd(clip)) continue;
      const track = Number.isFinite(clip.trackIndex) ? clip.trackIndex : 0;
      if (track >= winnerTrack) {
        winner = clip;
        winnerTrack = track;
      }
    }
    return winner;
  }

  function linkedPartner(clips, clip) {
    if (!clip?.linkGroupId) return null;
    return (clips || []).find((candidate) =>
      candidate.id !== clip.id && candidate.linkGroupId === clip.linkGroupId
    ) || null;
  }

  function compactTrackAssignments(clips) {
    const result = (clips || []).map((clip) => ({ ...clip }));
    const visual = result.filter((clip) => VISUAL.has(clip.kind));
    for (let pass = 0; pass < 20; pass += 1) {
      let anyConflict = false;
      for (let ki = 0; ki < visual.length; ki += 1) {
        for (let kj = ki + 1; kj < visual.length; kj += 1) {
          const a = visual[ki], b = visual[kj];
          if (a.id !== b.id && (a.trackIndex || 0) === (b.trackIndex || 0) && overlaps(a.start, clipEnd(a), b.start, clipEnd(b))) {
            b.trackIndex = (b.trackIndex || 0) + 1;
            anyConflict = true;
          }
        }
      }
      if (!anyConflict) break;
    }
    for (const clip of result) {
      if (clip.kind === 'audio') clip.trackIndex = 0;
    }
    return result;
  }

  return { clipEnd, overlaps, firstFreeTrack, topActiveVisual, linkedPartner, compactTrackAssignments };
});
