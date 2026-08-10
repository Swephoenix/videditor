'use strict';

const timelineModel = window.TimelineModel;
if (!timelineModel) throw new Error('timeline-model.js måste laddas före app.js');

const DEFAULT_PX_PER_SECOND = 40;
const MAX_PX_PER_SECOND = 320;
const TIMELINE_FPS = 30;
let timelinePixelsPerSecond = DEFAULT_PX_PER_SECOND;
const waveformCache = new Map();
const MIN_CLIP_SECONDS = 0.1;
const MAX_IMAGE_SECONDS = 4 * 60 * 60;
const MIN_TIMELINE_SECONDS = 90;
const MARQUEE_DRAG_THRESHOLD = 4;
const MARQUEE_SCROLL_EDGE = 72;
const MARQUEE_MAX_SCROLL_SPEED = 24;
const state = {
  clips: [], mediaBin: [], projectName: '', savedProjectName: '', projectNameDirty: false, segmentLibrary: [], projectMediaIds: new Set(), selectedId: null, selectedIds: new Set(), playhead: 0, action: null, nvenc: false, canvas: null,
  playing: false, playbackFrame: null, playbackOrigin: 0, playbackStartedAt: 0, playbackEnd: 0, blurDrag: null, textDrag: null,
  currentJobId: null, pendingExportFormat: 'mp4', pendingExportSelection: null, outputDirectorySelection: null,
  currentTranscribeJobId: null, transcribingClipId: null, transcriptionMediaId: null, transcriptionSegments: [], transcriptionWords: [],
  transcriptionIndex: new Map(), transcriptSearchResults: [], transcriptSearchCursor: -1,
  selectedTranscriptionSegmentIndex: -1, selectedTranscriptionSourceClipId: null, transcriptionEditMode: false,
  visualTrackEls: [], audioTrackEls: [], visualLabelEls: [], audioLabelEls: [], cropActive: false, cropPreview: null,
  flags: [], selectedFlagId: null, editingFlagId: null,
  timelineAudioPlayers: new Map(), mediaPreloaders: new Map(), lastMediaPreloadAt: 0, visualScaleDrag: null, visualMoveDrag: null,
  previewLayers: new Map(), hiddenLayers: new Set(), importLayer: 'auto', timelineActive: false,
  exportWindow: null, segmentSelectionActive: false, segmentDraftStart: null,
  segmentRange: null, segmentPointDrag: null
  , segmentRangeDrag: false, segmentRangeDragMoved: false, segmentRangeDragStart: null, pendingSegmentImport: null,
  pendingTrackPlacement: null
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
  timelineDragbar: document.querySelector('#timeline-dragbar'),
  timelineDragbarThumb: document.querySelector('#timeline-dragbar-thumb'),
  playhead: document.querySelector('#playhead'),
  playheadFollow: document.querySelector('#playhead-follow'),
  snapGuide: document.querySelector('#snap-guide'),
  ruler: document.querySelector('#ruler'),
  segmentSelection: document.querySelector('#segment-selection'),
  segmentSelectionFill: document.querySelector('#segment-selection-fill'),
  segmentInPoint: document.querySelector('#segment-in-point'),
  segmentOutPoint: document.querySelector('#segment-out-point'),
  qtSegmentCopy: document.querySelector('#qt-segment-copy'),
  segmentCopyPopover: document.querySelector('#segment-copy-popover'),
  segmentCopyStatus: document.querySelector('#segment-copy-status'),
  segmentName: document.querySelector('#segment-name'),
  newSegmentButton: document.querySelector('#new-segment-button'),
  newSegmentForm: document.querySelector('#new-segment-form'),
  cancelSegment: document.querySelector('#cancel-segment'),
  newSegmentMeta: document.querySelector('#new-segment-meta'),
  segmentLibraryCount: document.querySelector('#segment-library-count'),
  saveSegment: document.querySelector('#save-segment'),
  segmentLibraryList: document.querySelector('#segment-library-list'),
  copySegment: document.querySelector('#copy-segment'),
  resetSegment: document.querySelector('#reset-segment'),
  closeSegmentCopy: document.querySelector('#close-segment-copy'),
  programClipboard: document.querySelector('#program-clipboard'),
  programClipboardSummary: document.querySelector('#program-clipboard-summary'),
  pasteProgramClipboard: document.querySelector('#paste-program-clipboard'),
  clearProgramClipboard: document.querySelector('#clear-program-clipboard'),
  flagLane: document.querySelector('#flag-lane'),
  flagEditModal: document.querySelector('#flag-edit-modal'),
  flagEditTime: document.querySelector('#flag-edit-time'),
  flagEditNote: document.querySelector('#flag-edit-note'),
  saveFlag: document.querySelector('#save-flag'),
  deleteFlag: document.querySelector('#delete-flag'),
  closeFlagEdit: document.querySelector('#close-flag-edit'),
  qtFlag: document.querySelector('#qt-flag'),
  qtFlagPrev: document.querySelector('#qt-flag-prev'),
  qtFlagNext: document.querySelector('#qt-flag-next'),
  flagPopover: document.querySelector('#flag-popover'),
  flagPopoverAdd: document.querySelector('#flag-popover-add'),
  flagSearchInput: document.querySelector('#flag-search-input'),
  flagPopoverList: document.querySelector('#flag-popover-list'),
  flagPopoverPrev: document.querySelector('#flag-popover-prev'),
  flagPopoverNext: document.querySelector('#flag-popover-next'),
  flagPopoverStatus: document.querySelector('#flag-popover-status'),
  timelineLinkConnectors: document.querySelector('#timeline-link-connectors'),
  visualTrack: document.querySelector('#visual-track'),
  transcriptionTrack: document.querySelector('#transcription-track'),
  transcriptionLabel: document.querySelector('#transcription-label'),
  audioTrack: document.querySelector('#audio-track'),
  mediaInput: document.querySelector('#media-input'),
  mediaPoolInput: document.querySelector('#media-pool-input'),
  mediaPool: document.querySelector('#media-pool'),
  mediaPoolToggle: document.querySelector('#media-pool-toggle'),
  importToMediaPool: document.querySelector('#import-to-media-pool'),
  mediaPoolList: document.querySelector('#media-pool-list'),
  mediaPoolCount: document.querySelector('#media-pool-count'),
  mediaPoolStatus: document.querySelector('#media-pool-status'),
  projectNameDisplay: document.querySelector('#project-name-display'),
  projectNameEditor: document.querySelector('#project-name-editor'),
  saveProjectName: document.querySelector('#save-project-name'),
  preview: document.querySelector('#preview'),
  imagePreview: document.querySelector('#image-preview'),
  timelineAudio: document.querySelector('#timeline-audio'),
  previewWindow: document.querySelector('.preview-window'),
  previewMediaStatus: document.querySelector('#preview-media-status'),
  previewPreloadStatus: document.querySelector('#preview-preload-status'),
  exportFrameLabel: document.querySelector('#export-frame-label'),
  exportFrameOutline: document.querySelector('#export-frame-outline'),
  canvasFormat: document.querySelector('#canvas-format'),
  customCanvasSize: document.querySelector('#custom-canvas-size'),
  canvasWidth: document.querySelector('#canvas-width'),
  canvasHeight: document.querySelector('#canvas-height'),
  canvasWidthSlider: document.querySelector('#canvas-width-slider'),
  canvasHeightSlider: document.querySelector('#canvas-height-slider'),
  canvasWidthValue: document.querySelector('#canvas-width-value'),
  canvasHeightValue: document.querySelector('#canvas-height-value'),
  qtCanvas: document.querySelector('#qt-canvas'),
  canvasPopover: document.querySelector('#canvas-size-popover'),
  canvasSizeSummary: document.querySelector('#canvas-size-summary'),
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
  imageSizeTools: document.querySelector('#image-size-tools'),
  imageWidth: document.querySelector('#image-width'),
  imageHeight: document.querySelector('#image-height'),
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
  toolsPanelResizer: document.querySelector('#tools-panel-resizer'),
  textTools: document.querySelector('#text-tools'),
  textPresetButtons: [...document.querySelectorAll('[data-text-preset]')],
  useNvidia: document.querySelector('#use-nvidia'),
  useUpscale: document.querySelector('#use-upscale'),
  autoFitCanvas: document.querySelector('#auto-fit-canvas'),
  exportSubtitles: document.querySelector('#export-subtitles'),
  exportQuality: document.querySelector('#export-quality'),
  exportSelection: document.querySelector('#export-selection'),
  burnTranscription: document.querySelector('#burn-transcription'),
  quickTranscription: document.querySelector('#qt-transcription'),
  quickStillFrame: document.querySelector('#qt-still-frame'),
  transcriptWords: document.querySelector('#transcript-words'),
  transcriptOverlay: document.querySelector('#transcript-overlay'),
  transcriptionTools: document.querySelector('#transcription-tools'),
  transcriptionToolsSummary: document.querySelector('#transcription-tools-summary'),
  editTranscription: document.querySelector('#edit-transcription'),
  transcriptionEditorAll: document.querySelector('#transcription-editor-all'),
  transcriptionEditorHighlight: document.querySelector('#transcription-editor-highlight'),
  transcriptionEditorHighlightLines: document.querySelector('#transcription-editor-highlight-lines'),
  transcriptionEditorError: document.querySelector('#transcription-editor-error'),
  saveAllTranscription: document.querySelector('#save-all-transcription'),
  copyAllTranscription: document.querySelector('#copy-all-transcription'),
  transcriptionCopyStatus: document.querySelector('#transcription-copy-status'),
  transcribe: document.querySelector('#transcribe'),
  clipContextMenu: document.querySelector('#clip-context-menu'),
  separateFromAudio: document.querySelector('#separate-from-audio'),
  layerContextMenu: document.querySelector('#layer-context-menu'),
  layerContextTitle: document.querySelector('#layer-context-title'),
  layerForward: document.querySelector('#layer-forward'),
  layerBackward: document.querySelector('#layer-backward'),
  transcriptSearchInput: document.querySelector('#transcript-search-input'),
  transcriptSearchPrevious: document.querySelector('#transcript-search-previous'),
  transcriptSearchNext: document.querySelector('#transcript-search-next'),
  transcriptSearchStatus: document.querySelector('#transcript-search-status'),
  transcriptSearchResults: document.querySelector('#transcript-search-results'),
  transcribeModal: document.querySelector('#transcribe-modal'),
  transcribeLanguage: document.querySelector('#transcribe-language'),
  startTranscribe: document.querySelector('#start-transcribe'),
  transcribeProgress: document.querySelector('#transcribe-progress'),
  transcribeMessage: document.querySelector('#transcribe-message'),
  cancelTranscribe: document.querySelector('#cancel-transcribe'),
  closeTranscribeModal: document.querySelector('#close-transcribe-modal'),
  modal: document.querySelector('#export-modal'),
  exportTitle: document.querySelector('#export-title'),
  exportSetup: document.querySelector('#export-setup'),
  outputFolderPath: document.querySelector('#output-folder-path'),
  chooseOutputFolder: document.querySelector('#choose-output-folder'),
  startExport: document.querySelector('#start-export'),
  progress: document.querySelector('#export-progress'),
  exportMessage: document.querySelector('#export-message'),
  cancelExport: document.querySelector('#cancel-export'),
  closeModal: document.querySelector('#close-modal'),
  trackPlacementModal: document.querySelector('#track-placement-modal'),
  trackPlacementTitle: document.querySelector('#track-placement-title'),
  trackPlacementSummary: document.querySelector('#track-placement-summary'),
  trackPlacementSelect: document.querySelector('#track-placement-select'),
  confirmTrackPlacement: document.querySelector('#confirm-track-placement'),
  cancelTrackPlacement: document.querySelector('#cancel-track-placement'),
  historyToggle: document.querySelector('#history-toggle'),
  historyPanel: document.querySelector('#history-panel'),
  historyList: document.querySelector('#history-list'),
  logToggle: document.querySelector('#log-toggle'),
  logPanel: document.querySelector('#log-panel'),
  logList: document.querySelector('#log-list'),
  logClear: document.querySelector('#log-clear'),
  projectInput: document.querySelector('#project-input'),
  toggleTranscription: document.querySelector('#toggle-transcription'),
  transitionModal: document.querySelector('#transition-modal'),
  transitionHelp: document.querySelector('#transition-help'),
  transitionDuration: document.querySelector('#transition-duration'),
  transitionDurationValue: document.querySelector('#transition-duration-value'),
  removeTransition: document.querySelector('#remove-transition'),
  addTransition: document.querySelector('#add-transition'),
  quickTransition: document.querySelector('#qt-transition'),
  linkToggle: document.querySelector('#qt-link'),
  importLayer: document.querySelector('#import-layer')
};

const TOOLS_PANEL_WIDTH_KEY = 'videoeditor:tools-panel-width';
const MEDIA_POOL_COLLAPSED_KEY = 'videoeditor:media-pool-collapsed';
const TOOLS_PANEL_MIN_WIDTH = 300;
const TOOLS_PANEL_MAX_WIDTH = 720;

function clampToolsPanelWidth(width) {
  const viewportLimit = Math.max(TOOLS_PANEL_MIN_WIDTH, window.innerWidth - 360);
  return clamp(Number(width) || 0, TOOLS_PANEL_MIN_WIDTH, Math.min(TOOLS_PANEL_MAX_WIDTH, viewportLimit));
}

function setToolsPanelWidth(width, save = true) {
  const normalized = Math.round(clampToolsPanelWidth(width));
  document.documentElement.style.setProperty('--desktop-inspector-width', `${normalized}px`);
  elements.toolsPanelResizer?.setAttribute('aria-valuenow', String(normalized));
  if (save) {
    try { localStorage.setItem(TOOLS_PANEL_WIDTH_KEY, String(normalized)); } catch (_error) { /* lagring valfri */ }
  }
  return normalized;
}

function loadToolsPanelWidth() {
  let saved = null;
  try { saved = localStorage.getItem(TOOLS_PANEL_WIDTH_KEY); } catch (_error) { /* lagring valfri */ }
  const defaultWidth = elements.toolsPanel.getBoundingClientRect().width || 384;
  setToolsPanelWidth(saved || defaultWidth, false);
}

function initializeToolsPanelResizer() {
  const handle = elements.toolsPanelResizer;
  if (!handle || !elements.toolsPanel) return;
  loadToolsPanelWidth();
  let drag = null;
  handle.addEventListener('pointerdown', (event) => {
    if (window.innerWidth <= 900 || elements.toolsPanel.hidden || event.button !== 0) return;
    event.preventDefault();
    drag = { pointerId: event.pointerId, startX: event.clientX, startWidth: elements.toolsPanel.getBoundingClientRect().width };
    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add('resizing-tools-panel');
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    setToolsPanelWidth(drag.startWidth + drag.startX - event.clientX, false);
  });
  const stopDrag = (event) => {
    if (!drag || (event.pointerId != null && event.pointerId !== drag.pointerId)) return;
    drag = null;
    document.body.classList.remove('resizing-tools-panel');
    try { localStorage.setItem(TOOLS_PANEL_WIDTH_KEY, getComputedStyle(document.documentElement).getPropertyValue('--desktop-inspector-width').trim()); } catch (_error) { /* lagring valfri */ }
  };
  handle.addEventListener('pointerup', stopDrag);
  handle.addEventListener('pointercancel', stopDrag);
  handle.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = elements.toolsPanel.getBoundingClientRect().width;
    const next = event.key === 'ArrowLeft' ? current + 16
      : event.key === 'ArrowRight' ? current - 16
        : event.key === 'Home' ? TOOLS_PANEL_MIN_WIDTH : TOOLS_PANEL_MAX_WIDTH;
    setToolsPanelWidth(next);
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) setToolsPanelWidth(elements.toolsPanel.getBoundingClientRect().width, false);
  });
}

initializeToolsPanelResizer();

function setMediaPoolCollapsed(collapsed, save = true) {
  if (!elements.mediaPool || !elements.mediaPoolToggle) return;
  elements.mediaPool.classList.toggle('collapsed', collapsed);
  elements.mediaPoolToggle.setAttribute('aria-expanded', String(!collapsed));
  elements.mediaPoolToggle.title = collapsed ? 'Visa mediehanteraren' : 'Dölj mediehanteraren';
  elements.mediaPoolToggle.textContent = collapsed ? 'Medier' : 'Fäll ihop';
  if (save) {
    try { localStorage.setItem(MEDIA_POOL_COLLAPSED_KEY, String(collapsed)); } catch (_error) { /* lagring valfri */ }
  }
}

function initializeMediaPool() {
  let collapsed = true;
  try {
    const saved = localStorage.getItem(MEDIA_POOL_COLLAPSED_KEY);
    if (saved != null) collapsed = saved !== 'false';
  } catch (_error) { /* standardläget används */ }
  setMediaPoolCollapsed(collapsed, false);
  elements.mediaPoolToggle?.addEventListener('click', () => {
    setMediaPoolCollapsed(!elements.mediaPool.classList.contains('collapsed'));
  });
}

initializeMediaPool();

const CANVAS_PRESETS = Object.freeze({
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '21:9': { width: 2560, height: 1080 }
});

document.querySelector('#import-files').addEventListener('click', () => selectMediaFromDisk({ addToTimeline: true }));
elements.importToMediaPool.addEventListener('click', () => selectMediaFromDisk({ addToTimeline: false }));
elements.mediaPoolInput.addEventListener('change', () => {
  for (const file of elements.mediaPoolInput.files || []) uploadMediaToLibrary(file);
  elements.mediaPoolInput.value = '';
});
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
elements.confirmTrackPlacement?.addEventListener('click', confirmTrackPlacement);
elements.cancelTrackPlacement?.addEventListener('click', closeTrackPlacementModal);
elements.trackPlacementModal?.addEventListener('click', (event) => {
  if (event.target === elements.trackPlacementModal) closeTrackPlacementModal();
});
elements.canvasFormat.addEventListener('change', applyCanvasFormat);
elements.canvasWidth.addEventListener('change', applyCustomCanvasSize);
elements.canvasHeight.addEventListener('change', applyCustomCanvasSize);
elements.canvasWidth.addEventListener('input', applyCustomCanvasSize);
elements.canvasHeight.addEventListener('input', applyCustomCanvasSize);

function syncCanvasSliders() {
  if (!elements.canvasWidthSlider) return;
  const dims = currentExportDims();
  const canvas = state.canvas || sourceCanvas() || { width: 1600, height: 900 };
  elements.canvasWidthSlider.max = String(canvas.width);
  elements.canvasHeightSlider.max = String(canvas.height);
  elements.canvasWidthSlider.value = String(clamp(dims.width, 64, canvas.width));
  elements.canvasWidthValue.textContent = String(dims.width);
  elements.canvasHeightSlider.value = String(clamp(dims.height, 64, canvas.height));
  elements.canvasHeightValue.textContent = String(dims.height);
  if (elements.canvasSizeSummary) {
    elements.canvasSizeSummary.textContent = `${canvasRatioLabel(dims)} · ${dims.width}×${dims.height}`;
  }
}

function handleCanvasSliderInput(event) {
  const isWidth = event.currentTarget === elements.canvasWidthSlider;
  const value = evenCanvasDimension(Number(event.currentTarget.value));
  if (elements.canvasFormat.value !== 'custom') {
    elements.canvasFormat.value = 'custom';
    elements.customCanvasSize.hidden = false;
  }
  const dims = currentExportDims();
  beginInputEdit();
  setExportWindow(isWidth ? value : dims.width, isWidth ? dims.height : value);
  const next = currentExportDims();
  (isWidth ? elements.canvasWidth : elements.canvasHeight).value = String(isWidth ? next.width : next.height);
  syncCanvasSliders();
  updateAutoFitLabel();
  recordInputEdit();
  persist();
}

elements.canvasWidthSlider.addEventListener('input', handleCanvasSliderInput);
elements.canvasHeightSlider.addEventListener('input', handleCanvasSliderInput);

elements.qtCanvas.addEventListener('click', () => {
  const willOpen = elements.canvasPopover.hidden;
  elements.canvasPopover.hidden = !willOpen;
  elements.qtCanvas.classList.toggle('active', willOpen);
  elements.qtCanvas.setAttribute('aria-expanded', String(willOpen));
  if (willOpen) syncCanvasSliders();
});
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element) || !event.target.closest('#qt-canvas, #canvas-size-popover')) {
    elements.canvasPopover.hidden = true;
    elements.qtCanvas.classList.remove('active');
    elements.qtCanvas.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    elements.canvasPopover.hidden = true;
    elements.qtCanvas.classList.remove('active');
    elements.qtCanvas.setAttribute('aria-expanded', 'false');
  }
});
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
for (const input of [elements.imageWidth, elements.imageHeight]) {
  input.addEventListener('change', () => setSelectedImageSize(input === elements.imageWidth ? 'width' : 'height', input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    input.blur();
  });
}
document.addEventListener('pointermove', moveVisualScaleDrag);
document.addEventListener('pointerup', stopVisualScaleDrag);
elements.preview.addEventListener('pointerdown', startVisualMoveDrag);
elements.imagePreview.addEventListener('pointerdown', startVisualMoveDrag);
document.addEventListener('pointermove', moveVisualMoveDrag);
document.addEventListener('pointerup', stopVisualMoveDrag);
document.addEventListener('pointermove', moveCropDrag);
document.addEventListener('pointerup', stopCropDrag);
elements.mediaInput.addEventListener('change', () => {
  for (const file of elements.mediaInput.files) {
    uploadMedia(file);
  }
  elements.mediaInput.value = '';
});

elements.importLayer.addEventListener('change', () => {
  const value = elements.importLayer.value;
  state.importLayer = value === 'auto' ? 'auto' : Math.max(0, Math.floor(Number(value) || 0));
});

elements.autoFitCanvas.addEventListener('change', updateAutoFitLabel);

function syncExportSubtitlesPrefill() {
  if (elements.exportSubtitles && state.transcriptionSegments.length > 0) {
    elements.exportSubtitles.checked = true;
    updateAutoFitLabel();
  }
}

function exportSubtitleCues(clips = state.clips) {
  if (!elements.exportSubtitles?.checked || !state.transcriptionSegments.length || !state.transcriptionMediaId) return null;
  const clip = clips.find(
    (item) => (item.kind === 'video' || item.kind === 'audio') && item.mediaId === state.transcriptionMediaId
  );
  if (!clip) return null;
  const offset = (clip.start || 0) - (clip.trimStart || 0);
  const cues = [];
  for (const segment of state.transcriptionSegments) {
    const text = String(segment.text || '').trim();
    if (!text) continue;
    const start = Math.max(0, offset + (Number(segment.start) || 0));
    const end = Math.max(start + 0.05, offset + (Number(segment.end) || Number(segment.start) || 0));
    cues.push({ start, end, text });
  }
  return cues.length ? cues : null;
}

