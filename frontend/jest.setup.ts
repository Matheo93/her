import '@testing-library/jest-dom';

// Mock WebGL2RenderingContext class for tests
class MockWebGL2RenderingContext {
  TEXTURE_2D = 0x0DE1;
  MAX_TEXTURE_SIZE = 0x0D33;
  MAX_VERTEX_ATTRIBS = 0x8869;
  RENDERER = 0x1F01;
  VENDOR = 0x1F00;
  VERSION = 0x1F02;

  getParameter(param: number): string | number | null {
    if (param === 0x1f01) return 'Mock WebGL Renderer';
    if (param === 0x1f00) return 'Mock Vendor';
    if (param === 0x1f02) return 'WebGL 2.0 (Mock)';
    if (param === 0x0D33) return 8192; // MAX_TEXTURE_SIZE
    if (param === 0x8869) return 16; // MAX_VERTEX_ATTRIBS
    return null;
  }
  getExtension(): null { return null; }
  createShader(): object { return {}; }
  shaderSource(): void {}
  compileShader(): void {}
  getShaderParameter(): boolean { return true; }
  createProgram(): object { return {}; }
  attachShader(): void {}
  linkProgram(): void {}
  getProgramParameter(): boolean { return true; }
  useProgram(): void {}
  deleteShader(): void {}
  deleteProgram(): void {}
}

// Add to global
(global as unknown as { WebGL2RenderingContext: typeof MockWebGL2RenderingContext }).WebGL2RenderingContext = MockWebGL2RenderingContext;

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

// Store original getContext - use any to handle overloaded signatures
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originalGetContext = HTMLCanvasElement.prototype.getContext as any;

// Mock canvas getContext with proper typing
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
