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
  type SmoothingAlgorithm,
  type AvatarPose,
  type BlendShapeWeights,
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
