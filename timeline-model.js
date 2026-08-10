(function exposeTimelineModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TimelineModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function createTimelineModel() {
  const VISUAL = new Set(['video', 'image', 'text', 'blur', 'color', 'html']);
  const TIME_EPSILON = 1e-7;

  function clipEnd(clip) {
    const start = Number(clip?.start) || 0;
    const duration = Math.max(0, (Number(clip?.trimEnd) || 0) - (Number(clip?.trimStart) || 0));
    return start + duration;
  }

  function overlaps(startA, endA, startB, endB) {
    return startA < endB - TIME_EPSILON && startB < endA - TIME_EPSILON;
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

  function compactTrackAssignments(clips, liftedIds = [], preserveTrackIndexes = false) {
    const liftedOrder = Array.isArray(liftedIds) ? liftedIds : (liftedIds ? [liftedIds] : []);
    const lifted = new Set(liftedOrder);
    const liftedRank = new Map(liftedOrder.map((id, index) => [id, index]));
    const result = (clips || []).map((clip) => ({ ...clip }));
    const visual = result.filter((clip) => VISUAL.has(clip.kind));
    for (let pass = 0; pass < 20; pass += 1) {
      let anyConflict = false;
      for (let ki = 0; ki < visual.length; ki += 1) {
        for (let kj = ki + 1; kj < visual.length; kj += 1) {
          const a = visual[ki], b = visual[kj];
          if (a.id !== b.id && (a.trackIndex || 0) === (b.trackIndex || 0) && overlaps(a.start, clipEnd(a), b.start, clipEnd(b))) {
            let mover = b;
            const aLifted = lifted.has(a.id);
            const bLifted = lifted.has(b.id);
            if (aLifted && !bLifted) mover = a;
            if (aLifted && bLifted && liftedRank.get(a.id) > liftedRank.get(b.id)) mover = a;
            mover.trackIndex = (mover.trackIndex || 0) + 1;
            anyConflict = true;
          }
        }
      }
      if (!anyConflict) break;
    }
    if (!preserveTrackIndexes) {
      const usedVisualTracks = [...new Set(visual.map((clip) =>
        Number.isFinite(clip.trackIndex) ? clip.trackIndex : 0
      ))].sort((a, b) => a - b);
      const denseTrackIndex = new Map(usedVisualTracks.map((trackIndex, index) => [trackIndex, index]));
      for (const clip of visual) {
        clip.trackIndex = denseTrackIndex.get(Number.isFinite(clip.trackIndex) ? clip.trackIndex : 0) || 0;
      }
    }
    for (const clip of result) {
      if (clip.kind === 'audio') {
        clip.trackIndex = Number.isFinite(clip.trackIndex)
          ? Math.max(0, Math.trunc(clip.trackIndex))
          : 0;
      }
    }
    return result;
  }

  function cloneClip(clip) {
    if (typeof structuredClone === 'function') return structuredClone(clip);
    return JSON.parse(JSON.stringify(clip));
  }

  function sliceClipsToSegment(clips, pointA, pointB) {
    const rangeStart = Math.max(0, Math.min(Number(pointA), Number(pointB)));
    const rangeEnd = Math.max(0, Math.max(Number(pointA), Number(pointB)));
    if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd - rangeStart <= TIME_EPSILON) return null;

    const sliced = [];
    for (const source of clips || []) {
      const sourceStart = Number(source.start) || 0;
      const sourceEnd = clipEnd(source);
      const intersectionStart = Math.max(sourceStart, rangeStart);
      const intersectionEnd = Math.min(sourceEnd, rangeEnd);
      if (intersectionEnd - intersectionStart <= TIME_EPSILON) continue;

      const clip = cloneClip(source);
      const originalTrimStart = Number(source.trimStart) || 0;
      clip.start = intersectionStart - rangeStart;
      clip.trimStart = originalTrimStart + intersectionStart - sourceStart;
      clip.trimEnd = originalTrimStart + intersectionEnd - sourceStart;
      if (clip.transitionIn) {
        const cut = Number(clip.transitionIn.cut);
        const transitionWasTrimmed = intersectionStart > sourceStart + TIME_EPSILON;
        if (!Number.isFinite(cut) || transitionWasTrimmed || cut > intersectionEnd + TIME_EPSILON) {
          delete clip.transitionIn;
        } else {
          clip.transitionIn.cut = cut - rangeStart;
        }
      }
      sliced.push(clip);
    }
    if (!sliced.length) return null;

    const linkCounts = new Map();
    for (const clip of sliced) {
      if (clip.linkGroupId) linkCounts.set(clip.linkGroupId, (linkCounts.get(clip.linkGroupId) || 0) + 1);
    }
    for (const clip of sliced) {
      if (clip.linkGroupId && linkCounts.get(clip.linkGroupId) < 2) delete clip.linkGroupId;
      if (!clip.transitionIn) continue;
      const cut = Number(clip.transitionIn.cut);
      const outgoingIncluded = sliced.some((candidate) =>
        candidate.id !== clip.id && VISUAL.has(candidate.kind) && Math.abs(clipEnd(candidate) - cut) <= TIME_EPSILON
      );
      if (!outgoingIncluded) delete clip.transitionIn;
    }
    return { duration: rangeEnd - rangeStart, clips: sliced };
  }

  function materializeSegmentClips(segment, destination, idFactory) {
    if (!segment || !Array.isArray(segment.clips) || !segment.clips.length || typeof idFactory !== 'function') return [];
    const base = Math.max(0, Number(destination) || 0);
    const copies = segment.clips.map((source) => {
      const clip = cloneClip(source);
      clip.id = idFactory();
      clip.name = `${source.name || 'Klipp'} (kopia)`;
      clip.start = base + (Number(source.start) || 0);
      if (clip.transitionIn && Number.isFinite(Number(clip.transitionIn.cut))) {
        clip.transitionIn.cut = base + Number(clip.transitionIn.cut);
      }
      return clip;
    });
    const groupMap = new Map();
    for (const clip of copies) {
      if (!clip.linkGroupId) continue;
      if (!groupMap.has(clip.linkGroupId)) groupMap.set(clip.linkGroupId, idFactory());
      clip.linkGroupId = groupMap.get(clip.linkGroupId);
    }
    return copies;
  }

  return {
    clipEnd, overlaps, firstFreeTrack, topActiveVisual, linkedPartner, compactTrackAssignments,
    sliceClipsToSegment, materializeSegmentClips
  };
});
