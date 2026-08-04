'use strict';

const timelineModel = window.TimelineModel;
if (!timelineModel) throw new Error('timeline-model.js måste laddas före app.js');

const DEFAULT_PX_PER_SECOND = 40;
const MIN_PX_PER_SECOND = 8;
const MAX_PX_PER_SECOND = 320;
let timelinePixelsPerSecond = DEFAULT_PX_PER_SECOND;
const waveformCache = new Map();
const MIN_CLIP_SECONDS = 0.1;
const MAX_IMAGE_SECONDS = 4 * 60 * 60;
const MIN_TIMELINE_SECONDS = 90;
const MARQUEE_DRAG_THRESHOLD = 4;
const MARQUEE_SCROLL_EDGE = 72;
const MARQUEE_MAX_SCROLL_SPEED = 24;
const state = {
  clips: [], selectedId: null, selectedIds: new Set(), playhead: 0, action: null, nvenc: false, canvas: null,
  playing: false, playbackFrame: null, playbackOrigin: 0, playbackStartedAt: 0, blurDrag: null, textDrag: null,
  currentJobId: null, currentTranscribeJobId: null, transcribingClipId: null, transcriptionMediaId: null, transcriptionSegments: [], transcriptionWords: [],
  transcriptionIndex: new Map(), transcriptSearchResults: [], transcriptSearchCursor: -1,
  visualTrackEls: [], audioTrackEls: [], visualLabelEls: [], audioLabelEls: [], cropActive: false, cropPreview: null,
  noiseProfileId: null, noiseProfileMediaId: null, waveformData: null, waveformDecoding: false,
  timelineAudioPlayers: new Map(), visualScaleDrag: null
};
const editorHistory = {
  undo: [], redo: [], clipboard: null, restoring: false,
  inputEditing: false, inputSnapshot: null, inputRecorded: false
};

const elements = {
  timeline: document.querySelector('#timeline-tracks'),
  timelineTracks: document.querySelector('#timeline-tracks'),
  timelineLabels: document.querySelector('.track-labels'),
  scroll: document.querySelector('#timeline-scroll'),
  playhead: document.querySelector('#playhead'),
  playheadFollow: document.querySelector('#playhead-follow'),
  timelineLinkConnectors: document.querySelector('#timeline-link-connectors'),
  visualTrack: document.querySelector('#visual-track'),
  transcriptionTrack: document.querySelector('#transcription-track'),
  transcriptionLabel: document.querySelector('#transcription-label'),
  audioTrack: document.querySelector('#audio-track'),
  mediaInput: document.querySelector('#media-input'),
  preview: document.querySelector('#preview'),
  imagePreview: document.querySelector('#image-preview'),
  timelineAudio: document.querySelector('#timeline-audio'),
  previewWindow: document.querySelector('.preview-window'),
  exportFrameLabel: document.querySelector('#export-frame-label'),
  canvasFormat: document.querySelector('#canvas-format'),
  customCanvasSize: document.querySelector('#custom-canvas-size'),
  canvasWidth: document.querySelector('#canvas-width'),
  canvasHeight: document.querySelector('#canvas-height'),
  blurLayer: document.querySelector('#blur-layer'),
  htmlLayer: document.querySelector('#html-layer'),
  htmlTools: document.querySelector('#html-tools'),
  htmlCode: document.querySelector('#html-code'),
  htmlInputs: [...document.querySelectorAll('.html-input')],
  htmlRenderInputs: [...document.querySelectorAll('.html-render-input')],
  htmlRenderBg: document.querySelector('.html-render-bg'),
  htmlRenderClip: document.querySelector('#html-render-clip'),
  htmlRenderStatus: document.querySelector('#html-render-status'),
  placeholder: document.querySelector('#preview-placeholder'),
  status: document.querySelector('#status'),
  info: document.querySelector('#selection-info'),
  shortcutHelp: document.querySelector('#shortcut-help'),
  timecode: document.querySelector('#timecode'),
  remove: document.querySelector('#remove'),
  separateAudio: document.querySelector('#separate-audio'),
  togglePlay: document.querySelector('#toggle-play'),
  transport: document.querySelector('.transport-controls'),
  cropTools: document.querySelector('#crop-tools'),
  resetCrop: document.querySelector('#reset-crop'),
  cropOverlay: document.querySelector('#crop-overlay'),
  cropMaskT: document.querySelector('#crop-mask-t'),
  cropMaskB: document.querySelector('#crop-mask-b'),
  cropMaskL: document.querySelector('#crop-mask-l'),
  cropMaskR: document.querySelector('#crop-mask-r'),
  cropPan: document.querySelector('#crop-pan'),
  cropHandles: [...document.querySelectorAll('.crop-handle')],
  visualScaleOverlay: document.querySelector('#visual-scale-overlay'),
  visualScaleHandles: [...document.querySelectorAll('#visual-scale-overlay button')],
  cropDone: document.querySelector('#crop-done'),
  cropCancel: document.querySelector('#crop-cancel'),
  blurTools: document.querySelector('#blur-tools'),
  blurInputs: [...document.querySelectorAll('.blur-input')],
  resetBlur: document.querySelector('#reset-blur'),
  colorTools: document.querySelector('#color-tools'),
  colorInputs: [...document.querySelectorAll('.color-input')],
  toolsPanel: document.querySelector('#tools-panel'),
  textTools: document.querySelector('#text-tools'),
  textPresetButtons: [...document.querySelectorAll('[data-text-preset]')],
  useNvidia: document.querySelector('#use-nvidia'),
  useUpscale: document.querySelector('#use-upscale'),
  exportQuality: document.querySelector('#export-quality'),
  burnTranscription: document.querySelector('#burn-transcription'),
  transcriptWords: document.querySelector('#transcript-words'),
  transcriptOverlay: document.querySelector('#transcript-overlay'),
  transcribe: document.querySelector('#transcribe'),
  clipContextMenu: document.querySelector('#clip-context-menu'),
  separateFromAudio: document.querySelector('#separate-from-audio'),
  transcriptSearchInput: document.querySelector('#transcript-search-input'),
  transcriptSearchPrevious: document.querySelector('#transcript-search-previous'),
  transcriptSearchNext: document.querySelector('#transcript-search-next'),
  transcriptSearchStatus: document.querySelector('#transcript-search-status'),
  transcriptSearchResults: document.querySelector('#transcript-search-results'),
  transcribeModal: document.querySelector('#transcribe-modal'),
  transcribeProgress: document.querySelector('#transcribe-progress'),
  transcribeMessage: document.querySelector('#transcribe-message'),
  cancelTranscribe: document.querySelector('#cancel-transcribe'),
  closeTranscribeModal: document.querySelector('#close-transcribe-modal'),
  modal: document.querySelector('#export-modal'),
  exportTitle: document.querySelector('#export-title'),
  progress: document.querySelector('#export-progress'),
  exportMessage: document.querySelector('#export-message'),
  download: document.querySelector('#download'),
  cancelExport: document.querySelector('#cancel-export'),
  closeModal: document.querySelector('#close-modal'),
  aiEditing: document.querySelector('#ai-editing'),
  aiModal: document.querySelector('#ai-editing-modal'),
  closeAiEditing: document.querySelector('#close-ai-editing'),
  aiChatMessages: document.querySelector('#ai-chat-messages'),
  aiChatForm: document.querySelector('#ai-chat-form'),
  aiChatInput: document.querySelector('#ai-chat-input'),
  sendAiMessage: document.querySelector('#send-ai-message'),
  aiModelStatus: document.querySelector('#ai-model-status'),
  aiChatConnection: document.querySelector('#ai-chat-connection'),
  historyToggle: document.querySelector('#history-toggle'),
  historyPanel: document.querySelector('#history-panel'),
  historyList: document.querySelector('#history-list'),
  projectInput: document.querySelector('#project-input'),
  audioTools: document.querySelector('#audio-tools'),
  audioWaveform: document.querySelector('#audio-waveform'),
  waveformTime: document.querySelector('#waveform-time'),
  noisePrintStart: document.querySelector('#noise-print-start'),
  noisePrintLength: document.querySelector('#noise-print-length'),
  captureNoisePrint: document.querySelector('#capture-noise-print'),
  noisePrintStatus: document.querySelector('#noise-print-status'),
  nrAmount: document.querySelector('#nr-amount'),
  applyNoiseReduction: document.querySelector('#apply-noise-reduction'),
  gateThreshold: document.querySelector('#gate-threshold'),
  gateAttack: document.querySelector('#gate-attack'),
  gateRelease: document.querySelector('#gate-release'),
  applyNoiseGate: document.querySelector('#apply-noise-gate'),
  toggleTranscription: document.querySelector('#toggle-transcription'),
  transitionModal: document.querySelector('#transition-modal'),
  transitionHelp: document.querySelector('#transition-help'),
  transitionDuration: document.querySelector('#transition-duration'),
  transitionDurationValue: document.querySelector('#transition-duration-value'),
  removeTransition: document.querySelector('#remove-transition'),
  linkToggle: document.querySelector('#qt-link')
};

const CANVAS_PRESETS = Object.freeze({
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '21:9': { width: 2560, height: 1080 }
});

document.querySelector('#import-files').addEventListener('click', () => elements.mediaInput.click());
document.querySelector('#new-project').addEventListener('click', newProject);
document.querySelector('#save-project').addEventListener('click', saveProject);
document.querySelector('#load-project').addEventListener('click', () => elements.projectInput.click());
elements.projectInput.addEventListener('change', loadProject);
document.querySelector('#separate-audio').addEventListener('click', separateAudio);
document.querySelector('#add-blur').addEventListener('click', addBlurClip);
document.querySelector('#add-text').addEventListener('click', addTextClip);
document.querySelector('#add-color').addEventListener('click', addColorClip);
document.querySelector('#add-html').addEventListener('click', addHtmlClip);
document.querySelector('#qt-color').addEventListener('click', addColorClip);
document.querySelector('#add-transition').addEventListener('click', openTransitionPicker);
document.querySelector('#qt-transition').addEventListener('click', openTransitionPicker);
elements.linkToggle.addEventListener('click', toggleSelectedLink);
document.querySelector('#close-transition').addEventListener('click', closeTransitionPicker);
elements.canvasFormat.addEventListener('change', applyCanvasFormat);
elements.canvasWidth.addEventListener('change', applyCustomCanvasSize);
elements.canvasHeight.addEventListener('change', applyCustomCanvasSize);
elements.transitionDuration.addEventListener('input', () => {
  elements.transitionDurationValue.value = `${Number(elements.transitionDuration.value).toFixed(1)} s`;
});
document.querySelectorAll('[data-transition]').forEach((button) => {
  button.addEventListener('click', () => applyTransition(button.dataset.transition));
});
elements.removeTransition.addEventListener('click', removeSelectedTransition);
elements.togglePlay.addEventListener('click', togglePlayback);
elements.resetCrop.addEventListener('click', resetSelectedCrop);
elements.blurInputs.forEach((input) => input.addEventListener('input', handleBlurInput));
elements.blurInputs.forEach((input) => input.addEventListener('pointerdown', beginInputEdit));
elements.textPresetButtons.forEach((button) => button.addEventListener('click', () => applyTextPreset(button.dataset.textPreset)));
elements.textTools.addEventListener('input', handleTextInput);
elements.textTools.addEventListener('change', handleTextInput);
elements.htmlTools.addEventListener('input', handleHtmlInput);
elements.htmlTools.addEventListener('change', handleHtmlInput);
elements.htmlTools.addEventListener('input', handleHtmlRenderInput);
elements.htmlTools.addEventListener('change', handleHtmlRenderInput);
elements.htmlRenderClip.addEventListener('click', renderHtmlClipToVideo);
elements.textTools.addEventListener('click', (e) => {
  if (e.target.dataset.action === 'center') centerSelectedText();
});
elements.previewWindow.addEventListener('pointerdown', startTextDrag);
elements.previewWindow.addEventListener('pointermove', moveTextDrag);
elements.previewWindow.addEventListener('pointermove', moveTextScaleDrag);
document.addEventListener('pointerup', stopTextDrag);
document.addEventListener('pointerup', stopTextScaleDrag);
elements.resetBlur.addEventListener('click', resetSelectedBlur);
document.querySelector('#add-blur-box').addEventListener('click', addBlurBox);
elements.blurLayer.addEventListener('pointerdown', startBlurPointDrag);
document.addEventListener('pointermove', moveBlurPoint);
document.addEventListener('pointerup', stopBlurPointDrag);
elements.colorInputs.forEach((input) => input.addEventListener('input', handleColorInput));
elements.colorInputs.forEach((input) => input.addEventListener('pointerdown', beginInputEdit));
document.addEventListener('pointerup', endInputEdit);
elements.previewWindow.addEventListener('pointerdown', startColorBlockResize);
document.addEventListener('pointermove', moveColorBlockResize);
document.addEventListener('pointerup', stopColorBlockResize);
elements.cropHandles.forEach((handle) => handle.addEventListener('pointerdown', startCropDrag));
elements.cropPan.addEventListener('pointerdown', startCropPan);
elements.visualScaleHandles.forEach((handle) => handle.addEventListener('pointerdown', startVisualScaleDrag));
document.addEventListener('pointermove', moveVisualScaleDrag);
document.addEventListener('pointerup', stopVisualScaleDrag);
document.addEventListener('pointermove', moveCropDrag);
document.addEventListener('pointerup', stopCropDrag);
elements.mediaInput.addEventListener('change', () => {
  for (const file of elements.mediaInput.files) {
    uploadMedia(file);
  }
  elements.mediaInput.value = '';
});

const SUPPORTED_TYPES = ['video/', 'audio/', 'image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/tiff', 'image/svg+xml'];

let dragActive = false;
document.addEventListener('dragenter', () => {
  if (!dragActive) { dragActive = true; document.body.classList.add('drag-over'); }
});
document.addEventListener('dragleave', (e) => {
  if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
    dragActive = false; document.body.classList.remove('drag-over');
  }
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragActive = false;
  document.body.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  for (const file of files) {
    if (!SUPPORTED_TYPES.some(t => file.type.startsWith(t))) {
      elements.status.textContent = `${file.name} stöds inte`;
      continue;
    }
    uploadMedia(file);
  }
});
elements.burnTranscription.addEventListener('change', () => {
  elements.toggleTranscription.classList.toggle('active', elements.burnTranscription.checked);
  renderTranscriptOverlay(state.playhead);
});
elements.toggleTranscription.addEventListener('click', () => {
  elements.burnTranscription.checked = !elements.burnTranscription.checked;
  elements.toggleTranscription.classList.toggle('active', elements.burnTranscription.checked);
  renderTranscriptOverlay(state.playhead);
});
elements.transcriptWords.addEventListener('input', () => renderTranscriptOverlay(state.playhead));
document.querySelector('#split').addEventListener('click', splitSelectedClip);
elements.remove.addEventListener('click', removeSelectedClip);
document.querySelector('#qt-blur').addEventListener('click', addBlurClip);
document.querySelector('#qt-text').addEventListener('click', addTextClip);
document.querySelector('#qt-html').addEventListener('click', addHtmlClip);
document.querySelector('#qt-split').addEventListener('click', splitSelectedClip);
document.querySelector('#qt-remove').addEventListener('click', removeSelectedClip);
document.querySelector('#qt-crop').addEventListener('click', toggleCropMode);
elements.cropDone.addEventListener('click', () => {
  if (!state.cropActive) return;
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || (clip.kind !== 'video' && clip.kind !== 'image')) return;
  recordHistory();
  clip.crop = { ...(state.cropPreview || clip.crop || { left: 0, right: 0, top: 0, bottom: 0 }) };
  applyVisualLayout(clip, clip.kind === 'video' ? elements.preview : elements.imagePreview);
  hideCropOverlay();
  state.cropActive = false;
  elements.cropTools.hidden = true;
  refreshPreviewLayout();
});
elements.cropCancel.addEventListener('click', cancelCrop);
document.querySelector('#export').addEventListener('click', () => exportProject('mp4'));
document.querySelector('#export-mp3').addEventListener('click', () => exportProject('mp3'));
document.querySelector('#export-wav').addEventListener('click', () => exportProject('wav'));
document.querySelector('#export-quality').addEventListener('input', () => {
  const v = Number(elements.exportQuality.value);
  const labels = ['', '1 – låg', '2', '3 – standard', '4', '5 – lossless'];
  document.getElementById('quality-label').textContent = labels[v] || String(v);
});
elements.transcribe.addEventListener('click', () => {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  hideClipContextMenu();
  transcribeClip(clip);
});
elements.separateFromAudio.addEventListener('click', () => {
  hideClipContextMenu();
  separateAudioFromVideo();
});
elements.captureNoisePrint.addEventListener('click', captureNoisePrint);
elements.applyNoiseReduction.addEventListener('click', applyNoiseReduction);
elements.applyNoiseGate.addEventListener('click', applyNoiseGate);
[elements.nrAmount, elements.gateThreshold, elements.gateAttack, elements.gateRelease].forEach((slider) => {
  slider.addEventListener('input', () => {
    if (slider === elements.nrAmount) document.querySelector('#nr-amount-value').textContent = slider.value;
    else if (slider === elements.gateThreshold) document.querySelector('#gate-threshold-value').textContent = slider.value;
    else if (slider === elements.gateAttack) document.querySelector('#gate-attack-value').textContent = slider.value;
    else if (slider === elements.gateRelease) document.querySelector('#gate-release-value').textContent = slider.value;
  });
});
[elements.noisePrintStart, elements.noisePrintLength].forEach((input) => {
  input.addEventListener('input', () => {
    const clip = state.clips.find((item) => item.id === state.selectedId);
    if (clip) renderWaveform(clip);
  });
});
let waveformSelectionDrag = null;

elements.audioWaveform.addEventListener('pointerdown', (event) => {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || clip.kind !== 'audio') return;
  const rect = elements.audioWaveform.getBoundingClientRect();
  const frac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const duration = clipDuration(clip);
  const clickTime = frac * duration;
  waveformSelectionDrag = {
    startOffset: clickTime,
    currentOffset: clickTime,
    savedStart: Number(elements.noisePrintStart.value) || 0,
    savedLength: Number(elements.noisePrintLength.value) || 0.3
  };
  elements.audioWaveform.setPointerCapture(event.pointerId);
  elements.noisePrintStart.value = clickTime.toFixed(1);
  elements.noisePrintLength.value = Math.max(0.05, 0.05).toFixed(1);
  renderWaveform(clip);
});

elements.audioWaveform.addEventListener('pointermove', (event) => {
  if (!waveformSelectionDrag) return;
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip) return;
  const rect = elements.audioWaveform.getBoundingClientRect();
  const frac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const duration = clipDuration(clip);
  const currentTime = frac * duration;
  waveformSelectionDrag.currentOffset = currentTime;
  const start = Math.min(waveformSelectionDrag.startOffset, currentTime);
  const end = Math.max(waveformSelectionDrag.startOffset, currentTime);
  elements.noisePrintStart.value = start.toFixed(1);
  elements.noisePrintLength.value = Math.max(0.05, (end - start)).toFixed(1);
  renderWaveform(clip);
});

elements.audioWaveform.addEventListener('pointerup', (event) => {
  if (!waveformSelectionDrag) return;
  const wasDrag = Math.abs(waveformSelectionDrag.currentOffset - waveformSelectionDrag.startOffset) >= 0.05;
  const drag = waveformSelectionDrag;
  waveformSelectionDrag = null;
  if (!wasDrag) {
    elements.noisePrintStart.value = drag.savedStart.toFixed(1);
    elements.noisePrintLength.value = drag.savedLength.toFixed(1);
    const clip = state.clips.find((item) => item.id === state.selectedId);
    if (clip) {
      const rect = elements.audioWaveform.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const t = clip.start + frac * clipDuration(clip);
      setPlayhead(clamp(t, 0, projectEnd()));
    }
  }
});
elements.transcriptSearchInput.addEventListener('input', updateTranscriptSearch);
elements.transcriptSearchInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  moveTranscriptSearchResult(event.shiftKey ? -1 : 1);
});
elements.transcriptSearchPrevious.addEventListener('click', () => moveTranscriptSearchResult(-1));
elements.transcriptSearchNext.addEventListener('click', () => moveTranscriptSearchResult(1));
elements.historyToggle.addEventListener('click', () => {
  elements.historyPanel.hidden = !elements.historyPanel.hidden;
  if (!elements.historyPanel.hidden) renderHistory();
});
document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element) || !e.target.closest('.history-wrap')) elements.historyPanel.hidden = true;
});
window.renderHistory = renderHistory;

function setupMenus() {
  const menus = [...document.querySelectorAll('.menu')];
  const closeAll = (except) => {
    for (const menu of menus) {
      if (menu === except) continue;
      menu.classList.remove('open');
      menu.querySelector('.menu-toggle')?.setAttribute('aria-expanded', 'false');
    }
  };
  for (const menu of menus) {
    const toggle = menu.querySelector('.menu-toggle');
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = !menu.classList.contains('open');
      closeAll(menu);
      menu.classList.toggle('open', willOpen);
      toggle.setAttribute('aria-expanded', String(willOpen));
    });
    menu.addEventListener('click', (event) => {
      event.stopPropagation();
      if (event.target !== toggle && menu.classList.contains('open')) {
        const target = event.target;
        if (target.closest('select') || target.closest('input') || target.closest('label')) return;
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }
  document.addEventListener('click', () => closeAll(null));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeAll(null); });
}
setupMenus();
function hideClipContextMenu() {
  elements.clipContextMenu.hidden = true;
}
elements.timeline.addEventListener('contextmenu', (event) => {
  const clipElement = event.target.closest('.clip[data-id]');
  if (!clipElement) {
    hideClipContextMenu();
    return;
  }
  const clip = state.clips.find((item) => item.id === clipElement.dataset.id);
  if (!clip) return;
  if (clip.kind !== 'audio' && clip.kind !== 'video') {
    hideClipContextMenu();
    return;
  }
  event.preventDefault();
  if (state.playing) stopPlayback();
  selectClip(clip.id);
  const isAudio = clip.kind === 'audio';
  elements.transcribe.hidden = !isAudio;
  elements.separateFromAudio.hidden = isAudio;
  elements.transcribe.disabled = !isAudio;
  elements.transcribe.title = isAudio ? '' : 'Högerklicka på ett ljudklipp för att transkribera.';
  elements.clipContextMenu.hidden = false;
  const menuWidth = elements.clipContextMenu.offsetWidth || 180;
  const menuHeight = elements.clipContextMenu.offsetHeight || 48;
  elements.clipContextMenu.style.left = `${Math.max(4, Math.min(event.clientX, window.innerWidth - menuWidth - 4))}px`;
  elements.clipContextMenu.style.top = `${Math.max(4, Math.min(event.clientY, window.innerHeight - menuHeight - 4))}px`;
  (isAudio ? elements.transcribe : elements.separateFromAudio).focus();
});
document.addEventListener('pointerdown', (event) => {
  if (!(event.target instanceof Element) || !event.target.closest('#clip-context-menu')) hideClipContextMenu();
});
document.querySelector('#cancel-transcribe').addEventListener('click', cancelTranscribeJob);
document.querySelector('#close-transcribe-modal').addEventListener('click', () => {
  state.currentTranscribeJobId = null;
  elements.transcribeModal.hidden = true;
  const clip = state.clips.find(c => c.id === state.transcribingClipId);
  if (clip) setClipTranscribeProgress(clip.id, null);
  state.transcribingClipId = null;
});
document.querySelector('#cancel-export').addEventListener('click', cancelExport);
document.querySelector('#close-modal').addEventListener('click', () => {
  state.currentJobId = null;
  elements.modal.hidden = true;
});

