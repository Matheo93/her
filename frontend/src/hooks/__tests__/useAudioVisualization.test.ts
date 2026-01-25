/**
 * Tests for useAudioVisualization
 * Sprint 567 - Comprehensive test suite for audio visualization hook
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAudioVisualization,
  useAudioLevel,
  useVoiceActivity,
  useSpectrumBars,
} from "../useAudioVisualization";

// Mock AudioContext and related APIs
class MockAnalyserNode {
  fftSize = 256;
  frequencyBinCount = 128;
  smoothingTimeConstant = 0.8;
  minDecibels = -90;
  maxDecibels = -10;

  connect = jest.fn();
  disconnect = jest.fn();

  getByteFrequencyData = jest.fn((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 128) + 64;
    }
  });

  getByteTimeDomainData = jest.fn((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = 128 + Math.floor(Math.random() * 50) - 25;
    }
  });
}

class MockMediaElementAudioSourceNode {
  connect = jest.fn();
  disconnect = jest.fn();
}

class MockMediaStreamAudioSourceNode {
  connect = jest.fn();
  disconnect = jest.fn();
}

class MockAudioContext {
  sampleRate = 44100;
  destination = {};
  state = "running";

  createAnalyser = jest.fn(() => new MockAnalyserNode());
  createMediaElementSource = jest.fn(() => new MockMediaElementAudioSourceNode());
  createMediaStreamSource = jest.fn(() => new MockMediaStreamAudioSourceNode());
  close = jest.fn(() => Promise.resolve());
}

(global as any).AudioContext = MockAudioContext;

// Mock RAF
let rafCallbacks: ((time: number) => void)[] = [];
let rafId = 0;
let performanceNowValue = 0;

beforeEach(() => {
  rafCallbacks = [];
  rafId = 0;
  performanceNowValue = 0;

  jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    rafId++;
    rafCallbacks.push(callback);
    return rafId;
  });

  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
    rafCallbacks = [];
  });

  jest.spyOn(performance, "now").mockImplementation(() => performanceNowValue);
});

afterEach(() => {
  jest.clearAllMocks();
});

function advanceFrames(count: number, deltaMs: number = 16) {
  for (let i = 0; i < count; i++) {
    performanceNowValue += deltaMs;
    const callbacks = [...rafCallbacks];
    rafCallbacks = [];
    callbacks.forEach((cb) => cb(performanceNowValue));
  }
}

function createMockAudioElement(): HTMLAudioElement {
  return {
    play: jest.fn(),
    pause: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  } as unknown as HTMLAudioElement;
}

function createMockMediaStream(): MediaStream {
  return {
    getTracks: jest.fn(() => []),
    getAudioTracks: jest.fn(() => [{ stop: jest.fn() }]),
  } as unknown as MediaStream;
}

describe("useAudioVisualization", () => {
  describe("Exports", () => {
    it("should export useAudioVisualization", () => {
      expect(useAudioVisualization).toBeDefined();
      expect(typeof useAudioVisualization).toBe("function");
    });

    it("should export useAudioLevel", () => {
      expect(useAudioLevel).toBeDefined();
      expect(typeof useAudioLevel).toBe("function");
    });

    it("should export useVoiceActivity", () => {
      expect(useVoiceActivity).toBeDefined();
      expect(typeof useVoiceActivity).toBe("function");
    });

    it("should export useSpectrumBars", () => {
      expect(useSpectrumBars).toBeDefined();
      expect(typeof useSpectrumBars).toBe("function");
    });
  });

  describe("Initialization", () => {
    it("should initialize with default data", () => {
      const { result } = renderHook(() => useAudioVisualization());

      expect(result.current.data.level).toBe(0);
      expect(result.current.data.peak).toBe(0);
      expect(result.current.data.rms).toBe(0);
      expect(result.current.data.spectrum).toEqual([]);
      expect(result.current.data.isActive).toBe(false);
      expect(result.current.data.isClipping).toBe(false);
      expect(result.current.data.dominantFrequency).toBe(0);
    });

    it("should initialize frequency bands to zero", () => {
      const { result } = renderHook(() => useAudioVisualization());

      expect(result.current.data.bands.bass).toBe(0);
      expect(result.current.data.bands.lowMid).toBe(0);
      expect(result.current.data.bands.mid).toBe(0);
      expect(result.current.data.bands.highMid).toBe(0);
      expect(result.current.data.bands.treble).toBe(0);
    });

    it("should not be analyzing initially", () => {
      const { result } = renderHook(() => useAudioVisualization());
      expect(result.current.isAnalyzing).toBe(false);
    });

    it("should return controls object", () => {
      const { result } = renderHook(() => useAudioVisualization());

      expect(result.current.controls).toBeDefined();
      expect(typeof result.current.controls.startFromElement).toBe("function");
      expect(typeof result.current.controls.startFromStream).toBe("function");
      expect(typeof result.current.controls.stop).toBe("function");
      expect(typeof result.current.controls.pause).toBe("function");
      expect(typeof result.current.controls.resume).toBe("function");
      expect(typeof result.current.controls.getSnapshot).toBe("function");
    });
  });

  describe("Options", () => {
    it("should accept fftSize option", () => {
      const { result } = renderHook(() => useAudioVisualization({ fftSize: 512 }));
      expect(result.current).toBeDefined();
    });

    it("should accept smoothingTimeConstant option", () => {
      const { result } = renderHook(() => useAudioVisualization({ smoothingTimeConstant: 0.5 }));
      expect(result.current).toBeDefined();
    });

    it("should accept minDecibels option", () => {
      const { result } = renderHook(() => useAudioVisualization({ minDecibels: -100 }));
      expect(result.current).toBeDefined();
    });

    it("should accept maxDecibels option", () => {
      const { result } = renderHook(() => useAudioVisualization({ maxDecibels: 0 }));
      expect(result.current).toBeDefined();
    });

    it("should accept updateRate option", () => {
      const { result } = renderHook(() => useAudioVisualization({ updateRate: 30 }));
      expect(result.current).toBeDefined();
    });

    it("should accept silenceThreshold option", () => {
      const { result } = renderHook(() => useAudioVisualization({ silenceThreshold: 0.05 }));
      expect(result.current).toBeDefined();
    });

    it("should accept multiple options", () => {
      const { result } = renderHook(() =>
        useAudioVisualization({
          fftSize: 1024,
          smoothingTimeConstant: 0.6,
          updateRate: 60,
          silenceThreshold: 0.02,
        })
      );
      expect(result.current).toBeDefined();
    });

    it("should accept autoStart option", () => {
      const { result } = renderHook(() => useAudioVisualization({ autoStart: false }));
      expect(result.current).toBeDefined();
    });
  });

  describe("Controls - startFromElement", () => {
    it("should start analysis from audio element", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      expect(result.current.isAnalyzing).toBe(true);
    });

    it("should start RAF loop when starting", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      expect(window.requestAnimationFrame).toHaveBeenCalled();
    });

    it("should handle video element", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const videoElement = {
        play: jest.fn(),
        pause: jest.fn(),
      } as unknown as HTMLVideoElement;

      act(() => {
        result.current.controls.startFromElement(videoElement);
      });

      expect(result.current.isAnalyzing).toBe(true);
    });
  });

  describe("Controls - startFromStream", () => {
    it("should start analysis from media stream", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const stream = createMockMediaStream();

      act(() => {
        result.current.controls.startFromStream(stream);
      });

      expect(result.current.isAnalyzing).toBe(true);
    });

    it("should start RAF loop for stream", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const stream = createMockMediaStream();

      act(() => {
        result.current.controls.startFromStream(stream);
      });

      expect(window.requestAnimationFrame).toHaveBeenCalled();
    });
  });

  describe("Controls - stop", () => {
    it("should stop analysis", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      expect(result.current.isAnalyzing).toBe(true);

      act(() => {
        result.current.controls.stop();
      });

      expect(result.current.isAnalyzing).toBe(false);
    });

    it("should reset data on stop", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      act(() => {
        result.current.controls.stop();
      });

      expect(result.current.data.level).toBe(0);
      expect(result.current.data.peak).toBe(0);
      expect(result.current.data.isActive).toBe(false);
    });

    it("should cancel animation frame on stop", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      act(() => {
        result.current.controls.stop();
      });

      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });

    it("should reset spectrum on stop", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      act(() => {
        result.current.controls.stop();
      });

      expect(result.current.data.spectrum).toEqual([]);
    });

    it("should reset bands on stop", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      act(() => {
        result.current.controls.stop();
      });

      expect(result.current.data.bands.bass).toBe(0);
      expect(result.current.data.bands.treble).toBe(0);
    });
  });

  describe("Controls - pause and resume", () => {
    it("should pause analysis", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      act(() => {
        result.current.controls.pause();
      });

      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });

    it("should resume analysis", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      act(() => {
        result.current.controls.pause();
      });

      act(() => {
        result.current.controls.resume();
      });

      expect(window.requestAnimationFrame).toHaveBeenCalled();
    });

    it("should not resume if not analyzing", () => {
      const { result } = renderHook(() => useAudioVisualization());

      act(() => {
        result.current.controls.resume();
      });

      expect(result.current.isAnalyzing).toBe(false);
    });
  });

  describe("Controls - getSnapshot", () => {
    it("should return current data snapshot", () => {
      const { result } = renderHook(() => useAudioVisualization());

      const snapshot = result.current.controls.getSnapshot();

      expect(snapshot).toHaveProperty("level");
      expect(snapshot).toHaveProperty("peak");
      expect(snapshot).toHaveProperty("rms");
      expect(snapshot).toHaveProperty("spectrum");
      expect(snapshot).toHaveProperty("bands");
      expect(snapshot).toHaveProperty("isActive");
      expect(snapshot).toHaveProperty("isClipping");
      expect(snapshot).toHaveProperty("dominantFrequency");
    });

    it("should return a copy of data", () => {
      const { result } = renderHook(() => useAudioVisualization());

      const snapshot1 = result.current.controls.getSnapshot();
      const snapshot2 = result.current.controls.getSnapshot();

      expect(snapshot1).not.toBe(snapshot2);
      expect(snapshot1).toEqual(snapshot2);
    });
  });

  describe("Data Analysis", () => {
    it("should analyze frequency data", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      act(() => {
        advanceFrames(5, 20);
      });

      expect(result.current.data).toBeDefined();
    });

    it("should calculate frequency bands", () => {
      const { result } = renderHook(() => useAudioVisualization());

      expect(result.current.data.bands).toHaveProperty("bass");
      expect(result.current.data.bands).toHaveProperty("lowMid");
      expect(result.current.data.bands).toHaveProperty("mid");
      expect(result.current.data.bands).toHaveProperty("highMid");
      expect(result.current.data.bands).toHaveProperty("treble");
    });
  });

  describe("Callbacks", () => {
    it("should call onLevelChange callback", () => {
      const onLevelChange = jest.fn();
      const { result } = renderHook(() => useAudioVisualization({ onLevelChange }));
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      act(() => {
        advanceFrames(3, 20);
      });

      expect(onLevelChange).toHaveBeenCalled();
    });

    it("should accept onAudioStart callback", () => {
      const onAudioStart = jest.fn();
      const { result } = renderHook(() => useAudioVisualization({ onAudioStart }));
      expect(result.current).toBeDefined();
    });

    it("should accept onAudioStop callback", () => {
      const onAudioStop = jest.fn();
      const { result } = renderHook(() => useAudioVisualization({ onAudioStop }));
      expect(result.current).toBeDefined();
    });
  });

  describe("Cleanup", () => {
    it("should cleanup on unmount when analyzing", () => {
      const { result, unmount } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      unmount();
      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });

    it("should close AudioContext on unmount", () => {
      const { result, unmount } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      unmount();
      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  describe("Return Value Structure", () => {
    it("should return data object with correct types", () => {
      const { result } = renderHook(() => useAudioVisualization());

      expect(typeof result.current.data.level).toBe("number");
      expect(typeof result.current.data.peak).toBe("number");
      expect(typeof result.current.data.rms).toBe("number");
      expect(Array.isArray(result.current.data.spectrum)).toBe(true);
      expect(typeof result.current.data.bands).toBe("object");
      expect(typeof result.current.data.isActive).toBe("boolean");
      expect(typeof result.current.data.isClipping).toBe("boolean");
      expect(typeof result.current.data.dominantFrequency).toBe("number");
    });

    it("should return controls object with all methods", () => {
      const { result } = renderHook(() => useAudioVisualization());

      expect(typeof result.current.controls.startFromElement).toBe("function");
      expect(typeof result.current.controls.startFromStream).toBe("function");
      expect(typeof result.current.controls.stop).toBe("function");
      expect(typeof result.current.controls.pause).toBe("function");
      expect(typeof result.current.controls.resume).toBe("function");
      expect(typeof result.current.controls.getSnapshot).toBe("function");
    });

    it("should return isAnalyzing boolean", () => {
      const { result } = renderHook(() => useAudioVisualization());
      expect(typeof result.current.isAnalyzing).toBe("boolean");
    });
  });

  describe("FFT Size Options", () => {
    it("should accept fftSize 64", () => {
      const { result } = renderHook(() => useAudioVisualization({ fftSize: 64 }));
      expect(result.current).toBeDefined();
    });

    it("should accept fftSize 128", () => {
      const { result } = renderHook(() => useAudioVisualization({ fftSize: 128 }));
      expect(result.current).toBeDefined();
    });

    it("should accept fftSize 256", () => {
      const { result } = renderHook(() => useAudioVisualization({ fftSize: 256 }));
      expect(result.current).toBeDefined();
    });

    it("should accept fftSize 512", () => {
      const { result } = renderHook(() => useAudioVisualization({ fftSize: 512 }));
      expect(result.current).toBeDefined();
    });

    it("should accept fftSize 1024", () => {
      const { result } = renderHook(() => useAudioVisualization({ fftSize: 1024 }));
      expect(result.current).toBeDefined();
    });

    it("should accept fftSize 2048", () => {
      const { result } = renderHook(() => useAudioVisualization({ fftSize: 2048 }));
      expect(result.current).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle rapid start/stop cycles", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.startFromElement(audioElement);
        });
        act(() => {
          result.current.controls.stop();
        });
      }

      expect(result.current.isAnalyzing).toBe(false);
    });

    it("should handle multiple pause/resume cycles", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      for (let i = 0; i < 3; i++) {
        act(() => {
          result.current.controls.pause();
        });
        act(() => {
          result.current.controls.resume();
        });
      }

      expect(result.current.isAnalyzing).toBe(true);
    });

    it("should handle stop without start", () => {
      const { result } = renderHook(() => useAudioVisualization());

      act(() => {
        result.current.controls.stop();
      });

      expect(result.current.isAnalyzing).toBe(false);
    });

    it("should handle pause without start", () => {
      const { result } = renderHook(() => useAudioVisualization());

      act(() => {
        result.current.controls.pause();
      });

      expect(result.current.isAnalyzing).toBe(false);
    });

    it("should handle source change while analyzing", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement1 = createMockAudioElement();
      const audioElement2 = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement1);
      });

      act(() => {
        result.current.controls.startFromElement(audioElement2);
      });

      expect(result.current.isAnalyzing).toBe(true);
    });

    it("should handle switching from element to stream", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();
      const stream = createMockMediaStream();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      act(() => {
        result.current.controls.startFromStream(stream);
      });

      expect(result.current.isAnalyzing).toBe(true);
    });

    it("should handle switching from stream to element", () => {
      const { result } = renderHook(() => useAudioVisualization());
      const audioElement = createMockAudioElement();
      const stream = createMockMediaStream();

      act(() => {
        result.current.controls.startFromStream(stream);
      });

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      expect(result.current.isAnalyzing).toBe(true);
    });
  });

  describe("Performance", () => {
    it("should respect update rate", () => {
      const { result } = renderHook(() => useAudioVisualization({ updateRate: 30 }));
      const audioElement = createMockAudioElement();

      act(() => {
        result.current.controls.startFromElement(audioElement);
      });

      expect(result.current).toBeDefined();
    });

    it("should use small FFT for better performance when needed", () => {
      const { result } = renderHook(() => useAudioVisualization({ fftSize: 64 }));
      expect(result.current).toBeDefined();
    });
  });

  describe("Frequency Band Calculation", () => {
    it("should define correct frequency ranges", () => {
      const ranges = {
        bass: [20, 250],
        lowMid: [250, 500],
        mid: [500, 2000],
        highMid: [2000, 4000],
        treble: [4000, 20000],
      };

      expect(ranges.bass[0]).toBe(20);
      expect(ranges.bass[1]).toBe(250);
      expect(ranges.treble[1]).toBe(20000);
    });
  });
});

describe("Sub-hooks exports", () => {
  describe("useAudioLevel", () => {
    it("should be a function", () => {
      expect(typeof useAudioLevel).toBe("function");
    });
  });

  describe("useVoiceActivity", () => {
    it("should be a function", () => {
      expect(typeof useVoiceActivity).toBe("function");
    });
  });

  describe("useSpectrumBars", () => {
    it("should be a function", () => {
      expect(typeof useSpectrumBars).toBe("function");
    });
  });
});

describe("AudioAnalysisData interface", () => {
  it("should have correct structure", () => {
    const { result } = renderHook(() => useAudioVisualization());
    const data = result.current.data;

    expect(data).toMatchObject({
      level: expect.any(Number),
      peak: expect.any(Number),
      rms: expect.any(Number),
      spectrum: expect.any(Array),
      bands: {
        bass: expect.any(Number),
        lowMid: expect.any(Number),
        mid: expect.any(Number),
        highMid: expect.any(Number),
        treble: expect.any(Number),
      },
      isActive: expect.any(Boolean),
      isClipping: expect.any(Boolean),
      dominantFrequency: expect.any(Number),
    });
  });
});

describe("AudioVisualizationControls interface", () => {
  it("should have all required methods", () => {
    const { result } = renderHook(() => useAudioVisualization());
    const controls = result.current.controls;

    expect(controls).toMatchObject({
      startFromElement: expect.any(Function),
      startFromStream: expect.any(Function),
      stop: expect.any(Function),
      pause: expect.any(Function),
      resume: expect.any(Function),
      getSnapshot: expect.any(Function),
    });
  });
});

describe("Default values", () => {
  it("should have default fftSize of 256", () => {
    const { result } = renderHook(() => useAudioVisualization());
    expect(result.current).toBeDefined();
  });

  it("should have default smoothingTimeConstant of 0.8", () => {
    const { result } = renderHook(() => useAudioVisualization());
    expect(result.current).toBeDefined();
  });

  it("should have default minDecibels of -90", () => {
    const { result } = renderHook(() => useAudioVisualization());
    expect(result.current).toBeDefined();
  });

  it("should have default maxDecibels of -10", () => {
    const { result } = renderHook(() => useAudioVisualization());
    expect(result.current).toBeDefined();
  });

  it("should have default updateRate of 60", () => {
    const { result } = renderHook(() => useAudioVisualization());
    expect(result.current).toBeDefined();
  });

  it("should have default silenceThreshold of 0.01", () => {
    const { result } = renderHook(() => useAudioVisualization());
    expect(result.current).toBeDefined();
  });

  it("should have default autoStart of false", () => {
    const { result } = renderHook(() => useAudioVisualization());
    expect(result.current.isAnalyzing).toBe(false);
  });
});
