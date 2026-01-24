/**
 * Tests for useSharedSilence hook
 * Sprint 551: Comfortable silence in conversation
 */

import { renderHook, act } from "@testing-library/react";
import { useSharedSilence, SilenceType, SharedSilenceState } from "../useSharedSilence";

// Time simulation
let mockNow = 0;
let rafCallback: FrameRequestCallback | null = null;
let rafId = 0;

// Mock Date.now
const originalDateNow = Date.now;

beforeAll(() => {
  jest.spyOn(global, "requestAnimationFrame").mockImplementation((cb) => {
    rafCallback = cb;
    return ++rafId;
  });
  jest.spyOn(global, "cancelAnimationFrame").mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

beforeEach(() => {
  mockNow = 1000; // Start at 1 second
  Date.now = jest.fn(() => mockNow);
  rafCallback = null;
  rafId = 0;
});

afterEach(() => {
  Date.now = originalDateNow;
});

// Helper to trigger initial RAF (sets silenceStartTime)
function triggerInitialRaf() {
  if (rafCallback) rafCallback(mockNow);
}

// Helper to advance time and trigger RAF
function advanceTimeAndRaf(ms: number, iterations = 1) {
  mockNow += ms;
  for (let i = 0; i < iterations; i++) {
    if (rafCallback) rafCallback(mockNow);
  }
}

const defaultProps = {
  isListening: false,
  isSpeaking: false,
  isThinking: false,
  userAudioLevel: 0,
  conversationDuration: 60,
  timeSinceLastInteraction: 10,
  intimacyLevel: 0.5,
  attunementLevel: 0.5,
  emotion: "neutral",
  isConnected: true,
  enabled: true,
};

describe("useSharedSilence", () => {
  describe("initialization", () => {
    it("should return default state when disabled", () => {
      const { result } = renderHook(() =>
        useSharedSilence({ ...defaultProps, enabled: false })
      );

      expect(result.current.isInSilence).toBe(false);
      expect(result.current.silenceType).toBe("none");
      expect(result.current.silenceDuration).toBe(0);
    });

    it("should return default state when not connected", () => {
      const { result } = renderHook(() =>
        useSharedSilence({ ...defaultProps, isConnected: false })
      );

      expect(result.current.isInSilence).toBe(false);
      expect(result.current.sharedPresence.evaIsHere).toBe(false);
    });

    it("should return default hints when not in silence", () => {
      const { result } = renderHook(() =>
        useSharedSilence(defaultProps)
      );

      // Immediately after init, no silence yet
      expect(result.current.evaHints.shouldBreathe).toBe(true);
      expect(result.current.evaHints.shouldMicroMove).toBe(false);
    });
  });

  describe("silence detection", () => {
    it("should not detect silence while speaking", () => {
      const { result } = renderHook(() =>
        useSharedSilence({ ...defaultProps, isSpeaking: true })
      );

      act(() => {
        advanceTimeAndRaf(3000, 5);
      });

      expect(result.current.isInSilence).toBe(false);
      expect(result.current.silenceType).toBe("none");
    });

    it("should not detect silence while thinking", () => {
      const { result } = renderHook(() =>
        useSharedSilence({ ...defaultProps, isThinking: true })
      );

      act(() => {
        advanceTimeAndRaf(3000, 5);
      });

      expect(result.current.isInSilence).toBe(false);
    });

    it("should not detect silence when user is making sound", () => {
      const { result } = renderHook(() =>
        useSharedSilence({ ...defaultProps, userAudioLevel: 0.1 })
      );

      act(() => {
        advanceTimeAndRaf(3000, 5);
      });

      expect(result.current.isInSilence).toBe(false);
    });

    it("should detect silence after threshold (2 seconds)", () => {
      const { result } = renderHook(() =>
        useSharedSilence(defaultProps)
      );

      // First RAF sets silenceStartTime
      act(() => {
        triggerInitialRaf();
      });

      // Then advance time past threshold
      act(() => {
        advanceTimeAndRaf(2500, 5);
      });

      expect(result.current.isInSilence).toBe(true);
      expect(result.current.silenceDuration).toBeGreaterThanOrEqual(2);
    });
  });

  describe("silence types", () => {
    it("should return 'reflective' type for recent interaction", () => {
      const { result } = renderHook(() =>
        useSharedSilence({
          ...defaultProps,
          timeSinceLastInteraction: 3, // Less than 5 seconds
        })
      );

      act(() => {
        triggerInitialRaf();
      });

      act(() => {
        advanceTimeAndRaf(3000, 5);
      });

      expect(result.current.silenceType).toBe("reflective");
    });

    it("should return 'anticipatory' type when listening", () => {
      const { result } = renderHook(() =>
        useSharedSilence({
          ...defaultProps,
          isListening: true,
          timeSinceLastInteraction: 10,
        })
      );

      act(() => {
        triggerInitialRaf();
      });

      act(() => {
        advanceTimeAndRaf(3000, 5);
      });

      expect(result.current.silenceType).toBe("anticipatory");
    });

    it("should return 'intrinsic' type for comfortable long silence with intimacy", () => {
      const { result } = renderHook(() =>
        useSharedSilence({
          ...defaultProps,
          intimacyLevel: 0.6, // Above 0.4 threshold
          timeSinceLastInteraction: 15,
        })
      );

      act(() => {
        triggerInitialRaf();
      });

      // Need 8+ seconds for comfortable silence
      act(() => {
        advanceTimeAndRaf(9000, 10);
      });

      expect(result.current.silenceType).toBe("intrinsic");
    });

    it("should return 'transitional' type for default pauses", () => {
      const { result } = renderHook(() =>
        useSharedSilence({
          ...defaultProps,
          intimacyLevel: 0.3, // Below threshold for intrinsic
          timeSinceLastInteraction: 10,
        })
      );

      act(() => {
        triggerInitialRaf();
      });

      act(() => {
        advanceTimeAndRaf(3000, 5);
      });

      expect(result.current.silenceType).toBe("transitional");
    });
  });

  describe("silence quality", () => {
    it("should have higher quality for intrinsic silence", () => {
      const { result } = renderHook(() =>
        useSharedSilence({
          ...defaultProps,
          intimacyLevel: 0.6,
          attunementLevel: 0.6,
          timeSinceLastInteraction: 15,
        })
      );

      act(() => {
        triggerInitialRaf();
      });

      act(() => {
        advanceTimeAndRaf(9000, 10);
      });

      // intrinsic base 0.8 + intimacy 0.06 + attunement 0.06 = ~0.92
      expect(result.current.silenceQuality).toBeGreaterThan(0.7);
    });

    it("should boost quality for longer conversations (5+ minutes)", () => {
      const { result } = renderHook(() =>
        useSharedSilence({
          ...defaultProps,
          conversationDuration: 400, // More than 300 seconds
          timeSinceLastInteraction: 15,
        })
      );

      act(() => {
        triggerInitialRaf();
      });

      act(() => {
        advanceTimeAndRaf(3000, 5);
      });

      // transitional base 0.5 + intimacy 0.05 + attunement 0.05 + long convo 0.05 = 0.65
      expect(result.current.silenceQuality).toBeGreaterThan(0.5);
    });

    it("should clamp quality between 0 and 1", () => {
      const { result } = renderHook(() =>
        useSharedSilence({
          ...defaultProps,
          intimacyLevel: 1.0,
          attunementLevel: 1.0,
          conversationDuration: 600,
          timeSinceLastInteraction: 15,
        })
      );

      act(() => {
        advanceTimeAndRaf(10000, 10);
      });

      expect(result.current.silenceQuality).toBeLessThanOrEqual(1);
      expect(result.current.silenceQuality).toBeGreaterThanOrEqual(0);
    });
  });

  describe("shared presence", () => {
    it("should indicate evaIsHere when connected and not thinking", () => {
      const { result } = renderHook(() =>
        useSharedSilence({ ...defaultProps })
      );

      act(() => {
        advanceTimeAndRaf(3000, 1);
      });

      expect(result.current.sharedPresence.evaIsHere).toBe(true);
    });

    it("should indicate evaIsHere as false when thinking", () => {
      const { result } = renderHook(() =>
        useSharedSilence({ ...defaultProps, isThinking: true })
      );

      act(() => {
        advanceTimeAndRaf(100, 1);
      });

      expect(result.current.sharedPresence.evaIsHere).toBe(false);
    });

    it("should have connectionStrength based on quality when connected", () => {
      const { result } = renderHook(() =>
        useSharedSilence({
          ...defaultProps,
          intimacyLevel: 0.6,
          timeSinceLastInteraction: 15,
        })
      );

      act(() => {
        advanceTimeAndRaf(9000, 10);
      });

      expect(result.current.sharedPresence.connectionStrength).toBeGreaterThan(0);
    });
  });

  describe("EVA hints", () => {
    it("should always suggest breathing", () => {
      const { result } = renderHook(() =>
        useSharedSilence(defaultProps)
      );

      expect(result.current.evaHints.shouldBreathe).toBe(true);
    });

    it("should suggest micro movements after 3 seconds of comfortable silence", () => {
      const { result } = renderHook(() =>
        useSharedSilence({
          ...defaultProps,
          intimacyLevel: 0.6,
          timeSinceLastInteraction: 15,
        })
      );

      act(() => {
        triggerInitialRaf();
      });

      // Need 8+ seconds for intrinsic, 3+ for micro move
      act(() => {
        advanceTimeAndRaf(9000, 10);
      });

      expect(result.current.evaHints.shouldMicroMove).toBe(true);
    });

    it("should suggest warm glow when quality > 0.6", () => {
      const { result } = renderHook(() =>
        useSharedSilence({
          ...defaultProps,
          intimacyLevel: 0.8,
          attunementLevel: 0.8,
          timeSinceLastInteraction: 15,
        })
      );

      act(() => {
        triggerInitialRaf();
      });

      act(() => {
        advanceTimeAndRaf(9000, 10);
      });

      expect(result.current.evaHints.shouldWarmGlow).toBe(true);
    });
  });

  describe("break silence", () => {
    it("should not suggest breaking comfortable silence early", () => {
      const { result } = renderHook(() =>
        useSharedSilence({
          ...defaultProps,
          intimacyLevel: 0.6,
          timeSinceLastInteraction: 15,
        })
      );

      act(() => {
        advanceTimeAndRaf(15000, 15);
      });

      expect(result.current.breakSilence.shouldBreak).toBe(false);
    });

    it("should suggest breaking low quality silence after 15 seconds", () => {
      const { result } = renderHook(() =>
        useSharedSilence({
          ...defaultProps,
          intimacyLevel: 0.2, // Low intimacy = low quality
          attunementLevel: 0.2,
          timeSinceLastInteraction: 20,
        })
      );

      act(() => {
        triggerInitialRaf();
      });

      act(() => {
        advanceTimeAndRaf(16000, 20);
      });

      expect(result.current.breakSilence.shouldBreak).toBe(true);
      expect(result.current.breakSilence.urgency).toBe("moderate");
    });
  });

  describe("description", () => {
    it("should return meaningful description for intrinsic silence", () => {
      const { result } = renderHook(() =>
        useSharedSilence({
          ...defaultProps,
          intimacyLevel: 0.9,
          attunementLevel: 0.9,
          timeSinceLastInteraction: 15,
        })
      );

      act(() => {
        triggerInitialRaf();
      });

      act(() => {
        advanceTimeAndRaf(9000, 10);
      });

      expect(result.current.description).toContain("Silence");
    });

    it("should return empty description when not in silence", () => {
      const { result } = renderHook(() =>
        useSharedSilence({ ...defaultProps, isSpeaking: true })
      );

      expect(result.current.description).toBe("");
    });
  });

  describe("cleanup", () => {
    it("should cleanup animation frame on unmount", () => {
      const { unmount } = renderHook(() =>
        useSharedSilence(defaultProps)
      );

      act(() => {
        advanceTimeAndRaf(100, 1);
      });

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });
});