const aiChatHistory = [];
let aiChatPending = false;

async function refreshAiModelStatus() {
  try {
    const status = await api('/api/ai/status');
    elements.aiModelStatus.textContent = status.connected ? 'Ansluten' : 'Ej ansluten';
    elements.aiModelStatus.classList.toggle('connected', status.connected);
    elements.aiChatConnection.textContent = status.connected
      ? `${status.model} · ctx ${Number(status.ctxSize || status.ctx_size || 0).toLocaleString('sv-SE')}`
      : 'Ingen modell med aktiv ctx är laddad via ditt lokala API.';
    return status.connected;
  } catch (error) {
    elements.aiModelStatus.textContent = 'Ej ansluten';
    elements.aiModelStatus.classList.remove('connected');
    elements.aiChatConnection.textContent = error.message;
    return false;
  }
}

function openAiEditing() {
  elements.aiModal.hidden = false;
  refreshAiModelStatus();
  requestAnimationFrame(() => elements.aiChatInput.focus());
}

function closeAiEditing() {
  elements.aiModal.hidden = true;
  elements.aiEditing.focus();
}

function appendAiChatMessage(role, text) {
  const message = document.createElement('article');
  message.className = `ai-message ai-message-${role}`;
  const label = document.createElement('span');
  label.className = 'ai-message-label';
  label.textContent = role === 'user' ? 'Du' : 'AI';
  const body = document.createElement('p');
  body.textContent = text;
  message.append(label, body);
  elements.aiChatMessages.appendChild(message);
  elements.aiChatMessages.scrollTop = elements.aiChatMessages.scrollHeight;
  return message;
}

function selectedAiContext() {
  const selected = state.clips.filter((clip) => state.selectedIds.has(clip.id));
  if (!selected.length) return '';
  const context = selected.map((clip) => ({
    clip_id: clip.id,
    media_id: clip.mediaId || null,
    kind: clip.kind,
    start: clip.start,
    end: clip.start + clipDuration(clip),
    name: clip.name
  }));
  return `\n\nAktuell editorkontext (data, inte instruktion): ${JSON.stringify(context)}`;
}

elements.aiEditing.addEventListener('click', openAiEditing);
elements.closeAiEditing.addEventListener('click', closeAiEditing);
elements.aiModal.addEventListener('mousedown', (event) => {
  if (event.target === elements.aiModal) closeAiEditing();
});
elements.aiChatInput.addEventListener('input', () => {
  elements.sendAiMessage.disabled = aiChatPending || !elements.aiChatInput.value.trim();
});
elements.aiChatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = elements.aiChatInput.value.trim();
  if (!text || aiChatPending) return;
  appendAiChatMessage('user', text);
  aiChatHistory.push({ role: 'user', content: text + selectedAiContext() });
  elements.aiChatInput.value = '';
  aiChatPending = true;
  elements.sendAiMessage.disabled = true;
  elements.aiChatInput.disabled = true;
  const pendingMessage = appendAiChatMessage('assistant', 'Arbetar med den laddade modellen…');
  try {
    const result = await api('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: aiChatHistory })
    });
    pendingMessage.remove();
    const reply = result.reply || 'Modellen gav inget svar.';
    aiChatHistory.push({ role: 'assistant', content: reply });
    appendAiChatMessage('assistant', reply);
    elements.aiModelStatus.textContent = 'Ansluten';
    elements.aiModelStatus.classList.add('connected');
    elements.aiChatConnection.textContent = `${result.model} · ctx ${Number(result.ctx_size || 0).toLocaleString('sv-SE')}`;
  } catch (error) {
    pendingMessage.remove();
    appendAiChatMessage('assistant', `Kunde inte slutföra: ${error.message}`);
  } finally {
    aiChatPending = false;
    elements.aiChatInput.disabled = false;
    elements.sendAiMessage.disabled = true;
    elements.aiChatInput.focus();
  }
});
document.addEventListener('keydown', handleKeyboardShortcut);

function secondsToPixels(seconds) { return seconds * timelinePixelsPerSecond; }
function pixelsToSeconds(pixels) { return Math.max(0, pixels / timelinePixelsPerSecond); }
function clipDuration(clip) { return clip.trimEnd - clip.trimStart; }
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(3).padStart(6, '0')}`;
}

function cloneValue(value) {
  return structuredClone(value);
}

function setClipWaveformLoading(clipId, loading) {
  const element = document.querySelector(`.clip[data-id="${CSS.escape(clipId)}"]`);
  if (!element) return;
  let bar = element.querySelector('.clip-waveform-loading');
  if (loading) {
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'clip-waveform-loading';
      element.appendChild(bar);
    }
  } else {
    if (bar) bar.remove();
  }
}

function setClipTranscribeProgress(clipId, progress) {
  const element = document.querySelector(`.clip[data-id="${CSS.escape(clipId)}"]`);
  if (!element) return;
  let bar = element.querySelector('.clip-transcribe-progress');
  if (progress === null || progress >= 100) {
    if (bar) bar.remove();
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'clip-transcribe-progress';
    const fill = document.createElement('div');
    fill.className = 'fill';
    bar.appendChild(fill);
    element.appendChild(bar);
  }
  bar.querySelector('.fill').style.width = `${Math.min(100, Math.max(0, progress))}%`;
}

function editorSnapshot() {
  return {
    clips: cloneValue(state.clips), selectedId: state.selectedId,
    playhead: state.playhead, canvas: state.canvas ? { ...state.canvas } : null,
    transcriptionMediaId: state.transcriptionMediaId,
    transcriptionSegments: cloneValue(state.transcriptionSegments)
  };
}

function pushHistorySnapshot(snapshot) {
  if (editorHistory.restoring) return;
  const previous = editorHistory.undo.at(-1);
  if (!previous || JSON.stringify(previous) !== JSON.stringify(snapshot)) editorHistory.undo.push(snapshot);
  if (editorHistory.undo.length > 100) editorHistory.undo.shift();
  editorHistory.redo.length = 0;
  if (!elements.historyPanel.hidden) renderHistory();
}

function recordHistory() {
  pushHistorySnapshot(editorSnapshot());
  persist();
}

function describeChange(prev, next) {
  if (!prev) { const n = next?.clips?.length; return `Start (${n} klipp)`; }
  const pc = prev.clips?.length || 0;
  const nc = next.clips?.length || 0;
  if (nc > pc) return `Lade till klipp (${nc} st)`;
  if (nc < pc) return `Tog bort klipp (${nc} st)`;
  const pm = new Map(prev.clips?.map(c => [c.id, c]) || []);
  const nm = new Map(next.clips?.map(c => [c.id, c]) || []);
  for (const [id, c] of pm) {
    const n2 = nm.get(id);
    if (!n2) continue;
    if (JSON.stringify(c.crop) !== JSON.stringify(n2.crop)) return `Ändrade crop`;
    if (JSON.stringify(c.trimStart) !== JSON.stringify(n2.trimStart) || JSON.stringify(c.trimEnd) !== JSON.stringify(n2.trimEnd)) return `Trimmade klipp`;
    if (JSON.stringify(c.blur) !== JSON.stringify(n2.blur)) return `Ändrade blur`;
    if (JSON.stringify(c.color) !== JSON.stringify(n2.color)) return `Ändrade färgblock`;
    if (JSON.stringify(c.text) !== JSON.stringify(n2.text)) return `Ändrade text`;
    if (c.start !== n2.start) return `Flyttade klipp`;
  }
  return `Redigerade`;
}

function renderHistory() {
  if (!elements.historyList) return;
  const list = elements.historyList;
  list.innerHTML = '';
  const all = editorHistory.undo;
  all.forEach((snap, i) => {
    const item = document.createElement('button');
    item.className = 'history-item';
    if (i === all.length - 1) item.classList.add('active');
    const label = describeChange(all[i - 1], snap);
    const time = `#${i + 1}`;
    item.innerHTML = `<span class="h-time">${time}</span><span class="h-label">${label}</span>`;
    item.addEventListener('click', () => {
      const stepsBack = all.length - 1 - i;
      if (stepsBack === 0) return;
      for (let s = 0; s < stepsBack; s++) editorHistory.undo.pop();
      const target = editorHistory.undo.at(-1);
      if (target) {
        restoreEditor(target);
        editorHistory.redo.length = 0;
      }
      persist();
      renderHistory();
      elements.historyPanel.hidden = true;
    });
    list.appendChild(item);
  });
}

const PERSIST_KEY = 'videoeditor:editor';
const HISTORY_KEY = 'videoeditor:history';
let persistTimer = null;
let saveTimer = null;
let saveStatusTimeout = null;
function showSaveIndicator(text) {
  elements.status.textContent = text;
  if (saveStatusTimeout) clearTimeout(saveStatusTimeout);
  saveStatusTimeout = setTimeout(() => {
    const nvenc = state.nvenc;
    elements.status.textContent = nvenc ? 'NVIDIA NVENC redo' : 'CPU-export används';
    elements.status.className = `status ${nvenc ? 'ok' : ''}`;
  }, 2000);
}
async function autoSaveProject() {
  showSaveIndicator('Sparar…');
  persist();
  try {
    await api('/api/project/autosave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editorSnapshot())
    });
    showSaveIndicator('Sparat');
  } catch { /* server unavailable — localStorage save still happened */ }
}
function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify(editorSnapshot()));
      localStorage.setItem(HISTORY_KEY, JSON.stringify({
        undo: editorHistory.undo.slice(-50),
        redo: editorHistory.redo.slice(-50)
      }));
    } catch (error) { /* ignore quota errors */ }
  }, 250);
}
function loadPersisted() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    if (!snapshot || !Array.isArray(snapshot.clips)) return null;
    return snapshot;
  } catch (error) { return null; }
}
function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data?.undo && Array.isArray(data.undo)) editorHistory.undo = data.undo;
    if (data?.redo && Array.isArray(data.redo)) editorHistory.redo = data.redo;
  } catch (error) { /* ignore */ }
}
function clearPersisted() {
  try { localStorage.removeItem(PERSIST_KEY); } catch (error) { /* ignore */ }
  try { localStorage.removeItem(HISTORY_KEY); } catch (error) { /* ignore */ }
}

function cleanEmptyVisualTracks() {
  const used = new Set(state.clips.filter((c) => VISUAL_KINDS.includes(c.kind)).map((c) => c.trackIndex || 0));
  const keep = state.visualTrackEls.map((_, i) => i === 0 || used.has(i));
  const oldToNew = [];
  let newIdx = 0;
  for (let i = 0; i < keep.length; i += 1) {
    if (keep[i]) {
      oldToNew[i] = newIdx;
      newIdx += 1;
    } else {
      state.visualTrackEls[i].remove();
      state.visualLabelEls[i].remove();
    }
  }
  state.visualTrackEls = state.visualTrackEls.filter((_, i) => keep[i]);
  state.visualLabelEls = state.visualLabelEls.filter((_, i) => keep[i]);
  for (const clip of state.clips) {
    if (VISUAL_KINDS.includes(clip.kind)) {
      const old = clip.trackIndex || 0;
      if (oldToNew[old] !== undefined) clip.trackIndex = oldToNew[old];
      else clip.trackIndex = state.visualTrackEls.length - 1;
    }
  }
  for (let i = 0; i < state.visualLabelEls.length; i += 1) {
    state.visualLabelEls[i].textContent = `V${i + 1}`;
  }
}

function clearDynamicTracks() {
  for (let i = state.visualTrackEls.length - 1; i >= 1; i -= 1) {
    state.visualTrackEls[i].remove();
    state.visualLabelEls[i].remove();
  }
  for (let i = state.audioTrackEls.length - 1; i >= 1; i -= 1) {
    state.audioTrackEls[i].remove();
    state.audioLabelEls[i].remove();
  }
  state.visualTrackEls = state.visualTrackEls.slice(0, 1);
  state.visualLabelEls = state.visualLabelEls.slice(0, 1);
  state.audioTrackEls = state.audioTrackEls.slice(0, 1);
  state.audioLabelEls = state.audioLabelEls.slice(0, 1);
}

function restoreEditor(snapshot) {
  if (!snapshot) return;
  if (state.playing) stopPlayback();
  stopTimelineAudioPlayers(true);
  editorHistory.restoring = true;
  state.action = null;
  state.blurDrag = null;
  state.cropActive = false;
  elements.cropTools.hidden = true;
  const restoredClips = Array.isArray(snapshot.clips) ? cloneValue(snapshot.clips) : [];
  restoredClips.forEach(normalizeRestoredClip);
  state.clips = timelineModel.compactTrackAssignments(restoredClips);
  state.transcriptionMediaId = snapshot.transcriptionMediaId || null;
  state.transcriptionSegments = Array.isArray(snapshot.transcriptionSegments) ? cloneValue(snapshot.transcriptionSegments) : [];
  rebuildTranscriptionIndex();
  state.canvas = snapshot.canvas ? { ...snapshot.canvas } : null;
  state.playhead = snapshot.playhead;
  state.selectedId = null;
  state.selectedIds = new Set();
  clearDynamicTracks();
  elements.visualTrack.replaceChildren();
  elements.transcriptionTrack.replaceChildren();
  elements.audioTrack.replaceChildren();
  state.clips.forEach(createClipElement);
  renderTranscription();
  const selectedId = state.clips.some((clip) => clip.id === snapshot.selectedId) ? snapshot.selectedId : null;
  selectClip(selectedId);
  setPlayhead(snapshot.playhead);
  updateTimelineWidth();
  updatePreviewWindowSize();
  syncCanvasControls();
  editorHistory.restoring = false;
}

function undoEdit() {
  const snapshot = editorHistory.undo.pop();
  if (!snapshot) return;
  editorHistory.redo.push(editorSnapshot());
  restoreEditor(snapshot);
  persist();
  if (!elements.historyPanel?.hidden) renderHistory();
}

function redoEdit() {
  const snapshot = editorHistory.redo.pop();
  if (!snapshot) return;
  editorHistory.undo.push(editorSnapshot());
  restoreEditor(snapshot);
  persist();
  if (!elements.historyPanel?.hidden) renderHistory();
}

function beginInputEdit() {
  if (editorHistory.inputEditing) return;
  editorHistory.inputEditing = true;
  editorHistory.inputSnapshot = editorSnapshot();
  editorHistory.inputRecorded = false;
}

function endInputEdit() {
  editorHistory.inputEditing = false;
  editorHistory.inputSnapshot = null;
  editorHistory.inputRecorded = false;
}

function recordInputEdit() {
  if (!editorHistory.inputEditing) {
    recordHistory();
    return;
  }
  if (editorHistory.inputRecorded) return;
  pushHistorySnapshot(editorHistory.inputSnapshot);
  editorHistory.inputRecorded = true;
}

async function api(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw new Error(body?.error || `Serverfel ${response.status}`);
  return body;
}

async function initialize() {
  buildRuler();
  state.visualTrackEls = [elements.visualTrack];
  state.visualLabelEls = [document.querySelector('#visual-label')];
  state.audioTrackEls = [elements.audioTrack];
  state.audioLabelEls = [document.querySelector('#audio-label')];
  const saved = loadPersisted();
  if (saved) restoreEditor(saved);
  syncCanvasControls();
  loadHistory();
  if (editorHistory.undo.length === 0) recordHistory();
  requestAnimationFrame(updatePreviewWindowSize);
  if (saveTimer) clearInterval(saveTimer);
  if (!/jsdom/i.test(navigator.userAgent)) saveTimer = setInterval(autoSaveProject, 30000);
  if (!saved) {
    try {
      const remote = await api('/api/project/autoload');
      if (remote?.clips?.length) {
        restoreEditor(remote);
        warmPreview();
      }
    } catch { /* no remote save */ }
  }
  try {
    const status = await api('/api/status');
    state.nvenc = status.nvenc;
    elements.useNvidia.checked = status.nvenc;
    elements.useNvidia.disabled = !status.nvenc;
    elements.status.textContent = status.nvenc ? 'NVIDIA NVENC redo' : 'NVENC saknas – CPU-export används';
    elements.status.className = `status ${status.nvenc ? 'ok' : 'warning'}`;
  } catch (error) {
    elements.status.textContent = error.message;
    elements.status.className = 'status warning';
  }
}

function buildRuler(duration = MIN_TIMELINE_SECONDS) {
  const ruler = document.querySelector('#ruler');
  const fragment = document.createDocumentFragment();
  for (let second = 0; second <= duration; second += 5) {
    const label = document.createElement('span');
    label.style.left = `${secondsToPixels(second)}px`;
    label.textContent = `${second}s`;
    fragment.appendChild(label);
  }
  ruler.replaceChildren(fragment);
}

function updateTimelineWidth() {
  const contentEnd = Math.max(projectEnd(), state.playhead);
  const duration = Math.max(MIN_TIMELINE_SECONDS, Math.ceil((contentEnd + 5) / 5) * 5);
  const durationChanged = Number(elements.timeline.dataset.duration) !== duration;
  elements.timeline.dataset.duration = String(duration);
  elements.timeline.style.width = `${secondsToPixels(duration)}px`;
  if (durationChanged) buildRuler(duration);
  updatePlayheadFollowIndicator();
}

function updatePlayheadFollowIndicator() {
  const viewportWidth = elements.scroll.clientWidth;
  const contentWidth = elements.scroll.scrollWidth;
  const playheadX = secondsToPixels(state.playhead);
  const visibleRight = elements.scroll.scrollLeft + viewportWidth;
  const scrollRect = elements.scroll.getBoundingClientRect();
  const playheadRect = elements.playhead.getBoundingClientRect();
  const hasLayoutRects = scrollRect.width > 0 && playheadRect.width > 0;
  const isOutsideRight = viewportWidth > 0 && contentWidth > viewportWidth + 1 && (
    hasLayoutRects
      ? playheadRect.left >= scrollRect.right - 1
      : playheadX >= visibleRight
  );
  elements.playheadFollow.hidden = !isOutsideRight;
  elements.playheadFollow.setAttribute('aria-hidden', String(!isOutsideRight));
}

function revealPlayhead() {
  const viewportWidth = elements.scroll.clientWidth;
  const contentWidth = elements.scroll.scrollWidth;
  if (!viewportWidth || contentWidth <= viewportWidth) return;
  const target = clamp(
    secondsToPixels(state.playhead) - viewportWidth * 0.5,
    0,
    contentWidth - viewportWidth
  );
  if (typeof elements.scroll.scrollTo === 'function') {
    elements.scroll.scrollTo({ left: target, behavior: 'smooth' });
  } else {
    elements.scroll.scrollLeft = target;
  }
  updatePlayheadFollowIndicator();
}

function updateTimelineZoom(nextScale, clientX) {
  const previousScale = timelinePixelsPerSecond;
  const scale = clamp(nextScale, MIN_PX_PER_SECOND, MAX_PX_PER_SECOND);
  if (Math.abs(scale - previousScale) < 0.01) return;
  const rect = elements.scroll.getBoundingClientRect();
  const pointerX = clamp(clientX - rect.left, 0, rect.width);
  const pointerTime = (elements.scroll.scrollLeft + pointerX) / previousScale;
  timelinePixelsPerSecond = scale;
  const duration = Number(elements.timeline.dataset.duration) || MIN_TIMELINE_SECONDS;
  elements.timeline.style.width = `${secondsToPixels(duration)}px`;
  buildRuler(duration);
  state.clips.forEach(renderClip);
  renderTranscription();
  elements.playhead.style.left = `${secondsToPixels(state.playhead)}px`;
  elements.scroll.scrollLeft = Math.max(0, secondsToPixels(pointerTime) - pointerX);
}

elements.scroll.addEventListener('wheel', (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.18 : 1 / 1.18;
  updateTimelineZoom(timelinePixelsPerSecond * factor, event.clientX);
}, { passive: false });
elements.scroll.addEventListener('scroll', () => {
  elements.timelineLabels.scrollTop = elements.scroll.scrollTop;
  updatePlayheadFollowIndicator();
  if (state.action?.type === 'marquee' && state.action.active) updateMarqueeSelection();
});
elements.playheadFollow.addEventListener('click', revealPlayhead);
window.addEventListener('resize', updatePlayheadFollowIndicator);

async function uploadFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  await uploadMedia(file);
}

async function uploadMedia(file) {
  const form = new FormData();
  form.append('media', file);
  elements.status.textContent = `Laddar ${file.name}…`;
  try {
    const media = await api('/api/media', { method: 'POST', body: form });
    addMediaClip(media);
    elements.status.textContent = state.nvenc ? 'NVIDIA NVENC redo' : 'Uppladdad – CPU-export används';
  } catch (error) {
    alert(`Uppladdningen misslyckades: ${error.message}`);
    elements.status.textContent = error.message;
  }
}

function addMediaClip(media) {
  recordHistory();
  const kind = media.kind;
  const isVisual = kind !== 'audio';
  if (isVisual && !state.canvas && media.width > 0 && media.height > 0) {
    state.canvas = { width: media.width, height: media.height };
    syncCanvasControls();
    updatePreviewWindowSize();
  }
  const lastEnd = state.clips.filter((clip) => isVisual
    ? (clip.kind === 'video' || clip.kind === 'image')
    : clip.kind === 'audio')
    .reduce((end, clip) => Math.max(end, clip.start + clipDuration(clip)), 0);
  const initialDuration = kind === 'image' ? 5 : media.duration;
  const trackIndex = allocateTrack(kind, lastEnd, lastEnd + initialDuration);
  const clip = {
    id: crypto.randomUUID(), mediaId: media.id, name: media.name, kind,
    mediaDuration: kind === 'image' ? MAX_IMAGE_SECONDS : media.duration,
    sourceWidth: media.width, sourceHeight: media.height,
    start: lastEnd, trimStart: 0, trimEnd: initialDuration,
    crop: { left: 0, right: 0, top: 0, bottom: 0 },
    visualScale: 1,
    trackIndex
  };
  state.clips.push(clip);
  createClipElement(clip);
  selectClip(clip.id);
  setPlayhead(clip.start);
  if (kind === 'video' && media.hasAudio) autoSplitAudio(clip);
  return clip;
}

