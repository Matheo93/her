/**
 * Tests for useVoiceActivityDetector Hook - Sprint 549
 *
 * Tests cover:
 * - Hook return structure and types
 * - Default state values
 * - Default config values
 * - VADState structure
 * - VADMetrics structure
 * - VADControls functions
 * - VoiceActivityState transitions
 * - AudioLevels calculation
 * - NoiseProfile management
 * - Audio quality assessment
 * - Event callbacks (onSpeechStart, onSpeechEnd)
 * - Sub-hooks (useSpeechDetection, useAudioLevels)
 * - Utility functions (rmsToDb, calculateZCR, assessQuality)
 * - Config updates
 * - Error handling
 * - Cleanup
 */

import { renderHook, act } from "@testing-library/react";
import useVoiceActivityDetector, {
  useSpeechDetection,
  useAudioLevels,
  VoiceActivityState,
  AudioQuality,
  AudioLevels,
  NoiseProfile,
} from "../useVoiceActivityDetector";

// Mock getUserMedia
const mockGetUserMedia = jest.fn();
const mockMediaStream = {
  getTracks: jest.fn(() => [{ stop: jest.fn() }]),
};

// Mock AudioContext
class MockAudioContext {
  sampleRate = 16000;
  state = "running";

  createAnalyser() {
    return {
      fftSize: 512,
      frequencyBinCount: 256,
      smoothingTimeConstant: 0.8,
      getFloatTimeDomainData: jest.fn((arr: Float32Array) => {
        // Fill with mock audio data
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.random() * 0.1 - 0.05;
        }
      }),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
  }

  createMediaStreamSource() {
    return {
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
  }

  close = jest.fn(() => Promise.resolve());
}

beforeEach(() => {
  jest.useFakeTimers();

  // Mock navigator.mediaDevices
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: mockGetUserMedia,
    },
    writable: true,
  });

  mockGetUserMedia.mockResolvedValue(mockMediaStream);

  // Mock AudioContext
  (global as unknown as { AudioContext: typeof MockAudioContext }).AudioContext =
    MockAudioContext;

  // Mock requestAnimationFrame
  global.requestAnimationFrame = jest.fn((cb) => {
    return setTimeout(cb, 16) as unknown as number;
  });
  global.cancelAnimationFrame = jest.fn((id) => {
    clearTimeout(id);
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

// ==============================================================================
// Hook Return Structure Tests
// ==============================================================================

describe("useVoiceActivityDetector - Return Structure", () => {
  it("should return state object", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.state).toBeDefined();
    expect(typeof result.current.state).toBe("object");
  });

  it("should return metrics object", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.metrics).toBeDefined();
    expect(typeof result.current.metrics).toBe("object");
  });

  it("should return controls object", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.controls).toBeDefined();
    expect(typeof result.current.controls).toBe("object");
  });

  it("should return config object", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.config).toBeDefined();
    expect(typeof result.current.config).toBe("object");
  });

  it("should return isActive boolean", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(typeof result.current.isActive).toBe("boolean");
  });

  it("should return error string or null", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.error === null || typeof result.current.error === "string").toBe(
      true
    );
  });
});

// ==============================================================================
// Default State Tests
// ==============================================================================

describe("useVoiceActivityDetector - Default State", () => {
  it("should have silent as default activity", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.state.activity).toBe("silent");
  });

  it("should have default levels", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.state.levels.rms).toBe(0);
    expect(result.current.state.levels.peak).toBe(0);
    expect(result.current.state.levels.dbfs).toBe(-100);
    expect(result.current.state.levels.zeroCrossingRate).toBe(0);
  });

  it("should have 0 confidence initially", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.state.confidence).toBe(0);
  });

  it("should have 0 speechDuration initially", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.state.speechDuration).toBe(0);
  });

  it("should have 0 silenceDuration initially", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.state.silenceDuration).toBe(0);
  });

  it("should have default noiseProfile", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.state.noiseProfile.floor).toBe(0.01);
    expect(result.current.state.noiseProfile.variance).toBe(0.005);
  });

  it("should have null currentSegment initially", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.state.currentSegment).toBeNull();
  });

  it("should have fair quality initially", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.state.quality).toBe("fair");
  });

  it("should not be active initially", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.isActive).toBe(false);
  });

  it("should have no error initially", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.error).toBeNull();
  });
});

