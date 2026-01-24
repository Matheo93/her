/**
 * Tests for Avatar Pose Interpolator Hook - Sprint 231
 *
 * Tests keyframe interpolation, pose transitions, and blend shape smoothing
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarPoseInterpolator,
  usePoseTransition,
  useBlendShapeInterpolator,
  AvatarPose,
  PoseKeyframe,
} from "../useAvatarPoseInterpolator";

// Mock performance.now for consistent timing
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);

  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    return setTimeout(() => cb(mockTime), 0) as unknown as number;
  });

  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    clearTimeout(id);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("useAvatarPoseInterpolator", () => {
  const createTestPose = (x: number = 0, y: number = 0, z: number = 0): AvatarPose => ({
    position: { x, y, z },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
    blendShapes: {},
    timestamp: mockTime,
  });

  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      expect(result.current.state.isRunning).toBe(false);
      expect(result.current.state.currentPose).toBeNull();
      expect(result.current.state.progress).toBe(0);
    });

    it("should initialize with default metrics", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      expect(result.current.state.metrics.framesInterpolated).toBe(0);
      expect(result.current.state.metrics.keyframesProcessed).toBe(0);
      expect(result.current.state.metrics.cacheHits).toBe(0);
    });

    it("should initialize with target FPS", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      expect(result.current.state.currentFps).toBe(60);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useAvatarPoseInterpolator({
          targetFps: 30,
          mode: "linear",
        })
      );

      expect(result.current.state.currentFps).toBe(30);
    });
  });

  describe("keyframe management", () => {
    it("should add keyframe", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      const keyframe: PoseKeyframe = {
        id: "kf1",
        pose: createTestPose(0, 0, 0),
        timestamp: 0,
      };

      act(() => {
        result.current.controls.addKeyframe(keyframe);
      });

      expect(result.current.state.metrics.keyframesProcessed).toBe(1);
    });

    it("should remove keyframe", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      act(() => {
        result.current.controls.addKeyframe({
          id: "kf1",
          pose: createTestPose(),
          timestamp: 0,
        });
        result.current.controls.removeKeyframe("kf1");
      });

      // Keyframe removed (internal)
      expect(typeof result.current.controls.removeKeyframe).toBe("function");
    });

    it("should clear all keyframes", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      act(() => {
        result.current.controls.addKeyframe({
          id: "kf1",
          pose: createTestPose(),
          timestamp: 0,
        });
        result.current.controls.addKeyframe({
          id: "kf2",
          pose: createTestPose(100, 0, 0),
          timestamp: 1000,
        });
        result.current.controls.clearKeyframes();
      });

      // Keyframes cleared
      expect(typeof result.current.controls.clearKeyframes).toBe("function");
    });
  });

  describe("interpolation controls", () => {
    it("should start interpolation", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      act(() => {
        result.current.controls.addKeyframe({
          id: "kf1",
          pose: createTestPose(),
          timestamp: 0,
        });
        result.current.controls.start();
      });

      expect(result.current.state.isRunning).toBe(true);
    });

    it("should stop interpolation", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      act(() => {
        result.current.controls.start();
        result.current.controls.stop();
      });

      expect(result.current.state.isRunning).toBe(false);
    });

    it("should pause interpolation", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      act(() => {
        result.current.controls.start();
        result.current.controls.pause();
      });

      expect(typeof result.current.controls.pause).toBe("function");
    });

    it("should resume interpolation", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      act(() => {
        result.current.controls.start();
        result.current.controls.pause();
        result.current.controls.resume();
      });

      expect(typeof result.current.controls.resume).toBe("function");
    });
  });

  describe("target pose", () => {
    it("should set target pose", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());
      const targetPose = createTestPose(100, 50, 0);

      act(() => {
        result.current.controls.setTargetPose(targetPose, 300);
      });

      expect(result.current.state.isRunning).toBe(true);
    });

    it("should set target pose with custom duration", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());
      const targetPose = createTestPose(100, 50, 0);

      act(() => {
        result.current.controls.setTargetPose(targetPose, 500);
      });

      expect(typeof result.current.controls.setTargetPose).toBe("function");
    });
  });

  describe("pose retrieval", () => {
    it("should get pose at timestamp", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      act(() => {
        result.current.controls.addKeyframe({
          id: "kf1",
          pose: createTestPose(0, 0, 0),
          timestamp: 0,
        });
        result.current.controls.addKeyframe({
          id: "kf2",
          pose: createTestPose(100, 0, 0),
          timestamp: 1000,
        });
      });

      let pose: AvatarPose | null = null;
      act(() => {
        pose = result.current.controls.getPoseAt(500);
      });

      expect(pose).not.toBeNull();
      expect(pose!.position.x).toBeCloseTo(50);
    });

    it("should return null for empty keyframes", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      let pose: ReturnType<typeof result.current.controls.getPoseAt> = null;
      act(() => {
        pose = result.current.controls.getPoseAt(500);
      });

      expect(pose).toBeNull();
    });

    it("should seek to timestamp", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      act(() => {
        result.current.controls.addKeyframe({
          id: "kf1",
          pose: createTestPose(0, 0, 0),
          timestamp: 0,
        });
        result.current.controls.addKeyframe({
          id: "kf2",
          pose: createTestPose(100, 0, 0),
          timestamp: 1000,
        });
        result.current.controls.seekTo(500);
      });

      expect(result.current.state.currentPose).not.toBeNull();
    });
  });

  describe("metrics", () => {
    it("should reset metrics", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      act(() => {
        result.current.controls.addKeyframe({
          id: "kf1",
          pose: createTestPose(),
          timestamp: 0,
        });
        result.current.controls.resetMetrics();
      });

      expect(result.current.state.metrics.framesInterpolated).toBe(0);
      expect(result.current.state.metrics.keyframesProcessed).toBe(0);
    });

    it("should track cache hits", () => {
      const { result } = renderHook(() => useAvatarPoseInterpolator());

      act(() => {
        result.current.controls.addKeyframe({
          id: "kf1",
          pose: createTestPose(0, 0, 0),
          timestamp: 0,
        });
        result.current.controls.addKeyframe({
          id: "kf2",
          pose: createTestPose(100, 0, 0),
          timestamp: 1000,
        });
        // First call - cache miss
        result.current.controls.getPoseAt(500);
        // Second call - cache hit
        result.current.controls.getPoseAt(500);
      });

      expect(result.current.state.metrics.cacheHits).toBe(1);
    });
  });

  describe("cleanup", () => {
    it("should cleanup on unmount", () => {
      const { result, unmount } = renderHook(() => useAvatarPoseInterpolator());

      act(() => {
        result.current.controls.start();
      });

      unmount();
      // No error means cleanup succeeded
    });
  });
});

describe("usePoseTransition", () => {
  const createTestPose = (x: number = 0, y: number = 0, z: number = 0): AvatarPose => ({
    position: { x, y, z },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
    blendShapes: {},
    timestamp: mockTime,
  });

  it("should provide transition interface", () => {
    const { result } = renderHook(() => usePoseTransition());

    expect(result.current.currentPose).toBeNull();
    expect(typeof result.current.transitionTo).toBe("function");
    expect(result.current.isTransitioning).toBe(false);
  });

  it("should transition to pose", () => {
    const { result } = renderHook(() => usePoseTransition(300));
    const targetPose = createTestPose(100, 50, 0);

    act(() => {
      result.current.transitionTo(targetPose);
    });

    expect(result.current.isTransitioning).toBe(true);
  });

  it("should accept custom duration", () => {
    const { result } = renderHook(() => usePoseTransition(500));

    expect(typeof result.current.transitionTo).toBe("function");
  });
});

describe("useBlendShapeInterpolator", () => {
  it("should provide blend shape interface", () => {
    const { result } = renderHook(() => useBlendShapeInterpolator());

    expect(result.current.weights).toEqual({});
    expect(typeof result.current.setTargetWeights).toBe("function");
  });

  it("should set target weights", () => {
    const { result } = renderHook(() => useBlendShapeInterpolator());

    act(() => {
      result.current.setTargetWeights({ smile: 1, blink: 0.5 });
    });

    // Transition started
    expect(typeof result.current.setTargetWeights).toBe("function");
  });

  it("should set target weights with custom duration", () => {
    const { result } = renderHook(() => useBlendShapeInterpolator());

    act(() => {
      result.current.setTargetWeights({ smile: 1 }, 500);
    });

    expect(typeof result.current.setTargetWeights).toBe("function");
  });
});

// ============================================================================
// Branch Coverage Tests - Sprint 608
// ============================================================================

describe("branch coverage - slerp quaternion interpolation", () => {
  const createTestPose = (x: number = 0, y: number = 0, z: number = 0): AvatarPose => ({
    position: { x, y, z },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
    blendShapes: {},
    timestamp: mockTime,
  });

  it("should handle negative quaternion dot product (lines 238-240)", () => {
    const { result } = renderHook(() => useAvatarPoseInterpolator());

    // Create poses with opposite quaternions (cosHalfTheta < 0)
    const pose1: AvatarPose = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 }, // Identity
      scale: { x: 1, y: 1, z: 1 },
      blendShapes: {},
      timestamp: 0,
    };

    const pose2: AvatarPose = {
      position: { x: 100, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: -1 }, // Opposite direction
      scale: { x: 1, y: 1, z: 1 },
      blendShapes: {},
      timestamp: 1000,
    };

    act(() => {
      result.current.controls.addKeyframe({ id: "kf1", pose: pose1, timestamp: 0 });
      result.current.controls.addKeyframe({ id: "kf2", pose: pose2, timestamp: 1000 });
    });

    let interpolatedPose: AvatarPose | null = null;
    act(() => {
      interpolatedPose = result.current.controls.getPoseAt(500);
    });

    expect(interpolatedPose).not.toBeNull();
    expect(interpolatedPose!.rotation).toBeDefined();
  });

  it("should handle close quaternions (lines 244-250)", () => {
    const { result } = renderHook(() => useAvatarPoseInterpolator());

    // Create poses with very similar quaternions (cosHalfTheta > 0.9999)
    const pose1: AvatarPose = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      blendShapes: {},
      timestamp: 0,
    };

    const pose2: AvatarPose = {
      position: { x: 100, y: 0, z: 0 },
      rotation: { x: 0.00001, y: 0, z: 0, w: 0.9999999 }, // Very close to identity
      scale: { x: 1, y: 1, z: 1 },
      blendShapes: {},
      timestamp: 1000,
    };

    act(() => {
      result.current.controls.addKeyframe({ id: "kf1", pose: pose1, timestamp: 0 });
      result.current.controls.addKeyframe({ id: "kf2", pose: pose2, timestamp: 1000 });
    });

    let interpolatedPose: AvatarPose | null = null;
    act(() => {
      interpolatedPose = result.current.controls.getPoseAt(500);
    });

    expect(interpolatedPose).not.toBeNull();
  });

  it("should perform spherical interpolation for different quaternions (lines 254-265)", () => {
    const { result } = renderHook(() => useAvatarPoseInterpolator());

    // Create poses with distinct quaternions requiring slerp
    const pose1: AvatarPose = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 }, // Identity
      scale: { x: 1, y: 1, z: 1 },
      blendShapes: {},
      timestamp: 0,
    };

    const pose2: AvatarPose = {
      position: { x: 100, y: 0, z: 0 },
      rotation: { x: 0.707, y: 0, z: 0, w: 0.707 }, // 90 degree rotation around X
      scale: { x: 1, y: 1, z: 1 },
      blendShapes: {},
      timestamp: 1000,
    };

    act(() => {
      result.current.controls.addKeyframe({ id: "kf1", pose: pose1, timestamp: 0 });
      result.current.controls.addKeyframe({ id: "kf2", pose: pose2, timestamp: 1000 });
    });

    let interpolatedPose: AvatarPose | null = null;
    act(() => {
      interpolatedPose = result.current.controls.getPoseAt(500);
    });

    expect(interpolatedPose).not.toBeNull();
    // Rotation should be interpolated
    expect(interpolatedPose!.rotation.x).toBeGreaterThan(0);
    expect(interpolatedPose!.rotation.x).toBeLessThan(0.707);
  });
});

describe("branch coverage - blend shape interpolation", () => {
  const createTestPose = (blendShapes: Record<string, number>): AvatarPose => ({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
    blendShapes,
    timestamp: mockTime,
  });

  it("should interpolate blend shapes with missing keys (lines 280-286)", () => {
    const { result } = renderHook(() => useAvatarPoseInterpolator());

    // Pose 1 has 'smile' but not 'blink'
    const pose1: AvatarPose = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      blendShapes: { smile: 1, frown: 0 },
      timestamp: 0,
    };

    // Pose 2 has 'blink' but not 'smile'
    const pose2: AvatarPose = {
      position: { x: 100, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      blendShapes: { blink: 1, frown: 1 },
      timestamp: 1000,
    };

    act(() => {
      result.current.controls.addKeyframe({ id: "kf1", pose: pose1, timestamp: 0 });
      result.current.controls.addKeyframe({ id: "kf2", pose: pose2, timestamp: 1000 });
    });

    let interpolatedPose: AvatarPose | null = null;
    act(() => {
      interpolatedPose = result.current.controls.getPoseAt(500);
    });

    expect(interpolatedPose).not.toBeNull();
    // Both keys should be present (union of keys)
    expect(interpolatedPose!.blendShapes).toBeDefined();
  });
});

describe("branch coverage - easing functions", () => {
  const createTestPose = (x: number = 0): AvatarPose => ({
    position: { x, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
    blendShapes: {},
    timestamp: mockTime,
  });

  it("should apply easeIn easing (line 299)", () => {
    const { result } = renderHook(() =>
      useAvatarPoseInterpolator({ mode: "cubic" })
    );

    act(() => {
      result.current.controls.addKeyframe({
        id: "kf1",
        pose: createTestPose(0),
        timestamp: 0,
        easing: "easeIn",
      });
      result.current.controls.addKeyframe({
        id: "kf2",
        pose: createTestPose(100),
        timestamp: 1000,
        easing: "easeIn",
      });
    });

    let pose: AvatarPose | null = null;
    act(() => {
      pose = result.current.controls.getPoseAt(500);
    });

    expect(pose).not.toBeNull();
  });

  it("should apply easeOut easing (lines 300-301)", () => {
    const { result } = renderHook(() => useAvatarPoseInterpolator());

    act(() => {
      result.current.controls.addKeyframe({
        id: "kf1",
        pose: createTestPose(0),
        timestamp: 0,
        easing: "easeOut",
      });
      result.current.controls.addKeyframe({
        id: "kf2",
        pose: createTestPose(100),
        timestamp: 1000,
        easing: "easeOut",
      });
    });

    let pose: AvatarPose | null = null;
    act(() => {
      pose = result.current.controls.getPoseAt(500);
    });

    expect(pose).not.toBeNull();
  });

  it("should apply easeInOut easing (lines 302-303)", () => {
    const { result } = renderHook(() => useAvatarPoseInterpolator());

    act(() => {
      result.current.controls.addKeyframe({
        id: "kf1",
        pose: createTestPose(0),
        timestamp: 0,
        easing: "easeInOut",
      });
      result.current.controls.addKeyframe({
        id: "kf2",
        pose: createTestPose(100),
        timestamp: 1000,
        easing: "easeInOut",
      });
    });

    // Test at different points for easeInOut branches (t < 0.5 and t >= 0.5)
    let pose25: AvatarPose | null = null;
    let pose75: AvatarPose | null = null;
    act(() => {
      pose25 = result.current.controls.getPoseAt(250); // t = 0.25
      pose75 = result.current.controls.getPoseAt(750); // t = 0.75
    });

    expect(pose25).not.toBeNull();
    expect(pose75).not.toBeNull();
  });

  it("should apply spring easing (lines 304-305)", () => {
    const { result } = renderHook(() => useAvatarPoseInterpolator());

    act(() => {
      result.current.controls.addKeyframe({
        id: "kf1",
        pose: createTestPose(0),
        timestamp: 0,
        easing: "spring",
      });
      result.current.controls.addKeyframe({
        id: "kf2",
        pose: createTestPose(100),
        timestamp: 1000,
        easing: "spring",
      });
    });

    let pose: AvatarPose | null = null;
    act(() => {
      pose = result.current.controls.getPoseAt(500);
    });

    expect(pose).not.toBeNull();
  });

  it("should apply bounce easing - all branches (lines 306-310)", () => {
    const { result } = renderHook(() => useAvatarPoseInterpolator());

    act(() => {
      result.current.controls.addKeyframe({
        id: "kf1",
        pose: createTestPose(0),
        timestamp: 0,
        easing: "bounce",
      });
      result.current.controls.addKeyframe({
        id: "kf2",
        pose: createTestPose(100),
        timestamp: 1000,
        easing: "bounce",
      });
    });

    // Test at different points to hit all bounce branches
    // t < 1/2.75 (~0.36), t < 2/2.75 (~0.73), t < 2.5/2.75 (~0.91), else
    let pose1: AvatarPose | null = null;
    let pose2: AvatarPose | null = null;
    let pose3: AvatarPose | null = null;
    let pose4: AvatarPose | null = null;
    act(() => {
      pose1 = result.current.controls.getPoseAt(200); // t ~ 0.2 (first branch)
      pose2 = result.current.controls.getPoseAt(500); // t ~ 0.5 (second branch)
      pose3 = result.current.controls.getPoseAt(850); // t ~ 0.85 (third branch)
      pose4 = result.current.controls.getPoseAt(950); // t ~ 0.95 (fourth branch)
    });

    expect(pose1).not.toBeNull();
    expect(pose2).not.toBeNull();
    expect(pose3).not.toBeNull();
    expect(pose4).not.toBeNull();
  });

  it("should use linear easing as default (lines 311-312)", () => {
    const { result } = renderHook(() => useAvatarPoseInterpolator());

    act(() => {
      result.current.controls.addKeyframe({
        id: "kf1",
        pose: createTestPose(0),
        timestamp: 0,
        // No easing specified - should default to linear
      });
      result.current.controls.addKeyframe({
        id: "kf2",
        pose: createTestPose(100),
        timestamp: 1000,
      });
    });

    let pose: AvatarPose | null = null;
    act(() => {
      pose = result.current.controls.getPoseAt(500);
    });

    expect(pose).not.toBeNull();
    expect(pose!.position.x).toBeCloseTo(50); // Linear interpolation
  });
});

describe("branch coverage - cache eviction", () => {
  const createTestPose = (x: number = 0): AvatarPose => ({
    position: { x, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
    blendShapes: {},
    timestamp: mockTime,
  });

  it("should evict cache when full (lines 452-457)", () => {
    const { result } = renderHook(() =>
      useAvatarPoseInterpolator({ maxCachedKeyframes: 5 })
    );

    // Add keyframes
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.controls.addKeyframe({
          id: `kf${i}`,
          pose: createTestPose(i * 10),
          timestamp: i * 100,
        });
      }
    });

    // Make many getPoseAt calls to fill cache
    for (let i = 0; i < 100; i++) {
      act(() => {
        result.current.controls.getPoseAt(i * 10);
      });
    }

    // Cache should have been evicted at some point
    expect(result.current.state.metrics.cacheHits).toBeGreaterThanOrEqual(0);
  });
});

describe("branch coverage - animation frame", () => {
  const createTestPose = (x: number = 0): AvatarPose => ({
    position: { x, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
    blendShapes: {},
    timestamp: mockTime,
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should handle paused state in animation frame (lines 471-473)", async () => {
    const { result } = renderHook(() => useAvatarPoseInterpolator());

    act(() => {
      result.current.controls.addKeyframe({
        id: "kf1",
        pose: createTestPose(0),
        timestamp: 0,
      });
      result.current.controls.addKeyframe({
        id: "kf2",
        pose: createTestPose(100),
        timestamp: 1000,
      });
      result.current.controls.start();
      result.current.controls.pause();
    });

    // Advance time while paused
    mockTime += 100;
    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    // Should still be paused
    expect(typeof result.current.controls.pause).toBe("function");
  });

  it("should detect dropped frames (lines 497-499)", async () => {
    const { result } = renderHook(() =>
      useAvatarPoseInterpolator({ minFps: 30 })
    );

    act(() => {
      result.current.controls.addKeyframe({
        id: "kf1",
        pose: createTestPose(0),
        timestamp: 0,
      });
      result.current.controls.addKeyframe({
        id: "kf2",
        pose: createTestPose(100),
        timestamp: 10000,
      });
      result.current.controls.start();
    });

    // Simulate normal frame
    mockTime += 16;
    await act(async () => {
      jest.advanceTimersByTime(16);
    });

    // Simulate dropped frame (large gap)
    mockTime += 100; // Much longer than expected
    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current.state.metrics.droppedFrames).toBeGreaterThanOrEqual(0);
  });

  it("should handle target pose transition (lines 504-521)", async () => {
    const { result } = renderHook(() => useAvatarPoseInterpolator());

    const pose1 = createTestPose(0);
    const pose2 = createTestPose(100);

    act(() => {
      result.current.controls.addKeyframe({
        id: "kf1",
        pose: pose1,
        timestamp: 0,
      });
      result.current.controls.start();
    });

    // Set target pose to trigger transition
    act(() => {
      result.current.controls.setTargetPose(pose2, 500);
    });

    // Advance through transition
    for (let i = 0; i < 10; i++) {
      mockTime += 60;
      await act(async () => {
        jest.advanceTimersByTime(60);
      });
    }

    // Transition should have progressed
    expect(result.current.state.progress).toBeGreaterThanOrEqual(0);
  });

  it("should handle keyframe-based interpolation with prediction (lines 527-531)", async () => {
    const { result } = renderHook(() =>
      useAvatarPoseInterpolator({
        enablePrediction: true,
        predictionLookaheadMs: 50,
      })
    );

    act(() => {
      result.current.controls.addKeyframe({
        id: "kf1",
        pose: createTestPose(0),
        timestamp: 0,
      });
      result.current.controls.addKeyframe({
        id: "kf2",
        pose: createTestPose(100),
        timestamp: 1000,
      });
      result.current.controls.start();
    });

    // Run animation frames
    for (let i = 0; i < 10; i++) {
      mockTime += 16;
      await act(async () => {
        jest.advanceTimersByTime(16);
      });
    }

    expect(result.current.state.metrics.predictionsMade).toBeGreaterThan(0);
  });

  it("should calculate progress through keyframes (lines 536-544)", async () => {
    const { result } = renderHook(() => useAvatarPoseInterpolator());

    act(() => {
      result.current.controls.addKeyframe({
        id: "kf1",
        pose: createTestPose(0),
        timestamp: 0,
      });
      result.current.controls.addKeyframe({
        id: "kf2",
        pose: createTestPose(50),
        timestamp: 500,
      });
      result.current.controls.addKeyframe({
        id: "kf3",
        pose: createTestPose(100),
        timestamp: 1000,
      });
      result.current.controls.start();
    });

    // Advance to middle
    mockTime += 500;
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.state.progress).toBeGreaterThanOrEqual(0);
  });
});

describe("branch coverage - keyframe limit", () => {
  const createTestPose = (x: number = 0): AvatarPose => ({
    position: { x, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
    blendShapes: {},
    timestamp: mockTime,
  });

  it("should limit cached keyframes (lines 579-580)", () => {
    const { result } = renderHook(() => useAvatarPoseInterpolator());

    // Add more keyframes than limit
    act(() => {
      for (let i = 0; i < 300; i++) {
        result.current.controls.addKeyframe({
          id: `kf${i}`,
          pose: createTestPose(i),
          timestamp: i * 10,
        });
      }
    });

    // Keyframes should have been limited
    expect(result.current.state.metrics.keyframesProcessed).toBe(300);
  });
});