async function autoSplitAudio(videoClip) {
  const source = videoClip;
  const existingPartner = timelineModel.linkedPartner(state.clips, source);
  if (existingPartner?.kind === 'audio') return existingPartner;
  source.muted = true;
  renderClip(source);
  persist();
  try {
    const audioMedia = await api(`/api/media/${encodeURIComponent(source.mediaId)}/extract-audio`, { method: 'POST' });
    if (!state.clips.some((clip) => clip.id === source.id)) return null;
    const trackIndex = allocateTrack('audio', source.start, source.start + clipDuration(source));
    const linkGroupId = crypto.randomUUID();
    const extractedDuration = audioMedia.duration || source.mediaDuration;
    const audioClip = {
      id: crypto.randomUUID(),
      mediaId: audioMedia.id,
      name: audioMedia.name,
      kind: 'audio',
      mediaDuration: extractedDuration,
      sourceWidth: 0,
      sourceHeight: 0,
      start: source.start,
      trimStart: source.trimStart,
      trimEnd: Math.min(source.trimEnd, extractedDuration),
      crop: { left: 0, right: 0, top: 0, bottom: 0 },
      muted: false,
      trackIndex,
      linkGroupId
    };
    source.linkGroupId = linkGroupId;
    state.clips.push(audioClip);
    renderClip(source);
    createClipElement(audioClip);
    updateTimelineWidth();
    persist();
    return audioClip;
  } catch (error) {
    source.muted = false;
    renderClip(source);
    persist();
    console.warn('Kunde inte dela upp ljud automatiskt:', error.message);
    return null;
  }
}

async function separateAudio() {
  const selected = state.clips.find((clip) => clip.id === state.selectedId);
  if (!selected || selected.kind !== 'video') {
    return alert('Välj ett video-klipp först (klicka på det) för att separera dess ljud.');
  }
  if (!selected.mediaDuration) return alert('Det valda klippet saknar längd.');
  recordHistory();
  try {
    elements.separateAudio.disabled = true;
    elements.separateAudio.textContent = 'Separerar…';
    const audioClip = await autoSplitAudio(selected);
    if (audioClip) selectClip(audioClip.id);
  } catch (error) {
    alert(`Kunde inte separera ljud: ${error.message}`);
  } finally {
    elements.separateAudio.disabled = false;
    elements.separateAudio.textContent = 'Separera ljud';
  }
}

async function separateAudioFromVideo() {
  const selected = state.clips.find((clip) => clip.id === state.selectedId);
  if (!selected || selected.kind !== 'video') {
    return alert('Välj ett video-klipp först för att separera ljudet.');
  }
  if (!selected.mediaDuration) return alert('Det valda klippet saknar längd.');
  recordHistory();
  try {
    elements.separateFromAudio.disabled = true;
    const audioClip = await autoSplitAudio(selected);
    if (!audioClip) return;
    unlinkClipPair(selected, { recordHistory: false });
    selectClip(audioClip.id);
    persist();
  } catch (error) {
    alert(`Kunde inte separera ljud: ${error.message}`);
  } finally {
    elements.separateFromAudio.disabled = false;
  }
}

async function transcribeClip(clip) {
  if (!clip || clip.kind !== 'audio' || !clip.mediaId) {
    return alert('Högerklicka på ett ljudklipp och välj Transkribera.');
  }
  state.transcribingClipId = clip.id;
  setClipTranscribeProgress(clip.id, 0);
  const mediaId = clip.mediaId;
  elements.transcribe.disabled = true;
  elements.transcribeModal.hidden = false;
  elements.transcribeProgress.value = 0;
  elements.transcribeMessage.textContent = 'Förbereder transkriberingen…';
  elements.cancelTranscribe.hidden = false;
  elements.cancelTranscribe.disabled = false;
  try {
    const job = await api(`/api/media/${encodeURIComponent(mediaId)}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'small', language: null })
    });
    state.currentTranscribeJobId = job.id;
    pollTranscribeJob(job.id);
  } catch (error) {
    elements.transcribeMessage.textContent = `Kunde inte starta: ${error.message}`;
    elements.transcribe.disabled = false;
    elements.cancelTranscribe.hidden = true;
  }
}

async function pollTranscribeJob(id) {
  try {
    const job = await api(`/api/transcribe/${encodeURIComponent(id)}`);
    elements.transcribeProgress.value = job.progress || 0;
    elements.transcribeMessage.textContent = job.message || job.status;
    const clip = state.clips.find(c => c.id === state.transcribingClipId);
    if (job.status === 'completed') {
      if (clip) setClipTranscribeProgress(clip.id, null);
      state.transcribingClipId = null;
      state.transcriptionMediaId = job.mediaId;
      state.transcriptionSegments = job.segments || [];
      rebuildTranscriptionIndex();
      renderTranscription();
      persist();
      elements.transcribeMessage.textContent = `Transkribering klar: ${state.transcriptionSegments.length} segment.`;
      elements.transcribe.disabled = false;
      elements.cancelTranscribe.hidden = true;
      return;
    }
    if (job.status === 'failed') {
      if (clip) setClipTranscribeProgress(clip.id, null);
      state.transcribingClipId = null;
      elements.transcribeMessage.textContent = `Transkriberingen misslyckades:\n${job.error}`;
      elements.transcribe.disabled = false;
      elements.cancelTranscribe.hidden = true;
      return;
    }
    if (job.status === 'cancelled') {
      if (clip) setClipTranscribeProgress(clip.id, null);
      state.transcribingClipId = null;
      elements.transcribeMessage.textContent = 'Transkriberingen avbröts.';
      elements.transcribe.disabled = false;
      elements.cancelTranscribe.hidden = true;
      return;
    }
    if (clip) setClipTranscribeProgress(clip.id, job.progress || 0);
    elements.cancelTranscribe.hidden = false;
    elements.cancelTranscribe.disabled = false;
    window.setTimeout(() => pollTranscribeJob(id), 800);
  } catch (error) {
    elements.transcribeMessage.textContent = `Kunde inte läsa status: ${error.message}`;
    elements.transcribe.disabled = false;
  }
}

async function cancelTranscribeJob() {
  const id = state.currentTranscribeJobId;
  if (!id) return;
  elements.cancelTranscribe.disabled = true;
  elements.transcribeMessage.textContent = 'Avbryter…';
  try {
    await api(`/api/transcribe/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  } catch (error) {
    elements.transcribeMessage.textContent = `Kunde inte avbryta: ${error.message}`;
  }
}

function renderTranscription() {
  const rendered = [];
  const sourceClips = state.clips.filter((clip) =>
    (clip.kind === 'video' || clip.kind === 'audio') && clip.mediaId === state.transcriptionMediaId
  );
  for (const clip of sourceClips) {
    state.transcriptionSegments.forEach((segment, segmentIndex) => {
      const sourceStart = Math.max(Number(segment.start) || 0, clip.trimStart);
      const sourceEnd = Math.min(Number(segment.end) || sourceStart, clip.trimEnd);
      if (sourceEnd <= sourceStart) return;
      const timelineStart = clip.start + sourceStart - clip.trimStart;
      const timelineEnd = clip.start + sourceEnd - clip.trimStart;
      const element = document.createElement('div');
      element.className = 'clip transcription';
      element.dataset.segmentIndex = String(segmentIndex);
      element.dataset.sourceClipId = clip.id;
      element.dataset.timelineStart = String(timelineStart);
      const timecode = document.createElement('span');
      timecode.className = 'transcription-time';
      timecode.textContent = formatTime(timelineStart);
      const text = document.createElement('span');
      text.className = 'transcription-text';
      text.textContent = (segment.text || '').trim() || '(tomt)';
      element.append(timecode, text);
      element.style.left = `${secondsToPixels(timelineStart)}px`;
      element.style.width = `${Math.max(8, secondsToPixels(Math.max(0.1, timelineEnd - timelineStart)))}px`;
      element.title = `${formatTime(timelineStart)}–${formatTime(timelineEnd)}\n${(segment.text || '').trim()}`;
      element.addEventListener('dblclick', () => setPlayhead(timelineStart));
      rendered.push(element);
    });
  }
  elements.transcriptionTrack.replaceChildren(...rendered);
  updateTranscriptSearch();
  updateTimelineWidth();
}

function normalizeSearchWord(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('sv-SE');
}

function tokenizeTranscript(value) {
  return normalizeSearchWord(value).match(/[\p{L}\p{N}]+/gu) || [];
}

function rebuildTranscriptionIndex() {
  state.transcriptionWords = buildWordTimeline(state.transcriptionSegments);
  state.transcriptionIndex = new Map();
  state.transcriptionSegments.forEach((segment, segmentIndex) => {
    const timedWords = Array.isArray(segment.words) && segment.words.length > 0
      ? segment.words.flatMap((word) => tokenizeTranscript(word.word).map((token) => ({ token, start: Number(word.start) })))
      : tokenizeTranscript(segment.text).map((token) => ({ token, start: Number(segment.start) || 0 }));
    for (const { token, start } of timedWords) {
      if (!state.transcriptionIndex.has(token)) state.transcriptionIndex.set(token, new Map());
      const segments = state.transcriptionIndex.get(token);
      if (!segments.has(segmentIndex)) segments.set(segmentIndex, []);
      segments.get(segmentIndex).push(Number.isFinite(start) ? start : (Number(segment.start) || 0));
    }
  });
}

function findIndexedSegmentIds(query) {
  const terms = [...new Set(tokenizeTranscript(query))];
  if (terms.length === 0) return [];
  const postings = terms.map((term) => state.transcriptionIndex.get(term));
  if (postings.some((posting) => !posting)) return [];
  return [...postings[0].keys()].filter((segmentIndex) => postings.every((posting) => posting.has(segmentIndex)));
}

function updateTranscriptSearch() {
  const query = elements.transcriptSearchInput.value.trim();
  const terms = [...new Set(tokenizeTranscript(query))];
  const segmentIds = new Set(findIndexedSegmentIds(query));
  const matches = [...elements.transcriptionTrack.querySelectorAll('.clip.transcription')].flatMap((element) => {
    const segmentIndex = Number(element.dataset.segmentIndex);
    if (!segmentIds.has(segmentIndex)) return [];
    const clip = state.clips.find((item) => item.id === element.dataset.sourceClipId);
    if (!clip) return [];
    const termTimes = terms.map((term) =>
      (state.transcriptionIndex.get(term)?.get(segmentIndex) || [])
        .filter((time) => time >= clip.trimStart && time < clip.trimEnd)
    );
    if (termTimes.some((times) => times.length === 0)) return [];
    const sourceTime = Math.min(...termTimes.flat());
    return [{
      element,
      segmentIndex,
      time: clip.start + sourceTime - clip.trimStart,
      text: String(state.transcriptionSegments[segmentIndex]?.text || '').trim() || '(tomt)'
    }];
  }).sort((a, b) => a.time - b.time);
  elements.transcriptionTrack.querySelectorAll('.clip.transcription').forEach((element) => {
    element.classList.toggle('search-match', matches.some((match) => match.element === element));
    element.classList.remove('search-current');
  });
  state.transcriptSearchResults = matches;
  state.transcriptSearchCursor = -1;
  elements.transcriptSearchResults.replaceChildren(...matches.map((match, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'transcript-search-result';
    button.dataset.resultIndex = String(index);
    button.setAttribute('role', 'option');
    const time = document.createElement('span');
    time.className = 'transcript-result-time';
    time.textContent = formatTime(match.time);
    const text = document.createElement('span');
    text.className = 'transcript-result-text';
    text.textContent = match.text;
    button.append(time, text);
    button.addEventListener('click', () => activateTranscriptSearchResult(index));
    return button;
  }));
  elements.transcriptSearchResults.hidden = !query || matches.length === 0;
  const hasResults = matches.length > 0;
  elements.transcriptSearchPrevious.disabled = !hasResults;
  elements.transcriptSearchNext.disabled = !hasResults;
  if (!query) {
    const count = state.transcriptionSegments.length;
    elements.transcriptSearchStatus.value = count ? `${count} segment indexerade` : 'Ingen transkribering indexerad';
  } else {
    elements.transcriptSearchStatus.value = `${matches.length} träff${matches.length === 1 ? '' : 'ar'}`;
  }
}

function moveTranscriptSearchResult(direction) {
  const results = state.transcriptSearchResults;
  if (results.length === 0) return;
  activateTranscriptSearchResult((state.transcriptSearchCursor + direction + results.length) % results.length);
}

function activateTranscriptSearchResult(index) {
  const results = state.transcriptSearchResults;
  const current = results[index];
  if (!current) return;
  state.transcriptSearchCursor = index;
  results.forEach((result, resultIndex) => result.element.classList.toggle('search-current', resultIndex === index));
  elements.transcriptSearchResults.querySelectorAll('.transcript-search-result').forEach((button, resultIndex) => {
    button.classList.toggle('current', resultIndex === index);
    button.setAttribute('aria-selected', String(resultIndex === index));
  });
  setPlayhead(current.time);
  current.element.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  elements.transcriptSearchStatus.value = `${state.transcriptSearchCursor + 1} av ${results.length}`;
}

function defaultBlurBox() {
  return {
    points: [
      { x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.75 }, { x: 0.25, y: 0.75 }
    ],
    strength: 20
  };
}

function defaultBlur() {
  return { boxes: [defaultBlurBox()], strength: 20 };
}

function normalizeBlur(rawBlur) {
  if (!rawBlur) return defaultBlur();
  if (Array.isArray(rawBlur.points) && rawBlur.points.length === 4) {
    return {
      boxes: [{ points: rawBlur.points.map((p) => ({ ...p })), strength: clamp(Number(rawBlur.strength ?? 20), 1, 40) }],
      strength: clamp(Number(rawBlur.strength ?? 20), 1, 40)
    };
  }
  const strength = clamp(Number(rawBlur.strength ?? 20), 1, 40);
  let boxes = rawBlur.boxes;
  if (!Array.isArray(boxes) || boxes.length === 0) boxes = [defaultBlurBox()];
  boxes = boxes.map((box, bi) => {
    if (Array.isArray(box.points) && box.points.length === 4) {
      return { points: box.points.map((p) => ({ x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) })), strength: clamp(Number(box.strength ?? strength), 1, 40) };
    }
    return defaultBlurBox();
  });
  return { boxes, strength };
}

function addBlurClip() {
  recordHistory();
  const clip = {
    id: crypto.randomUUID(), name: 'Custom blur', kind: 'blur',
    mediaDuration: MAX_IMAGE_SECONDS, start: state.playhead, trimStart: 0, trimEnd: 3,
    blur: defaultBlur()
  };
  state.clips.push(clip);
  createClipElement(clip);
  selectClip(clip.id);
  setPlayhead(clip.start);
}

function addBlurBox() {
  const clip = state.clips.find((item) => item.id === state.selectedId && item.kind === 'blur');
  if (!clip) return;
  recordHistory();
  clip.blur.boxes.push(defaultBlurBox());
  renderBlurOverlays(state.playhead);
}

function addTextClip() {
  recordHistory();
  const start = state.playhead;
  const end = start + 4;
  const clip = {
    id: crypto.randomUUID(), name: 'Text', kind: 'text', trackIndex: allocateTrack('text', start, end),
    mediaDuration: MAX_IMAGE_SECONDS, start, trimStart: 0, trimEnd: 4,
    text: { text: 'Skriv din text här', fontSize: 0.08, color: '#FFFFFF', background: 'none', x: 0.5, y: 0.5 }
  };
  state.clips.push(clip);
  createClipElement(clip);
  selectClip(clip.id);
  setPlayhead(clip.start);
}

const TRANSITION_TYPES = new Set(['dissolve', 'slide-left', 'slide-right', 'slide-up', 'slide-down']);

function transitionPair() {
  const selectedVisuals = state.clips
    .filter((clip) => state.selectedIds.has(clip.id) && (clip.kind === 'video' || clip.kind === 'image'))
    .sort((a, b) => a.start - b.start);
  let incoming = selectedVisuals.length >= 2
    ? selectedVisuals.at(-1)
    : selectedVisuals[0] || null;
  const cut = incoming?.transitionIn?.cut ?? incoming?.start;

  if (!incoming) {
    const candidates = state.clips
      .filter((clip) => (clip.kind === 'video' || clip.kind === 'image') && clip.start >= state.playhead - 0.15)
      .sort((a, b) => a.start - b.start);
    incoming = candidates[0] || null;
  }
  if (!incoming) return null;

  const boundary = incoming.transitionIn?.cut ?? incoming.start;
  const outgoing = selectedVisuals.length >= 2
    ? selectedVisuals.at(-2)
    : state.clips
      .filter((clip) =>
        clip.id !== incoming.id &&
        (clip.kind === 'video' || clip.kind === 'image') &&
        clip.start + clipDuration(clip) <= boundary + 0.15
      )
      .sort((a, b) => (b.start + clipDuration(b)) - (a.start + clipDuration(a)))[0];
  if (!outgoing) return null;
  const outgoingEnd = outgoing.start + clipDuration(outgoing);
  if (Math.abs(outgoingEnd - boundary) > 0.25) return null;
  return { outgoing, incoming, cut: boundary };
}

function openTransitionPicker() {
  const pair = transitionPair();
  elements.transitionModal.hidden = false;
  if (pair) {
    const current = pair.incoming.transitionIn;
    if (current) elements.transitionDuration.value = String(current.duration);
    elements.transitionDurationValue.value = `${Number(elements.transitionDuration.value).toFixed(1)} s`;
    elements.transitionHelp.textContent = `${pair.outgoing.name} → ${pair.incoming.name}`;
    elements.removeTransition.disabled = !current;
    document.querySelectorAll('[data-transition]').forEach((button) => {
      button.classList.toggle('active', button.dataset.transition === current?.type);
    });
  } else {
    elements.transitionHelp.textContent = 'Markera två intilliggande bildklipp, eller markera det inkommande klippet.';
    elements.removeTransition.disabled = true;
  }
}

function closeTransitionPicker() {
  elements.transitionModal.hidden = true;
}

function moveClipAndLinkedPartner(clip, newStart) {
  const delta = newStart - clip.start;
  clip.start = newStart;
  const partner = timelineModel.linkedPartner(state.clips, clip);
  if (partner) partner.start = Math.max(0, partner.start + delta);
}

function applyTransition(type) {
  if (!TRANSITION_TYPES.has(type)) return;
  const pair = transitionPair();
  if (!pair) {
    elements.transitionHelp.textContent = 'Ingen klippgräns hittades. Placera två bildklipp kant i kant och markera det inkommande.';
    return;
  }
  const requestedDuration = Number(elements.transitionDuration.value) || 0.6;
  const duration = Math.min(
    requestedDuration,
    clipDuration(pair.outgoing) / 2,
    clipDuration(pair.incoming) / 2,
    pair.cut
  );
  if (duration < 0.15) {
    elements.transitionHelp.textContent = 'Klippet är för kort för den valda övergången.';
    return;
  }
  recordHistory();
  moveClipAndLinkedPartner(pair.incoming, pair.cut - duration);
  pair.incoming.transitionIn = { type, duration, cut: pair.cut };
  rebuildTrackLayout();
  selectClip(pair.incoming.id);
  setPlayhead(pair.cut - duration);
  persist();
  closeTransitionPicker();
}

function removeSelectedTransition() {
  const clip = state.clips.find((item) => item.id === state.selectedId && item.transitionIn);
  if (!clip) return;
  recordHistory();
  const cut = clip.transitionIn.cut;
  delete clip.transitionIn;
  moveClipAndLinkedPartner(clip, cut);
  rebuildTrackLayout();
  selectClip(clip.id);
  persist();
  closeTransitionPicker();
}

function updatePreviewWindowSize() {
  const canvas = state.canvas || { width: 1600, height: 900 };
  const area = elements.previewWindow.parentElement;
  let usedHeight = 0;
  for (const child of area.children) {
    if (child === elements.previewWindow) continue;
    usedHeight += child.getBoundingClientRect().height;
  }
  const areaWidth = area.clientWidth;
  const areaHeight = area.clientHeight;
  const isDesktopLayout = (window.innerWidth || areaWidth) >= 901;
  const previewWidthInset = isDesktopLayout ? 32 : 24;
  const previewHeightInset = isDesktopLayout ? 32 : 12;
  const previewWidthCap = isDesktopLayout ? 1440 : 960;
  const maxWidth = Math.min(areaWidth - previewWidthInset, previewWidthCap);
  const maxHeight = Math.max(200, areaHeight - usedHeight - previewHeightInset);
  const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
  elements.previewWindow.style.width = `${Math.max(1, Math.floor(canvas.width * scale))}px`;
  elements.previewWindow.style.height = `${Math.max(1, Math.floor(canvas.height * scale))}px`;
  elements.previewWindow.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
  updateExportFrameLabel(canvas);
  refreshPreviewLayout();
}

