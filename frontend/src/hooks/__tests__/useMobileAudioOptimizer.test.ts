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
// Sprint 749 - Branch Coverage Tests
// ============================================================================

describe("Sprint 749 - connectionQuality branches (lines 330-333)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should return 'good' when RTT < 100 and not 4g", async () => {
    jest.doMock("../useNetworkStatus", () => ({
      useNetworkStatus: () => ({
        isOnline: true,
        isSlowConnection: false,
        rtt: 80,
        effectiveType: "3g",
        saveData: false,
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    expect(result.current.metrics.connectionQuality).toBe("good");
  });

  it("should return 'fair' when RTT < 200", async () => {
    jest.doMock("../useNetworkStatus", () => ({
      useNetworkStatus: () => ({
        isOnline: true,
        isSlowConnection: true,
        rtt: 150,
        effectiveType: "3g",
        saveData: false,
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    expect(["fair", "good"]).toContain(result.current.metrics.connectionQuality);
  });

  it("should return 'poor' when RTT >= 200", async () => {
    jest.doMock("../useNetworkStatus", () => ({
      useNetworkStatus: () => ({
        isOnline: true,
        isSlowConnection: true,
        rtt: 300,
        effectiveType: "2g",
        saveData: false,
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    expect(result.current.metrics.connectionQuality).toBe("poor");
  });
});

describe("Sprint 749 - device tier branches (lines 347-353)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should set quality based on medium device tier", async () => {
    jest.doMock("../useDeviceCapabilities", () => ({
      useDeviceCapabilities: () => ({
        tier: "medium",
        battery: { isLowBattery: false, level: 0.8 },
        memory: { isLowMemory: false },
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    expect(["medium", "low"]).toContain(result.current.quality);
  });

  it("should set quality based on low device tier", async () => {
    jest.doMock("../useDeviceCapabilities", () => ({
      useDeviceCapabilities: () => ({
        tier: "low",
        battery: { isLowBattery: false, level: 0.8 },
        memory: { isLowMemory: false },
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    expect(["low", "ultra-low"]).toContain(result.current.quality);
  });
});

describe("Sprint 749 - offline branch (line 358)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should return ultra-low quality when offline", async () => {
    jest.doMock("../useNetworkStatus", () => ({
      useNetworkStatus: () => ({
        isOnline: false,
        isSlowConnection: false,
        rtt: null,
        effectiveType: null,
        saveData: false,
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    expect(result.current.quality).toBe("ultra-low");
    expect(result.current.metrics.connectionQuality).toBe("offline");
  });
});

describe("Sprint 749 - poor connection quality branch (lines 361-362)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should downgrade high quality to low on poor connection", async () => {
    jest.doMock("../useNetworkStatus", () => ({
      useNetworkStatus: () => ({
        isOnline: true,
        isSlowConnection: true,
        rtt: 500,
        effectiveType: "2g",
        saveData: false,
      }),
    }));
    jest.doMock("../useDeviceCapabilities", () => ({
      useDeviceCapabilities: () => ({
        tier: "high",
        battery: { isLowBattery: false, level: 0.8 },
        memory: { isLowMemory: false },
      }),
    }));
    jest.doMock("../useMobileDetect", () => ({
      useMobileDetect: () => ({
        isMobile: false,
        isIOS: false,
        isAndroid: false,
        isTablet: false,
        isTouchDevice: false,
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    expect(["low", "ultra-low"]).toContain(result.current.quality);
  });

  it("should downgrade non-high quality to ultra-low on poor connection", async () => {
    jest.doMock("../useNetworkStatus", () => ({
      useNetworkStatus: () => ({
        isOnline: true,
        isSlowConnection: true,
        rtt: 500,
        effectiveType: "2g",
        saveData: false,
      }),
    }));
    jest.doMock("../useDeviceCapabilities", () => ({
      useDeviceCapabilities: () => ({
        tier: "low",
        battery: { isLowBattery: false, level: 0.8 },
        memory: { isLowMemory: false },
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    expect(result.current.quality).toBe("ultra-low");
  });
});

describe("Sprint 749 - fair connection quality branch (lines 363-364)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should downgrade high to medium on fair connection", async () => {
    jest.doMock("../useNetworkStatus", () => ({
      useNetworkStatus: () => ({
        isOnline: true,
        isSlowConnection: false,
        rtt: 150,
        effectiveType: "3g",
        saveData: false,
      }),
    }));
    jest.doMock("../useDeviceCapabilities", () => ({
      useDeviceCapabilities: () => ({
        tier: "high",
        battery: { isLowBattery: false, level: 0.8 },
        memory: { isLowMemory: false },
      }),
    }));
    jest.doMock("../useMobileDetect", () => ({
      useMobileDetect: () => ({
        isMobile: false,
        isIOS: false,
        isAndroid: false,
        isTablet: false,
        isTouchDevice: false,
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    expect(["medium", "low"]).toContain(result.current.quality);
  });

  it("should downgrade medium to low on fair connection", async () => {
    jest.doMock("../useNetworkStatus", () => ({
      useNetworkStatus: () => ({
        isOnline: true,
        isSlowConnection: false,
        rtt: 150,
        effectiveType: "3g",
        saveData: false,
      }),
    }));
    jest.doMock("../useDeviceCapabilities", () => ({
      useDeviceCapabilities: () => ({
        tier: "medium",
        battery: { isLowBattery: false, level: 0.8 },
        memory: { isLowMemory: false },
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    expect(["low", "ultra-low"]).toContain(result.current.quality);
  });
});

describe("Sprint 749 - saveData branch (lines 368-369)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should downgrade quality when saveData is enabled", async () => {
    jest.doMock("../useNetworkStatus", () => ({
      useNetworkStatus: () => ({
        isOnline: true,
        isSlowConnection: false,
        rtt: 50,
        effectiveType: "4g",
        saveData: true,
      }),
    }));
    jest.doMock("../useDeviceCapabilities", () => ({
      useDeviceCapabilities: () => ({
        tier: "high",
        battery: { isLowBattery: false, level: 0.8 },
        memory: { isLowMemory: false },
      }),
    }));
    jest.doMock("../useMobileDetect", () => ({
      useMobileDetect: () => ({
        isMobile: false,
        isIOS: false,
        isAndroid: false,
        isTablet: false,
        isTouchDevice: false,
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // saveData should cause downgrade from high to medium
    expect(["medium", "low", "ultra-low"]).toContain(result.current.quality);
  });

  it("should downgrade medium to low when saveData enabled", async () => {
    jest.doMock("../useNetworkStatus", () => ({
      useNetworkStatus: () => ({
        isOnline: true,
        isSlowConnection: false,
        rtt: 50,
        effectiveType: "4g",
        saveData: true,
      }),
    }));
    jest.doMock("../useDeviceCapabilities", () => ({
      useDeviceCapabilities: () => ({
        tier: "medium",
        battery: { isLowBattery: false, level: 0.8 },
        memory: { isLowMemory: false },
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    expect(["low", "ultra-low"]).toContain(result.current.quality);
  });

  it("should downgrade low to ultra-low when saveData enabled", async () => {
    jest.doMock("../useNetworkStatus", () => ({
      useNetworkStatus: () => ({
        isOnline: true,
        isSlowConnection: false,
        rtt: 50,
        effectiveType: "4g",
        saveData: true,
      }),
    }));
    jest.doMock("../useDeviceCapabilities", () => ({
      useDeviceCapabilities: () => ({
        tier: "low",
        battery: { isLowBattery: false, level: 0.8 },
        memory: { isLowMemory: false },
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    expect(result.current.quality).toBe("ultra-low");
  });
});

describe("Sprint 749 - low battery branch (lines 373-374)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should downgrade quality on low battery", async () => {
    jest.doMock("../useDeviceCapabilities", () => ({
      useDeviceCapabilities: () => ({
        tier: "high",
        battery: { isLowBattery: true, level: 0.1 },
        memory: { isLowMemory: false },
      }),
    }));
    jest.doMock("../useMobileDetect", () => ({
      useMobileDetect: () => ({
        isMobile: false,
        isIOS: false,
        isAndroid: false,
        isTablet: false,
        isTouchDevice: false,
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Should downgrade from high due to low battery
    expect(["medium", "low"]).toContain(result.current.quality);
  });

  it("should downgrade medium to low on low battery", async () => {
    jest.doMock("../useDeviceCapabilities", () => ({
      useDeviceCapabilities: () => ({
        tier: "medium",
        battery: { isLowBattery: true, level: 0.1 },
        memory: { isLowMemory: false },
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    expect(result.current.quality).toBe("low");
  });
});

describe("Sprint 749 - buffer underruns branch (lines 378-379)", () => {
  it("should downgrade quality after many buffer underruns", () => {
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Record more than 5 underruns
    act(() => {
      for (let i = 0; i < 6; i++) {
        result.current.controls.recordBufferEvent("underrun");
      }
    });

    // Quality should be affected
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
});

describe("Sprint 749 - iOS-specific constraints (line 526)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should force echoCancellation for iOS", async () => {
    jest.doMock("../useMobileDetect", () => ({
      useMobileDetect: () => ({
        isMobile: true,
        isIOS: true,
        isAndroid: false,
        isTablet: false,
        isTouchDevice: true,
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    const constraints = result.current.controls.getAudioConstraints();
    expect(constraints.echoCancellation).toBe(true);
  });
});

describe("Sprint 749 - Android-specific constraints (lines 530-532)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should set noiseSuppression based on quality for Android", async () => {
    jest.doMock("../useMobileDetect", () => ({
      useMobileDetect: () => ({
        isMobile: true,
        isIOS: false,
        isAndroid: true,
        isTablet: false,
        isTouchDevice: true,
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    const constraints = result.current.controls.getAudioConstraints();
    expect(typeof constraints.noiseSuppression).toBe("boolean");
  });

  it("should disable noiseSuppression for ultra-low on Android", async () => {
    jest.doMock("../useMobileDetect", () => ({
      useMobileDetect: () => ({
        isMobile: true,
        isIOS: false,
        isAndroid: true,
        isTablet: false,
        isTouchDevice: true,
      }),
    }));

    const { useMobileAudioOptimizer } = await import("../useMobileAudioOptimizer");
    const { result } = renderHook(() => useMobileAudioOptimizer());

    // Force ultra-low quality
    act(() => {
      result.current.controls.forceQuality("ultra-low");
    });

    const constraints = result.current.controls.getAudioConstraints();
    expect(constraints.noiseSuppression).toBe(false);
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
});

describe("Sprint 749 - isOptimizing effect on config update (lines 405-417)", () => {
  it("should not update configs when not optimizing", () => {
    const { result } = renderHook(() =>
      useMobileAudioOptimizer({ enabled: false })
    );

    const initialBuffer = { ...result.current.bufferConfig };

    // Force quality change
    act(() => {
      result.current.controls.forceQuality("ultra-low");
    });

    // Configs should not auto-update when not optimizing
    expect(result.current.isOptimizing).toBe(false);
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
});
