/**
 * Tests for useSharedSilence hook
 * Sprint 551: Comfortable silence in conversation
 */

import { renderHook, act } from "@testing-library/react";
import { useSharedSilence, SilenceType, SharedSilenceState } from "../useSharedSilence";

// Mock RAF
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
  jest.clearAllTimers();
  rafCallback = null;
  rafId = 0;
});

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

      // Advance time
      act(() => {
        jest.advanceTimersByTime(3000);
        if (rafCallback) rafCallback(performance.now());
      });

      expect(result.current.isInSilence).toBe(false);
      expect(result.current.silenceType).toBe("none");
    });

    it("should not detect silence while thinking", () => {
      const { result } = renderHook(() =>
        useSharedSilence({ ...defaultProps, isThinking: true })
      );

      act(() => {
        jest.advanceTimersByTime(3000);
        if (rafCallback) rafCallback(performance.now());
      });

      expect(result.current.isInSilence).toBe(false);
    });

    it("should not detect silence when user is making sound", () => {
      const { result } = renderHook(() =>
        useSharedSilence({ ...defaultProps, userAudioLevel: 0.1 })
      );

      act(() => {
        jest.advanceTimersByTime(3000);
        if (rafCallback) rafCallback(performance.now());
      });

      expect(result.current.isInSilence).toBe(false);
    });

    it("should detect silence after threshold (2 seconds)", () => {
      const { result } = renderHook(() =>
        useSharedSilence(defaultProps)
      );

      // Trigger RAF multiple times to build up silence
      act(() => {
        jest.advanceTimersByTime(2500);
        for (let i = 0; i < 5; i++) {
          if (rafCallback) rafCallback(performance.now());
        }
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
        jest.advanceTimersByTime(3000);
        for (let i = 0; i < 5; i++) {
          if (rafCallback) rafCallback(performance.now());
        }
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
        jest.advanceTimersByTime(3000);
        for (let i = 0; i < 5; i++) {
          if (rafCallback) rafCallback(performance.now());
        }
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

      // Need 8+ seconds for comfortable silence
      act(() => {
        jest.advanceTimersByTime(9000);
        for (let i = 0; i < 10; i++) {
          if (rafCallback) rafCallback(performance.now());
        }
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
        jest.advanceTimersByTime(3000);
        for (let i = 0; i < 5; i++) {
          if (rafCallback) rafCallback(performance.now());
        }
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
        jest.advanceTimersByTime(9000);
        for (let i = 0; i < 10; i++) {
          if (rafCallback) rafCallback(performance.now());
        }
      });

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
        jest.advanceTimersByTime(3000);
        for (let i = 0; i < 5; i++) {
          if (rafCallback) rafCallback(performance.now());
        }
      });

      // Quality should include the 0.05 boost for long conversation
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
        jest.advanceTimersByTime(10000);
        for (let i = 0; i < 10; i++) {
          if (rafCallback) rafCallback(performance.now());
        }
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
        jest.advanceTimersByTime(3000);
        if (rafCallback) rafCallback(performance.now());
      });

      expect(result.current.sharedPresence.evaIsHere).toBe(true);
    });

    it("should indicate evaIsHere as false when thinking", () => {
      const { result } = renderHook(() =>
        useSharedSilence({ ...defaultProps, isThinking: true })
      );

      act(() => {
        jest.advanceTimersByTime(100);
        if (rafCallback) rafCallback(performance.now());
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
        jest.advanceTimersByTime(9000);
        for (let i = 0; i < 10; i++) {
          if (rafCallback) rafCallback(performance.now());
        }
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

      // Need 8+ seconds for intrinsic, 3+ for micro move
      act(() => {
        jest.advanceTimersByTime(9000);
        for (let i = 0; i < 10; i++) {
          if (rafCallback) rafCallback(performance.now());
        }
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
        jest.advanceTimersByTime(9000);
        for (let i = 0; i < 10; i++) {
          if (rafCallback) rafCallback(performance.now());
        }
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
        jest.advanceTimersByTime(15000);
        for (let i = 0; i < 15; i++) {
          if (rafCallback) rafCallback(performance.now());
        }
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
        jest.advanceTimersByTime(16000);
        for (let i = 0; i < 20; i++) {
          if (rafCallback) rafCallback(performance.now());
        }
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
        jest.advanceTimersByTime(9000);
        for (let i = 0; i < 10; i++) {
          if (rafCallback) rafCallback(performance.now());
        }
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
        jest.advanceTimersByTime(100);
        if (rafCallback) rafCallback(performance.now());
      });

      unmount();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });
  });
});
