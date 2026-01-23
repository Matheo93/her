/**
 * Tests for Mobile Audio Optimizer Hook - Sprint 528
 *
 * Tests audio buffer configuration, quality adaptation,
 * and latency optimization for mobile devices.
 */

import { renderHook, act } from "@testing-library/react";

// Mock dependencies before importing the hook
jest.mock("../useMobileDetect", () => ({
  useMobileDetect: () => ({
    isMobile: true,
    isIOS: false,
    isAndroid: true,
    isTablet: false,
    isTouchDevice: true,
  }),
}));

jest.mock("../useNetworkStatus", () => ({
  useNetworkStatus: () => ({
    isOnline: true,
    isSlowConnection: false,
    rtt: 50,
    effectiveType: "4g",
    saveData: false,
  }),
}));

jest.mock("../useLatencyOptimizer", () => ({
  useLatencyOptimizer: () => ({
    metrics: {
      averageLatency: 50,
      samples: [],
    },
  }),
}));

jest.mock("../useDeviceCapabilities", () => ({
  useDeviceCapabilities: () => ({
    tier: "high",
    battery: {
      isLowBattery: false,
      level: 0.8,
    },
    memory: {
      isLowMemory: false,
    },
  }),
}));

import {
  useMobileAudioOptimizer,
  useMobileAudioQuality,
  useMobileAudioBufferConfig,
  useMobileAudioProcessingConfig,
  useOptimizedAudioConstraints,
} from "../useMobileAudioOptimizer";