elements.exportSubtitles.addEventListener('change', updateAutoFitLabel);

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
function syncTranscriptionToggleButtons() {
  const active = elements.burnTranscription.checked;
  for (const button of [elements.toggleTranscription, elements.quickTranscription]) {
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function toggleTranscriptionOverlay() {
  elements.burnTranscription.checked = !elements.burnTranscription.checked;
  syncTranscriptionToggleButtons();
  renderTranscriptOverlay(state.playhead);
}

elements.burnTranscription.addEventListener('change', () => {
  syncTranscriptionToggleButtons();
  renderTranscriptOverlay(state.playhead);
});
elements.toggleTranscription.addEventListener('click', toggleTranscriptionOverlay);
elements.quickTranscription.addEventListener('click', toggleTranscriptionOverlay);
elements.quickStillFrame.addEventListener('click', captureStillFrame);
syncTranscriptionToggleButtons();
elements.transcriptWords.addEventListener('input', () => renderTranscriptOverlay(state.playhead));
elements.copyAllTranscription.addEventListener('click', copyAllTranscription);
elements.saveAllTranscription.addEventListener('click', saveAllTranscription);
elements.editTranscription.addEventListener('click', () => setTranscriptionEditMode(!state.transcriptionEditMode));
elements.transcriptionEditorAll.addEventListener('input', () => {
  // Programmatic input (for example project integrations) can still enter edit mode;
  // normal users reach this state through the explicit Redigera button because a
  // readonly textarea cannot receive keyboard input.
  if (elements.transcriptionEditorAll.readOnly) {
    state.transcriptionEditMode = true;
    elements.transcriptionEditorAll.readOnly = false;
    elements.editTranscription.textContent = 'Klar';
    elements.saveAllTranscription.disabled = false;
  }
  syncTranscriptionHighlightLines();
  updateTranscriptSearch();
});
elements.transcriptionEditorAll.addEventListener('scroll', syncTranscriptionHighlightScroll);
elements.transcriptionEditorAll.addEventListener('click', jumpToTranscriptionEditorLine);
document.querySelector('#split').addEventListener('click', splitSelectedClip);
elements.remove.addEventListener('click', removeSelectedClip);
document.querySelector('#qt-blur').addEventListener('click', addBlurClip);
document.querySelector('#qt-text').addEventListener('click', addTextClip);
document.querySelector('#qt-html').addEventListener('click', addHtmlClip);
document.querySelector('#qt-split').addEventListener('click', splitSelectedClip);
elements.qtSegmentCopy.addEventListener('click', openSegmentCopyTool);
elements.copySegment.addEventListener('click', copyMarkedSegment);
elements.saveSegment.addEventListener('click', saveNamedSegment);
elements.segmentName.addEventListener('input', () => renderSegmentSelection());
elements.newSegmentButton.addEventListener('click', () => {
  if (!state.segmentSelectionActive || !state.segmentRange) {
    state.segmentSelectionActive = true;
    state.segmentDraftStart = null;
    state.segmentRange = null;
    elements.segmentCopyStatus.textContent = 'Dra över tidslinjen för att markera IN och UT.';
    elements.newSegmentButton.textContent = '＋ Nytt segment';
    renderSegmentSelection();
    return;
  }
  if (!clipsInSegmentRange().length) return;
  const open = elements.newSegmentForm.hidden;
  elements.newSegmentForm.hidden = !open;
  elements.newSegmentButton.setAttribute('aria-expanded', String(open));
  if (open) elements.segmentName.focus();
});
elements.cancelSegment.addEventListener('click', () => {
  elements.newSegmentForm.hidden = true;
  elements.newSegmentButton.setAttribute('aria-expanded', 'false');
  elements.segmentName.value = '';
  renderSegmentSelection();
});
elements.segmentName.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); saveNamedSegment(); }
});
elements.resetSegment.addEventListener('click', resetSegmentSelection);
elements.closeSegmentCopy.addEventListener('click', closeSegmentCopyTool);
elements.pasteProgramClipboard.addEventListener('click', pasteClipboard);
elements.clearProgramClipboard.addEventListener('click', clearProgramClipboard);
elements.ruler.addEventListener('mousedown', startSegmentRangeDrag);
elements.ruler.addEventListener('mousemove', moveSegmentRangeDrag);
document.addEventListener('mousemove', moveSegmentRangeDrag);
document.addEventListener('mouseup', finishSegmentRangeDrag);
elements.timeline.addEventListener('mousedown', startSegmentRangeDrag);
elements.timeline.addEventListener('mousemove', moveSegmentRangeDrag);
elements.ruler.addEventListener('click', (event) => {
  if (state.segmentRangeDragMoved) return;
  setSegmentPointFromRuler(event);
});
elements.segmentInPoint.addEventListener('mousedown', (event) => startSegmentPointDrag('start', event));
elements.segmentOutPoint.addEventListener('mousedown', (event) => startSegmentPointDrag('end', event));
document.addEventListener('mousemove', moveSegmentPointDrag);
document.addEventListener('mouseup', stopSegmentPointDrag);
document.querySelector('#qt-remove').addEventListener('click', removeSelectedClip);
document.querySelector('#qt-crop').addEventListener('click', toggleCropMode);
elements.cropDone.addEventListener('click', () => {
  if (!state.cropActive) return;
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || (clip.kind !== 'video' && clip.kind !== 'image')) return;
  recordHistory();
  clip.crop = { ...(state.cropPreview || clip.crop || { left: 0, right: 0, top: 0, bottom: 0 }) };
  applyVisualLayout(clip, visualMediaElement(clip));
  hideCropOverlay();
  state.cropActive = false;
  elements.cropTools.hidden = true;
  refreshPreviewLayout();
  updateAutoFitLabel();
});
elements.cropCancel.addEventListener('click', cancelCrop);
document.querySelector('#export').addEventListener('click', () => openExportModal('mp4'));
elements.exportSelection.addEventListener('click', () => openExportModal('mp4', 'selection'));
document.querySelector('#export-mp3').addEventListener('click', () => openExportModal('mp3'));
document.querySelector('#export-wav').addEventListener('click', () => openExportModal('wav'));
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
elements.transcriptSearchInput.addEventListener('input', updateTranscriptSearch);
elements.transcriptSearchInput.addEventListener('focus', () => {
  transcriptSearchFocused = true;
  updateTranscriptSearch();
});
elements.transcriptSearchInput.addEventListener('blur', () => {
  transcriptSearchFocused = false;
  elements.transcriptSearchResults.hidden = true;
});
elements.transcriptSearchResults.addEventListener('mousedown', (event) => {
  event.preventDefault();
});
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
  if (!(e.target instanceof Element) || !e.target.closest('.log-wrap')) elements.logPanel.hidden = true;
});
window.renderHistory = renderHistory;

const processLog = [];
const MAX_PROCESS_LOG = 200;

function logProcess(message, level = 'ok') {
  const entry = { time: new Date(), message, level };
  processLog.push(entry);
  if (processLog.length > MAX_PROCESS_LOG) processLog.shift();
  renderProcessLog();
  console.log(`[${level.toUpperCase()}] ${message}`);
}

function renderProcessLog() {
  if (!elements.logList) return;
  elements.logList.replaceChildren(...processLog.slice(-50).map((entry) => {
    const row = document.createElement('div');
    row.className = `log-entry log-entry-${entry.level}`;
    const time = document.createElement('span');
    time.className = 'log-entry-time';
    time.textContent = entry.time.toLocaleTimeString('sv-SE', { hour12: false });
    const msg = document.createElement('span');
    msg.textContent = entry.message;
    row.append(time, msg);
    return row;
  }));
  if (elements.logPanel && !elements.logPanel.hidden) {
    elements.logList.scrollTop = elements.logList.scrollHeight;
  }
}

elements.logToggle.addEventListener('click', () => {
  elements.logPanel.hidden = !elements.logPanel.hidden;
  if (!elements.logPanel.hidden) {
    renderProcessLog();
    elements.logList.scrollTop = elements.logList.scrollHeight;
  }
});
elements.logClear.addEventListener('click', () => {
  processLog.length = 0;
  renderProcessLog();
});

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
  if (!(event.target instanceof Element) || !event.target.closest('#layer-context-menu')) hideLayerContextMenu();
});

function hideLayerContextMenu() {
  elements.layerContextMenu.hidden = true;
}

function previewClipAtPoint(clientX, clientY) {
  const element = document.elementFromPoint?.(clientX, clientY);
  const media = element?.closest?.('[data-clip-id]');
  if (media?.dataset.clipId) {
    const clip = state.clips.find((item) => item.id === media.dataset.clipId);
    if (clip && (clip.kind === 'video' || clip.kind === 'image')) return clip;
  }
  return timelineModel.topActiveVisual(state.clips, state.playhead) || null;
}

function overlappingLayerSiblings(clip) {
  return state.clips
    .filter((candidate) => {
      if (candidate.id === clip.id) return false;
      if (candidate.kind !== 'video' && candidate.kind !== 'image') return false;
      if (!layerVisible(candidate.trackIndex || 0)) return false;
      const candidateEnd = candidate.start + clipDuration(candidate);
      const clipEnd = clip.start + clipDuration(clip);
      return candidate.start < clipEnd && clip.start < candidateEnd;
    })
    .sort((a, b) => (a.trackIndex || 0) - (b.trackIndex || 0));
}

function moveClipLayer(clip, direction) {
  const siblings = overlappingLayerSiblings(clip);
  const currentTrack = clip.trackIndex || 0;
  const target = direction > 0
    ? siblings.find((candidate) => (candidate.trackIndex || 0) > currentTrack)
    : siblings.reverse().find((candidate) => (candidate.trackIndex || 0) < currentTrack);
  if (!target) return false;
  recordHistory();
  const targetTrack = target.trackIndex || 0;
  clip.trackIndex = targetTrack;
  target.trackIndex = currentTrack;
  rebuildTrackLayout([clip.id, target.id]);
  return true;
}

function showLayerContextMenu(event) {
  const clip = previewClipAtPoint(event.clientX, event.clientY);
  if (!clip) {
    hideLayerContextMenu();
    return;
  }
  event.preventDefault();
  if (state.playing) stopPlayback();
  selectClip(clip.id);
  const currentTrack = clip.trackIndex || 0;
  const siblings = overlappingLayerSiblings(clip);
  const canForward = siblings.some((candidate) => (candidate.trackIndex || 0) > currentTrack);
  const canBackward = siblings.some((candidate) => (candidate.trackIndex || 0) < currentTrack);
  elements.layerContextTitle.textContent = `Lager V${currentTrack + 1} · ${clip.name}`;
  elements.layerForward.disabled = !canForward;
  elements.layerBackward.disabled = !canBackward;
  elements.layerContextMenu.hidden = false;
  const menuWidth = elements.layerContextMenu.offsetWidth || 180;
  const menuHeight = elements.layerContextMenu.offsetHeight || 96;
  elements.layerContextMenu.style.left = `${Math.max(4, Math.min(event.clientX, window.innerWidth - menuWidth - 4))}px`;
  elements.layerContextMenu.style.top = `${Math.max(4, Math.min(event.clientY, window.innerHeight - menuHeight - 4))}px`;
  (canForward ? elements.layerForward : elements.layerBackward).focus();
}

elements.previewWindow.addEventListener('contextmenu', showLayerContextMenu);
elements.layerForward.addEventListener('click', () => {
  const clip = state.clips.find((item) => item.id === state.selectedId && (item.kind === 'video' || item.kind === 'image'));
  if (!clip) return;
  moveClipLayer(clip, 1);
  hideLayerContextMenu();
});
elements.layerBackward.addEventListener('click', () => {
  const clip = state.clips.find((item) => item.id === state.selectedId && (item.kind === 'video' || item.kind === 'image'));
  if (!clip) return;
  moveClipLayer(clip, -1);
  hideLayerContextMenu();
});
document.querySelector('#start-transcribe').addEventListener('click', startTranscription);
document.querySelector('#cancel-transcribe').addEventListener('click', cancelTranscribeJob);
document.querySelector('#close-transcribe-modal').addEventListener('click', () => {
  state.currentTranscribeJobId = null;
  elements.transcribeModal.hidden = true;
  elements.startTranscribe.hidden = false;
  elements.startTranscribe.disabled = false;
  elements.transcribeLanguage.disabled = false;
  const clip = state.clips.find(c => c.id === state.transcribingClipId);
  if (clip) setClipTranscribeProgress(clip.id, null);
  state.transcribingClipId = null;
});
document.querySelector('#cancel-export').addEventListener('click', cancelExport);
elements.chooseOutputFolder.addEventListener('click', chooseOutputFolder);
elements.startExport.addEventListener('click', () => exportProject(state.pendingExportFormat));
document.querySelector('#close-modal').addEventListener('click', () => {
  state.currentJobId = null;
  elements.modal.hidden = true;
});

document.addEventListener('keydown', handleKeyboardShortcut);

document.addEventListener('mousedown', (event) => {
  state.timelineActive = Boolean(event.target.closest?.('.timeline-container'));
}, true);

function selectAllClips() {
  if (!state.timelineActive || !state.clips.length) return false;
  selectClips(state.clips.map((clip) => clip.id));
  return true;
}

function isImageFile(file) {
  return Boolean(file && file.type && file.type.startsWith('image/'));
}

async function importClipboardImages(event) {
  if (editorHistory.clipboard) return false;
  if (isTextEntry(event?.target)) return false;
  const files = event?.clipboardData ? Array.from(event.clipboardData.files || []) : [];
  const images = files.filter(isImageFile);
  if (images.length) {
    event.preventDefault();
    for (const file of images) uploadMedia(file);
    return true;
  }
  try {
    if (navigator.clipboard && typeof navigator.clipboard.read === 'function' && document.hasFocus()) {
      const items = await navigator.clipboard.read();
      const found = [];
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const extension = type.split('/')[1].replace('jpeg', 'jpg');
            const file = new File([blob], `klistrad-bild-${Date.now()}.${extension || 'png'}`, { type });
            found.push(file);
          }
        }
      }
      if (found.length) {
        event.preventDefault();
        for (const file of found) uploadMedia(file);
        return true;
      }
    }
  } catch (_error) { /* clipboard-läsning saknar tillstånd – ignorera */ }
  if (files.length) elements.status.textContent = 'Ingen bild i urklipp – kopiera en bild eller ett klipp först.';
  return false;
}

document.addEventListener('paste', (event) => {
  importClipboardImages(event).catch(() => {});
});

