import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Polyfill Image and Canvas for jsdom in unit tests
if (typeof window !== 'undefined') {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-image-url');
  window.URL.revokeObjectURL = vi.fn();

  class MockImage {
    constructor() {
      this._src = '';
      this.naturalWidth = 800;
      this.naturalHeight = 600;
      this.width = 800;
      this.height = 600;
    }
    set src(value) {
      this._src = value;
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 0);
    }
    get src() {
      return this._src;
    }
  }
  window.Image = MockImage;

  HTMLCanvasElement.prototype.getContext = () => ({
    fillRect: () => {},
    clearRect: () => {},
    getImageData: (x, y, w, h) => ({ data: new Array(w * h * 4) }),
    putImageData: () => {},
    createImageData: () => [],
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    fillText: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    stroke: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    arc: () => {},
    fill: () => {},
    measureText: () => ({ width: 50 }),
    transform: () => {},
    rect: () => {},
    clip: () => {},
  });

  HTMLCanvasElement.prototype.toBlob = function (callback, type = 'image/jpeg') {
    const mockBlob = new Blob(['mock-binary-image'], { type });
    setTimeout(() => callback(mockBlob), 0);
  };
}
