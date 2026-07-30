'use strict';

function installDomStubs(window) {
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (_target, property) => property === 'measureText' ? (() => ({ width: 0 })) : (() => {}),
    set: () => true
  });
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.play = async () => {};
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