function greatestCommonDivisor(a, b) {
  let x = Math.round(Math.abs(a));
  let y = Math.round(Math.abs(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

function canvasRatioLabel(canvas) {
  const divisor = greatestCommonDivisor(canvas.width, canvas.height);
  const ratioWidth = canvas.width / divisor;
  const ratioHeight = canvas.height / divisor;
  return ratioWidth <= 30 && ratioHeight <= 30 ? `${ratioWidth}:${ratioHeight}` : `${(canvas.width / canvas.height).toFixed(2)}:1`;
}

function updateExportFrameLabel(canvas = state.canvas || { width: 1600, height: 900 }) {
  elements.exportFrameLabel.textContent =
    `EXPORTYTA · ${canvasRatioLabel(canvas)} · ${canvas.width}×${canvas.height} · SVART YTA EXPORTERAS`;
}

function sourceCanvas() {
  const selected = state.clips.find((clip) =>
    clip.id === state.selectedId && (clip.kind === 'video' || clip.kind === 'image')
  );
  const visual = selected || state.clips.find((clip) => clip.kind === 'video' || clip.kind === 'image');
  if (!visual?.sourceWidth || !visual?.sourceHeight) return null;
  return { width: visual.sourceWidth, height: visual.sourceHeight };
}

function evenCanvasDimension(value) {
  return Math.max(64, Math.min(4096, Math.round(Number(value) / 2) * 2));
}

function setCanvas(canvas, history = true) {
  if (!canvas?.width || !canvas?.height) return false;
  const normalized = {
    width: evenCanvasDimension(canvas.width),
    height: evenCanvasDimension(canvas.height)
  };
  if (history && state.canvas &&
      (state.canvas.width !== normalized.width || state.canvas.height !== normalized.height)) {
    recordHistory();
  }
  state.canvas = normalized;
  elements.canvasWidth.value = String(normalized.width);
  elements.canvasHeight.value = String(normalized.height);
  updatePreviewWindowSize();
  updateCropOverlay();
  persist();
  return true;
}

function applyCanvasFormat() {
  const value = elements.canvasFormat.value;
  elements.customCanvasSize.hidden = value !== 'custom';
  if (value === 'custom') return applyCustomCanvasSize();
  if (value === 'source') {
    const canvas = sourceCanvas();
    if (canvas) setCanvas(canvas);
    return;
  }
  setCanvas(CANVAS_PRESETS[value]);
}

function applyCustomCanvasSize() {
  if (elements.canvasFormat.value !== 'custom') return;
  setCanvas({ width: elements.canvasWidth.value, height: elements.canvasHeight.value });
}

function syncCanvasControls() {
  const canvas = state.canvas || sourceCanvas() || { width: 1600, height: 900 };
  const preset = Object.entries(CANVAS_PRESETS)
    .find(([, dimensions]) => dimensions.width === canvas.width && dimensions.height === canvas.height)?.[0];
  elements.canvasFormat.value = preset || 'custom';
  elements.customCanvasSize.hidden = Boolean(preset);
  elements.canvasWidth.value = String(canvas.width);
  elements.canvasHeight.value = String(canvas.height);
  updateExportFrameLabel(canvas);
}

window.addEventListener('resize', updatePreviewWindowSize);
window.addEventListener('resize', updateCropOverlay);
window.addEventListener('beforeunload', () => {
  try { localStorage.setItem(PERSIST_KEY, JSON.stringify(editorSnapshot())); } catch (error) { /* ignore */ }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist();
});

const VISUAL_KINDS = ['video', 'image', 'text', 'blur', 'color', 'html'];

function trackKinds(kind) {
  if (kind === 'audio') return ['audio'];
  return VISUAL_KINDS;
}

function allocateTrack(kind, start, end, ignoreId = null) {
  if (VISUAL_KINDS.includes(kind)) return 0;
  return timelineModel.firstFreeTrack(state.clips, trackKinds(kind), start, end, ignoreId);
}

function ensureVisualTrack(index) {
  while (state.visualTrackEls.length <= index) {
    const trackIndex = state.visualTrackEls.length;
    const currentTopTrack = state.visualTrackEls.at(-1);
    const currentTopLabel = state.visualLabelEls.at(-1);
    const track = document.createElement('div');
    track.className = 'track visual-track';
    const label = document.createElement('div');
    label.className = 'track-label';
    label.textContent = `V${trackIndex + 1}`;
    elements.timelineLabels.insertBefore(label, currentTopLabel);
    elements.timelineTracks.insertBefore(track, currentTopTrack);
    state.visualLabelEls.push(label);
    state.visualTrackEls.push(track);
    if (trackIndex === 0) track.id = 'visual-track';
  }
  return state.visualTrackEls[index];
}

function ensureAudioTrack(index) {
  while (state.audioTrackEls.length <= index) {
    const trackIndex = state.audioTrackEls.length;
    const track = document.createElement('div');
    track.className = 'track audio-track';
    const label = document.createElement('div');
    label.className = 'track-label';
    label.textContent = `LJUD ${trackIndex + 1}`;
    elements.timelineLabels.appendChild(label);
    elements.timelineTracks.appendChild(track);
    state.audioLabelEls.push(label);
    state.audioTrackEls.push(track);
    if (trackIndex === 0) track.id = 'audio-track';
  }
  return state.audioTrackEls[index];
}

function rebuildTrackLayout(liftedIds) {
  const selectedId = state.selectedId;
  const selectedIds = new Set(state.selectedIds);
  state.clips = timelineModel.compactTrackAssignments(state.clips, liftedIds || []);
  clearDynamicTracks();
  elements.visualTrack.replaceChildren();
  elements.transcriptionTrack.replaceChildren();
  elements.audioTrack.replaceChildren();
  state.clips.forEach(createClipElement);
  renderTranscription();
  const validSelectedIds = state.clips.filter((clip) => selectedIds.has(clip.id)).map((clip) => clip.id);
  selectClips(validSelectedIds, validSelectedIds.includes(selectedId) ? selectedId : validSelectedIds[0] || null);
  updateTimelineWidth();
  setPlayhead(state.playhead);
  cleanEmptyVisualTracks();
}

function createClipElement(clip) {
  const element = document.createElement('div');
  element.className = `clip ${clip.kind}`;
  element.dataset.id = clip.id;
  const title = document.createElement('span');
  title.textContent = clip.name;
  const left = document.createElement('div');
  left.className = 'handle left';
  const right = document.createElement('div');
  right.className = 'handle right';
  element.append(left, title, right);
  syncClipLinkControl(element, clip);
  syncClipTransitionControl(element, clip);
  if (clip.kind === 'audio') {
    const canvas = document.createElement('canvas');
    canvas.className = 'clip-waveform';
    element.prepend(canvas);
  }
  const track = clip.kind === 'audio'
    ? ensureAudioTrack(clip.trackIndex || 0)
    : ensureVisualTrack(clip.trackIndex || 0);
  track.appendChild(element);
  renderClip(clip);
}

function syncClipLinkControl(element, clip) {
  const existing = element.querySelector('.clip-link-toggle');
  if (!clip.linkGroupId) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.dataset.linkGroupId = clip.linkGroupId;
    return;
  }
    const linkButton = document.createElement('button');
    linkButton.type = 'button';
    linkButton.className = 'clip-link-toggle';
    linkButton.dataset.linkGroupId = clip.linkGroupId;
    linkButton.setAttribute('aria-label', 'Lås upp video och ljud');
    linkButton.title = 'Video och ljud är länkade – klicka för att låsa upp';
    linkButton.textContent = '🔗';
    linkButton.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    linkButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      unlinkClipPair(clip);
    });
    element.appendChild(linkButton);
}

function syncClipTransitionControl(element, clip) {
  const existing = element.querySelector('.clip-transition-marker');
  if (!clip.transitionIn || (clip.kind !== 'video' && clip.kind !== 'image')) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = 'clip-transition-marker';
  marker.textContent = '◇';
  marker.setAttribute('aria-label', 'Redigera övergång');
  marker.title = 'Redigera övergång';
  marker.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  marker.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    selectClip(clip.id);
    openTransitionPicker();
  });
  element.appendChild(marker);
}

function renderClip(clip) {
  const element = document.querySelector(`.clip[data-id="${CSS.escape(clip.id)}"]`);
  if (!element) return;
  element.style.left = `${secondsToPixels(clip.start)}px`;
  element.style.width = `${Math.max(8, secondsToPixels(clipDuration(clip)))}px`;
  element.classList.toggle('muted', clip.kind === 'video' && clip.muted === true);
  element.classList.toggle('linked', Boolean(clip.linkGroupId));
  syncClipLinkControl(element, clip);
  syncClipTransitionControl(element, clip);
  element.title = `${clip.name}\n${formatTime(clip.trimStart)}–${formatTime(clip.trimEnd)}` +
    (clip.muted ? '\n(ljud separerat)' : '') +
    (clip.linkGroupId ? '\n🔗 Länkat – klicka på kedjan för att låsa upp' : '') +
    (clip.transitionIn ? `\n◇ ${clip.transitionIn.type} · ${clip.transitionIn.duration.toFixed(1)} s` : '');
  if (clip.kind === 'audio') {
    let canvas = element.querySelector('.clip-waveform');
    const displayWidth = Math.max(8, Math.round(secondsToPixels(clipDuration(clip)))) || 8;
    const w = Math.min(2000, displayWidth);
    const h = 64;
    if (!canvas || canvas.width !== w || canvas.height !== h || canvas.style.width !== `${displayWidth}px`) {
      if (canvas) canvas.remove();
      canvas = document.createElement('canvas');
      canvas.className = 'clip-waveform';
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = '64px';
      element.insertBefore(canvas, element.firstChild);
    }
    drawTimelineWaveform(canvas, clip);
  }
  renderTimelineLinkConnectors();
  updateTimelineWidth();
}

function renderTimelineLinkConnectors() {
  const layer = elements.timelineLinkConnectors;
  if (!layer) return;
  layer.replaceChildren();
  const groups = new Map();
  for (const clip of state.clips) {
    if (!clip.linkGroupId) continue;
    const group = groups.get(clip.linkGroupId) || [];
    group.push(clip);
    groups.set(clip.linkGroupId, group);
  }
  const timelineRect = elements.timeline.getBoundingClientRect();
  for (const clips of groups.values()) {
    const video = clips.find((clip) => clip.kind === 'video');
    const audio = clips.find((clip) => clip.kind === 'audio');
    if (!video || !audio) continue;
    const videoElement = document.querySelector(`.clip[data-id="${CSS.escape(video.id)}"]`);
    const audioElement = document.querySelector(`.clip[data-id="${CSS.escape(audio.id)}"]`);
    if (!videoElement || !audioElement) continue;
    const videoRect = videoElement.getBoundingClientRect();
    const audioRect = audioElement.getBoundingClientRect();
    const hasLayoutRects = videoRect.width > 0 && audioRect.width > 0 && timelineRect.width > 0;
    const overlapStart = Math.max(video.start, audio.start);
    const overlapEnd = Math.min(video.start + clipDuration(video), audio.start + clipDuration(audio));
    const centerTime = overlapStart < overlapEnd
      ? overlapStart + (overlapEnd - overlapStart) / 2
      : Math.max(video.start, audio.start);
    const connector = document.createElement('img');
    connector.className = 'timeline-link-connector';
    connector.src = '/chain.svg?v=0.15.3';
    connector.alt = '';
    if (hasLayoutRects) {
      const topEdge = videoRect.bottom <= audioRect.top ? videoRect.bottom : audioRect.bottom;
      const bottomEdge = videoRect.bottom <= audioRect.top ? audioRect.top : videoRect.top;
      connector.style.left = `${secondsToPixels(centerTime) - 9}px`;
      connector.style.top = `${topEdge - timelineRect.top}px`;
      connector.style.height = `${Math.max(20, bottomEdge - topEdge)}px`;
    } else {
      connector.style.left = `${secondsToPixels(centerTime) - 9}px`;
      connector.style.top = '90px';
      connector.style.height = '36px';
    }
    layer.appendChild(connector);
  }
}

function unlinkClipPair(clip, options = {}) {
  if (!clip?.linkGroupId) return false;
  const linkGroupId = clip.linkGroupId;
  const linkedClips = state.clips.filter((item) => item.linkGroupId === linkGroupId);
  if (options.recordHistory !== false) recordHistory();
  for (const linkedClip of linkedClips) delete linkedClip.linkGroupId;
  rebuildTrackLayout();
  persist();
  return true;
}

function describeClip(clip) {
  if (!clip) return 'Inget klipp markerat';
  if (clip.kind === 'blur') return `${clip.name} · start ${formatTime(clip.start)} · visas i ${clipDuration(clip).toFixed(2)} s`;
  if (clip.kind === 'color') return `${clip.name} · start ${formatTime(clip.start)} · visas i ${clipDuration(clip).toFixed(2)} s · "${normalizeColorBlock(clip.color).color}"`;
  if (clip.kind === 'html') return `${clip.name} · start ${formatTime(clip.start)} · visas i ${clipDuration(clip).toFixed(2)} s`;
  if (clip.kind === 'text') return `${clip.name} · start ${formatTime(clip.start)} · visas i ${clipDuration(clip).toFixed(2)} s · "${clip.text.text}"`;
  if (clip.kind === 'image') return `${clip.name} · start ${formatTime(clip.start)} · visas i ${clipDuration(clip).toFixed(2)} s`;
  return `${clip.name} · start ${formatTime(clip.start)} · källa ${formatTime(clip.trimStart)}–${formatTime(clip.trimEnd)}`;
}

function selectClips(ids, primaryId = null, options = {}) {
  const validIds = new Set(ids.filter((id) => state.clips.some((clip) => clip.id === id)));
  const nextPrimaryId = primaryId && validIds.has(primaryId) ? primaryId : validIds.values().next().value || null;
  const selectionChanged = state.selectedId !== nextPrimaryId;
  state.selectedIds = validIds;
  state.selectedId = nextPrimaryId;
  document.querySelectorAll('.clip').forEach((element) => {
    element.classList.toggle('selected', validIds.has(element.dataset.id));
  });
  const hasSelection = validIds.size > 0;
  elements.remove.disabled = !hasSelection;
  const qtRemove = document.querySelector('#qt-remove');
  if (qtRemove) qtRemove.disabled = !hasSelection;
  const clip = state.clips.find((item) => item.id === nextPrimaryId);
  if (!options.preventPlayheadJump && !editorHistory.restoring && selectionChanged &&
      (clip?.kind === 'blur' || clip?.kind === 'color' || clip?.kind === 'html') &&
      (state.playhead < clip.start || state.playhead >= clip.start + clipDuration(clip))) {
    state.playhead = clip.start;
  }
  elements.info.textContent = validIds.size > 1
    ? `${validIds.size} klipp markerade · ${describeClip(clip)}`
    : describeClip(clip);
  if (clip && clip.kind !== 'video' && clip.kind !== 'image') {
    state.cropActive = false;
    hideCropOverlay();
  }
  updateCropTools(clip);
  if (state.cropActive && clip && (clip.kind === 'video' || clip.kind === 'image')) showCropOverlay();
  else if (state.cropActive) hideCropOverlay();
  updateBlurTools(clip);
  updateColorTools(clip);
  updateAnimTools(clip);
  updateTextTools(clip);
  updateHtmlTools(clip);
  updateAudioTools(clip);
  updateLinkTool();
  const anyTools = clip && (clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'blur' || clip.kind === 'color' || clip.kind === 'text' || clip.kind === 'html' || clip.kind === 'audio');
  elements.toolsPanel.hidden = !anyTools;
  if (options.refreshPreview !== false) setPlayhead(state.playhead);
}

function selectClip(id) {
  selectClips(id ? [id] : [], id);
}

function selectedVideoAudioPair() {
  const selected = state.clips.filter((clip) => state.selectedIds.has(clip.id));
  if (selected.length !== 2) return null;
  const video = selected.find((clip) => clip.kind === 'video');
  const audio = selected.find((clip) => clip.kind === 'audio');
  return video && audio ? { video, audio } : null;
}

function updateLinkTool() {
  const pair = selectedVideoAudioPair();
  const linked = Boolean(pair && pair.video.linkGroupId && pair.video.linkGroupId === pair.audio.linkGroupId);
  elements.linkToggle.disabled = !pair;
  elements.linkToggle.setAttribute('aria-pressed', String(linked));
  elements.linkToggle.title = !pair
    ? 'Markera exakt ett videoklipp och ett ljudklipp'
    : linked
      ? 'Separera markerat video- och ljudklipp'
      : 'Länka markerat video- och ljudklipp';
  const label = elements.linkToggle.querySelector('span');
  if (label) label.textContent = linked ? 'Separera' : 'Länka';
}

function toggleSelectedLink() {
  const pair = selectedVideoAudioPair();
  if (!pair) return;
  const linked = pair.video.linkGroupId && pair.video.linkGroupId === pair.audio.linkGroupId;
  recordHistory();
  if (linked) {
    unlinkClipPair(pair.video, { recordHistory: false });
    return;
  }
  const oldGroups = new Set([pair.video.linkGroupId, pair.audio.linkGroupId].filter(Boolean));
  for (const clip of state.clips) {
    if (oldGroups.has(clip.linkGroupId)) delete clip.linkGroupId;
  }
  const linkGroupId = crypto.randomUUID();
  pair.video.linkGroupId = linkGroupId;
  pair.audio.linkGroupId = linkGroupId;
  renderClip(pair.video);
  renderClip(pair.audio);
  persist();
  updateLinkTool();
}

function updateCropTools(clip) {
  elements.cropTools.hidden = !(clip && (clip.kind === 'video' || clip.kind === 'image') && state.cropActive);
  requestAnimationFrame(updatePreviewWindowSize);
}

function resetSelectedCrop() {
  if (!state.cropActive) return;
  state.cropPreview = { left: 0, right: 0, top: 0, bottom: 0 };
  updateCropOverlay();
}

function updateCropOverlay() {
  const clip = state.clips.find((item) => item.id === state.selectedId && (item.kind === 'video' || item.kind === 'image'));
  if (!clip || !state.cropActive) {
    elements.cropOverlay.hidden = true;
    return;
  }
  const c = state.cropPreview || clip.crop || { left: 0, right: 0, top: 0, bottom: 0 };
  elements.cropOverlay.hidden = false;
  const pw = elements.previewWindow.clientWidth;
  const ph = elements.previewWindow.clientHeight;
  if (!pw || !ph) return;

  let l, r, t, b;
  if (clip.kind === 'video' && clip.sourceWidth && clip.sourceHeight) {
    const committed = clip.crop || { left: 0, right: 0, top: 0, bottom: 0 };
    const sW = Number(clip.sourceWidth);
    const sH = Number(clip.sourceHeight);
    const cw_c = sW * (1 - committed.left - committed.right);
    const ch_c = sH * (1 - committed.top - committed.bottom);
    const scale = Math.min(pw / cw_c, ph / ch_c);
    const vL = (pw - cw_c * scale) / 2 - committed.left * sW * scale;
    const vT = (ph - ch_c * scale) / 2 - committed.top * sH * scale;
    const vW = sW * scale;
    const vH = sH * scale;
    l = vL + c.left * vW;
    r = vL + (1 - c.right) * vW;
    t = vT + c.top * vH;
    b = vT + (1 - c.bottom) * vH;
  } else {
    l = c.left * pw;
    r = (1 - c.right) * pw;
    t = c.top * ph;
    b = (1 - c.bottom) * ph;
  }

  const w = Math.max(0, r - l);
  const h = Math.max(0, b - t);

  elements.cropMaskL.style.cssText = `left:0;top:0;height:${ph}px;width:${Math.max(0, l)}px`;
  elements.cropMaskR.style.cssText = `left:${r}px;top:0;height:${ph}px;width:${Math.max(0, pw - r)}px`;
  elements.cropMaskT.style.cssText = `left:${Math.max(0, l)}px;top:0;height:${Math.max(0, t)}px;width:${w}px`;
  elements.cropMaskB.style.cssText = `left:${Math.max(0, l)}px;top:${b}px;height:${Math.max(0, ph - b)}px;width:${w}px`;
  elements.cropPan.style.cssText = `left:${Math.max(0, l)}px;top:${Math.max(0, t)}px;width:${w}px;height:${h}px`;

  const corners = [
    { side: 'tl', x: l, y: t }, { side: 'tr', x: r, y: t },
    { side: 'br', x: r, y: b }, { side: 'bl', x: l, y: b }
  ];
  const edges = [
    { side: 'left', x: l, y: t + h / 2 }, { side: 'right', x: r, y: t + h / 2 },
    { side: 'top', x: l + w / 2, y: t }, { side: 'bottom', x: l + w / 2, y: b }
  ];
  elements.cropHandles.forEach((handle) => {
    const s = handle.dataset.side;
    handle.style.transform = 'translate(-50%, -50%)';
    handle.style.display = '';
    const pt = [...corners, ...edges].find(p => p.side === s);
    if (pt) { handle.style.left = `${pt.x}px`; handle.style.top = `${pt.y}px`; }
    else handle.style.display = 'none';
  });
}

function showCropOverlay() {
  if (!state.cropActive) return;
  elements.visualScaleOverlay.hidden = true;
  const clip = state.clips.find((item) => item.id === state.selectedId && (item.kind === 'video' || item.kind === 'image'));
  if (!clip) { state.cropActive = false; return; }
  updateCropOverlay();
  updateCropTools(clip);
}

function hideCropOverlay() {
  elements.cropOverlay.hidden = true;
}

function toggleCropMode() {
  if (state.cropActive) {
  state.cropActive = false;
  state.cropPreview = null;
    elements.cropTools.hidden = true;
    hideCropOverlay();
    refreshPreviewLayout();
    return;
  }
  let clip = state.clips.find((item) => item.id === state.selectedId && (item.kind === 'video' || item.kind === 'image'));
  if (!clip) {
    clip = state.clips.find((item) => item.kind === 'video' || item.kind === 'image');
    if (!clip) return;
    selectClip(clip.id);
  }
  state.cropActive = true;
  const existing = clip.crop;
  const hasCrop = existing && (existing.left > 0 || existing.right > 0 || existing.top > 0 || existing.bottom > 0);
  state.cropPreview = hasCrop ? { ...existing } : { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25 };
  showCropOverlay();
}

function cancelCrop() {
  hideCropOverlay();
  state.cropActive = false;
  elements.cropTools.hidden = true;
  refreshPreviewLayout();
}

function startCropDrag(event) {
  if (!state.cropActive) return;
  const handle = event.target.closest('.crop-handle');
  if (!handle) return;
  const clip = state.clips.find((item) => item.id === state.selectedId && (item.kind === 'video' || item.kind === 'image'));
  if (!clip) return;
  state.cropDrag = {
    clip, side: handle.dataset.side, pointerId: event.pointerId,
    originX: event.clientX, originY: event.clientY,
    initialCrop: { ...(state.cropPreview || clip.crop || { left: 0, right: 0, top: 0, bottom: 0 }) },
    snapshot: editorSnapshot(), historyRecorded: false
  };
  if (clip.kind === 'video' && !elements.preview.paused && elements.preview.readyState >= 2) {
    elements.preview.pause();
  }
  event.preventDefault();
}

function startCropPan(event) {
  if (!state.cropActive) return;
  const clip = state.clips.find((item) => item.id === state.selectedId && (item.kind === 'video' || item.kind === 'image'));
  if (!clip) return;
  state.cropDrag = {
    clip, pan: true, pointerId: event.pointerId,
    originX: event.clientX, originY: event.clientY,
    initialCrop: { ...(state.cropPreview || clip.crop || { left: 0, right: 0, top: 0, bottom: 0 }) },
    snapshot: editorSnapshot(), historyRecorded: false
  };
  event.preventDefault();
}

function moveCropDrag(event) {
  if (!state.cropDrag || event.pointerId !== state.cropDrag.pointerId) return;
  const { clip, side, originX, originY, initialCrop } = state.cropDrag;
  const rect = elements.cropOverlay.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const pw = rect.width;
  const ph = rect.height;

  let vL = 0, vT = 0, vW = pw, vH = ph;
  if (clip.kind === 'video' && clip.sourceWidth && clip.sourceHeight) {
    const committed = clip.crop || { left: 0, right: 0, top: 0, bottom: 0 };
    const sW = Number(clip.sourceWidth);
    const sH = Number(clip.sourceHeight);
    const cw_c = sW * (1 - committed.left - committed.right);
    const ch_c = sH * (1 - committed.top - committed.bottom);
    const scale = Math.min(pw / cw_c, ph / ch_c);
    vL = (pw - cw_c * scale) / 2 - committed.left * sW * scale;
    vT = (ph - ch_c * scale) / 2 - committed.top * sH * scale;
    vW = sW * scale;
    vH = sH * scale;
  }

  const dx = (event.clientX - originX) / vW;
  const dy = (event.clientY - originY) / vH;

  if (state.cropDrag.pan) {
    let l = initialCrop.left + dx, r = initialCrop.right - dx;
    let t = initialCrop.top + dy, b = initialCrop.bottom - dy;
    if (l < 0) { r += l; l = 0; } if (r < 0) { l += r; r = 0; }
    if (t < 0) { b += t; t = 0; } if (b < 0) { t += b; b = 0; }
    l = clamp(l, 0, 0.95 - r); r = clamp(r, 0, 0.95 - l);
    t = clamp(t, 0, 0.95 - b); b = clamp(b, 0, 0.95 - t);
    if (l + r >= 1 || t + b >= 1 || l < 0 || r < 0 || t < 0 || b < 0) return;
    state.cropPreview = { left: l, right: r, top: t, bottom: b };
  } else {
    const mx = (event.clientX - rect.left - vL) / vW;
    const my = (event.clientY - rect.top - vT) / vH;
    let c = { ...initialCrop };
    if (side === 'left' || side === 'tl' || side === 'bl') c.left = clamp(mx, 0, 0.95 - c.right);
    if (side === 'right' || side === 'tr' || side === 'br') c.right = clamp(1 - mx, 0, 0.95 - c.left);
    if (side === 'top' || side === 'tl' || side === 'tr') c.top = clamp(my, 0, 0.95 - c.bottom);
    if (side === 'bottom' || side === 'bl' || side === 'br') c.bottom = clamp(1 - my, 0, 0.95 - c.top);
    if (c.left + c.right >= 1 || c.top + c.bottom >= 1) return;
    state.cropPreview = c;
  }
  updateCropOverlay();
  event.preventDefault();
}