function secondsToPixels(seconds) { return seconds * timelinePixelsPerSecond; }
function pixelsToSeconds(pixels) { return Math.max(0, pixels / timelinePixelsPerSecond); }
function clipDuration(clip) { return clip.trimEnd - clip.trimStart; }
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(3).padStart(6, '0')}`;
}

function formatTimelineTimecode(seconds, fps = TIMELINE_FPS) {
  const totalFrames = Math.max(0, Math.round((Number(seconds) || 0) * fps));
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const wholeSeconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return [hours, minutes, wholeSeconds, frames]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
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

function setClipLoadingState(clipId, channel, loading, error = false) {
  const element = document.querySelector(`.clip[data-id="${CSS.escape(clipId)}"]`);
  if (!element) return;
  const key = `loading${String(channel || 'media').replace(/^[a-z]/, (letter) => letter.toUpperCase())}`;
  if (loading) element.dataset[key] = error ? 'error' : '1';
  else delete element.dataset[key];
  const states = Object.keys(element.dataset)
    .filter((name) => name.startsWith('loading'))
    .map((name) => element.dataset[name]);
  const failed = states.includes('error');
  const active = states.some((state) => state === '1' || state === 'error');
  let label = element.querySelector('.clip-loading-label');
  if (!active) {
    label?.remove();
    return;
  }
  if (!label) {
    label = document.createElement('span');
    label.className = 'clip-loading-label';
    label.setAttribute('aria-live', 'polite');
    element.appendChild(label);
  }
  label.textContent = failed ? 'Fel' : 'Laddar';
  label.classList.toggle('is-error', failed);
  updateVisibleClipLoadingLabels();
}

function updateVisibleClipLoadingLabels() {
  const viewport = elements.scroll?.getBoundingClientRect();
  if (!viewport) return;
  document.querySelectorAll('.clip-loading-label').forEach((label) => {
    const clip = label.closest('.clip');
    if (!clip) return;
    const rect = clip.getBoundingClientRect();
    const visibleLeft = Math.max(rect.left, viewport.left);
    const visibleRight = Math.min(rect.right, viewport.right);
    const visibleTop = Math.max(rect.top, viewport.top);
    const visibleBottom = Math.min(rect.bottom, viewport.bottom);
    const visible = visibleRight > visibleLeft && visibleBottom > visibleTop;
    label.hidden = !visible;
    if (!visible || rect.width <= 0) return;
    const centerX = ((visibleLeft + visibleRight) / 2) - rect.left;
    label.style.left = `${Math.max(12, Math.min(rect.width - 12, centerX))}px`;
  });
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

function clipNearTimelineViewport(element, margin = 320) {
  if (!element || !elements.scroll) return true;
  const viewport = elements.scroll.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  if (!viewport.width) return true;
  return rect.right >= viewport.left - margin && rect.left <= viewport.right + margin;
}

function renderVisibleTimelinePreviews() {
  document.querySelectorAll('.clip.video').forEach((element) => {
    if (!clipNearTimelineViewport(element)) return;
    const clip = state.clips.find((item) => item.id === element.dataset.id);
    const canvas = element.querySelector('.clip-thumbs');
    if (clip && canvas?.dataset.thumbnailDeferred === '1') renderClip(clip);
  });
}

function editorSnapshot() {
  return {
    projectName: state.projectName,
    segmentLibrary: cloneValue(state.segmentLibrary),
    projectMediaIds: [...state.projectMediaIds],
    mediaSources: state.mediaBin
      .filter((media) => state.projectMediaIds.has(media.id) && typeof media.sourcePath === 'string' && media.sourcePath)
      .map((media) => ({ id: media.id, name: media.name, sourcePath: media.sourcePath })),
    importLayer: state.importLayer,
    clips: cloneValue(state.clips), selectedId: state.selectedId,
    playhead: state.playhead, canvas: state.canvas ? { ...state.canvas } : null,
    transcriptionMediaId: state.transcriptionMediaId,
    transcriptionSegments: cloneValue(state.transcriptionSegments),
    hiddenLayers: [...state.hiddenLayers],
    exportWindow: state.exportWindow ? { ...state.exportWindow } : null,
    flags: cloneValue(state.flags)
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
    elements.status.textContent = nvenc ? 'NVIDIA CUDA/NVENC redo' : 'NVIDIA GPU krävs för MP4-export';
    elements.status.className = `status ${nvenc ? 'ok' : 'warning'}`;
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
  syncLayerEye();
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
  syncLayerEye();
}

function restoreEditor(snapshot) {
  if (!snapshot) return;
  if (state.playing) stopPlayback();
  stopTimelineAudioPlayers(true);
  editorHistory.restoring = true;
  state.action = null;
  state.projectName = typeof snapshot.projectName === 'string' ? snapshot.projectName : '';
  state.savedProjectName = state.projectName;
  state.projectNameDirty = false;
  state.transcriptionEditMode = false;
  state.projectMediaIds = new Set(Array.isArray(snapshot.projectMediaIds) ? snapshot.projectMediaIds : []);
  state.segmentLibrary = Array.isArray(snapshot.segmentLibrary) ? cloneValue(snapshot.segmentLibrary) : [];
  state.importLayer = snapshot.importLayer === 'auto' || snapshot.importLayer == null
    ? 'auto'
    : Math.max(0, Math.floor(Number(snapshot.importLayer) || 0));
  state.segmentSelectionActive = false;
  state.segmentDraftStart = null;
  state.segmentRange = null;
  state.segmentPointDrag = null;
  state.pendingSegmentImport = null;
  state.pendingTrackPlacement = null;
  if (elements.trackPlacementModal) elements.trackPlacementModal.hidden = true;
  elements.segmentCopyPopover.hidden = true;
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
  state.hiddenLayers = new Set(Array.isArray(snapshot.hiddenLayers) ? snapshot.hiddenLayers : []);
  state.flags = Array.isArray(snapshot.flags) ? cloneValue(snapshot.flags) : [];
  state.exportWindow = snapshot.exportWindow && snapshot.exportWindow.width
    ? { ...snapshot.exportWindow }
    : null;
  state.selectedId = null;
  state.selectedIds = new Set();
  clearDynamicTracks();
  elements.visualTrack.replaceChildren();
  elements.transcriptionTrack.replaceChildren();
  elements.audioTrack.replaceChildren();
  state.clips.forEach(createClipElement);
  renderTranscription();
  renderFlags();
  const selectedId = state.clips.some((clip) => clip.id === snapshot.selectedId) ? snapshot.selectedId : null;
  selectClip(selectedId);
  syncLayerEye();
  setPlayhead(snapshot.playhead);
  updateTimelineWidth();
  updatePreviewWindowSize();
  syncCanvasControls();
  renderSegmentSelection();
  renderSegmentLibrary();
  renderProjectName();
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
  renderProgramClipboard();
  state.visualTrackEls = [elements.visualTrack];
  state.visualLabelEls = [document.querySelector('#visual-label')];
  state.audioTrackEls = [elements.audioTrack];
  state.audioLabelEls = [document.querySelector('#audio-label')];
  syncImportLayerOptions();
  syncLayerEye();
  const saved = loadPersisted();
  if (saved) restoreEditor(saved);
  renderFlags();
  try {
    const savedLanguage = localStorage.getItem('videoeditor:transcribe-language');
    if (elements.transcribeLanguage && savedLanguage && ['auto', 'sv', 'en'].includes(savedLanguage)) {
      elements.transcribeLanguage.value = savedLanguage;
    }
  } catch (_error) { /* lagring valfri */ }
  syncCanvasControls();
  await loadMediaLibrary();
  loadHistory();
  if (editorHistory.undo.length === 0) recordHistory();
  requestAnimationFrame(updatePreviewWindowSize);
  requestAnimationFrame(updateTimelineDragbar);
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
    elements.useNvidia.checked = true;
    elements.useNvidia.disabled = true;
    elements.status.textContent = status.nvenc ? 'NVIDIA CUDA/NVENC redo' : 'NVIDIA GPU saknas – MP4-export blockerad';
    elements.status.className = `status ${status.nvenc ? 'ok' : 'warning'}`;
  } catch (error) {
    elements.status.textContent = error.message;
    elements.status.className = 'status warning';
  }
}

function buildRuler(duration = MIN_TIMELINE_SECONDS) {
  const ruler = document.querySelector('#ruler');
  const fragment = document.createDocumentFragment();
  const labelSpacing = 92;
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];
  const step = steps.find((candidate) => candidate * timelinePixelsPerSecond >= labelSpacing) || steps[steps.length - 1];
  for (let second = 0; second <= duration; second += step) {
    const label = document.createElement('span');
    label.style.left = `${secondsToPixels(second)}px`;
    label.textContent = formatTimelineTimecode(second);
    fragment.appendChild(label);
  }
  ruler.replaceChildren(fragment);
}

function updateTimelineWidth() {
  const lastFlag = state.flags.reduce((max, flag) => Math.max(max, Number(flag.time) || 0), 0);
  const contentEnd = Math.max(projectEnd(), state.playhead, lastFlag);
  const duration = Math.max(MIN_TIMELINE_SECONDS, Math.ceil((contentEnd + 5) / 5) * 5);
  const durationChanged = Number(elements.timeline.dataset.duration) !== duration;
  elements.timeline.dataset.duration = String(duration);
  elements.timeline.style.width = `${secondsToPixels(duration)}px`;
  if (durationChanged) buildRuler(duration);
  updatePlayheadFollowIndicator();
  updateTimelineDragbar();
  enforceMinTimelineZoom();
}

function timelineContentSeconds() {
  const lastFlag = state.flags.reduce((max, flag) => Math.max(max, Number(flag.time) || 0), 0);
  const contentEnd = Math.max(projectEnd(), state.playhead, lastFlag);
  return Math.max(MIN_TIMELINE_SECONDS, contentEnd);
}

function minTimelineZoom() {
  const viewportWidth = elements.scroll?.clientWidth || 800;
  const contentSeconds = timelineContentSeconds();
  const margin = 0.05;
  return Math.max(0.02, (viewportWidth * (1 + margin)) / contentSeconds);
}

function enforceMinTimelineZoom() {
  const min = minTimelineZoom();
  if (timelinePixelsPerSecond >= min) return;
  timelinePixelsPerSecond = min;
  const duration = Number(elements.timeline.dataset.duration) || MIN_TIMELINE_SECONDS;
  elements.timeline.style.width = `${secondsToPixels(duration)}px`;
  buildRuler(duration);
  renderAllClips();
  renderTranscription();
  elements.playhead.style.left = `${secondsToPixels(state.playhead)}px`;
  renderSegmentSelection();
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

function followPlayheadIntoView() {
  const viewportWidth = elements.scroll.clientWidth;
  if (!viewportWidth) return;
  const contentWidth = elements.scroll.scrollWidth;
  if (contentWidth <= viewportWidth + 1) return;
  const playheadX = secondsToPixels(state.playhead);
  const scrollLeft = elements.scroll.scrollLeft;
  const margin = 48;
  const visibleRight = scrollLeft + viewportWidth;
  const isOutsideRight = playheadX >= visibleRight - margin;
  const isOutsideLeft = playheadX <= scrollLeft + margin;
  if (!isOutsideRight && !isOutsideLeft) return;
  const target = clamp(
    isOutsideRight ? playheadX - viewportWidth + margin : playheadX - margin,
    0,
    Math.max(0, contentWidth - viewportWidth)
  );
  elements.scroll.scrollLeft = target;
}

function updateTimelineZoom(nextScale, clientX) {
  const previousScale = timelinePixelsPerSecond;
  const scale = clamp(nextScale, minTimelineZoom(), MAX_PX_PER_SECOND);
  if (Math.abs(scale - previousScale) < 0.01) return;
  const rect = elements.scroll.getBoundingClientRect();
  const pointerX = clamp(clientX - rect.left, 0, rect.width);
  const pointerTime = (elements.scroll.scrollLeft + pointerX) / previousScale;
  timelinePixelsPerSecond = scale;
  const duration = Number(elements.timeline.dataset.duration) || MIN_TIMELINE_SECONDS;
  elements.timeline.style.width = `${secondsToPixels(duration)}px`;
  buildRuler(duration);
  renderAllClips();
  renderTranscription();
  renderFlags();
  renderSegmentSelection();
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
  updateTimelineDragbar();
  updateVisibleClipLoadingLabels();
  renderVisibleTimelinePreviews();
  if (state.action?.type === 'marquee' && state.action.active) updateMarqueeSelection();
});

let dragbarDragging = false;

function updateTimelineDragbar() {
  const bar = elements.timelineDragbar;
  const thumb = elements.timelineDragbarThumb;
  if (!bar || !thumb) return;
  const viewport = elements.scroll.clientWidth;
  const content = elements.scroll.scrollWidth;
  const maxScroll = content - viewport;
  if (!viewport || maxScroll <= 1) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const trackWidth = bar.clientWidth;
  const thumbWidth = Math.max(28, Math.round((viewport / content) * trackWidth));
  thumb.style.width = `${thumbWidth}px`;
  const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);
  thumb.style.left = `${(elements.scroll.scrollLeft / maxScroll) * maxThumbLeft}px`;
}

elements.timelineDragbar.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  const thumb = elements.timelineDragbarThumb;
  const bar = elements.timelineDragbar;
  const trackWidth = bar.clientWidth;
  const thumbWidth = thumb.offsetWidth;
  const maxScroll = elements.scroll.scrollWidth - elements.scroll.clientWidth;
  if (!maxScroll || maxScroll <= 1) return;
  const maxThumbLeft = trackWidth - thumbWidth;
  const setFromClientX = (clientX) => {
    const rect = bar.getBoundingClientRect();
    const thumbCenter = clamp(clientX - rect.left - thumbWidth / 2, 0, maxThumbLeft);
    elements.scroll.scrollLeft = (thumbCenter / maxThumbLeft) * maxScroll;
  };
  if (event.target === thumb) {
    dragbarDragging = true;
    const move = (moveEvent) => setFromClientX(moveEvent.clientX);
    const up = () => {
      dragbarDragging = false;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  } else {
    setFromClientX(event.clientX);
  }
});
document.addEventListener('mousemove', (event) => {
  if (dragbarDragging) event.preventDefault();
});

elements.playheadFollow.addEventListener('click', revealPlayhead);
window.addEventListener('resize', () => {
  updatePlayheadFollowIndicator();
  enforceMinTimelineZoom();
  updateTimelineDragbar();
  renderSegmentSelection();
});

function snapSegmentTime(seconds) {
  return Math.max(0, Math.round((Number(seconds) || 0) * 30) / 30);
}

function segmentTimeFromClientX(clientX) {
  return snapSegmentTime(pixelsToSeconds(timelinePointFromClient(clientX, 0).x));
}

function clipsInSegmentRange() {
  const range = state.segmentRange;
  if (!range) return [];
  return state.clips.filter((clip) =>
    timelineModel.overlaps(clip.start, clip.start + clipDuration(clip), range.start, range.end)
  );
}

function renderSegmentSelection() {
  const range = state.segmentRange;
  const hasDraft = Number.isFinite(state.segmentDraftStart);
  const visible = state.segmentSelectionActive && (range || hasDraft);
  elements.segmentSelection.hidden = !visible;
  elements.qtSegmentCopy.setAttribute('aria-pressed', String(!elements.segmentCopyPopover.hidden));
  updateExportSelectionButton();
  if (!visible) return;

  elements.segmentSelection.style.setProperty('--segment-line-height', `${Math.max(120, elements.timeline.scrollHeight || 300)}px`);
  if (range) {
    const left = secondsToPixels(range.start);
    const right = secondsToPixels(range.end);
    elements.segmentInPoint.hidden = false;
    elements.segmentOutPoint.hidden = false;
    elements.segmentInPoint.style.left = `${left}px`;
    elements.segmentOutPoint.style.left = `${right}px`;
    elements.segmentSelectionFill.hidden = false;
    elements.segmentSelectionFill.style.left = `${left}px`;
    elements.segmentSelectionFill.style.width = `${Math.max(1, right - left)}px`;
    const count = clipsInSegmentRange().length;
    const duration = range.end - range.start;
    elements.newSegmentMeta.textContent = `${formatTime(range.start)}–${formatTime(range.end)} · ${duration.toFixed(0)} s · ${count} klipp`;
    elements.newSegmentButton.disabled = count === 0;
    elements.newSegmentButton.hidden = false;
    elements.newSegmentButton.textContent = count ? 'Spara aktuell markering' : '＋ Nytt segment';
    elements.copySegment.disabled = count === 0;
    elements.saveSegment.disabled = count === 0 || !String(elements.segmentName.value || '').trim();
    elements.segmentCopyStatus.textContent = count
      ? `${formatTime(range.start)}–${formatTime(range.end)} · ${duration.toFixed(2)} s · ${count} klipp`
      : `${formatTime(range.start)}–${formatTime(range.end)} · inga klipp i segmentet`;
    return;
  }

  const left = secondsToPixels(state.segmentDraftStart);
  elements.segmentInPoint.hidden = false;
  elements.segmentInPoint.style.left = `${left}px`;
  elements.segmentOutPoint.hidden = true;
  elements.segmentSelectionFill.hidden = true;
  elements.copySegment.disabled = true;
  elements.saveSegment.disabled = true;
  elements.newSegmentButton.disabled = false;
  elements.newSegmentButton.hidden = false;
  elements.newSegmentButton.textContent = '＋ Nytt segment';
  elements.newSegmentMeta.textContent = 'Aktuell markering saknas.';
  elements.segmentCopyStatus.textContent = `IN ${formatTime(state.segmentDraftStart)} · klicka ut UT i linjalen.`;
}

function openSegmentCopyTool() {
  state.segmentSelectionActive = false;
  state.segmentDraftStart = null;
  state.segmentRange = null;
  elements.segmentCopyPopover.hidden = false;
  elements.segmentCopyStatus.textContent = 'Klicka på “Nytt segment” för att börja markera.';
  elements.copySegment.disabled = true;
  elements.newSegmentButton.disabled = false;
  elements.newSegmentButton.hidden = false;
  elements.newSegmentButton.textContent = '＋ Nytt segment';
  renderSegmentSelection();
}

function closeSegmentCopyTool() {
  state.segmentSelectionActive = false;
  state.pendingSegmentImport = null;
  document.body.classList.remove('segment-import-armed');
  state.segmentPointDrag = null;
  elements.newSegmentForm.hidden = true;
  elements.newSegmentButton.setAttribute('aria-expanded', 'false');
  elements.segmentCopyPopover.hidden = true;
  renderSegmentSelection();
}

function resetSegmentSelection() {
  state.segmentSelectionActive = false;
  state.pendingSegmentImport = null;
  document.body.classList.remove('segment-import-armed');
  state.segmentDraftStart = null;
  state.segmentRange = null;
  elements.segmentCopyPopover.hidden = false;
  elements.segmentCopyStatus.textContent = 'Klicka på “Nytt segment” för att börja markera.';
  elements.copySegment.disabled = true;
  elements.newSegmentButton.disabled = false;
  elements.newSegmentButton.hidden = false;
  elements.newSegmentButton.textContent = '＋ Nytt segment';
  elements.newSegmentForm.hidden = true;
  elements.newSegmentButton.setAttribute('aria-expanded', 'false');
  elements.segmentName.value = '';
  renderSegmentSelection();
}

function setSegmentPointFromRuler(event) {
  if (!state.segmentSelectionActive) return;
  event.preventDefault();
  event.stopPropagation();
  const time = segmentTimeFromClientX(event.clientX);
  if (state.segmentRange || !Number.isFinite(state.segmentDraftStart)) {
    state.segmentRange = null;
    state.segmentDraftStart = time;
    renderSegmentSelection();
    return;
  }
  if (Math.abs(time - state.segmentDraftStart) < MIN_CLIP_SECONDS) {
    renderSegmentSelection();
    elements.segmentCopyStatus.textContent = 'UT måste ligga minst 0,1 s från IN.';
    return;
  }
  state.segmentRange = {
    start: Math.min(state.segmentDraftStart, time),
    end: Math.max(state.segmentDraftStart, time)
  };
  state.segmentDraftStart = null;
  renderSegmentSelection();
}

function startSegmentRangeDrag(event) {
  if (!state.segmentSelectionActive || state.pendingSegmentImport) return;
  event.preventDefault();
  event.stopPropagation();
  state.segmentRangeDrag = true;
  state.segmentRangeDragMoved = false;
  state.segmentRangeDragStart = segmentTimeFromClientX(event.clientX);
  state.segmentDraftStart = state.segmentRangeDragStart;
  state.segmentRange = null;
  renderSegmentSelection();
}

function moveSegmentRangeDrag(event) {
  if (!state.segmentRangeDrag) return;
  event.preventDefault();
  const time = segmentTimeFromClientX(event.clientX);
  if (Math.abs(time - state.segmentRangeDragStart) >= MIN_CLIP_SECONDS) state.segmentRangeDragMoved = true;
  if (!state.segmentRangeDragMoved) return;
  state.segmentRange = {
    start: Math.min(state.segmentRangeDragStart, time),
    end: Math.max(state.segmentRangeDragStart, time)
  };
  state.segmentDraftStart = null;
  renderSegmentSelection();
}

function finishSegmentRangeDrag() {
  if (!state.segmentRangeDrag) return;
  state.segmentRangeDrag = false;
  state.segmentRangeDragStart = null;
  window.setTimeout(() => { state.segmentRangeDragMoved = false; }, 0);
}

function startSegmentPointDrag(role, event) {
  if (!state.segmentRange) return;
  if (!state.segmentSelectionActive) openSegmentCopyTool();
  event.preventDefault();
  event.stopPropagation();
  state.segmentPointDrag = role;
}

function moveSegmentPointDrag(event) {
  if (!state.segmentPointDrag || !state.segmentRange) return;
  event.preventDefault();
  const time = segmentTimeFromClientX(event.clientX);
  if (state.segmentPointDrag === 'start') {
    state.segmentRange.start = clamp(time, 0, state.segmentRange.end - MIN_CLIP_SECONDS);
  } else {
    state.segmentRange.end = Math.max(state.segmentRange.start + MIN_CLIP_SECONDS, time);
  }
  renderSegmentSelection();
}

function stopSegmentPointDrag() {
  state.segmentPointDrag = null;
}

async function uploadFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  await uploadMedia(file);
}

async function selectMediaFromDisk({ addToTimeline = false } = {}) {
  if (!ensureProjectNamed()) return;
  try {
    const result = await api('/api/media/select', { method: 'POST' });
    if (result.cancelled) return;
    const originalPlayhead = state.playhead;
    for (const media of result.media || []) {
      addMediaToProject(media);
      addMediaLibraryItem(media);
    }
    if (addToTimeline && result.media?.length) {
      openTrackPlacementModal({ type: 'media-import', media: result.media, originalPlayhead });
    }
    const count = (result.media || []).length;
    const message = count === 1 ? `${result.media[0].name} importerad utan kopiering.` : `${count} mediefiler importerade utan kopiering.`;
    if (addToTimeline) elements.status.textContent = 'Välj spår för att slutföra importen.';
    else elements.mediaPoolStatus.textContent = message;
  } catch (error) {
    elements.status.textContent = `Kunde inte öppna filväljaren: ${error.message}`;
    elements.mediaPoolStatus.textContent = error.message;
  }
}

async function uploadMedia(file) {
  if (!ensureProjectNamed()) return;
  const form = new FormData();
  form.append('media', file);
  elements.status.textContent = `Laddar ${file.name}…`;
  try {
    const media = await api('/api/media', { method: 'POST', body: form });
    openTrackPlacementModal({ type: 'media-import', media: [media], originalPlayhead: state.playhead });
    elements.status.textContent = 'Välj spår för att slutföra importen.';
  } catch (error) {
    alert(`Uppladdningen misslyckades: ${error.message}`);
    elements.status.textContent = error.message;
  }
}

async function uploadMediaToLibrary(file) {
  if (!ensureProjectNamed()) return;
  const form = new FormData();
  form.append('media', file);
  elements.mediaPoolStatus.textContent = `Importerar ${file.name}…`;
  try {
    const media = await api('/api/media', { method: 'POST', body: form });
    addMediaToProject(media);
    addMediaLibraryItem(media);
    elements.mediaPoolStatus.textContent = `${media.name} ligger i mediebiblioteket.`;
  } catch (error) {
    elements.mediaPoolStatus.textContent = `Importen misslyckades: ${error.message}`;
  }
}

function renderProjectName() {
  const name = state.projectName || 'Namnlöst projekt';
  if (elements.projectNameDisplay) {
    elements.projectNameDisplay.textContent = name;
    elements.projectNameDisplay.title = 'Dubbelklicka för att ändra projektnamnet';
  }
  if (elements.saveProjectName) elements.saveProjectName.hidden = !state.projectNameDirty;
}

function setProjectName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!name) return false;
  const changed = name !== state.projectName;
  state.projectName = name;
  if (changed || state.projectNameDirty) state.projectNameDirty = name !== state.savedProjectName;
  renderProjectName();
  persist();
  return true;
}

async function saveProjectName() {
  if (!state.projectNameDirty) return;
  persist();
  await autoSaveProject();
  state.savedProjectName = state.projectName;
  state.projectNameDirty = false;
  renderProjectName();
}

function ensureProjectNamed() {
  if (state.projectName) return true;
  if (typeof window.prompt !== 'function') return setProjectName('Nytt projekt');
  if (/jsdom/i.test(navigator.userAgent)) return setProjectName('Nytt projekt');
  try { return setProjectName(window.prompt('Döp projektet:', '')); }
  catch (_error) { return setProjectName('Nytt projekt'); }
}

function askForProjectName() {
  if (typeof window.prompt !== 'function') return setProjectName('Nytt projekt');
  if (/jsdom/i.test(navigator.userAgent)) return setProjectName('Nytt projekt');
  try { return setProjectName(window.prompt('Döp projektet:', state.projectName || '')); }
  catch (_error) { return setProjectName('Nytt projekt'); }
}

function beginProjectNameEdit() {
  const editor = elements.projectNameEditor;
  const display = elements.projectNameDisplay;
  if (!editor || !display) return;
  editor.value = state.projectName || '';
  display.hidden = true;
  editor.hidden = false;
  editor.focus();
  editor.select();
}

function finishProjectNameEdit(save = true) {
  const editor = elements.projectNameEditor;
  const display = elements.projectNameDisplay;
  if (!editor || !display || editor.hidden) return;
  if (save) setProjectName(editor.value);
  editor.hidden = true;
  display.hidden = false;
  renderProjectName();
}

elements.projectNameDisplay.addEventListener('dblclick', beginProjectNameEdit);
elements.projectNameEditor.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); finishProjectNameEdit(true); }
  if (event.key === 'Escape') { event.preventDefault(); finishProjectNameEdit(false); }
});
elements.projectNameEditor.addEventListener('blur', () => finishProjectNameEdit(true));
elements.saveProjectName.addEventListener('click', () => {
  saveProjectName().catch((error) => {
    elements.status.textContent = `Kunde inte spara projektnamnet: ${error.message}`;
  });
});

function mediaKindIcon(media) {
  if (media.kind === 'video') return '▣';
  if (media.kind === 'audio') return '♫';
  return '▧';
}

function mediaDurationLabel(media) {
  if (media.kind === 'image') return `${media.width || 0}×${media.height || 0}`;
  const seconds = Number(media.duration);
  return Number.isFinite(seconds) && seconds > 0 ? formatTime(seconds) : media.kind;
}

function addMediaLibraryItem(media) {
  if (!media?.id) return;
  const existing = state.mediaBin.findIndex((item) => item.id === media.id);
  if (existing >= 0) state.mediaBin[existing] = media;
  else state.mediaBin.push(media);
  renderMediaBin();
}

function addMediaToProject(media) {
  if (media?.id) state.projectMediaIds.add(media.id);
}

function insertionDomain(clip) {
  return clip.kind === 'audio' ? `audio:${Math.max(0, Math.trunc(Number(clip.trackIndex) || 0))}` : `visual:${Number(clip.trackIndex) || 0}`;
}

function insertionDomainMatches(domain, clipDomain) {
  if (domain === 'audio:*') return clipDomain.startsWith('audio:');
  return domain === clipDomain;
}

function rippleInsert(start, duration, incomingClips, extraDomains = []) {
  const amount = Number(duration) || 0;
  if (amount <= 0) return;
  const domains = new Set(extraDomains);
  for (const clip of incomingClips || []) domains.add(insertionDomain(clip));
  const crossing = state.clips.filter((clip) =>
    [...domains].some((domain) => insertionDomainMatches(domain, insertionDomain(clip))) &&
    clip.start < start - 1e-7 && clip.start + clipDuration(clip) > start + 1e-7
  );
  const crossingGroups = new Set(crossing.map((clip) => clip.linkGroupId).filter(Boolean));
  const crossingIds = new Set(crossing.map((clip) => clip.id));
  const completeCrossingGroups = new Set([...crossingGroups].filter((groupId) => {
    const linked = state.clips.filter((clip) => clip.linkGroupId === groupId);
    return linked.length > 1 && linked.every((clip) => crossingIds.has(clip.id));
  }));
  const rightIds = new Set();
  const rightGroupIds = new Map();
  const rightClips = [];
  for (const clip of crossing) {
    const oldEnd = clip.trimEnd;
    const splitSource = clip.trimStart + start - clip.start;
    clip.trimEnd = splitSource;
    if (clip.transitionIn) delete clip.transitionIn;
    const right = cloneValue(clip);
    right.id = crypto.randomUUID();
    right.start = start + amount;
    right.trimStart = splitSource;
    right.trimEnd = oldEnd;
    if (clip.linkGroupId && completeCrossingGroups.has(clip.linkGroupId)) {
      if (!rightGroupIds.has(clip.linkGroupId)) rightGroupIds.set(clip.linkGroupId, crypto.randomUUID());
      right.linkGroupId = rightGroupIds.get(clip.linkGroupId);
    } else {
      delete right.linkGroupId;
    }
    rightClips.push(right);
    rightIds.add(right.id);
    renderClip(clip);
  }
  if (rightClips.length) {
    state.clips.push(...rightClips);
    rightClips.forEach(createClipElement);
  }
  const shiftedIds = new Set();
  const shiftGroup = (groupId, delta) => {
    const members = groupId
      ? state.clips.filter((candidate) => candidate.linkGroupId === groupId)
      : [];
    const targets = members.length ? members : [];
    for (const member of targets) {
      if (rightIds.has(member.id) || shiftedIds.has(member.id)) continue;
      member.start += delta;
      if (member.transitionIn && Number.isFinite(Number(member.transitionIn.cut))) member.transitionIn.cut += delta;
      shiftedIds.add(member.id);
      renderClip(member);
    }
  };

  // Ripple only through actual collisions. Gaps after the insertion point remain intact.
  for (const domain of domains) {
    let cursor = start + amount;
    const clips = state.clips
      .filter((clip) => !rightIds.has(clip.id) && insertionDomainMatches(domain, insertionDomain(clip)))
      .filter((clip) => clip.start >= start - 1e-7)
      .sort((left, right) => left.start - right.start);
    for (const clip of clips) {
      const end = clip.start + clipDuration(clip);
      if (clip.start < cursor - 1e-7) {
        const delta = cursor - clip.start;
        shiftGroup(clip.linkGroupId, delta);
        if (!clip.linkGroupId) {
          clip.start += delta;
          if (clip.transitionIn && Number.isFinite(Number(clip.transitionIn.cut))) clip.transitionIn.cut += delta;
          shiftedIds.add(clip.id);
          renderClip(clip);
        }
        cursor = Math.max(cursor, end + delta);
      } else {
        cursor = Math.max(cursor, end);
      }
    }
  }
}

function renderMediaBin() {
  const list = elements.mediaPoolList;
  if (!list) return;
  const projectMedia = state.mediaBin.filter((media) => state.projectMediaIds.has(media.id));
  elements.mediaPoolCount.textContent = String(projectMedia.length);
  list.replaceChildren(...projectMedia.map((media) => {
    const item = document.createElement('div');
    item.className = 'media-pool-item';
    item.dataset.mediaId = media.id;
    item.setAttribute('role', 'listitem');
    const icon = document.createElement('span');
    icon.className = 'media-pool-icon';
    icon.textContent = mediaKindIcon(media);
    icon.setAttribute('aria-hidden', 'true');
    const info = document.createElement('div');
    info.className = 'media-pool-name';
    info.title = media.name;
    info.textContent = media.name;
    const meta = document.createElement('span');
    meta.className = 'media-pool-meta';
    meta.textContent = `${media.kind} · ${mediaDurationLabel(media)}`;
    info.appendChild(meta);
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'media-pool-add';
    add.textContent = 'Lägg till';
    add.title = 'Lägg klippet på tidslinjen';
    add.addEventListener('click', () => openTrackPlacementModal({
      type: 'media-import', media: [media], originalPlayhead: state.playhead
    }));
    item.append(icon, info, add);
    return item;
  }));
}

async function loadMediaLibrary() {
  try {
    const media = await api('/api/media');
    if (Array.isArray(media)) {
      state.mediaBin = media;
      media.forEach((item) => { if (item?.id) state.projectMediaIds.add(item.id); });
      renderMediaBin();
    }
  } catch (_error) { /* mediebiblioteket är valfritt om servern inte svarar */ }
}

function placementDomain(kind) {
  return kind === 'audio' ? 'audio' : 'visual';
}

function placementLabel(domain, index) {
  return domain === 'audio' ? `LJUD ${index + 1}` : `V${index + 1}`;
}

function firstUnusedTrack(domain) {
  const used = new Set(state.clips
    .filter((clip) => placementDomain(clip.kind) === domain)
    .map((clip) => Math.max(0, Math.trunc(Number(clip.trackIndex) || 0))));
  let index = 0;
  while (used.has(index)) index += 1;
  return index;
}

function trackCount(domain) {
  return domain === 'audio' ? state.audioTrackEls.length : state.visualTrackEls.length;
}

function openTrackPlacementModal(payload) {
  if (!elements.trackPlacementModal || !elements.trackPlacementSelect) return false;
  const media = payload.media || [];
  const clips = payload.clipboard?.clips
    || (payload.clipboard?.clip ? [payload.clipboard.clip] : null)
    || payload.segment?.clips || [];
  const kinds = [...media, ...clips].map((item) => placementDomain(item.kind));
  const domain = kinds.includes('visual') ? 'visual' : 'audio';
  const unused = firstUnusedTrack(domain);
  const maxTracks = Math.max(1, trackCount(domain));
  const fragment = document.createDocumentFragment();
  const newOption = document.createElement('option');
  newOption.value = `new:${unused}`;
  newOption.textContent = `Nytt oanvänt spår (${placementLabel(domain, unused)})`;
  fragment.appendChild(newOption);
  for (let index = 0; index < maxTracks; index += 1) {
    const option = document.createElement('option');
    option.value = `track:${index}`;
    option.textContent = placementLabel(domain, index);
    fragment.appendChild(option);
  }
  elements.trackPlacementSelect.replaceChildren(fragment);
  elements.trackPlacementSelect.value = `new:${unused}`;
  elements.trackPlacementTitle.textContent = payload.type === 'clipboard-paste' ? 'Välj spår för inklistring' : 'Välj spår för import';
  const count = media.length || clips.length;
  elements.trackPlacementSummary.textContent = `${count} ${count === 1 ? 'objekt' : 'objekt'} väntar på placering. Standard är ett nytt oanvänt spår.`;
  state.pendingTrackPlacement = { ...payload, domain };
  elements.trackPlacementModal.hidden = false;
  return true;
}

function selectedPlacementTrack() {
  const value = elements.trackPlacementSelect?.value || '';
  const match = /^(?:new|track):(\d+)$/.exec(value);
  return match ? Math.max(0, Number(match[1])) : 0;
}

function applySegmentPlacement(copies, selectedTrack, domain) {
  const byDomain = new Map();
  for (const clip of copies) {
    const clipDomain = placementDomain(clip.kind);
    if (!byDomain.has(clipDomain)) byDomain.set(clipDomain, []);
    byDomain.get(clipDomain).push(clip);
  }
  for (const [clipDomain, domainClips] of byDomain) {
    const minimum = Math.min(...domainClips.map((clip) => Math.max(0, Math.trunc(Number(clip.trackIndex) || 0))));
    const base = clipDomain === domain ? selectedTrack : firstUnusedTrack(clipDomain);
    for (const clip of domainClips) {
      clip.trackIndex = base + Math.max(0, Math.trunc(Number(clip.trackIndex) || 0)) - minimum;
    }
  }
}

function closeTrackPlacementModal() {
  state.pendingTrackPlacement = null;
  if (elements.trackPlacementModal) elements.trackPlacementModal.hidden = true;
}

function confirmTrackPlacement() {
  const payload = state.pendingTrackPlacement;
  if (!payload) return false;
  const selectedTrack = selectedPlacementTrack();
  closeTrackPlacementModal();
  if (payload.type === 'media-import') {
    const originalPlayhead = payload.originalPlayhead;
    let nextImportAt = originalPlayhead;
    const fallbackTracks = new Map();
    for (const media of payload.media || []) {
      const mediaDomain = placementDomain(media.kind);
      if (!fallbackTracks.has(mediaDomain)) fallbackTracks.set(mediaDomain, firstUnusedTrack(mediaDomain));
    }
    for (const media of payload.media || []) {
      addMediaClip(media, {
        insertAtPlayhead: true,
        atTime: nextImportAt,
        trackIndex: placementDomain(media.kind) === payload.domain
          ? selectedTrack
          : fallbackTracks.get(placementDomain(media.kind))
      });
      nextImportAt += media.kind === 'image' ? 5 : (Number(media.duration) || 0);
    }
    setPlayhead(originalPlayhead);
    elements.status.textContent = `${(payload.media || []).length} mediefiler placerade.`;
    return true;
  }
  if (payload.type === 'clipboard-paste') {
    const clipboard = payload.clipboard;
    if (clipboard.type === 'segment') {
      const destination = Number.isFinite(Number(payload.atTime)) ? Math.max(0, Number(payload.atTime)) : state.playhead;
      const copies = timelineModel.materializeSegmentClips(clipboard, destination, () => crypto.randomUUID());
      if (!copies.length) return false;
      recordHistory();
      applySegmentPlacement(copies, selectedTrack, payload.domain);
      rippleInsert(destination, clipboard.duration, copies);
      state.clips.push(...copies);
      rebuildTrackLayout(copies.map((clip) => clip.id), { preserveTrackIndexes: true });
      selectClips(copies.map((clip) => clip.id), copies[0].id);
      if (copies.some((clip) => clip.mediaId === state.transcriptionMediaId)) renderTranscription();
      persist();
    } else {
      insertClipCopy(clipboard.clip, Number.isFinite(Number(payload.atTime)) ? Math.max(0, Number(payload.atTime)) : state.playhead, selectedTrack);
    }
    return true;
  }
  if (payload.type === 'segment-import') {
    const copies = timelineModel.materializeSegmentClips(payload.segment, payload.destination, () => crypto.randomUUID());
    if (!copies.length) return false;
    recordHistory();
    applySegmentPlacement(copies, selectedTrack, payload.domain);
    rippleInsert(payload.destination, payload.segment.duration, copies);
    state.clips.push(...copies);
    rebuildTrackLayout(copies.map((clip) => clip.id), { preserveTrackIndexes: true });
    selectClips(copies.map((clip) => clip.id), copies[0].id);
    setPlayhead(payload.destination);
    persist();
    elements.segmentCopyStatus.textContent = `“${payload.segment.name}” importerades som kopia.`;
    return true;
  }
  return false;
}

function addMediaClip(media, options = {}) {
  addMediaToProject(media);
  addMediaLibraryItem(media);
  recordHistory();
  const kind = media.kind;
  const isVisual = kind !== 'audio';
  if (isVisual && !state.canvas && media.width > 0 && media.height > 0) {
    state.canvas = { width: media.width, height: media.height };
    syncCanvasControls();
    updatePreviewWindowSize();
  }
  const initialDuration = kind === 'image' ? 5 : media.duration;
  const lastEnd = state.clips.filter((clip) => isVisual
    ? (clip.kind === 'video' || clip.kind === 'image')
    : clip.kind === 'audio')
    .reduce((end, clip) => Math.max(end, clip.start + clipDuration(clip)), 0);
  const start = Number.isFinite(Number(options.atTime))
    ? Math.max(0, Number(options.atTime))
    : options.insertAtPlayhead === true ? state.playhead : lastEnd;
  const requestedLayer = Number.isInteger(options.trackIndex)
    ? Math.max(0, options.trackIndex)
    : isVisual && Number.isInteger(state.importLayer) ? state.importLayer : null;
  const trackIndex = requestedLayer != null ? requestedLayer : 0;
  const clip = {
    id: crypto.randomUUID(), mediaId: media.id, name: media.name, kind,
    mediaDuration: kind === 'image' ? MAX_IMAGE_SECONDS : media.duration,
    sourceWidth: media.width, sourceHeight: media.height,
    start, trimStart: 0, trimEnd: initialDuration,
    crop: { left: 0, right: 0, top: 0, bottom: 0 },
    visualScale: 1,
    posX: 0,
    posY: 0,
    circular: null,
    trackIndex
  };
  const extraDomains = kind === 'video' && media.hasAudio ? ['audio:*'] : [];
  rippleInsert(start, initialDuration, [clip], extraDomains);
  state.clips.push(clip);
  if (requestedLayer != null) {
    state.selectedId = clip.id;
    state.selectedIds = new Set([clip.id]);
    rebuildTrackLayout([clip.id], { preserveTrackIndexes: Number.isInteger(options.trackIndex) });
  } else {
    createClipElement(clip);
    selectClip(clip.id);
  }
  setPlayhead(clip.start);
  if (kind === 'video' && media.hasAudio) autoSplitAudio(clip);
  return clip;
}

function videoClipAtPlayhead() {
  return state.clips
    .filter((clip) =>
      clip.kind === 'video' &&
      layerVisible(clip.trackIndex || 0) &&
      state.playhead >= clip.start &&
      state.playhead < clip.start + clipDuration(clip)
    )
    .sort((a, b) => (b.trackIndex || 0) - (a.trackIndex || 0))[0] || null;
}

async function captureStillFrame() {
  const source = videoClipAtPlayhead();
  if (!source) {
    elements.status.textContent = 'Ingen video vid playhead att ta stillbild från.';
    elements.status.className = 'status warning';
    return false;
  }
  const start = state.playhead;
  const sourceTime = source.trimStart + start - source.start;
  elements.quickStillFrame.disabled = true;
  elements.quickStillFrame.setAttribute('aria-busy', 'true');
  elements.status.textContent = `Tar stillbild vid ${formatTimelineTimecode(start)}…`;
  try {
    const media = await api(`/api/media/${encodeURIComponent(source.mediaId)}/still`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time: sourceTime })
    });
    const remaining = source.start + clipDuration(source) - start;
    const stillDuration = Math.max(MIN_CLIP_SECONDS, Math.min(5, remaining));
    const end = start + stillDuration;
    const topTrack = state.clips
      .filter((clip) =>
        VISUAL_KINDS.includes(clip.kind) &&
        clip.start < end && start < clip.start + clipDuration(clip)
      )
      .reduce((highest, clip) => Math.max(highest, clip.trackIndex || 0), -1);
    const still = {
      id: crypto.randomUUID(),
      mediaId: media.id,
      name: media.name,
      kind: 'image',
      mediaDuration: MAX_IMAGE_SECONDS,
      sourceWidth: media.width,
      sourceHeight: media.height,
      start,
      trimStart: 0,
      trimEnd: stillDuration,
      crop: { left: 0, right: 0, top: 0, bottom: 0 },
      visualScale: 1,
      posX: 0,
      posY: 0,
      circular: null,
      trackIndex: topTrack + 1
    };
    addMediaToProject(media);
    addMediaLibraryItem(media);
    recordHistory();
    state.clips.push(still);
    createClipElement(still);
    selectClip(still.id);
    setPlayhead(start);
    persist();
    elements.status.textContent = `Stillbild skapad på lager V${still.trackIndex + 1}.`;
    elements.status.className = 'status ok';
    return true;
  } catch (error) {
    elements.status.textContent = `Kunde inte ta stillbild: ${error.message}`;
    elements.status.className = 'status warning';
    return false;
  } finally {
    elements.quickStillFrame.disabled = false;
    elements.quickStillFrame.removeAttribute('aria-busy');
  }
}

async function autoSplitAudio(videoClip) {
  const source = videoClip;
  const sourceId = source.id;
  const sourceMediaId = source.mediaId;
  const existingPartner = timelineModel.linkedPartner(state.clips, source);
  if (existingPartner?.kind === 'audio') return existingPartner;
  try {
    const audioMedia = await api(`/api/media/${encodeURIComponent(source.mediaId)}/extract-audio`, { method: 'POST' });
    addMediaToProject(audioMedia);
    addMediaLibraryItem(audioMedia);
    const currentSource = state.clips.find((clip) => clip.id === sourceId);
    if (!currentSource || currentSource.mediaId !== sourceMediaId || currentSource.kind !== 'video') return null;
    const trackIndex = allocateTrack('audio', currentSource.start, currentSource.start + clipDuration(currentSource));
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
      start: currentSource.start,
      trimStart: currentSource.trimStart,
      trimEnd: Math.min(currentSource.trimEnd, extractedDuration),
      crop: { left: 0, right: 0, top: 0, bottom: 0 },
      muted: false,
      trackIndex,
      linkGroupId
    };
    currentSource.linkGroupId = linkGroupId;
    // Keep the embedded track audible until the extracted audio is ready.
    // Muting before the asynchronous extraction completed made the preview
    // completely silent whenever extraction was slow or temporarily failed.
    currentSource.muted = true;
    state.clips.push(audioClip);
    renderClip(currentSource);
    createClipElement(audioClip);
    renderTimelineLinkConnectors();
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
  elements.transcribe.disabled = true;
  elements.transcribeModal.hidden = false;
  elements.transcribeProgress.hidden = true;
  elements.transcribeProgress.value = 0;
  elements.transcribeMessage.textContent = 'Välj språk och tryck på Transkribera.';
  elements.startTranscribe.hidden = false;
  elements.startTranscribe.disabled = false;
  elements.cancelTranscribe.hidden = true;
  try {
    const savedLanguage = localStorage.getItem('videoeditor:transcribe-language');
    if (elements.transcribeLanguage && savedLanguage && ['auto', 'sv', 'en'].includes(savedLanguage)) {
      elements.transcribeLanguage.value = savedLanguage;
    }
  } catch (_error) { /* lagring valfri */ }
}

async function startTranscription() {
  const clip = state.clips.find((item) => item.id === state.transcribingClipId);
  if (!clip || clip.kind !== 'audio' || !clip.mediaId) return;
  setClipTranscribeProgress(clip.id, 0);
  const mediaId = clip.mediaId;
  const language = elements.transcribeLanguage ? elements.transcribeLanguage.value : 'auto';
  try {
    localStorage.setItem('videoeditor:transcribe-language', language);
  } catch (_error) { /* lagring valfri */ }
  elements.startTranscribe.disabled = true;
  elements.transcribeLanguage.disabled = true;
  elements.transcribeProgress.hidden = false;
  elements.transcribeProgress.value = 0;
  elements.transcribeMessage.textContent = 'Förbereder transkriberingen…';
  elements.cancelTranscribe.hidden = false;
  elements.cancelTranscribe.disabled = false;
  try {
    const job = await api(`/api/media/${encodeURIComponent(mediaId)}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'small', language: language === 'auto' ? null : language })
    });
    state.currentTranscribeJobId = job.id;
    pollTranscribeJob(job.id);
  } catch (error) {
    elements.transcribeMessage.textContent = `Kunde inte starta: ${error.message}`;
    elements.startTranscribe.disabled = false;
    elements.transcribeLanguage.disabled = false;
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
      const selectedSource = transcriptionSourceForSelectedClip(
        state.clips.find((candidate) => candidate.id === state.selectedId)
      );
      if (selectedSource) {
        state.selectedTranscriptionSourceClipId = selectedSource.id;
        state.selectedTranscriptionSegmentIndex = transcriptionSegmentForSourceClip(selectedSource);
      }
      renderTranscription();
      syncExportSubtitlesPrefill();
      persist();
      elements.transcribeMessage.textContent = `Transkribering klar: ${state.transcriptionSegments.length} segment.`;
      elements.transcribe.disabled = false;
      elements.startTranscribe.hidden = true;
      elements.transcribeLanguage.disabled = false;
      elements.cancelTranscribe.hidden = true;
      return;
    }
    if (job.status === 'failed') {
      if (clip) setClipTranscribeProgress(clip.id, null);
      state.transcribingClipId = null;
      elements.transcribeMessage.textContent = `Transkriberingen misslyckades:\n${job.error}`;
      elements.transcribe.disabled = false;
      elements.startTranscribe.hidden = false;
      elements.startTranscribe.disabled = false;
      elements.transcribeLanguage.disabled = false;
      elements.cancelTranscribe.hidden = true;
      return;
    }
    if (job.status === 'cancelled') {
      if (clip) setClipTranscribeProgress(clip.id, null);
      state.transcribingClipId = null;
      elements.transcribeMessage.textContent = 'Transkriberingen avbröts.';
      elements.transcribe.disabled = false;
      elements.startTranscribe.hidden = false;
      elements.startTranscribe.disabled = false;
      elements.transcribeLanguage.disabled = false;
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
  if (state.selectedTranscriptionSegmentIndex >= state.transcriptionSegments.length) {
    state.selectedTranscriptionSegmentIndex = -1;
    state.selectedTranscriptionSourceClipId = null;
  }
  elements.transcriptionTrack.replaceChildren();
  updateTranscriptSearch();
  updateTranscriptionTools();
  updateTimelineWidth();
}

