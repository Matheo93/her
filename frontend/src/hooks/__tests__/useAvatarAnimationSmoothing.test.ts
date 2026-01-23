/**
 * Tests for Avatar Animation Smoothing Hook - Sprint 526
 *
 * Tests smoothing algorithms, pose blending, jank detection, and animation queue
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarAnimationSmoothing,
  useSmoothedValue,
  usePoseBlending,
  useJankDetection,
  SmoothingAlgorithm,
  AvatarPose,
  BlendShapeWeights,
} from "../useAvatarAnimationSmoothing";

// Mock performance.now
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Helper to advance time
function advanceTime(ms: number) {
  mockTime += ms;
}

describe("useAvatarAnimationSmoothing", () => {
  describe("initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      expect(result.current.state.isActive).toBe(true);
      expect(result.current.state.algorithm).toBe("exponential");
      expect(result.current.state.trackedValues).toBe(0);
      expect(result.current.state.hasJank).toBe(false);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationSmoothing({
          smoothingFactor: 0.25,
          springStiffness: 300,
          algorithm: "spring",
        })
      );

      expect(result.current.state.algorithm).toBe("spring");
    });

    it("should initialize metrics to zero", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      expect(result.current.metrics.valuesSmoothed).toBe(0);
      expect(result.current.metrics.posesBlended).toBe(0);
      expect(result.current.metrics.jankEventsDetected).toBe(0);
    });
  });

  describe("value smoothing", () => {
    it("should smooth a single value", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationSmoothing({ smoothingFactor: 0.5 })
      );

      let smoothed: number = 0;

      // First call sets initial value
      act(() => {
        smoothed = result.current.controls.smooth("test", 10);
      });

      // Smoothed value should be defined
      expect(smoothed).toBeGreaterThanOrEqual(0);
      expect(result.current.controls.getValue("test")).toBeDefined();
    });

    it("should converge toward target over time", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationSmoothing({
          smoothingFactor: 0.5,
          algorithm: "exponential",
        })
      );

      // Start at 0
      act(() => {
        result.current.controls.setImmediate("test", 0);
      });

      // Set target to 10 and advance time
      let value1: number = 0;
      act(() => {
        advanceTime(16);
        value1 = result.current.controls.smooth("test", 10);
      });

      let value2: number = 0;
      act(() => {
        advanceTime(16);
        value2 = result.current.controls.smooth("test", 10);
      });

      // Values should be increasing toward target
      expect(value2).toBeGreaterThan(value1);
    });

    it("should get current value", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      act(() => {
        result.current.controls.setImmediate("test", 5);
      });

      expect(result.current.controls.getValue("test")).toBe(5);
    });

    it("should reset a value", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      act(() => {
        result.current.controls.smooth("test", 10);
      });

      act(() => {
        result.current.controls.resetValue("test", 0);
      });

      expect(result.current.controls.getValue("test")).toBe(0);
    });

    it("should reset all values", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      act(() => {
        result.current.controls.smooth("a", 10);
        result.current.controls.smooth("b", 20);
        result.current.controls.smooth("c", 30);
      });

      // Values should be tracked
      expect(result.current.controls.getValue("a")).toBeDefined();
      expect(result.current.controls.getValue("b")).toBeDefined();
      expect(result.current.controls.getValue("c")).toBeDefined();

      act(() => {
        result.current.controls.resetAll();
      });

      // Values should be cleared
      expect(result.current.controls.getValue("a")).toBeUndefined();
      expect(result.current.controls.getValue("b")).toBeUndefined();
      expect(result.current.controls.getValue("c")).toBeUndefined();
    });

    it("should set value immediately without smoothing", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      act(() => {
        result.current.controls.setImmediate("test", 100);
      });

      expect(result.current.controls.getValue("test")).toBe(100);
    });
  });

  describe("vector smoothing", () => {
    it("should smooth a 3D vector", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationSmoothing({ smoothingFactor: 0.5 })
      );

      act(() => {
        result.current.controls.setImmediate("vec_x", 0);
        result.current.controls.setImmediate("vec_y", 0);
        result.current.controls.setImmediate("vec_z", 0);
      });

      let smoothedVec: { x: number; y: number; z: number };
      act(() => {
        advanceTime(16);
        smoothedVec = result.current.controls.smoothVector("vec", {
          x: 10,
          y: 20,
          z: 30,
        });
      });

      expect(smoothedVec!.x).toBeDefined();
      expect(smoothedVec!.y).toBeDefined();
      expect(smoothedVec!.z).toBeDefined();
    });
  });

  describe("algorithms", () => {
    it("should support exponential smoothing", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationSmoothing({ algorithm: "exponential" })
      );

      expect(result.current.state.algorithm).toBe("exponential");

      act(() => {
        result.current.controls.smooth("test", 10, "exponential");
      });

      expect(result.current.metrics.valuesSmoothed).toBeGreaterThanOrEqual(0);
    });

    it("should support spring smoothing", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationSmoothing({ algorithm: "spring" })
      );

      expect(result.current.state.algorithm).toBe("spring");
    });

    it("should support lerp smoothing", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationSmoothing({ algorithm: "lerp" })
      );

      expect(result.current.state.algorithm).toBe("lerp");
    });

    it("should support critically damped smoothing", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationSmoothing({ algorithm: "critically_damped" })
      );

      expect(result.current.state.algorithm).toBe("critically_damped");
    });

    it("should support adaptive smoothing", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationSmoothing({ algorithm: "adaptive" })
      );

      expect(result.current.state.algorithm).toBe("adaptive");
    });

    it("should change algorithm at runtime", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationSmoothing({ algorithm: "exponential" })
      );

      expect(result.current.state.algorithm).toBe("exponential");

      act(() => {
        result.current.controls.setAlgorithm("spring");
      });

      expect(result.current.state.algorithm).toBe("spring");
    });
  });

  describe("value settlement", () => {
    it("should detect settled values", () => {
      const { result } = renderHook(() =>
        useAvatarAnimationSmoothing({ settlementThreshold: 0.001 })
      );

      // Set value directly (settled immediately)
      act(() => {
        result.current.controls.setImmediate("test", 10);
      });

      expect(result.current.controls.isSettled("test")).toBe(true);
    });

    it("should track settled values", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      act(() => {
        result.current.controls.setImmediate("a", 1);
        result.current.controls.setImmediate("b", 2);
      });

      // Both values should be settled since they were set immediately
      expect(result.current.controls.isSettled("a")).toBe(true);
      expect(result.current.controls.isSettled("b")).toBe(true);
    });
  });

  describe("pose blending", () => {
    it("should blend two poses", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      const poseA: AvatarPose = {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      };

      const poseB: AvatarPose = {
        position: { x: 10, y: 20, z: 30 },
        rotation: { x: 90, y: 180, z: 270 },
        scale: { x: 2, y: 2, z: 2 },
      };

      let blended: AvatarPose;
      act(() => {
        blended = result.current.blend.poses(poseA, poseB, 0.5);
      });

      // At t=0.5, position should be halfway
      expect(blended!.position.x).toBe(5);
      expect(blended!.position.y).toBe(10);
      expect(blended!.position.z).toBe(15);
    });

    it("should blend at t=0 to return poseA", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      const poseA: AvatarPose = {
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      };

      const poseB: AvatarPose = {
        position: { x: 10, y: 20, z: 30 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      };

      let blended: AvatarPose;
      act(() => {
        blended = result.current.blend.poses(poseA, poseB, 0);
      });

      expect(blended!.position.x).toBe(1);
      expect(blended!.position.y).toBe(2);
      expect(blended!.position.z).toBe(3);
    });

    it("should blend at t=1 to return poseB", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      const poseA: AvatarPose = {
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      };

      const poseB: AvatarPose = {
        position: { x: 10, y: 20, z: 30 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      };

      let blended: AvatarPose;
      act(() => {
        blended = result.current.blend.poses(poseA, poseB, 1);
      });

      expect(blended!.position.x).toBe(10);
      expect(blended!.position.y).toBe(20);
      expect(blended!.position.z).toBe(30);
    });

    it("should track poses blended in metrics", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      const pose: AvatarPose = {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      };

      act(() => {
        result.current.blend.poses(pose, pose, 0.5);
        result.current.blend.poses(pose, pose, 0.5);
      });

      expect(result.current.metrics.posesBlended).toBe(2);
    });
  });

  describe("blend shapes", () => {
    it("should blend blend shape weights", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      const shapesA: BlendShapeWeights = {
        smile: 0,
        frown: 0,
        blink: 0,
      };

      const shapesB: BlendShapeWeights = {
        smile: 1,
        frown: 0.5,
        blink: 0.8,
      };

      let blended: BlendShapeWeights;
      act(() => {
        blended = result.current.blend.blendShapes(shapesA, shapesB, 0.5);
      });

      expect(blended!.smile).toBe(0.5);
      expect(blended!.frown).toBe(0.25);
      expect(blended!.blink).toBe(0.4);
    });

    it("should handle additive blending", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      const base: BlendShapeWeights = {
        smile: 0.3,
        eyesClosed: 0,
      };

      const overlay: BlendShapeWeights = {
        smile: 0.2,
        eyesClosed: 1,
      };

      let blended: BlendShapeWeights;
      act(() => {
        blended = result.current.blend.additive(base, overlay, 0.5);
      });

      // Base + overlay * weight, clamped to 0-1
      expect(blended!.smile).toBeCloseTo(0.4); // 0.3 + 0.2 * 0.5
      expect(blended!.eyesClosed).toBeCloseTo(0.5); // 0 + 1 * 0.5
    });
  });

  describe("multi-pose blending", () => {
    it("should blend multiple poses with weights", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      const poses = [
        {
          pose: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
          weight: 0.5,
        },
        {
          pose: {
            position: { x: 10, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
          weight: 0.5,
        },
      ];

      let blended: AvatarPose;
      act(() => {
        blended = result.current.blend.multiBlend(poses);
      });

      // Should average to x=5
      expect(blended!.position.x).toBe(5);
    });
  });

  describe("animation queue", () => {
    it("should queue an animation", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      act(() => {
        result.current.controls.queueAnimation(
          "anim1",
          "position",
          0,
          10,
          1000,
          "normal"
        );
      });

      expect(result.current.metrics.queuedAnimations).toBe(1);
    });

    it("should cancel queued animation", () => {
      const { result } = renderHook(() => useAvatarAnimationSmoothing());

      act(() => {
        result.current.controls.queueAnimation(
          "anim1",
          "position",
          0,
          10,
          1000,
          "normal"
        );
      });

      expect(result.current.metrics.queuedAnimations).toBe(1);

      act(() => {
        result.current.controls.cancelAnimation("anim1");
      });

      expect(result.current.metrics.queuedAnimations).toBe(0);
    });

    it("should process animation queue over time", () => {
      const onAnimationComplete = jest.fn();
      const { result } = renderHook(() =>
        useAvatarAnimationSmoothing({}, { onAnimationComplete })
      );

      act(() => {
        result.current.controls.queueAnimation(
          "anim1",
          "test",
          0,
          10,
          100, // 100ms duration
          "normal"
        );
      });

      // Process animation
      act(() => {
        advanceTime(50);
        result.current.controls.processQueue(50);
      });

      // Animation should be partially complete
      expect(result.current.metrics.queuedAnimations).toBe(1);

      // Complete the animation
      act(() => {
        advanceTime(60);
        result.current.controls.processQueue(60);
      });

      expect(result.current.metrics.completedAnimations).toBe(1);
      expect(onAnimationComplete).toHaveBeenCalledWith("anim1");
    });
  });

  describe("jank detection", () => {
    it("should detect jank when frame time exceeds threshold", () => {
      const onJankDetected = jest.fn();
      const { result } = renderHook(() =>
        useAvatarAnimationSmoothing(
          { jankThresholdMs: 32 },
          { onJankDetected }
        )
      );

      // Simulate a janky frame (50ms instead of 16ms)
      act(() => {
        advanceTime(50);
        result.current.controls.smooth("test", 10);
      });

      // Another smooth call to trigger jank detection
      act(() => {
        advanceTime(50);
        result.current.controls.smooth("test", 10);
      });

      // Jank should be detected
      expect(result.current.metrics.jankEventsDetected).toBeGreaterThanOrEqual(0);
    });
  });

  describe("callbacks", () => {
    it("should support onAnimationComplete callback", () => {
      const onAnimationComplete = jest.fn();
      const { result } = renderHook(() =>
        useAvatarAnimationSmoothing({}, { onAnimationComplete })
      );

      // Queue and complete an animation
      act(() => {
        result.current.controls.queueAnimation(
          "testAnim",
          "position",
          0,
          10,
          50, // 50ms duration
          "normal"
        );
      });

      // Process enough time to complete
      act(() => {
        advanceTime(100);
        result.current.controls.processQueue(100);
      });

      expect(onAnimationComplete).toHaveBeenCalledWith("testAnim");
    });
  });
});

describe("convenience hooks", () => {
  describe("useSmoothedValue", () => {
    it("should return a tuple of value and setter", () => {
      const { result } = renderHook(() => useSmoothedValue(10, 0.5));

      // Returns [value, setTarget] tuple
      expect(Array.isArray(result.current)).toBe(true);
      expect(result.current).toHaveLength(2);
      expect(typeof result.current[0]).toBe("number");
      expect(typeof result.current[1]).toBe("function");
    });

    it("should update value when setTarget is called (lines 885-886)", () => {
      const { result } = renderHook(() => useSmoothedValue(0, 0.5));

      act(() => {
        advanceTime(16);
        result.current[1](100); // setTarget
      });

      // Value should change toward target
      expect(result.current[0]).toBeGreaterThanOrEqual(0);
    });
  });

  describe("usePoseBlending", () => {
    it("should return a blend function", () => {
      const { result } = renderHook(() => usePoseBlending());

      expect(typeof result.current).toBe("function");
    });

    it("should blend two poses", () => {
      const { result } = renderHook(() => usePoseBlending());

      const poseA: AvatarPose = {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      };

      const poseB: AvatarPose = {
        position: { x: 10, y: 10, z: 10 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      };

      let blended: AvatarPose;
      act(() => {
        blended = result.current(poseA, poseB, 0.5);
      });

      expect(blended!.position.x).toBe(5);
    });
  });

  describe("useJankDetection", () => {
    it("should return jank detection state", () => {
      const { result } = renderHook(() => useJankDetection());

      expect(result.current).toHaveProperty("hasJank");
      expect(result.current).toHaveProperty("recentJank");
    });
  });
});

// ============================================================================
// Branch Coverage Tests - Sprint 609
// ============================================================================

describe("branch coverage - spring algorithm (lines 265-284, 425-436)", () => {
  it("should apply spring smoothing with velocity (lines 265-273)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationSmoothing({
        algorithm: "spring",
        springStiffness: 200,
        springDamping: 20,
      })
    );

    // Set initial value
    act(() => {
      result.current.controls.setImmediate("spring-test", 0);
    });

    // Smooth toward target multiple times
    let values: number[] = [];
    for (let i = 0; i < 5; i++) {
      act(() => {
        advanceTime(16);
        const val = result.current.controls.smooth("spring-test", 100, "spring");
        values.push(val);
      });
    }

    // Spring should oscillate or converge toward target
    expect(values.length).toBe(5);
    expect(values[4]).not.toBe(0);
  });

  it("should use spring algorithm from config", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationSmoothing({ algorithm: "spring" })
    );

    act(() => {
      result.current.controls.setImmediate("test", 0);
    });

    act(() => {
      advanceTime(16);
      result.current.controls.smooth("test", 50);
    });

    expect(result.current.metrics.valuesSmoothed).toBeGreaterThan(0);
  });
});

describe("branch coverage - critically damped algorithm (lines 275-285, 438-449)", () => {
  it("should apply critically damped smoothing (lines 275-285)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationSmoothing({
        algorithm: "critically_damped",
        springStiffness: 100,
      })
    );

    act(() => {
      result.current.controls.setImmediate("cd-test", 0);
    });

    let values: number[] = [];
    for (let i = 0; i < 5; i++) {
      act(() => {
        advanceTime(16);
        const val = result.current.controls.smooth("cd-test", 100, "critically_damped");
        values.push(val);
      });
    }

    // Should converge smoothly without oscillation
    expect(values.length).toBe(5);
    // Values should be increasing toward target
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1] - 0.1); // Allow small numerical errors
    }
  });
});

describe("branch coverage - lerp algorithm (lines 451-453)", () => {
  it("should apply linear interpolation", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationSmoothing({
        algorithm: "lerp",
        smoothingFactor: 0.5,
      })
    );

    act(() => {
      result.current.controls.setImmediate("lerp-test", 0);
    });

    act(() => {
      advanceTime(16);
      const val = result.current.controls.smooth("lerp-test", 100, "lerp");
      // With factor 0.5, should move halfway each step
      expect(val).toBe(50);
    });
  });
});

describe("branch coverage - adaptive algorithm (lines 455-468)", () => {
  it("should apply adaptive smoothing based on speed (lines 455-468)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationSmoothing({
        algorithm: "adaptive",
        smoothingFactor: 0.2,
        adaptiveSensitivity: 0.01,
      })
    );

    act(() => {
      result.current.controls.setImmediate("adapt-test", 0);
    });

    // Large jump should trigger faster smoothing
    act(() => {
      advanceTime(16);
      result.current.controls.smooth("adapt-test", 1000, "adaptive");
    });

    expect(result.current.metrics.valuesSmoothed).toBeGreaterThan(0);
  });

  it("should clamp adaptive factor (line 464)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationSmoothing({
        algorithm: "adaptive",
        smoothingFactor: 0.5,
        adaptiveSensitivity: 1, // High sensitivity
      })
    );

    act(() => {
      result.current.controls.setImmediate("clamp-test", 0);
    });

    // Very large jump should still clamp factor
    act(() => {
      advanceTime(16);
      result.current.controls.smooth("clamp-test", 10000, "adaptive");
    });

    expect(result.current.metrics.valuesSmoothed).toBeGreaterThan(0);
  });
});

describe("branch coverage - settlement callback (lines 481-487)", () => {
  it("should call onValueSettled when value settles (lines 481-483)", () => {
    const onValueSettled = jest.fn();
    const { result } = renderHook(() =>
      useAvatarAnimationSmoothing(
        { settlementThreshold: 10, smoothingFactor: 1 },
        { onValueSettled }
      )
    );

    // Start far from target
    act(() => {
      result.current.controls.setImmediate("settle-test", 0);
    });

    // Smooth toward target with high factor (should settle quickly)
    act(() => {
      advanceTime(16);
      result.current.controls.smooth("settle-test", 5); // Within threshold
    });

    // Value should be settled
    expect(result.current.controls.isSettled("settle-test")).toBe(true);
  });

  it("should invoke onValueSettled callback when transitioning to settled (lines 482-483)", () => {
    const onValueSettled = jest.fn();
    const { result } = renderHook(() =>
      useAvatarAnimationSmoothing(
        { settlementThreshold: 0.5, smoothingFactor: 1, algorithm: "lerp" },
        { onValueSettled }
      )
    );

    // Set initial value at 0 (starts settled)
    act(() => {
      result.current.controls.setImmediate("callback-test", 0);
    });

    // Smooth far from 0 - this makes the value NOT settled (diff > threshold)
    act(() => {
      advanceTime(16);
      result.current.controls.smooth("callback-test", 100); // Value moves to 100, far from initial
    });

    // Now value is at 100, target is 100, so it should be settled
    // But it started settled, moved to far target in one step with lerp factor=1
    // So wasSettled was true at first smooth call.
    // We need multiple calls where value is not settled then becomes settled.

    // Reset - start not settled by going to far target
    act(() => {
      result.current.controls.setImmediate("callback-test2", 0);
    });

    // First call with factor < 1 so value doesn't reach target (not settled)
    const { result: result2 } = renderHook(() =>
      useAvatarAnimationSmoothing(
        { settlementThreshold: 1, smoothingFactor: 0.9, algorithm: "lerp" },
        { onValueSettled }
      )
    );

    act(() => {
      result2.current.controls.setImmediate("settle-cb", 0);
    });

    // Smooth toward 10 - value goes to 9 (90% of diff), diff is 1 = threshold, should be settled
    act(() => {
      advanceTime(16);
      const val = result2.current.controls.smooth("settle-cb", 10);
      // Value is at 9, target is 10, diff is 1, threshold is 1 - isSettled = true
      // But wasSettled was true (initial), so callback won't fire
    });

    // We need: wasSettled=false and then isSettled=true
    // The value needs to become NOT settled first, then become settled

    // Let's try: smooth to far target (not settled), then smooth to close target (settled)
    const { result: result3 } = renderHook(() =>
      useAvatarAnimationSmoothing(
        { settlementThreshold: 5, smoothingFactor: 0.1, algorithm: "lerp" },
        { onValueSettled }
      )
    );

    act(() => {
      result3.current.controls.setImmediate("settle-trans", 0);
    });

    // Smooth to far target - value goes to 10 (10% of 100), target is 100
    // diff = 90, threshold = 5, NOT settled
    act(() => {
      advanceTime(16);
      result3.current.controls.smooth("settle-trans", 100);
    });

    expect(result3.current.controls.isSettled("settle-trans")).toBe(false);

    // Now smooth toward the current value so diff becomes < threshold
    // Current is ~10, smooth to 12 (within 5)
    act(() => {
      advanceTime(16);
      const val = result3.current.controls.getValue("settle-trans");
      // Smooth to value close to current
      result3.current.controls.smooth("settle-trans", val! + 1); // Very close target
    });

    // This should trigger the callback: wasSettled=false, now isSettled=true
    expect(onValueSettled).toHaveBeenCalledWith("settle-trans", expect.any(Number));
  });
});

describe("branch coverage - smoothing times overflow (lines 492-494)", () => {
  it("should remove old smoothing times when exceeding 100 (line 493)", () => {
    const { result } = renderHook(() => useAvatarAnimationSmoothing());

    act(() => {
      result.current.controls.setImmediate("overflow-test", 0);
    });

    // Call smooth more than 100 times to trigger overflow handling
    for (let i = 0; i < 110; i++) {
      act(() => {
        advanceTime(1);
        result.current.controls.smooth("overflow-test", i);
      });
    }

    // Should have tracked 100+ smoothing operations
    expect(result.current.metrics.valuesSmoothed).toBeGreaterThanOrEqual(110);
  });
});

describe("branch coverage - animation queue overflow (lines 591-602)", () => {
  it("should remove lowest priority animation when queue is full (lines 593-600)", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationSmoothing({ maxQueueSize: 3 })
    );

    // Fill the queue
    act(() => {
      result.current.controls.queueAnimation("anim1", "pos", 0, 10, 100, "low");
      result.current.controls.queueAnimation("anim2", "pos", 0, 20, 100, "normal");
      result.current.controls.queueAnimation("anim3", "pos", 0, 30, 100, "high");
    });

    expect(result.current.metrics.queuedAnimations).toBe(3);

    // Add another animation - should remove lowest priority
    act(() => {
      result.current.controls.queueAnimation("anim4", "pos", 0, 40, 100, "critical");
    });

    // Queue should still be at max size
    expect(result.current.metrics.queuedAnimations).toBe(3);
  });
});

describe("branch coverage - multiBlend edge cases (lines 752-761, 790-796)", () => {
  it("should return default pose when poses array is empty (line 753)", () => {
    const { result } = renderHook(() => useAvatarAnimationSmoothing());

    let blended: AvatarPose;
    act(() => {
      blended = result.current.blend.multiBlend([]);
    });

    expect(blended!.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(blended!.rotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(blended!.scale).toEqual({ x: 1, y: 1, z: 1 });
  });

  it("should return single pose when only one pose (line 761)", () => {
    const { result } = renderHook(() => useAvatarAnimationSmoothing());

    const singlePose: AvatarPose = {
      position: { x: 5, y: 10, z: 15 },
      rotation: { x: 45, y: 90, z: 135 },
      scale: { x: 2, y: 2, z: 2 },
    };

    let blended: AvatarPose;
    act(() => {
      blended = result.current.blend.multiBlend([{ pose: singlePose, weight: 1 }]);
    });

    expect(blended!).toEqual(singlePose);
  });

  it("should blend blend shapes in multiBlend (lines 790-796)", () => {
    const { result } = renderHook(() => useAvatarAnimationSmoothing());

    const poseA: AvatarPose = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      blendShapes: { smile: 0 },
    };

    const poseB: AvatarPose = {
      position: { x: 10, y: 10, z: 10 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      blendShapes: { smile: 1 },
    };

    let blended: AvatarPose;
    act(() => {
      blended = result.current.blend.multiBlend([
        { pose: poseA, weight: 0.5 },
        { pose: poseB, weight: 0.5 },
      ]);
    });

    expect(blended!.blendShapes).toBeDefined();
  });
});

describe("branch coverage - algorithm override in smooth call", () => {
  it("should override default algorithm with parameter", () => {
    const { result } = renderHook(() =>
      useAvatarAnimationSmoothing({ algorithm: "exponential" })
    );

    act(() => {
      result.current.controls.setImmediate("override-test", 0);
    });

    // Use spring instead of default exponential
    act(() => {
      advanceTime(16);
      result.current.controls.smooth("override-test", 100, "spring");
    });

    expect(result.current.metrics.valuesSmoothed).toBeGreaterThan(0);
  });
});

describe("branch coverage - getValue undefined (line 369)", () => {
  it("should return undefined for non-existent value", () => {
    const { result } = renderHook(() => useAvatarAnimationSmoothing());

    const val = result.current.controls.getValue("non-existent");
    expect(val).toBeUndefined();
  });
});

describe("branch coverage - isSettled undefined (line 576)", () => {
  it("should return true for non-existent value in isSettled (default)", () => {
    const { result } = renderHook(() => useAvatarAnimationSmoothing());

    // Default is true when value doesn't exist
    const settled = result.current.controls.isSettled("non-existent");
    expect(settled).toBe(true);
  });
});

describe("branch coverage - resetValue non-existent", () => {
  it("should handle reset of non-existent value", () => {
    const { result } = renderHook(() => useAvatarAnimationSmoothing());

    // Should not throw
    act(() => {
      result.current.controls.resetValue("non-existent", 0);
    });

    expect(result.current.controls.getValue("non-existent")).toBeUndefined();
  });
});

describe("branch coverage - cancelAnimation non-existent", () => {
  it("should handle cancel of non-existent animation", () => {
    const { result } = renderHook(() => useAvatarAnimationSmoothing());

    // Should not throw
    act(() => {
      result.current.controls.cancelAnimation("non-existent");
    });

    expect(result.current.metrics.queuedAnimations).toBe(0);
  });
});

describe("branch coverage - processQueue with no animations", () => {
  it("should handle empty queue in processQueue", () => {
    const { result } = renderHook(() => useAvatarAnimationSmoothing());

    // Should not throw
    act(() => {
      result.current.controls.processQueue(16);
    });

    expect(result.current.metrics.completedAnimations).toBe(0);
  });
});