function stopCropDrag(event) {
  if (state.cropDrag && event.pointerId === state.cropDrag.pointerId) {
    state.cropDrag = null;
  }
}

function updateBlurTools(clip) {
  const canBlur = clip?.kind === 'blur';
  elements.blurTools.hidden = !canBlur;
  if (canBlur) {
    clip.blur = normalizeBlur(clip.blur);
    const strength = clip.blur.boxes[0]?.strength ?? clip.blur.strength;
    elements.blurInputs.forEach((input) => {
      const value = input.dataset.property === 'strength' ? strength : (clip.blur[input.dataset.property] ?? 20);
      input.value = String(value);
      document.querySelector(`#blur-${input.dataset.property}-value`).value = String(value);
    });
  }
  requestAnimationFrame(updatePreviewWindowSize);
}

function handleBlurInput(event) {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || clip.kind !== 'blur') return;
  recordInputEdit();
  const property = event.currentTarget.dataset.property;
  const rawValue = Number(event.currentTarget.value);
  if (property === 'strength') {
    const s = clamp(Math.round(rawValue), 1, 40);
    clip.blur.boxes.forEach((box) => { box.strength = s; });
    clip.blur.strength = s;
  }
  updateBlurTools(clip);
  renderBlurOverlays(state.playhead);
}

function resetSelectedBlur() {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || clip.kind !== 'blur') return;
  recordHistory();
  clip.blur = defaultBlur();
  updateBlurTools(clip);
  renderBlurOverlays(state.playhead);
}

function defaultColorBlock() {
  return { color: '#e50914', x: 0.5, y: 0.5, width: 1, height: 1 };
}

function normalizeColorBlock(rawColor) {
  const fallback = defaultColorBlock();
  const raw = rawColor && typeof rawColor === 'object' ? rawColor : {};
  const finiteOr = (value, fallbackValue) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallbackValue;
  };
  const width = clamp(finiteOr(raw.width, fallback.width), 0.05, 1);
  const height = clamp(finiteOr(raw.height, fallback.height), 0.05, 1);
  return {
    color: typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : fallback.color,
    x: clamp(finiteOr(raw.x, fallback.x), width / 2, 1 - width / 2),
    y: clamp(finiteOr(raw.y, fallback.y), height / 2, 1 - height / 2),
    width,
    height
  };
}

function normalizeRestoredClip(clip) {
  if (clip?.kind === 'color') clip.color = normalizeColorBlock(clip.color);
  return clip;
}

function addColorClip() {
  recordHistory();
  const clip = {
    id: crypto.randomUUID(), name: 'Färgblock', kind: 'color',
    mediaDuration: MAX_IMAGE_SECONDS, start: state.playhead, trimStart: 0, trimEnd: 3,
    color: defaultColorBlock()
  };
  state.clips.push(clip);
  createClipElement(clip);
  selectClip(clip.id);
  setPlayhead(clip.start);
}

function defaultHtmlBlock() {
  return {
    code: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif">
  <div style="text-align:center;background:rgba(0,0,0,0.6);color:white;padding:20px 28px;border-radius:12px;animation:pulse 2s infinite">
    <div style="font-size:42px;font-weight:700">Hej!</div>
    <div style="font-size:18px;opacity:0.8">HTML-block</div>
  </div>
  <style>
    @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
  </style>
</div>`,
    x: 0.5, y: 0.5, width: 0.5, height: 0.5
  };
}

function addHtmlClip() {
  recordHistory();
  const clip = {
    id: crypto.randomUUID(), name: 'HTML-block', kind: 'html',
    mediaDuration: MAX_IMAGE_SECONDS, start: state.playhead, trimStart: 0, trimEnd: 4,
    html: defaultHtmlBlock()
  };
  state.clips.push(clip);
  createClipElement(clip);
  selectClip(clip.id);
  setPlayhead(clip.start);
}

function updateColorTools(clip) {
  const canColor = clip?.kind === 'color';
  elements.colorTools.hidden = !canColor;
  if (canColor) {
    clip.color = normalizeColorBlock(clip.color);
    const c = clip.color;
    elements.colorInputs.forEach((input) => {
      const property = input.dataset.property;
      if (property === 'color') { input.value = c.color; }
      else {
        const val = c[property];
        input.value = String(val ?? 0.5);
        const output = document.querySelector(`.val-color-${property}`);
        if (output) output.textContent = String(Math.round((val ?? 0.5) * 100));
      }
    });
  }
  requestAnimationFrame(updatePreviewWindowSize);
}

function updateAnimTools(clip) {
  const canAnim = clip && (clip.kind === 'video' || clip.kind === 'image') && !state.cropActive;
  elements.animTools.hidden = !canAnim;
  if (canAnim) {
    const anim = clip.animIn || { type: 'none', duration: 0.5 };
    elements.animBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.anim === anim.type));
    elements.animDuration.value = String(anim.duration);
    elements.animDurationValue.textContent = `${anim.duration.toFixed(1)} s`;
  }
}

function handleAnimClick(event) {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || (clip.kind !== 'video' && clip.kind !== 'image')) return;
  const type = event.currentTarget.dataset.anim;
  recordHistory();
  if (type === 'none') {
    delete clip.animIn;
  } else {
    clip.animIn = { type, duration: Number(elements.animDuration.value) };
  }
  updateAnimTools(clip);
  setPlayhead(state.playhead);
  persist();
}

function handleAnimDuration() {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || (clip.kind !== 'video' && clip.kind !== 'image') || !clip.animIn) return;
  clip.animIn.duration = clamp(Number(elements.animDuration.value), 0.1, 3);
  elements.animDurationValue.textContent = `${clip.animIn.duration.toFixed(1)} s`;
  persist();
}

elements.animBtns = [...document.querySelectorAll('.anim-btn')];
elements.animDuration = document.getElementById('anim-duration');
elements.animDurationValue = document.getElementById('anim-dur-value');
elements.animTools = document.getElementById('anim-tools');
elements.animBtns.forEach((btn) => btn.addEventListener('click', handleAnimClick));
elements.animDuration.addEventListener('input', handleAnimDuration);

function handleColorInput(event) {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || clip.kind !== 'color') return;
  recordInputEdit();
  const input = event.currentTarget;
  const property = input.dataset.property;
  const value = property === 'color' ? input.value : Number(input.value);
  if (property === 'x') clip.color.x = Math.round(clamp(value, 0, 1) * 100) / 100;
  else if (property === 'y') clip.color.y = Math.round(clamp(value, 0, 1) * 100) / 100;
  else if (property === 'width') clip.color.width = Math.round(clamp(value, 0.05, 1) * 100) / 100;
  else if (property === 'height') clip.color.height = Math.round(clamp(value, 0.05, 1) * 100) / 100;
  else if (property === 'color') clip.color.color = value;
  updateColorTools(clip);
  renderColorOverlays(state.playhead);
}

const TEXT_PRESETS = Object.freeze({
  simple: {
    variant: 'standard', fontSize: 0.09, color: '#FFFFFF', background: 'none', x: 0.5, y: 0.5, scaleX: 1,
    animIn: null, animOut: null
  },
  slide: {
    variant: 'standard', fontSize: 0.07, color: '#FFFFFF', background: 'none', x: 0.5, y: 0.5, scaleX: 1,
    animIn: { type: 'slide-left', duration: 0.5 }, animOut: { type: 'fade', duration: 0.3 }
  },
  scale: {
    variant: 'standard', fontSize: 0.11, color: '#FFFFFF', background: 'none', x: 0.5, y: 0.5, scaleX: 1.12,
    animIn: { type: 'scale', duration: 0.35 }, animOut: { type: 'scale', duration: 0.25 }
  },
  typewriter: {
    variant: 'standard', fontSize: 0.06, color: '#69F0AE', background: '#000000', x: 0.5, y: 0.5, scaleX: 1,
    animIn: { type: 'typewriter', duration: 1.4 }, animOut: { type: 'fade', duration: 0.3 }
  }
});

function showTextSections(presetId) {
  document.querySelectorAll('.preset-panel').forEach((el) => {
    el.style.display = el.dataset.preset === presetId ? '' : 'none';
  });
}

function defaultText() {
  return { text: 'Skriv din text här', presetId: null, fontSize: 0.08, color: '#FFFFFF', background: 'none', x: 0.5, y: 0.5, scaleX: 1, animIn: null, animOut: null };
}

function normalizeHtml(rawHtml) {
  const base = (rawHtml && typeof rawHtml === 'object') ? { ...rawHtml } : defaultHtmlBlock();
  return {
    code: typeof base.code === 'string' ? base.code : defaultHtmlBlock().code,
    x: clamp(Number(base.x ?? 0.5), 0, 1),
    y: clamp(Number(base.y ?? 0.5), 0, 1),
    width: clamp(Number(base.width ?? 0.5), 0.05, 1),
    height: clamp(Number(base.height ?? 0.5), 0.05, 1)
  };
}

function normalizeText(rawText) {
  const base = (rawText && typeof rawText === 'object') ? { ...rawText } : defaultText();
  const text = typeof base.text === 'string' ? base.text : defaultText().text;
  function validAnim(raw) {
    if (!raw || typeof raw !== 'object' || raw.type === 'none' || !raw.type) return null;
    const types = ['fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'scale', 'typewriter'];
    return { type: types.includes(raw.type) ? raw.type : 'fade', duration: clamp(Number(raw.duration ?? 0.5), 0.1, 3) };
  }
  return {
    text,
    presetId: Object.hasOwn(TEXT_PRESETS, base.presetId) ? base.presetId : null,
    variant: 'standard',
    fontSize: clamp(Number(base.fontSize ?? 0.08), 0.01, 0.5),
    color: typeof base.color === 'string' ? base.color : '#FFFFFF',
    background: base.background === 'none' || typeof base.background === 'string' ? base.background : 'none',
    x: clamp(Number(base.x ?? 0.5), 0, 1),
    y: clamp(Number(base.y ?? 0.5), 0, 1),
    scaleX: clamp(Number(base.scaleX ?? 1), 0.1, 6),
    animIn: validAnim(base.animIn || (base.animInType ? { type: base.animInType, duration: base.animInDuration } : null)),
    animOut: validAnim(base.animOut || (base.animOutType ? { type: base.animOutType, duration: base.animOutDuration } : null))
  };
}

function updateTextTools(clip) {
  const canText = clip?.kind === 'text';
  elements.textTools.hidden = !canText;
  if (canText) {
    clip.text = normalizeText(clip.text);
    const text = clip.text;
    elements.textPresetButtons.forEach((button) => {
      const active = button.dataset.textPreset === text.presetId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    showTextSections(text.presetId);
    const panel = document.querySelector(`.preset-panel[data-preset="${text.presetId}"]`);
    if (!panel) { requestAnimationFrame(updatePreviewWindowSize); return; }
    panel.querySelectorAll('[data-property]').forEach((input) => {
      const prop = input.dataset.property;
      let val = text[prop];
      if (val === undefined || val === null) return;
      if (prop === 'fontSize') {
        const pct = Math.round(val * 100);
        input.value = String(pct);
        const out = panel.querySelector('.val-font-size');
        if (out) out.textContent = `${pct}%`;
      } else if (prop === 'scaleX') {
        const pct = Math.round(val * 100);
        input.value = String(pct);
        const out = panel.querySelector('.val-scale');
        if (out) out.textContent = `${pct}%`;
      } else if (prop === 'cycleSpeed') {
        input.value = String(val);
        const out = panel.querySelector('.val-cycle-speed');
        if (out) out.textContent = `${val} s`;
      } else if (prop === 'animInDuration') {
        input.value = String(val);
        const out = panel.querySelector('.val-anim-dur');
        if (out) out.textContent = `${val} s`;
      } else if (prop === 'background') {
        if (input.tagName === 'SELECT') {
          input.value = val === 'none' ? '#000000' : val;
        } else {
          input.value = val;
        }
      } else if (input.type === 'checkbox') {
        input.checked = val === true;
      } else {
        input.value = val;
      }
    });
  }
  requestAnimationFrame(updatePreviewWindowSize);
}

function handleTextInput(event) {
  const target = event.target;
  if (!target.dataset.property) return;
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || clip.kind !== 'text') return;
  recordInputEdit();
  const property = target.dataset.property;
  const value = target.value;
  const checked = target.checked;
  if (property === 'text') {
    clip.text.text = value;
  } else if (property === 'fontSize') {
    clip.text.fontSize = clamp(Number(value) / 100, 0.01, 0.5);
  } else if (property === 'color') {
    clip.text.color = value;
  } else if (property === 'background') {
    clip.text.background = value;
  } else if (property === 'x') {
    clip.text.x = clamp(Number(value) / 100, 0, 1);
  } else if (property === 'y') {
    clip.text.y = clamp(Number(value) / 100, 0, 1);
  } else if (property === 'scaleX') {
    clip.text.scaleX = clamp(Number(value) / 100, 0.1, 6);
  } else if (property === 'animInDuration') {
    if (!clip.text.animIn) clip.text.animIn = { type: 'typewriter', duration: clamp(Number(value), 0.2, 4) };
    else clip.text.animIn.duration = clamp(Number(value), 0.2, 4);
  }
  updateTextTools(clip);
  renderTextOverlays(state.playhead);
  selectClip(clip.id);
}

function updateHtmlTools(clip) {
  const canHtml = clip?.kind === 'html';
  elements.htmlTools.hidden = !canHtml;
  if (canHtml) {
    clip.html = normalizeHtml(clip.html);
    const html = clip.html;
    elements.htmlCode.value = html.code;
    elements.htmlInputs.forEach((input) => {
      const property = input.dataset.property;
      if (property === 'code') return;
      const val = html[property];
      input.value = String(val ?? 0.5);
      const output = document.querySelector(`.val-html-${property}`);
      if (output) output.textContent = String(Math.round((val ?? 0.5) * 100));
    });
    syncHtmlRenderDefaults();
  }
  requestAnimationFrame(updatePreviewWindowSize);
}

const htmlRenderTouched = new Set();

function syncHtmlRenderDefaults() {
  if (!state.canvas?.width || !state.canvas?.height) return;
  const setIfUntouched = (property, value) => {
    if (htmlRenderTouched.has(property)) return;
    const input = elements.htmlRenderInputs.find((item) => item.dataset.renderProperty === property);
    if (!input) return;
    input.value = String(value);
    const output = document.querySelector(`.val-html-render-${property}`);
    if (output) output.textContent = String(Math.round(value));
  };
  setIfUntouched('width', state.canvas.width);
  setIfUntouched('height', state.canvas.height);
}

function handleHtmlInput(event) {
  const target = event.target;
  if (!target.dataset.property) return;
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || clip.kind !== 'html') return;
  recordInputEdit();
  const property = target.dataset.property;
  const value = target.value;
  if (property === 'code') {
    clip.html.code = value;
  } else if (property === 'x' || property === 'y') {
    clip.html[property] = clamp(Number(value), 0, 1);
  } else {
    clip.html[property] = clamp(Number(value), 0.05, 1);
  }
  updateHtmlTools(clip);
  renderHtmlOverlays(state.playhead);
  selectClip(clip.id);
}

function handleHtmlRenderInput(event) {
  const target = event.target;
  if (target.dataset.renderProperty) {
    const property = target.dataset.renderProperty;
    htmlRenderTouched.add(property);
    const output = document.querySelector(`.val-html-render-${property}`);
    if (output) output.textContent = String(Math.round(Number(target.value)));
  }
}

async function renderHtmlClipToVideo() {
  const clip = state.clips.find((item) => item.id === state.selectedId && item.kind === 'html');
  if (!clip) return;
  const code = elements.htmlCode.value.trim();
  if (!code) {
    elements.htmlRenderStatus.textContent = 'Klistra in HTML-kod först.';
    elements.htmlRenderStatus.className = 'html-render-status error';
    return;
  }
  const get = (property, fallback) => {
    const input = elements.htmlRenderInputs.find((item) => item.dataset.renderProperty === property);
    return input ? Number(input.value) : fallback;
  };
  const duration = Math.max(0.5, get('duration', 5));
  const width = Math.max(320, Math.round(get('width', 1280)));
  const height = Math.max(240, Math.round(get('height', 720)));
  const background = elements.htmlRenderBg.value || '#000000';
  const button = elements.htmlRenderClip;
  const status = elements.htmlRenderStatus;
  button.disabled = true;
  status.textContent = 'Rendera HTML till videoklipp…';
  status.className = 'html-render-status';
  try {
    const media = await api('/api/media/html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, duration, width, height, background })
    });
    status.textContent = `Klippet "${media.name}" (${media.width}×${media.height}, ${media.duration.toFixed(1)} s) lades till i mediabiblioteket.`;
    status.className = 'html-render-status ok';
    addMediaClip(media);
  } catch (error) {
    status.textContent = `Rendering misslyckades: ${error.message}`;
    status.className = 'html-render-status error';
  } finally {
    button.disabled = false;
  }
}

function applyTextPreset(presetId) {
  const preset = TEXT_PRESETS[presetId];
  const clip = state.clips.find((item) => item.id === state.selectedId && item.kind === 'text');
  if (!preset || !clip) return;
  recordHistory();
  const userColor = clip.text.color;
  clip.text = normalizeText({
    ...clip.text,
    ...cloneValue(preset),
    color: userColor,
    presetId
  });
  updateTextTools(clip);
  renderTextOverlays(state.playhead);
  updateSelectionInfo(clip);
  persist();
}

function centerSelectedText() {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || clip.kind !== 'text') return;
  recordHistory();
  clip.text.x = 0.5;
  clip.text.y = 0.5;
  updateTextTools(clip);
  renderTextOverlays(state.playhead);
}

function updateAudioTools(clip) {
  const canAudio = clip?.kind === 'audio';
  elements.audioTools.hidden = !canAudio;
  if (!canAudio) return;
  elements.noisePrintStatus.textContent = 'Ingen brusprofil fångad';
  elements.noisePrintStatus.className = 'noise-print-status';
  state.noiseProfileId = null;
  elements.applyNoiseReduction.disabled = true;
  const duration = clipDuration(clip);
  elements.noisePrintStart.value = Math.max(0, Math.min(clip.playheadOffset || 0, duration - 0.3)).toFixed(1);
  elements.noisePrintLength.value = Math.min(0.5, duration).toFixed(1);
  renderWaveform(clip);
}

function renderWaveform(clip) {
  const canvas = elements.audioWaveform;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  if (!clip.mediaId) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#3a6a4a';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Ingen ljuddata', w / 2, h / 2);
    return;
  }
  ctx.fillStyle = '#1a3a22';
  ctx.fillRect(0, 0, w, h);
  const entry = getWaveformData(clip.mediaId, clip.trimStart, clip.trimEnd, w);
  if (!entry) { ctx.fillText('Fel', w / 2, h / 2); return; }
  if (entry.loading) {
    ctx.fillStyle = '#3a6a4a';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Laddar vågform…', w / 2, h / 2);
    const redraw = () => renderWaveform(clip);
    if (!entry.callbacks.includes(redraw)) entry.callbacks.push(redraw);
    return;
  }
  if (!entry.peaks) {
    ctx.fillStyle = '#3a6a4a';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Kunde inte ladda vågform', w / 2, h / 2);
    return;
  }
  if (entry.peaks.length === 0) {
    ctx.fillText('Ingen data', w / 2, h / 2);
    return;
  }
  ctx.fillStyle = '#1a3a22';
  ctx.fillRect(0, 0, w, h);
  drawWaveformPeaks(ctx, w, h, entry.peaks);
  const duration = clipDuration(clip);
  const selStart = Math.max(0, Math.min(Number(elements.noisePrintStart.value) || 0, duration));
  const selLen = Math.max(0, Math.min(Number(elements.noisePrintLength.value) || 0, duration - selStart));
  const selEnd = selStart + selLen;
  const selStartX = (selStart / duration) * w;
  const selEndX = (selEnd / duration) * w;
  if (selLen > 0 && selStartX < selEndX) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    if (selStartX > 0) ctx.fillRect(0, 0, selStartX, h);
    if (selEndX < w) ctx.fillRect(selEndX, 0, w - selEndX, h);
    ctx.fillStyle = 'rgba(74, 222, 128, 0.08)';
    ctx.fillRect(selStartX, 0, selEndX - selStartX, h);
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(selStartX, 0); ctx.lineTo(selStartX, h);
    ctx.moveTo(selEndX, 0); ctx.lineTo(selEndX, h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#4ade80';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(formatTime(clip.trimStart + selStart), selStartX, 10);
    ctx.fillText(formatTime(clip.trimStart + selEnd), selEndX, 10);
  }
  ctx.fillStyle = '#3a6a4a';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(`${formatTime(clip.trimStart || 0)}`, 4, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText(`${formatTime(clip.trimEnd || clip.trimStart + duration)}`, w - 4, h - 4);
}

function getWaveformData(mediaId, start, end, width) {
  if (!mediaId) return null;
  const normalizedStart = Math.max(0, Number(start) || 0);
  const normalizedEnd = Math.max(normalizedStart + 0.01, Number(end) || normalizedStart + 0.01);
  const normalizedWidth = Math.max(32, Math.min(2000, Math.round(Number(width) || 400)));
  const key = `${mediaId}:${normalizedStart.toFixed(3)}:${normalizedEnd.toFixed(3)}:${normalizedWidth}`;
  if (waveformCache.has(key)) return waveformCache.get(key);
  const entry = { loading: true, peaks: null, callbacks: [] };
  waveformCache.set(key, entry);
  const params = new URLSearchParams({
    start: normalizedStart.toFixed(3),
    end: normalizedEnd.toFixed(3),
    width: String(normalizedWidth)
  });
  fetch(`/api/media/${encodeURIComponent(mediaId)}/waveform?${params}`)
    .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
    .then((data) => {
      entry.loading = false;
      entry.peaks = Array.isArray(data.peaks) ? data.peaks : null;
      for (const cb of entry.callbacks) cb();
      entry.callbacks = [];
    })
    .catch(() => {
      entry.loading = false;
      entry.peaks = null;
      for (const cb of entry.callbacks) cb();
      entry.callbacks = [];
    });
  return entry;
}

function drawWaveformPeaks(ctx, width, height, peaks, color = '#6cdf9c') {
  if (!ctx || !Array.isArray(peaks) || peaks.length === 0) return;
  const mid = height / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  peaks.forEach((peak, index) => {
    const x = (index / Math.max(1, peaks.length - 1)) * Math.max(0, width - 1);
    const amplitude = Math.max(1, Number(peak) * mid * 0.95);
    ctx.moveTo(x, mid - amplitude);
    ctx.lineTo(x, mid + amplitude);
  });
  ctx.stroke();
}

function drawTimelineWaveform(canvas, clip) {
  if (!canvas || canvas.width < 1 || canvas.height < 1) return;
  let ctx;
  try { ctx = canvas.getContext('2d'); } catch (e) { return; }
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#0f2517';
  ctx.fillRect(0, 0, w, h);
  const entry = getWaveformData(clip.mediaId, clip.trimStart, clip.trimEnd, w);
  if (!entry || entry.loading) {
    ctx.fillStyle = '#0d1f12';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('⚇', w / 2, h / 2 + 3);
    if (entry && entry.loading) {
      const redraw = () => drawTimelineWaveform(canvas, clip);
      entry.callbacks.push(redraw);
    }
    setClipWaveformLoading(clip.id, true);
    return;
  }
  setClipWaveformLoading(clip.id, false);
  if (!entry.peaks) {
    ctx.fillStyle = '#1a1515';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5a3a3a';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('✕', w / 2, h / 2 + 3);
    return;
  }
  drawWaveformPeaks(ctx, w, h, entry.peaks, '#4ade80');
}

async function captureNoisePrint() {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || clip.kind !== 'audio') return;
  const startOffset = Number(elements.noisePrintStart.value) || 0;
  const length = Number(elements.noisePrintLength.value) || 0.3;
  const clipLen = clipDuration(clip);
  if (startOffset + length > clipLen) {
    elements.noisePrintStatus.textContent = 'Intervallet sträcker sig utanför klippet.';
    elements.noisePrintStatus.className = 'noise-print-status error';
    return;
  }
  const startTime = clip.trimStart + startOffset;
  const endTime = startTime + length;
  elements.captureNoisePrint.disabled = true;
  elements.captureNoisePrint.textContent = 'Fångar…';
  elements.noisePrintStatus.textContent = 'Analyserar brusprofil…';
  elements.noisePrintStatus.className = 'noise-print-status';
  try {
    const result = await api(`/api/media/${encodeURIComponent(clip.mediaId)}/noise-print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime, endTime })
    });
    state.noiseProfileId = result.id;
    state.noiseProfileMediaId = clip.mediaId;
    elements.noisePrintStatus.textContent = `Brusprofil fångad (${result.sampleDuration.toFixed(2)} s)`;
    elements.noisePrintStatus.className = 'noise-print-status captured';
    elements.applyNoiseReduction.disabled = false;
  } catch (error) {
    elements.noisePrintStatus.textContent = `Misslyckades: ${error.message}`;
    elements.noisePrintStatus.className = 'noise-print-status error';
  } finally {
    elements.captureNoisePrint.disabled = false;
    elements.captureNoisePrint.textContent = 'Fånga brusprofil';
  }
}

