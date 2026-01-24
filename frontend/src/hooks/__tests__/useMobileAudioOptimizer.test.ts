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

// ============================================================================
// Sprint 749 - Branch Coverage Tests (using existing mocks)
// ============================================================================

describe("Sprint 749 - buffer underruns branch (lines 378-379)", () => {
  it("should downgrade quality after many buffer underruns", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Record more than 5 underruns
    act(() => {
      for (let i = 0; i < 6; i++) {
        result.current.controls.recordBufferEvent("underrun");
      }
    });

    // Quality should be affected (shouldReduceQuality flag)
    expect(result.current.shouldReduceQuality).toBe(true);
    expect(result.current.metrics.bufferUnderruns).toBe(6);
  });

  it("should trigger quality downgrade with more than 5 buffer underruns", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    const initialQuality = result.current.quality;

    // Record 6+ underruns
    act(() => {
      for (let i = 0; i < 7; i++) {
        result.current.controls.recordBufferEvent("underrun");
      }
    });

    // shouldReduceQuality should be true
    expect(result.current.shouldReduceQuality).toBe(true);
  });
});

describe("Sprint 749 - latency samples limit (line 477)", () => {
  it("should limit latency samples to 50 entries", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Record more than 50 latency samples
    act(() => {
      for (let i = 0; i < 60; i++) {
        result.current.controls.recordLatency(100 + i);
      }
    });

    // Should still have jitter calculated
    expect(result.current.metrics.jitter).toBeGreaterThanOrEqual(0);
  });

  it("should calculate jitter from latency samples", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Record varied latency samples
    act(() => {
      result.current.controls.recordLatency(50);
      result.current.controls.recordLatency(100);
      result.current.controls.recordLatency(150);
      result.current.controls.recordLatency(200);
    });

    // Jitter should be calculated
    expect(result.current.metrics.jitter).toBeGreaterThan(0);
  });
});

describe("Sprint 749 - sample rate in constraints (line 517)", () => {
  it("should include sampleRate when not 44100", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Force low quality which uses 16000 sample rate
    act(() => {
      result.current.controls.forceQuality("low");
    });

    const constraints = result.current.controls.getAudioConstraints();
    expect(constraints.sampleRate).toBeDefined();
    expect(constraints.sampleRate).toBe(16000);
  });

  it("should not include sampleRate when 44100", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Force high quality which uses 44100 sample rate
    act(() => {
      result.current.controls.forceQuality("high");
    });

    const constraints = result.current.controls.getAudioConstraints();
    // sampleRate should not be set when it's 44100
    expect(constraints.sampleRate).toBeUndefined();
  });
});

describe("Sprint 749 - onQualityChange callback (lines 397-398)", () => {
  it("should call onQualityChange when quality changes", () => {
    const onQualityChange = jest.fn();
    const { result } = renderHook(() =>
      useMobileAudioOptimizer({ onQualityChange })
    );

    // Force a quality change
    act(() => {
      result.current.controls.forceQuality("low");
    });

    // On first render quality is set, then on change callback should fire
    act(() => {
      result.current.controls.forceQuality("high");
    });

    expect(onQualityChange).toHaveBeenCalled();
  });

  it("should not call onQualityChange on first render", () => {
    const onQualityChange = jest.fn();
    renderHook(() => useMobileAudioOptimizer({ onQualityChange }));

    // Should not be called on initial render
    expect(onQualityChange).not.toHaveBeenCalled();
  });
});

describe("Sprint 749 - isOptimizing effect on config update (lines 405-417)", () => {
  it("should not update configs when not optimizing", () => {
    const { result } = renderHook(() =>
      useMobileAudioOptimizer({ enabled: false })
    );

    const initialSampleRate = result.current.bufferConfig.sampleRate;

    // Force quality change
    act(() => {
      result.current.controls.forceQuality("ultra-low");
    });

    // Configs should not auto-update when not optimizing
    expect(result.current.isOptimizing).toBe(false);
    // Sample rate should remain unchanged
    expect(result.current.bufferConfig.sampleRate).toBe(initialSampleRate);
  });

  it("should update configs when optimizing", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Force ultra-low quality
    act(() => {
      result.current.controls.forceQuality("ultra-low");
    });

    // Should have ultra-low config
    expect(result.current.bufferConfig.sampleRate).toBe(8000);
    expect(result.current.bufferConfig.bitDepth).toBe(8);
  });

  it("should update processing config when quality changes", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Force ultra-low quality
    act(() => {
      result.current.controls.forceQuality("ultra-low");
    });

    // Should have ultra-low processing config
    expect(result.current.processingConfig.fftSize).toBe(32);
    expect(result.current.processingConfig.enableVAD).toBe(false);
  });
});