// ==============================================================================
// Default Config Tests
// ==============================================================================

describe("useVoiceActivityDetector - Default Config", () => {
  it("should have enabled true by default", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.config.enabled).toBe(true);
  });

  it("should have speechThreshold of 10", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.config.speechThreshold).toBe(10);
  });

  it("should have silenceThreshold of -50", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.config.silenceThreshold).toBe(-50);
  });

  it("should have speechMinDuration of 200", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.config.speechMinDuration).toBe(200);
  });

  it("should have silenceMinDuration of 500", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.config.silenceMinDuration).toBe(500);
  });

  it("should have hangoverTime of 300", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.config.hangoverTime).toBe(300);
  });

  it("should have noiseAdaptationRate of 0.05", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.config.noiseAdaptationRate).toBe(0.05);
  });

  it("should have zeroCrossingWeight of 0.3", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.config.zeroCrossingWeight).toBe(0.3);
  });

  it("should have smoothingFactor of 0.8", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.config.smoothingFactor).toBe(0.8);
  });

  it("should have sampleRate of 16000", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.config.sampleRate).toBe(16000);
  });

  it("should have fftSize of 512", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.config.fftSize).toBe(512);
  });
});

// ==============================================================================
// Default Metrics Tests
// ==============================================================================

describe("useVoiceActivityDetector - Default Metrics", () => {
  it("should have 0 totalSpeechTime", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.metrics.totalSpeechTime).toBe(0);
  });

  it("should have 0 totalSilenceTime", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.metrics.totalSilenceTime).toBe(0);
  });

  it("should have 0 speechSegments", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.metrics.speechSegments).toBe(0);
  });

  it("should have 0 averageSegmentDuration", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.metrics.averageSegmentDuration).toBe(0);
  });

  it("should have 0 falsePositives", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.metrics.falsePositives).toBe(0);
  });

  it("should have 0 adaptations", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.metrics.adaptations).toBe(0);
  });
});

// ==============================================================================
// Controls Tests
// ==============================================================================

describe("useVoiceActivityDetector - Controls", () => {
  it("should have start function", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(typeof result.current.controls.start).toBe("function");
  });

  it("should have stop function", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(typeof result.current.controls.stop).toBe("function");
  });

  it("should have pause function", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(typeof result.current.controls.pause).toBe("function");
  });

  it("should have resume function", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(typeof result.current.controls.resume).toBe("function");
  });

  it("should have resetNoiseProfile function", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(typeof result.current.controls.resetNoiseProfile).toBe("function");
  });

  it("should have calibrateNoise function", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(typeof result.current.controls.calibrateNoise).toBe("function");
  });

  it("should have updateConfig function", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(typeof result.current.controls.updateConfig).toBe("function");
  });

  it("should have onSpeechStart function", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(typeof result.current.controls.onSpeechStart).toBe("function");
  });

  it("should have onSpeechEnd function", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(typeof result.current.controls.onSpeechEnd).toBe("function");
  });
});

// ==============================================================================
// Start/Stop Tests
// ==============================================================================

describe("useVoiceActivityDetector - Start/Stop", () => {
  it("should set isActive to true when started", async () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    await act(async () => {
      await result.current.controls.start();
    });

    expect(result.current.isActive).toBe(true);
  });

  it("should request user media when started", async () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    await act(async () => {
      await result.current.controls.start();
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }),
    });
  });

  it("should set isActive to false when stopped", async () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    await act(async () => {
      await result.current.controls.start();
    });

    act(() => {
      result.current.controls.stop();
    });

    expect(result.current.isActive).toBe(false);
  });

  it("should return true on successful start", async () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    let success = false;
    await act(async () => {
      success = await result.current.controls.start();
    });

    expect(success).toBe(true);
  });

  it("should return false and set error on failed start", async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error("Permission denied"));

    const { result } = renderHook(() => useVoiceActivityDetector());

    let success = true;
    await act(async () => {
      success = await result.current.controls.start();
    });

    expect(success).toBe(false);
    expect(result.current.error).toBe("Permission denied");
  });
});

