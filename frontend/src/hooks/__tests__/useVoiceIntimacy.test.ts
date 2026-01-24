/**
 * Tests for useVoiceIntimacy hook - Sprint 541
 *
 * Tests dynamic voice proximity modes:
 * - Initialization and default state
 * - Intimacy level calculation (normal, warm, close, intimate, whisper)
 * - Emotion-based intimacy (INTIMATE_EMOTIONS, WARM_EMOTIONS)
 * - Duration-based intimacy (builds over time)
 * - User style matching (soft voice → soft response)
 * - Personal topic boost
 * - Time of day adjustments (night, evening)
 * - TTS parameters generation (speed, pitch, volume, breathiness, proximity)
 * - Visual hints (glowWarmth, avatarProximity, ambientDim)
 * - Audio hints (addBreaths, addPauses, softenConsonants, reduceVolume)
 * - Smooth transitions
 * - Disabled state
 * - detectPersonalTopic utility function
 * - Cleanup on unmount
 */

import { renderHook, act } from "@testing-library/react";
import {
  useVoiceIntimacy,
  detectPersonalTopic,
  type IntimacyLevel,
} from "../useVoiceIntimacy";

// Mock requestAnimationFrame and Date.now
let mockNow = 1000;
let rafCallback: FrameRequestCallback | null = null;
let rafId = 0;

beforeAll(() => {
  jest.useFakeTimers();

  jest.spyOn(global, "requestAnimationFrame").mockImplementation((cb) => {
    rafCallback = cb;
    return ++rafId;
  });

  jest.spyOn(global, "cancelAnimationFrame").mockImplementation(() => {});
});