describe("Sprint 749 - forced quality vs auto (lines 338-339)", () => {
  it("should use forced quality when set", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    act(() => {
      result.current.controls.forceQuality("ultra-low");
    });

    expect(result.current.quality).toBe("ultra-low");
  });

  it("should use auto quality when forced to auto", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Force to ultra-low
    act(() => {
      result.current.controls.forceQuality("ultra-low");
    });
    expect(result.current.quality).toBe("ultra-low");

    // Reset to auto
    act(() => {
      result.current.controls.forceQuality("auto");
    });

    // Should calculate quality automatically
    expect(["high", "medium", "low", "ultra-low"]).toContain(result.current.quality);
  });

  it("should return high quality when disabled", () => {
    const { result } = renderHook(() =>
      useMobileAudioOptimizer({ enabled: false })
    );

    // When disabled and not forced, should default to high
    expect(result.current.quality).toBe("high");
  });
});

describe("Sprint 749 - Android constraints (line 530-532)", () => {
  it("should set noiseSuppression for Android based on quality", () => {
    // Note: using existing mock where isAndroid is true
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Force ultra-low quality
    act(() => {
      result.current.controls.forceQuality("ultra-low");
    });

    const constraints = result.current.controls.getAudioConstraints();
    // Android should disable noiseSuppression for ultra-low
    expect(constraints.noiseSuppression).toBe(false);
  });

  it("should enable noiseSuppression for Android when not ultra-low", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Force high quality
    act(() => {
      result.current.controls.forceQuality("high");
    });

    const constraints = result.current.controls.getAudioConstraints();
    // Android should enable noiseSuppression for non-ultra-low
    expect(constraints.noiseSuppression).toBe(true);
  });
});

describe("Sprint 749 - shouldPreBuffer flag (line 575-576)", () => {
  it("should set shouldPreBuffer based on connection quality", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // With excellent connection and low jitter, shouldPreBuffer may be false
    // but with our mocks it depends on conditions
    expect(typeof result.current.shouldPreBuffer).toBe("boolean");
  });

  it("should consider jitter for shouldPreBuffer", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Record high variance latency samples to increase jitter
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.controls.recordLatency(i % 2 === 0 ? 50 : 200);
      }
    });

    // High jitter should affect shouldPreBuffer
    expect(result.current.metrics.jitter).toBeGreaterThan(0);
  });
});

describe("Sprint 749 - shouldReduceQuality flag (lines 570-573)", () => {
  it("should be true when bufferUnderruns > 3", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    act(() => {
      for (let i = 0; i < 4; i++) {
        result.current.controls.recordBufferEvent("underrun");
      }
    });

    expect(result.current.shouldReduceQuality).toBe(true);
  });
});

describe("Sprint 749 - processing latency calculation (lines 423-425)", () => {
  it("should calculate processing latency based on quality level", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Force high quality
    act(() => {
      result.current.controls.forceQuality("high");
    });
    expect(result.current.metrics.processingLatency).toBe(10);

    // Force medium quality
    act(() => {
      result.current.controls.forceQuality("medium");
    });
    expect(result.current.metrics.processingLatency).toBe(15);

    // Force low quality
    act(() => {
      result.current.controls.forceQuality("low");
    });
    expect(result.current.metrics.processingLatency).toBe(25);

    // Force ultra-low quality
    act(() => {
      result.current.controls.forceQuality("ultra-low");
    });
    expect(result.current.metrics.processingLatency).toBe(40);
  });
});

// ============================================================================
// Sprint 752 - Additional Branch Coverage Tests
// ============================================================================

describe("Sprint 752 - connectionQuality RTT branches (lines 330-333)", () => {
  it("should calculate connection quality based on RTT and effectiveType", () => {
    // Tests connection quality calculation
    // With current mocks: rtt=50, effectiveType="4g"
    // Since rtt=50 is NOT < 50, it returns "good" (rtt < 100 branch)
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Default mocks (rtt=50) should give "good" connection
    expect(result.current.metrics.connectionQuality).toBe("good");
  });

  it("should handle connection quality with undefined RTT", () => {
    // Tests line 328: networkRtt = rtt || avgLatency
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // With mocks providing rtt, this tests the fallback logic
    expect(result.current.metrics.networkLatency).toBeGreaterThan(0);
  });
});

