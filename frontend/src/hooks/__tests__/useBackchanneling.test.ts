/**
 * Tests for useBackchanneling hook - Sprint 557
 *
 * Tests:
 * - Initialization and default state
 * - Trigger backchannel manually
 * - Recent events tracking
 * - Enable/disable behavior
 * - onBackchannel callback
 */

import { renderHook, act } from "@testing-library/react";
import {
  useBackchanneling,
  type BackchannelSound,
  type BackchannelEvent,
} from "../useBackchanneling";

// Default options for testing
const createDefaultOptions = () => ({
  isListening: false,
  userAudioLevel: 0,
  emotion: "neutral",
  enabled: true,
});

describe("useBackchanneling", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with null current event", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useBackchanneling(options));

      expect(result.current.currentEvent).toBeNull();
    });

    it("should initialize with empty recent events", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useBackchanneling(options));

      expect(result.current.recentEvents).toEqual([]);
    });

    it("should initialize with isPreparingBackchannel false", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useBackchanneling(options));

      expect(result.current.isPreparingBackchannel).toBe(false);
    });

    it("should provide triggerBackchannel function", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useBackchanneling(options));

      expect(typeof result.current.triggerBackchannel).toBe("function");
    });
  });

  // ============================================================================
  // Manual Trigger Tests
  // ============================================================================

  describe("triggerBackchannel", () => {
    it("should trigger a backchannel event", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useBackchanneling(options));

      act(() => {
        result.current.triggerBackchannel("mmh");
      });

      expect(result.current.currentEvent).not.toBeNull();
      expect(result.current.currentEvent?.sound).toBe("mmh");
      expect(result.current.currentEvent?.type).toBe("verbal");
    });

    it("should add event to recent events", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useBackchanneling(options));

      act(() => {
        result.current.triggerBackchannel("ah");
      });

      expect(result.current.recentEvents.length).toBe(1);
      expect(result.current.recentEvents[0].sound).toBe("ah");
    });

    it("should clear current event after duration", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useBackchanneling(options));

      act(() => {
        result.current.triggerBackchannel("mmh");
      });

      expect(result.current.currentEvent).not.toBeNull();

      // Fast-forward past duration
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current.currentEvent).toBeNull();
    });

    it("should support all backchannel sounds", () => {
      const options = createDefaultOptions();
      const sounds: BackchannelSound[] = [
        "mmh",
        "ah",
        "oui",
        "daccord",
        "hmm",
        "oh",
        "aah",
        "breath",
      ];

      const { result } = renderHook(() => useBackchanneling(options));

      sounds.forEach((sound) => {
        act(() => {
          result.current.triggerBackchannel(sound);
        });

        expect(result.current.currentEvent?.sound).toBe(sound);

        // Clear for next
        act(() => {
          jest.advanceTimersByTime(1000);
        });
      });
    });
  });

  // ============================================================================
  // Recent Events Tests
  // ============================================================================

  describe("recent events", () => {
    it("should keep only last 6 events", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useBackchanneling(options));

      // Trigger 8 events
      for (let i = 0; i < 8; i++) {
        act(() => {
          result.current.triggerBackchannel("mmh");
          jest.advanceTimersByTime(100);
        });
      }

      expect(result.current.recentEvents.length).toBeLessThanOrEqual(6);
    });

    it("should have unique IDs for each event", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useBackchanneling(options));

      act(() => {
        result.current.triggerBackchannel("mmh");
        jest.advanceTimersByTime(100);
      });

      act(() => {
        result.current.triggerBackchannel("ah");
        jest.advanceTimersByTime(100);
      });

      const ids = result.current.recentEvents.map((e) => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("should have timestamp on events", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useBackchanneling(options));

      act(() => {
        result.current.triggerBackchannel("hmm");
      });

      expect(result.current.recentEvents[0].timestamp).toBeGreaterThan(0);
    });

    it("should have intensity on events", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useBackchanneling(options));

      act(() => {
        result.current.triggerBackchannel("oui");
      });

      expect(result.current.recentEvents[0].intensity).toBeGreaterThan(0);
      expect(result.current.recentEvents[0].intensity).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // Callback Tests
  // ============================================================================

  describe("onBackchannel callback", () => {
    it("should call onBackchannel when event triggered", () => {
      const onBackchannel = jest.fn();
      const options = {
        ...createDefaultOptions(),
        onBackchannel,
      };

      const { result } = renderHook(() => useBackchanneling(options));

      act(() => {
        result.current.triggerBackchannel("ah");
      });

      expect(onBackchannel).toHaveBeenCalledTimes(1);
      expect(onBackchannel).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "verbal",
          sound: "ah",
        })
      );
    });

    it("should not call callback if not provided", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useBackchanneling(options));

      // Should not throw
      act(() => {
        result.current.triggerBackchannel("breath");
      });

      expect(result.current.currentEvent).not.toBeNull();
    });
  });

  // ============================================================================
  // Enable/Disable Tests
  // ============================================================================

  describe("enable/disable", () => {
    it("should still allow manual triggers when disabled", () => {
      const options = {
        ...createDefaultOptions(),
        enabled: false,
      };

      const { result } = renderHook(() => useBackchanneling(options));

      act(() => {
        result.current.triggerBackchannel("mmh");
      });

      // Manual triggers should still work
      expect(result.current.currentEvent).not.toBeNull();
    });

    it("should reset state when not listening", () => {
      const options = {
        ...createDefaultOptions(),
        isListening: true,
      };

      const { result, rerender } = renderHook(
        (props) => useBackchanneling(props),
        { initialProps: options }
      );

      // Stop listening
      rerender({ ...options, isListening: false });

      // State should be clean
      expect(result.current.isPreparingBackchannel).toBe(false);
    });
  });

  // ============================================================================
  // Event Structure Tests
  // ============================================================================

  describe("event structure", () => {
    it("should have correct event structure", () => {
      const options = createDefaultOptions();

      const { result } = renderHook(() => useBackchanneling(options));

      act(() => {
        result.current.triggerBackchannel("daccord");
      });

      const event = result.current.currentEvent;
      expect(event).toMatchObject({
        type: "verbal",
        sound: "daccord",
      });
      expect(event?.id).toMatch(/^bc-\d+-[a-z0-9]+$/);
      expect(typeof event?.timestamp).toBe("number");
      expect(typeof event?.intensity).toBe("number");
    });
  });
});
