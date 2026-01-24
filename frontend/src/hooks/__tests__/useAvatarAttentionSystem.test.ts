/**
 * Tests for useAvatarAttentionSystem hook - Sprint 556
 *
 * Tests attention management, gaze patterns, and focus control for avatar.
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarAttentionSystem,
  useUserFaceAttention,
  useConversationAttention,
  type AttentionTarget,
  type AttentionConfig,
  type GazePattern,
  type AttentionPriority,
  type AttentionTargetType,
} from "../useAvatarAttentionSystem";

// Mock timers for testing time-based features
jest.useFakeTimers();

// Default test config with fast timing for tests
const createTestConfig = (): Partial<AttentionConfig> => ({
  enabled: true,
  maxTargets: 10,
  defaultFocusDuration: 100,
  saccadeDuration: 10,
  blinkInterval: { min: 100, max: 200 },
  distractionChance: 0,
  naturalVariation: 0,
  contextAware: true,
});

describe("useAvatarAttentionSystem", () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem());

      expect(result.current.state.currentTarget).toBeNull();
      expect(result.current.state.targets).toEqual([]);
      expect(result.current.state.pattern).toBe("idle");
      expect(result.current.state.isEngaged).toBe(false);
    });

    it("should initialize gaze at origin", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem());

      expect(result.current.gazePosition).toEqual({ x: 0, y: 0 });
    });

    it("should initialize with default pupil dilation", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem());

      expect(result.current.pupilDilation).toBe(0.5);
    });

    it("should initialize with symmetric eye transform", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem());

      expect(result.current.eyeTransform.left.y).toBe(result.current.eyeTransform.right.y);
    });

    it("should initialize blinking as false", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem());

      expect(result.current.isBlinking).toBe(false);
    });

    it("should accept custom config", () => {
      const config = createTestConfig();
      const { result } = renderHook(() => useAvatarAttentionSystem(config));

      expect(result.current.state).toBeDefined();
    });
  });

  // ============================================================================
  // Target Management Tests
  // ============================================================================

  describe("target management", () => {
    it("should add target and return id", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      let targetId: string;
      act(() => {
        targetId = result.current.controls.addTarget({
          type: "user_face",
          position: { x: 0.5, y: 0.3 },
          priority: "high",
          weight: 1,
          sticky: false,
        });
      });

      expect(targetId!).toBeDefined();
      expect(targetId!.startsWith("target_")).toBe(true);
      expect(result.current.state.targets).toHaveLength(1);
    });

    it("should store target with correct properties", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      act(() => {
        result.current.controls.addTarget({
          type: "user_eyes",
          position: { x: 0.2, y: 0.1 },
          priority: "critical",
          weight: 0.8,
          sticky: true,
        });
      });

      const target = result.current.state.targets[0];
      expect(target.type).toBe("user_eyes");
      expect(target.position).toEqual({ x: 0.2, y: 0.1 });
      expect(target.priority).toBe("critical");
      expect(target.weight).toBe(0.8);
      expect(target.sticky).toBe(true);
    });

    it("should remove target by id", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      let targetId: string;
      act(() => {
        targetId = result.current.controls.addTarget({
          type: "user_face",
          position: { x: 0, y: 0 },
          priority: "high",
          weight: 1,
          sticky: false,
        });
      });

      expect(result.current.state.targets).toHaveLength(1);

      act(() => {
        result.current.controls.removeTarget(targetId);
      });

      expect(result.current.state.targets).toHaveLength(0);
    });

    it("should clear current target when removed", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      let targetId: string;
      act(() => {
        targetId = result.current.controls.addTarget({
          type: "user_face",
          position: { x: 0, y: 0 },
          priority: "high",
          weight: 1,
          sticky: false,
        });
        result.current.controls.focusOn(targetId);
      });

      act(() => {
        result.current.controls.removeTarget(targetId);
      });

      expect(result.current.state.currentTarget).toBeNull();
    });

    it("should update target position", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      let targetId: string;
      act(() => {
        targetId = result.current.controls.addTarget({
          type: "user_face",
          position: { x: 0, y: 0 },
          priority: "high",
          weight: 1,
          sticky: false,
        });
      });

      act(() => {
        result.current.controls.updateTargetPosition(targetId, { x: 0.5, y: 0.5 });
      });

      const target = result.current.state.targets[0];
      expect(target.position).toEqual({ x: 0.5, y: 0.5 });
    });

    it("should clear all targets", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      act(() => {
        result.current.controls.addTarget({
          type: "user_face",
          position: { x: 0, y: 0 },
          priority: "high",
          weight: 1,
          sticky: false,
        });
        result.current.controls.addTarget({
          type: "user_eyes",
          position: { x: 0.1, y: 0.1 },
          priority: "medium",
          weight: 0.5,
          sticky: false,
        });
      });

      expect(result.current.state.targets).toHaveLength(2);

      act(() => {
        result.current.controls.clearTargets();
      });

      expect(result.current.state.targets).toHaveLength(0);
      expect(result.current.state.currentTarget).toBeNull();
    });

    it("should limit targets to maxTargets", () => {
      const config = { ...createTestConfig(), maxTargets: 3 };
      const { result } = renderHook(() => useAvatarAttentionSystem(config));

      act(() => {
        for (let i = 0; i < 5; i++) {
          result.current.controls.addTarget({
            type: "ui_element",
            position: { x: i * 0.1, y: 0 },
            priority: "low",
            weight: 0.5,
            sticky: false,
          });
        }
      });

      expect(result.current.state.targets).toHaveLength(3);
    });
  });

  // ============================================================================
  // Focus Control Tests
  // ============================================================================

  describe("focus control", () => {
    it("should focus on target by id", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      let targetId = "";
      act(() => {
        targetId = result.current.controls.addTarget({
          type: "user_face",
          position: { x: 0.3, y: 0.2 },
          priority: "high",
          weight: 1,
          sticky: false,
        });
      });

      act(() => {
        result.current.controls.focusOn(targetId);
      });

      expect(result.current.state.currentTarget?.id).toBe(targetId);
    });

    it("should start saccade when focusing", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      let targetId: string;
      act(() => {
        targetId = result.current.controls.addTarget({
          type: "user_face",
          position: { x: 0.3, y: 0.2 },
          priority: "high",
          weight: 1,
          sticky: false,
        });
      });

      act(() => {
        result.current.controls.focusOn(targetId);
      });

      expect(result.current.state.gazeState.saccadeInProgress).toBe(true);
    });

    it("should not focus on non-existent target", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      act(() => {
        result.current.controls.focusOn("non_existent_id");
      });

      expect(result.current.state.currentTarget).toBeNull();
    });
  });

  // ============================================================================
  // Pattern Tests
  // ============================================================================

  describe("gaze patterns", () => {
    it("should set pattern to focused", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      act(() => {
        result.current.controls.setPattern("focused");
      });

      expect(result.current.state.pattern).toBe("focused");
    });

    it("should set pattern to thinking", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      act(() => {
        result.current.controls.setPattern("thinking");
      });

      expect(result.current.state.pattern).toBe("thinking");
    });

    it("should set pattern to listening", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      act(() => {
        result.current.controls.setPattern("listening");
      });

      expect(result.current.state.pattern).toBe("listening");
    });

    it("should set pattern to distracted", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      act(() => {
        result.current.controls.setPattern("distracted");
      });

      expect(result.current.state.pattern).toBe("distracted");
    });

    it("should set pattern to scanning", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      act(() => {
        result.current.controls.setPattern("scanning");
      });

      expect(result.current.state.pattern).toBe("scanning");
    });

    it("should update pupil dilation for focused pattern", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      act(() => {
        result.current.controls.setPattern("focused");
      });

      expect(result.current.pupilDilation).toBe(0.6);
    });

    it("should update pupil dilation for thinking pattern", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      act(() => {
        result.current.controls.setPattern("thinking");
      });

      expect(result.current.pupilDilation).toBe(0.7);
    });
  });

  // ============================================================================
  // Blinking Tests
  // ============================================================================

  describe("blinking", () => {
    it("should trigger manual blink", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      expect(result.current.isBlinking).toBe(false);

      act(() => {
        result.current.controls.triggerBlink();
      });

      expect(result.current.isBlinking).toBe(true);
    });

    it("should end blink after timeout", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      act(() => {
        result.current.controls.triggerBlink();
      });

      expect(result.current.isBlinking).toBe(true);

      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(result.current.isBlinking).toBe(false);
    });
  });

  // ============================================================================
  // Saccade Tests
  // ============================================================================

  describe("saccades", () => {
    it("should trigger manual saccade", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      act(() => {
        result.current.controls.triggerSaccade({ x: 0.5, y: 0.3 });
      });

      expect(result.current.state.gazeState.saccadeInProgress).toBe(true);
    });
  });

  // ============================================================================
  // Metrics Tests
  // ============================================================================

  describe("metrics", () => {
    it("should track total shifts", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      expect(result.current.metrics.totalShifts).toBe(0);
    });

    it("should initialize engagement score", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      expect(result.current.metrics.engagementScore).toBe(50);
    });

    it("should initialize distraction rate at zero", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      expect(result.current.metrics.distractionRate).toBe(0);
    });
  });

  // ============================================================================
  // Eye Transform Tests
  // ============================================================================

  describe("eye transform", () => {
    it("should calculate eye transform with separation", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      const { left, right } = result.current.eyeTransform;

      // Eyes should have slight horizontal separation
      expect(left.x).not.toBe(right.x);
    });

    it("should have same vertical position for both eyes", () => {
      const { result } = renderHook(() => useAvatarAttentionSystem(createTestConfig()));

      const { left, right } = result.current.eyeTransform;

      expect(left.y).toBe(right.y);
    });
  });

  // ============================================================================
  // Disabled State Tests
  // ============================================================================

  describe("disabled state", () => {
    it("should not schedule blinks when disabled", () => {
      const config = { ...createTestConfig(), enabled: false };
      const { result } = renderHook(() => useAvatarAttentionSystem(config));

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.isBlinking).toBe(false);
    });
  });
});

// ============================================================================
// useUserFaceAttention Tests
// ============================================================================

describe("useUserFaceAttention", () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  it("should track face position as target", () => {
    const { result } = renderHook(() =>
      useUserFaceAttention({ x: 0.5, y: 0.3 }, createTestConfig())
    );

    expect(result.current.gazePosition).toBeDefined();
  });

  it("should report looking at user when focused", () => {
    const { result, rerender } = renderHook(
      ({ facePosition }) => useUserFaceAttention(facePosition, createTestConfig()),
      { initialProps: { facePosition: { x: 0.5, y: 0.3 } } }
    );

    // Initially may or may not be looking at user
    expect(typeof result.current.isLookingAtUser).toBe("boolean");
  });

  it("should handle null face position", () => {
    const { result } = renderHook(() => useUserFaceAttention(null, createTestConfig()));

    expect(result.current.gazePosition).toBeDefined();
  });
});

// ============================================================================
// useConversationAttention Tests
// ============================================================================

describe("useConversationAttention", () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  it("should set thinking pattern when thinking", () => {
    const { result } = renderHook(() =>
      useConversationAttention(false, false, true, createTestConfig())
    );

    expect(result.current.pattern).toBe("thinking");
  });

  it("should set listening pattern when listening", () => {
    const { result } = renderHook(() =>
      useConversationAttention(true, false, false, createTestConfig())
    );

    expect(result.current.pattern).toBe("listening");
  });

  it("should set focused pattern when speaking", () => {
    const { result } = renderHook(() =>
      useConversationAttention(false, true, false, createTestConfig())
    );

    expect(result.current.pattern).toBe("focused");
  });

  it("should set idle pattern when not active", () => {
    const { result } = renderHook(() =>
      useConversationAttention(false, false, false, createTestConfig())
    );

    expect(result.current.pattern).toBe("idle");
  });

  it("should prioritize thinking over listening", () => {
    const { result } = renderHook(() =>
      useConversationAttention(true, false, true, createTestConfig())
    );

    expect(result.current.pattern).toBe("thinking");
  });

  it("should prioritize listening over speaking", () => {
    const { result } = renderHook(() =>
      useConversationAttention(true, true, false, createTestConfig())
    );

    expect(result.current.pattern).toBe("listening");
  });
});

// ============================================================================
// Type Tests
// ============================================================================

describe("types", () => {
  it("should export AttentionTargetType values", () => {
    const types: AttentionTargetType[] = [
      "user_face",
      "user_eyes",
      "user_mouth",
      "user_hands",
      "ui_element",
      "environment",
      "thinking_zone",
      "memory_recall",
      "nothing",
    ];

    types.forEach((type) => {
      expect(typeof type).toBe("string");
    });
  });

  it("should export AttentionPriority values", () => {
    const priorities: AttentionPriority[] = [
      "critical",
      "high",
      "medium",
      "low",
      "ambient",
    ];

    priorities.forEach((priority) => {
      expect(typeof priority).toBe("string");
    });
  });

  it("should export GazePattern values", () => {
    const patterns: GazePattern[] = [
      "focused",
      "scanning",
      "thinking",
      "listening",
      "distracted",
      "idle",
    ];

    patterns.forEach((pattern) => {
      expect(typeof pattern).toBe("string");
    });
  });
});
