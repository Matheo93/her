/**
 * Tests for useAvatarHeadTracking - Sprint 556
 * Testing natural head movement for avatar interactions
 */

import { renderHook, act } from "@testing-library/react";
import useAvatarHeadTracking, {
  useHeadPose,
  useConversationHeadTracking,
  type HeadPose,
  type HeadGesture,
  type TrackingMode,
  type HeadTrackingConfig,
} from "../useAvatarHeadTracking";

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

  jest.spyOn(performance, "now").mockReturnValue(0);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// Helper to advance animation frame
function advanceRAF(time: number = 16) {
  jest.spyOn(performance, "now").mockReturnValue(time);
  if (rafCallback) {
    const cb = rafCallback;
    rafCallback = null;
    cb(time);
  }
}

describe("useAvatarHeadTracking", () => {
  describe("initial state", () => {
    it("should return default initial state", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      expect(result.current.state.pose).toEqual({ pitch: 0, yaw: 0, roll: 0 });
      expect(result.current.state.targetPose).toEqual({ pitch: 0, yaw: 0, roll: 0 });
      expect(result.current.state.mode).toBe("idle");
      expect(result.current.state.currentTarget).toBeNull();
      expect(result.current.state.isMoving).toBe(false);
      expect(result.current.state.currentGesture).toBeNull();
    });

    it("should use default config values", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      expect(result.current.config.enabled).toBe(true);
      expect(result.current.config.smoothingFactor).toBe(0.85);
      expect(result.current.config.maxSpeed).toBe(120);
      expect(result.current.config.idleMovementScale).toBe(0.5);
      expect(result.current.config.idleFrequency).toBe(0.3);
      expect(result.current.config.gestureIntensity).toBe(1.0);
      expect(result.current.config.pitchLimit).toBe(45);
      expect(result.current.config.yawLimit).toBe(60);
      expect(result.current.config.rollLimit).toBe(15);
    });

    it("should accept custom initial config", () => {
      const customConfig: Partial<HeadTrackingConfig> = {
        smoothingFactor: 0.5,
        maxSpeed: 90,
        pitchLimit: 30,
      };

      const { result } = renderHook(() => useAvatarHeadTracking(customConfig));

      expect(result.current.config.smoothingFactor).toBe(0.5);
      expect(result.current.config.maxSpeed).toBe(90);
      expect(result.current.config.pitchLimit).toBe(30);
      // Default values should still be present
      expect(result.current.config.yawLimit).toBe(60);
    });

    it("should initialize metrics to zero", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      expect(result.current.metrics.totalMovements).toBe(0);
      expect(result.current.metrics.gesturesPerformed).toBe(0);
      expect(result.current.metrics.averageMovementSpeed).toBe(0);
      expect(result.current.metrics.idleTime).toBe(0);
      expect(result.current.metrics.attentionSwitches).toBe(0);
    });
  });

  describe("controls", () => {
    it("should provide all control functions", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());
      const { controls } = result.current;

      expect(typeof controls.setTarget).toBe("function");
      expect(typeof controls.clearTarget).toBe("function");
      expect(typeof controls.performGesture).toBe("function");
      expect(typeof controls.setPose).toBe("function");
      expect(typeof controls.setMode).toBe("function");
      expect(typeof controls.lookAt).toBe("function");
      expect(typeof controls.resetToNeutral).toBe("function");
      expect(typeof controls.updateConfig).toBe("function");
    });

    it("should set target and update mode", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      act(() => {
        result.current.controls.setTarget({ x: 1, y: 0, z: 1 });
      });

      expect(result.current.state.mode).toBe("target");
      expect(result.current.state.currentTarget).not.toBeNull();
      expect(result.current.state.currentTarget?.position).toEqual({ x: 1, y: 0, z: 1 });
    });

    it("should set target with priority", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      act(() => {
        result.current.controls.setTarget({ x: 0, y: 1, z: 1 }, 5);
      });

      expect(result.current.state.currentTarget?.priority).toBe(5);
    });

    it("should clear target and return to idle", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      act(() => {
        result.current.controls.setTarget({ x: 1, y: 0, z: 1 });
      });

      expect(result.current.state.mode).toBe("target");

      act(() => {
        result.current.controls.clearTarget();
      });

      expect(result.current.state.mode).toBe("idle");
      expect(result.current.state.currentTarget).toBeNull();
    });

    it("should perform gesture and set mode", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      act(() => {
        result.current.controls.performGesture("nod");
      });

      expect(result.current.state.mode).toBe("gesture");
      expect(result.current.state.currentGesture).toBe("nod");
      expect(result.current.state.gestureProgress).toBe(0);
    });

    it("should increment gestures performed metric", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      expect(result.current.metrics.gesturesPerformed).toBe(0);

      act(() => {
        result.current.controls.performGesture("shake");
      });

      expect(result.current.metrics.gesturesPerformed).toBe(1);

      act(() => {
        result.current.controls.performGesture("nod");
      });

      expect(result.current.metrics.gesturesPerformed).toBe(2);
    });

    it("should set pose manually and lock mode", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      act(() => {
        result.current.controls.setPose({ pitch: 10, yaw: 20 });
      });

      expect(result.current.state.mode).toBe("locked");
      expect(result.current.state.targetPose.pitch).toBe(10);
      expect(result.current.state.targetPose.yaw).toBe(20);
    });

    it("should clamp pose to limits", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      act(() => {
        result.current.controls.setPose({ pitch: 100, yaw: 100, roll: 50 });
      });

      // Should be clamped to limits: pitch=45, yaw=60, roll=15
      expect(result.current.state.targetPose.pitch).toBe(45);
      expect(result.current.state.targetPose.yaw).toBe(60);
      expect(result.current.state.targetPose.roll).toBe(15);
    });

    it("should set mode directly", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      act(() => {
        result.current.controls.setMode("user");
      });

      expect(result.current.state.mode).toBe("user");

      act(() => {
        result.current.controls.setMode("locked");
      });

      expect(result.current.state.mode).toBe("locked");
    });

    it("should look at screen coordinates", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      act(() => {
        result.current.controls.lookAt(0.5, 0.5);
      });

      // Center of screen -> should set target
      expect(result.current.state.mode).toBe("target");
      expect(result.current.state.currentTarget).not.toBeNull();
    });

    it("should reset to neutral", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      // Set up some state
      act(() => {
        result.current.controls.setTarget({ x: 1, y: 1, z: 1 });
        result.current.controls.performGesture("nod");
      });

      act(() => {
        result.current.controls.resetToNeutral();
      });

      expect(result.current.state.mode).toBe("idle");
      expect(result.current.state.currentTarget).toBeNull();
      expect(result.current.state.currentGesture).toBeNull();
      expect(result.current.state.targetPose).toEqual({ pitch: 0, yaw: 0, roll: 0 });
    });

    it("should update config", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      act(() => {
        result.current.controls.updateConfig({
          smoothingFactor: 0.9,
          maxSpeed: 60,
        });
      });

      expect(result.current.config.smoothingFactor).toBe(0.9);
      expect(result.current.config.maxSpeed).toBe(60);
      // Unchanged values should remain
      expect(result.current.config.idleFrequency).toBe(0.3);
    });
  });

  describe("attention tracking", () => {
    it("should increment attention switches on first target", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      expect(result.current.metrics.attentionSwitches).toBe(0);

      act(() => {
        result.current.controls.setTarget({ x: 1, y: 0, z: 1 });
      });

      expect(result.current.metrics.attentionSwitches).toBe(1);
    });

    it("should not increment attention switches on target update", () => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      act(() => {
        result.current.controls.setTarget({ x: 1, y: 0, z: 1 });
      });

      expect(result.current.metrics.attentionSwitches).toBe(1);

      act(() => {
        result.current.controls.setTarget({ x: 2, y: 0, z: 1 });
      });

      // Should still be 1 because we're updating an existing target
      expect(result.current.metrics.attentionSwitches).toBe(1);
    });
  });

  describe("gestures", () => {
    const gestures: HeadGesture[] = [
      "nod",
      "shake",
      "tilt_curious",
      "tilt_confused",
      "look_away",
      "look_up",
      "lean_in",
      "lean_back",
    ];

    it.each(gestures)("should support %s gesture", (gesture) => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      act(() => {
        result.current.controls.performGesture(gesture);
      });

      expect(result.current.state.currentGesture).toBe(gesture);
    });
  });

  describe("tracking modes", () => {
    const modes: TrackingMode[] = ["user", "target", "idle", "gesture", "locked"];

    it.each(modes)("should support %s mode", (mode) => {
      const { result } = renderHook(() => useAvatarHeadTracking());

      act(() => {
        result.current.controls.setMode(mode);
      });

      expect(result.current.state.mode).toBe(mode);
    });
  });
});