async function applyNoiseReduction() {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || clip.kind !== 'audio' || !state.noiseProfileId) return;
  const amount = Number(elements.nrAmount.value) / 100;
  elements.applyNoiseReduction.disabled = true;
  elements.applyNoiseReduction.textContent = 'Bearbetar…';
  try {
    const newMedia = await api(`/api/media/${encodeURIComponent(clip.mediaId)}/reduce-noise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noiseProfileId: state.noiseProfileId, amount })
    });
    const newClip = {
      ...clip,
      id: crypto.randomUUID(),
      mediaId: newMedia.id,
      mediaDuration: newMedia.duration,
      name: newMedia.name,
      start: clip.start,
      trimStart: 0,
      trimEnd: newMedia.duration
    };
    state.clips.push(newClip);
    createClipElement(newClip);
    selectClip(newClip.id);
    persist();
    elements.noisePrintStatus.textContent = 'Brusreducering applicerad!';
  } catch (error) {
    elements.noisePrintStatus.textContent = `Misslyckades: ${error.message}`;
    elements.noisePrintStatus.className = 'noise-print-status error';
  } finally {
    elements.applyNoiseReduction.disabled = false;
    elements.applyNoiseReduction.textContent = 'Applicera brusreducering';
  }
}

async function applyNoiseGate() {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || clip.kind !== 'audio') return;
  const threshold = Number(elements.gateThreshold.value) / 100;
  const attack = Number(elements.gateAttack.value);
  const release = Number(elements.gateRelease.value);
  elements.applyNoiseGate.disabled = true;
  elements.applyNoiseGate.textContent = 'Bearbetar…';
  try {
    const newMedia = await api(`/api/media/${encodeURIComponent(clip.mediaId)}/noise-gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threshold, attack, release })
    });
    const newClip = {
      ...clip,
      id: crypto.randomUUID(),
      mediaId: newMedia.id,
      mediaDuration: newMedia.duration,
      name: newMedia.name,
      start: clip.start,
      trimStart: 0,
      trimEnd: newMedia.duration
    };
    state.clips.push(newClip);
    createClipElement(newClip);
    selectClip(newClip.id);
    persist();
    elements.noisePrintStatus.textContent = 'Noise Gate applicerad!';
    elements.noisePrintStatus.className = 'noise-print-status captured';
  } catch (error) {
    elements.noisePrintStatus.textContent = `Misslyckades: ${error.message}`;
    elements.noisePrintStatus.className = 'noise-print-status error';
  } finally {
    elements.applyNoiseGate.disabled = false;
    elements.applyNoiseGate.textContent = 'Applicera Noise Gate';
  }
}

function renderBlurOverlays(time) {
  const active = state.clips.filter((clip) =>
    clip.kind === 'blur' && time >= clip.start && time < clip.start + clipDuration(clip)
  );
  const regions = [];
  active.forEach((clip) => {
    clip.blur = normalizeBlur(clip.blur);
    clip.blur.boxes.forEach((box) => {
      const region = document.createElement('div');
      region.className = 'blur-region';
      region.style.clipPath = `polygon(${box.points.map((point) => `${point.x * 100}% ${point.y * 100}%`).join(', ')})`;
      region.style.setProperty('--blur-radius', `${box.strength}px`);
      regions.push(region);
    });
  });
  elements.blurLayer.replaceChildren(...regions);
  const selected = active.find((clip) => clip.id === state.selectedId);
  if (!selected) return;
  const blur = selected.blur;
  blur.boxes.forEach((box, bi) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('blur-shape');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.dataset.boxIndex = String(bi);
    polygon.setAttribute('points', box.points.map((point) => `${point.x * 100},${point.y * 100}`).join(' '));
    svg.appendChild(polygon);
    elements.blurLayer.appendChild(svg);
    box.points.forEach((point, pi) => {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'blur-handle';
      handle.dataset.boxIndex = String(bi);
      handle.dataset.pointIndex = String(pi);
      handle.setAttribute('aria-label', `Blur-hörnpunkt ${pi + 1}`);
      handle.style.left = `${point.x * 100}%`;
      handle.style.top = `${point.y * 100}%`;
      elements.blurLayer.appendChild(handle);
    });
  });
}

function polygonIsValid(points) {
  if (!Array.isArray(points) || points.length !== 4) return false;
  const crosses = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const after = points[(index + 2) % points.length];
    return (next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x);
  });
  const sameDirection = crosses.every((value) => value > 0.0005) || crosses.every((value) => value < -0.0005);
  const area = Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
  return sameDirection && area >= 0.005;
}

function getColorLayer() {
  let layer = elements.previewWindow.querySelector('.color-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'color-layer';
    elements.previewWindow.appendChild(layer);
  }
  return layer;
}

function renderColorOverlays(time) {
  const layer = getColorLayer();
  const active = state.clips.filter((clip) =>
    clip.kind === 'color' && time >= clip.start && time < clip.start + clipDuration(clip)
  );

  const activeIds = new Set(active.map((c) => c.id));

  for (let i = layer.children.length - 1; i >= 0; i--) {
    const el = layer.children[i];
    if (el.classList.contains('color-resize-handle')) continue;
    if (!activeIds.has(el.dataset.id)) el.remove();
  }

  const selectedId = state.selectedId;
  active.forEach((clip) => {
    clip.color = normalizeColorBlock(clip.color);
    const c = clip.color;
    let block = layer.querySelector(`.color-block[data-id="${CSS.escape(clip.id)}"]`);
    if (!block) {
      block = document.createElement('div');
      block.className = 'color-block';
      block.dataset.id = clip.id;
      layer.appendChild(block);
    }
    block.classList.toggle('selected', clip.id === selectedId);
    block.style.left = `${c.x * 100}%`;
    block.style.top = `${c.y * 100}%`;
    block.style.width = `${c.width * 100}%`;
    block.style.height = `${c.height * 100}%`;
    block.style.background = c.color;
  });

  for (let i = layer.children.length - 1; i >= 0; i--) {
    const el = layer.children[i];
    if (!el.classList.contains('color-resize-handle')) continue;
    if (el.dataset.id !== selectedId || !activeIds.has(selectedId)) el.remove();
  }

  if (selectedId && activeIds.has(selectedId)) {
    const clip = state.clips.find((c) => c.id === selectedId && c.kind === 'color');
    if (clip) {
      const c = clip.color;
      const existingHandles = layer.querySelectorAll('.color-resize-handle');
      const corners = ['nw', 'ne', 'sw', 'se'];
      corners.forEach((corner) => {
        let handle = layer.querySelector(`.color-resize-handle.${corner}[data-id="${CSS.escape(selectedId)}"]`);
        if (!handle) {
          handle = document.createElement('button');
          handle.type = 'button';
          handle.className = `color-resize-handle ${corner}`;
          handle.dataset.id = selectedId;
          handle.dataset.corner = corner;
          handle.setAttribute('aria-label', `Skala från ${corner}-hörnet`);
          layer.appendChild(handle);
        }
        const cx = c.x, cy = c.y, hw = c.width / 2, hh = c.height / 2;
        const lx = corner.includes('w') ? cx - hw : cx + hw;
        const ly = corner.includes('n') ? cy - hh : cy + hh;
        handle.style.left = `${lx * 100}%`;
        handle.style.top = `${ly * 100}%`;
      });
    }
  }
}

function startColorBlockResize(event) {
  const handle = event.target.closest('.color-resize-handle');
  if (!handle) return;
  const clip = state.clips.find((item) => item.id === handle.dataset.id && item.kind === 'color');
  if (!clip) return;
  event.preventDefault();
  event.stopPropagation();
  state.colorResize = {
    clip, corner: handle.dataset.corner, pointerId: event.pointerId,
    startX: event.clientX, startY: event.clientY,
    startColor: { ...clip.color },
    snapshot: editorSnapshot(), historyRecorded: false
  };
  handle.setPointerCapture?.(event.pointerId);
}

function moveColorBlockResize(event) {
  const drag = state.colorResize;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const rect = elements.previewWindow.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dx = (event.clientX - drag.startX) / rect.width;
  const dy = (event.clientY - drag.startY) / rect.height;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;

  if (!drag.historyRecorded) {
    pushHistorySnapshot(drag.snapshot);
    drag.historyRecorded = true;
  }

  const sc = drag.startColor;
  const corner = drag.corner;
  let { x, y, width, height } = sc;

  const signX = corner === 'nw' || corner === 'sw' ? -1 : 1;
  const signY = corner === 'nw' || corner === 'ne' ? -1 : 1;

  let newWidth = clamp(width + signX * dx, 0.05, 1);
  let newHeight = clamp(height + signY * dy, 0.05, 1);
  let newX = clamp(x + dx / 2, newWidth / 2, 1 - newWidth / 2);
  let newY = clamp(y + dy / 2, newHeight / 2, 1 - newHeight / 2);

  drag.clip.color.x = Math.round(newX * 100) / 100;
  drag.clip.color.y = Math.round(newY * 100) / 100;
  drag.clip.color.width = Math.round(newWidth * 100) / 100;
  drag.clip.color.height = Math.round(newHeight * 100) / 100;

  renderColorOverlays(state.playhead);
  updateColorTools(drag.clip);
  event.preventDefault();
}

function stopColorBlockResize(event) {
  if (state.colorResize && state.colorResize.pointerId === event.pointerId) {
    state.colorResize = null;
    persist();
  }
}

function startBlurPointDrag(event) {
  const clip = state.clips.find((item) => item.id === state.selectedId && item.kind === 'blur');
  if (!clip) return;
  const handle = event.target.closest('.blur-handle');
  if (handle) {
    const boxIndex = Number(handle.dataset.boxIndex);
    const pointIndex = Number(handle.dataset.pointIndex);
    state.blurDrag = {
      clip, boxIndex, pointIndex, pointerId: event.pointerId,
      snapshot: editorSnapshot(), historyRecorded: false
    };
    event.preventDefault();
    return;
  }
  if (event.target.tagName === 'polygon') {
    const boxIndex = Number(event.target.dataset.boxIndex);
    state.blurDrag = {
      clip, boxIndex, translate: true, pointerId: event.pointerId,
      lastX: event.clientX, lastY: event.clientY,
      snapshot: editorSnapshot(), historyRecorded: false
    };
    event.preventDefault();
  }
}

function moveBlurPoint(event) {
  if (!state.blurDrag || event.pointerId !== state.blurDrag.pointerId) return;
  const rect = elements.blurLayer.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const boxes = state.blurDrag.clip.blur.boxes;
  const box = boxes[state.blurDrag.boxIndex];
  if (!box) return;

  if (state.blurDrag.translate) {
    const dx = (event.clientX - state.blurDrag.lastX) / rect.width;
    const dy = (event.clientY - state.blurDrag.lastY) / rect.height;
    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return;
    const points = box.points.map((p) => ({
      x: clamp(p.x + dx, 0, 1), y: clamp(p.y + dy, 0, 1)
    }));
    if (!polygonIsValid(points)) return;
    if (!state.blurDrag.historyRecorded) {
      pushHistorySnapshot(state.blurDrag.snapshot);
      state.blurDrag.historyRecorded = true;
    }
    box.points = points;
    state.blurDrag.lastX = event.clientX;
    state.blurDrag.lastY = event.clientY;
    renderBlurOverlays(state.playhead);
    event.preventDefault();
    return;
  }

  const point = {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
  };
  const points = box.points.map((item) => ({ ...item }));
  const currentPoint = points[state.blurDrag.pointIndex];
  if (Math.abs(currentPoint.x - point.x) < 0.0001 && Math.abs(currentPoint.y - point.y) < 0.0001) return;
  points[state.blurDrag.pointIndex] = point;
  if (!polygonIsValid(points)) return;
  if (!state.blurDrag.historyRecorded) {
    pushHistorySnapshot(state.blurDrag.snapshot);
    state.blurDrag.historyRecorded = true;
  }
  box.points = points;
  renderBlurOverlays(state.playhead);
  event.preventDefault();
}

function stopBlurPointDrag(event) {
  if (state.blurDrag && event.pointerId === state.blurDrag.pointerId) state.blurDrag = null;
}

function getTextLayer() {
  let layer = elements.previewWindow.querySelector('.text-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'text-layer';
    elements.previewWindow.appendChild(layer);
  }
  return layer;
}

function renderTextOverlays(time) {
  const layer = getTextLayer();
  const previewHeight = elements.previewWindow.clientHeight || 1;
  const active = state.clips.filter((clip) =>
    clip.kind === 'text' && time >= clip.start && time < clip.start + clipDuration(clip)
  ).sort((a, b) => (a.trackIndex || 0) - (b.trackIndex || 0));
  const boxes = active.map((clip) => {
    clip.text = normalizeText(clip.text);
    const text = clip.text;
    const box = document.createElement('div');
    box.className = 'text-overlay';
    box.dataset.id = clip.id;
    if (clip.id === state.selectedId) box.classList.add('selected');
    box.style.left = `${text.x * 100}%`;
    box.style.top = `${text.y * 100}%`;
    box.style.fontSize = `${Math.round(text.fontSize * previewHeight)}px`;
    box.style.color = text.color;
    const colorStripes = text.variant === 'color-stripes';
    if (colorStripes) {
      box.classList.add('text-color-stripes');
      box.style.color = 'transparent';
      box.style.webkitTextFillColor = 'transparent';
    } else if (text.background && text.background !== 'none' && !text.maskImage) {
      box.style.background = text.background;
      box.style.padding = '0.15em 0.3em';
    }
    if (text.maskImage && !colorStripes) {
      box.classList.add('text-masked');
      box.style.backgroundImage = `url('${text.maskImage}')`;
      box.style.backgroundSize = '200% auto';
      box.style.backgroundPosition = '0% 50%';
      box.style.webkitBackgroundClip = 'text';
      box.style.backgroundClip = 'text';
      box.style.webkitTextFillColor = 'transparent';
      box.style.color = 'transparent';
      box.style.animation = 'text-shimmer 8s linear infinite';
    } else {
      box.classList.remove('text-masked');
      box.style.animation = '';
    }
    box.textContent = text.text;

    const elapsed = time - clip.start;
    const duration = clipDuration(clip);
    const inAnim = text.animIn;
    const outAnim = text.animOut;
    const effIn = inAnim ? Math.min(inAnim.duration, duration * 0.4) : 0;
    const effOut = outAnim ? Math.min(outAnim.duration, duration * 0.3) : 0;
    let opacity = 1;
    let animTransform = '';
    let displayText = text.text;

    const inActive = inAnim && elapsed < effIn;
    const outActive = outAnim && elapsed > duration - effOut;

    if (inActive && !outActive) {
      const progress = effIn > 0 ? clamp(elapsed / effIn, 0, 1) : 1;
      const eased = 1 - Math.pow(1 - progress, 2);
      if (inAnim.type === 'fade') { opacity = eased; }
      else if (inAnim.type === 'slide-left') { animTransform = `translateX(${(1 - eased) * -100}%)`; }
      else if (inAnim.type === 'slide-right') { animTransform = `translateX(${(1 - eased) * 100}%)`; }
      else if (inAnim.type === 'slide-up') { animTransform = `translateY(${(1 - eased) * -100}%)`; }
      else if (inAnim.type === 'slide-down') { animTransform = `translateY(${(1 - eased) * 100}%)`; }
      else if (inAnim.type === 'scale') { animTransform = `scale(${eased})`; }
      else if (inAnim.type === 'typewriter') { displayText = text.text.slice(0, Math.ceil(eased * text.text.length)) || ' '; }
    }
    if (outActive) {
      const outProgress = effOut > 0 ? clamp((elapsed - (duration - effOut)) / effOut, 0, 1) : 1;
      const eased = 1 - Math.pow(1 - outProgress, 2);
      if (outAnim.type === 'fade') { opacity = 1 - eased; }
      else if (outAnim.type === 'slide-left') { animTransform = `translateX(${eased * -100}%)`; }
      else if (outAnim.type === 'slide-right') { animTransform = `translateX(${eased * 100}%)`; }
      else if (outAnim.type === 'slide-up') { animTransform = `translateY(${eased * -100}%)`; }
      else if (outAnim.type === 'slide-down') { animTransform = `translateY(${eased * 100}%)`; }
      else if (outAnim.type === 'scale') { animTransform = `scale(${1 - eased})`; }
      else if (outAnim.type === 'typewriter') { displayText = text.text.slice(0, Math.ceil((1 - eased) * text.text.length)) || ' '; }
    }
    if (opacity < 1 || animTransform || (text.scaleX && text.scaleX !== 1)) {
      box.style.opacity = String(opacity);
      const base = `translate(-50%, -50%)`;
      const scale = (text.scaleX && text.scaleX !== 1) ? ` scale(${text.scaleX})` : '';
      box.style.transform = `${base}${scale}${animTransform ? ' ' + animTransform : ''}`;
    } else {
      box.style.opacity = '';
      box.style.transform = '';
    }
    box.textContent = displayText;
    return box;
  });
  layer.replaceChildren(...boxes);

  const selectedTextId = state.selectedId && state.clips.some((c) => c.id === state.selectedId && c.kind === 'text') ? state.selectedId : null;
  let handleLayer = elements.previewWindow.querySelector('.text-handle-layer');
  if (!handleLayer) {
    handleLayer = document.createElement('div');
    handleLayer.className = 'text-handle-layer';
    elements.previewWindow.appendChild(handleLayer);
  }
  for (let i = handleLayer.children.length - 1; i >= 0; i--) {
    const el = handleLayer.children[i];
    if (el.dataset.id !== selectedTextId) el.remove();
  }
  if (selectedTextId) {
    const clip = state.clips.find((c) => c.id === selectedTextId && c.kind === 'text');
    if (clip) {
      const rect = elements.previewWindow.getBoundingClientRect();
      const fontSize = Math.round(clip.text.fontSize * (elements.previewWindow.clientHeight || 1));
      const estimatedWidth = Math.max(80, clip.text.text.length * fontSize * 0.6);
      const estimatedHeight = fontSize * 1.4;
      const cx = clip.text.x * rect.width;
      const cy = clip.text.y * rect.height;
      const hw = estimatedWidth * (clip.text.scaleX || 1) / 2;
      const hh = estimatedHeight / 2;
      const corners = ['nw', 'ne', 'sw', 'se'];
      corners.forEach((corner) => {
        let handle = handleLayer.querySelector(`.text-handle[data-id="${CSS.escape(selectedTextId)}"][data-handle="${corner}"]`);
        if (!handle) {
          handle = document.createElement('div');
          handle.className = `text-handle text-handle-${corner}`;
          handle.dataset.handle = corner;
          handle.dataset.id = selectedTextId;
          handleLayer.appendChild(handle);
        }
        const lx = corner.includes('w') ? cx - hw : cx + hw;
        const ly = corner.includes('n') ? cy - hh : cy + hh;
        handle.style.left = `${lx}px`;
        handle.style.top = `${ly}px`;
      });
    }
  }
}

function getHtmlLayer() {
  let layer = elements.previewWindow.querySelector('.html-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'html-layer';
    elements.previewWindow.appendChild(layer);
  }
  return layer;
}

function renderHtmlOverlays(time) {
  const layer = getHtmlLayer();
  const active = state.clips.filter((clip) =>
    clip.kind === 'html' && time >= clip.start && time < clip.start + clipDuration(clip)
  ).sort((a, b) => (a.trackIndex || 0) - (b.trackIndex || 0));
  const frames = active.map((clip) => {
    clip.html = normalizeHtml(clip.html);
    const html = clip.html;
    const frame = document.createElement('iframe');
    frame.className = 'html-block';
    frame.dataset.id = clip.id;
    if (clip.id === state.selectedId) frame.classList.add('selected');
    frame.style.left = `${html.x * 100}%`;
    frame.style.top = `${html.y * 100}%`;
    frame.style.width = `${html.width * 100}%`;
    frame.style.height = `${html.height * 100}%`;
    frame.srcdoc = wrapHtmlPreview(html.code);
    frame.setAttribute('scrolling', 'no');
    return frame;
  });
  layer.replaceChildren(...frames);
}

