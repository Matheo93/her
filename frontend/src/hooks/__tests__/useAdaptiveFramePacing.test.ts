/**
 * Tests for Adaptive Frame Pacing Hook - Sprint 228
 *
 * Tests dynamic frame rate targeting, judder detection, and battery-aware adaptation
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAdaptiveFramePacing,
  useFrameRate,
  useJudderDetection,
} from "../useAdaptiveFramePacing";

// Mock performance.now for consistent timing
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);

  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    return setTimeout(() => cb(mockTime), 0) as unknown as number;
  });

  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    clearTimeout(id);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useAdaptiveFramePacing", () => {
  describe("initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      expect(result.current.state.isRunning).toBe(false);
      expect(result.current.state.currentMode).toBe("adaptive");
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useAdaptiveFramePacing({
          initialTargetFps: 30,
          mode: "powersave",
        })
      );

      expect(result.current.state.currentMode).toBe("powersave");
    });

    it("should initialize metrics", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      expect(result.current.state.metrics).toBeDefined();
      expect(result.current.state.metrics.targetFps).toBe(60);
    });
  });

  describe("frame rate targeting", () => {
    it("should initialize with 60fps target by default", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      expect(result.current.state.metrics.targetFps).toBe(60);
    });

    it("should initialize with custom target fps", () => {
      const { result } = renderHook(() =>
        useAdaptiveFramePacing({ initialTargetFps: 30 })
      );

      expect(result.current.state.metrics.targetFps).toBe(30);
    });

    it("should provide setTargetFps control", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      expect(typeof result.current.controls.setTargetFps).toBe("function");
    });
  });

  describe("pacing modes", () => {
    it("should set performance mode", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      act(() => {
        result.current.controls.setMode("performance");
      });

      expect(result.current.state.currentMode).toBe("performance");
    });

    it("should set balanced mode", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      act(() => {
        result.current.controls.setMode("balanced");
      });

      expect(result.current.state.currentMode).toBe("balanced");
    });

    it("should set powersave mode", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      act(() => {
        result.current.controls.setMode("powersave");
      });

      expect(result.current.state.currentMode).toBe("powersave");
    });

    it("should set adaptive mode", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      act(() => {
        result.current.controls.setMode("adaptive");
      });

      expect(result.current.state.currentMode).toBe("adaptive");
    });
  });

  describe("frame loop controls", () => {
    it("should start frame loop", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      act(() => {
        result.current.controls.start(() => {});
      });

      expect(result.current.state.isRunning).toBe(true);
    });

    it("should stop frame loop", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      act(() => {
        result.current.controls.start(() => {});
        result.current.controls.stop();
      });

      expect(result.current.state.isRunning).toBe(false);
    });
  });

  describe("input signaling", () => {
    it("should provide signalInput function", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      expect(typeof result.current.controls.signalInput).toBe("function");

      act(() => {
        result.current.controls.signalInput();
      });

      // No error means success
    });

    it("should provide requestFrame function", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      expect(typeof result.current.controls.requestFrame).toBe("function");
    });
  });

  describe("metrics", () => {
    it("should reset metrics", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.state.metrics.totalFrames).toBe(0);
      expect(result.current.state.metrics.rateChanges).toBe(0);
    });

    it("should track target fps in metrics", () => {
      const { result } = renderHook(() =>
        useAdaptiveFramePacing({ initialTargetFps: 30 })
      );

      expect(result.current.state.metrics.targetFps).toBe(30);
    });
  });

  describe("battery and thermal", () => {
    it("should track battery level", () => {
      const { result } = renderHook(() =>
        useAdaptiveFramePacing({ batteryAwarePacing: true })
      );

      // Battery level is null if API not available
      expect(result.current.state.batteryLevel).toBeNull();
    });

    it("should track thermal throttling state", () => {
      const { result } = renderHook(() => useAdaptiveFramePacing());

      expect(result.current.state.isThermalThrottled).toBe(false);
    });
  });
});

describe("useFrameRate", () => {
  it("should provide fps info", () => {
    const { result } = renderHook(() => useFrameRate());

    expect(result.current).toHaveProperty("fps");
    expect(result.current).toHaveProperty("isSmooth");
    expect(result.current).toHaveProperty("targetFps");
  });

  it("should default to 60 fps target", () => {
    const { result } = renderHook(() => useFrameRate());

    expect(result.current.targetFps).toBe(60);
  });
});

describe("useJudderDetection", () => {
  it("should provide judder detection info", () => {
    const { result } = renderHook(() => useJudderDetection());

    expect(result.current).toHaveProperty("isJuddery");
    expect(result.current).toHaveProperty("score");
    expect(result.current).toHaveProperty("variance");
  });

  it("should not be juddery initially", () => {
    const { result } = renderHook(() => useJudderDetection());

    expect(result.current.isJuddery).toBe(false);
  });

  it("should have zero score initially", () => {
    const { result } = renderHook(() => useJudderDetection());

    expect(result.current.score).toBe(0);
  });
});
