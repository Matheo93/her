/**
 * Tests for usePresenceSound hook - Sprint 543
 *
 * Tests ambient presence soundscape for EVA:
 * - Hook initialization and return values
 * - Event listener registration for autoplay
 * - Start/stop function behavior
 * - State changes response
 * - Cleanup on unmount
 * - Error handling
 *
 * Note: Web Audio API is mocked in jest.setup.ts
 */

import { renderHook, act } from "@testing-library/react";
import { usePresenceSound } from "../usePresenceSound";

// Default options
const createDefaultOptions = () => ({
  enabled: true,
  volume: 0.03,
  isConnected: true,
  isListening: false,
  isSpeaking: false,
});

describe("usePresenceSound", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // Hook Return Value Tests
  // ============================================================================

  describe("hook return values", () => {
    it("should return start function", () => {
      const { result } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      expect(typeof result.current.start).toBe("function");
    });

    it("should return stop function", () => {
      const { result } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      expect(typeof result.current.stop).toBe("function");
    });

    it("should return isInitialized boolean", () => {
      const { result } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      expect(typeof result.current.isInitialized).toBe("boolean");
    });

    it("should have isInitialized as false before start", () => {
      const { result } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      expect(result.current.isInitialized).toBe(false);
    });
  });

  // ============================================================================
  // Event Listener Tests
  // ============================================================================

  describe("event listener registration", () => {
    it("should register click event listener when enabled", () => {
      const addEventListenerSpy = jest.spyOn(document, "addEventListener");

      renderHook(() => usePresenceSound(createDefaultOptions()));

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "click",
        expect.any(Function)
      );

      addEventListenerSpy.mockRestore();
    });

    it("should register touchstart event listener when enabled", () => {
      const addEventListenerSpy = jest.spyOn(document, "addEventListener");

      renderHook(() => usePresenceSound(createDefaultOptions()));

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "touchstart",
        expect.any(Function)
      );

      addEventListenerSpy.mockRestore();
    });

    it("should not register click listener when disabled", () => {
      const addEventListenerSpy = jest.spyOn(document, "addEventListener");

      const options = createDefaultOptions();
      options.enabled = false;

      renderHook(() => usePresenceSound(options));

      const clickCalls = addEventListenerSpy.mock.calls.filter(
        (call) => call[0] === "click"
      );
      expect(clickCalls.length).toBe(0);

      addEventListenerSpy.mockRestore();
    });

    it("should not register touchstart listener when disabled", () => {
      const addEventListenerSpy = jest.spyOn(document, "addEventListener");

      const options = createDefaultOptions();
      options.enabled = false;

      renderHook(() => usePresenceSound(options));

      const touchCalls = addEventListenerSpy.mock.calls.filter(
        (call) => call[0] === "touchstart"
      );
      expect(touchCalls.length).toBe(0);

      addEventListenerSpy.mockRestore();
    });
  });

  // ============================================================================
  // Start Function Tests
  // ============================================================================

  describe("start function", () => {
    it("should be callable without throwing", () => {
      const { result } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      expect(() => {
        act(() => {
          result.current.start();
        });
      }).not.toThrow();
    });

    it("should be callable multiple times without throwing", () => {
      const { result } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      expect(() => {
        act(() => {
          result.current.start();
          result.current.start();
          result.current.start();
        });
      }).not.toThrow();
    });
  });

  // ============================================================================
  // Stop Function Tests
  // ============================================================================

  describe("stop function", () => {
    it("should be callable without throwing when not initialized", () => {
      const { result } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      expect(() => {
        act(() => {
          result.current.stop();
        });
      }).not.toThrow();
    });

    it("should be callable after start without throwing", () => {
      const { result } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      expect(() => {
        act(() => {
          result.current.start();
          result.current.stop();
        });
      }).not.toThrow();
    });

    it("should be callable multiple times without throwing", () => {
      const { result } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      expect(() => {
        act(() => {
          result.current.start();
          result.current.stop();
          result.current.stop();
          result.current.stop();
        });
      }).not.toThrow();
    });
  });

  // ============================================================================
  // State Changes Tests
  // ============================================================================

  describe("state changes", () => {
    it("should handle isConnected change to false", () => {
      const { rerender } = renderHook(
        (props) => usePresenceSound(props),
        { initialProps: createDefaultOptions() }
      );

      expect(() => {
        rerender({ ...createDefaultOptions(), isConnected: false });
      }).not.toThrow();
    });

    it("should handle isConnected change to true", () => {
      const { rerender } = renderHook(
        (props) => usePresenceSound(props),
        { initialProps: { ...createDefaultOptions(), isConnected: false } }
      );

      expect(() => {
        rerender({ ...createDefaultOptions(), isConnected: true });
      }).not.toThrow();
    });

    it("should handle isListening change to true", () => {
      const { rerender } = renderHook(
        (props) => usePresenceSound(props),
        { initialProps: createDefaultOptions() }
      );

      expect(() => {
        rerender({ ...createDefaultOptions(), isListening: true });
      }).not.toThrow();
    });

    it("should handle isListening change to false", () => {
      const { rerender } = renderHook(
        (props) => usePresenceSound(props),
        { initialProps: { ...createDefaultOptions(), isListening: true } }
      );

      expect(() => {
        rerender({ ...createDefaultOptions(), isListening: false });
      }).not.toThrow();
    });

    it("should handle isSpeaking change to true", () => {
      const { rerender } = renderHook(
        (props) => usePresenceSound(props),
        { initialProps: createDefaultOptions() }
      );

      expect(() => {
        rerender({ ...createDefaultOptions(), isSpeaking: true });
      }).not.toThrow();
    });

    it("should handle isSpeaking change to false", () => {
      const { rerender } = renderHook(
        (props) => usePresenceSound(props),
        { initialProps: { ...createDefaultOptions(), isSpeaking: true } }
      );

      expect(() => {
        rerender({ ...createDefaultOptions(), isSpeaking: false });
      }).not.toThrow();
    });

    it("should handle transition from listening to speaking", () => {
      const { rerender } = renderHook(
        (props) => usePresenceSound(props),
        { initialProps: { ...createDefaultOptions(), isListening: true } }
      );

      expect(() => {
        rerender({ ...createDefaultOptions(), isListening: false, isSpeaking: true });
      }).not.toThrow();
    });

    it("should handle transition from speaking to listening", () => {
      const { rerender } = renderHook(
        (props) => usePresenceSound(props),
        { initialProps: { ...createDefaultOptions(), isSpeaking: true } }
      );

      expect(() => {
        rerender({ ...createDefaultOptions(), isSpeaking: false, isListening: true });
      }).not.toThrow();
    });
  });

  // ============================================================================
  // Volume Options Tests
  // ============================================================================

  describe("volume options", () => {
    it("should accept default volume of 0.03", () => {
      expect(() => {
        renderHook(() =>
          usePresenceSound({ ...createDefaultOptions(), volume: 0.03 })
        );
      }).not.toThrow();
    });

    it("should accept zero volume", () => {
      expect(() => {
        renderHook(() =>
          usePresenceSound({ ...createDefaultOptions(), volume: 0 })
        );
      }).not.toThrow();
    });

    it("should accept max volume of 1", () => {
      expect(() => {
        renderHook(() =>
          usePresenceSound({ ...createDefaultOptions(), volume: 1 })
        );
      }).not.toThrow();
    });

    it("should accept custom volume of 0.05", () => {
      expect(() => {
        renderHook(() =>
          usePresenceSound({ ...createDefaultOptions(), volume: 0.05 })
        );
      }).not.toThrow();
    });

    it("should accept custom volume of 0.1", () => {
      expect(() => {
        renderHook(() =>
          usePresenceSound({ ...createDefaultOptions(), volume: 0.1 })
        );
      }).not.toThrow();
    });
  });

  // ============================================================================
  // Enabled Option Tests
  // ============================================================================

  describe("enabled option", () => {
    it("should work when enabled is true", () => {
      expect(() => {
        renderHook(() =>
          usePresenceSound({ ...createDefaultOptions(), enabled: true })
        );
      }).not.toThrow();
    });

    it("should work when enabled is false", () => {
      expect(() => {
        renderHook(() =>
          usePresenceSound({ ...createDefaultOptions(), enabled: false })
        );
      }).not.toThrow();
    });

    it("should handle enabled toggle from true to false", () => {
      const { rerender } = renderHook(
        (props) => usePresenceSound(props),
        { initialProps: { ...createDefaultOptions(), enabled: true } }
      );

      expect(() => {
        rerender({ ...createDefaultOptions(), enabled: false });
      }).not.toThrow();
    });

    it("should handle enabled toggle from false to true", () => {
      const { rerender } = renderHook(
        (props) => usePresenceSound(props),
        { initialProps: { ...createDefaultOptions(), enabled: false } }
      );

      expect(() => {
        rerender({ ...createDefaultOptions(), enabled: true });
      }).not.toThrow();
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe("cleanup", () => {
    it("should remove event listeners on unmount", () => {
      const removeEventListenerSpy = jest.spyOn(document, "removeEventListener");

      const { unmount } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalled();

      removeEventListenerSpy.mockRestore();
    });

    it("should handle unmount without initialization", () => {
      const { unmount } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      expect(() => {
        unmount();
      }).not.toThrow();
    });

    it("should handle unmount after start was called", () => {
      const { result, unmount } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      act(() => {
        result.current.start();
      });

      expect(() => {
        unmount();
      }).not.toThrow();
    });

    it("should handle unmount after start and stop were called", () => {
      const { result, unmount } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      act(() => {
        result.current.start();
        result.current.stop();
      });

      expect(() => {
        unmount();
      }).not.toThrow();
    });
  });

  // ============================================================================
  // Edge Cases Tests
  // ============================================================================

  describe("edge cases", () => {
    it("should handle rapid start/stop calls", () => {
      const { result } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      expect(() => {
        act(() => {
          result.current.start();
          result.current.stop();
          result.current.start();
          result.current.stop();
          result.current.start();
          result.current.stop();
        });
      }).not.toThrow();
    });

    it("should handle simultaneous listening and speaking", () => {
      expect(() => {
        renderHook(() =>
          usePresenceSound({
            ...createDefaultOptions(),
            isListening: true,
            isSpeaking: true,
          })
        );
      }).not.toThrow();
    });

    it("should handle all states false except enabled", () => {
      expect(() => {
        renderHook(() =>
          usePresenceSound({
            enabled: true,
            volume: 0.03,
            isConnected: false,
            isListening: false,
            isSpeaking: false,
          })
        );
      }).not.toThrow();
    });

    it("should handle disabled with all other states true", () => {
      expect(() => {
        renderHook(() =>
          usePresenceSound({
            enabled: false,
            volume: 0.03,
            isConnected: true,
            isListening: true,
            isSpeaking: true,
          })
        );
      }).not.toThrow();
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe("error handling", () => {
    it("should handle AudioContext creation failure gracefully", () => {
      const originalAC = (global as unknown as { AudioContext: unknown }).AudioContext;
      (global as unknown as { AudioContext: () => never }).AudioContext = function () {
        throw new Error("AudioContext not supported");
      };

      const { result } = renderHook(() =>
        usePresenceSound(createDefaultOptions())
      );

      // Should not throw - error is caught internally
      act(() => {
        result.current.start();
      });

      expect(result.current.isInitialized).toBe(false);

      // Restore
      (global as unknown as { AudioContext: unknown }).AudioContext = originalAC;
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe("integration", () => {
    it("should work with typical user flow", () => {
      const { result, rerender, unmount } = renderHook(
        (props) => usePresenceSound(props),
        { initialProps: createDefaultOptions() }
      );

      // Initial state
      expect(result.current.isInitialized).toBe(false);

      // User connects
      rerender({ ...createDefaultOptions(), isConnected: true });

      // User starts listening
      rerender({ ...createDefaultOptions(), isConnected: true, isListening: true });

      // User starts speaking
      rerender({
        ...createDefaultOptions(),
        isConnected: true,
        isListening: false,
        isSpeaking: true,
      });

      // User stops speaking
      rerender({
        ...createDefaultOptions(),
        isConnected: true,
        isListening: true,
        isSpeaking: false,
      });

      // User disconnects
      rerender({ ...createDefaultOptions(), isConnected: false });

      // Cleanup
      unmount();
    });

    it("should work with start and state changes", () => {
      const { result, rerender } = renderHook(
        (props) => usePresenceSound(props),
        { initialProps: createDefaultOptions() }
      );

      // Start
      act(() => {
        result.current.start();
      });

      // Change states
      rerender({ ...createDefaultOptions(), isListening: true });
      rerender({ ...createDefaultOptions(), isSpeaking: true });
      rerender({ ...createDefaultOptions(), isConnected: false });

      // Stop
      act(() => {
        result.current.stop();
      });
    });
  });
});