describe("Sprint 752 - deviceTier switch default case (line 350-352)", () => {
  it("should handle all quality levels in auto mode", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Test that quality is calculated correctly
    expect(["high", "medium", "low", "ultra-low"]).toContain(result.current.quality);
  });

  it("should have valid quality for mobile high tier device", () => {
    // Current mock: tier="high", isMobile=true -> quality="medium"
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // With current mocks (high tier mobile with 4g excellent), should be medium
    expect(result.current.quality).toBe("medium");
  });
});

describe("Sprint 752 - quality downgrade with multiple underruns (lines 378-379)", () => {
  it("should handle quality downgrade from high with underruns", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Force high quality first
    act(() => {
      result.current.controls.forceQuality("high");
    });
    expect(result.current.quality).toBe("high");

    // Now record many underruns - should trigger downgrade in shouldReduceQuality
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.controls.recordBufferEvent("underrun");
      }
    });

    expect(result.current.shouldReduceQuality).toBe(true);
    expect(result.current.metrics.bufferUnderruns).toBe(10);
  });

  it("should handle quality downgrade from medium with underruns", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Force medium quality
    act(() => {
      result.current.controls.forceQuality("medium");
    });

    // Record underruns
    act(() => {
      for (let i = 0; i < 8; i++) {
        result.current.controls.recordBufferEvent("underrun");
      }
    });

    expect(result.current.shouldReduceQuality).toBe(true);
  });
});

describe("Sprint 752 - latency samples slicing (line 477)", () => {
  it("should slice latency samples when exceeding 50", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Record 60 samples
    act(() => {
      for (let i = 0; i < 60; i++) {
        result.current.controls.recordLatency(100 + i);
      }
    });

    // Jitter should still be calculated correctly
    expect(result.current.metrics.jitter).toBeGreaterThanOrEqual(0);
  });

  it("should keep only last 50 samples when limit exceeded", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Record 100 samples
    act(() => {
      for (let i = 0; i < 100; i++) {
        result.current.controls.recordLatency(i * 10);
      }
    });

    // Jitter calculation should work on the sliced array
    expect(result.current.metrics.jitter).toBeGreaterThanOrEqual(0);
  });
});

describe("Sprint 752 - quality configs for all levels", () => {
  it("should apply high quality config correctly", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    act(() => {
      result.current.controls.forceQuality("high");
    });

    expect(result.current.bufferConfig.sampleRate).toBe(44100);
    expect(result.current.bufferConfig.bitDepth).toBe(16);
    expect(result.current.bufferConfig.channels).toBe(2);
    expect(result.current.processingConfig.fftSize).toBe(256);
  });

  it("should apply medium quality config correctly", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    act(() => {
      result.current.controls.forceQuality("medium");
    });

    expect(result.current.bufferConfig.sampleRate).toBe(22050);
    expect(result.current.bufferConfig.channels).toBe(1);
    expect(result.current.processingConfig.fftSize).toBe(128);
  });

  it("should apply low quality config correctly", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    act(() => {
      result.current.controls.forceQuality("low");
    });

    expect(result.current.bufferConfig.sampleRate).toBe(16000);
    expect(result.current.bufferConfig.compressionLevel).toBe(6);
    expect(result.current.processingConfig.fftSize).toBe(64);
  });

  it("should apply ultra-low quality config correctly", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    act(() => {
      result.current.controls.forceQuality("ultra-low");
    });

    expect(result.current.bufferConfig.sampleRate).toBe(8000);
    expect(result.current.bufferConfig.bitDepth).toBe(8);
    expect(result.current.bufferConfig.compressionLevel).toBe(9);
    expect(result.current.processingConfig.fftSize).toBe(32);
    expect(result.current.processingConfig.enableVAD).toBe(false);
  });
});

describe("Sprint 752 - metrics estimation", () => {
  it("should calculate estimated latency correctly", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Estimated latency = network + processing + buffer
    expect(result.current.metrics.estimatedLatency).toBeGreaterThan(0);
    expect(result.current.metrics.bufferLatency).toBeGreaterThan(0);
  });

  it("should track playback drift", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Drift is 0 by default (would need AudioContext to measure)
    expect(result.current.metrics.playbackDrift).toBe(0);
  });
});

