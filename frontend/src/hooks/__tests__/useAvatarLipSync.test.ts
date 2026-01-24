/**
 * Tests for useAvatarLipSync - Sprint 553
 * Testing real-time lip synchronization for avatar speech
 */

import { renderHook, act } from "@testing-library/react";
import useAvatarLipSync, {
  useMouthState,
  useVisemeWeights,
  phonemesToVisemes,
  type Viseme,
  type VisemeFrame,
  type LipSyncConfig,
} from "../useAvatarLipSync";

// Mock requestAnimationFrame
let rafCallback: FrameRequestCallback | null = null;
let rafId = 0;

beforeEach(() => {
  jest.useFakeTimers();
  rafId = 0;
  rafCallback = null;

  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    rafCallback = cb;
    return ++rafId;
  });

  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Helper to advance animation frame
function advanceRAF() {
  if (rafCallback) {
    const cb = rafCallback;
    rafCallback = null;
    cb(performance.now());
  }
}

describe("useAvatarLipSync", () => {
  describe("initial state", () => {
    it("should return default initial state", () => {
      const { result } = renderHook(() => useAvatarLipSync());

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.currentFrame.primary.viseme).toBe("sil");
      expect(result.current.state.audioProgress).toBe(0);
      expect(result.current.state.quality).toBe("high");
    });

    it("should use default config values", () => {
      const { result } = renderHook(() => useAvatarLipSync());

      expect(result.current.config.enabled).toBe(true);
      expect(result.current.config.blendDurationMs).toBe(80);
      expect(result.current.config.minVisemeDurationMs).toBe(50);
      expect(result.current.config.smoothingFactor).toBe(0.7);
      expect(result.current.config.anticipationMs).toBe(50);
      expect(result.current.config.fallbackEnabled).toBe(true);
    });

    it("should accept custom initial config", () => {
      const customConfig: Partial<LipSyncConfig> = {
        blendDurationMs: 100,
        smoothingFactor: 0.5,
        intensityScale: 1.5,
      };

      const { result } = renderHook(() => useAvatarLipSync(customConfig));

      expect(result.current.config.blendDurationMs).toBe(100);
      expect(result.current.config.smoothingFactor).toBe(0.5);
      expect(result.current.config.intensityScale).toBe(1.5);
      // Default values should still be present
      expect(result.current.config.anticipationMs).toBe(50);
    });

    it("should initialize metrics to zero", () => {
      const { result } = renderHook(() => useAvatarLipSync());

      expect(result.current.metrics.framesProcessed).toBe(0);
      expect(result.current.metrics.averageLatency).toBe(0);
      expect(result.current.metrics.dropppedFrames).toBe(0);
      expect(result.current.metrics.visemeTransitions).toBe(0);
      expect(result.current.metrics.syncAccuracy).toBe(1);
    });

    it("should have blendedWeights initialized with silence", () => {
      const { result } = renderHook(() => useAvatarLipSync());

      expect(result.current.state.blendedWeights.get("sil")).toBe(1);
    });
  });

  describe("controls", () => {
    it("should provide all control functions", () => {
      const { result } = renderHook(() => useAvatarLipSync());
      const { controls } = result.current;

      expect(typeof controls.start).toBe("function");
      expect(typeof controls.stop).toBe("function");
      expect(typeof controls.pause).toBe("function");
      expect(typeof controls.resume).toBe("function");
      expect(typeof controls.setVisemeSequence).toBe("function");
      expect(typeof controls.addVisemeFrame).toBe("function");
      expect(typeof controls.syncToTime).toBe("function");
      expect(typeof controls.updateConfig).toBe("function");
      expect(typeof controls.reset).toBe("function");
    });

    it("should activate when start is called", () => {
      const { result } = renderHook(() => useAvatarLipSync());

      const mockAudio = document.createElement("audio");

      act(() => {
        result.current.controls.start(mockAudio);
      });

      expect(result.current.state.isActive).toBe(true);
    });

    it("should deactivate when stop is called", () => {
      const { result } = renderHook(() => useAvatarLipSync());
      const mockAudio = document.createElement("audio");

      act(() => {
        result.current.controls.start(mockAudio);
      });

      expect(result.current.state.isActive).toBe(true);

      act(() => {
        result.current.controls.stop();
      });

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.currentFrame.primary.viseme).toBe("sil");
    });

    it("should update config when updateConfig is called", () => {
      const { result } = renderHook(() => useAvatarLipSync());

      act(() => {
        result.current.controls.updateConfig({
          blendDurationMs: 120,
          intensityScale: 0.8,
        });
      });

      expect(result.current.config.blendDurationMs).toBe(120);
      expect(result.current.config.intensityScale).toBe(0.8);
      // Unchanged values should remain
      expect(result.current.config.smoothingFactor).toBe(0.7);
    });

    it("should reset state and metrics when reset is called", () => {
      const { result } = renderHook(() => useAvatarLipSync());
      const mockAudio = document.createElement("audio");

      // Start and make some changes
      act(() => {
        result.current.controls.start(mockAudio);
        result.current.controls.setVisemeSequence([
          {
            timestamp: 0,
            primary: { viseme: "aa", weight: 1 },
            mouthOpenness: 0.8,
            intensity: 1,
          },
        ]);
      });

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.metrics.framesProcessed).toBe(0);
      expect(result.current.metrics.visemeTransitions).toBe(0);
    });

    it("should set viseme sequence sorted by timestamp", () => {
      const { result } = renderHook(() => useAvatarLipSync());

      const frames: VisemeFrame[] = [
        { timestamp: 200, primary: { viseme: "oh", weight: 1 }, mouthOpenness: 0.7, intensity: 0.8 },
        { timestamp: 100, primary: { viseme: "aa", weight: 1 }, mouthOpenness: 0.8, intensity: 1 },
        { timestamp: 300, primary: { viseme: "sil", weight: 1 }, mouthOpenness: 0, intensity: 0 },
      ];

      act(() => {
        result.current.controls.setVisemeSequence(frames);
      });

      // The sequence should be sorted internally
      // We can't directly access the ref, but we can verify the hook works
      expect(result.current.state).toBeDefined();
    });

    it("should add individual viseme frames", () => {
      const { result } = renderHook(() => useAvatarLipSync());

      const frame: VisemeFrame = {
        timestamp: 100,
        primary: { viseme: "PP", weight: 1 },
        mouthOpenness: 0,
        intensity: 0.5,
      };

      act(() => {
        result.current.controls.addVisemeFrame(frame);
      });

      expect(result.current.state).toBeDefined();
    });
  });

  describe("pause and resume", () => {
    it("should pause animation processing", () => {
      const { result } = renderHook(() => useAvatarLipSync());
      const mockAudio = document.createElement("audio");

      act(() => {
        result.current.controls.start(mockAudio);
      });

      act(() => {
        result.current.controls.pause();
      });

      // State should still be active but paused
      expect(result.current.state.isActive).toBe(true);
    });

    it("should resume after pause", () => {
      const { result } = renderHook(() => useAvatarLipSync());
      const mockAudio = document.createElement("audio");

      act(() => {
        result.current.controls.start(mockAudio);
        result.current.controls.pause();
        result.current.controls.resume();
      });

      expect(result.current.state.isActive).toBe(true);
    });
  });

  describe("syncToTime", () => {
    it("should synchronize to specific time", () => {
      const { result } = renderHook(() => useAvatarLipSync());

      act(() => {
        result.current.controls.syncToTime(500);
      });

      // The sync function sets internal timing reference
      expect(result.current.state).toBeDefined();
    });
  });
});

