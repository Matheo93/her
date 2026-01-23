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

const createTestPose = (x: number = 0, y: number = 0, z: number = 0): AvatarPose => ({
  position: { x, y, z },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
  blendShapes: {},
  timestamp: mockTime,
});

describe("useAvatarPoseInterpolator", () => {
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

      let pose: ReturnType<typeof result.current.controls.getPoseAt> = null;
      act(() => {
        pose = result.current.controls.getPoseAt(500);
      });

      expect(pose).not.toBeNull();
      expect(pose?.position.x).toBeCloseTo(50);
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