function parseTranscriptionTimestamp(rawValue) {
  const value = String(rawValue ?? '').trim().replace(',', '.');
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length > 3 || parts.some((part) => part === '' || !/^\d+(?:\.\d+)?$/.test(part))) return null;
  if (parts.length === 1) {
    const seconds = Number(parts[0]);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) / 1000 : null;
  }
  const values = parts.map(Number);
  if (values.slice(1).some((part) => part >= 60)) return null;
  let seconds = 0;
  for (const part of values) seconds = seconds * 60 + part;
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) / 1000 : null;
}

function rebuildTranscriptionWords(segment) {
  const text = String(segment.text || '').trim();
  const words = text.split(/\s+/).filter(Boolean);
  const start = Number(segment.start) || 0;
  const end = Number(segment.end) || start + 0.5;
  const span = Math.max(0.001, end - start);
  segment.words = words.map((word, index) => ({
    word,
    start: Math.round((start + (span * index) / words.length) * 1000) / 1000,
    end: Math.round((start + (span * (index + 1)) / words.length) * 1000) / 1000
  }));
}

function transcriptionTimelineTimeForSourceTime(sourceTime, preferredSourceClipId = null) {
  const candidates = state.clips
    .filter((clip) =>
      (clip.kind === 'video' || clip.kind === 'audio') && clip.mediaId === state.transcriptionMediaId
    )
    .sort((a, b) => Number(b.id === preferredSourceClipId) - Number(a.id === preferredSourceClipId));
  const clip = candidates.find((candidate) => sourceTime >= candidate.trimStart && sourceTime < candidate.trimEnd);
  if (!clip) return state.playhead;
  return clip.start + sourceTime - clip.trimStart;
}

function formatTranscriptionForEditor(segments = state.transcriptionSegments) {
  return (segments || []).map((segment) =>
    `[${formatTime(Number(segment.start) || 0)}–${formatTime(Number(segment.end) || 0)}] ${String(segment.text || '').trim()}`
  ).join('\n');
}

function parseTranscriptionEditorLine(rawLine, lineNumber, segmentIndex) {
  const line = String(rawLine || '').trim();
  const match = line.match(/^\[(.+?)\s*[–-]\s*(.+?)\]\s+(.+)$/);
  if (!match) return { error: `Rad ${lineNumber}: använd formatet [start–slut] text.` };
  const start = parseTranscriptionTimestamp(match[1]);
  const end = parseTranscriptionTimestamp(match[2]);
  const text = match[3].trim();
  if (start === null || end === null || end - start < 0.05) {
    return { error: `Rad ${lineNumber}: slut måste ligga efter start.` };
  }
  if (!text) return { error: `Rad ${lineNumber}: texten får inte vara tom.` };
  const segment = state.transcriptionSegments[segmentIndex]
    ? cloneValue(state.transcriptionSegments[segmentIndex])
    : {};
  segment.start = start;
  segment.end = end;
  segment.text = text;
  rebuildTranscriptionWords(segment);
  return { segment };
}

function parseTranscriptionEditor(rawValue) {
  const lines = String(rawValue || '').split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter((item) => item.line);
  if (!lines.length) return { error: 'Transkriberingen får inte vara tom.' };
  const segments = [];
  for (let index = 0; index < lines.length; index += 1) {
    const { line, lineNumber } = lines[index];
    const parsed = parseTranscriptionEditorLine(line, lineNumber, index);
    if (parsed.error) return parsed;
    segments.push(parsed.segment);
  }
  return { segments };
}

let transcriptionEditorHighlightIndex = -1;
let transcriptionEditorHighlightSegmentIndex = -1;

function syncTranscriptionHighlightScroll() {
  elements.transcriptionEditorHighlightLines.style.transform =
    `translateY(${-elements.transcriptionEditorAll.scrollTop}px)`;
}

function editorLineIndexForSegment(segmentIndex) {
  if (segmentIndex < 0) return -1;
  const lines = elements.transcriptionEditorAll.value.split(/\r?\n/);
  let currentSegment = -1;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (!lines[lineIndex].trim()) continue;
    currentSegment += 1;
    if (currentSegment === segmentIndex) return lineIndex;
  }
  return -1;
}

function scrollTranscriptionEditorLineIntoView(lineIndex) {
  if (lineIndex < 0) return;
  const editor = elements.transcriptionEditorAll;
  const style = getComputedStyle(editor);
  const fontSize = parseFloat(style.fontSize) || 12;
  const parsedLineHeight = parseFloat(style.lineHeight);
  const lineHeight = Number.isFinite(parsedLineHeight)
    ? (style.lineHeight.endsWith('px') ? parsedLineHeight : parsedLineHeight * fontSize)
    : fontSize * 1.55;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const lineTop = paddingTop + lineIndex * lineHeight;
  const lineBottom = lineTop + lineHeight;
  const viewportTop = editor.scrollTop;
  const viewportBottom = viewportTop + editor.clientHeight;
  const margin = lineHeight;
  if (lineTop - margin < viewportTop) {
    editor.scrollTop = Math.max(0, lineTop - margin);
  } else if (lineBottom + margin + paddingBottom > viewportBottom) {
    editor.scrollTop = lineBottom + margin + paddingBottom - editor.clientHeight;
  } else {
    return;
  }
  syncTranscriptionHighlightScroll();
}

function setTranscriptionEditorHighlight(segmentIndex) {
  if (segmentIndex === transcriptionEditorHighlightSegmentIndex) return;
  const lineIndex = editorLineIndexForSegment(segmentIndex);
  const previous = elements.transcriptionEditorHighlightLines.children[transcriptionEditorHighlightIndex];
  if (previous) previous.classList.remove('active');
  const current = elements.transcriptionEditorHighlightLines.children[lineIndex];
  if (current) current.classList.add('active');
  transcriptionEditorHighlightIndex = current ? lineIndex : -1;
  transcriptionEditorHighlightSegmentIndex = current ? segmentIndex : -1;
  if (current) scrollTranscriptionEditorLineIntoView(lineIndex);
}

function syncTranscriptionHighlightLines() {
  const lineCount = elements.transcriptionEditorAll.value.split(/\r?\n/).length;
  if (elements.transcriptionEditorHighlightLines.children.length !== lineCount) {
    const lines = Array.from({ length: lineCount }, () => {
      const line = document.createElement('div');
      line.className = 'transcription-editor-highlight-line';
      return line;
    });
    elements.transcriptionEditorHighlightLines.replaceChildren(...lines);
    transcriptionEditorHighlightIndex = -1;
    transcriptionEditorHighlightSegmentIndex = -1;
  }
  updateTranscriptionPlayheadHighlight();
  syncTranscriptionHighlightScroll();
}

function transcriptionSegmentAtPlayhead() {
  const isActiveSourceClip = (clip) => (
      (clip.kind === 'video' || clip.kind === 'audio') &&
      clip.mediaId === state.transcriptionMediaId &&
      state.playhead >= clip.start && state.playhead < clip.start + clipDuration(clip)
  );
  const sourceClip = state.clips.find((clip) =>
    clip.id === state.selectedTranscriptionSourceClipId && isActiveSourceClip(clip)
  ) || state.clips.find(isActiveSourceClip);
  if (!sourceClip) return -1;
  const sourceTime = sourceClip.trimStart + state.playhead - sourceClip.start;
  const currentIndex = transcriptionEditorHighlightSegmentIndex >= 0
    ? transcriptionEditorHighlightSegmentIndex
    : state.selectedTranscriptionSegmentIndex;
  const current = state.transcriptionSegments[currentIndex];
  if (current && sourceTime >= Number(current.start) && sourceTime < Number(current.end)) {
    return currentIndex;
  }
  return state.transcriptionSegments.findIndex((segment) =>
    sourceTime >= Number(segment.start) && sourceTime < Number(segment.end)
  );
}

function updateTranscriptionPlayheadHighlight() {
  if (elements.transcriptionTools.hidden) {
    setTranscriptionEditorHighlight(-1);
    return;
  }
  setTranscriptionEditorHighlight(transcriptionSegmentAtPlayhead());
}

function jumpToTranscriptionEditorLine() {
  const editor = elements.transcriptionEditorAll;
  const caret = Math.max(0, editor.selectionStart || 0);
  const lines = editor.value.split(/\r?\n/);
  const lineIndex = editor.value.slice(0, caret).split(/\r?\n/).length - 1;
  if (!lines[lineIndex]?.trim()) return;
  const segmentIndex = lines.slice(0, lineIndex + 1).filter((line) => line.trim()).length - 1;
  const parsed = parseTranscriptionEditorLine(lines[lineIndex], lineIndex + 1, segmentIndex);
  if (parsed.error) return;
  state.selectedTranscriptionSegmentIndex = segmentIndex;
  const sourceClipId = state.selectedTranscriptionSourceClipId;
  elements.info.textContent = `Transkription · segment ${segmentIndex + 1} av ${state.transcriptionSegments.length}`;
  setPlayhead(transcriptionTimelineTimeForSourceTime(parsed.segment.start, sourceClipId));
  setTranscriptionEditorHighlight(segmentIndex);
}

function renderTranscriptionTools() {
  const selectedIndex = state.selectedTranscriptionSegmentIndex;
  const visible = selectedIndex >= 0 && Boolean(state.transcriptionSegments[selectedIndex]);
  elements.transcriptionTools.hidden = !visible;
  if (!visible) return;

  elements.transcriptionToolsSummary.value = `${state.transcriptionSegments.length} segment · källtider`;
  elements.transcriptionEditorAll.readOnly = !state.transcriptionEditMode;
  elements.editTranscription.textContent = state.transcriptionEditMode ? 'Klar' : 'Redigera';
  elements.saveAllTranscription.disabled = false;
  const text = formatTranscriptionForEditor();
  elements.transcriptionEditorAll.value = text;
  elements.transcriptionEditorError.value = '';
  elements.transcriptionCopyStatus.value = '';
  syncTranscriptionHighlightLines();
  updateTranscriptSearch();
}

function setTranscriptionEditMode(enabled) {
  state.transcriptionEditMode = Boolean(enabled);
  renderTranscriptionTools();
  if (state.transcriptionEditMode) {
    elements.transcriptionEditorAll.focus();
    elements.transcriptionCopyStatus.value = 'Redigeringsläge aktivt.';
  }
}

function updateTranscriptionTools() {
  renderTranscriptionTools();
}

function saveAllTranscription() {
  if (!state.transcriptionEditMode) {
    elements.transcriptionCopyStatus.value = 'Inga ändringar att spara.';
    return true;
  }
  const parsed = parseTranscriptionEditor(elements.transcriptionEditorAll.value);
  if (parsed.error) {
    elements.transcriptionEditorError.value = parsed.error;
    return false;
  }
  if (formatTranscriptionForEditor(parsed.segments) === formatTranscriptionForEditor()) {
    elements.transcriptionEditorError.value = '';
    elements.transcriptionCopyStatus.value = 'Inga ändringar att spara.';
    return true;
  }
  recordHistory();
  state.transcriptionSegments = parsed.segments;
  state.selectedTranscriptionSegmentIndex = Math.min(
    state.selectedTranscriptionSegmentIndex,
    state.transcriptionSegments.length - 1
  );
  rebuildTranscriptionIndex();
  renderTranscription();
  renderTranscriptOverlay(state.playhead);
  elements.transcriptionCopyStatus.value = 'Alla ändringar har sparats.';
  persist();
  return true;
}

async function copyAllTranscription() {
  const text = formatTranscriptionForEditor();
  if (!text) return false;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API saknas');
    await navigator.clipboard.writeText(text);
    elements.transcriptionCopyStatus.value = 'Hela transkriberingen har kopierats.';
    return true;
  } catch (_error) {
    const fallback = document.createElement('textarea');
    fallback.value = text;
    fallback.readOnly = true;
    fallback.style.position = 'fixed';
    fallback.style.opacity = '0';
    document.body.appendChild(fallback);
    fallback.select();
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    fallback.remove();
    elements.transcriptionCopyStatus.value = copied
      ? 'Hela transkriberingen har kopierats.'
      : 'Kunde inte kopiera till urklippet.';
    return copied;
  }
}

let transcriptSearchFocused = false;

function renderFlags() {
  const lane = elements.flagLane;
  if (!lane) return;
  const fragment = document.createDocumentFragment();
  const sorted = [...state.flags].sort((a, b) => a.time - b.time);
  for (const flag of sorted) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flag-marker';
    if (flag.id === state.selectedFlagId) button.classList.add('current');
    button.title = `${formatTime(flag.time)}${flag.note ? `\n${flag.note}` : ''}`;
    button.style.left = `${secondsToPixels(flag.time)}px`;
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-flag"></use></svg>';
    button.addEventListener('mousedown', (event) => {
      event.stopPropagation();
    });
    button.addEventListener('click', () => {
      setPlayhead(flag.time);
      selectFlag(flag.id);
    });
    button.addEventListener('dblclick', () => {
      setPlayhead(flag.time);
      openFlagEditor(flag.id);
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setPlayhead(flag.time);
      selectFlag(flag.id);
      openFlagEditor(flag.id);
    });
    fragment.appendChild(button);
  }
  lane.replaceChildren(fragment);
  updatePlayheadFollowIndicator();
}

function selectFlag(id) {
  state.selectedFlagId = id;
  renderFlags();
  if (elements.flagPopover && !elements.flagPopover.hidden) renderFlagPopover();
}

function addFlagAtPlayhead() {
  recordHistory();
  const flag = { id: crypto.randomUUID(), time: Math.max(0, state.playhead), note: '' };
  state.flags.push(flag);
  state.selectedFlagId = flag.id;
  renderFlags();
  openFlagEditor(flag.id);
  return flag;
}

function openFlagEditor(id) {
  const flag = state.flags.find((item) => item.id === id);
  if (!flag) return;
  state.editingFlagId = flag.id;
  elements.flagEditTime.textContent = formatTime(flag.time);
  elements.flagEditNote.value = flag.note || '';
  elements.flagEditModal.hidden = false;
  elements.flagEditNote.focus();
}

