'use strict';

function installDomStubs(window) {
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (_target, property) => property === 'measureText' ? (() => ({ width: 0 })) : (() => {}),
    set: () => true
  });
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.play = async () => {};
  window.prompt = () => 'Testprojekt';
  window.document.addEventListener('change', (event) => {
    if (event.target?.id !== 'media-input') return;
    try { window.eval('setPlayhead(projectEnd())'); } catch (_error) { /* appen har inte laddats än */ }
    let attempts = 0;
    const confirmPlacement = () => {
      const modal = window.document.querySelector('#track-placement-modal');
      const select = window.document.querySelector('#track-placement-select');
      const confirm = window.document.querySelector('#confirm-track-placement');
      if (modal && !modal.hidden && select && confirm) {
        const legacyLayer = window.document.querySelector('#import-layer')?.value;
        const requestedTrack = legacyLayer && legacyLayer !== 'auto' ? Number(legacyLayer) : 0;
        const trackValue = `track:${Number.isInteger(requestedTrack) ? requestedTrack : 0}`;
        if ([...select.options].some((option) => option.value === trackValue)) select.value = trackValue;
        confirm.click();
        return;
      }
      attempts += 1;
      if (attempts < 20) window.setTimeout(confirmPlacement, 5);
    };
    window.setTimeout(confirmPlacement, 0);
  }, true);
  if (!window.PointerEvent) {
    window.PointerEvent = class PointerEvent extends window.MouseEvent {
      constructor(type, init = {}) {
        super(type, init);
        Object.defineProperty(this, 'pointerId', { value: init.pointerId ?? 0 });
      }
    };
  }
}

module.exports = { installDomStubs };