function wrapHtmlPreview(code) {
  if (/<html[\s>]/i.test(code) || /<!doctype/i.test(code)) return code;
  return `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `html,body{margin:0;padding:0;width:100%;height:100%;box-sizing:border-box;overflow:hidden;background:transparent}` +
    `</style></head><body>${code}</body></html>`;
}

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

function renderTranscriptOverlay(time) {
  const layer = elements.transcriptOverlay;
  if (!elements.burnTranscription.checked || state.transcriptionSegments.length === 0) {
    layer.replaceChildren();
    layer.hidden = true;
    return;
  }
  let localTime = time;
  if (state.transcriptionMediaId) {
    const clip = state.clips.find(
      (item) => (item.kind === 'video' || item.kind === 'audio') && item.mediaId === state.transcriptionMediaId &&
        time >= item.start && time <= item.start + clipDuration(item)
    );
    if (clip) localTime = time - clip.start + clip.trimStart;
    else localTime = -1;
  }
  const wordsPerView = Math.max(1, Math.min(20, Number(elements.transcriptWords.value) || 3));
  if (state.transcriptionWords.length > 0) {
    const words = state.transcriptionWords;
    let activeIndex = -1;
    for (let i = 0; i < words.length; i += 1) {
      if (localTime >= words[i].start && localTime < words[i].end) { activeIndex = i; break; }
      if (localTime >= words[i].end) activeIndex = i;
    }
    if (activeIndex < 0) {
      const upcoming = words.findIndex((item) => item.start > localTime);
      if (upcoming > 0) activeIndex = upcoming - 1;
      else if (upcoming === 0) activeIndex = 0;
      else if (upcoming === -1 && localTime > words[words.length - 1].end) activeIndex = words.length - 1;
    }
    if (activeIndex >= 0) {
      const windowStart = Math.max(0, activeIndex - wordsPerView + 1);
      const visible = words.slice(windowStart, activeIndex + 1).map((item) => item.word);
      layer.hidden = false;
      layer.textContent = visible.join(' ');
      return;
    }
  }
  const segment = state.transcriptionSegments.find(
    (item) => localTime >= item.start && localTime < item.end
  );
  if (!segment) {
    layer.replaceChildren();
    layer.hidden = true;
    return;
  }
  const words = segment.text.split(/\s+/).filter(Boolean);
  const span = Math.max(0.001, segment.end - segment.start);
  const progress = (localTime - segment.start) / span;
  const totalChunks = Math.ceil(words.length / wordsPerView);
  const chunkIndex = Math.min(totalChunks - 1, Math.floor(progress * totalChunks));
  const chunk = words.slice(chunkIndex * wordsPerView, chunkIndex * wordsPerView + wordsPerView).join(' ');
  layer.hidden = false;
  layer.textContent = chunk;
}

function startTextDrag(event) {
  const handle = event.target.closest('.text-handle');
  if (handle) {
    const clip = state.clips.find((item) => item.id === handle.dataset.id && item.kind === 'text');
    if (!clip) return;
    selectClip(clip.id);
    const rect = elements.previewWindow.getBoundingClientRect();
    state.textScaleDrag = {
      clip, pointerId: event.pointerId, handle: handle.dataset.handle,
      centerX: rect.left + clip.text.x * rect.width,
      centerY: rect.top + clip.text.y * rect.height,
      startScale: clip.text.scaleX || 1,
      snapshot: editorSnapshot(), historyRecorded: false
    };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const box = event.target.closest('.text-overlay');
  if (!box) return;
  const clip = state.clips.find((item) => item.id === box.dataset.id && item.kind === 'text');
  if (!clip) return;
  selectClip(clip.id);
  state.textDrag = {
    clip, pointerId: event.pointerId, box,
    snapshot: editorSnapshot(), historyRecorded: false
  };
  try { box.setPointerCapture(event.pointerId); } catch (_) {}
  event.preventDefault();
}

function moveTextDrag(event) {
  if (!state.textDrag || event.pointerId !== state.textDrag.pointerId) return;
  const rect = elements.previewWindow.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
  const clip = state.textDrag.clip;
  if (Math.abs(clip.text.x - x) < 0.0005 && Math.abs(clip.text.y - y) < 0.0005) return;
  if (!state.textDrag.historyRecorded) {
    pushHistorySnapshot(state.textDrag.snapshot);
    state.textDrag.historyRecorded = true;
  }
  clip.text.x = x;
  clip.text.y = y;
  renderTextOverlays(state.playhead);
  updateTextTools(clip);
  event.preventDefault();
}

function stopTextDrag(event) {
  if (state.textDrag && event.pointerId === state.textDrag.pointerId) {
    state.textDrag = null;
  }
}

function moveTextScaleDrag(event) {
  if (!state.textScaleDrag || event.pointerId !== state.textScaleDrag.pointerId) return;
  const drag = state.textScaleDrag;
  const clip = drag.clip;
  const dx = event.clientX - drag.centerX;
  const dy = event.clientY - drag.centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const rect = elements.previewWindow.getBoundingClientRect();
  const ref = Math.max(rect.width, rect.height) * 0.25 || 1;
  let scale = clamp(drag.startScale * (dist / ref), 0.1, 6);
  if (Math.abs(scale - clip.text.scaleX) < 0.0005) return;
  if (!drag.historyRecorded) {
    pushHistorySnapshot(drag.snapshot);
    drag.historyRecorded = true;
  }
  clip.text.scaleX = scale;
  renderTextOverlays(state.playhead);
  updateTextTools(clip);
  event.preventDefault();
}

function stopTextScaleDrag(event) {
  if (state.textScaleDrag && event.pointerId === state.textScaleDrag.pointerId) {
    state.textScaleDrag = null;
  }
}

function applyVisualLayout(clip, mediaElement) {
  const sourceWidth = Number(clip.sourceWidth);
  const sourceHeight = Number(clip.sourceHeight);
  if (!sourceWidth || !sourceHeight) return;
  const crop = clip.crop || { left: 0, right: 0, top: 0, bottom: 0 };
  const cropWidth = sourceWidth * (1 - crop.left - crop.right);
  const cropHeight = sourceHeight * (1 - crop.top - crop.bottom);
  const frameWidth = elements.previewWindow.clientWidth;
  const frameHeight = elements.previewWindow.clientHeight;
  const containScale = Math.min(frameWidth / cropWidth, frameHeight / cropHeight);
  const visualScale = clamp(Number(clip.visualScale) || 1, 0.1, 4);
  const scale = containScale * visualScale;
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const cropLeft = crop.left * sourceWidth * scale;
  const cropTop = crop.top * sourceHeight * scale;
  const visibleWidth = cropWidth * scale;
  const visibleHeight = cropHeight * scale;
  const visibleLeft = (frameWidth - visibleWidth) / 2;
  const visibleTop = (frameHeight - visibleHeight) / 2;
  Object.assign(mediaElement.style, {
    position: 'absolute',
    width: `${renderedWidth}px`,
    height: `${renderedHeight}px`,
    left: `${visibleLeft - cropLeft}px`,
    top: `${visibleTop - cropTop}px`,
    objectFit: 'fill',
    clipPath: `inset(${crop.top * 100}% ${crop.right * 100}% ${crop.bottom * 100}% ${crop.left * 100}%)`
  });
  applyTransitionPreview(clip, mediaElement, state.playhead);
  updateVisualScaleOverlay(clip, { left: visibleLeft, top: visibleTop, width: visibleWidth, height: visibleHeight });
  mediaElement.dataset.clipId = clip.id;
}

function updateVisualScaleOverlay(clip, bounds = null) {
  const shouldShow = bounds && clip.id === state.selectedId && !state.cropActive &&
    (clip.kind === 'video' || clip.kind === 'image');
  elements.visualScaleOverlay.hidden = !shouldShow;
  if (!shouldShow) return;
  Object.assign(elements.visualScaleOverlay.style, {
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`
  });
}

function startVisualScaleDrag(event) {
  if (state.cropActive) return;
  const clip = state.clips.find((item) =>
    item.id === state.selectedId && (item.kind === 'video' || item.kind === 'image')
  );
  if (!clip) return;
  const frame = elements.previewWindow.getBoundingClientRect();
  const centerX = frame.left + frame.width / 2;
  const centerY = frame.top + frame.height / 2;
  const initialDistance = Math.hypot(event.clientX - centerX, event.clientY - centerY);
  if (initialDistance < 1) return;
  state.visualScaleDrag = {
    clip,
    pointerId: event.pointerId,
    centerX,
    centerY,
    initialDistance,
    initialScale: clamp(Number(clip.visualScale) || 1, 0.1, 4),
    snapshot: editorSnapshot(),
    historyRecorded: false
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function moveVisualScaleDrag(event) {
  const drag = state.visualScaleDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - drag.centerX, event.clientY - drag.centerY);
  const nextScale = clamp(drag.initialScale * distance / drag.initialDistance, 0.1, 4);
  if (Math.abs(nextScale - (drag.clip.visualScale || 1)) < 0.001) return;
  if (!drag.historyRecorded) {
    pushHistorySnapshot(drag.snapshot);
    drag.historyRecorded = true;
  }
  drag.clip.visualScale = nextScale;
  applyVisualLayout(drag.clip, drag.clip.kind === 'video' ? elements.preview : elements.imagePreview);
  elements.info.textContent = `${describeClip(drag.clip)} · skala ${Math.round(nextScale * 100)}%`;
  event.preventDefault();
}

function stopVisualScaleDrag(event) {
  if (!state.visualScaleDrag || state.visualScaleDrag.pointerId !== event.pointerId) return;
  state.visualScaleDrag = null;
  persist();
}

function applyTransitionPreview(clip, mediaElement, time) {
  mediaElement.style.opacity = '';
  mediaElement.style.transform = '';
  const transition = clip.transitionIn;
  if (transition && time >= clip.start && time < transition.cut) {
    const progress = clamp((time - clip.start) / transition.duration, 0, 1);
    if (transition.type === 'dissolve') mediaElement.style.opacity = String(progress);
    if (transition.type === 'slide-left') mediaElement.style.transform = `translateX(${(1 - progress) * 100}%)`;
    if (transition.type === 'slide-right') mediaElement.style.transform = `translateX(${(1 - progress) * -100}%)`;
    if (transition.type === 'slide-up') mediaElement.style.transform = `translateY(${(1 - progress) * 100}%)`;
    if (transition.type === 'slide-down') mediaElement.style.transform = `translateY(${(1 - progress) * -100}%)`;
  }
  const anim = clip.animIn;
  if (anim && !transition && time >= clip.start && time < clip.start + anim.duration) {
    const progress = clamp((time - clip.start) / anim.duration, 0, 1);
    if (anim.type === 'fade') mediaElement.style.opacity = String(progress);
    if (anim.type === 'scale') mediaElement.style.transform = `scale(${progress})`;
    if (anim.type === 'slide-up') mediaElement.style.transform = `translateY(${(1 - progress) * 100}%)`;
  }
}

function refreshPreviewLayout() {
  const clipId = elements.preview.hidden ? elements.imagePreview.dataset.clipId : elements.preview.dataset.clipId;
  const clip = state.clips.find((item) => item.id === clipId);
  if (!clip) return;
  applyVisualLayout(clip, clip.kind === 'video' ? elements.preview : elements.imagePreview);
}

function warmPreview() {
  const clip = state.clips.find((item) => item.kind === 'video' && item.mediaId);
  if (!clip) return;
  showPreview(clip, 0);
}

function showPreview(clip, sourceTime) {
  const url = `/api/media/${encodeURIComponent(clip.mediaId)}/file`;
  if (elements.preview.dataset.mediaId !== clip.mediaId) {
    elements.preview.src = url;
    elements.preview.dataset.mediaId = clip.mediaId;
  }
  elements.preview.hidden = false;
  elements.preview.muted = !!(clip && clip.muted === true);
  elements.imagePreview.hidden = true;
  elements.placeholder.hidden = true;
  requestAnimationFrame(() => applyVisualLayout(clip, elements.preview));
  const seek = () => { elements.preview.currentTime = clamp(sourceTime, 0, clip.mediaDuration); };
  if (elements.preview.readyState >= 1) seek();
  else elements.preview.addEventListener('loadedmetadata', seek, { once: true });
}

function showImagePreview(clip) {
  elements.preview.pause();
  elements.preview.hidden = true;
  if (elements.imagePreview.dataset.mediaId !== clip.mediaId) {
    elements.imagePreview.src = `/api/media/${encodeURIComponent(clip.mediaId)}/file`;
    elements.imagePreview.dataset.mediaId = clip.mediaId;
  }
  elements.imagePreview.hidden = false;
  elements.placeholder.hidden = true;
  requestAnimationFrame(() => applyVisualLayout(clip, elements.imagePreview));
}

function clearVisualPreview() {
  elements.preview.pause();
  elements.preview.hidden = true;
  elements.imagePreview.hidden = true;
  elements.placeholder.hidden = true;
  elements.visualScaleOverlay.hidden = true;
}

function projectEnd() {
  return state.clips.reduce((end, clip) => Math.max(end, clip.start + clipDuration(clip)), 0);
}

function timelineAudioPlayer(clip) {
  let player = state.timelineAudioPlayers.get(clip.id);
  if (player) return player;
  player = document.createElement('audio');
  player.className = 'timeline-audio-player';
  player.preload = 'auto';
  player.hidden = true;
  player.dataset.clipId = clip.id;
  elements.previewWindow.appendChild(player);
  state.timelineAudioPlayers.set(clip.id, player);
  return player;
}

function stopTimelineAudioPlayers(remove = false) {
  elements.timelineAudio.pause();
  elements.timelineAudio.dataset.mediaId = '';
  for (const [clipId, player] of state.timelineAudioPlayers) {
    player.pause();
    if (remove) {
      player.removeAttribute('src');
      player.remove();
      state.timelineAudioPlayers.delete(clipId);
    }
  }
}

function togglePlayback() {
  if (state.playing) return stopPlayback();
  const end = projectEnd();
  if (end <= 0) return alert('Ladda upp minst ett klipp först.');
  if (state.playhead >= end - 0.01) setPlayhead(0);
  state.playing = true;
  state.playbackOrigin = state.playhead;
  state.playbackStartedAt = performance.now();
  elements.togglePlay.querySelector('use').setAttribute('href', '#icon-pause');
  playbackTick(performance.now());
}

function stopPlayback() {
  state.playing = false;
  if (state.playbackFrame) cancelAnimationFrame(state.playbackFrame);
  state.playbackFrame = null;
  elements.preview.pause();
  stopTimelineAudioPlayers();
  elements.togglePlay.querySelector('use').setAttribute('href', '#icon-play');
}

function playbackTick(now) {
  if (!state.playing) return;
  const time = state.playbackOrigin + (now - state.playbackStartedAt) / 1000;
  const end = projectEnd();
  if (time >= end) {
    setPlayhead(end, false);
    stopPlayback();
    return;
  }
  setPlayhead(time, false);
  syncPlaybackMedia(time);
  state.playbackFrame = requestAnimationFrame(playbackTick);
}

function maxTrackFor(time, kinds) {
  let max = 0;
  for (const clip of state.clips) {
    if (!kinds.includes(clip.kind)) continue;
    if (time < clip.start || time >= clip.start + clipDuration(clip)) continue;
    max = Math.max(max, clip.trackIndex || 0);
  }
  return max;
}

const OVERLAY_BASE = { 'color-layer': 2, 'blur-layer': 3, 'text-layer': 4, 'html-layer': 5 };
function setOverlayZ(className, maxTrack) {
  const el = className === 'blur-layer' ? elements.blurLayer : elements.previewWindow.querySelector('.' + className);
  if (el) el.style.zIndex = String(OVERLAY_BASE[className] + maxTrack * 10);
}

function syncPlaybackMedia(time) {
  const visual = timelineModel.topActiveVisual(state.clips, time);
  if (visual?.kind === 'image') showImagePreview(visual);
  if (visual?.kind === 'video') {
    const sourceTime = visual.trimStart + time - visual.start;
    const changed = elements.preview.dataset.mediaId !== visual.mediaId;
    elements.preview.hidden = false;
    elements.preview.muted = !!visual.muted;
    elements.imagePreview.hidden = true;
    elements.placeholder.hidden = true;
    if (changed) showPreview(visual, sourceTime);
    if (!changed && Math.abs(elements.preview.currentTime - sourceTime) > 0.4) elements.preview.currentTime = sourceTime;
    elements.preview.play().catch(() => {});
  }
  if (!visual) clearVisualPreview();
  const baseTrack = visual ? (visual.trackIndex || 0) : -1;
  if (elements.imagePreview.style) elements.imagePreview.style.zIndex = String(Math.max(0, baseTrack * 10));
  if (elements.preview.style) elements.preview.style.zIndex = String(Math.max(0, baseTrack * 10));
  const maxColor = maxTrackFor(time, ['color']);
  const maxBlur = maxTrackFor(time, ['blur']);
  const maxText = maxTrackFor(time, ['text']);
  const maxHtml = maxTrackFor(time, ['html']);
  setOverlayZ('color-layer', maxColor);
  setOverlayZ('blur-layer', maxBlur);
  setOverlayZ('text-layer', maxText);
  setOverlayZ('html-layer', maxHtml);
  renderBlurOverlays(time);
  renderColorOverlays(time);
  renderTextOverlays(time);
  renderHtmlOverlays(time);

  const activeAudio = state.clips.filter((clip) =>
    clip.kind === 'audio' && time >= clip.start && time < clip.start + clipDuration(clip)
  );
  const activeIds = new Set(activeAudio.map((clip) => clip.id));
  for (const [clipId, player] of state.timelineAudioPlayers) {
    if (activeIds.has(clipId)) continue;
    player.pause();
    if (!state.clips.some((clip) => clip.id === clipId)) {
      player.remove();
      state.timelineAudioPlayers.delete(clipId);
    }
  }
  for (const audio of activeAudio) {
    const player = timelineAudioPlayer(audio);
    const sourceTime = audio.trimStart + time - audio.start;
    const changed = player.dataset.mediaId !== audio.mediaId;
    const seek = () => {
      try {
        player.currentTime = clamp(sourceTime, 0, audio.mediaDuration);
      } catch (_error) { /* metadata laddas fortfarande */ }
    };
    if (changed) {
      player.src = `/api/media/${encodeURIComponent(audio.mediaId)}/file`;
      player.dataset.mediaId = audio.mediaId;
      if (player.readyState >= 1) seek();
      else player.addEventListener('loadedmetadata', seek, { once: true });
    } else if (player.readyState >= 1 && Math.abs(player.currentTime - sourceTime) > 0.5) {
      seek();
    }
    player.play().catch(() => {});
  }
}

function setPlayhead(seconds, updatePreview = true) {
  state.playhead = Math.max(0, seconds);
  updateTimelineWidth();
  elements.playhead.style.left = `${secondsToPixels(state.playhead)}px`;
  updatePlayheadFollowIndicator();
  elements.timecode.textContent = formatTime(state.playhead);
  const p = state.playhead;
  const base = timelineModel.topActiveVisual(state.clips, p);
  const baseTrack = base ? (base.trackIndex || 0) : -1;
  if (elements.imagePreview.style) elements.imagePreview.style.zIndex = String(Math.max(0, baseTrack * 10));
  if (elements.preview.style) elements.preview.style.zIndex = String(Math.max(0, baseTrack * 10));
  setOverlayZ('color-layer', maxTrackFor(p, ['color']));
  setOverlayZ('blur-layer', maxTrackFor(p, ['blur']));
  setOverlayZ('text-layer', maxTrackFor(p, ['text']));
  setOverlayZ('html-layer', maxTrackFor(p, ['html']));
  renderBlurOverlays(state.playhead);
  renderColorOverlays(state.playhead);
  renderTextOverlays(state.playhead);
  renderHtmlOverlays(state.playhead);
  renderTranscriptOverlay(state.playhead);
  if (!updatePreview) return;
  persist();
  const visible = timelineModel.topActiveVisual(state.clips, state.playhead);
  if (visible?.kind === 'video') showPreview(visible, visible.trimStart + state.playhead - visible.start);
  if (visible?.kind === 'image') showImagePreview(visible);
  if (!visible) clearVisualPreview();
  if (state.cropActive) {
    if (visible && visible.id === state.selectedId) showCropOverlay();
    else hideCropOverlay();
  }
}

function timelinePointFromClient(clientX, clientY) {
  const rect = elements.timeline.getBoundingClientRect();
  return {
    x: clamp(clientX - rect.left, 0, elements.timeline.scrollWidth || rect.width),
    y: clamp(clientY - rect.top, 0, elements.timeline.scrollHeight || rect.height)
  };
}

function marqueeClipBounds(element) {
  const timelineRect = elements.timeline.getBoundingClientRect();
  const clipRect = element.getBoundingClientRect();
  if (clipRect.width > 0 && clipRect.height > 0) {
    return {
      left: clipRect.left - timelineRect.left,
      top: clipRect.top - timelineRect.top,
      right: clipRect.right - timelineRect.left,
      bottom: clipRect.bottom - timelineRect.top
    };
  }
  const left = Number.parseFloat(element.style.left) || element.offsetLeft || 0;
  const top = (element.parentElement?.offsetTop || 0) + (element.offsetTop || 0);
  const width = Number.parseFloat(element.style.width) || element.offsetWidth || 0;
  const height = element.offsetHeight || 64;
  return { left, top, right: left + width, bottom: top + height };
}

function updateMarqueeSelection() {
  const action = state.action;
  if (!action || action.type !== 'marquee' || !action.active) return;
  const current = timelinePointFromClient(action.clientX, action.clientY);
  const left = Math.min(action.anchor.x, current.x);
  const top = Math.min(action.anchor.y, current.y);
  const right = Math.max(action.anchor.x, current.x);
  const bottom = Math.max(action.anchor.y, current.y);
  action.box.style.left = `${left}px`;
  action.box.style.top = `${top}px`;
  action.box.style.width = `${right - left}px`;
  action.box.style.height = `${bottom - top}px`;

  const ids = state.clips
    .filter((clip) => {
      const element = document.querySelector(`.clip[data-id="${CSS.escape(clip.id)}"]`);
      if (!element) return false;
      const bounds = marqueeClipBounds(element);
      return bounds.left < right && bounds.right > left && bounds.top < bottom && bounds.bottom > top;
    })
    .map((clip) => clip.id);
  for (const id of action.baseSelection) {
    if (!ids.includes(id)) ids.push(id);
  }
  const selectionKey = ids.join('\0');
  if (selectionKey === action.selectionKey) return;
  action.selectionKey = selectionKey;
  const primaryId = ids.includes(state.selectedId) ? state.selectedId : ids[0] || null;
  selectClips(ids, primaryId, { preventPlayheadJump: true, refreshPreview: false });
}

function runMarqueeAutoScroll() {
  const action = state.action;
  if (!action || action.type !== 'marquee' || !action.active) return;
  const rect = elements.scroll.getBoundingClientRect();
  let speed = 0;
  if (action.clientX < rect.left + MARQUEE_SCROLL_EDGE) {
    speed = -MARQUEE_MAX_SCROLL_SPEED * clamp((rect.left + MARQUEE_SCROLL_EDGE - action.clientX) / MARQUEE_SCROLL_EDGE, 0, 1);
  } else if (action.clientX > rect.right - MARQUEE_SCROLL_EDGE) {
    speed = MARQUEE_MAX_SCROLL_SPEED * clamp((action.clientX - (rect.right - MARQUEE_SCROLL_EDGE)) / MARQUEE_SCROLL_EDGE, 0, 1);
  }
  const previousScrollLeft = elements.scroll.scrollLeft;
  elements.scroll.scrollLeft += speed;
  if (elements.scroll.scrollLeft !== previousScrollLeft) updateMarqueeSelection();
  action.animationFrame = requestAnimationFrame(runMarqueeAutoScroll);
}

function activateMarquee(action) {
  action.active = true;
  action.box = document.createElement('div');
  action.box.className = 'timeline-selection-box';
  action.box.setAttribute('aria-hidden', 'true');
  elements.timeline.appendChild(action.box);
  document.body.classList.add('timeline-selecting');
  updateMarqueeSelection();
  action.animationFrame = requestAnimationFrame(runMarqueeAutoScroll);
}

function finishMarquee(action) {
  if (action.animationFrame) cancelAnimationFrame(action.animationFrame);
  action.box?.remove();
  document.body.classList.remove('timeline-selecting');
  if (!action.active) {
    const point = timelinePointFromClient(action.clientX, action.clientY);
    setPlayhead(pixelsToSeconds(point.x));
    selectClip(null);
  } else {
    selectClips([...state.selectedIds], state.selectedId, { preventPlayheadJump: true });
  }
}

elements.timeline.addEventListener('dblclick', (event) => {
  const clipElement = event.target.closest('.clip[data-id]');
  if (!clipElement || event.target.closest('button, .handle')) return;
  const clip = state.clips.find((item) => item.id === clipElement.dataset.id);
  if (!clip) return;
  const point = timelinePointFromClient(event.clientX, event.clientY);
  setPlayhead(pixelsToSeconds(point.x));
  event.preventDefault();
});

elements.timeline.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  if (state.playing) stopPlayback();
  const clipElement = event.target.closest('.clip');
  if (event.target === elements.playhead || event.target.closest('.playhead')) {
    state.action = { type: 'playhead', originX: event.clientX, original: state.playhead };
  } else if (clipElement) {
    const clip = state.clips.find((item) => item.id === clipElement.dataset.id);
    if (!clip) {
      const timelineStart = Number(clipElement.dataset.timelineStart);
      if (Number.isFinite(timelineStart)) setPlayhead(timelineStart);
      return;
    }
    if (!event.target.closest('.handle') && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      const ids = new Set(state.selectedIds);
      if (ids.has(clip.id)) ids.delete(clip.id);
      else ids.add(clip.id);
      selectClips([...ids], ids.has(clip.id) ? clip.id : [...ids][0] || null);
      event.preventDefault();
      return;
    }
    const handle = event.target.closest('.handle');
    if (state.selectedIds.has(clip.id)) {
      selectClips([...state.selectedIds], clip.id);
    } else {
      selectClip(clip.id);
    }
    const movingIds = new Set(handle ? [clip.id] : state.selectedIds);
    if (!handle) {
      for (const selectedClip of state.clips.filter((item) => movingIds.has(item.id))) {
        const linkedPartner = timelineModel.linkedPartner(state.clips, selectedClip);
        if (linkedPartner) movingIds.add(linkedPartner.id);
      }
    }
    const movingClips = state.clips
      .filter((item) => movingIds.has(item.id))
      .map((item) => ({
        clip: item,
        originalStart: item.start,
        originalTrackIndex: Number.isFinite(item.trackIndex) ? item.trackIndex : 0,
        originalTransitionCut: item.transitionIn?.cut
      }));
    state.action = {
      type: handle ? (handle.classList.contains('left') ? 'resize-left' : 'resize-right') : 'drag',
      originX: event.clientX,
      originY: event.clientY,
      clip,
      original: { start: clip.start, trimStart: clip.trimStart, trimEnd: clip.trimEnd },
      movingClips,
      snapshot: editorSnapshot(), historyRecorded: false
    };
  } else if (event.target.closest('.track')) {
    state.action = {
      type: 'marquee',
      originClientX: event.clientX,
      originClientY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      anchor: timelinePointFromClient(event.clientX, event.clientY),
      active: false,
      box: null,
      animationFrame: null,
      selectionKey: '',
      baseSelection: (event.shiftKey || event.ctrlKey || event.metaKey) ? new Set(state.selectedIds) : new Set()
    };
  } else {
    const point = timelinePointFromClient(event.clientX, event.clientY);
    setPlayhead(pixelsToSeconds(point.x));
    selectClip(null);
  }
  if (state.action) event.preventDefault();
});

