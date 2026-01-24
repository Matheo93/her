import '@testing-library/jest-dom';

// Mock AudioContext for Web Audio API tests
class MockAudioContext {
  state: AudioContextState = "running";
  currentTime = 0;
  sampleRate = 44100;
  destination = {};

  createGain() {
    return {
      gain: { value: 0, linearRampToValueAtTime: jest.fn() },
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
  }

  createOscillator() {
    return {
      type: "sine",
      frequency: { value: 0, linearRampToValueAtTime: jest.fn() },
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    };
  }

  createBiquadFilter() {
    return {
      type: "lowpass",
      frequency: { value: 0, linearRampToValueAtTime: jest.fn() },
      Q: { value: 0 },
      connect: jest.fn(),
    };
  }

  createBufferSource() {
    return {
      buffer: null,
      loop: false,
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    };
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: jest.fn(() => new Float32Array(length)),
    };
  }

  resume = jest.fn(() => Promise.resolve());
  close = jest.fn(() => Promise.resolve());
}

// Add AudioContext to global and window
(global as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
if (typeof window !== 'undefined') {
  (window as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;
}

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