describe("useHeadPose", () => {
  it("should return head pose", () => {
    const { result } = renderHook(() => useHeadPose());

    expect(result.current).toEqual({ pitch: 0, yaw: 0, roll: 0 });
  });

  it("should accept config", () => {
    const { result } = renderHook(() =>
      useHeadPose({ pitchLimit: 30 })
    );

    expect(result.current).toBeDefined();
    expect(typeof result.current.pitch).toBe("number");
    expect(typeof result.current.yaw).toBe("number");
    expect(typeof result.current.roll).toBe("number");
  });
});

describe("useConversationHeadTracking", () => {
  it("should return head tracking result", () => {
    const { result } = renderHook(() =>
      useConversationHeadTracking(false, false)
    );

    expect(result.current.state).toBeDefined();
    expect(result.current.controls).toBeDefined();
    expect(result.current.metrics).toBeDefined();
    expect(result.current.config).toBeDefined();
  });

  it("should set mode to user when listening", () => {
    const { result, rerender } = renderHook(
      ({ isSpeaking, isListening }) =>
        useConversationHeadTracking(isSpeaking, isListening),
      { initialProps: { isSpeaking: false, isListening: false } }
    );

    rerender({ isSpeaking: false, isListening: true });

    expect(result.current.state.mode).toBe("user");
  });
});