function closeFlagEditor() {
  elements.flagEditModal.hidden = true;
  state.editingFlagId = null;
}

function saveFlagEditor() {
  const flag = state.flags.find((item) => item.id === state.editingFlagId);
  if (flag) {
    const note = elements.flagEditNote.value.trim();
    if (note !== flag.note) {
      recordHistory();
      flag.note = note;
      renderFlags();
      persist();
    }
  }
  closeFlagEditor();
}

function deleteFlagEditor() {
  const flag = state.flags.find((item) => item.id === state.editingFlagId);
  if (flag) {
    recordHistory();
    state.flags = state.flags.filter((item) => item.id !== flag.id);
    if (state.selectedFlagId === flag.id) state.selectedFlagId = null;
    renderFlags();
    persist();
  }
  closeFlagEditor();
}

function deleteSelectedFlag() {
  const flag = state.flags.find((item) => item.id === state.selectedFlagId);
  if (!flag) return;
  recordHistory();
  state.flags = state.flags.filter((item) => item.id !== flag.id);
  state.selectedFlagId = null;
  renderFlags();
  persist();
}

function jumpToFlag(direction) {
  if (!state.flags.length) return;
  const sorted = [...state.flags].sort((a, b) => a.time - b.time);
  const current = state.playhead;
  const next = direction > 0
    ? sorted.find((flag) => flag.time > current + 0.001) || sorted[0]
    : [...sorted].reverse().find((flag) => flag.time < current - 0.001) || sorted[sorted.length - 1];
  setPlayhead(next.time);
  selectFlag(next.id);
}

function toggleFlagPopover() {
  elements.flagPopover.hidden = !elements.flagPopover.hidden;
  elements.qtFlag.setAttribute('aria-expanded', String(!elements.flagPopover.hidden));
  if (!elements.flagPopover.hidden) {
    renderFlagPopover();
    elements.flagSearchInput.focus();
  }
}

function closeFlagPopover() {
  elements.flagPopover.hidden = true;
  elements.qtFlag.setAttribute('aria-expanded', 'false');
}

function renderFlagPopover() {
  const list = elements.flagPopoverList;
  if (!list) return;
  const query = normalizeSearchWord(elements.flagSearchInput.value);
  const sorted = [...state.flags].sort((a, b) => a.time - b.time);
  const filtered = query
    ? sorted.filter((flag) =>
        normalizeSearchWord(flag.note || '').includes(query) ||
        formatTime(flag.time).includes(query)
      )
    : sorted;
  list.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'flag-popover-empty';
    empty.textContent = query ? 'Inga flaggor matchar sökningen.' : 'Inga flaggor ännu.';
    list.appendChild(empty);
  }
  for (const flag of filtered) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'flag-popover-item';
    if (flag.id === state.selectedFlagId) item.classList.add('current');
    item.setAttribute('role', 'option');
    const time = document.createElement('span');
    time.className = 'flag-popover-item-time';
    time.textContent = formatTime(flag.time);
    const note = document.createElement('span');
    note.className = `flag-popover-item-note${flag.note ? '' : ' empty'}`;
    note.textContent = flag.note || '(ingen anteckning)';
    item.append(time, note);
    item.addEventListener('click', () => {
      setPlayhead(flag.time);
      selectFlag(flag.id);
      closeFlagPopover();
    });
    item.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeFlagPopover();
      setPlayhead(flag.time);
      selectFlag(flag.id);
      openFlagEditor(flag.id);
    });
    list.appendChild(item);
  }
  const count = filtered.length;
  elements.flagPopoverStatus.value = count
    ? `${count} flagg${count === 1 ? 'a' : 'or'}${query ? ' matchar' : ''}`
    : '';
  elements.flagPopoverPrev.disabled = sorted.length < 2;
  elements.flagPopoverNext.disabled = sorted.length < 2;
}

elements.qtFlag.addEventListener('click', toggleFlagPopover);
elements.flagPopoverAdd.addEventListener('click', () => {
  closeFlagPopover();
  addFlagAtPlayhead();
});
elements.flagSearchInput.addEventListener('input', renderFlagPopover);
elements.flagPopoverPrev.addEventListener('click', () => { jumpToFlag(-1); renderFlagPopover(); });
elements.flagPopoverNext.addEventListener('click', () => { jumpToFlag(1); renderFlagPopover(); });
document.addEventListener('pointerdown', (event) => {
  if (!(event.target instanceof Element)) return;
  if (!event.target.closest('#flag-popover') && !event.target.closest('#qt-flag')) closeFlagPopover();
});
elements.saveFlag.addEventListener('click', saveFlagEditor);
elements.deleteFlag.addEventListener('click', deleteFlagEditor);
elements.closeFlagEdit.addEventListener('click', closeFlagEditor);

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

function transcriptionEditorSearchEntries() {
  if (!elements.transcriptionTools.hidden && elements.transcriptionEditorAll.value.trim()) {
    let segmentIndex = -1;
    return elements.transcriptionEditorAll.value.split(/\r?\n/).flatMap((rawLine, lineIndex) => {
      const line = rawLine.trim();
      if (!line) return [];
      segmentIndex += 1;
      const match = line.match(/^\[(.+?)\s*[–-]\s*(.+?)\]\s*(.*)$/);
      const text = (match?.[3] || line).trim();
      const parsedStart = match ? parseTranscriptionTimestamp(match[1]) : null;
      return [{
        segmentIndex,
        lineIndex,
        text,
        start: parsedStart ?? (Number(state.transcriptionSegments[segmentIndex]?.start) || 0),
        tokens: new Set(tokenizeTranscript(text))
      }];
    });
  }
  return state.transcriptionSegments.map((segment, segmentIndex) => ({
    segmentIndex,
    lineIndex: segmentIndex,
    text: String(segment.text || '').trim(),
    start: Number(segment.start) || 0,
    tokens: new Set(tokenizeTranscript(segment.text))
  }));
}

function transcriptionIndexTimesForTerm(term, segmentIndex) {
  const times = [];
  for (const [word, segmentTimes] of state.transcriptionIndex) {
    if (!word.includes(term)) continue;
    times.push(...(segmentTimes.get(segmentIndex) || []).filter(Number.isFinite));
  }
  return times;
}

function transcriptionSearchTimelineLocation(entry, terms) {
  const termTimeGroups = terms.map((term) => {
    const times = transcriptionIndexTimesForTerm(term, entry.segmentIndex);
    return times.length ? times : [entry.start];
  });
  const candidates = state.clips
    .filter((clip) =>
      (clip.kind === 'video' || clip.kind === 'audio') && clip.mediaId === state.transcriptionMediaId
    )
    .sort((a, b) => Number(b.id === state.selectedTranscriptionSourceClipId) - Number(a.id === state.selectedTranscriptionSourceClipId));
  for (const clip of candidates) {
    const timesInClip = termTimeGroups.map((times) =>
      times.filter((sourceTime) => sourceTime >= clip.trimStart && sourceTime < clip.trimEnd)
    );
    if (timesInClip.some((times) => times.length === 0)) continue;
    const sourceTime = Math.min(...timesInClip.flat());
    return {
      sourceClipId: clip.id,
      time: clip.start + sourceTime - clip.trimStart
    };
  }
  return null;
}