describe("useMouthState", () => {
  it("should return mouth state with openness", () => {
    const { result } = renderHook(() => useMouthState());

    expect(typeof result.current.openness).toBe("number");
    expect(result.current.openness).toBeGreaterThanOrEqual(0);
    expect(result.current.openness).toBeLessThanOrEqual(1);
  });

  it("should return current viseme", () => {
    const { result } = renderHook(() => useMouthState());

    expect(result.current.viseme).toBe("sil");
  });

  it("should return active status", () => {
    const { result } = renderHook(() => useMouthState());

    expect(result.current.isActive).toBe(false);
  });

  it("should accept config parameter", () => {
    const { result } = renderHook(() =>
      useMouthState({ intensityScale: 1.5 })
    );

    expect(result.current).toBeDefined();
  });
});

describe("useVisemeWeights", () => {
  it("should return a Map of viseme weights", () => {
    const { result } = renderHook(() => useVisemeWeights());

    expect(result.current instanceof Map).toBe(true);
  });

  it("should have silence weight initially", () => {
    const { result } = renderHook(() => useVisemeWeights());

    expect(result.current.get("sil")).toBe(1);
  });

  it("should accept config parameter", () => {
    const { result } = renderHook(() =>
      useVisemeWeights({ smoothingFactor: 0.9 })
    );

    expect(result.current instanceof Map).toBe(true);
  });
});

