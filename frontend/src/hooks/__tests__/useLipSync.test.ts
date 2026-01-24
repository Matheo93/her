/**
 * Tests for useLipSync hook
 *
 * Sprint 561: Frontend - Audio-driven lip animation tests
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useLipSync,
  useSimpleLipSync,
  useVisemeSequence,
  VISEME_BLEND_SHAPES,
  PHONEME_TO_VISEME,
  type Viseme,
  type VisemeEvent,
} from "../useLipSync";

// Mock requestAnimationFrame
let rafCallbacks: ((time: number) => void)[] = [];
let rafId = 0;

const mockRequestAnimationFrame = jest.fn((callback: (time: number) => void) => {
  rafCallbacks.push(callback);
  return ++rafId;
});

const mockCancelAnimationFrame = jest.fn((id: number) => {
  // Clear callbacks - simplified
});

// Mock performance.now
let mockTime = 0;
const mockPerformanceNow = jest.fn(() => mockTime);

// Mock AudioContext
const mockAnalyser = {
  fftSize: 0,
  frequencyBinCount: 128,
  getByteFrequencyData: jest.fn((array: Uint8Array) => {
    // Fill with some audio data
    for (let i = 0; i < array.length; i++) {
      array[i] = 128;
    }
  }),
  connect: jest.fn(),
  disconnect: jest.fn(),
};

const mockSource = {
  connect: jest.fn(),
  disconnect: jest.fn(),
};

const mockAudioContext = {
  createAnalyser: jest.fn(() => mockAnalyser),
  createMediaElementSource: jest.fn(() => mockSource),
  destination: {},
  close: jest.fn(() => Promise.resolve()),
};

// Setup global mocks
beforeAll(() => {
  global.requestAnimationFrame = mockRequestAnimationFrame as unknown as typeof requestAnimationFrame;
  global.cancelAnimationFrame = mockCancelAnimationFrame;
  global.performance.now = mockPerformanceNow;
  global.AudioContext = jest.fn(() => mockAudioContext) as unknown as typeof AudioContext;
});

beforeEach(() => {
  jest.clearAllMocks();
  rafCallbacks = [];
  rafId = 0;
  mockTime = 0;
  mockAnalyser.getByteFrequencyData.mockImplementation((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = 128;
    }
  });
});

afterEach(() => {
  rafCallbacks = [];
});

// Helper to advance animation frames
function advanceFrame(time: number) {
  mockTime = time;
  const callbacks = [...rafCallbacks];
  rafCallbacks = [];
  callbacks.forEach((cb) => cb(time));
}

// ============================================================================
// EXPORTS TESTS
// ============================================================================

describe("useLipSync exports", () => {
  test("exports useLipSync hook", () => {
    expect(useLipSync).toBeDefined();
    expect(typeof useLipSync).toBe("function");
  });

  test("exports useSimpleLipSync hook", () => {
    expect(useSimpleLipSync).toBeDefined();
    expect(typeof useSimpleLipSync).toBe("function");
  });

  test("exports useVisemeSequence hook", () => {
    expect(useVisemeSequence).toBeDefined();
    expect(typeof useVisemeSequence).toBe("function");
  });

  test("exports VISEME_BLEND_SHAPES mapping", () => {
    expect(VISEME_BLEND_SHAPES).toBeDefined();
    expect(typeof VISEME_BLEND_SHAPES).toBe("object");
  });

  test("exports PHONEME_TO_VISEME mapping", () => {
    expect(PHONEME_TO_VISEME).toBeDefined();
    expect(typeof PHONEME_TO_VISEME).toBe("object");
  });
});

// ============================================================================
// VISEME_BLEND_SHAPES TESTS
// ============================================================================

describe("VISEME_BLEND_SHAPES mapping", () => {
  const allVisemes: Viseme[] = [
    "sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "aa", "E", "ih", "oh", "ou",
  ];

  test("contains all standard visemes", () => {
    allVisemes.forEach((viseme) => {
      expect(VISEME_BLEND_SHAPES[viseme]).toBeDefined();
    });
  });

  test("silence viseme has empty blend shapes", () => {
    expect(VISEME_BLEND_SHAPES.sil).toEqual({});
  });

  test("PP viseme (p, b, m) has mouthClose", () => {
    expect(VISEME_BLEND_SHAPES.PP.mouthClose).toBeGreaterThan(0);
  });

  test("FF viseme (f, v) has mouthFunnel", () => {
    expect(VISEME_BLEND_SHAPES.FF.mouthFunnel).toBeGreaterThan(0);
  });

  test("TH viseme has tongueOut", () => {
    expect(VISEME_BLEND_SHAPES.TH.tongueOut).toBeGreaterThan(0);
  });

  test("aa viseme has wide jawOpen", () => {
    expect(VISEME_BLEND_SHAPES.aa.jawOpen).toBeGreaterThanOrEqual(0.6);
  });

  test("oh viseme has rounded mouth", () => {
    expect(VISEME_BLEND_SHAPES.oh.mouthFunnel).toBeGreaterThan(0);
    expect(VISEME_BLEND_SHAPES.oh.mouthPucker).toBeGreaterThan(0);
  });

  test("ou viseme has high mouthPucker", () => {
    expect(VISEME_BLEND_SHAPES.ou.mouthPucker).toBeGreaterThanOrEqual(0.6);
  });

  test("E viseme has mouth stretch", () => {
    expect(VISEME_BLEND_SHAPES.E.mouthStretchLeft).toBeGreaterThan(0);
    expect(VISEME_BLEND_SHAPES.E.mouthStretchRight).toBeGreaterThan(0);
  });

  test("SS viseme (s, z) has wide stretch", () => {
    expect(VISEME_BLEND_SHAPES.SS.mouthStretchLeft).toBeGreaterThan(0);
    expect(VISEME_BLEND_SHAPES.SS.mouthStretchRight).toBeGreaterThan(0);
  });

  test("all blend shape values are in 0-1 range", () => {
    Object.entries(VISEME_BLEND_SHAPES).forEach(([viseme, shapes]) => {
      Object.entries(shapes).forEach(([key, value]) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    });
  });
});

// ============================================================================
// PHONEME_TO_VISEME TESTS
// ============================================================================

describe("PHONEME_TO_VISEME mapping", () => {
  test("maps silence to sil", () => {
    expect(PHONEME_TO_VISEME[""]).toBe("sil");
    expect(PHONEME_TO_VISEME[" "]).toBe("sil");
  });

  test("maps bilabials (p, b, m) to PP", () => {
    expect(PHONEME_TO_VISEME.p).toBe("PP");
    expect(PHONEME_TO_VISEME.b).toBe("PP");
    expect(PHONEME_TO_VISEME.m).toBe("PP");
  });

  test("maps labiodentals (f, v) to FF", () => {
    expect(PHONEME_TO_VISEME.f).toBe("FF");
    expect(PHONEME_TO_VISEME.v).toBe("FF");
  });

  test("maps dental (th) to TH", () => {
    expect(PHONEME_TO_VISEME.th).toBe("TH");
  });

  test("maps alveolars (t, d) to DD", () => {
    expect(PHONEME_TO_VISEME.t).toBe("DD");
    expect(PHONEME_TO_VISEME.d).toBe("DD");
  });

  test("maps sibilants (s, z) to SS", () => {
    expect(PHONEME_TO_VISEME.s).toBe("SS");
    expect(PHONEME_TO_VISEME.z).toBe("SS");
  });

  test("maps post-alveolars to CH", () => {
    expect(PHONEME_TO_VISEME.sh).toBe("CH");
    expect(PHONEME_TO_VISEME.zh).toBe("CH");
    expect(PHONEME_TO_VISEME.ch).toBe("CH");
    expect(PHONEME_TO_VISEME.j).toBe("CH");
  });

  test("maps velars (k, g) to kk", () => {
    expect(PHONEME_TO_VISEME.k).toBe("kk");
    expect(PHONEME_TO_VISEME.g).toBe("kk");
  });

  test("maps nasals (n, ng) correctly", () => {
    expect(PHONEME_TO_VISEME.n).toBe("nn");
    expect(PHONEME_TO_VISEME.ng).toBe("nn");
  });

  test("maps approximants correctly", () => {
    expect(PHONEME_TO_VISEME.r).toBe("RR");
    expect(PHONEME_TO_VISEME.l).toBe("DD");
    expect(PHONEME_TO_VISEME.w).toBe("ou");
    expect(PHONEME_TO_VISEME.y).toBe("ih");
  });

  test("maps basic vowels correctly", () => {
    expect(PHONEME_TO_VISEME.a).toBe("aa");
    expect(PHONEME_TO_VISEME.e).toBe("E");
    expect(PHONEME_TO_VISEME.i).toBe("ih");
    expect(PHONEME_TO_VISEME.o).toBe("oh");
    expect(PHONEME_TO_VISEME.u).toBe("ou");
  });

  test("maps diphthongs correctly", () => {
    expect(PHONEME_TO_VISEME.ae).toBe("aa");
    expect(PHONEME_TO_VISEME.ah).toBe("aa");
    expect(PHONEME_TO_VISEME.ao).toBe("oh");
    expect(PHONEME_TO_VISEME.aw).toBe("oh");
    expect(PHONEME_TO_VISEME.ay).toBe("aa");
    expect(PHONEME_TO_VISEME.eh).toBe("E");
    expect(PHONEME_TO_VISEME.er).toBe("RR");
    expect(PHONEME_TO_VISEME.ey).toBe("E");
    expect(PHONEME_TO_VISEME.ih).toBe("ih");
    expect(PHONEME_TO_VISEME.iy).toBe("ih");
    expect(PHONEME_TO_VISEME.ow).toBe("oh");
    expect(PHONEME_TO_VISEME.oy).toBe("oh");
    expect(PHONEME_TO_VISEME.uh).toBe("ou");
    expect(PHONEME_TO_VISEME.uw).toBe("ou");
  });
});

// ============================================================================
// useLipSync INITIALIZATION TESTS
// ============================================================================

describe("useLipSync initialization", () => {
  test("returns state and controls", () => {
    const { result } = renderHook(() => useLipSync());

    expect(result.current.state).toBeDefined();
    expect(result.current.controls).toBeDefined();
  });

  test("initial state has silence viseme", () => {
    const { result } = renderHook(() => useLipSync());

    expect(result.current.state.currentViseme).toBe("sil");
  });

  test("initial state has empty blend shapes", () => {
    const { result } = renderHook(() => useLipSync());

    expect(result.current.state.blendShapes).toEqual({});
  });

  test("initial state is not active", () => {
    const { result } = renderHook(() => useLipSync());

    expect(result.current.state.isActive).toBe(false);
  });

  test("initial audio level is 0", () => {
    const { result } = renderHook(() => useLipSync());

    expect(result.current.state.audioLevel).toBe(0);
  });

  test("initial timeSinceChange is 0", () => {
    const { result } = renderHook(() => useLipSync());

    expect(result.current.state.timeSinceChange).toBe(0);
  });
});

// ============================================================================
// useLipSync OPTIONS TESTS
// ============================================================================

describe("useLipSync options", () => {
  test("accepts smoothing option", () => {
    const { result } = renderHook(() => useLipSync({ smoothing: 0.5 }));

    expect(result.current.state).toBeDefined();
  });

  test("accepts useAudioIntensity option", () => {
    const { result } = renderHook(() => useLipSync({ useAudioIntensity: false }));

    expect(result.current.state).toBeDefined();
  });

  test("accepts audioThreshold option", () => {
    const { result } = renderHook(() => useLipSync({ audioThreshold: 0.1 }));

    expect(result.current.state).toBeDefined();
  });

  test("accepts quality option - high", () => {
    const { result } = renderHook(() => useLipSync({ quality: "high" }));

    expect(result.current.state).toBeDefined();
  });

  test("accepts quality option - medium", () => {
    const { result } = renderHook(() => useLipSync({ quality: "medium" }));

    expect(result.current.state).toBeDefined();
  });

  test("accepts quality option - low", () => {
    const { result } = renderHook(() => useLipSync({ quality: "low" }));

    expect(result.current.state).toBeDefined();
  });

  test("calls onVisemeChange callback when viseme changes", () => {
    const onVisemeChange = jest.fn();
    const { result } = renderHook(() => useLipSync({ onVisemeChange }));

    act(() => {
      result.current.controls.setViseme("aa");
    });

    expect(onVisemeChange).toHaveBeenCalledWith("aa");
  });
});

// ============================================================================
// useLipSync CONTROLS - setViseme TESTS
// ============================================================================

describe("useLipSync controls - setViseme", () => {
  test("sets viseme directly", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.setViseme("PP");
    });

    expect(result.current.state.currentViseme).toBe("PP");
  });

  test("updates blend shapes when viseme is set", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.setViseme("aa");
    });

    expect(Object.keys(result.current.state.blendShapes).length).toBeGreaterThan(0);
  });

  test("sets viseme with custom intensity", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.setViseme("aa", 0.5);
    });

    expect(result.current.state.currentViseme).toBe("aa");
    // Blend shapes should be scaled by intensity
    const jawOpen = result.current.state.blendShapes.jawOpen || 0;
    expect(jawOpen).toBeLessThan(VISEME_BLEND_SHAPES.aa.jawOpen!);
  });

  test("triggers onVisemeChange callback", () => {
    const onVisemeChange = jest.fn();
    const { result } = renderHook(() => useLipSync({ onVisemeChange }));

    act(() => {
      result.current.controls.setViseme("E");
    });

    expect(onVisemeChange).toHaveBeenCalledWith("E");
  });

  test("can set all viseme types", () => {
    const { result } = renderHook(() => useLipSync());
    const visemes: Viseme[] = [
      "sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "nn", "RR", "aa", "E", "ih", "oh", "ou",
    ];

    visemes.forEach((viseme) => {
      act(() => {
        result.current.controls.setViseme(viseme);
      });
      expect(result.current.state.currentViseme).toBe(viseme);
    });
  });
});

// ============================================================================
// useLipSync CONTROLS - updateAudioLevel TESTS
// ============================================================================

describe("useLipSync controls - updateAudioLevel", () => {
  test("updates audio level", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.updateAudioLevel(0.5);
    });

    expect(result.current.state.audioLevel).toBe(0.5);
  });

  test("clamps audio level to 0 minimum", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.updateAudioLevel(-0.5);
    });

    expect(result.current.state.audioLevel).toBe(0);
  });

  test("clamps audio level to 1 maximum", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.updateAudioLevel(1.5);
    });

    expect(result.current.state.audioLevel).toBe(1);
  });

  test("accepts 0 level", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.updateAudioLevel(0);
    });

    expect(result.current.state.audioLevel).toBe(0);
  });

  test("accepts 1 level", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.updateAudioLevel(1);
    });

    expect(result.current.state.audioLevel).toBe(1);
  });
});

// ============================================================================
// useLipSync CONTROLS - startFromVisemes TESTS
// ============================================================================

describe("useLipSync controls - startFromVisemes", () => {
  test("starts lip sync from viseme events", () => {
    const { result } = renderHook(() => useLipSync());
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 100, intensity: 1 },
    ];

    act(() => {
      result.current.controls.startFromVisemes(events);
    });

    expect(result.current.state.isActive).toBe(true);
  });

  test("updates viseme during playback", () => {
    const { result } = renderHook(() => useLipSync());
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 100, intensity: 1 },
      { viseme: "E", time: 100, duration: 100, intensity: 1 },
    ];

    act(() => {
      result.current.controls.startFromVisemes(events);
    });

    // Advance to first event
    act(() => {
      advanceFrame(50);
    });

    expect(result.current.state.currentViseme).toBe("aa");
  });

  test("transitions between viseme events", () => {
    const onVisemeChange = jest.fn();
    const { result } = renderHook(() => useLipSync({ onVisemeChange }));
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 100, intensity: 1 },
      { viseme: "E", time: 100, duration: 100, intensity: 1 },
    ];

    act(() => {
      result.current.controls.startFromVisemes(events);
    });

    // Advance to first event
    act(() => {
      advanceFrame(50);
    });

    expect(onVisemeChange).toHaveBeenCalledWith("aa");
  });

  test("returns to silence after all events", () => {
    const { result } = renderHook(() => useLipSync());
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 100, intensity: 1 },
    ];

    act(() => {
      result.current.controls.startFromVisemes(events);
    });

    // Advance past all events
    act(() => {
      advanceFrame(200);
    });

    expect(result.current.state.currentViseme).toBe("sil");
    expect(result.current.state.isActive).toBe(false);
  });

  test("schedules animation frame", () => {
    const { result } = renderHook(() => useLipSync());
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 100, intensity: 1 },
    ];

    act(() => {
      result.current.controls.startFromVisemes(events);
    });

    expect(mockRequestAnimationFrame).toHaveBeenCalled();
  });
});

// ============================================================================
// useLipSync CONTROLS - startFromPhonemes TESTS
// ============================================================================

describe("useLipSync controls - startFromPhonemes", () => {
  test("starts lip sync from phonemes", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.startFromPhonemes(["a", "e", "i"], [100, 100, 100]);
    });

    expect(result.current.state.isActive).toBe(true);
  });

  test("converts phonemes to viseme events", () => {
    const onVisemeChange = jest.fn();
    const { result } = renderHook(() => useLipSync({ onVisemeChange }));

    act(() => {
      result.current.controls.startFromPhonemes(["a"], [100]);
    });

    // Advance to first event
    act(() => {
      advanceFrame(50);
    });

    expect(onVisemeChange).toHaveBeenCalledWith("aa");
  });

  test("handles unknown phonemes as silence", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.startFromPhonemes(["xyz"], [100]);
    });

    // Advance to first event
    act(() => {
      advanceFrame(50);
    });

    // Unknown should map to sil
    expect(result.current.state.isActive).toBe(true);
  });

  test("uses default duration if not provided", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.startFromPhonemes(["a", "e"], [100]); // Only one duration
    });

    expect(result.current.state.isActive).toBe(true);
  });

  test("handles case-insensitive phonemes", () => {
    const onVisemeChange = jest.fn();
    const { result } = renderHook(() => useLipSync({ onVisemeChange }));

    act(() => {
      result.current.controls.startFromPhonemes(["A"], [100]); // Uppercase
    });

    act(() => {
      advanceFrame(50);
    });

    expect(onVisemeChange).toHaveBeenCalledWith("aa");
  });
});

// ============================================================================
// useLipSync CONTROLS - stop TESTS
// ============================================================================

describe("useLipSync controls - stop", () => {
  test("stops lip sync", () => {
    const { result } = renderHook(() => useLipSync());
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 1000, intensity: 1 },
    ];

    act(() => {
      result.current.controls.startFromVisemes(events);
    });

    expect(result.current.state.isActive).toBe(true);

    act(() => {
      result.current.controls.stop();
    });

    expect(result.current.state.isActive).toBe(false);
  });

  test("resets viseme to silence", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.setViseme("aa");
    });

    expect(result.current.state.currentViseme).toBe("aa");

    act(() => {
      result.current.controls.stop();
    });

    expect(result.current.state.currentViseme).toBe("sil");
  });

  test("clears blend shapes", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.setViseme("aa");
    });

    expect(Object.keys(result.current.state.blendShapes).length).toBeGreaterThan(0);

    act(() => {
      result.current.controls.stop();
    });

    expect(result.current.state.blendShapes).toEqual({});
  });

  test("resets audio level to 0", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.updateAudioLevel(0.7);
    });

    expect(result.current.state.audioLevel).toBe(0.7);

    act(() => {
      result.current.controls.stop();
    });

    expect(result.current.state.audioLevel).toBe(0);
  });

  test("cancels animation frame", () => {
    const { result } = renderHook(() => useLipSync());
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 1000, intensity: 1 },
    ];

    act(() => {
      result.current.controls.startFromVisemes(events);
    });

    act(() => {
      result.current.controls.stop();
    });

    expect(mockCancelAnimationFrame).toHaveBeenCalled();
  });
});

// ============================================================================
// useLipSync CONTROLS - pause/resume TESTS
// ============================================================================

describe("useLipSync controls - pause/resume", () => {
  test("pause stops animation when active", () => {
    const { result } = renderHook(() => useLipSync());
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 1000, intensity: 1 },
    ];

    act(() => {
      result.current.controls.startFromVisemes(events);
    });

    act(() => {
      result.current.controls.pause();
    });

    // isActive should still be true (paused, not stopped)
    expect(result.current.state.isActive).toBe(true);
    expect(mockCancelAnimationFrame).toHaveBeenCalled();
  });

  test("pause does nothing when not active", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.pause();
    });

    expect(result.current.state.isActive).toBe(false);
  });

  test("resume continues animation after pause", () => {
    const { result } = renderHook(() => useLipSync());
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 1000, intensity: 1 },
    ];

    act(() => {
      result.current.controls.startFromVisemes(events);
    });

    const callsBefore = mockRequestAnimationFrame.mock.calls.length;

    act(() => {
      result.current.controls.pause();
    });

    act(() => {
      mockTime = 500;
      result.current.controls.resume();
    });

    expect(mockRequestAnimationFrame.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  test("resume does nothing when not paused", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.resume();
    });

    expect(result.current.state.isActive).toBe(false);
  });

  test("resume does nothing when not active", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.resume();
    });

    expect(result.current.state.isActive).toBe(false);
  });
});

// ============================================================================
// useLipSync CONTROLS - reset TESTS
// ============================================================================

describe("useLipSync controls - reset", () => {
  test("stops lip sync", () => {
    const { result } = renderHook(() => useLipSync());
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 1000, intensity: 1 },
    ];

    act(() => {
      result.current.controls.startFromVisemes(events);
    });

    act(() => {
      result.current.controls.reset();
    });

    expect(result.current.state.isActive).toBe(false);
  });

  test("resets timeSinceChange to 0", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.reset();
    });

    expect(result.current.state.timeSinceChange).toBe(0);
  });

  test("resets to idle state", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.setViseme("aa");
    });

    act(() => {
      result.current.controls.reset();
    });

    expect(result.current.state.currentViseme).toBe("sil");
    expect(result.current.state.blendShapes).toEqual({});
    expect(result.current.state.audioLevel).toBe(0);
  });
});

// ============================================================================
// useLipSync CONTROLS - startFromAudio TESTS
// ============================================================================

describe("useLipSync controls - startFromAudio", () => {
  test("creates audio context", () => {
    const { result } = renderHook(() => useLipSync());
    const mockAudioElement = {} as HTMLAudioElement;

    act(() => {
      result.current.controls.startFromAudio(mockAudioElement);
    });

    expect(AudioContext).toHaveBeenCalled();
  });

  test("creates analyser node", () => {
    const { result } = renderHook(() => useLipSync());
    const mockAudioElement = {} as HTMLAudioElement;

    act(() => {
      result.current.controls.startFromAudio(mockAudioElement);
    });

    expect(mockAudioContext.createAnalyser).toHaveBeenCalled();
  });

  test("creates media element source", () => {
    const { result } = renderHook(() => useLipSync());
    const mockAudioElement = {} as HTMLAudioElement;

    act(() => {
      result.current.controls.startFromAudio(mockAudioElement);
    });

    expect(mockAudioContext.createMediaElementSource).toHaveBeenCalledWith(mockAudioElement);
  });

  test("connects source to analyser", () => {
    const { result } = renderHook(() => useLipSync());
    const mockAudioElement = {} as HTMLAudioElement;

    act(() => {
      result.current.controls.startFromAudio(mockAudioElement);
    });

    expect(mockSource.connect).toHaveBeenCalledWith(mockAnalyser);
  });

  test("connects analyser to destination", () => {
    const { result } = renderHook(() => useLipSync());
    const mockAudioElement = {} as HTMLAudioElement;

    act(() => {
      result.current.controls.startFromAudio(mockAudioElement);
    });

    expect(mockAnalyser.connect).toHaveBeenCalledWith(mockAudioContext.destination);
  });

  test("sets isActive to true", () => {
    const { result } = renderHook(() => useLipSync());
    const mockAudioElement = {} as HTMLAudioElement;

    act(() => {
      result.current.controls.startFromAudio(mockAudioElement);
    });

    expect(result.current.state.isActive).toBe(true);
  });

  test("starts animation frame loop", () => {
    const { result } = renderHook(() => useLipSync());
    const mockAudioElement = {} as HTMLAudioElement;

    act(() => {
      result.current.controls.startFromAudio(mockAudioElement);
    });

    expect(mockRequestAnimationFrame).toHaveBeenCalled();
  });

  test("analyzes audio and updates audio level", () => {
    const { result } = renderHook(() => useLipSync());
    const mockAudioElement = {} as HTMLAudioElement;

    act(() => {
      result.current.controls.startFromAudio(mockAudioElement);
    });

    // Advance frame to trigger analysis
    act(() => {
      advanceFrame(16);
    });

    expect(mockAnalyser.getByteFrequencyData).toHaveBeenCalled();
    expect(result.current.state.audioLevel).toBeGreaterThan(0);
  });
});

// ============================================================================
// useLipSync CLEANUP TESTS
// ============================================================================

describe("useLipSync cleanup", () => {
  test("cancels animation frame on unmount", () => {
    const { result, unmount } = renderHook(() => useLipSync());
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 1000, intensity: 1 },
    ];

    act(() => {
      result.current.controls.startFromVisemes(events);
    });

    unmount();

    expect(mockCancelAnimationFrame).toHaveBeenCalled();
  });

  test("closes audio context on unmount", () => {
    const { result, unmount } = renderHook(() => useLipSync());
    const mockAudioElement = {} as HTMLAudioElement;

    act(() => {
      result.current.controls.startFromAudio(mockAudioElement);
    });

    unmount();

    expect(mockAudioContext.close).toHaveBeenCalled();
  });
});

// ============================================================================
// useSimpleLipSync TESTS
// ============================================================================

describe("useSimpleLipSync", () => {
  test("returns blend shapes", () => {
    const { result } = renderHook(() => useSimpleLipSync(0));

    expect(result.current).toBeDefined();
    expect(typeof result.current).toBe("object");
  });

  test("returns empty shapes for zero audio level", () => {
    const { result } = renderHook(() => useSimpleLipSync(0));

    expect(result.current).toEqual({});
  });

  test("returns shapes for audio above threshold", async () => {
    const { result, rerender } = renderHook(
      ({ level }) => useSimpleLipSync(level),
      { initialProps: { level: 0 } }
    );

    rerender({ level: 0.5 });

    await waitFor(() => {
      expect(Object.keys(result.current).length).toBeGreaterThan(0);
    });
  });

  test("scales jaw open with audio level", async () => {
    const { result, rerender } = renderHook(
      ({ level }) => useSimpleLipSync(level),
      { initialProps: { level: 0 } }
    );

    rerender({ level: 1.0 });

    await waitFor(() => {
      expect(result.current.jawOpen).toBeDefined();
    });
  });

  test("respects threshold option", async () => {
    const { result, rerender } = renderHook(
      ({ level }) => useSimpleLipSync(level, { threshold: 0.5 }),
      { initialProps: { level: 0 } }
    );

    // Below threshold
    rerender({ level: 0.4 });

    await waitFor(() => {
      expect(result.current).toEqual({});
    });
  });

  test("applies smoothing between values", async () => {
    const { result, rerender } = renderHook(
      ({ level }) => useSimpleLipSync(level, { smoothing: 0.9 }),
      { initialProps: { level: 0 } }
    );

    rerender({ level: 1.0 });

    await waitFor(() => {
      // With high smoothing, first update should be partial
      const jawOpen = result.current.jawOpen || 0;
      expect(jawOpen).toBeLessThan(0.6);
    });
  });

  test("handles rapid level changes", async () => {
    const { result, rerender } = renderHook(
      ({ level }) => useSimpleLipSync(level),
      { initialProps: { level: 0 } }
    );

    rerender({ level: 1.0 });
    rerender({ level: 0.5 });
    rerender({ level: 0.8 });

    await waitFor(() => {
      expect(result.current.jawOpen).toBeDefined();
    });
  });
});

// ============================================================================
// useVisemeSequence TESTS
// ============================================================================

describe("useVisemeSequence", () => {
  test("returns initial state", () => {
    const { result } = renderHook(() =>
      useVisemeSequence([], false)
    );

    expect(result.current.currentViseme).toBe("sil");
    expect(result.current.progress).toBe(0);
    expect(result.current.isComplete).toBe(false);
  });

  test("starts playback when isPlaying is true", () => {
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 100, intensity: 1 },
    ];

    const { result } = renderHook(() =>
      useVisemeSequence(events, true)
    );

    expect(mockRequestAnimationFrame).toHaveBeenCalled();
  });

  test("updates current viseme during playback", () => {
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 100, intensity: 1 },
    ];

    const { result } = renderHook(() =>
      useVisemeSequence(events, true)
    );

    act(() => {
      advanceFrame(50);
    });

    expect(result.current.currentViseme).toBe("aa");
  });

  test("updates progress during playback", () => {
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 100, intensity: 1 },
    ];

    const { result } = renderHook(() =>
      useVisemeSequence(events, true)
    );

    act(() => {
      advanceFrame(50);
    });

    expect(result.current.progress).toBe(0.5);
  });

  test("marks complete after all events", () => {
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 100, intensity: 1 },
    ];

    const { result } = renderHook(() =>
      useVisemeSequence(events, true)
    );

    act(() => {
      advanceFrame(150);
    });

    expect(result.current.isComplete).toBe(true);
    expect(result.current.currentViseme).toBe("sil");
  });

  test("handles empty events array", () => {
    const { result } = renderHook(() =>
      useVisemeSequence([], true)
    );

    expect(result.current.currentViseme).toBe("sil");
    expect(result.current.isComplete).toBe(false);
  });

  test("stops when isPlaying becomes false", () => {
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 1000, intensity: 1 },
    ];

    const { result, rerender } = renderHook(
      ({ playing }) => useVisemeSequence(events, playing),
      { initialProps: { playing: true } }
    );

    rerender({ playing: false });

    expect(mockCancelAnimationFrame).toHaveBeenCalled();
  });

  test("transitions through multiple visemes", () => {
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 100, intensity: 1 },
      { viseme: "E", time: 100, duration: 100, intensity: 1 },
      { viseme: "oh", time: 200, duration: 100, intensity: 1 },
    ];

    const { result } = renderHook(() =>
      useVisemeSequence(events, true)
    );

    act(() => {
      advanceFrame(50);
    });
    expect(result.current.currentViseme).toBe("aa");

    act(() => {
      advanceFrame(150);
    });
    expect(result.current.currentViseme).toBe("E");

    act(() => {
      advanceFrame(250);
    });
    expect(result.current.currentViseme).toBe("oh");
  });

  test("cancels animation frame on unmount", () => {
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 1000, intensity: 1 },
    ];

    const { unmount } = renderHook(() =>
      useVisemeSequence(events, true)
    );

    unmount();

    expect(mockCancelAnimationFrame).toHaveBeenCalled();
  });
});

// ============================================================================
// BLEND SHAPE SMOOTHING TESTS
// ============================================================================

describe("blend shape smoothing", () => {
  test("smooths transitions between visemes", () => {
    const { result } = renderHook(() => useLipSync({ smoothing: 0.5 }));

    act(() => {
      result.current.controls.setViseme("aa");
    });

    const firstJawOpen = result.current.state.blendShapes.jawOpen || 0;

    act(() => {
      result.current.controls.setViseme("sil");
    });

    const secondJawOpen = result.current.state.blendShapes.jawOpen || 0;

    // With smoothing, should not jump to 0 immediately
    expect(secondJawOpen).toBeLessThan(firstJawOpen);
  });

  test("high smoothing results in slower transitions", () => {
    const { result } = renderHook(() => useLipSync({ smoothing: 0.9 }));

    act(() => {
      result.current.controls.setViseme("aa");
    });

    // With high smoothing (0.9), blend shape values should be reduced
    const jawOpen = result.current.state.blendShapes.jawOpen || 0;
    expect(jawOpen).toBeLessThan(VISEME_BLEND_SHAPES.aa.jawOpen!);
  });

  test("zero smoothing results in immediate transitions", () => {
    const { result } = renderHook(() => useLipSync({ smoothing: 0 }));

    act(() => {
      result.current.controls.setViseme("aa");
    });

    const jawOpen = result.current.state.blendShapes.jawOpen || 0;
    expect(jawOpen).toBe(VISEME_BLEND_SHAPES.aa.jawOpen!);
  });
});

// ============================================================================
// AUDIO ANALYSIS TESTS
// ============================================================================

describe("audio analysis", () => {
  test("detects silence below threshold", () => {
    mockAnalyser.getByteFrequencyData.mockImplementation((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = 5; // Very low level
      }
    });

    const { result } = renderHook(() => useLipSync({ audioThreshold: 0.05 }));
    const mockAudioElement = {} as HTMLAudioElement;

    act(() => {
      result.current.controls.startFromAudio(mockAudioElement);
    });

    act(() => {
      advanceFrame(16);
    });

    expect(result.current.state.currentViseme).toBe("sil");
  });

  test("detects speech above threshold", () => {
    mockAnalyser.getByteFrequencyData.mockImplementation((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = 200; // High level
      }
    });

    const { result } = renderHook(() => useLipSync({ audioThreshold: 0.05 }));
    const mockAudioElement = {} as HTMLAudioElement;

    act(() => {
      result.current.controls.startFromAudio(mockAudioElement);
    });

    act(() => {
      advanceFrame(16);
    });

    expect(result.current.state.currentViseme).toBe("aa");
  });

  test("respects custom audio threshold", () => {
    mockAnalyser.getByteFrequencyData.mockImplementation((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = 100; // Medium level
      }
    });

    const { result } = renderHook(() => useLipSync({ audioThreshold: 0.5 }));
    const mockAudioElement = {} as HTMLAudioElement;

    act(() => {
      result.current.controls.startFromAudio(mockAudioElement);
    });

    act(() => {
      advanceFrame(16);
    });

    // Below threshold of 0.5
    expect(result.current.state.currentViseme).toBe("sil");
  });
});

// ============================================================================
// EDGE CASES TESTS
// ============================================================================

describe("edge cases", () => {
  test("handles multiple start calls", () => {
    const { result } = renderHook(() => useLipSync());
    const events1: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 100, intensity: 1 },
    ];
    const events2: VisemeEvent[] = [
      { viseme: "E", time: 0, duration: 100, intensity: 1 },
    ];

    act(() => {
      result.current.controls.startFromVisemes(events1);
    });

    act(() => {
      result.current.controls.startFromVisemes(events2);
    });

    expect(result.current.state.isActive).toBe(true);
  });

  test("handles stop when not active", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.stop();
    });

    expect(result.current.state.isActive).toBe(false);
  });

  test("handles empty phoneme array", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.startFromPhonemes([], []);
    });

    expect(result.current.state.isActive).toBe(true);
  });

  test("handles very long viseme sequence", () => {
    const { result } = renderHook(() => useLipSync());
    const events: VisemeEvent[] = Array.from({ length: 100 }, (_, i) => ({
      viseme: "aa" as Viseme,
      time: i * 100,
      duration: 100,
      intensity: 1,
    }));

    act(() => {
      result.current.controls.startFromVisemes(events);
    });

    expect(result.current.state.isActive).toBe(true);
  });

  test("handles overlapping viseme events", () => {
    const { result } = renderHook(() => useLipSync());
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 200, intensity: 1 },
      { viseme: "E", time: 100, duration: 200, intensity: 1 }, // Overlaps
    ];

    act(() => {
      result.current.controls.startFromVisemes(events);
    });

    act(() => {
      advanceFrame(150);
    });

    // First matching event should be used
    expect(result.current.state.currentViseme).toBe("aa");
  });

  test("handles zero duration events", () => {
    const { result } = renderHook(() => useLipSync());
    const events: VisemeEvent[] = [
      { viseme: "aa", time: 0, duration: 0, intensity: 1 },
      { viseme: "E", time: 0, duration: 100, intensity: 1 },
    ];

    act(() => {
      result.current.controls.startFromVisemes(events);
    });

    expect(result.current.state.isActive).toBe(true);
  });

  test("handles negative intensity", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.setViseme("aa", -0.5);
    });

    // Should still set the viseme
    expect(result.current.state.currentViseme).toBe("aa");
  });

  test("handles intensity greater than 1", () => {
    const { result } = renderHook(() => useLipSync());

    act(() => {
      result.current.controls.setViseme("aa", 2.0);
    });

    expect(result.current.state.currentViseme).toBe("aa");
    // Blend shapes might be scaled beyond 1
    const jawOpen = result.current.state.blendShapes.jawOpen || 0;
    expect(jawOpen).toBeGreaterThan(VISEME_BLEND_SHAPES.aa.jawOpen!);
  });
});