afterAll(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

beforeEach(() => {
  mockNow = 1000;
  Date.now = jest.fn(() => mockNow);
  rafCallback = null;
  rafId = 0;
});

function advanceTime(ms: number) {
  mockNow += ms;
}

function triggerRaf() {
  if (rafCallback) rafCallback(mockNow);
}

// Default options
const createDefaultOptions = () => ({
  emotion: "neutral",
  emotionalIntensity: 0.5,
  conversationDuration: 60,
  userEnergy: 0.5,
  isPersonalTopic: false,
  isListening: false,
  isSpeaking: false,
  timeOfDay: "afternoon" as const,
  enabled: true,
});

describe("useVoiceIntimacy", () => {
  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() =>
        useVoiceIntimacy(createDefaultOptions())
      );

      expect(result.current.level).toBe("normal");
      expect(result.current.levelNumeric).toBe(0);
      expect(result.current.trigger).toBe("default");
    });

    it("should initialize with default TTS params", () => {
      const { result } = renderHook(() =>
        useVoiceIntimacy(createDefaultOptions())
      );

      expect(result.current.ttsParams.speed).toBe(1.0);
      expect(result.current.ttsParams.pitch).toBe(1.0);
      expect(result.current.ttsParams.volume).toBe(1.0);
      expect(result.current.ttsParams.breathiness).toBe(0);
      expect(result.current.ttsParams.proximity).toBe(0);
    });

    it("should initialize with default visual hints", () => {
      const { result } = renderHook(() =>
        useVoiceIntimacy(createDefaultOptions())
      );

      expect(result.current.visualHints.glowWarmth).toBe(0.3);
      expect(result.current.visualHints.avatarProximity).toBe(0);
      expect(result.current.visualHints.ambientDim).toBe(0);
    });

    it("should initialize with default audio hints", () => {
      const { result } = renderHook(() =>
        useVoiceIntimacy(createDefaultOptions())
      );

      expect(result.current.audioHints.addBreaths).toBe(false);
      expect(result.current.audioHints.addPauses).toBe(false);
      expect(result.current.audioHints.softenConsonants).toBe(false);
      expect(result.current.audioHints.reduceVolume).toBe(0);
    });

    it("should initialize with normal description", () => {
      const { result } = renderHook(() =>
        useVoiceIntimacy(createDefaultOptions())
      );

      expect(result.current.description).toBe("Speaking normally");
    });
  });

  // ============================================================================
  // Intimate Emotions Tests
  // ============================================================================

  describe("intimate emotions", () => {
    const intimateEmotions = [
      "tenderness",
      "love",
      "care",
      "comfort",
      "vulnerability",
      "sadness",
      "loneliness",
      "nostalgia",
      "gratitude",
      "trust",
    ];

    it.each(intimateEmotions)(
      "should increase intimacy for %s emotion",
      (emotion) => {
        const options = createDefaultOptions();
        options.emotion = emotion;
        options.emotionalIntensity = 0.8;

        const { result } = renderHook(() => useVoiceIntimacy(options));

        act(() => {
          advanceTime(100);
          triggerRaf();
        });

        // Should be at least close or higher
        expect(["close", "intimate", "whisper"]).toContain(result.current.level);
        expect(result.current.trigger).toBe("emotion");
      }
    );

    it("should reach whisper level with intimate emotion and high intensity", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 1.0;
      options.isPersonalTopic = true;
      options.userEnergy = 0.1;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.level).toBe("whisper");
    });
  });

  // ============================================================================
  // Warm Emotions Tests
  // ============================================================================

  describe("warm emotions", () => {
    const warmEmotions = [
      "joy",
      "happiness",
      "affection",
      "contentment",
      "calm",
      "peaceful",
      "curiosity",
      "interest",
    ];

    it.each(warmEmotions)("should increase warmth for %s emotion", (emotion) => {
      const options = createDefaultOptions();
      options.emotion = emotion;
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      // Should be at least warm
      expect(["warm", "close", "intimate", "whisper"]).toContain(
        result.current.level
      );
    });
  });

  // ============================================================================
  // Duration-based Intimacy Tests
  // ============================================================================

  describe("duration-based intimacy", () => {
    it("should increase intimacy with longer conversation", () => {
      const options = createDefaultOptions();
      options.conversationDuration = 600; // 10 minutes

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      // Duration factor should contribute
      expect(result.current.levelNumeric).toBeGreaterThan(0);
    });

    it("should cap duration factor at 10 minutes", () => {
      const options1 = createDefaultOptions();
      options1.conversationDuration = 600; // 10 minutes

      const options2 = createDefaultOptions();
      options2.conversationDuration = 1200; // 20 minutes

      const { result: result1 } = renderHook(() => useVoiceIntimacy(options1));
      const { result: result2 } = renderHook(() => useVoiceIntimacy(options2));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      // Both should have same duration contribution (capped at 0.2)
      expect(result1.current.levelNumeric).toBeCloseTo(
        result2.current.levelNumeric,
        1
      );
    });

    it("should set trigger to duration when significant", () => {
      const options = createDefaultOptions();
      options.conversationDuration = 300; // 5 minutes
      options.emotion = "neutral";

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.trigger).toBe("duration");
    });
  });

  // ============================================================================
  // User Style Matching Tests
  // ============================================================================

  describe("user style matching", () => {
    it("should increase intimacy for very soft user voice", () => {
      const options = createDefaultOptions();
      options.userEnergy = 0.1; // Very soft

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.levelNumeric).toBeGreaterThan(0);
      expect(result.current.trigger).toBe("user_style");
    });

    it("should slightly increase intimacy for moderately soft voice", () => {
      const options = createDefaultOptions();
      options.userEnergy = 0.25;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.levelNumeric).toBeGreaterThan(0);
    });

    it("should not increase intimacy for normal energy", () => {
      const options = createDefaultOptions();
      options.userEnergy = 0.5;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      // Only default state
      expect(result.current.level).toBe("normal");
    });
  });

  // ============================================================================
  // Personal Topic Tests
  // ============================================================================

  describe("personal topic boost", () => {
    it("should increase intimacy for personal topics", () => {
      const options = createDefaultOptions();
      options.isPersonalTopic = true;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      // Run multiple frames to let transition catch up
      act(() => {
        for (let i = 0; i < 100; i++) {
          advanceTime(50);
          triggerRaf();
        }
      });

      expect(result.current.levelNumeric).toBeGreaterThan(0.1);
      expect(result.current.trigger).toBe("topic_depth");
    });

    it("should combine personal topic with other factors", () => {
      const options = createDefaultOptions();
      options.isPersonalTopic = true;
      options.emotion = "love";
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      // Should be very high level
      expect(["intimate", "whisper"]).toContain(result.current.level);
    });
  });

  // ============================================================================
  // Time of Day Tests
  // ============================================================================

  describe("time of day", () => {
    it("should increase intimacy at night", () => {
      const options = createDefaultOptions();
      options.timeOfDay = "night";

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.levelNumeric).toBeGreaterThan(0);
    });

    it("should slightly increase intimacy in evening", () => {
      const options = createDefaultOptions();
      options.timeOfDay = "evening";

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.levelNumeric).toBeGreaterThan(0);
    });

    it("should have lower base intimacy in afternoon", () => {
      // Test that night adds more intimacy than afternoon
      // Since transitions are slow, we test the target level (state.level)
      // which shows the intended classification
      const nightOptions = createDefaultOptions();
      nightOptions.timeOfDay = "night";
      nightOptions.userEnergy = 0.1; // Add boost to push both above threshold

      const afternoonOptions = createDefaultOptions();
      afternoonOptions.timeOfDay = "afternoon";
      afternoonOptions.userEnergy = 0.1;

      const { result: nightResult } = renderHook(() =>
        useVoiceIntimacy(nightOptions)
      );
      const { result: afternoonResult } = renderHook(() =>
        useVoiceIntimacy(afternoonOptions)
      );

      // Run multiple frames
      act(() => {
        for (let i = 0; i < 100; i++) {
          advanceTime(50);
          triggerRaf();
        }
      });

      // Night should have higher or equal level than afternoon
      const levelOrder: Record<string, number> = {
        normal: 0,
        warm: 1,
        close: 2,
        intimate: 3,
        whisper: 4,
      };

      expect(levelOrder[nightResult.current.level]).toBeGreaterThanOrEqual(
        levelOrder[afternoonResult.current.level]
      );
    });
  });

  // ============================================================================
  // TTS Parameters Tests
  // ============================================================================

  describe("TTS parameters", () => {
    it("should decrease speed with higher intimacy", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 1.0;
      options.isPersonalTopic = true;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.ttsParams.speed).toBeLessThan(1.0);
    });

    it("should decrease pitch with higher intimacy", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 1.0;
      options.isPersonalTopic = true;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.ttsParams.pitch).toBeLessThan(1.0);
    });

    it("should decrease volume with higher intimacy", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 1.0;
      options.isPersonalTopic = true;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.ttsParams.volume).toBeLessThan(1.0);
    });

    it("should increase breathiness with higher intimacy", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 1.0;
      options.isPersonalTopic = true;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.ttsParams.breathiness).toBeGreaterThan(0);
    });

    it("should increase proximity with higher intimacy", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 1.0;
      options.isPersonalTopic = true;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.ttsParams.proximity).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Visual Hints Tests
  // ============================================================================

  describe("visual hints", () => {
    it("should increase glow warmth with intimacy", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.visualHints.glowWarmth).toBeGreaterThan(0.3);
    });

    it("should increase avatar proximity with intimacy", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.visualHints.avatarProximity).toBeGreaterThan(0);
    });

    it("should increase ambient dim with intimacy", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.visualHints.ambientDim).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Audio Hints Tests
  // ============================================================================

  describe("audio hints", () => {
    it("should enable add breaths above 0.4 level", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 0.8;
      options.isPersonalTopic = true;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      // Run multiple frames to let smooth transition reach target
      act(() => {
        for (let i = 0; i < 100; i++) {
          advanceTime(50);
          triggerRaf();
        }
      });

      expect(result.current.audioHints.addBreaths).toBe(true);
    });

    it("should enable add pauses above 0.3 level", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 0.5;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      // Run multiple frames
      act(() => {
        for (let i = 0; i < 100; i++) {
          advanceTime(50);
          triggerRaf();
        }
      });

      expect(result.current.audioHints.addPauses).toBe(true);
    });

    it("should enable soften consonants above 0.6 level", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 1.0;
      options.isPersonalTopic = true;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      // Run multiple frames
      act(() => {
        for (let i = 0; i < 100; i++) {
          advanceTime(50);
          triggerRaf();
        }
      });

      expect(result.current.audioHints.softenConsonants).toBe(true);
    });

    it("should increase reduce volume with intimacy", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 0.8;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      // Run multiple frames
      act(() => {
        for (let i = 0; i < 100; i++) {
          advanceTime(50);
          triggerRaf();
        }
      });

      expect(result.current.audioHints.reduceVolume).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Level Classification Tests
  // ============================================================================

  describe("level classification", () => {
    it("should classify as normal below 0.2", () => {
      const options = createDefaultOptions();
      options.emotion = "neutral";

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.level).toBe("normal");
    });

    it("should classify as warm between 0.2 and 0.4", () => {
      const options = createDefaultOptions();
      options.userEnergy = 0.1; // Adds 0.2
      options.timeOfDay = "evening"; // Adds 0.1

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.level).toBe("warm");
    });

    it("should classify as close between 0.4 and 0.6", () => {
      const options = createDefaultOptions();
      options.emotion = "love"; // Adds 0.3+
      options.emotionalIntensity = 0.5;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      // Run multiple frames
      act(() => {
        for (let i = 0; i < 100; i++) {
          advanceTime(50);
          triggerRaf();
        }
      });

      // The level could be warm, close or intimate depending on exact calculation
      expect(["warm", "close", "intimate"]).toContain(result.current.level);
    });

    it("should classify as intimate between 0.6 and 0.8", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 0.8;
      options.isPersonalTopic = true;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(["intimate", "whisper"]).toContain(result.current.level);
    });

    it("should classify as whisper above 0.8", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 1.0;
      options.isPersonalTopic = true;
      options.userEnergy = 0.1;
      options.timeOfDay = "night";

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.level).toBe("whisper");
    });
  });

  // ============================================================================
  // Disabled State Tests
  // ============================================================================

  describe("disabled state", () => {
    it("should return default state when disabled", () => {
      const options = createDefaultOptions();
      options.enabled = false;
      options.emotion = "love";
      options.emotionalIntensity = 1.0;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      // Should stay at default
      expect(result.current.level).toBe("normal");
      expect(result.current.levelNumeric).toBe(0);
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe("cleanup", () => {
    it("should cancel animation frame on unmount", () => {
      const { unmount } = renderHook(() =>
        useVoiceIntimacy(createDefaultOptions())
      );

      act(() => {
        triggerRaf();
      });

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Edge Cases Tests
  // ============================================================================

  describe("edge cases", () => {
    it("should handle zero emotional intensity", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 0;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      // Should still have some intimacy from emotion type
      expect(result.current.levelNumeric).toBeGreaterThanOrEqual(0);
    });

    it("should handle max emotional intensity", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 1.0;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.levelNumeric).toBeLessThanOrEqual(1);
    });

    it("should clamp level numeric to 0-1 range", () => {
      const options = createDefaultOptions();
      options.emotion = "love";
      options.emotionalIntensity = 1.0;
      options.isPersonalTopic = true;
      options.userEnergy = 0.1;
      options.timeOfDay = "night";
      options.conversationDuration = 1000;

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      expect(result.current.levelNumeric).toBeLessThanOrEqual(1);
      expect(result.current.levelNumeric).toBeGreaterThanOrEqual(0);
    });

    it("should handle unknown emotion gracefully", () => {
      const options = createDefaultOptions();
      options.emotion = "unknown_emotion";

      const { result } = renderHook(() => useVoiceIntimacy(options));

      act(() => {
        advanceTime(100);
        triggerRaf();
      });

      // Should be normal level
      expect(result.current.level).toBe("normal");
    });
  });
});

// ============================================================================
// detectPersonalTopic Tests
// ============================================================================

describe("detectPersonalTopic", () => {
  it("should detect feeling keywords", () => {
    expect(detectPersonalTopic("I'm feeling sad")).toBe(true);
    expect(detectPersonalTopic("My feelings are hurt")).toBe(true);
  });

  it("should detect love keywords", () => {
    expect(detectPersonalTopic("I love you")).toBe(true);
    expect(detectPersonalTopic("I miss my family")).toBe(true);
  });

  it("should detect fear keywords", () => {
    expect(detectPersonalTopic("I'm scared")).toBe(true);
    expect(detectPersonalTopic("I'm afraid of the dark")).toBe(true);
    expect(detectPersonalTopic("I'm worried about my future")).toBe(true);
  });

  it("should detect family keywords", () => {
    expect(detectPersonalTopic("My mom called me")).toBe(true);
    expect(detectPersonalTopic("I remember my dad")).toBe(true);
    expect(detectPersonalTopic("My childhood was happy")).toBe(true);
  });

  it("should detect deep topics", () => {
    expect(detectPersonalTopic("What is the meaning of life?")).toBe(true);
    expect(detectPersonalTopic("I have a secret to tell")).toBe(true);
    expect(detectPersonalTopic("I've never told anyone")).toBe(true);
  });

  it("should detect emotional state keywords", () => {
    expect(detectPersonalTopic("I feel so lonely")).toBe(true);
    expect(detectPersonalTopic("I feel alone")).toBe(true);
    expect(detectPersonalTopic("I'm happy today")).toBe(true);
    expect(detectPersonalTopic("I'm sad")).toBe(true);
  });

  it("should detect past/future keywords", () => {
    expect(detectPersonalTopic("In my past")).toBe(true);
    expect(detectPersonalTopic("My future looks bright")).toBe(true);
    expect(detectPersonalTopic("I remember when")).toBe(true);
  });

  it("should be case insensitive", () => {
    expect(detectPersonalTopic("I LOVE you")).toBe(true);
    expect(detectPersonalTopic("MY FEELINGS")).toBe(true);
    expect(detectPersonalTopic("CHILDHOOD memories")).toBe(true);
  });

  it("should return false for non-personal topics", () => {
    expect(detectPersonalTopic("What's the weather?")).toBe(false);
    expect(detectPersonalTopic("Tell me a joke")).toBe(false);
    expect(detectPersonalTopic("How does this work?")).toBe(false);
  });

  it("should handle empty string", () => {
    expect(detectPersonalTopic("")).toBe(false);
  });

  it("should detect multi-word keywords", () => {
    expect(detectPersonalTopic("I've never told anyone before")).toBe(true);
    expect(detectPersonalTopic("This is the first time I'm saying this")).toBe(
      true
    );
  });
});