function recordTimelineActionHistory(action) {
  if (action.historyRecorded) return;
  pushHistorySnapshot(action.snapshot);
  action.historyRecorded = true;
}

function moveDraggedVisualClipsToTrack(action, targetTrackIndex) {
  const movingVisual = action.movingClips.filter((item) => VISUAL_KINDS.includes(item.clip.kind));
  const primary = movingVisual.find((item) => item.clip.id === action.clip.id);
  if (!primary || !movingVisual.length) return false;
  const minimumTrack = Math.min(...movingVisual.map((item) => item.originalTrackIndex));
  const requestedDelta = targetTrackIndex - primary.originalTrackIndex;
  const trackDelta = Math.max(-minimumTrack, requestedDelta);
  const assignments = movingVisual.map((item) => ({
    item,
    trackIndex: item.originalTrackIndex + trackDelta
  }));
  if (assignments.every(({ item, trackIndex }) => (item.clip.trackIndex || 0) === trackIndex)) return false;

  recordTimelineActionHistory(action);
  ensureVisualTrack(Math.max(...assignments.map(({ trackIndex }) => trackIndex)));
  for (const { item, trackIndex } of assignments) {
    const clip = item.clip;
    clip.trackIndex = trackIndex;
    const element = document.querySelector(`.clip[data-id="${CSS.escape(clip.id)}"]`);
    if (element && element.parentNode !== state.visualTrackEls[trackIndex]) {
      element.remove();
      ensureVisualTrack(trackIndex).appendChild(element);
    }
  }
  return true;
}

document.addEventListener('mousemove', (event) => {
  if (!state.action) return;
  if (state.action.type === 'marquee') {
    state.action.clientX = event.clientX;
    state.action.clientY = event.clientY;
    if (!state.action.active &&
        Math.hypot(event.clientX - state.action.originClientX, event.clientY - state.action.originClientY) >= MARQUEE_DRAG_THRESHOLD) {
      activateMarquee(state.action);
    } else if (state.action.active) {
      updateMarqueeSelection();
    }
    event.preventDefault();
    return;
  }
  const delta = pixelsToSeconds(Math.abs(event.clientX - state.action.originX)) * Math.sign(event.clientX - state.action.originX);
  const action = state.action;
  if (action.type === 'playhead') {
    setPlayhead(action.original + delta);
    return;
  }
  const { clip, original } = action;
  if (!action.historyRecorded && Math.abs(delta) > 0.0001) {
    recordTimelineActionHistory(action);
  }
  if (action.type === 'drag') {
    const minimumStart = Math.min(...action.movingClips.map((item) => item.originalStart));
    const actualDelta = Math.max(-minimumStart, delta);
    for (const moving of action.movingClips) {
      moving.clip.start = moving.originalStart + actualDelta;
      if (moving.clip.transitionIn && Number.isFinite(moving.originalTransitionCut)) {
        moving.clip.transitionIn.cut = moving.originalTransitionCut + actualDelta;
      }
      renderClip(moving.clip);
    }
    const yDelta = event.clientY - action.originY;
    if (Math.abs(yDelta) >= 45) {
      const trackEl = event.target.closest('.track') || document.elementFromPoint?.(event.clientX, event.clientY)?.closest('.track');
      if (trackEl?.classList.contains('visual-track')) {
        const trackIndex = state.visualTrackEls.indexOf(trackEl);
        if (trackIndex >= 0) {
          action.originY = event.clientY;
          moveDraggedVisualClipsToTrack(action, trackIndex);
        }
      } else {
        const topTrack = state.visualTrackEls.at(-1);
        if (topTrack) {
          const topRect = topTrack.getBoundingClientRect();
          if (event.clientY < topRect.top) {
            action.originY = event.clientY;
            moveDraggedVisualClipsToTrack(action, state.visualTrackEls.length);
          }
        }
      }
    }
  }
  if (action.type === 'resize-right') {
    clip.trimEnd = clamp(original.trimEnd + delta, original.trimStart + MIN_CLIP_SECONDS, clip.mediaDuration);
  }
  if (action.type === 'resize-left') {
    const actualDelta = clamp(delta, -original.start, original.trimEnd - original.trimStart - MIN_CLIP_SECONDS);
    clip.start = original.start + actualDelta;
    clip.trimStart = original.trimStart + actualDelta;
    if (clip.trimStart < 0) {
      clip.start -= clip.trimStart;
      clip.trimStart = 0;
    }
  }
  renderClip(clip);
  updateSelectionInfo(clip);
});

function updateSelectionInfo(clip) {
  elements.info.textContent = describeClip(clip);
}
document.addEventListener('mouseup', () => {
  if (state.action?.type === 'marquee') {
    const action = state.action;
    state.action = null;
    finishMarquee(action);
    return;
  }
  const completedAction = state.action;
  const changedClip = completedAction?.clip;
  const changedClips = completedAction?.movingClips?.map((item) => item.clip) || (changedClip ? [changedClip] : []);
  const movedIds = completedAction?.movingClips
    ?.slice()
    .sort((a, b) => a.originalTrackIndex - b.originalTrackIndex)
    .map((item) => item.clip.id) || (changedClip ? [changedClip.id] : []);
  state.action = null;
  if (changedClip && completedAction.historyRecorded) rebuildTrackLayout(movedIds);
  if (changedClips.some((clip) => clip.mediaId === state.transcriptionMediaId)) renderTranscription();
});

function splitSelectedClip() {
  const selectedIds = state.selectedIds.size
    ? new Set(state.selectedIds)
    : new Set(state.selectedId ? [state.selectedId] : []);
  if (!selectedIds.size) return alert('Markera först klippen som ska delas.');

  const targets = state.clips.filter((clip) => {
    if (!selectedIds.has(clip.id)) return false;
    const offset = state.playhead - clip.start;
    return offset > MIN_CLIP_SECONDS && offset < clipDuration(clip) - MIN_CLIP_SECONDS;
  });
  if (!targets.length) return alert('Placera spelhuvudet inuti minst ett markerat klipp.');

  recordHistory();

  const targetIds = new Set(targets.map((clip) => clip.id));
  const rightSideLinkGroups = new Map();
  const affectedLinkGroups = new Set(targets.map((clip) => clip.linkGroupId).filter(Boolean));
  for (const linkGroupId of affectedLinkGroups) {
    const linkedClips = state.clips.filter((clip) => clip.linkGroupId === linkGroupId);
    const allLinkedClipsWillSplit = linkedClips.length > 1 && linkedClips.every((clip) => targetIds.has(clip.id));
    if (allLinkedClipsWillSplit) {
      rightSideLinkGroups.set(linkGroupId, crypto.randomUUID());
    } else {
      for (const linkedClip of linkedClips) delete linkedClip.linkGroupId;
    }
  }

  const rightSideIds = [];
  for (const clip of targets) {
    const oldEnd = clip.trimEnd;
    const oldLinkGroupId = clip.linkGroupId;
    const sourceSplit = clip.trimStart + state.playhead - clip.start;
    clip.trimEnd = sourceSplit;
    const second = cloneValue(clip);
    second.id = crypto.randomUUID();
    second.start = state.playhead;
    second.trimStart = sourceSplit;
    second.trimEnd = oldEnd;
    delete second.transitionIn;
    if (oldLinkGroupId && rightSideLinkGroups.has(oldLinkGroupId)) {
      second.linkGroupId = rightSideLinkGroups.get(oldLinkGroupId);
    } else {
      delete second.linkGroupId;
    }
    state.clips.push(second);
    rightSideIds.push(second.id);
  }

  rebuildTrackLayout();
  selectClips(rightSideIds, rightSideIds[0] || null);
  persist();
}

function removeSelectedClip() {
  const ids = state.selectedIds.size ? new Set(state.selectedIds) : new Set(state.selectedId ? [state.selectedId] : []);
  if (!ids.size) return;
  recordHistory();
  const removed = state.clips.filter((clip) => ids.has(clip.id));
  state.clips = state.clips.filter((clip) => !ids.has(clip.id));
  for (const clip of removed) {
    document.querySelector(`.clip[data-id="${CSS.escape(clip.id)}"]`)?.remove();
    const removedPlayer = state.timelineAudioPlayers.get(clip.id);
    if (removedPlayer) {
      removedPlayer.pause();
      removedPlayer.remove();
      state.timelineAudioPlayers.delete(clip.id);
    }
  }
  state.selectedId = null;
  state.selectedIds = new Set();
  rebuildTrackLayout();
  if (removed.some((clip) => clip.mediaId === state.transcriptionMediaId)) renderTranscription();
  persist();
}

function copySelectedClip() {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip) return false;
  editorHistory.clipboard = cloneValue(clip);
  return true;
}

function insertClipCopy(source, start) {
  const clip = cloneValue(source);
  clip.id = crypto.randomUUID();
  delete clip.linkGroupId;
  delete clip.transitionIn;
  clip.name = `${source.name} (kopia)`;
  clip.start = Math.max(0, start);
  clip.trackIndex = allocateTrack(clip.kind, clip.start, clip.start + clipDuration(clip));
  state.clips.push(clip);
  createClipElement(clip);
  if (clip.mediaId === state.transcriptionMediaId) renderTranscription();
  selectClip(clip.id);
  setPlayhead(clip.start);
  return clip;
}

function pasteClipboard() {
  if (!editorHistory.clipboard) return false;
  recordHistory();
  insertClipCopy(editorHistory.clipboard, state.playhead);
  return true;
}

function cutSelectedClip() {
  if (!copySelectedClip()) return false;
  removeSelectedClip();
  return true;
}

function duplicateSelectedClip() {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip) return false;
  recordHistory();
  insertClipCopy(clip, clip.start + clipDuration(clip));
  return true;
}

function isTextEntry(target) {
  if (!(target instanceof Element)) return false;
  if (target.matches('textarea, select, [contenteditable="true"]')) return true;
  return target.matches('input:not([type="range"]):not([type="checkbox"]):not([type="file"])');
}

function handleKeyboardShortcut(event) {
  const key = event.key.toLowerCase();
  const modifier = event.ctrlKey || event.metaKey;
  const textEntry = isTextEntry(event.target);

  if (key === 'escape' && !elements.aiModal.hidden) {
    event.preventDefault();
    closeAiEditing();
    return;
  }
  if (key === 'escape' && !elements.transitionModal.hidden) {
    event.preventDefault();
    closeTransitionPicker();
    return;
  }

  if (modifier && !textEntry) {
    let handled = true;
    if (key === 'z' && event.shiftKey) redoEdit();
    else if (key === 'z') undoEdit();
    else if (key === 'y') redoEdit();
    else if (key === 'c') handled = copySelectedClip();
    else if (key === 'x') handled = cutSelectedClip();
    else if (key === 'v') handled = pasteClipboard();
    else if (key === 'd') handled = duplicateSelectedClip();
    else handled = false;
    if (handled) event.preventDefault();
    return;
  }

  if (textEntry || event.altKey || modifier) return;
  const formControl = event.target instanceof Element && event.target.matches('input, select, textarea');
  if ((key === 'delete' || key === 'backspace') && state.selectedId) {
    event.preventDefault();
    removeSelectedClip();
  } else if (key === ' ' && !formControl) {
    event.preventDefault();
    togglePlayback();
  } else if (key === 's' && !formControl) {
    event.preventDefault();
    splitSelectedClip();
  } else if ((key === 'arrowleft' || key === 'arrowright') && !formControl) {
    event.preventDefault();
    if (state.playing) stopPlayback();
    const direction = key === 'arrowleft' ? -1 : 1;
    const step = event.shiftKey ? 1 : 1 / 30;
    setPlayhead(clamp(state.playhead + direction * step, 0, projectEnd()));
  } else if (key === 'home' && !formControl) {
    event.preventDefault();
    setPlayhead(0);
  } else if (key === 'end' && !formControl) {
    event.preventDefault();
    setPlayhead(projectEnd());
  } else if (key === 'escape') {
    if (!elements.clipContextMenu.hidden) hideClipContextMenu();
    else if (!elements.modal.hidden) elements.modal.hidden = true;
    else selectClip(null);
  }
}

async function exportProject(format) {
  if (!state.clips.length) return alert('Ladda upp minst ett klipp först.');
  const normalizedFormat = ['mp4', 'mp3', 'wav'].includes(format) ? format : 'mp4';
  const formatLabel = normalizedFormat.toUpperCase();
  elements.modal.hidden = false;
  elements.exportTitle.textContent = `Exporterar ${formatLabel}`;
  elements.progress.value = 0;
  elements.download.hidden = true;
  elements.download.textContent = `Ladda ner ${formatLabel}`;
  elements.cancelExport.hidden = false;
  elements.exportMessage.textContent = 'Skickar tidslinjen till FFmpeg…';
  try {
    const job = await api('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: normalizedFormat,
        canvas: state.canvas,
        quality: normalizedFormat === 'mp4' ? Number(elements.exportQuality.value) : null,
        hardware: normalizedFormat === 'mp4' && elements.useNvidia.checked ? 'nvidia' : 'cpu',
        upscale: normalizedFormat === 'mp4' && elements.useUpscale.checked,
        clips: state.clips.map(({ mediaId, kind, start, trimStart, trimEnd, crop, blur, color, html, text, muted, trackIndex, transitionIn, visualScale, animIn }) => ({
          mediaId, kind, start, trimStart, trimEnd, crop, blur, color, html, text, muted, trackIndex, transitionIn, visualScale, animIn
        }))
      })
    });
    state.currentJobId = job.id;
    pollJob(job.id);
  } catch (error) {
    elements.exportMessage.textContent = `Exporten kunde inte starta: ${error.message}`;
  }
}

async function cancelExport() {
  const id = state.currentJobId;
  elements.cancelExport.disabled = true;
  elements.exportMessage.textContent = 'Avbryter exporten…';
  try {
    await api(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  } catch (error) {
    elements.exportMessage.textContent = `Kunde inte avbryta: ${error.message}`;
  }
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `ca ${seconds} s kvar`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `ca ${m} min ${s} s kvar`;
}

async function pollJob(id) {
  try {
    const job = await api(`/api/jobs/${encodeURIComponent(id)}`);
    elements.progress.value = job.progress || 0;
    const eta = formatEta(job.etaSeconds);
    elements.exportMessage.textContent = job.status === 'queued'
      ? 'Väntar på FFmpeg…'
      : `${job.encoder || 'FFmpeg'} · ${job.progress || 0} %${eta ? ` · ${eta}` : ''}`;
    if (job.status === 'completed') {
      elements.exportMessage.textContent = `Klar med ${job.encoder}.`;
      elements.download.href = `/api/jobs/${encodeURIComponent(id)}/download`;
      elements.download.hidden = false;
      elements.cancelExport.hidden = true;
      return;
    }
    if (job.status === 'failed') {
      elements.exportMessage.textContent = `Exporten misslyckades:\n${job.error}`;
      elements.cancelExport.hidden = true;
      return;
    }
    if (job.status === 'cancelled') {
      elements.exportMessage.textContent = 'Exporten avbröts.';
      elements.cancelExport.hidden = true;
      return;
    }
    if (job.status === 'upscaling') {
      elements.exportMessage.textContent = `Snabb AI super-resolution 2× · ${job.progress || 0} %${eta ? ` · ${eta}` : ''}`;
    }
    elements.cancelExport.hidden = false;
    elements.cancelExport.disabled = false;
    window.setTimeout(() => pollJob(id), 700);
  } catch (error) {
    elements.exportMessage.textContent = `Kunde inte läsa exportstatus: ${error.message}`;
  }
}

function newProject(options = {}) {
  const skipConfirmation = options?.skipConfirmation === true;
  if (!skipConfirmation && state.clips.length > 0 && !confirm('Skapa nytt projekt? Olagrade ändringar förloras.')) {
    return false;
  }
  stopPlayback();
  stopTimelineAudioPlayers(true);
  state.clips.forEach((clip) => {
    document.querySelector(`.clip[data-id="${CSS.escape(clip.id)}"]`)?.remove();
  });
  state.clips = [];
  state.selectedId = null;
  state.selectedIds = new Set();
  state.canvas = null;
  state.cropActive = false;
  state.cropPreview = null;
  state.transcriptionMediaId = null;
  state.transcriptionSegments = [];
  state.transcriptionWords = [];
  state.transcriptionIndex = new Map();
  state.transcriptSearchResults = [];
  state.transcriptSearchCursor = -1;
  state.currentJobId = null;
  state.currentTranscribeJobId = null;
  state.transcribingClipId = null;
  clearDynamicTracks();
  elements.visualTrack.replaceChildren();
  elements.transcriptionTrack.replaceChildren();
  elements.audioTrack.replaceChildren();
  elements.transcriptSearchInput.value = '';
  updateTranscriptSearch();
  hideClipContextMenu();
  hideCropOverlay();
  elements.cropTools.hidden = true;
  clearVisualPreview();
  editorHistory.undo = [];
  editorHistory.redo = [];
  updateTimelineWidth();
  updatePreviewWindowSize();
  syncCanvasControls();
  clearPersisted();
  recordHistory();
  setPlayhead(0);
  return true;
}

function saveProject() {
  const data = {
    version: 2,
    createdAt: new Date().toISOString(),
    canvas: state.canvas ? { ...state.canvas } : null,
    playhead: state.playhead,
    transcriptionMediaId: state.transcriptionMediaId,
    transcriptionSegments: state.transcriptionSegments,
    clips: state.clips.map(({ mediaId, mediaDuration, sourceWidth, sourceHeight, kind, start, trimStart, trimEnd, crop, blur, text, muted, trackIndex, name, linkGroupId, transitionIn, visualScale, animIn }) =>
      ({ mediaId, mediaDuration, sourceWidth, sourceHeight, kind, start, trimStart, trimEnd, crop, blur, text, muted, trackIndex, name, linkGroupId, transitionIn, visualScale, animIn })
    )
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `videoeditor-projekt-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadProject() {
  const file = elements.projectInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.clips || !Array.isArray(data.clips)) throw new Error('Ogiltig projektfil');
    if (state.clips.length > 0 && !confirm('Öppna projekt? Nuvarande projekt ersätts.')) return;
    newProject({ skipConfirmation: true });
    state.transcriptionMediaId = data.transcriptionMediaId || null;
    state.transcriptionSegments = Array.isArray(data.transcriptionSegments) ? data.transcriptionSegments : [];
    rebuildTranscriptionIndex();
    state.clips = timelineModel.compactTrackAssignments(data.clips.map((clip) => {
      if (clip.crop && typeof clip.crop === 'object') clip.crop = { left: clip.crop.left || 0, right: clip.crop.right || 0, top: clip.crop.top || 0, bottom: clip.crop.bottom || 0 };
      if (clip.blur) clip.blur = normalizeBlur(clip.blur);
      return normalizeRestoredClip({ id: crypto.randomUUID(), ...clip });
    }));
    state.selectedId = null;
    state.selectedIds = new Set();
    state.canvas = data.canvas && data.canvas.width ? { width: data.canvas.width, height: data.canvas.height } : null;
    syncCanvasControls();
    clearDynamicTracks();
    elements.visualTrack.replaceChildren();
    elements.transcriptionTrack.replaceChildren();
    elements.audioTrack.replaceChildren();
    state.clips.forEach(createClipElement);
    renderTranscription();
    selectClip(null);
    setPlayhead(data.playhead || 0);
    updateTimelineWidth();
    warmPreview();
    updatePreviewWindowSize();
    recordHistory();
  } catch (error) {
    alert(`Kunde inte öppna projektet: ${error.message}`);
  } finally {
    elements.projectInput.value = '';
  }
}

initialize();