function updateTranscriptSearch() {
  const query = elements.transcriptSearchInput.value.trim();
  const terms = [...new Set(tokenizeTranscript(query))];
  const matches = terms.length === 0 ? [] : transcriptionEditorSearchEntries()
    .filter((entry) => terms.every((term) => [...entry.tokens].some((word) => word.includes(term))))
    .map((entry) => ({ ...entry, location: transcriptionSearchTimelineLocation(entry, terms) }));
  state.transcriptSearchResults = matches;
  state.transcriptSearchCursor = -1;
  elements.transcriptSearchResults.replaceChildren(...matches.map((match, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'transcript-search-result';
    if (!match.location) button.classList.add('outside-timeline');
    button.dataset.resultIndex = String(index);
    button.setAttribute('role', 'option');
    const time = document.createElement('span');
    time.className = 'transcript-result-time';
    time.textContent = match.location ? formatTime(match.location.time) : 'Bortklippt';
    const text = document.createElement('span');
    text.className = 'transcript-result-text';
    text.textContent = match.text || '(tomt)';
    button.append(time, text);
    button.addEventListener('click', () => activateTranscriptSearchResult(index));
    return button;
  }));
  elements.transcriptSearchResults.hidden = !transcriptSearchFocused || !query || matches.length === 0;
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
  elements.transcriptSearchResults.querySelectorAll('.transcript-search-result').forEach((button, resultIndex) => {
    button.classList.toggle('current', resultIndex === index);
    button.setAttribute('aria-selected', String(resultIndex === index));
  });
  state.selectedTranscriptionSegmentIndex = current.segmentIndex;
  if (current.location) {
    state.selectedTranscriptionSourceClipId = current.location.sourceClipId;
    setPlayhead(current.location.time);
  }
  setTranscriptionEditorHighlight(current.segmentIndex);
  elements.info.textContent = current.location
    ? `Transkription · segment ${current.segmentIndex + 1} av ${state.transcriptionSegments.length}`
    : `Transkription · segment ${current.segmentIndex + 1} · utanför tidslinjen`;
  elements.transcriptSearchStatus.value = `${state.transcriptSearchCursor + 1} av ${results.length}${current.location ? '' : ' · utanför tidslinjen'}`;
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
    text: { text: 'Skriv din text här', presetId: 'simple', fontSize: 0.08, color: '#FFFFFF', background: 'none', x: 0.5, y: 0.5 }
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
  updateAutoFitLabel();
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

function contentBounds(clips = state.clips) {
  const canvas = state.canvas || sourceCanvas() || { width: 1600, height: 900 };
  const W = canvas.width;
  const H = canvas.height;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const clip of clips) {
    if (clip.kind !== 'video' && clip.kind !== 'image') continue;
    if (!layerVisible(clip.trackIndex || 0)) continue;
    const sW = Number(clip.sourceWidth);
    const sH = Number(clip.sourceHeight);
    if (!sW || !sH) continue;
    const crop = clip.crop || { left: 0, right: 0, top: 0, bottom: 0 };
    const cropW = sW * (1 - crop.left - crop.right);
    const cropH = sH * (1 - crop.top - crop.bottom);
    const scale = Math.min(W / cropW, H / cropH) * clamp(Number(clip.visualScale) || 1, 0.1, 4);
    const visW = cropW * scale;
    const visH = cropH * scale;
    const left = (W - visW) / 2 + (Number(clip.posX) || 0) * W;
    const top = (H - visH) / 2 + (Number(clip.posY) || 0) * H;
    let cMinX;
    let cMaxX;
    let cMinY;
    let cMaxY;
    const circularSize = clip.circular ? clamp(Number(clip.circular.size) || 0.5, 0.1, 0.5) : 0;
    if (circularSize > 0) {
      const radius = circularSize * Math.min(visW, visH);
      const centerX = left + visW / 2;
      const centerY = top + visH / 2;
      cMinX = clamp(centerX - radius, 0, W);
      cMaxX = clamp(centerX + radius, 0, W);
      cMinY = clamp(centerY - radius, 0, H);
      cMaxY = clamp(centerY + radius, 0, H);
    } else {
      cMinX = clamp(left, 0, W);
      cMaxX = clamp(left + visW, 0, W);
      cMinY = clamp(top, 0, H);
      cMaxY = clamp(top + visH, 0, H);
    }
    if (cMaxX <= cMinX || cMaxY <= cMinY) continue;
    minX = Math.min(minX, cMinX);
    minY = Math.min(minY, cMinY);
    maxX = Math.max(maxX, cMaxX);
    maxY = Math.max(maxY, cMaxY);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function transformProjectToBounds(bounds, sourceClips = state.clips) {
  const canvas = state.canvas || sourceCanvas() || { width: 1600, height: 900 };
  if (!bounds) return null;
  const W = canvas.width;
  const H = canvas.height;
  const newWidth = Math.max(64, Math.round((bounds.maxX - bounds.minX) / 2) * 2);
  const newHeight = Math.max(64, Math.round((bounds.maxY - bounds.minY) / 2) * 2);
  if (newWidth >= W - 1 && newHeight >= H - 1) return null;
  const shiftX = bounds.minX;
  const shiftY = bounds.minY;
  const clips = sourceClips.map((clip) => {
    const c = { ...clip };
    if (clip.kind === 'video' || clip.kind === 'image') {
      if (Number.isFinite(c.posX)) c.posX = ((W - newWidth) / 2 + c.posX * W - shiftX) / newWidth;
      if (Number.isFinite(c.posY)) c.posY = ((H - newHeight) / 2 + c.posY * H - shiftY) / newHeight;
    } else if (clip.kind === 'color' || clip.kind === 'html') {
      const block = clip.kind === 'color' ? cloneValue(c.color) : cloneValue(c.html);
      if (block) {
        block.x = ((block.x * W) - shiftX) / newWidth;
        block.y = ((block.y * H) - shiftY) / newHeight;
        block.width = (block.width * W) / newWidth;
        block.height = (block.height * H) / newHeight;
        if (clip.kind === 'color') c.color = block;
        else c.html = block;
      }
    } else if (clip.kind === 'text') {
      const text = cloneValue(c.text);
      if (text) {
        text.x = (((text.x / 100) * W - shiftX) / newWidth) * 100;
        text.y = (((text.y / 100) * H - shiftY) / newHeight) * 100;
        if (Number.isFinite(text.fontSize)) text.fontSize = (text.fontSize * H) / newHeight;
        c.text = text;
      }
    } else if (clip.kind === 'blur') {
      const blur = cloneValue(c.blur);
      if (blur && Array.isArray(blur.boxes)) {
        for (const box of blur.boxes) {
          for (const point of box.points || []) {
            point.x = (point.x * W - shiftX) / newWidth;
            point.y = (point.y * H - shiftY) / newHeight;
          }
        }
        c.blur = blur;
      }
    }
    return c;
  });
  return { canvas: { width: newWidth, height: newHeight }, clips, bounds };
}

function fitProjectToContent(clips = state.clips) {
  const canvas = state.canvas || sourceCanvas() || { width: 1600, height: 900 };
  const bounds = contentBounds(clips);
  if (!bounds) return null;
  if (exportSubtitleCues(clips)) {
    bounds.minX = 0;
    bounds.maxX = canvas.width;
    bounds.maxY = canvas.height;
  }
  return transformProjectToBounds(bounds, clips);
}

function currentExportDims() {
  const canvas = state.canvas || sourceCanvas() || { width: 1600, height: 900 };
  if (state.exportWindow) return { width: state.exportWindow.width, height: state.exportWindow.height };
  return { width: canvas.width, height: canvas.height };
}

function setExportWindow(width, height) {
  const canvas = state.canvas || sourceCanvas() || { width: 1600, height: 900 };
  const w = Math.min(evenCanvasDimension(width), evenCanvasDimension(canvas.width));
  const h = Math.min(evenCanvasDimension(height), evenCanvasDimension(canvas.height));
  if (w >= canvas.width - 1 && h >= canvas.height - 1) {
    state.exportWindow = null;
    return;
  }
  state.exportWindow = {
    x: Math.max(0, Math.round((canvas.width - w) / 2)),
    y: Math.max(0, Math.round((canvas.height - h) / 2)),
    width: w,
    height: h
  };
}

function updateExportFrameOutline(windowRect) {
  const outline = elements.exportFrameOutline;
  if (!outline) return;
  const canvas = state.canvas || sourceCanvas() || { width: 1600, height: 900 };
  if (!windowRect) {
    outline.style.left = '0%';
    outline.style.top = '0%';
    outline.style.width = '100%';
    outline.style.height = '100%';
    return;
  }
  outline.style.left = `${(windowRect.x / canvas.width) * 100}%`;
  outline.style.top = `${(windowRect.y / canvas.height) * 100}%`;
  outline.style.width = `${(windowRect.width / canvas.width) * 100}%`;
  outline.style.height = `${(windowRect.height / canvas.height) * 100}%`;
}

function updateAutoFitLabel() {
  const canvas = state.canvas || sourceCanvas() || { width: 1600, height: 900 };
  const dims = currentExportDims();
  if (!elements.autoFitCanvas || !elements.autoFitCanvas.checked) {
    updateExportFrameLabel(dims);
    updateExportFrameOutline(state.exportWindow);
    return;
  }
  const fitted = fitProjectToContent();
  if (fitted) {
    updateExportFrameLabel(fitted.canvas);
    elements.exportFrameLabel.textContent += ' · AUTOFIT';
    updateExportFrameOutline(fitted.bounds);
  } else {
    updateExportFrameLabel(dims);
    updateExportFrameOutline(state.exportWindow);
  }
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
  state.exportWindow = null;
  elements.canvasWidth.value = String(normalized.width);
  elements.canvasHeight.value = String(normalized.height);
  syncCanvasSliders();
  updatePreviewWindowSize();
  updateCropOverlay();
  persist();
  updateAutoFitLabel();
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
  beginInputEdit();
  setExportWindow(Number(elements.canvasWidth.value), Number(elements.canvasHeight.value));
  const dims = currentExportDims();
  elements.canvasWidth.value = String(dims.width);
  elements.canvasHeight.value = String(dims.height);
  syncCanvasSliders();
  updateAutoFitLabel();
  recordInputEdit();
  persist();
}

function syncCanvasControls() {
  const canvas = state.canvas || sourceCanvas() || { width: 1600, height: 900 };
  const preset = Object.entries(CANVAS_PRESETS)
    .find(([, dimensions]) => dimensions.width === canvas.width && dimensions.height === canvas.height)?.[0];
  elements.canvasFormat.value = preset || 'custom';
  elements.customCanvasSize.hidden = Boolean(preset);
  const dims = currentExportDims();
  elements.canvasWidth.value = String(dims.width);
  elements.canvasHeight.value = String(dims.height);
  syncCanvasSliders();
  updateAutoFitLabel();
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
  if (kind === 'audio') return timelineModel.firstFreeTrack(state.clips, ['audio'], start, end, ignoreId);
  if (VISUAL_KINDS.includes(kind)) return 0;
  return timelineModel.firstFreeTrack(state.clips, trackKinds(kind), start, end, ignoreId);
}

function syncImportLayerOptions() {
  const select = elements.importLayer;
  if (!select) return;
  const maxLayer = Math.max(0, state.visualTrackEls.length);
  const selected = typeof state.importLayer === 'number' ? state.importLayer : null;
  const fragment = document.createDocumentFragment();
  const autoOpt = document.createElement('option');
  autoOpt.value = 'auto';
  autoOpt.textContent = 'Auto';
  fragment.appendChild(autoOpt);
  for (let i = 0; i <= maxLayer; i += 1) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = `Lager ${i + 1}`;
    fragment.appendChild(option);
  }
  select.replaceChildren(fragment);
  if (selected != null && selected <= maxLayer) select.value = String(selected);
  else select.value = 'auto';
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
  syncImportLayerOptions();
  syncLayerEye();
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

function rebuildTrackLayout(liftedIds, options = {}) {
  const selectedId = state.selectedId;
  const selectedIds = new Set(state.selectedIds);
  state.clips = timelineModel.compactTrackAssignments(state.clips, liftedIds || [], options.preserveTrackIndexes === true);
  clearDynamicTracks();
  elements.visualTrack.replaceChildren();
  elements.transcriptionTrack.replaceChildren();
  elements.audioTrack.replaceChildren();
  state.clips.forEach(createClipElement);
  renderTimelineLinkConnectors();
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
  overlayRenderCache.blur = '';
  overlayRenderCache.color = '';
  overlayRenderCache.text = '';
  overlayRenderCache.html = '';
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
    const waveformKey = `${clip.mediaId}:${Number(clip.trimStart).toFixed(3)}:${Number(clip.trimEnd).toFixed(3)}:${canvas.width}x${canvas.height}`;
    if (canvas.dataset.waveformKey !== waveformKey) {
      canvas.dataset.waveformKey = waveformKey;
      drawTimelineWaveform(canvas, clip);
    }
  } else if (clip.kind === 'video') {
    let canvas = element.querySelector('.clip-thumbs');
    const displayWidth = Math.max(8, Math.round(secondsToPixels(clipDuration(clip)))) || 8;
    const w = Math.min(12000, displayWidth);
    const h = 60;
    if (!canvas || canvas.width !== w || canvas.height !== h || canvas.style.width !== `${w}px`) {
      if (canvas) canvas.remove();
      canvas = document.createElement('canvas');
      canvas.className = 'clip-thumbs';
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${w}px`;
      canvas.style.height = '60px';
      element.insertBefore(canvas, element.firstChild);
    }
    const thumbnailKey = `${clip.mediaId}:${Number(clip.trimStart).toFixed(3)}:${Number(clip.trimEnd).toFixed(3)}:${canvas.width}x${canvas.height}`;
    if (!clipNearTimelineViewport(element)) {
      canvas.dataset.thumbnailDeferred = '1';
      canvas.dataset.thumbnailKey = '';
    } else if (canvas.dataset.thumbnailKey !== thumbnailKey) {
      delete canvas.dataset.thumbnailDeferred;
      canvas.dataset.thumbnailKey = thumbnailKey;
      drawTimelineThumbnails(canvas, clip);
    }
  }
}

function renderAllClips() {
  state.clips.forEach(renderClip);
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
    connector.src = '/chain.svg?v=0.15.5';
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

function transcriptionSourceForSelectedClip(clip) {
  if (!clip || !state.transcriptionMediaId || state.transcriptionSegments.length === 0) return null;
  if ((clip.kind === 'video' || clip.kind === 'audio') && clip.mediaId === state.transcriptionMediaId) return clip;
  if (!clip.linkGroupId) return null;
  return state.clips.find((candidate) =>
    candidate.linkGroupId === clip.linkGroupId &&
    (candidate.kind === 'video' || candidate.kind === 'audio') &&
    candidate.mediaId === state.transcriptionMediaId
  ) || null;
}

function transcriptionSegmentForSourceClip(clip) {
  if (!clip) return -1;
  const playheadInClip = state.playhead >= clip.start && state.playhead < clip.start + clipDuration(clip);
  const sourceTime = playheadInClip ? clip.trimStart + state.playhead - clip.start : clip.trimStart;
  const activeIndex = state.transcriptionSegments.findIndex((segment) =>
    sourceTime >= Number(segment.start) && sourceTime < Number(segment.end)
  );
  if (activeIndex >= 0) return activeIndex;
  const overlappingIndex = state.transcriptionSegments.findIndex((segment) =>
    Number(segment.end) > clip.trimStart && Number(segment.start) < clip.trimEnd
  );
  return overlappingIndex >= 0 ? overlappingIndex : 0;
}

function selectClips(ids, primaryId = null, options = {}) {
  if (!options.preserveTranscriptionSelection) {
    state.selectedTranscriptionSegmentIndex = -1;
    state.selectedTranscriptionSourceClipId = null;
  }
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
  updateExportSelectionButton();
  const qtRemove = document.querySelector('#qt-remove');
  if (qtRemove) qtRemove.disabled = !hasSelection;
  const clip = state.clips.find((item) => item.id === nextPrimaryId);
  if (!options.preserveTranscriptionSelection && validIds.size === 1) {
    const transcriptionSource = transcriptionSourceForSelectedClip(clip);
    if (transcriptionSource) {
      state.selectedTranscriptionSourceClipId = transcriptionSource.id;
      state.selectedTranscriptionSegmentIndex = transcriptionSegmentForSourceClip(transcriptionSource);
    }
  }
  if (!options.preventPlayheadJump && !editorHistory.restoring && selectionChanged &&
      (clip?.kind === 'blur' || clip?.kind === 'color' || clip?.kind === 'html') &&
      (state.playhead < clip.start || state.playhead >= clip.start + clipDuration(clip))) {
    state.playhead = clip.start;
  }
  elements.info.textContent = validIds.size > 1
    ? `${validIds.size} klipp markerade · ${describeClip(clip)}`
    : describeClip(clip);
  if (options.preserveTranscriptionSelection && state.selectedTranscriptionSegmentIndex >= 0) {
    elements.info.textContent = `Transkription · segment ${state.selectedTranscriptionSegmentIndex + 1} av ${state.transcriptionSegments.length}`;
  }
  if (clip && clip.kind !== 'video' && clip.kind !== 'image') {
    state.cropActive = false;
    hideCropOverlay();
  }
  updateCropTools(clip);
  updateImageSizeTools(clip);
  if (state.cropActive && clip && (clip.kind === 'video' || clip.kind === 'image')) showCropOverlay();
  else if (state.cropActive) hideCropOverlay();
  updateBlurTools(clip);
  updateColorTools(clip);
  updateAnimTools(clip);
  updateShapeTools(clip);
  updateTextTools(clip);
  updateHtmlTools(clip);
  updateTranscriptionTools();
  updateTransitionTools();
  updateLinkTool();
  const transcriptionSelected = state.selectedTranscriptionSegmentIndex >= 0 && !elements.transcriptionTools.hidden;
  const anyTools = transcriptionSelected || (clip && (clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'blur' || clip.kind === 'color' || clip.kind === 'text' || clip.kind === 'html' || clip.kind === 'audio'));
  elements.toolsPanel.hidden = !anyTools;
  if (elements.toolsPanelResizer) elements.toolsPanelResizer.hidden = !anyTools;
  if (options.refreshPreview !== false) setPlayhead(state.playhead);
}

function selectClip(id) {
  selectClips(id ? [id] : [], id);
}

function updateTransitionTools() {
  const selected = state.clips.filter((clip) => state.selectedIds.has(clip.id));
  const canAddTransition = selected.length === 2 &&
    selected.every((clip) => clip.kind === 'video' || clip.kind === 'image');
  const title = canAddTransition
    ? 'Lägg till övergång mellan markerade klipp'
    : 'Markera exakt två video- eller bildklipp';
  for (const button of [elements.addTransition, elements.quickTransition]) {
    button.disabled = !canAddTransition;
    button.title = title;
  }
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
  renderTimelineLinkConnectors();
  persist();
  updateLinkTool();
}

function updateCropTools(clip) {
  elements.cropTools.hidden = !(clip && (clip.kind === 'video' || clip.kind === 'image') && state.cropActive);
  requestAnimationFrame(updatePreviewWindowSize);
}

function imageSizeMetrics(clip) {
  if (!clip || clip.kind !== 'image') return null;
  const sourceWidth = Number(clip.sourceWidth);
  const sourceHeight = Number(clip.sourceHeight);
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return null;
  const canvas = state.canvas || { width: sourceWidth, height: sourceHeight };
  const canvasWidth = Number(canvas.width);
  const canvasHeight = Number(canvas.height);
  if (!(canvasWidth > 0) || !(canvasHeight > 0)) return null;
  const crop = clip.crop || { left: 0, right: 0, top: 0, bottom: 0 };
  const cropWidth = sourceWidth * (1 - crop.left - crop.right);
  const cropHeight = sourceHeight * (1 - crop.top - crop.bottom);
  if (!(cropWidth > 0) || !(cropHeight > 0)) return null;
  const containScale = Math.min(canvasWidth / cropWidth, canvasHeight / cropHeight);
  const baseWidth = cropWidth * containScale;
  const baseHeight = cropHeight * containScale;
  const scale = clamp(Number(clip.visualScale) || 1, 0.1, 4);
  return { baseWidth, baseHeight, width: baseWidth * scale, height: baseHeight * scale };
}

function syncImageSizeInputs(clip, force = false) {
  const metrics = imageSizeMetrics(clip);
  if (!metrics) return;
  if (force || document.activeElement !== elements.imageWidth) {
    elements.imageWidth.value = String(Math.max(1, Math.round(metrics.width)));
  }
  if (force || document.activeElement !== elements.imageHeight) {
    elements.imageHeight.value = String(Math.max(1, Math.round(metrics.height)));
  }
}

function updateImageSizeTools(clip) {
  const visible = Boolean(clip && clip.kind === 'image' && state.selectedIds.size === 1);
  elements.imageSizeTools.hidden = !visible;
  if (visible) syncImageSizeInputs(clip, true);
}

function setSelectedImageSize(dimension, rawValue) {
  const clip = state.clips.find((item) => item.id === state.selectedId && item.kind === 'image');
  const metrics = imageSizeMetrics(clip);
  const targetPixels = Number(rawValue);
  if (!clip || !metrics || !Number.isFinite(targetPixels) || targetPixels <= 0) {
    if (clip) syncImageSizeInputs(clip, true);
    return false;
  }
  const basePixels = dimension === 'height' ? metrics.baseHeight : metrics.baseWidth;
  const nextScale = clamp(targetPixels / basePixels, 0.1, 4);
  if (Math.abs(nextScale - (Number(clip.visualScale) || 1)) < 0.000001) {
    syncImageSizeInputs(clip, true);
    return false;
  }
  recordHistory();
  clip.visualScale = Math.round(nextScale * 1000000) / 1000000;
  refreshPreviewLayout();
  syncImageSizeInputs(clip, true);
  const updated = imageSizeMetrics(clip);
  elements.info.textContent = `${describeClip(clip)} · ${Math.round(updated.width)}×${Math.round(updated.height)} px`;
  persist();
  updateAutoFitLabel();
  return true;
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
  const offX = (Number(clip.posX) || 0) * pw;
  const offY = (Number(clip.posY) || 0) * ph;
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
    l = vL + c.left * vW + offX;
    r = vL + (1 - c.right) * vW + offX;
    t = vT + c.top * vH + offY;
    b = vT + (1 - c.bottom) * vH + offY;
  } else {
    l = c.left * pw + offX;
    r = (1 - c.right) * pw + offX;
    t = c.top * ph + offY;
    b = (1 - c.bottom) * ph + offY;
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
  if (clip.kind === 'video') {
    const previewElement = visualMediaElement(clip);
    if (previewElement && !previewElement.paused && previewElement.readyState >= 2) {
      previewElement.pause();
    }
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
  if (!clip || typeof clip !== 'object') return clip;
  if (clip.crop && typeof clip.crop === 'object') {
    const cropValue = (value) => clamp(Number.isFinite(Number(value)) ? Number(value) : 0, 0, 0.95);
    clip.crop = {
      left: cropValue(clip.crop.left), right: cropValue(clip.crop.right),
      top: cropValue(clip.crop.top), bottom: cropValue(clip.crop.bottom)
    };
  }
  if (clip.kind === 'blur') clip.blur = normalizeBlur(clip.blur);
  if (clip?.kind === 'color') clip.color = normalizeColorBlock(clip.color);
  if (clip.kind === 'text') clip.text = normalizeText(clip.text);
  if (clip.kind === 'html') clip.html = normalizeHtml(clip.html);
  if (clip?.kind === 'video' || clip?.kind === 'image') {
    if (!Number.isFinite(clip.posX)) clip.posX = 0;
    if (!Number.isFinite(clip.posY)) clip.posY = 0;
    if (clip.circular && !Number.isFinite(clip.circular.size)) clip.circular.size = 0.5;
    if (!clip.circular) clip.circular = null;
    for (const key of ['animIn', 'animOut']) {
      if (!clip[key] || typeof clip[key] !== 'object') {
        clip[key] = null;
      } else if (!['fade', 'scale', 'slide-up', 'slide-down', 'slide-left', 'slide-right'].includes(clip[key].type)) {
        clip[key] = null;
      } else {
        clip[key] = { type: clip[key].type, duration: clamp(Number(clip[key].duration) || 0.5, 0.1, 3) };
      }
    }
  }
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
    const animOut = clip.animOut || { type: 'none' };
    elements.animOutBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.animOut === animOut.type));
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

function handleAnimOutClick(event) {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || (clip.kind !== 'video' && clip.kind !== 'image')) return;
  const type = event.currentTarget.dataset.animOut;
  recordHistory();
  if (type === 'none') delete clip.animOut;
  else clip.animOut = { type, duration: Number(elements.animDuration.value) };
  updateAnimTools(clip);
  setPlayhead(state.playhead);
  persist();
}

function handleAnimDuration() {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || (clip.kind !== 'video' && clip.kind !== 'image') || (!clip.animIn && !clip.animOut)) return;
  const duration = clamp(Number(elements.animDuration.value), 0.1, 3);
  if (clip.animIn) clip.animIn.duration = duration;
  if (clip.animOut) clip.animOut.duration = duration;
  elements.animDurationValue.textContent = `${clip.animIn.duration.toFixed(1)} s`;
  persist();
}

elements.animBtns = [...document.querySelectorAll('.anim-btn')];
elements.animOutBtns = [...document.querySelectorAll('[data-anim-out]')];
elements.animDuration = document.getElementById('anim-duration');
elements.animDurationValue = document.getElementById('anim-dur-value');
elements.animTools = document.getElementById('anim-tools');
elements.animBtns.forEach((btn) => btn.addEventListener('click', handleAnimClick));
elements.animOutBtns.forEach((btn) => btn.addEventListener('click', handleAnimOutClick));
elements.animDuration.addEventListener('input', handleAnimDuration);

elements.shapeTools = document.getElementById('shape-tools');
elements.circularMask = document.getElementById('circular-mask');
elements.circularSize = document.getElementById('circular-size');
elements.circularSizeValue = document.getElementById('circular-size-value');

function circularSizeForPercent(percent) {
  return clamp((Number(percent) || 100) / 100 * 0.5, 0.1, 0.5);
}

function percentForCircularSize(size) {
  return Math.round(((Number(size) || 0.5) / 0.5) * 100);
}

function updateShapeTools(clip) {
  const canShape = clip && (clip.kind === 'video' || clip.kind === 'image');
  elements.shapeTools.hidden = !canShape;
  if (!canShape) return;
  const circular = clip.circular || null;
  elements.circularMask.checked = Boolean(circular);
  elements.circularSize.disabled = !circular;
  const percent = circular ? percentForCircularSize(circular.size) : 100;
  elements.circularSize.value = String(clamp(percent, 20, 100));
  elements.circularSizeValue.textContent = `${elements.circularSize.value}%`;
}

function handleCircularMaskChange() {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || (clip.kind !== 'video' && clip.kind !== 'image')) return;
  recordHistory();
  if (elements.circularMask.checked) {
    clip.circular = { size: circularSizeForPercent(elements.circularSize.value) };
  } else {
    delete clip.circular;
  }
  updateShapeTools(clip);
  setPlayhead(state.playhead);
  persist();
}

function handleCircularSizeInput() {
  const clip = state.clips.find((item) => item.id === state.selectedId);
  if (!clip || (clip.kind !== 'video' && clip.kind !== 'image') || !clip.circular) return;
  beginInputEdit();
  clip.circular.size = circularSizeForPercent(elements.circularSize.value);
  elements.circularSizeValue.textContent = `${elements.circularSize.value}%`;
  recordInputEdit();
  setPlayhead(state.playhead);
}

elements.circularMask.addEventListener('change', handleCircularMaskChange);
elements.circularSize.addEventListener('input', handleCircularSizeInput);

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
  return { text: 'Skriv din text här', presetId: 'simple', fontSize: 0.08, color: '#FFFFFF', background: 'none', x: 0.5, y: 0.5, scaleX: 1, animIn: null, animOut: null };
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
    presetId: Object.hasOwn(TEXT_PRESETS, base.presetId) ? base.presetId : 'simple',
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

const waveformFetchQueue = [];
let activeWaveformFetches = 0;
const MAX_CONCURRENT_WAVEFORM_FETCHES = 2;

function drainWaveformQueue() {
  while (activeWaveformFetches < MAX_CONCURRENT_WAVEFORM_FETCHES && waveformFetchQueue.length > 0) {
    const { url, entry } = waveformFetchQueue.shift();
    activeWaveformFetches += 1;
    const finish = () => {
      activeWaveformFetches -= 1;
      drainWaveformQueue();
    };
    const attempt = (n) => {
      fetch(url)
        .then((res) => {
          if (res.status === 429 && n < 6) {
            setTimeout(() => attempt(n + 1), Math.min(300 * (2 ** n), 5000));
            return null;
          }
          if (!res.ok) throw new Error();
          return res.json();
        })
        .then((data) => {
          if (!data) return;
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
        })
        .finally(finish);
    };
    attempt(0);
  }
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
  const url = `/api/media/${encodeURIComponent(mediaId)}/waveform?${params}`;
  waveformFetchQueue.push({ url, entry });
  drainWaveformQueue();
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
    setClipLoadingState(clip.id, 'waveform', true);
    return;
  }
  setClipWaveformLoading(clip.id, false);
  setClipLoadingState(clip.id, 'waveform', false);
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

const thumbnailImageCache = new Map();

function drawTimelineThumbnails(canvas, clip) {
  if (!canvas || canvas.width < 1 || canvas.height < 1) return;
  let ctx;
  try { ctx = canvas.getContext('2d'); } catch (e) { return; }
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#1a1d23';
  ctx.fillRect(0, 0, w, h);
  const boxW = 128;
  const count = Math.max(1, Math.min(8, Math.floor(w / boxW)));
  const frameWidth = Math.max(32, Math.min(320, Math.round(boxW / 32) * 32));
  const clipStart = Math.max(0, Number(clip.trimStart) || 0);
  const clipEnd = Math.max(clipStart + 0.2, Number(clip.trimEnd) || clipStart + 0.2);
  const key = `${clip.mediaId}:${frameWidth}:${count}:${clipStart.toFixed(3)}:${clipEnd.toFixed(3)}`;
  let image = thumbnailImageCache.get(key);
  if (!image) {
    const startedAt = performance.now();
    image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      setClipLoadingState(clip.id, 'thumbnail', false);
      if (!thumbnailImageCache.has(key)) thumbnailImageCache.set(key, image);
      const elapsed = Math.round(performance.now() - startedAt);
      logProcess(`Previewbilder ${clip.name || clip.mediaId} · ${count} st · ${elapsed} ms`, 'ok');
      const liveCanvas = document.querySelector(`.clip[data-id="${CSS.escape(clip.id)}"] .clip-thumbs`);
      if (liveCanvas && liveCanvas.width === w && liveCanvas.height === h) {
        const liveCtx = liveCanvas.getContext('2d');
        if (liveCtx) drawThumbSprite(liveCtx, w, h, image, count);
      }
    };
    image.onerror = () => {
      setClipLoadingState(clip.id, 'thumbnail', false, true);
      logProcess(`Previewbilder misslyckades: ${clip.name || clip.mediaId}`, 'error');
      ctx.fillStyle = '#1a1515';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#5a3a3a';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('✕', w / 2, h / 2 + 3);
    };
    image.src = `/api/media/${encodeURIComponent(clip.mediaId)}/thumbs?width=${frameWidth}&count=${count}&start=${clipStart.toFixed(3)}&end=${clipEnd.toFixed(3)}`;
    setClipLoadingState(clip.id, 'thumbnail', true);
    thumbnailImageCache.set(key, image);
    return;
  }
  if (image.complete && image.naturalWidth > 0) drawThumbSprite(ctx, w, h, image, count);
  else {
    ctx.fillStyle = '#0d1f12';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('⚇', w / 2, h / 2 + 3);
  }
}

function drawThumbSprite(ctx, w, h, image, count) {
  const spriteWidth = image.naturalWidth;
  const spriteHeight = image.naturalHeight;
  if (!spriteWidth || !spriteHeight) return;
  const frameW = spriteWidth / count;
  const frameH = spriteHeight;
  const boxW = 128;
  const boxH = h;
  const totalW = boxW * count;
  const offsetX = Math.max(0, Math.floor((w - totalW) / 2));
  const scale = Math.min(boxW / frameW, boxH / frameH);
  const drawW = frameW * scale;
  const drawH = frameH * scale;
  const dx = (boxW - drawW) / 2;
  const dy = (boxH - drawH) / 2;
  for (let i = 0; i < count; i += 1) {
    ctx.drawImage(
      image,
      i * frameW, 0, frameW, frameH,
      offsetX + i * boxW + dx, dy, drawW, drawH
    );
  }
}

const overlayRenderCache = { blur: '', color: '', text: '', html: '' };

function overlaySignature(kind, time) {
  const active = state.clips.filter((clip) =>
    clip.kind === kind && time >= clip.start && time < clip.start + clipDuration(clip) &&
    layerVisible(clip.trackIndex || 0)
  );
  const model = active.map((clip) => {
    const overlay = kind === 'blur' ? clip.blur
      : kind === 'color' ? clip.color
        : kind === 'text' ? clip.text
          : kind === 'html' ? clip.html
            : null;
    return [clip.id, overlay];
  }).sort((a, b) => a[0].localeCompare(b[0]));
  const anims = active.some((clip) => clip.kind === 'text' && (clip.text?.animIn || clip.text?.animOut))
    ? `:anim`
    : '';
  return `${JSON.stringify(model)}|${state.selectedId || ''}${anims}`;
}

function renderBlurOverlays(time) {
  const signature = overlaySignature('blur', time);
  if (signature === overlayRenderCache.blur) return;
  overlayRenderCache.blur = signature;
  const active = state.clips.filter((clip) =>
    clip.kind === 'blur' && time >= clip.start && time < clip.start + clipDuration(clip) &&
    layerVisible(clip.trackIndex || 0)
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
  const signature = overlaySignature('color', time);
  if (signature === overlayRenderCache.color) return;
  overlayRenderCache.color = signature;
  const layer = getColorLayer();
  const active = state.clips.filter((clip) =>
    clip.kind === 'color' && time >= clip.start && time < clip.start + clipDuration(clip) &&
    layerVisible(clip.trackIndex || 0)
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
  const signature = overlaySignature('text', time);
  const layer = getTextLayer();
  if (signature === overlayRenderCache.text) {
    if (signature.includes(':anim')) updateTextOverlayAnimations(time);
    return;
  }
  overlayRenderCache.text = signature;
  const previewHeight = elements.previewWindow.clientHeight || 1;
  const active = state.clips.filter((clip) =>
    clip.kind === 'text' && time >= clip.start && time < clip.start + clipDuration(clip) &&
    layerVisible(clip.trackIndex || 0)
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

function updateTextOverlayAnimations(time) {
  const layer = getTextLayer();
  for (const box of layer.querySelectorAll('.text-overlay')) {
    const clip = state.clips.find((c) => c.id === box.dataset.id && c.kind === 'text');
    if (!clip) continue;
    clip.text = normalizeText(clip.text);
    const text = clip.text;
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
  const signature = overlaySignature('html', time);
  if (signature === overlayRenderCache.html) return;
  overlayRenderCache.html = signature;
  const layer = getHtmlLayer();
  const active = state.clips.filter((clip) =>
    clip.kind === 'html' && time >= clip.start && time < clip.start + clipDuration(clip) &&
    layerVisible(clip.trackIndex || 0)
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
        time >= item.start && time < item.start + clipDuration(item)
    );
    if (clip) localTime = time - clip.start + clip.trimStart;
    else localTime = -1;
  }
  const wordsPerView = Math.max(1, Math.min(20, Number(elements.transcriptWords.value) || 3));
  const hideLayer = () => {
    layer.replaceChildren();
    layer.hidden = true;
  };
  if (state.transcriptionWords.length > 0) {
    const words = state.transcriptionWords;
    if (localTime < 0) return hideLayer();
    let activeIndex = -1;
    for (let i = 0; i < words.length; i += 1) {
      if (words[i].start <= localTime) activeIndex = i;
      else break;
    }
    if (activeIndex < 0) return hideLayer();
    const lastEnd = words[words.length - 1].end;
    if (localTime > lastEnd + 1.5) return hideLayer();
    const windowStart = Math.max(0, activeIndex - wordsPerView + 1);
    const visible = words.slice(windowStart, activeIndex + 1).map((item) => item.word);
    layer.hidden = false;
    layer.textContent = visible.join(' ');
    return;
  }
  const segment = state.transcriptionSegments.find(
    (item) => localTime >= item.start && localTime < item.end
  );
  if (!segment) return hideLayer();
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
  const offsetX = (Number(clip.posX) || 0) * frameWidth;
  const offsetY = (Number(clip.posY) || 0) * frameHeight;
  const circularSize = clip.circular ? clamp(Number(clip.circular.size) || 0.5, 0.1, 0.5) : 0;
  const clipPath = circularSize > 0
    ? `circle(${(circularSize * Math.min(renderedWidth, renderedHeight)).toFixed(2)}px at 50% 50%)`
    : `inset(${crop.top * 100}% ${crop.right * 100}% ${crop.bottom * 100}% ${crop.left * 100}%)`;
  const cacheKey = [sourceWidth, sourceHeight, frameWidth, frameHeight,
    crop.left, crop.right, crop.top, crop.bottom, visualScale, offsetX, offsetY, circularSize].join('|');
  if (mediaElement._layoutCache !== cacheKey) {
    Object.assign(mediaElement.style, {
      position: 'absolute',
      width: `${renderedWidth}px`,
      height: `${renderedHeight}px`,
      left: `${visibleLeft - cropLeft + offsetX}px`,
      top: `${visibleTop - cropTop + offsetY}px`,
      objectFit: 'fill',
      clipPath
    });
    mediaElement._layoutCache = cacheKey;
  }
  applyTransitionPreview(clip, mediaElement, state.playhead);
  updateVisualScaleOverlay(clip, { left: visibleLeft + offsetX, top: visibleTop + offsetY, width: visibleWidth, height: visibleHeight });
  if (clip.kind === 'image' && clip.id === state.selectedId) syncImageSizeInputs(clip);
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
  const bounds = elements.visualScaleOverlay.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const corner = event.currentTarget.dataset.corner || 'se';
  const cornerX = corner.includes('e') ? 1 : -1;
  const cornerY = corner.includes('s') ? 1 : -1;
  const initialProjection = (event.clientX - centerX) * cornerX + (event.clientY - centerY) * cornerY;
  if (initialProjection < 0.5) return;
  state.visualScaleDrag = {
    clip,
    pointerId: event.pointerId,
    centerX,
    centerY,
    cornerX,
    cornerY,
    initialProjection: Math.max(1, initialProjection),
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
  const projection = Math.max(1, (event.clientX - drag.centerX) * drag.cornerX + (event.clientY - drag.centerY) * drag.cornerY);
  const nextScale = clamp(drag.initialScale * projection / drag.initialProjection, 0.1, 4);
  if (Math.abs(nextScale - (drag.clip.visualScale || 1)) < 0.001) return;
  if (!drag.historyRecorded) {
    pushHistorySnapshot(drag.snapshot);
    drag.historyRecorded = true;
  }
  drag.clip.visualScale = nextScale;
  applyVisualLayout(drag.clip, visualMediaElement(drag.clip));
  elements.info.textContent = `${describeClip(drag.clip)} · skala ${Math.round(nextScale * 100)}%`;
  event.preventDefault();
}

function stopVisualScaleDrag(event) {
  if (!state.visualScaleDrag || state.visualScaleDrag.pointerId !== event.pointerId) return;
  state.visualScaleDrag = null;
  persist();
  updateAutoFitLabel();
}

function startVisualMoveDrag(event) {
  if (state.cropActive || state.visualScaleDrag) return;
  if (event.target.closest('.visual-scale-overlay, .crop-overlay, .text-overlay, .color-block, .html-block, .blur-region')) return;
  const clipId = event.currentTarget.dataset.clipId;
  const clip = state.clips.find((item) => item.id === clipId && (item.kind === 'video' || item.kind === 'image'));
  if (!clip) return;
  if (state.playhead < clip.start || state.playhead >= clip.start + clipDuration(clip)) return;
  if (state.selectedId !== clip.id) selectClip(clip.id);
  const frame = elements.previewWindow.getBoundingClientRect();
  state.visualMoveDrag = {
    clip,
    pointerId: event.pointerId,
    originX: event.clientX,
    originY: event.clientY,
    initialPosX: Number(clip.posX) || 0,
    initialPosY: Number(clip.posY) || 0,
    frameWidth: frame.width || 1,
    frameHeight: frame.height || 1,
    snapshot: editorSnapshot(),
    historyRecorded: false
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function moveVisualMoveDrag(event) {
  const drag = state.visualMoveDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const nextX = clamp(drag.initialPosX + (event.clientX - drag.originX) / drag.frameWidth, -1, 1);
  const nextY = clamp(drag.initialPosY + (event.clientY - drag.originY) / drag.frameHeight, -1, 1);
  if (nextX === drag.clip.posX && nextY === drag.clip.posY) return;
  if (!drag.historyRecorded) {
    pushHistorySnapshot(drag.snapshot);
    drag.historyRecorded = true;
  }
  drag.clip.posX = nextX;
  drag.clip.posY = nextY;
  applyVisualLayout(drag.clip, visualMediaElement(drag.clip));
  event.preventDefault();
}

function stopVisualMoveDrag(event) {
  if (!state.visualMoveDrag || state.visualMoveDrag.pointerId !== event.pointerId) return;
  state.visualMoveDrag = null;
  persist();
  updateAutoFitLabel();
}

function applyTransitionPreview(clip, mediaElement, time) {
  let opacity = '';
  let transform = '';
  const transition = clip.transitionIn;
  if (transition && time >= clip.start && time < transition.cut) {
    const progress = clamp((time - clip.start) / transition.duration, 0, 1);
    if (transition.type === 'dissolve') opacity = String(progress);
    if (transition.type === 'slide-left') transform = `translateX(${(1 - progress) * 100}%)`;
    if (transition.type === 'slide-right') transform = `translateX(${(1 - progress) * -100}%)`;
    if (transition.type === 'slide-up') transform = `translateY(${(1 - progress) * 100}%)`;
    if (transition.type === 'slide-down') transform = `translateY(${(1 - progress) * -100}%)`;
  }
  const anim = clip.animIn;
  if (anim && !transition && time >= clip.start && time < clip.start + anim.duration) {
    const progress = clamp((time - clip.start) / anim.duration, 0, 1);
    if (anim.type === 'fade') opacity = String(progress);
    if (anim.type === 'scale') transform = `scale(${progress})`;
    if (anim.type === 'slide-up') transform = `translateY(${(1 - progress) * 100}%)`;
  }
  const animOut = clip.animOut;
  const clipEnd = clip.start + clipDuration(clip);
  if (animOut?.type === 'fade' && time >= clipEnd - animOut.duration && time < clipEnd) {
    const progress = clamp((time - (clipEnd - animOut.duration)) / animOut.duration, 0, 1);
    const outOpacity = 1 - progress;
    opacity = opacity === '' ? String(outOpacity) : String(Math.min(Number(opacity), outOpacity));
  }
  if (mediaElement.style.opacity !== opacity) mediaElement.style.opacity = opacity;
  if (mediaElement.style.transform !== transform) mediaElement.style.transform = transform;
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

function layerVisible(trackIndex) {
  return !state.hiddenLayers.has(trackIndex);
}

function syncLayerEye() {
  state.visualLabelEls.forEach((label, index) => {
    let eye = label.querySelector('.layer-eye');
    if (!eye) {
      eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'layer-eye';
      eye.setAttribute('aria-label', `Dölj/visa lager ${index + 1}`);
      eye.title = `Dölj/visa lager ${index + 1}`;
      eye.textContent = '👁';
      eye.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleLayerVisibility(index);
      });
      label.prepend(eye);
    }
    eye.classList.toggle('active', layerVisible(index));
  });
}

function toggleLayerVisibility(trackIndex) {
  recordHistory();
  if (state.hiddenLayers.has(trackIndex)) state.hiddenLayers.delete(trackIndex);
  else state.hiddenLayers.add(trackIndex);
  syncLayerEye();
  renderLayerMedia(state.playhead, state.playing);
}

function activeVisualLayers(time) {
  return state.clips
    .filter((clip) => {
      if (clip.kind !== 'video' && clip.kind !== 'image') return false;
      if (!layerVisible(clip.trackIndex || 0)) return false;
      if (time < clip.start || time >= clip.start + clipDuration(clip)) return false;
      return true;
    })
    .sort((a, b) => (a.trackIndex || 0) - (b.trackIndex || 0));
}

function layerMediaElement(clip, isTop) {
  if (isTop) return clip.kind === 'video' ? elements.preview : elements.imagePreview;
  let element = state.previewLayers.get(clip.id);
  if (element) return element;
  element = document.createElement(clip.kind === 'video' ? 'video' : 'img');
  element.className = `layer-media ${clip.kind === 'video' ? 'layer-video' : 'layer-image'}`;
  element.preload = 'metadata';
  if (clip.kind === 'video') element.playsInline = true;
  element.muted = true;
  element.hidden = true;
  elements.previewWindow.appendChild(element);
  state.previewLayers.set(clip.id, element);
  return element;
}

function visualMediaElement(clip) {
  const dynamic = state.previewLayers.get(clip.id);
  if (dynamic) return dynamic;
  return clip.kind === 'video' ? elements.preview : elements.imagePreview;
}

let lastLayerPrune = 0;
function prunePreviewLayers() {
  const now = performance.now();
  if (now - lastLayerPrune < 1000) return;
  lastLayerPrune = now;
  for (const [clipId, element] of state.previewLayers) {
    if (!state.clips.some((clip) => clip.id === clipId)) {
      element.pause?.();
      element.remove();
      state.previewLayers.delete(clipId);
    }
  }
}

function seekVideoElement(element, time) {
  try { element.currentTime = time; } catch (_error) { /* metadata saknas */ }
}

function playMediaElementWhenReady(element) {
  if (!state.playing || !element) return;
  if (!element.paused && !element.ended) return;
  if (element.ended) element.pause();
  const attempt = () => {
    if (!state.playing || !element.paused) {
      element._playbackRetryPending = false;
      return;
    }
    const result = element.play();
    if (result?.catch) {
      result.catch(() => {
        if (!state.playing || element._playbackRetryPending) return;
        element._playbackRetryPending = true;
        const retry = () => {
          if (!element._playbackRetryPending) return;
          element._playbackRetryPending = false;
          attempt();
        };
        element.addEventListener('canplay', retry, { once: true });
        element.addEventListener('loadeddata', retry, { once: true });
        window.setTimeout(retry, 120);
      });
    }
  };
  attempt();
}

function setPreviewMediaStatus(message, type = '') {
  const status = elements.previewMediaStatus;
  if (!status) return;
  status.textContent = message;
  status.className = `preview-media-status${type ? ` ${type}` : ''}`;
  status.hidden = !message;
}

function watchPreviewMediaReadiness(element, clip, isTop) {
  if (!isTop) return;
  const key = `${clip.id}:${clip.mediaId}`;
  if (element.dataset.loadingKey === key) return;
  element.dataset.loadingKey = key;
  const label = clip.kind === 'audio' ? 'ljud' : clip.kind === 'image' ? 'bild' : 'video';
  setPreviewMediaStatus(`Laddar ${label}…`);
  const ready = () => {
    if (element.dataset.loadingKey !== key) return;
    setClipLoadingState(clip.id, 'media', false);
    setPreviewMediaStatus('Klar', 'ok');
  };
  const failed = () => {
    if (element.dataset.loadingKey !== key) return;
    setClipLoadingState(clip.id, 'media', false, true);
    setPreviewMediaStatus(`Kunde inte ladda ${label}.`, 'error');
  };
  element.addEventListener(clip.kind === 'image' ? 'load' : 'canplay', ready, { once: true });
  element.addEventListener('error', failed, { once: true });
  if ((clip.kind === 'image' && element.complete) || (clip.kind !== 'image' && element.readyState >= 3)) ready();
}

function renderLayerMedia(time, playing = false) {
  const layers = activeVisualLayers(time);
  if (!state.playing && !elements.preview.paused) elements.preview.pause();
  elements.preview.hidden = true;
  elements.imagePreview.hidden = true;
  if (!layers.length) {
    setPreviewMediaStatus('');
    for (const element of state.previewLayers.values()) {
      element.hidden = true;
      if (element.pause && !element.paused) element.pause();
    }
    prunePreviewLayers();
    elements.placeholder.hidden = false;
    return;
  }
  const top = layers[layers.length - 1];
  const usedElements = new Set();
  for (const clip of layers) usedElements.add(layerMediaElement(clip, clip === top));
  for (const [clipId, element] of state.previewLayers) {
    if (usedElements.has(element)) continue;
    element.hidden = true;
    if (element.pause && !element.paused) element.pause();
  }
  prunePreviewLayers();
  elements.placeholder.hidden = true;
  for (const clip of layers) {
    const isTop = clip === top;
    const element = layerMediaElement(clip, isTop);
    const url = `/api/media/${encodeURIComponent(clip.mediaId)}/file`;
    element.dataset.clipId = clip.id;
    if (element.dataset.mediaId !== clip.mediaId) {
      element.pause?.();
      element._playbackRetryPending = false;
      try { element.currentTime = 0; } catch (_error) { /* källan återställs vid load */ }
      element.src = url;
      element.dataset.mediaId = clip.mediaId;
      setClipLoadingState(clip.id, 'media', true);
      // Explicitly restart the media pipeline when reusing the preview
      // element. Without load(), Chromium can keep the previous decoded
      // frame after an image→video or video→video boundary.
      if (!/jsdom/i.test(navigator.userAgent || '') && typeof element.load === 'function') element.load();
    }
    watchPreviewMediaReadiness(element, clip, isTop);
    const zIndex = String(Math.max(0, (clip.trackIndex || 0) * 10));
    if (element.style.zIndex !== zIndex) element.style.zIndex = zIndex;
    element.hidden = false;
    if (clip.kind === 'video') element.preload = state.playing && isTop ? 'auto' : 'metadata';
    applyVisualLayout(clip, element);
    if (clip.kind === 'image') continue;
    const sourceTime = clip.trimStart + time - clip.start;
    const muted = isTop ? !!clip.muted : true;
    if (element.muted !== muted) element.muted = muted;
    const targetTime = clamp(sourceTime, 0, clip.mediaDuration);
    const seekCurrentClip = () => {
      if (element.dataset.clipId === clip.id && element.dataset.mediaId === clip.mediaId) {
        seekVideoElement(element, targetTime);
        if (state.playing && playing) playMediaElementWhenReady(element);
      }
    };
    if (state.playing && playing) {
      if (element.readyState >= 1) {
        if (Math.abs((element.currentTime || 0) - targetTime) > 0.15) seekCurrentClip();
      } else {
        element.addEventListener('loadedmetadata', seekCurrentClip, { once: true });
        element.addEventListener('canplay', seekCurrentClip, { once: true });
        element.addEventListener('loadeddata', () => playMediaElementWhenReady(element), { once: true });
      }
      playMediaElementWhenReady(element);
    } else {
      if (element.readyState >= 1) seekCurrentClip();
      else element.addEventListener('loadedmetadata', seekCurrentClip, { once: true });
    }
  }
}

function refreshPreviewLayout() {
  if (state.previewLayers.size > 0 || activeVisualLayers(state.playhead).length > 0) {
    renderLayerMedia(state.playhead, state.playing);
    return;
  }
  const clipId = elements.preview.hidden ? elements.imagePreview.dataset.clipId : elements.preview.dataset.clipId;
  const clip = state.clips.find((item) => item.id === clipId);
  if (!clip) return;
  applyVisualLayout(clip, clip.kind === 'video' ? elements.preview : elements.imagePreview);
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
  for (const element of state.previewLayers.values()) {
    element.pause?.();
    element.remove();
  }
  state.previewLayers.clear();
  for (const element of state.mediaPreloaders.values()) element.src = '';
  state.mediaPreloaders.clear();
  updatePreloadStatus();
}

function preloadUpcomingMedia(time) {
  const now = performance.now();
  if (now - state.lastMediaPreloadAt < 250) return;
  state.lastMediaPreloadAt = now;
  const upcoming = state.clips
    .filter((clip) => ['video', 'audio', 'image'].includes(clip.kind) && clip.start > time && clip.start - time <= 4)
    .sort((a, b) => a.start - b.start)
    .slice(0, 6);
  const wanted = new Set(upcoming.map((clip) => clip.mediaId));
  for (const [mediaId, element] of state.mediaPreloaders) {
    if (!wanted.has(mediaId)) {
      element.src = '';
      state.mediaPreloaders.delete(mediaId);
    }
  }
  for (const clip of upcoming) {
    if (state.mediaPreloaders.has(clip.mediaId)) continue;
    const element = document.createElement(clip.kind === 'image' ? 'img' : clip.kind);
    element.preload = 'auto';
    if (clip.kind !== 'image') element.muted = true;
    element.dataset.preloadState = 'loading';
    const update = () => {
      element.dataset.preloadState = clip.kind === 'image' || element.readyState >= 3 ? 'ready' : 'loading';
      updatePreloadStatus();
    };
    element.addEventListener(clip.kind === 'image' ? 'load' : 'canplaythrough', update, { once: true });
    element.addEventListener('error', () => {
      element.dataset.preloadState = 'error';
      updatePreloadStatus();
    }, { once: true });
    element.src = `/api/media/${encodeURIComponent(clip.mediaId)}/file`;
    state.mediaPreloaders.set(clip.mediaId, element);
  }
  updatePreloadStatus();
}

function updatePreloadStatus() {
  const status = elements.previewPreloadStatus;
  if (!status) return;
  const elementsToLoad = [...state.mediaPreloaders.values()];
  if (!elementsToLoad.length) {
    status.hidden = true;
    return;
  }
  const ready = elementsToLoad.filter((element) => element.dataset.preloadState === 'ready').length;
  const errors = elementsToLoad.filter((element) => element.dataset.preloadState === 'error').length;
  const percent = Math.round((ready / elementsToLoad.length) * 100);
  status.textContent = errors
    ? `Förladdning ${percent}% · ${errors} kunde inte laddas`
    : `Förladdar nästa media ${percent}% (${ready}/${elementsToLoad.length})`;
  status.hidden = ready === elementsToLoad.length && errors === 0;
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
  player.defaultMuted = false;
  player.muted = false;
  player.volume = 1;
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
  state.playbackEnd = end;
  state.playbackOrigin = state.playhead;
  state.playbackStartedAt = performance.now();
  elements.togglePlay.querySelector('use').setAttribute('href', '#icon-pause');
  playbackTick(performance.now());
}

function stopPlayback() {
  state.playing = false;
  if (state.playbackFrame) cancelAnimationFrame(state.playbackFrame);
  state.playbackFrame = null;
  state.playbackEnd = 0;
  elements.preview.pause();
  for (const element of state.previewLayers.values()) element.pause?.();
  stopTimelineAudioPlayers();
  elements.togglePlay.querySelector('use').setAttribute('href', '#icon-play');
}

function playbackTick(now) {
  if (!state.playing) return;
  const time = state.playbackOrigin + (now - state.playbackStartedAt) / 1000;
  const end = state.playbackEnd || projectEnd();
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
    if (!layerVisible(clip.trackIndex || 0)) continue;
    if (time < clip.start || time >= clip.start + clipDuration(clip)) continue;
    max = Math.max(max, clip.trackIndex || 0);
  }
  return max;
}

function activeTrackMaxima(time) {
  const maxima = { color: 0, blur: 0, text: 0, html: 0, visual: 0 };
  for (const clip of state.clips) {
    if (!layerVisible(clip.trackIndex || 0) || time < clip.start || time >= clip.start + clipDuration(clip)) continue;
    const track = clip.trackIndex || 0;
    if (clip.kind === 'color') maxima.color = Math.max(maxima.color, track);
    else if (clip.kind === 'blur') maxima.blur = Math.max(maxima.blur, track);
    else if (clip.kind === 'text') maxima.text = Math.max(maxima.text, track);
    else if (clip.kind === 'html') maxima.html = Math.max(maxima.html, track);
    else if (['video', 'image'].includes(clip.kind)) maxima.visual = Math.max(maxima.visual, track);
  }
  return maxima;
}

const OVERLAY_BASE = { 'color-layer': 2, 'blur-layer': 3, 'text-layer': 4, 'html-layer': 5, 'transcript-overlay': 6 };
function setOverlayZ(className, maxTrack) {
  const el = className === 'blur-layer' ? elements.blurLayer : elements.previewWindow.querySelector('.' + className);
  if (el) el.style.zIndex = String(OVERLAY_BASE[className] + maxTrack * 10);
}

function syncPlaybackMedia(time) {
  renderLayerMedia(time, state.playing);
  const visual = timelineModel.topActiveVisual(state.clips, time);
  const baseTrack = visual ? (visual.trackIndex || 0) : -1;
  if (elements.imagePreview.style) elements.imagePreview.style.zIndex = String(Math.max(0, baseTrack * 10));
  if (elements.preview.style) elements.preview.style.zIndex = String(Math.max(0, baseTrack * 10));
  const maxima = activeTrackMaxima(time);
  setOverlayZ('color-layer', maxima.color);
  setOverlayZ('blur-layer', maxima.blur);
  setOverlayZ('text-layer', maxima.text);
  setOverlayZ('html-layer', maxima.html);
  setOverlayZ('transcript-overlay', Math.max(maxima.visual, maxima.color, maxima.blur, maxima.text, maxima.html));
  renderBlurOverlays(time);
  renderColorOverlays(time);
  renderTextOverlays(time);
  renderHtmlOverlays(time);
  renderTranscriptOverlay(time);

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
    // A hidden media element must still be explicitly audible.  Some
    // browsers preserve muted/defaultMuted from a previous source or from a
    // preloader when the element is reused.
    player.defaultMuted = false;
    player.muted = false;
    player.volume = 1;
    const sourceTime = audio.trimStart + time - audio.start;
    const targetTime = clamp(sourceTime, 0, audio.mediaDuration);
    const changed = player.dataset.mediaId !== audio.mediaId;
    const seek = () => {
      try {
        player.currentTime = targetTime;
      } catch (_error) { /* metadata laddas fortfarande */ }
    };
    if (changed) {
      player.pause();
      player._playbackRetryPending = false;
      player.src = `/api/media/${encodeURIComponent(audio.mediaId)}/file`;
      player.dataset.mediaId = audio.mediaId;
      // Calling load() after changing src makes the source switch reliable
      // for detached/hidden audio elements (notably Chromium after a clip
      // boundary).  jsdom does not implement load(), so skip it there.
      if (!/jsdom/i.test(navigator.userAgent || '') && typeof player.load === 'function') player.load();
      if (player.readyState >= 1) seek();
      else player.addEventListener('loadedmetadata', seek, { once: true });
      player.addEventListener('canplay', () => playMediaElementWhenReady(player), { once: true });
      player.addEventListener('loadeddata', () => playMediaElementWhenReady(player), { once: true });
    } else if (player.readyState >= 1 && Math.abs(player.currentTime - targetTime) > 0.15) {
      seek();
    }
    if (!activeVisualLayers(time).length) watchPreviewMediaReadiness(player, audio, true);
    if (player.paused) player.play().catch(() => {});
    playMediaElementWhenReady(player);
  }
}

function setPlayhead(seconds, updatePreview = true) {
  state.playhead = Math.max(0, seconds);
  if (updatePreview) updateTimelineWidth();
  elements.playhead.style.left = `${secondsToPixels(state.playhead)}px`;
  updatePlayheadFollowIndicator();
  elements.timecode.textContent = formatTime(state.playhead);
  updateTranscriptionPlayheadHighlight();
  if (editorHistory.clipboard) renderProgramClipboard();
  followPlayheadIntoView();
  if (!updatePreview) return;
  const p = state.playhead;
  const base = timelineModel.topActiveVisual(state.clips, p);
  const baseTrack = base ? (base.trackIndex || 0) : -1;
  if (elements.imagePreview.style) elements.imagePreview.style.zIndex = String(Math.max(0, baseTrack * 10));
  if (elements.preview.style) elements.preview.style.zIndex = String(Math.max(0, baseTrack * 10));
  setOverlayZ('color-layer', maxTrackFor(p, ['color']));
  setOverlayZ('blur-layer', maxTrackFor(p, ['blur']));
  setOverlayZ('text-layer', maxTrackFor(p, ['text']));
  setOverlayZ('html-layer', maxTrackFor(p, ['html']));
  setOverlayZ('transcript-overlay', maxTrackFor(p, ['video', 'image', 'color', 'blur', 'text', 'html']));
  renderBlurOverlays(state.playhead);
  renderColorOverlays(state.playhead);
  renderTextOverlays(state.playhead);
  renderHtmlOverlays(state.playhead);
  renderTranscriptOverlay(state.playhead);
  persist();
  renderLayerMedia(state.playhead, state.playing);
  preloadUpcomingMedia(state.playhead);
  const visible = timelineModel.topActiveVisual(state.clips, state.playhead);
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

elements.timeline.addEventListener('click', (event) => {
  if (!state.pendingSegmentImport) return;
  event.preventDefault();
  event.stopPropagation();
  const point = timelinePointFromClient(event.clientX, event.clientY);
  const destination = snapSegmentTime(pixelsToSeconds(point.x));
  const segment = state.pendingSegmentImport;
  state.pendingSegmentImport = null;
  document.body.classList.remove('segment-import-armed');
  openTrackPlacementModal({ type: 'segment-import', segment, destination });
}, true);

elements.timeline.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  if (state.pendingSegmentImport) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
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
    if (state.selectedFlagId) {
      state.selectedFlagId = null;
      renderFlags();
    }
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

function moveDraggedAudioClipsToTrack(action, targetTrackIndex) {
  const movingAudio = action.movingClips.filter((item) => item.clip.kind === 'audio');
  const primary = movingAudio.find((item) => item.clip.id === action.clip.id);
  if (!primary || !movingAudio.length) return false;
  const minimumTrack = Math.min(...movingAudio.map((item) => item.originalTrackIndex));
  const requestedDelta = targetTrackIndex - primary.originalTrackIndex;
  const trackDelta = Math.max(-minimumTrack, requestedDelta);
  const assignments = movingAudio.map((item) => ({
    item,
    trackIndex: item.originalTrackIndex + trackDelta
  }));
  if (assignments.every(({ item, trackIndex }) => (item.clip.trackIndex || 0) === trackIndex)) return false;

  recordTimelineActionHistory(action);
  ensureAudioTrack(Math.max(...assignments.map(({ trackIndex }) => trackIndex)));
  for (const { item, trackIndex } of assignments) {
    const clip = item.clip;
    clip.trackIndex = trackIndex;
    const element = document.querySelector(`.clip[data-id="${CSS.escape(clip.id)}"]`);
    if (element && element.parentNode !== state.audioTrackEls[trackIndex]) {
      element.remove();
      ensureAudioTrack(trackIndex).appendChild(element);
    }
  }
  return true;
}

const SNAP_PX = 8;

function snapCandidates() {
  const times = new Set();
  for (const clip of state.clips) {
    if (state.action?.movingClips?.some((item) => item.clip.id === clip.id)) continue;
    times.add(clip.start);
    times.add(clip.start + clipDuration(clip));
  }
  times.add(state.playhead);
  times.add(0);
  return [...times];
}

function snapDelta(movingClips, proposedDelta) {
  const threshold = Math.max(pixelsToSeconds(SNAP_PX), 1 / 30);
  const candidates = snapCandidates();
  let best = null;
  for (const item of movingClips) {
    const start = item.originalStart + proposedDelta;
    const end = start + clipDuration(item.clip);
    for (const candidate of candidates) {
      for (const edge of [start, end]) {
        const diff = candidate - edge;
        if (Math.abs(diff) <= threshold && (!best || Math.abs(diff) < Math.abs(best.diff))) {
          best = { diff, time: candidate };
        }
      }
    }
  }
  return best;
}

function showSnapGuide(time) {
  elements.snapGuide.hidden = false;
  elements.snapGuide.style.left = `${secondsToPixels(time)}px`;
}

function hideSnapGuide() {
  if (elements.snapGuide) elements.snapGuide.hidden = true;
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
    let actualDelta = Math.max(-minimumStart, delta);
    const snap = snapDelta(action.movingClips, actualDelta);
    if (snap) {
      actualDelta += snap.diff;
      showSnapGuide(snap.time);
    } else {
      hideSnapGuide();
    }
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
      if (trackEl?.classList.contains('audio-track')) {
        const trackIndex = state.audioTrackEls.indexOf(trackEl);
        if (trackIndex >= 0) {
          action.originY = event.clientY;
          moveDraggedAudioClipsToTrack(action, trackIndex);
        }
      } else if (trackEl?.classList.contains('visual-track')) {
        const trackIndex = state.visualTrackEls.indexOf(trackEl);
        if (trackIndex >= 0) {
          action.originY = event.clientY;
          moveDraggedVisualClipsToTrack(action, trackIndex);
        }
      } else {
        if (action.clip.kind === 'audio') {
          const bottomTrack = state.audioTrackEls.at(-1);
          if (bottomTrack) {
            const bottomRect = bottomTrack.getBoundingClientRect();
            if (event.clientY > bottomRect.bottom) {
              action.originY = event.clientY;
              moveDraggedAudioClipsToTrack(action, state.audioTrackEls.length);
            }
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
  hideSnapGuide();
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
  if (!selectedIds.size) {
    splitAllClipsAtPlayhead();
    return;
  }

  const targetIds = new Set(state.clips.filter((clip) => {
    if (!selectedIds.has(clip.id)) return false;
    const offset = state.playhead - clip.start;
    return offset > MIN_CLIP_SECONDS && offset < clipDuration(clip) - MIN_CLIP_SECONDS;
  }).map((clip) => clip.id));
  for (const clip of state.clips) {
    if (!targetIds.has(clip.id) || !clip.linkGroupId) continue;
    for (const partner of state.clips) {
      if (partner.linkGroupId !== clip.linkGroupId) continue;
      const offset = state.playhead - partner.start;
      if (offset > MIN_CLIP_SECONDS && offset < clipDuration(partner) - MIN_CLIP_SECONDS) {
        targetIds.add(partner.id);
      }
    }
  }
  const targets = state.clips.filter((clip) => targetIds.has(clip.id));
  if (!targets.length) return alert('Placera spelhuvudet inuti minst ett markerat klipp.');

  splitClipsAtPlayhead(targets);
}

function splitAllClipsAtPlayhead() {
  const targets = state.clips.filter((clip) => {
    const offset = state.playhead - clip.start;
    return offset > MIN_CLIP_SECONDS && offset < clipDuration(clip) - MIN_CLIP_SECONDS;
  });
  if (!targets.length) return alert('Placera spelhuvudet inuti minst ett klipp.');
  splitClipsAtPlayhead(targets);
  selectClips([], null);
}

function splitClipsAtPlayhead(targets) {
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
  const selected = state.clips.filter((item) => state.selectedIds.has(item.id));
  const clip = selected.find((item) => item.id === state.selectedId) || selected[0]
    || state.clips.find((item) => item.id === state.selectedId);
  if (!clip) return false;
  if (selected.length > 1) {
    const start = Math.min(...selected.map((item) => item.start));
    const end = Math.max(...selected.map((item) => item.start + clipDuration(item)));
    const segment = timelineModel.sliceClipsToSegment(selected, start, end);
    if (!segment) return false;
    editorHistory.clipboard = { type: 'segment', duration: segment.duration, clips: segment.clips };
  } else {
    editorHistory.clipboard = { type: 'clip', clip: cloneValue(clip) };
  }
  renderProgramClipboard();
  return true;
}

function internalClipboardPayload() {
  const clipboard = editorHistory.clipboard;
  if (!clipboard) return null;
  if (clipboard.type === 'segment' && Array.isArray(clipboard.clips)) return clipboard;
  if (clipboard.type === 'clip' && clipboard.clip) return clipboard;
  return { type: 'clip', clip: clipboard };
}

function renderProgramClipboard() {
  const clipboard = internalClipboardPayload();
  elements.programClipboard.hidden = !clipboard;
  if (!clipboard) return;
  if (clipboard.type === 'segment') {
    elements.programClipboardSummary.value = `${clipboard.clips.length} klipp · ${Number(clipboard.duration).toFixed(2)} s`;
  } else {
    elements.programClipboardSummary.value = `1 klipp · ${clipDuration(clipboard.clip).toFixed(2)} s`;
  }
  elements.pasteProgramClipboard.title = `Klistra in vid ${formatTime(state.playhead)}`;
}

function clearProgramClipboard() {
  editorHistory.clipboard = null;
  renderProgramClipboard();
}

function copyMarkedSegment() {
  const range = state.segmentRange;
  if (!range) return false;
  const segment = timelineModel.sliceClipsToSegment(state.clips, range.start, range.end);
  if (!segment) {
    elements.segmentCopyStatus.textContent = 'Det finns inga klipp inom segmentet.';
    return false;
  }
  editorHistory.clipboard = { type: 'segment', duration: segment.duration, clips: segment.clips };
  renderProgramClipboard();
  closeSegmentCopyTool();
  return true;
}

function renderSegmentLibrary() {
  const list = elements.segmentLibraryList;
  if (!list) return;
  elements.segmentLibraryCount.textContent = `${state.segmentLibrary.length} segment`;
  if (!state.segmentLibrary.length) {
    list.replaceChildren(Object.assign(document.createElement('div'), {
      className: 'segment-library-empty', textContent: 'Inga sparade segment ännu.'
    }));
    return;
  }
  list.replaceChildren(...state.segmentLibrary.map((segment) => {
    const item = document.createElement('div');
    item.className = 'segment-library-item';
    item.setAttribute('role', 'listitem');
    const name = document.createElement('strong');
    name.textContent = segment.name;
    name.title = segment.name;
    const meta = document.createElement('small');
    meta.textContent = `${segment.clips.length} klipp · ${Number(segment.duration).toFixed(2)} s`;
    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.textContent = 'Importera';
    importButton.title = 'Välj plats i tidslinjen för kopian';
    importButton.addEventListener('click', () => armSavedSegmentImport(segment));
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = '×';
    removeButton.setAttribute('aria-label', `Ta bort segmentet ${segment.name}`);
    removeButton.title = 'Ta bort sparat segment';
    removeButton.addEventListener('click', () => {
      state.segmentLibrary = state.segmentLibrary.filter((entry) => entry.id !== segment.id);
      renderSegmentLibrary();
      persist();
    });
    item.append(name, meta, importButton, removeButton);
    return item;
  }));
}

function saveNamedSegment() {
  const range = state.segmentRange;
  const name = String(elements.segmentName?.value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!range || !name) return false;
  const segment = timelineModel.sliceClipsToSegment(state.clips, range.start, range.end);
  if (!segment) {
    elements.segmentCopyStatus.textContent = 'Det finns inga klipp inom segmentet.';
    return false;
  }
  segment.clips.forEach((clip) => { if (clip.mediaId) state.projectMediaIds.add(clip.mediaId); });
  state.segmentLibrary = [
    ...state.segmentLibrary.filter((entry) => entry.name.toLowerCase() !== name.toLowerCase()),
    { id: crypto.randomUUID(), name, duration: segment.duration, clips: segment.clips }
  ];
  resetSegmentSelection();
  renderSegmentLibrary();
  elements.segmentCopyStatus.textContent = `Segmentet “${name}” sparades.`;
  persist();
  return true;
}

function armSavedSegmentImport(segment) {
  if (!segment?.clips?.length || !(Number(segment.duration) > 0)) return false;
  state.pendingSegmentImport = segment;
  document.body.classList.add('segment-import-armed');
  elements.segmentCopyStatus.textContent = `Klicka i tidslinjen där “${segment.name}” ska importeras.`;
  return true;
}

function importSavedSegment(segment, destination = state.playhead) {
  if (!segment?.clips?.length || !(Number(segment.duration) > 0)) return false;
  const copies = timelineModel.materializeSegmentClips(segment, destination, () => crypto.randomUUID());
  if (!copies.length) return false;
  recordHistory();
  rippleInsert(destination, segment.duration, copies);
  state.clips.push(...copies);
  rebuildTrackLayout(copies.map((clip) => clip.id));
  selectClips(copies.map((clip) => clip.id), copies[0].id);
  if (copies.some((clip) => clip.mediaId === state.transcriptionMediaId)) renderTranscription();
  setPlayhead(destination);
  persist();
  elements.segmentCopyStatus.textContent = `“${segment.name}” importerades som kopia.`;
  return true;
}

function insertClipCopy(source, start, trackIndex = null) {
  const clip = cloneValue(source);
  clip.id = crypto.randomUUID();
  delete clip.linkGroupId;
  delete clip.transitionIn;
  clip.name = `${source.name} (kopia)`;
  clip.start = Math.max(0, start);
  clip.trackIndex = Number.isInteger(trackIndex)
    ? Math.max(0, trackIndex)
    : Number.isFinite(Number(source.trackIndex)) ? Number(source.trackIndex) : 0;
  rippleInsert(clip.start, clipDuration(clip), [clip]);
  state.clips.push(clip);
  createClipElement(clip);
  if (clip.mediaId === state.transcriptionMediaId) renderTranscription();
  selectClip(clip.id);
  setPlayhead(clip.start);
  persist();
  return clip;
}

function pasteClipboard() {
  const clipboard = internalClipboardPayload();
  if (!clipboard) return false;
  if (elements.trackPlacementModal) {
    return openTrackPlacementModal({ type: 'clipboard-paste', clipboard, atTime: state.playhead });
  }
  recordHistory();
  if (clipboard.type === 'segment') {
    const copies = timelineModel.materializeSegmentClips(clipboard, state.playhead, () => crypto.randomUUID());
    if (!copies.length) return false;
    rippleInsert(state.playhead, clipboard.duration, copies);
    state.clips.push(...copies);
    const liftedIds = copies
      .slice()
      .sort((a, b) => (a.trackIndex || 0) - (b.trackIndex || 0))
      .map((clip) => clip.id);
    rebuildTrackLayout(liftedIds);
    selectClips(copies.map((clip) => clip.id), copies[0].id);
    if (copies.some((clip) => clip.mediaId === state.transcriptionMediaId)) renderTranscription();
    setPlayhead(state.playhead);
    persist();
  } else {
    insertClipCopy(clipboard.clip, state.playhead);
  }
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

  if (key === 'escape' && !elements.transitionModal.hidden) {
    event.preventDefault();
    closeTransitionPicker();
    return;
  }
  if (key === 'escape' && state.segmentSelectionActive) {
    event.preventDefault();
    closeSegmentCopyTool();
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
    else if (key === 'a') handled = selectAllClips();
    else handled = false;
    if (handled) event.preventDefault();
    return;
  }

  if (textEntry || event.altKey || modifier) return;
  const formControl = event.target instanceof Element && event.target.matches('input, select, textarea');
  if ((key === 'delete' || key === 'backspace') && state.selectedFlagId) {
    event.preventDefault();
    deleteSelectedFlag();
  } else if ((key === 'delete' || key === 'backspace') && state.selectedId) {
    event.preventDefault();
    removeSelectedClip();
  } else if (key === ' ' && !formControl) {
    event.preventDefault();
    togglePlayback();
  } else if (key === 's' && !formControl) {
    event.preventDefault();
    splitSelectedClip();
  } else if (key === 'f' && !formControl) {
    event.preventDefault();
    addFlagAtPlayhead();
  } else if ((key === '[' || key === ']') && !formControl) {
    event.preventDefault();
    jumpToFlag(key === ']' ? 1 : -1);
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
    else if (!elements.layerContextMenu.hidden) hideLayerContextMenu();
    else if (!elements.flagEditModal.hidden) closeFlagEditor();
    else if (!elements.flagPopover.hidden) closeFlagPopover();
    else if (!elements.modal.hidden) elements.modal.hidden = true;
    else selectClip(null);
  }
}

function buildExportSelection() {
  if (state.segmentSelectionActive && state.segmentRange) {
    const segment = timelineModel.sliceClipsToSegment(
      state.clips,
      state.segmentRange.start,
      state.segmentRange.end
    );
    if (!segment) return null;
    return {
      type: 'segment',
      label: 'segment',
      clips: segment.clips,
      duration: segment.duration,
      count: segment.clips.length
    };
  }
  const selected = state.clips.filter((clip) => state.selectedIds.has(clip.id));
  if (!selected.length) return null;
  const start = Math.min(...selected.map((clip) => clip.start));
  const end = Math.max(...selected.map((clip) => clip.start + clipDuration(clip)));
  const sliced = timelineModel.sliceClipsToSegment(selected, start, end);
  if (!sliced) return null;
  return {
    type: 'clips',
    label: selected.length === 1 ? 'markerat klipp' : `${selected.length} markerade klipp`,
    clips: sliced.clips,
    duration: sliced.duration,
    count: sliced.clips.length
  };
}

function updateExportSelectionButton() {
  if (!elements.exportSelection) return;
  const hasSegment = Boolean(state.segmentSelectionActive && state.segmentRange && clipsInSegmentRange().length);
  const hasClips = state.selectedIds.size > 0;
  elements.exportSelection.disabled = !hasSegment && !hasClips;
  elements.exportSelection.textContent = hasSegment ? 'Exportera segment som MP4' : 'Exportera val som MP4';
  elements.exportSelection.title = hasSegment
    ? 'Exportera allt mellan segmentets IN- och UT-punkt'
    : hasClips
      ? 'Exportera endast markerade klipp'
      : 'Markera klipp eller ange ett IN/UT-segment först';
}

function openExportModal(format, scope = 'project') {
  if (!state.clips.length) return alert('Ladda upp minst ett klipp först.');
  const normalizedFormat = ['mp4', 'mp3', 'wav'].includes(format) ? format : 'mp4';
  const formatLabel = normalizedFormat.toUpperCase();
  const selection = scope === 'selection' ? buildExportSelection() : null;
  if (scope === 'selection' && !selection) return alert('Markera minst ett klipp eller ange ett IN/UT-segment först.');
  state.pendingExportFormat = normalizedFormat;
  state.pendingExportSelection = selection;
  elements.modal.hidden = false;
  elements.exportTitle.textContent = selection
    ? `Exportera ${selection.label} · ${formatLabel}`
    : `Exportera ${formatLabel}`;
  elements.exportSetup.hidden = false;
  elements.progress.hidden = true;
  elements.progress.value = 0;
  elements.cancelExport.hidden = true;
  elements.startExport.hidden = false;
  elements.startExport.disabled = !state.outputDirectorySelection;
  elements.outputFolderPath.textContent = state.outputDirectorySelection?.path || 'Ingen mapp vald';
  elements.outputFolderPath.title = state.outputDirectorySelection?.path || '';
  const selectionSummary = selection
    ? `${selection.count} klipp · ${selection.duration.toFixed(2)} s. `
    : '';
  elements.exportMessage.textContent = selectionSummary + (state.outputDirectorySelection
    ? 'Tryck Exportera för att starta.'
    : 'Välj output-mapp och starta exporten.');
}

async function chooseOutputFolder() {
  elements.chooseOutputFolder.disabled = true;
  elements.exportMessage.textContent = 'Öppnar mappväljaren…';
  try {
    const selection = await api('/api/export/select-folder', { method: 'POST' });
    if (!selection.cancelled) {
      state.outputDirectorySelection = selection;
      elements.outputFolderPath.textContent = selection.path;
      elements.outputFolderPath.title = selection.path;
      elements.startExport.disabled = false;
      elements.exportMessage.textContent = 'Tryck Exportera för att starta.';
    } else {
      elements.exportMessage.textContent = state.outputDirectorySelection
        ? 'Mappvalet avbröts. Den tidigare mappen är kvar.'
        : 'Ingen output-mapp vald.';
    }
  } catch (error) {
    elements.exportMessage.textContent = `Kunde inte välja output-mapp: ${error.message}`;
  } finally {
    elements.chooseOutputFolder.disabled = false;
  }
}

async function exportProject(format) {
  if (!state.outputDirectorySelection) {
    elements.exportMessage.textContent = 'Välj output-mapp först.';
    return;
  }
  const normalizedFormat = ['mp4', 'mp3', 'wav'].includes(format) ? format : 'mp4';
  const formatLabel = normalizedFormat.toUpperCase();
  const selection = state.pendingExportSelection;
  elements.exportTitle.textContent = selection
    ? `Exporterar ${selection.label} · ${formatLabel}`
    : `Exporterar ${formatLabel}`;
  elements.exportSetup.hidden = true;
  elements.progress.hidden = false;
  elements.progress.value = 0;
  elements.startExport.hidden = true;
  elements.cancelExport.hidden = false;
  elements.exportMessage.textContent = 'Skickar tidslinjen till FFmpeg…';
  try {
    let exportCanvas = state.canvas;
    let exportClips = selection ? cloneValue(selection.clips) : state.clips;
    if (elements.autoFitCanvas.checked) {
      const fitted = fitProjectToContent(exportClips);
      if (fitted) {
        exportCanvas = fitted.canvas;
        exportClips = fitted.clips;
        elements.exportMessage.textContent =
          `Anpassar format till innehåll (${fitted.canvas.width}×${fitted.canvas.height})…`;
      }
    } else if (state.exportWindow) {
      const windowRect = state.exportWindow;
      const transformed = transformProjectToBounds({
        minX: windowRect.x,
        minY: windowRect.y,
        maxX: windowRect.x + windowRect.width,
        maxY: windowRect.y + windowRect.height
      }, exportClips);
      if (transformed) {
        exportCanvas = transformed.canvas;
        exportClips = transformed.clips;
        elements.exportMessage.textContent =
          `Exporterar yta ${transformed.canvas.width}×${transformed.canvas.height}…`;
      }
    }
    const job = await api('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: normalizedFormat,
        canvas: exportCanvas,
        quality: normalizedFormat === 'mp4' ? Number(elements.exportQuality.value) : null,
        hardware: normalizedFormat === 'mp4' ? 'nvidia' : 'cpu',
        upscale: normalizedFormat === 'mp4' && elements.useUpscale.checked,
        outputDirectoryToken: state.outputDirectorySelection.token,
        hiddenLayers: [...state.hiddenLayers],
        subtitles: normalizedFormat === 'mp4' ? exportSubtitleCues(exportClips) : null,
        clips: exportClips.map(({ mediaId, kind, start, trimStart, trimEnd, crop, blur, color, html, text, muted, trackIndex, transitionIn, visualScale, animIn, animOut, posX, posY, circular }) => ({
          mediaId, kind, start, trimStart, trimEnd, crop, blur, color, html, text, muted, trackIndex, transitionIn, visualScale, animIn, animOut, posX, posY, circular
        }))
      })
    });
    state.currentJobId = job.id;
    pollJob(job.id);
  } catch (error) {
    elements.exportMessage.textContent = `Exporten kunde inte starta: ${error.message}`;
    elements.exportSetup.hidden = false;
    elements.progress.hidden = true;
    elements.startExport.hidden = false;
    elements.startExport.disabled = !state.outputDirectorySelection;
    elements.cancelExport.hidden = true;
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
    const indeterminate = job.status === 'rendering' && !(job.progress > 0) &&
      ['prepare', 'html-render', 'seek-decode'].includes(job.phase);
    if (indeterminate) elements.progress.removeAttribute('value');
    else elements.progress.value = job.progress || 0;
    const eta = formatEta(job.etaSeconds);
    const phaseMessage = job.phase === 'prepare'
      ? 'Verifierar NVIDIA NVENC och förbereder exporten…'
      : job.phase === 'html-render'
        ? 'Renderar HTML-lager före GPU-exporten…'
        : job.phase === 'seek-decode' && !(job.progress > 0)
          ? 'FFmpeg söker direkt till klippens startpunkter…'
          : null;
    elements.exportMessage.textContent = job.status === 'queued'
      ? 'Väntar på FFmpeg…'
      : phaseMessage || `${job.encoder || 'FFmpeg'} · ${job.progress || 0} %${eta ? ` · ${eta}` : ''}`;
    if (job.status === 'completed') {
      elements.exportMessage.textContent = job.outputDirectory && job.outputFileName
        ? `Klar. Sparad som ${job.outputFileName}\ni ${job.outputDirectory}`
        : `Klar med ${job.encoder}.`;
      elements.cancelExport.hidden = true;
      return;
    }
    if (job.status === 'failed') {
      elements.exportMessage.textContent = `Exporten misslyckades:\n${job.error}`;
      elements.cancelExport.hidden = true;
      elements.exportSetup.hidden = false;
      elements.progress.hidden = true;
      elements.startExport.hidden = false;
      elements.startExport.disabled = !state.outputDirectorySelection;
      return;
    }
    if (job.status === 'cancelled') {
      elements.exportMessage.textContent = 'Exporten avbröts.';
      elements.cancelExport.hidden = true;
      elements.exportSetup.hidden = false;
      elements.progress.hidden = true;
      elements.startExport.hidden = false;
      elements.startExport.disabled = !state.outputDirectorySelection;
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
  if (!skipConfirmation && !askForProjectName()) return false;
  stopPlayback();
  stopTimelineAudioPlayers(true);
  state.clips.forEach((clip) => {
    document.querySelector(`.clip[data-id="${CSS.escape(clip.id)}"]`)?.remove();
  });
  state.clips = [];
  state.projectName = skipConfirmation ? '' : state.projectName;
  state.savedProjectName = state.projectName;
  state.projectNameDirty = false;
  state.projectMediaIds = new Set();
  state.segmentLibrary = [];
  state.selectedId = null;
  state.selectedIds = new Set();
  state.canvas = null;
  state.exportWindow = null;
  state.cropActive = false;
  state.cropPreview = null;
  state.transcriptionMediaId = null;
  state.transcriptionSegments = [];
  state.transcriptionEditMode = false;
  state.transcriptionWords = [];
  state.transcriptionIndex = new Map();
  state.transcriptSearchResults = [];
  state.transcriptSearchCursor = -1;
  state.selectedTranscriptionSegmentIndex = -1;
  state.selectedTranscriptionSourceClipId = null;
  state.flags = [];
  state.selectedFlagId = null;
  state.editingFlagId = null;
  state.currentJobId = null;
  state.currentTranscribeJobId = null;
  state.transcribingClipId = null;
  state.segmentSelectionActive = false;
  state.segmentDraftStart = null;
  state.segmentRange = null;
  state.segmentPointDrag = null;
  state.pendingSegmentImport = null;
  state.pendingTrackPlacement = null;
  if (elements.trackPlacementModal) elements.trackPlacementModal.hidden = true;
  renderProjectName();
  renderMediaBin();
  elements.segmentCopyPopover.hidden = true;
  clearDynamicTracks();
  elements.visualTrack.replaceChildren();
  elements.transcriptionTrack.replaceChildren();
  elements.audioTrack.replaceChildren();
  elements.transcriptSearchInput.value = '';
  updateTranscriptSearch();
  renderFlags();
  hideClipContextMenu();
  hideCropOverlay();
  elements.cropTools.hidden = true;
  clearVisualPreview();
  editorHistory.undo = [];
  editorHistory.redo = [];
  updateTimelineWidth();
  updatePreviewWindowSize();
  syncCanvasControls();
  renderSegmentSelection();
  clearPersisted();
  recordHistory();
  setPlayhead(0);
  return true;
}

function saveProject() {
  if (!ensureProjectNamed()) return;
  const data = buildProjectFile();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `videoeditor-projekt-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showSaveIndicator('Projektfil sparad');
}

const PROJECT_FILE_VERSION = 4;

function buildProjectFile() {
  return {
    version: PROJECT_FILE_VERSION,
    createdAt: new Date().toISOString(),
    ...editorSnapshot()
  };
}

function projectSnapshotFromData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.clips)) {
    throw new Error('Ogiltig projektfil');
  }
  const version = data.version == null ? 1 : Number(data.version);
  if (!Number.isInteger(version) || version < 1) throw new Error('Ogiltig projektversion');
  if (version > PROJECT_FILE_VERSION) {
    throw new Error(`Projektfilen kräver en nyare editor (version ${version})`);
  }

  const validKinds = new Set(['video', 'audio', 'image', 'text', 'blur', 'color', 'html']);
  const usedIds = new Set();
  const clips = data.clips.map((rawClip, index) => {
    if (!rawClip || typeof rawClip !== 'object' || Array.isArray(rawClip) || !validKinds.has(rawClip.kind)) {
      throw new Error(`Ogiltigt klipp på position ${index + 1}`);
    }
    const clip = cloneValue(rawClip);
    const rawId = typeof clip.id === 'string' && clip.id ? clip.id : null;
    clip.id = rawId && !usedIds.has(rawId) ? rawId : crypto.randomUUID();
    usedIds.add(clip.id);
    clip.start = Number.isFinite(Number(clip.start)) ? Math.max(0, Number(clip.start)) : 0;
    clip.trimStart = Number.isFinite(Number(clip.trimStart)) ? Math.max(0, Number(clip.trimStart)) : 0;
    clip.trimEnd = Number.isFinite(Number(clip.trimEnd))
      ? Math.max(clip.trimStart + MIN_CLIP_SECONDS, Number(clip.trimEnd))
      : clip.trimStart + 3;
    clip.mediaDuration = Number.isFinite(Number(clip.mediaDuration)) && Number(clip.mediaDuration) > 0
      ? Number(clip.mediaDuration)
      : Math.max(clip.trimEnd, 3);
    clip.trackIndex = Number.isFinite(Number(clip.trackIndex)) ? Math.max(0, Math.trunc(Number(clip.trackIndex))) : 0;
    return normalizeRestoredClip(clip);
  });

  const finiteOr = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const canvas = data.canvas && finiteOr(data.canvas.width) > 0 && finiteOr(data.canvas.height) > 0
    ? { width: finiteOr(data.canvas.width), height: finiteOr(data.canvas.height) }
    : null;
  const exportWindow = data.exportWindow && finiteOr(data.exportWindow.width) > 0 && finiteOr(data.exportWindow.height) > 0
    ? {
        x: finiteOr(data.exportWindow.x), y: finiteOr(data.exportWindow.y),
        width: finiteOr(data.exportWindow.width), height: finiteOr(data.exportWindow.height)
      }
    : null;
  const projectMediaIds = new Set(
    Array.isArray(data.projectMediaIds) ? data.projectMediaIds.filter((id) => typeof id === 'string') : []
  );
  clips.forEach((clip) => { if (clip.mediaId) projectMediaIds.add(clip.mediaId); });
  const segmentLibrary = Array.isArray(data.segmentLibrary)
    ? data.segmentLibrary
      .filter((segment) => segment && typeof segment.name === 'string' && Array.isArray(segment.clips))
      .map((segment) => ({
        id: typeof segment.id === 'string' ? segment.id : crypto.randomUUID(),
        name: segment.name.trim().slice(0, 120) || 'Namnlöst segment',
        duration: Number(segment.duration) > 0 ? Number(segment.duration) : 0,
        clips: cloneValue(segment.clips)
      }))
    : [];
  segmentLibrary.forEach((segment) => segment.clips.forEach((clip) => {
    if (clip?.mediaId) projectMediaIds.add(clip.mediaId);
  }));
  const mediaSources = Array.isArray(data.mediaSources)
    ? data.mediaSources
      .filter((media) => media && typeof media.id === 'string' && typeof media.sourcePath === 'string' && media.sourcePath)
      .map((media) => ({ id: media.id, name: String(media.name || '').slice(0, 200), sourcePath: media.sourcePath }))
    : [];
  return {
    projectName: typeof data.projectName === 'string' ? data.projectName.trim().slice(0, 120) : '',
    segmentLibrary,
    projectMediaIds: [...projectMediaIds],
    mediaSources,
    importLayer: data.importLayer === 'auto' || data.importLayer == null
      ? 'auto'
      : Math.max(0, Math.floor(Number(data.importLayer) || 0)),
    clips,
    selectedId: clips.some((clip) => clip.id === data.selectedId) ? data.selectedId : null,
    playhead: Math.max(0, finiteOr(data.playhead)),
    canvas,
    transcriptionMediaId: typeof data.transcriptionMediaId === 'string' ? data.transcriptionMediaId : null,
    transcriptionSegments: Array.isArray(data.transcriptionSegments) ? cloneValue(data.transcriptionSegments) : [],
    hiddenLayers: Array.isArray(data.hiddenLayers)
      ? data.hiddenLayers.map(Number).filter((value) => Number.isInteger(value) && value >= 0)
      : [],
    exportWindow,
    flags: Array.isArray(data.flags) ? cloneValue(data.flags) : []
  };
}

async function loadProject() {
  const file = elements.projectInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const snapshot = projectSnapshotFromData(data);
    if (!snapshot.projectName) snapshot.projectName = String(file.name || 'Importerat projekt').replace(/\.json$/i, '') || 'Importerat projekt';
    if (state.clips.length > 0 && !confirm('Öppna projekt? Nuvarande projekt ersätts.')) return;
    newProject({ skipConfirmation: true });
    restoreEditor(snapshot);
    syncExportSubtitlesPrefill();
    warmPreview();
    recordHistory();
    showSaveIndicator('Projekt importerat');
  } catch (error) {
    alert(`Kunde inte öppna projektet: ${error.message}`);
  } finally {
    elements.projectInput.value = '';
  }
}

initialize();