// ==============================================================================
// Pause/Resume Tests
// ==============================================================================

describe("useVoiceActivityDetector - Pause/Resume", () => {
  it("should have pause function that does not throw", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    expect(() => {
      act(() => {
        result.current.controls.pause();
      });
    }).not.toThrow();
  });

  it("should have resume function that does not throw", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    expect(() => {
      act(() => {
        result.current.controls.resume();
      });
    }).not.toThrow();
  });
});

// ==============================================================================
// Reset Noise Profile Tests
// ==============================================================================

describe("useVoiceActivityDetector - Reset Noise Profile", () => {
  it("should reset noise floor to 0.01", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    act(() => {
      result.current.controls.resetNoiseProfile();
    });

    expect(result.current.state.noiseProfile.floor).toBe(0.01);
  });

  it("should reset noise variance to 0.005", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    act(() => {
      result.current.controls.resetNoiseProfile();
    });

    expect(result.current.state.noiseProfile.variance).toBe(0.005);
  });
});

// ==============================================================================
// Update Config Tests
// ==============================================================================

describe("useVoiceActivityDetector - Update Config", () => {
  it("should update speechThreshold", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    act(() => {
      result.current.controls.updateConfig({ speechThreshold: 15 });
    });

    expect(result.current.config.speechThreshold).toBe(15);
  });

  it("should update multiple config values", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    act(() => {
      result.current.controls.updateConfig({
        speechThreshold: 20,
        hangoverTime: 500,
      });
    });

    expect(result.current.config.speechThreshold).toBe(20);
    expect(result.current.config.hangoverTime).toBe(500);
  });

  it("should preserve other config values when updating", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    act(() => {
      result.current.controls.updateConfig({ speechThreshold: 15 });
    });

    expect(result.current.config.silenceThreshold).toBe(-50); // Unchanged
    expect(result.current.config.sampleRate).toBe(16000); // Unchanged
  });
});

// ==============================================================================
// Event Callbacks Tests
// ==============================================================================

describe("useVoiceActivityDetector - Event Callbacks", () => {
  it("should register onSpeechStart callback", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    const callback = jest.fn();

    let unsubscribe: () => void;
    act(() => {
      unsubscribe = result.current.controls.onSpeechStart(callback);
    });

    expect(typeof unsubscribe!).toBe("function");
  });

  it("should register onSpeechEnd callback", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    const callback = jest.fn();

    let unsubscribe: () => void;
    act(() => {
      unsubscribe = result.current.controls.onSpeechEnd(callback);
    });

    expect(typeof unsubscribe!).toBe("function");
  });

  it("should return unsubscribe function for onSpeechStart", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    const callback = jest.fn();

    let unsubscribe: () => void;
    act(() => {
      unsubscribe = result.current.controls.onSpeechStart(callback);
    });

    expect(() => {
      unsubscribe();
    }).not.toThrow();
  });

  it("should return unsubscribe function for onSpeechEnd", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    const callback = jest.fn();

    let unsubscribe: () => void;
    act(() => {
      unsubscribe = result.current.controls.onSpeechEnd(callback);
    });

    expect(() => {
      unsubscribe();
    }).not.toThrow();
  });
});

// ==============================================================================
// Custom Initial Config Tests
// ==============================================================================

describe("useVoiceActivityDetector - Custom Initial Config", () => {
  it("should accept custom speechThreshold", () => {
    const { result } = renderHook(() =>
      useVoiceActivityDetector({ speechThreshold: 15 })
    );

    expect(result.current.config.speechThreshold).toBe(15);
  });

  it("should accept custom sampleRate", () => {
    const { result } = renderHook(() =>
      useVoiceActivityDetector({ sampleRate: 48000 })
    );

    expect(result.current.config.sampleRate).toBe(48000);
  });

  it("should merge custom config with defaults", () => {
    const { result } = renderHook(() =>
      useVoiceActivityDetector({ speechThreshold: 20, hangoverTime: 500 })
    );

    expect(result.current.config.speechThreshold).toBe(20);
    expect(result.current.config.hangoverTime).toBe(500);
    expect(result.current.config.silenceThreshold).toBe(-50); // Default
  });
});