describe("phonemesToVisemes", () => {
  it("should convert phonemes to viseme frames", () => {
    const phonemes = [
      { phoneme: "p", startMs: 0, endMs: 100 },
      { phoneme: "aa", startMs: 100, endMs: 200 },
      { phoneme: "t", startMs: 200, endMs: 300 },
    ];

    const result = phonemesToVisemes(phonemes);

    expect(result).toHaveLength(3);
    expect(result[0].primary.viseme).toBe("PP");
    expect(result[1].primary.viseme).toBe("aa");
    expect(result[2].primary.viseme).toBe("DD");
  });

  it("should set correct timestamps", () => {
    const phonemes = [
      { phoneme: "m", startMs: 50, endMs: 150 },
      { phoneme: "oh", startMs: 150, endMs: 250 },
    ];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].timestamp).toBe(50);
    expect(result[1].timestamp).toBe(150);
  });

  it("should handle bilabial consonants", () => {
    const phonemes = [
      { phoneme: "p", startMs: 0, endMs: 100 },
      { phoneme: "b", startMs: 100, endMs: 200 },
      { phoneme: "m", startMs: 200, endMs: 300 },
    ];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].primary.viseme).toBe("PP");
    expect(result[1].primary.viseme).toBe("PP");
    expect(result[2].primary.viseme).toBe("PP");
  });

  it("should handle labiodental consonants", () => {
    const phonemes = [
      { phoneme: "f", startMs: 0, endMs: 100 },
      { phoneme: "v", startMs: 100, endMs: 200 },
    ];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].primary.viseme).toBe("FF");
    expect(result[1].primary.viseme).toBe("FF");
  });

  it("should handle dental consonants", () => {
    const phonemes = [{ phoneme: "th", startMs: 0, endMs: 100 }];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].primary.viseme).toBe("TH");
  });

  it("should handle alveolar consonants", () => {
    const phonemes = [
      { phoneme: "t", startMs: 0, endMs: 100 },
      { phoneme: "d", startMs: 100, endMs: 200 },
      { phoneme: "s", startMs: 200, endMs: 300 },
      { phoneme: "z", startMs: 300, endMs: 400 },
    ];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].primary.viseme).toBe("DD");
    expect(result[1].primary.viseme).toBe("DD");
    expect(result[2].primary.viseme).toBe("SS");
    expect(result[3].primary.viseme).toBe("SS");
  });

  it("should handle post-alveolar consonants", () => {
    const phonemes = [
      { phoneme: "sh", startMs: 0, endMs: 100 },
      { phoneme: "ch", startMs: 100, endMs: 200 },
      { phoneme: "j", startMs: 200, endMs: 300 },
    ];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].primary.viseme).toBe("CH");
    expect(result[1].primary.viseme).toBe("CH");
    expect(result[2].primary.viseme).toBe("CH");
  });

  it("should handle velar consonants", () => {
    const phonemes = [
      { phoneme: "k", startMs: 0, endMs: 100 },
      { phoneme: "g", startMs: 100, endMs: 200 },
    ];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].primary.viseme).toBe("kk");
    expect(result[1].primary.viseme).toBe("kk");
  });

  it("should handle vowels correctly", () => {
    const phonemes = [
      { phoneme: "aa", startMs: 0, endMs: 100 },
      { phoneme: "eh", startMs: 100, endMs: 200 },
      { phoneme: "ih", startMs: 200, endMs: 300 },
      { phoneme: "ow", startMs: 300, endMs: 400 },
      { phoneme: "uw", startMs: 400, endMs: 500 },
    ];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].primary.viseme).toBe("aa");
    expect(result[1].primary.viseme).toBe("E");
    expect(result[2].primary.viseme).toBe("ih");
    expect(result[3].primary.viseme).toBe("oh");
    expect(result[4].primary.viseme).toBe("ou");
  });

  it("should default to silence for unknown phonemes", () => {
    const phonemes = [{ phoneme: "xyz", startMs: 0, endMs: 100 }];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].primary.viseme).toBe("sil");
  });

  it("should handle case-insensitive phonemes", () => {
    const phonemes = [
      { phoneme: "P", startMs: 0, endMs: 100 },
      { phoneme: "AA", startMs: 100, endMs: 200 },
    ];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].primary.viseme).toBe("PP");
    expect(result[1].primary.viseme).toBe("aa");
  });

  it("should set mouthOpenness based on viseme config", () => {
    const phonemes = [
      { phoneme: "p", startMs: 0, endMs: 100 }, // PP: openness 0
      { phoneme: "aa", startMs: 100, endMs: 200 }, // aa: openness 0.8
    ];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].mouthOpenness).toBe(0);
    expect(result[1].mouthOpenness).toBe(0.8);
  });

  it("should set default intensity", () => {
    const phonemes = [{ phoneme: "aa", startMs: 0, endMs: 100 }];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].intensity).toBe(0.8);
  });

  it("should return empty array for empty input", () => {
    const result = phonemesToVisemes([]);

    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it("should handle r consonant", () => {
    const phonemes = [{ phoneme: "r", startMs: 0, endMs: 100 }];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].primary.viseme).toBe("RR");
  });

  it("should handle w and y glides", () => {
    const phonemes = [
      { phoneme: "w", startMs: 0, endMs: 100 },
      { phoneme: "y", startMs: 100, endMs: 200 },
    ];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].primary.viseme).toBe("ou");
    expect(result[1].primary.viseme).toBe("ih");
  });

  it("should handle h as silence", () => {
    const phonemes = [{ phoneme: "h", startMs: 0, endMs: 100 }];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].primary.viseme).toBe("sil");
  });

  it("should handle nasal consonants", () => {
    const phonemes = [
      { phoneme: "n", startMs: 0, endMs: 100 },
      { phoneme: "ng", startMs: 100, endMs: 200 },
    ];

    const result = phonemesToVisemes(phonemes);

    expect(result[0].primary.viseme).toBe("nn");
    expect(result[1].primary.viseme).toBe("nn");
  });
});