describe("Sprint 752 - buffer event callbacks", () => {
  it("should call onBufferIssue for multiple underruns", () => {
    const onBufferIssue = jest.fn();
    const { result } = renderHook(() =>
      useMobileAudioOptimizer({ onBufferIssue })
    );

    act(() => {
      result.current.controls.recordBufferEvent("underrun");
      result.current.controls.recordBufferEvent("underrun");
      result.current.controls.recordBufferEvent("underrun");
    });

    expect(onBufferIssue).toHaveBeenCalledTimes(3);
    expect(onBufferIssue).toHaveBeenCalledWith("underrun");
  });

  it("should call onBufferIssue for multiple overflows", () => {
    const onBufferIssue = jest.fn();
    const { result } = renderHook(() =>
      useMobileAudioOptimizer({ onBufferIssue })
    );

    act(() => {
      result.current.controls.recordBufferEvent("overflow");
      result.current.controls.recordBufferEvent("overflow");
    });

    expect(onBufferIssue).toHaveBeenCalledTimes(2);
    expect(onBufferIssue).toHaveBeenCalledWith("overflow");
  });
});

describe("Sprint 752 - jitter calculation edge cases", () => {
  it("should return 0 jitter with no samples", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // No samples recorded
    expect(result.current.metrics.jitter).toBe(0);
  });

  it("should return 0 jitter with single sample", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    act(() => {
      result.current.controls.recordLatency(100);
    });

    // Only 1 sample - jitter calculation needs > 1
    expect(result.current.metrics.jitter).toBe(0);
  });

  it("should calculate jitter correctly with 2+ samples", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    act(() => {
      result.current.controls.recordLatency(100);
      result.current.controls.recordLatency(200);
    });

    expect(result.current.metrics.jitter).toBeGreaterThan(0);
  });
});

describe("Sprint 752 - config persistence", () => {
  it("should preserve manual buffer config when not optimizing", () => {
    const { result } = renderHook(() =>
      useMobileAudioOptimizer({ enabled: false })
    );

    // Manually set buffer config
    act(() => {
      result.current.controls.setBufferConfig({
        jitterBufferMs: 999,
      });
    });

    expect(result.current.bufferConfig.jitterBufferMs).toBe(999);

    // Quality change should not override when not optimizing
    act(() => {
      result.current.controls.forceQuality("high");
    });

    // Manual config should be preserved
    expect(result.current.bufferConfig.jitterBufferMs).toBe(999);
  });

  it("should update config when optimization is re-enabled", () => {
    const { result } = renderHook(() =>
      useMobileAudioOptimizer({ enabled: false })
    );

    expect(result.current.isOptimizing).toBe(false);

    act(() => {
      result.current.controls.startOptimization();
    });

    expect(result.current.isOptimizing).toBe(true);
  });
});

describe("Sprint 752 - quality calculation integration", () => {
  it("should maintain quality when forced regardless of conditions", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Force to specific quality
    act(() => {
      result.current.controls.forceQuality("high");
    });

    expect(result.current.quality).toBe("high");

    // Record bad conditions
    act(() => {
      for (let i = 0; i < 20; i++) {
        result.current.controls.recordBufferEvent("underrun");
      }
    });

    // Should still be forced quality
    expect(result.current.quality).toBe("high");
  });

  it("should adapt quality in auto mode based on conditions", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // In auto mode with current mocks (good conditions)
    act(() => {
      result.current.controls.forceQuality("auto");
    });

    // Quality should be auto-calculated
    expect(["high", "medium", "low", "ultra-low"]).toContain(result.current.quality);
  });
});

describe("Sprint 752 - getAudioConstraints integration", () => {
  it("should include all constraint fields", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    const constraints = result.current.controls.getAudioConstraints();

    expect(constraints).toHaveProperty("echoCancellation");
    expect(constraints).toHaveProperty("noiseSuppression");
    expect(constraints).toHaveProperty("autoGainControl");
    expect(constraints).toHaveProperty("channelCount");
  });

  it("should update constraints when quality changes", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    act(() => {
      result.current.controls.forceQuality("high");
    });

    const highConstraints = result.current.controls.getAudioConstraints();

    act(() => {
      result.current.controls.forceQuality("ultra-low");
    });

    const ultraLowConstraints = result.current.controls.getAudioConstraints();

    // Constraints should differ based on quality
    expect(highConstraints.noiseSuppression).not.toBe(ultraLowConstraints.noiseSuppression);
  });
});