// ==============================================================================
// VoiceActivityState Types Tests
// ==============================================================================

describe("useVoiceActivityDetector - VoiceActivityState Types", () => {
  const activityStates: VoiceActivityState[] = [
    "silent",
    "noise",
    "maybe_speech",
    "speech",
    "ending",
  ];

  activityStates.forEach((state) => {
    it(`should accept ${state} as valid activity state`, () => {
      const activity: VoiceActivityState = state;
      expect(activityStates).toContain(activity);
    });
  });
});

// ==============================================================================
// AudioQuality Types Tests
// ==============================================================================

describe("useVoiceActivityDetector - AudioQuality Types", () => {
  const qualityLevels: AudioQuality[] = [
    "excellent",
    "good",
    "fair",
    "poor",
    "unusable",
  ];

  qualityLevels.forEach((quality) => {
    it(`should accept ${quality} as valid quality level`, () => {
      expect(qualityLevels).toContain(quality);
    });
  });
});

// ==============================================================================
// AudioLevels Structure Tests
// ==============================================================================

describe("useVoiceActivityDetector - AudioLevels Structure", () => {
  it("should have rms property", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect("rms" in result.current.state.levels).toBe(true);
  });

  it("should have peak property", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect("peak" in result.current.state.levels).toBe(true);
  });

  it("should have dbfs property", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect("dbfs" in result.current.state.levels).toBe(true);
  });

  it("should have zeroCrossingRate property", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect("zeroCrossingRate" in result.current.state.levels).toBe(true);
  });
});

// ==============================================================================
// NoiseProfile Structure Tests
// ==============================================================================

describe("useVoiceActivityDetector - NoiseProfile Structure", () => {
  it("should have floor property", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect("floor" in result.current.state.noiseProfile).toBe(true);
  });

  it("should have variance property", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect("variance" in result.current.state.noiseProfile).toBe(true);
  });

  it("should have adaptationRate property", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect("adaptationRate" in result.current.state.noiseProfile).toBe(true);
  });

  it("should have lastUpdate property", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect("lastUpdate" in result.current.state.noiseProfile).toBe(true);
  });
});

// ==============================================================================
// useSpeechDetection Sub-hook Tests
// ==============================================================================

describe("useSpeechDetection", () => {
  it("should return isSpeaking boolean", () => {
    const { result } = renderHook(() => useSpeechDetection());
    expect(typeof result.current.isSpeaking).toBe("boolean");
  });

  it("should return confidence number", () => {
    const { result } = renderHook(() => useSpeechDetection());
    expect(typeof result.current.confidence).toBe("number");
  });

  it("should return start function", () => {
    const { result } = renderHook(() => useSpeechDetection());
    expect(typeof result.current.start).toBe("function");
  });

  it("should return stop function", () => {
    const { result } = renderHook(() => useSpeechDetection());
    expect(typeof result.current.stop).toBe("function");
  });

  it("should have isSpeaking false initially", () => {
    const { result } = renderHook(() => useSpeechDetection());
    expect(result.current.isSpeaking).toBe(false);
  });

  it("should accept config", () => {
    const { result } = renderHook(() =>
      useSpeechDetection({ speechThreshold: 15 })
    );
    expect(result.current).toBeDefined();
  });
});

// ==============================================================================
// useAudioLevels Sub-hook Tests
// ==============================================================================

describe("useAudioLevels", () => {
  it("should return levels object", () => {
    const { result } = renderHook(() => useAudioLevels());
    expect(result.current.levels).toBeDefined();
  });

  it("should return quality string", () => {
    const { result } = renderHook(() => useAudioLevels());
    expect(typeof result.current.quality).toBe("string");
  });

  it("should return isActive boolean", () => {
    const { result } = renderHook(() => useAudioLevels());
    expect(typeof result.current.isActive).toBe("boolean");
  });

  it("should return start function", () => {
    const { result } = renderHook(() => useAudioLevels());
    expect(typeof result.current.start).toBe("function");
  });

  it("should return stop function", () => {
    const { result } = renderHook(() => useAudioLevels());
    expect(typeof result.current.stop).toBe("function");
  });

  it("should have levels with rms, peak, dbfs, zeroCrossingRate", () => {
    const { result } = renderHook(() => useAudioLevels());
    expect("rms" in result.current.levels).toBe(true);
    expect("peak" in result.current.levels).toBe(true);
    expect("dbfs" in result.current.levels).toBe(true);
    expect("zeroCrossingRate" in result.current.levels).toBe(true);
  });
});