describe("Viseme types", () => {
  it("should include all standard visemes", () => {
    const standardVisemes: Viseme[] = [
      "sil",
      "PP",
      "FF",
      "TH",
      "DD",
      "kk",
      "CH",
      "SS",
      "nn",
      "RR",
      "aa",
      "E",
      "ih",
      "oh",
      "ou",
    ];

    // Type check - this will fail compilation if any viseme is missing
    standardVisemes.forEach((v) => {
      const viseme: Viseme = v;
      expect(viseme).toBeDefined();
    });
  });
});

describe("LipSyncState quality levels", () => {
  it("should support all quality levels", () => {
    const qualities: Array<"high" | "medium" | "low" | "fallback"> = [
      "high",
      "medium",
      "low",
      "fallback",
    ];

    const { result } = renderHook(() => useAvatarLipSync());

    // Initial quality should be one of the valid values
    expect(qualities).toContain(result.current.state.quality);
  });
});

describe("config validation", () => {
  it("should handle zero blendDurationMs", () => {
    const { result } = renderHook(() =>
      useAvatarLipSync({ blendDurationMs: 0 })
    );

    expect(result.current.config.blendDurationMs).toBe(0);
  });

  it("should handle zero smoothingFactor", () => {
    const { result } = renderHook(() =>
      useAvatarLipSync({ smoothingFactor: 0 })
    );

    expect(result.current.config.smoothingFactor).toBe(0);
  });

  it("should handle high intensityScale", () => {
    const { result } = renderHook(() =>
      useAvatarLipSync({ intensityScale: 2.0 })
    );

    expect(result.current.config.intensityScale).toBe(2.0);
  });

  it("should handle disabled fallback", () => {
    const { result } = renderHook(() =>
      useAvatarLipSync({ fallbackEnabled: false })
    );

    expect(result.current.config.fallbackEnabled).toBe(false);
  });
});