describe("config validation", () => {
  it("should handle zero smoothing factor", () => {
    const { result } = renderHook(() =>
      useAvatarHeadTracking({ smoothingFactor: 0 })
    );

    expect(result.current.config.smoothingFactor).toBe(0);
  });

  it("should handle zero idle movement scale", () => {
    const { result } = renderHook(() =>
      useAvatarHeadTracking({ idleMovementScale: 0 })
    );

    expect(result.current.config.idleMovementScale).toBe(0);
  });

  it("should handle high gesture intensity", () => {
    const { result } = renderHook(() =>
      useAvatarHeadTracking({ gestureIntensity: 2.0 })
    );

    expect(result.current.config.gestureIntensity).toBe(2.0);
  });

  it("should handle disabled tracking", () => {
    const { result } = renderHook(() =>
      useAvatarHeadTracking({ enabled: false })
    );

    expect(result.current.config.enabled).toBe(false);
  });

  it("should handle custom limits", () => {
    const { result } = renderHook(() =>
      useAvatarHeadTracking({
        pitchLimit: 90,
        yawLimit: 180,
        rollLimit: 45,
      })
    );

    expect(result.current.config.pitchLimit).toBe(90);
    expect(result.current.config.yawLimit).toBe(180);
    expect(result.current.config.rollLimit).toBe(45);
  });
});

describe("pose limits", () => {
  it("should clamp positive values to limits", () => {
    const { result } = renderHook(() => useAvatarHeadTracking());

    act(() => {
      result.current.controls.setPose({ pitch: 100 });
    });

    expect(result.current.state.targetPose.pitch).toBe(45);
  });

  it("should clamp negative values to limits", () => {
    const { result } = renderHook(() => useAvatarHeadTracking());

    act(() => {
      result.current.controls.setPose({ pitch: -100 });
    });

    expect(result.current.state.targetPose.pitch).toBe(-45);
  });

  it("should respect custom limits", () => {
    const { result } = renderHook(() =>
      useAvatarHeadTracking({ pitchLimit: 30 })
    );

    act(() => {
      result.current.controls.setPose({ pitch: 100 });
    });

    expect(result.current.state.targetPose.pitch).toBe(30);
  });
});

describe("target position tracking", () => {
  it("should track target in front", () => {
    const { result } = renderHook(() => useAvatarHeadTracking());

    act(() => {
      result.current.controls.setTarget({ x: 0, y: 0, z: 1 });
    });

    expect(result.current.state.currentTarget?.position).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("should track target to the side", () => {
    const { result } = renderHook(() => useAvatarHeadTracking());

    act(() => {
      result.current.controls.setTarget({ x: 1, y: 0, z: 0 });
    });

    expect(result.current.state.currentTarget?.position.x).toBe(1);
  });

  it("should track target above", () => {
    const { result } = renderHook(() => useAvatarHeadTracking());

    act(() => {
      result.current.controls.setTarget({ x: 0, y: -1, z: 1 });
    });

    expect(result.current.state.currentTarget?.position.y).toBe(-1);
  });
});

describe("metrics tracking", () => {
  it("should track gestures performed", () => {
    const { result } = renderHook(() => useAvatarHeadTracking());

    act(() => {
      result.current.controls.performGesture("nod");
      result.current.controls.performGesture("shake");
      result.current.controls.performGesture("nod");
    });

    expect(result.current.metrics.gesturesPerformed).toBe(3);
  });

  it("should track attention switches correctly", () => {
    const { result } = renderHook(() => useAvatarHeadTracking());

    // First target
    act(() => {
      result.current.controls.setTarget({ x: 1, y: 0, z: 1 });
    });
    expect(result.current.metrics.attentionSwitches).toBe(1);

    // Clear and set new target
    act(() => {
      result.current.controls.clearTarget();
    });

    act(() => {
      result.current.controls.setTarget({ x: -1, y: 0, z: 1 });
    });
    expect(result.current.metrics.attentionSwitches).toBe(2);
  });
});