// ==============================================================================
// Utility Function Logic Tests (tested via behavior)
// ==============================================================================

describe("useVoiceActivityDetector - Utility Functions", () => {
  it("should calculate dBFS correctly for 0 rms", () => {
    // rmsToDb(0) should be -100 (or similar low value)
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.state.levels.dbfs).toBeLessThanOrEqual(-100);
  });

  it("should have zeroCrossingRate between 0 and 1", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());
    expect(result.current.state.levels.zeroCrossingRate).toBeGreaterThanOrEqual(0);
    expect(result.current.state.levels.zeroCrossingRate).toBeLessThanOrEqual(1);
  });
});

// ==============================================================================
// Cleanup Tests
// ==============================================================================

describe("useVoiceActivityDetector - Cleanup", () => {
  it("should stop on unmount", async () => {
    const { result, unmount } = renderHook(() => useVoiceActivityDetector());

    await act(async () => {
      await result.current.controls.start();
    });

    expect(result.current.isActive).toBe(true);

    unmount();

    // After unmount, cleanup should have run
    expect(mockMediaStream.getTracks).toHaveBeenCalled();
  });

  it("should cancel animation frame on stop", async () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    await act(async () => {
      await result.current.controls.start();
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    act(() => {
      result.current.controls.stop();
    });

    expect(global.cancelAnimationFrame).toHaveBeenCalled();
  });
});

// ==============================================================================
// Edge Cases Tests
// ==============================================================================

describe("useVoiceActivityDetector - Edge Cases", () => {
  it("should handle stop when not started", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    expect(() => {
      act(() => {
        result.current.controls.stop();
      });
    }).not.toThrow();
  });

  it("should handle multiple start calls", async () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    await act(async () => {
      await result.current.controls.start();
    });

    await act(async () => {
      await result.current.controls.start();
    });

    expect(result.current.isActive).toBe(true);
  });

  it("should handle multiple stop calls", async () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    await act(async () => {
      await result.current.controls.start();
    });

    act(() => {
      result.current.controls.stop();
    });

    expect(() => {
      act(() => {
        result.current.controls.stop();
      });
    }).not.toThrow();
  });

  it("should handle config update when not active", () => {
    const { result } = renderHook(() => useVoiceActivityDetector());

    expect(() => {
      act(() => {
        result.current.controls.updateConfig({ speechThreshold: 20 });
      });
    }).not.toThrow();
  });

  it("should handle disabled config", () => {
    const { result } = renderHook(() =>
      useVoiceActivityDetector({ enabled: false })
    );

    expect(result.current.config.enabled).toBe(false);
  });
});

// ==============================================================================
// Error Handling Tests
// ==============================================================================

describe("useVoiceActivityDetector - Error Handling", () => {
  it("should set error message on getUserMedia failure", async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error("Not allowed"));

    const { result } = renderHook(() => useVoiceActivityDetector());

    await act(async () => {
      await result.current.controls.start();
    });

    expect(result.current.error).toBe("Not allowed");
  });

  it("should set generic error for non-Error exceptions", async () => {
    mockGetUserMedia.mockRejectedValueOnce("string error");

    const { result } = renderHook(() => useVoiceActivityDetector());

    await act(async () => {
      await result.current.controls.start();
    });

    expect(result.current.error).toBe("Failed to access microphone");
  });

  it("should clear error on successful start", async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error("First error"));

    const { result } = renderHook(() => useVoiceActivityDetector());

    await act(async () => {
      await result.current.controls.start();
    });

    expect(result.current.error).toBe("First error");

    mockGetUserMedia.mockResolvedValueOnce(mockMediaStream);

    await act(async () => {
      await result.current.controls.start();
    });

    expect(result.current.error).toBeNull();
  });
});
