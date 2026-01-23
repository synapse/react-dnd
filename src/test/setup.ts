import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock getBoundingClientRect for elements
const mockRect = (overrides: Partial<DOMRect> = {}): DOMRect => ({
  top: 0,
  left: 0,
  bottom: 100,
  right: 100,
  width: 100,
  height: 100,
  x: 0,
  y: 0,
  toJSON: () => ({}),
  ...overrides,
});

// Store original getBoundingClientRect
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

// Helper to set up mock rects for elements
export const setupMockRects = (rectMap: Map<Element, Partial<DOMRect>>) => {
  Element.prototype.getBoundingClientRect = function() {
    const override = rectMap.get(this);
    if (override) {
      return mockRect(override);
    }
    return originalGetBoundingClientRect.call(this);
  };
};

// Reset mock
export const resetMockRects = () => {
  Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
};

// Mock createPortal to render children in place for testing
vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (children: React.ReactNode) => children,
  };
});

// Mock offsetHeight for reflow
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get: function() {
    return this._offsetHeight || 0;
  },
  set: function(val) {
    this._offsetHeight = val;
  },
});

// Mock scroll properties
Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
  configurable: true,
  get: function() {
    return this._scrollHeight || this.clientHeight || 0;
  },
});

Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
  configurable: true,
  get: function() {
    return this._scrollWidth || this.clientWidth || 0;
  },
});

Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get: function() {
    return this._clientHeight || 100;
  },
});

Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get: function() {
    return this._clientWidth || 100;
  },
});
