import '@testing-library/jest-dom';

// Mock requestAnimationFrame
global.requestAnimationFrame = (callback: FrameRequestCallback): number => {
  return setTimeout(callback, 16) as unknown as number;
};

global.cancelAnimationFrame = (id: number): void => {
  clearTimeout(id);
};

// Mock WebGL context for canvas
const mockWebGLContext = {
  getParameter: jest.fn((param: number) => {
    // RENDERER
    if (param === 0x1f01) return 'Mock WebGL Renderer';
    // VENDOR
    if (param === 0x1f00) return 'Mock Vendor';
    // VERSION
    if (param === 0x1f02) return 'WebGL 2.0 (Mock)';
    return null;
  }),
  getExtension: jest.fn(() => null),
  createShader: jest.fn(() => ({})),
  shaderSource: jest.fn(),
  compileShader: jest.fn(),
  getShaderParameter: jest.fn(() => true),
  createProgram: jest.fn(() => ({})),
  attachShader: jest.fn(),
  linkProgram: jest.fn(),
  getProgramParameter: jest.fn(() => true),
  useProgram: jest.fn(),
  deleteShader: jest.fn(),
  deleteProgram: jest.fn(),
};

// Store original getContext
const originalGetContext = HTMLCanvasElement.prototype.getContext;

// Mock canvas getContext with proper typing - use any to avoid complex overload matching
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(HTMLCanvasElement.prototype as any).getContext = function(
  contextId: string,
  options?: unknown
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') {
    return mockWebGLContext;
  }
  return originalGetContext.call(this, contextId, options);
};