describe("useMobileAudioOptimizer", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      expect(result.current.isMobile).toBe(true);
      expect(result.current.isOptimizing).toBe(true);
      expect(result.current.quality).toBeDefined();
    });

    it("should start with optimization enabled by default", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      expect(result.current.isOptimizing).toBe(true);
    });

    it("should accept enabled option", () => {
      const { result } = renderHook(() =>
        useMobileAudioOptimizer({ enabled: false })
      );

      expect(result.current.isOptimizing).toBe(false);
    });
  });

  describe("buffer configuration", () => {
    it("should provide buffer config", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      expect(result.current.bufferConfig).toBeDefined();
      expect(result.current.bufferConfig.playbackBufferSec).toBeGreaterThan(0);
      expect(result.current.bufferConfig.jitterBufferMs).toBeGreaterThan(0);
    });

    it("should update buffer config", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      act(() => {
        result.current.controls.setBufferConfig({
          jitterBufferMs: 100,
        });
      });

      expect(result.current.bufferConfig.jitterBufferMs).toBe(100);
    });

    it("should have valid sample rate", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      expect([8000, 16000, 22050, 44100]).toContain(
        result.current.bufferConfig.sampleRate
      );
    });

    it("should have valid bit depth", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      expect([8, 16]).toContain(result.current.bufferConfig.bitDepth);
    });

    it("should have valid channel count", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      expect([1, 2]).toContain(result.current.bufferConfig.channels);
    });
  });

  describe("processing configuration", () => {
    it("should provide processing config", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      expect(result.current.processingConfig).toBeDefined();
      expect(typeof result.current.processingConfig.enableVAD).toBe("boolean");
      expect(typeof result.current.processingConfig.enableEchoCancellation).toBe("boolean");
    });

    it("should update processing config", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      act(() => {
        result.current.controls.setProcessingConfig({
          enableNoiseSuppression: false,
        });
      });

      expect(result.current.processingConfig.enableNoiseSuppression).toBe(false);
    });

    it("should have valid FFT size", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      expect([32, 64, 128, 256, 512, 1024]).toContain(
        result.current.processingConfig.fftSize
      );
    });
  });

  describe("quality control", () => {
    it("should have a valid quality level", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      expect(["high", "medium", "low", "ultra-low"]).toContain(
        result.current.quality
      );
    });

    it("should allow forcing quality", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      act(() => {
        result.current.controls.forceQuality("low");
      });

      expect(result.current.quality).toBe("low");
    });

    it("should allow forcing ultra-low quality", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      act(() => {
        result.current.controls.forceQuality("ultra-low");
      });

      expect(result.current.quality).toBe("ultra-low");
    });

    it("should allow returning to auto quality", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      act(() => {
        result.current.controls.forceQuality("low");
      });

      act(() => {
        result.current.controls.forceQuality("auto");
      });

      // Quality should be calculated automatically
      expect(["high", "medium", "low", "ultra-low"]).toContain(
        result.current.quality
      );
    });
  });

  describe("latency metrics", () => {
    it("should provide latency metrics", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      expect(result.current.metrics).toBeDefined();
      expect(result.current.metrics.estimatedLatency).toBeGreaterThanOrEqual(0);
      expect(result.current.metrics.networkLatency).toBeGreaterThanOrEqual(0);
    });

    it("should record latency samples", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      act(() => {
        result.current.controls.recordLatency(100);
        result.current.controls.recordLatency(120);
        result.current.controls.recordLatency(80);
      });

      // Metrics should include jitter calculated from samples
      expect(result.current.metrics.jitter).toBeGreaterThanOrEqual(0);
    });

    it("should track buffer underruns", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      act(() => {
        result.current.controls.recordBufferEvent("underrun");
        result.current.controls.recordBufferEvent("underrun");
      });

      expect(result.current.metrics.bufferUnderruns).toBe(2);
    });

    it("should track buffer overflows", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      act(() => {
        result.current.controls.recordBufferEvent("overflow");
      });

      expect(result.current.metrics.bufferOverflows).toBe(1);
    });

    it("should reset metrics", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      act(() => {
        result.current.controls.recordBufferEvent("underrun");
        result.current.controls.recordBufferEvent("overflow");
        result.current.controls.recordLatency(100);
      });

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.bufferUnderruns).toBe(0);
      expect(result.current.metrics.bufferOverflows).toBe(0);
    });

    it("should have connection quality assessment", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      expect(["excellent", "good", "fair", "poor", "offline"]).toContain(
        result.current.metrics.connectionQuality
      );
    });
  });

  describe("optimization control", () => {
    it("should start optimization", () => {
      const { result } = renderHook(() =>
        useMobileAudioOptimizer({ enabled: false })
      );

      act(() => {
        result.current.controls.startOptimization();
      });

      expect(result.current.isOptimizing).toBe(true);
    });

    it("should stop optimization", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      act(() => {
        result.current.controls.stopOptimization();
      });

      expect(result.current.isOptimizing).toBe(false);
    });
  });

  describe("audio constraints", () => {
    it("should get audio constraints", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      const constraints = result.current.controls.getAudioConstraints();

      expect(constraints).toBeDefined();
      expect(typeof constraints.echoCancellation).toBe("boolean");
      expect(typeof constraints.noiseSuppression).toBe("boolean");
      expect(typeof constraints.autoGainControl).toBe("boolean");
    });

    it("should include channel count in constraints", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      const constraints = result.current.controls.getAudioConstraints();

      expect([1, 2]).toContain(constraints.channelCount);
    });
  });

  describe("derived flags", () => {
    it("should provide shouldReduceQuality flag", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      expect(typeof result.current.shouldReduceQuality).toBe("boolean");
    });

    it("should provide shouldPreBuffer flag", () => {
      const { result } = renderHook(() => useMobileAudioOptimizer());

      expect(typeof result.current.shouldPreBuffer).toBe("boolean");
    });
  });

  describe("callbacks", () => {
    it("should call onBufferIssue for underrun", () => {
      const onBufferIssue = jest.fn();
      const { result } = renderHook(() =>
        useMobileAudioOptimizer({ onBufferIssue })
      );

      act(() => {
        result.current.controls.recordBufferEvent("underrun");
      });

      expect(onBufferIssue).toHaveBeenCalledWith("underrun");
    });

    it("should call onBufferIssue for overflow", () => {
      const onBufferIssue = jest.fn();
      const { result } = renderHook(() =>
        useMobileAudioOptimizer({ onBufferIssue })
      );

      act(() => {
        result.current.controls.recordBufferEvent("overflow");
      });

      expect(onBufferIssue).toHaveBeenCalledWith("overflow");
    });
  });
});

describe("useMobileAudioQuality", () => {
  it("should return audio quality", () => {
    const { result } = renderHook(() => useMobileAudioQuality());

    expect(["high", "medium", "low", "ultra-low"]).toContain(result.current);
  });
});

describe("useMobileAudioBufferConfig", () => {
  it("should return buffer config", () => {
    const { result } = renderHook(() => useMobileAudioBufferConfig());

    expect(result.current).toBeDefined();
    expect(result.current.playbackBufferSec).toBeGreaterThan(0);
  });
});

describe("useMobileAudioProcessingConfig", () => {
  it("should return processing config", () => {
    const { result } = renderHook(() => useMobileAudioProcessingConfig());

    expect(result.current).toBeDefined();
    expect(typeof result.current.enableVAD).toBe("boolean");
  });
});

describe("useOptimizedAudioConstraints", () => {
  it("should return audio constraints", () => {
    const { result } = renderHook(() => useOptimizedAudioConstraints());

    expect(result.current).toBeDefined();
    expect(typeof result.current.echoCancellation).toBe("boolean");
  });
});
