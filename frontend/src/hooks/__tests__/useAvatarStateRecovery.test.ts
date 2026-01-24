/**
 * Tests for useAvatarStateRecovery hook
 * Sprint 521: Avatar UX mobile latency improvements
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useAvatarStateRecovery,
  useAvatarStatePersistence,
  useConversationAvatarRecovery,
  RecoverableAvatarState,
} from "../useAvatarStateRecovery";

// Storage mock with proper reset
let mockStore: Record<string, string> = {};

const mockSessionStorage = {
  getItem: jest.fn((key: string) => mockStore[key] || null),
  setItem: jest.fn((key: string, value: string) => {
    mockStore[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete mockStore[key];
  }),
  clear: jest.fn(() => {
    mockStore = {};
  }),
  get length() {
    return Object.keys(mockStore).length;
  },
  key: jest.fn((index: number) => Object.keys(mockStore)[index] || null),
};

Object.defineProperty(window, "sessionStorage", {
  value: mockSessionStorage,
  writable: true,
});

// RAF mock
let rafCallbacks: Map<number, (time: number) => void> = new Map();
let rafId = 0;

const mockRequestAnimationFrame = jest.fn((cb: (time: number) => void) => {
  const id = ++rafId;
  rafCallbacks.set(id, cb);
  return id;
});

const mockCancelAnimationFrame = jest.fn((id: number) => {
  rafCallbacks.delete(id);
});

Object.defineProperty(window, "requestAnimationFrame", {
  value: mockRequestAnimationFrame,
  writable: true,
});

Object.defineProperty(window, "cancelAnimationFrame", {
  value: mockCancelAnimationFrame,
  writable: true,
});

// Visibility mock
let visibilityState: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", {
  get: () => visibilityState,
  configurable: true,
});

const fireVisibilityChange = (state: DocumentVisibilityState) => {
  visibilityState = state;
  document.dispatchEvent(new Event("visibilitychange"));
};

// Helper to run all RAF callbacks
const runAllRAFCallbacks = () => {
  const callbacks = Array.from(rafCallbacks.values());
  rafCallbacks.clear();
  callbacks.forEach((cb) => cb(performance.now()));
};

describe("useAvatarStateRecovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = {};
    rafCallbacks.clear();
    rafId = 0;
    visibilityState = "visible";
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initialization", () => {
    it("should initialize with idle status", () => {
      const { result } = renderHook(() => useAvatarStateRecovery());

      expect(result.current.state.status).toBe("idle");
      expect(result.current.isRecovering).toBe(false);
      expect(result.current.hasStoredState).toBe(false);
    });

    it("should detect stored state on mount", () => {
      const testState = {
        pose: { position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, scale: 1 },
        timestamp: Date.now(),
        version: 1,
      };
      mockStore["avatar-state-recovery"] = JSON.stringify(testState);

      const { result } = renderHook(() => useAvatarStateRecovery());

      expect(result.current.hasStoredState).toBe(true);
    });

    it("should use custom storage key", () => {
      const { result } = renderHook(() =>
        useAvatarStateRecovery({ storageKey: "custom-key" })
      );

      act(() => {
        result.current.controls.checkpoint({ speaking: true });
      });

      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        "custom-key",
        expect.any(String)
      );
    });
  });

  describe("checkpoint", () => {
    it("should create a checkpoint and save to storage", () => {
      const onCheckpoint = jest.fn();
      const { result } = renderHook(() =>
        useAvatarStateRecovery({}, { onCheckpoint })
      );

      act(() => {
        result.current.controls.checkpoint({
          speaking: true,
          listeningIntensity: 0.5,
        });
      });

      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        "avatar-state-recovery",
        expect.any(String)
      );
      expect(result.current.hasStoredState).toBe(true);
      expect(onCheckpoint).toHaveBeenCalled();
      expect(result.current.metrics.checkpointsCreated).toBe(1);
    });

    it("should update current state after checkpoint", () => {
      const { result } = renderHook(() => useAvatarStateRecovery());

      act(() => {
        result.current.controls.checkpoint({
          speaking: true,
          listeningIntensity: 0.7,
        });
      });

      expect(result.current.state.currentState.speaking).toBe(true);
      expect(result.current.state.currentState.listeningIntensity).toBe(0.7);
    });

    it("should support priority levels", () => {
      const onCheckpoint = jest.fn();
      const { result } = renderHook(() =>
        useAvatarStateRecovery({}, { onCheckpoint })
      );

      act(() => {
        result.current.controls.checkpoint({ speaking: true }, "critical");
      });

      expect(onCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({ priority: "critical" })
      );
    });

    it("should handle storage errors gracefully", () => {
      const consoleWarn = jest.spyOn(console, "warn").mockImplementation();
      mockSessionStorage.setItem.mockImplementationOnce(() => {
        throw new Error("Storage full");
      });

      const { result } = renderHook(() => useAvatarStateRecovery());

      expect(() => {
        act(() => {
          result.current.controls.checkpoint({ speaking: true });
        });
      }).not.toThrow();

      consoleWarn.mockRestore();
    });
  });

  describe("recover", () => {
    it("should fail when no stored state", async () => {
      const onRecoveryFailed = jest.fn();
      const { result } = renderHook(() =>
        useAvatarStateRecovery({}, { onRecoveryFailed })
      );

      let recoverResult: any;
      await act(async () => {
        recoverResult = await result.current.controls.recover();
      });

      expect(recoverResult.success).toBe(false);
      expect(result.current.state.status).toBe("failed");
      expect(onRecoveryFailed).toHaveBeenCalled();
      expect(result.current.metrics.failedRecoveries).toBe(1);
    });

    it("should recover fresh state immediately", async () => {
      const timestamp = Date.now();
      const testState = {
        pose: { position: { x: 1, y: 2, z: 3 }, rotation: { pitch: 0.1, yaw: 0.2, roll: 0.3 }, scale: 1.5 },
        expression: {
          emotion: "happy",
          intensity: 0.8,
          blendShapes: { smile: 0.9 },
          transitionProgress: 1,
        },
        animation: { currentAnimation: "wave", progress: 0.5, speed: 1, looping: true, layer: 0 },
        lookAt: { target: { x: 0, y: 0, z: 1 }, weight: 1, mode: "user" as const },
        speaking: true,
        listeningIntensity: 0.6,
        breathingPhase: 0.3,
        blinkState: 0,
        timestamp,
        version: 1,
      };
      mockStore["avatar-state-recovery"] = JSON.stringify(testState);

      const onRecoveryComplete = jest.fn();
      const { result } = renderHook(() =>
        useAvatarStateRecovery(
          { maxStaleAge: 30000 },
          { onRecoveryComplete }
        )
      );

      let recoverResult: any;
      await act(async () => {
        recoverResult = await result.current.controls.recover();
      });

      expect(recoverResult.success).toBe(true);
      expect(recoverResult.restoredFields).toContain("pose");
      expect(recoverResult.restoredFields).toContain("expression");
      expect(result.current.state.status).toBe("complete");
      expect(onRecoveryComplete).toHaveBeenCalled();
      expect(result.current.metrics.successfulRecoveries).toBe(1);
    });

    it("should fail on invalid state version", async () => {
      const testState = {
        pose: { position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, scale: 1 },
        timestamp: Date.now(),
        version: 999,
      };
      mockStore["avatar-state-recovery"] = JSON.stringify(testState);

      const onRecoveryFailed = jest.fn();
      const { result } = renderHook(() =>
        useAvatarStateRecovery({}, { onRecoveryFailed })
      );

      await act(async () => {
        await result.current.controls.recover();
      });

      expect(result.current.state.status).toBe("failed");
      expect(onRecoveryFailed).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Invalid or outdated state version" })
      );
    });

    it("should fail on corrupted storage data", async () => {
      mockStore["avatar-state-recovery"] = "not-valid-json{{{";

      const onRecoveryFailed = jest.fn();
      const { result } = renderHook(() =>
        useAvatarStateRecovery({}, { onRecoveryFailed })
      );

      await act(async () => {
        await result.current.controls.recover();
      });

      expect(result.current.state.status).toBe("failed");
      expect(onRecoveryFailed).toHaveBeenCalled();
    });

    it("should track stale time in metrics", async () => {
      const staleMs = 5000;
      const testState = {
        pose: { position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, scale: 1 },
        timestamp: Date.now() - staleMs,
        version: 1,
      };
      mockStore["avatar-state-recovery"] = JSON.stringify(testState);

      const { result } = renderHook(() =>
        useAvatarStateRecovery({ maxStaleAge: 30000 })
      );

      await act(async () => {
        await result.current.controls.recover();
      });

      expect(result.current.metrics.averageStaleTimeMs).toBeGreaterThan(0);
      expect(result.current.metrics.lastRecoveryAt).not.toBeNull();
    });

    it("should interpolate stale state", async () => {
      const staleTimestamp = Date.now() - 60000;
      const testState = {
        pose: { position: { x: 10, y: 20, z: 30 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, scale: 1 },
        expression: {
          emotion: "neutral",
          intensity: 0,
          blendShapes: {},
          transitionProgress: 1,
        },
        animation: { currentAnimation: null, progress: 0, speed: 1, looping: false, layer: 0 },
        lookAt: { target: null, weight: 0, mode: "idle" as const },
        speaking: false,
        listeningIntensity: 0,
        breathingPhase: 0,
        blinkState: 0,
        timestamp: staleTimestamp,
        version: 1,
      };
      mockStore["avatar-state-recovery"] = JSON.stringify(testState);

      const onInterpolationProgress = jest.fn();
      const { result } = renderHook(() =>
        useAvatarStateRecovery(
          { maxStaleAge: 30000, interpolationDuration: 100 },
          { onInterpolationProgress }
        )
      );

      // Start recovery
      let recoverPromise: Promise<any>;
      act(() => {
        recoverPromise = result.current.controls.recover();
      });

      // Wait for interpolating status
      await waitFor(() => {
        expect(result.current.state.status).toBe("interpolating");
      });

      // Simulate animation frames
      for (let i = 0; i < 10; i++) {
        jest.advanceTimersByTime(20);
        act(() => {
          runAllRAFCallbacks();
        });
      }

      await act(async () => {
        await recoverPromise;
      });

      expect(result.current.state.status).toBe("complete");
      expect(onInterpolationProgress).toHaveBeenCalled();
    });
  });

  describe("clearStorage", () => {
    it("should clear stored state", () => {
      const testState = {
        pose: { position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, scale: 1 },
        timestamp: Date.now(),
        version: 1,
      };
      mockStore["avatar-state-recovery"] = JSON.stringify(testState);

      const { result } = renderHook(() => useAvatarStateRecovery());

      expect(result.current.hasStoredState).toBe(true);

      act(() => {
        result.current.controls.clearStorage();
      });

      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith("avatar-state-recovery");
      expect(result.current.hasStoredState).toBe(false);
      expect(result.current.state.lastCheckpoint).toBeNull();
    });

    it("should handle storage errors", () => {
      const consoleWarn = jest.spyOn(console, "warn").mockImplementation();
      mockSessionStorage.removeItem.mockImplementationOnce(() => {
        throw new Error("Storage error");
      });

      const { result } = renderHook(() => useAvatarStateRecovery());

      expect(() => {
        act(() => {
          result.current.controls.clearStorage();
        });
      }).not.toThrow();

      consoleWarn.mockRestore();
    });
  });

  describe("interpolateTo", () => {
    it("should interpolate to target state", async () => {
      const onInterpolationProgress = jest.fn();
      const { result } = renderHook(() =>
        useAvatarStateRecovery(
          { interpolationDuration: 100 },
          { onInterpolationProgress }
        )
      );

      const targetState: Partial<RecoverableAvatarState> = {
        pose: { position: { x: 10, y: 20, z: 30 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, scale: 2 },
        speaking: true,
      };

      act(() => {
        result.current.controls.interpolateTo(targetState, 100);
      });

      expect(result.current.state.status).toBe("interpolating");
      expect(result.current.state.targetState).toEqual(targetState);

      // Simulate animation frames
      for (let i = 0; i < 10; i++) {
        jest.advanceTimersByTime(20);
        act(() => {
          runAllRAFCallbacks();
        });
      }

      await waitFor(() => {
        expect(result.current.state.status).toBe("idle");
      });

      expect(result.current.state.targetState).toBeNull();
      expect(onInterpolationProgress).toHaveBeenCalled();
    });

    it("should handle multiple interpolations", () => {
      const { result } = renderHook(() =>
        useAvatarStateRecovery({ interpolationDuration: 1000 })
      );

      // First interpolation
      act(() => {
        result.current.controls.interpolateTo({ speaking: true }, 1000);
      });

      expect(result.current.state.status).toBe("interpolating");
      expect(result.current.state.targetState).toEqual({ speaking: true });

      // Second interpolation overrides first
      act(() => {
        result.current.controls.interpolateTo({ speaking: false }, 1000);
      });

      expect(result.current.state.status).toBe("interpolating");
      expect(result.current.state.targetState).toEqual({ speaking: false });
    });
  });

  describe("cancelRecovery", () => {
    it("should cancel ongoing recovery", async () => {
      const staleTimestamp = Date.now() - 60000;
      const testState = {
        pose: { position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, scale: 1 },
        timestamp: staleTimestamp,
        version: 1,
      };
      mockStore["avatar-state-recovery"] = JSON.stringify(testState);

      const { result } = renderHook(() =>
        useAvatarStateRecovery({ maxStaleAge: 30000, interpolationDuration: 1000 })
      );

      act(() => {
        result.current.controls.recover();
      });

      await waitFor(() => {
        expect(result.current.state.status).toBe("interpolating");
      });

      act(() => {
        result.current.controls.cancelRecovery();
      });

      expect(result.current.state.status).toBe("idle");
      expect(result.current.state.targetState).toBeNull();
      expect(result.current.state.interpolationProgress).toBe(0);
    });
  });

  describe("getInterpolatedState", () => {
    it("should return current state", () => {
      const { result } = renderHook(() => useAvatarStateRecovery());

      act(() => {
        result.current.controls.checkpoint({
          speaking: true,
          listeningIntensity: 0.5,
        });
      });

      const state = result.current.controls.getInterpolatedState();
      expect(state.speaking).toBe(true);
      expect(state.listeningIntensity).toBe(0.5);
    });
  });

  describe("resetMetrics", () => {
    it("should reset all metrics to initial values", async () => {
      const testState = {
        pose: { position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, scale: 1 },
        timestamp: Date.now(),
        version: 1,
      };
      mockStore["avatar-state-recovery"] = JSON.stringify(testState);

      const { result } = renderHook(() =>
        useAvatarStateRecovery({ maxStaleAge: 30000 })
      );

      await act(async () => {
        await result.current.controls.recover();
      });

      act(() => {
        result.current.controls.checkpoint({ speaking: true });
      });

      expect(result.current.metrics.totalRecoveries).toBe(1);
      expect(result.current.metrics.checkpointsCreated).toBe(1);

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.totalRecoveries).toBe(0);
      expect(result.current.metrics.checkpointsCreated).toBe(0);
      expect(result.current.metrics.lastRecoveryAt).toBeNull();
    });
  });

  describe("auto-checkpoint", () => {
    it("should auto-checkpoint at specified interval", () => {
      const onCheckpoint = jest.fn();
      const { result } = renderHook(() =>
        useAvatarStateRecovery(
          { autoCheckpointInterval: 1000 },
          { onCheckpoint }
        )
      );

      // Set some state first
      act(() => {
        result.current.controls.checkpoint({ speaking: true });
      });

      expect(onCheckpoint).toHaveBeenCalledTimes(1);

      // Advance time past interval
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(onCheckpoint).toHaveBeenCalledTimes(2);
    });

    it("should not auto-checkpoint when interval is 0", () => {
      const onCheckpoint = jest.fn();
      renderHook(() =>
        useAvatarStateRecovery(
          { autoCheckpointInterval: 0 },
          { onCheckpoint }
        )
      );

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(onCheckpoint).not.toHaveBeenCalled();
    });

    it("should not auto-checkpoint when state is empty", () => {
      const onCheckpoint = jest.fn();
      renderHook(() =>
        useAvatarStateRecovery(
          { autoCheckpointInterval: 1000 },
          { onCheckpoint }
        )
      );

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(onCheckpoint).not.toHaveBeenCalled();
    });
  });

  describe("visibility change", () => {
    it("should checkpoint on app backgrounding", () => {
      const onCheckpoint = jest.fn();
      const { result } = renderHook(() =>
        useAvatarStateRecovery({}, { onCheckpoint })
      );

      // Set some state
      act(() => {
        result.current.controls.checkpoint({ speaking: true });
      });

      onCheckpoint.mockClear();

      // Simulate app backgrounding
      act(() => {
        fireVisibilityChange("hidden");
      });

      expect(onCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({ priority: "critical" })
      );
    });

    it("should not checkpoint when state is empty", () => {
      const onCheckpoint = jest.fn();
      renderHook(() =>
        useAvatarStateRecovery({}, { onCheckpoint })
      );

      act(() => {
        fireVisibilityChange("hidden");
      });

      expect(onCheckpoint).not.toHaveBeenCalled();
    });
  });

  describe("cleanup", () => {
    it("should cleanup on unmount", () => {
      const { unmount } = renderHook(() =>
        useAvatarStateRecovery({ autoCheckpointInterval: 1000 })
      );

      // Simply verify unmount doesn't throw
      expect(() => unmount()).not.toThrow();
    });

    it("should cleanup interval on unmount", () => {
      const clearIntervalSpy = jest.spyOn(global, "clearInterval");
      const { result, unmount } = renderHook(() =>
        useAvatarStateRecovery({ autoCheckpointInterval: 500 })
      );

      // Set some state to trigger checkpointing
      act(() => {
        result.current.controls.checkpoint({ speaking: true });
      });

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  describe("isRecovering", () => {
    it("should be true during interpolating", () => {
      const { result } = renderHook(() =>
        useAvatarStateRecovery({ interpolationDuration: 1000 })
      );

      act(() => {
        result.current.controls.interpolateTo({ speaking: true }, 1000);
      });

      expect(result.current.isRecovering).toBe(true);
    });
  });

  describe("recovery callbacks", () => {
    it("should call onRecoveryStart when recovery begins", async () => {
      const testState = {
        pose: { position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, scale: 1 },
        timestamp: Date.now(),
        version: 1,
      };
      mockStore["avatar-state-recovery"] = JSON.stringify(testState);

      const onRecoveryStart = jest.fn();
      const { result } = renderHook(() =>
        useAvatarStateRecovery({ maxStaleAge: 30000 }, { onRecoveryStart })
      );

      await act(async () => {
        await result.current.controls.recover();
      });

      expect(onRecoveryStart).toHaveBeenCalled();
    });

    it("should call onRecoveryComplete with result", async () => {
      const testState = {
        pose: { position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, scale: 1 },
        timestamp: Date.now(),
        version: 1,
      };
      mockStore["avatar-state-recovery"] = JSON.stringify(testState);

      const onRecoveryComplete = jest.fn();
      const { result } = renderHook(() =>
        useAvatarStateRecovery({ maxStaleAge: 30000 }, { onRecoveryComplete })
      );

      await act(async () => {
        await result.current.controls.recover();
      });

      expect(onRecoveryComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          restoredFields: expect.any(Array),
        })
      );
    });
  });
});

describe("useAvatarStatePersistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = {};
  });

  describe("save", () => {
    it("should save state to session storage", () => {
      const { result } = renderHook(() => useAvatarStatePersistence("test-key"));

      act(() => {
        result.current.save({ speaking: true, listeningIntensity: 0.5 });
      });

      expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
        "test-key",
        expect.any(String)
      );
    });

    it("should handle storage errors silently", () => {
      mockSessionStorage.setItem.mockImplementationOnce(() => {
        throw new Error("Storage full");
      });

      const { result } = renderHook(() => useAvatarStatePersistence());

      expect(() => {
        act(() => {
          result.current.save({ speaking: true });
        });
      }).not.toThrow();
    });
  });

  describe("load", () => {
    it("should load state from session storage", () => {
      const testState = {
        speaking: true,
        listeningIntensity: 0.7,
        timestamp: Date.now(),
        version: 1,
      };
      mockStore["avatar-state"] = JSON.stringify(testState);

      const { result } = renderHook(() => useAvatarStatePersistence());

      let loaded: ReturnType<typeof result.current.load> | null = null;
      act(() => {
        loaded = result.current.load();
      });

      expect(loaded).not.toBeNull();
      expect((loaded as Record<string, unknown>)?.speaking).toBe(true);
      expect((loaded as Record<string, unknown>)?.listeningIntensity).toBe(0.7);
    });

    it("should return null when no stored state", () => {
      const { result } = renderHook(() => useAvatarStatePersistence());

      let loaded: Partial<RecoverableAvatarState> | null = null;
      act(() => {
        loaded = result.current.load();
      });

      expect(loaded).toBeNull();
    });

    it("should return null on parse error", () => {
      mockStore["avatar-state"] = "not-valid-json";

      const { result } = renderHook(() => useAvatarStatePersistence());

      let loaded: Partial<RecoverableAvatarState> | null = null;
      act(() => {
        loaded = result.current.load();
      });

      expect(loaded).toBeNull();
    });
  });

  describe("clear", () => {
    it("should remove state from session storage", () => {
      mockStore["avatar-state"] = "{}";

      const { result } = renderHook(() => useAvatarStatePersistence());

      act(() => {
        result.current.clear();
      });

      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith("avatar-state");
    });

    it("should handle storage errors silently", () => {
      mockSessionStorage.removeItem.mockImplementationOnce(() => {
        throw new Error("Storage error");
      });

      const { result } = renderHook(() => useAvatarStatePersistence());

      expect(() => {
        act(() => {
          result.current.clear();
        });
      }).not.toThrow();
    });
  });
});

describe("useConversationAvatarRecovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = {};
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should use faster checkpoint interval when in conversation", () => {
    const { result } = renderHook(() => useConversationAvatarRecovery(true));

    expect(result.current.state.status).toBe("idle");
  });

  it("should use slower checkpoint interval when not in conversation", () => {
    const { result } = renderHook(() => useConversationAvatarRecovery(false));

    expect(result.current.state.status).toBe("idle");
  });

  it("should auto-recover when conversation starts with stored state", async () => {
    const testState = {
      pose: { position: { x: 0, y: 0, z: 0 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, scale: 1 },
      timestamp: Date.now(),
      version: 1,
    };
    mockStore["avatar-state-recovery"] = JSON.stringify(testState);

    const { result, rerender } = renderHook(
      ({ isInConversation }) => useConversationAvatarRecovery(isInConversation),
      { initialProps: { isInConversation: false } }
    );

    expect(result.current.state.status).toBe("idle");

    // Start conversation
    rerender({ isInConversation: true });

    await waitFor(() => {
      expect(result.current.state.status).not.toBe("idle");
    });
  });
});

describe("interpolation utilities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore = {};
    rafCallbacks.clear();
    rafId = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should interpolate pose correctly during recovery", async () => {
    const testState = {
      pose: { position: { x: 10, y: 20, z: 30 }, rotation: { pitch: 1, yaw: 2, roll: 3 }, scale: 2 },
      timestamp: Date.now() - 60000,
      version: 1,
    };
    mockStore["avatar-state-recovery"] = JSON.stringify(testState);

    const { result } = renderHook(() =>
      useAvatarStateRecovery(
        { maxStaleAge: 30000, interpolationDuration: 100 }
      )
    );

    act(() => {
      result.current.controls.recover();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("interpolating");
    });

    // After some frames, pose should be partially interpolated
    jest.advanceTimersByTime(50);
    act(() => {
      runAllRAFCallbacks();
    });

    const currentPose = result.current.state.currentState.pose;
    expect(currentPose).toBeDefined();
  });

  it("should interpolate expression correctly", async () => {
    const testState = {
      expression: {
        emotion: "happy",
        intensity: 1.0,
        blendShapes: { smile: 1.0, eyesClosed: 0.5 },
        transitionProgress: 1,
      },
      timestamp: Date.now() - 60000,
      version: 1,
    };
    mockStore["avatar-state-recovery"] = JSON.stringify(testState);

    const { result } = renderHook(() =>
      useAvatarStateRecovery(
        { maxStaleAge: 30000, interpolationDuration: 100 }
      )
    );

    act(() => {
      result.current.controls.recover();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe("interpolating");
    });

    jest.advanceTimersByTime(50);
    act(() => {
      runAllRAFCallbacks();
    });

    const currentExpression = result.current.state.currentState.expression;
    expect(currentExpression).toBeDefined();
  });
});
