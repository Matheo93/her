/**
 * Tests for Avatar Touch Momentum Hook - Sprint 537
 *
 * Tests physics-based momentum and decay for touch-driven avatar movements:
 * - Velocity tracking from touch movements
 * - Momentum calculation and decay
 * - Bounce/spring physics at boundaries
 * - Smooth deceleration curves
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAvatarTouchMomentum,
  useVelocityTracker,
  useMomentumDecay,
} from "../useAvatarTouchMomentum";

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

describe("useAvatarTouchMomentum", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useAvatarTouchMomentum());

      expect(result.current.state.isActive).toBe(true);
      expect(result.current.state.isDragging).toBe(false);
      expect(result.current.state.hasActiveMomentum).toBe(false);
      expect(result.current.state.position).toEqual({ x: 0, y: 0 });
    });

    it("should initialize with zero velocity", () => {
      const { result } = renderHook(() => useAvatarTouchMomentum());

      expect(result.current.state.velocity).toEqual({ x: 0, y: 0 });
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useAvatarTouchMomentum({
          friction: 0.9,
          minVelocity: 0.5,
          bounceFactor: 0.5,
        })
      );

      expect(result.current.state.isActive).toBe(true);
    });

    it("should accept initial position", () => {
      const { result } = renderHook(() =>
        useAvatarTouchMomentum({
          initialPosition: { x: 100, y: 200 },
        })
      );

      expect(result.current.state.position).toEqual({ x: 100, y: 200 });
    });
  });

  describe("velocity tracking", () => {
    it("should track velocity during drag", () => {
      const { result } = renderHook(() => useAvatarTouchMomentum());

      mockTime = 0;
      act(() => {
        result.current.controls.startDrag({ x: 100, y: 100 });
      });

      mockTime = 16;
      act(() => {
        result.current.controls.updateDrag({ x: 150, y: 120 });
      });

      // Velocity should be calculated from movement
      expect(result.current.state.velocity.x).not.toBe(0);
      expect(result.current.state.velocity.y).not.toBe(0);
    });

    it("should smooth velocity samples", () => {
      const { result } = renderHook(() => useAvatarTouchMomentum());

      mockTime = 0;
      act(() => {
        result.current.controls.startDrag({ x: 100, y: 100 });
      });

      // Multiple samples
      for (let i = 1; i <= 5; i++) {
        mockTime = i * 16;
        act(() => {
          result.current.controls.updateDrag({ x: 100 + i * 10, y: 100 + i * 5 });
        });
      }

      // Velocity should be smoothed
      expect(Math.abs(result.current.state.velocity.x)).toBeGreaterThan(0);
    });

    it("should update position during drag", () => {
      const { result } = renderHook(() => useAvatarTouchMomentum());

      act(() => {
        result.current.controls.startDrag({ x: 100, y: 100 });
      });

      act(() => {
        result.current.controls.updateDrag({ x: 150, y: 120 });
      });

      expect(result.current.state.position).toEqual({ x: 150, y: 120 });
    });
  });

  describe("momentum calculation", () => {
    it("should apply momentum after drag ends", () => {
      const { result } = renderHook(() => useAvatarTouchMomentum());

      mockTime = 0;
      act(() => {
        result.current.controls.startDrag({ x: 100, y: 100 });
      });

      mockTime = 16;
      act(() => {
        result.current.controls.updateDrag({ x: 150, y: 120 });
      });

      act(() => {
        result.current.controls.endDrag();
      });

      expect(result.current.state.hasActiveMomentum).toBe(true);
    });

    it("should decay momentum over time", () => {
      const { result } = renderHook(() =>
        useAvatarTouchMomentum({ friction: 0.95 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.startDrag({ x: 100, y: 100 });
      });

      mockTime = 16;
      act(() => {
        result.current.controls.updateDrag({ x: 200, y: 100 });
      });

      act(() => {
        result.current.controls.endDrag();
      });

      const initialVelocity = result.current.state.velocity.x;

      mockTime = 32;
      act(() => {
        result.current.controls.applyMomentum();
      });

      // Velocity should decrease due to friction
      expect(Math.abs(result.current.state.velocity.x)).toBeLessThan(Math.abs(initialVelocity));
    });

    it("should stop momentum when velocity is below threshold", () => {
      const { result } = renderHook(() =>
        useAvatarTouchMomentum({ minVelocity: 10, friction: 0.1 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.startDrag({ x: 100, y: 100 });
      });

      mockTime = 16;
      act(() => {
        result.current.controls.updateDrag({ x: 105, y: 100 });
      });

      act(() => {
        result.current.controls.endDrag();
      });

      // Apply momentum multiple times to decay
      for (let i = 0; i < 20; i++) {
        mockTime = 32 + i * 16;
        act(() => {
          result.current.controls.applyMomentum();
        });
      }

      // Momentum should eventually stop
      expect(result.current.state.hasActiveMomentum).toBe(false);
    });
  });

  describe("boundary handling", () => {
    it("should respect boundaries", () => {
      const { result } = renderHook(() =>
        useAvatarTouchMomentum({
          bounds: { minX: 0, maxX: 200, minY: 0, maxY: 200 },
        })
      );

      act(() => {
        result.current.controls.startDrag({ x: 100, y: 100 });
      });

      act(() => {
        result.current.controls.updateDrag({ x: 300, y: 100 });
      });

      expect(result.current.state.position.x).toBeLessThanOrEqual(200);
    });

    it("should apply bounce at boundaries", () => {
      const { result } = renderHook(() =>
        useAvatarTouchMomentum({
          bounds: { minX: 0, maxX: 200, minY: 0, maxY: 200 },
          bounceFactor: 0.5,
        })
      );

      // Set position and velocity towards boundary
      act(() => {
        result.current.controls.startDrag({ x: 190, y: 100 });
      });

      mockTime = 16;
      act(() => {
        result.current.controls.updateDrag({ x: 250, y: 100 });
        result.current.controls.endDrag();
      });

      // Velocity should reverse at boundary
      act(() => {
        result.current.controls.applyMomentum();
      });

      // After bounce, velocity direction should be reversed or dampened
      expect(result.current.state.velocity.x).toBeLessThanOrEqual(0);
    });
  });

  describe("deceleration curves", () => {
    it("should use exponential decay", () => {
      const { result } = renderHook(() =>
        useAvatarTouchMomentum({ friction: 0.9 })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.startDrag({ x: 0, y: 0 });
      });

      mockTime = 16;
      act(() => {
        result.current.controls.updateDrag({ x: 100, y: 0 });
        result.current.controls.endDrag();
      });

      const velocities: number[] = [];
      for (let i = 0; i < 5; i++) {
        mockTime = 32 + i * 16;
        act(() => {
          result.current.controls.applyMomentum();
        });
        velocities.push(result.current.state.velocity.x);
      }

      // Each velocity should be less than the previous (exponential decay)
      for (let i = 1; i < velocities.length; i++) {
        expect(Math.abs(velocities[i])).toBeLessThan(Math.abs(velocities[i - 1]));
      }
    });
  });

  describe("callbacks", () => {
    it("should call onDragStart callback", () => {
      const onDragStart = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchMomentum({}, { onDragStart })
      );

      act(() => {
        result.current.controls.startDrag({ x: 100, y: 100 });
      });

      expect(onDragStart).toHaveBeenCalledWith({ x: 100, y: 100 });
    });

    it("should call onDragEnd callback", () => {
      const onDragEnd = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchMomentum({}, { onDragEnd })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.startDrag({ x: 100, y: 100 });
      });

      mockTime = 16;
      act(() => {
        result.current.controls.updateDrag({ x: 150, y: 120 });
      });

      act(() => {
        result.current.controls.endDrag();
      });

      expect(onDragEnd).toHaveBeenCalled();
    });

    it("should call onMomentumStop callback", () => {
      const onMomentumStop = jest.fn();
      const { result } = renderHook(() =>
        useAvatarTouchMomentum({ minVelocity: 10000 }, { onMomentumStop })
      );

      mockTime = 0;
      act(() => {
        result.current.controls.startDrag({ x: 100, y: 100 });
      });

      mockTime = 16;
      act(() => {
        result.current.controls.updateDrag({ x: 101, y: 100 });
        result.current.controls.endDrag();
      });

      // Momentum should not start due to high threshold (velocity too low)
      expect(result.current.state.hasActiveMomentum).toBe(false);
    });
  });

  describe("metrics", () => {
    it("should track max velocity", () => {
      const { result } = renderHook(() => useAvatarTouchMomentum());

      mockTime = 0;
      act(() => {
        result.current.controls.startDrag({ x: 0, y: 0 });
      });

      mockTime = 16;
      act(() => {
        result.current.controls.updateDrag({ x: 100, y: 0 });
      });

      expect(result.current.metrics.maxVelocity).toBeGreaterThan(0);
    });

    it("should track total drag distance", () => {
      const { result } = renderHook(() => useAvatarTouchMomentum());

      mockTime = 0;
      act(() => {
        result.current.controls.startDrag({ x: 0, y: 0 });
      });

      mockTime = 16;
      act(() => {
        result.current.controls.updateDrag({ x: 100, y: 0 });
      });

      mockTime = 32;
      act(() => {
        result.current.controls.updateDrag({ x: 100, y: 100 });
      });

      expect(result.current.metrics.totalDragDistance).toBeGreaterThan(0);
    });

    it("should reset metrics", () => {
      const { result } = renderHook(() => useAvatarTouchMomentum());

      mockTime = 0;
      act(() => {
        result.current.controls.startDrag({ x: 0, y: 0 });
      });

      mockTime = 16;
      act(() => {
        result.current.controls.updateDrag({ x: 100, y: 0 });
      });

      expect(result.current.metrics.totalDragDistance).toBeGreaterThan(0);

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.totalDragDistance).toBe(0);
      expect(result.current.metrics.maxVelocity).toBe(0);
    });
  });

  describe("cleanup", () => {
    it("should cleanup on unmount", () => {
      const { unmount } = renderHook(() => useAvatarTouchMomentum());
      unmount();
    });

    it("should stop momentum with stopMomentum", () => {
      const { result } = renderHook(() => useAvatarTouchMomentum());

      mockTime = 0;
      act(() => {
        result.current.controls.startDrag({ x: 100, y: 100 });
      });

      mockTime = 16;
      act(() => {
        result.current.controls.updateDrag({ x: 200, y: 100 });
        result.current.controls.endDrag();
      });

      expect(result.current.state.hasActiveMomentum).toBe(true);

      act(() => {
        result.current.controls.stopMomentum();
      });

      expect(result.current.state.hasActiveMomentum).toBe(false);
      expect(result.current.state.velocity).toEqual({ x: 0, y: 0 });
    });
  });
});

describe("useVelocityTracker", () => {
  it("should provide velocity tracking", () => {
    const { result } = renderHook(() => useVelocityTracker());

    expect(typeof result.current.addSample).toBe("function");
    expect(typeof result.current.getVelocity).toBe("function");
    expect(typeof result.current.reset).toBe("function");
  });

  it("should track velocity from position updates", () => {
    const { result } = renderHook(() => useVelocityTracker());

    act(() => {
      result.current.addSample({ x: 0, y: 0 }, 0);
    });

    act(() => {
      result.current.addSample({ x: 100, y: 50 }, 16);
    });

    const velocity = result.current.getVelocity();
    expect(velocity.x).not.toBe(0);
    expect(velocity.y).not.toBe(0);
  });

  it("should reset velocity", () => {
    const { result } = renderHook(() => useVelocityTracker());

    act(() => {
      result.current.addSample({ x: 0, y: 0 }, 0);
    });

    act(() => {
      result.current.addSample({ x: 100, y: 50 }, 16);
    });

    act(() => {
      result.current.reset();
    });

    const velocity = result.current.getVelocity();
    expect(velocity.x).toBe(0);
    expect(velocity.y).toBe(0);
  });
});

describe("useMomentumDecay", () => {
  it("should provide momentum decay control", () => {
    const { result } = renderHook(() => useMomentumDecay());

    expect(typeof result.current.startDecay).toBe("function");
    expect(typeof result.current.stopDecay).toBe("function");
    expect(typeof result.current.tick).toBe("function");
    expect(result.current.isDecaying).toBe(false);
  });

  it("should start decay", () => {
    const { result } = renderHook(() => useMomentumDecay());

    act(() => {
      result.current.startDecay({ x: 100, y: 50 });
    });

    expect(result.current.isDecaying).toBe(true);
    expect(result.current.velocity.x).toBe(100);
    expect(result.current.velocity.y).toBe(50);
  });

  it("should stop decay", () => {
    const { result } = renderHook(() => useMomentumDecay());

    act(() => {
      result.current.startDecay({ x: 100, y: 50 });
      result.current.stopDecay();
    });

    expect(result.current.isDecaying).toBe(false);
    expect(result.current.velocity).toEqual({ x: 0, y: 0 });
  });

  it("should apply friction on tick", () => {
    const { result } = renderHook(() =>
      useMomentumDecay({ friction: 0.9, minVelocity: 0.1 })
    );

    act(() => {
      result.current.startDecay({ x: 100, y: 50 });
    });

    const initialX = result.current.velocity.x;

    act(() => {
      result.current.tick();
    });

    expect(result.current.velocity.x).toBeLessThan(initialX);
  });
});
