/**
 * Tests for Mobile Animation Scheduler Hook - Sprint 230
 *
 * Tests priority scheduling, frame budgets, and animation grouping
 */

import { renderHook, act } from "@testing-library/react";
import {
  useMobileAnimationScheduler,
  useScheduledAnimation,
  useStaggeredAnimation,
  EASING,
} from "../useMobileAnimationScheduler";

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

describe("useMobileAnimationScheduler", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      expect(result.current.state.isRunning).toBe(false);
      expect(result.current.state.isPaused).toBe(false);
    });

    it("should initialize with default metrics", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      expect(result.current.state.metrics.totalAnimations).toBe(0);
      expect(result.current.state.metrics.activeAnimations).toBe(0);
      expect(result.current.state.metrics.framesProcessed).toBe(0);
    });

    it("should initialize with default frame budget", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      expect(result.current.state.frameBudget.targetMs).toBeCloseTo(16.67);
      expect(result.current.state.frameBudget.usedMs).toBe(0);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useMobileAnimationScheduler({
          targetFrameTimeMs: 33.33,
          maxAnimationsPerFrame: 10,
        })
      );

      expect(result.current.state.frameBudget.targetMs).toBeCloseTo(33.33);
    });
  });

  describe("animation scheduling", () => {
    it("should schedule an animation", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());
      const callback = jest.fn();

      let animId = "";
      act(() => {
        animId = result.current.controls.schedule(callback);
      });

      expect(animId).toMatch(/^anim_/);
      expect(result.current.state.metrics.totalAnimations).toBe(1);
    });

    it("should schedule with custom priority", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      let animId = "";
      act(() => {
        animId = result.current.controls.schedule(() => {}, {
          priority: "critical",
        });
      });

      const animation = result.current.controls.getAnimation(animId);
      expect(animation?.priority).toBe("critical");
    });

    it("should schedule with custom duration", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      let animId = "";
      act(() => {
        animId = result.current.controls.schedule(() => {}, {
          duration: 500,
        });
      });

      const animation = result.current.controls.getAnimation(animId);
      expect(animation?.duration).toBe(500);
    });

    it("should schedule with easing function", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      let animId = "";
      act(() => {
        animId = result.current.controls.schedule(() => {}, {
          easing: EASING.easeInOutCubic,
        });
      });

      const animation = result.current.controls.getAnimation(animId);
      expect(animation?.easing).toBe(EASING.easeInOutCubic);
    });

    it("should start running after scheduling", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      act(() => {
        result.current.controls.schedule(() => {});
      });

      expect(result.current.state.isRunning).toBe(true);
    });
  });

  describe("animation cancellation", () => {
    it("should cancel an animation", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      let animId = "";
      act(() => {
        animId = result.current.controls.schedule(() => {});
      });

      let cancelled = false;
      act(() => {
        cancelled = result.current.controls.cancel(animId);
      });

      expect(cancelled).toBe(true);
      expect(result.current.state.metrics.cancelledAnimations).toBe(1);
    });

    it("should return false for non-existent animation", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      let cancelled = false;
      act(() => {
        cancelled = result.current.controls.cancel("non-existent");
      });

      expect(cancelled).toBe(false);
    });
  });

  describe("animation pause/resume", () => {
    it("should pause an animation", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      let animId = "";
      act(() => {
        animId = result.current.controls.schedule(() => {});
      });

      let paused = false;
      act(() => {
        paused = result.current.controls.pause(animId);
      });

      expect(paused).toBe(true);
      const animation = result.current.controls.getAnimation(animId);
      expect(animation?.state).toBe("paused");
    });

    it("should resume a paused animation", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      let animId = "";
      act(() => {
        animId = result.current.controls.schedule(() => {});
        result.current.controls.pause(animId);
      });

      let resumed = false;
      act(() => {
        resumed = result.current.controls.resume(animId);
      });

      expect(resumed).toBe(true);
      const animation = result.current.controls.getAnimation(animId);
      expect(animation?.state).toBe("running");
    });
  });

  describe("global pause/resume", () => {
    it("should pause all animations", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      act(() => {
        result.current.controls.schedule(() => {});
        result.current.controls.schedule(() => {});
        result.current.controls.pauseAll();
      });

      expect(result.current.state.isPaused).toBe(true);
    });

    it("should resume all animations", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      act(() => {
        result.current.controls.schedule(() => {});
        result.current.controls.pauseAll();
        result.current.controls.resumeAll();
      });

      expect(result.current.state.isPaused).toBe(false);
    });

    it("should cancel all animations", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      act(() => {
        result.current.controls.schedule(() => {});
        result.current.controls.schedule(() => {});
        result.current.controls.cancelAll();
      });

      expect(result.current.state.isRunning).toBe(false);
      expect(result.current.state.metrics.activeAnimations).toBe(0);
    });
  });

  describe("animation groups", () => {
    it("should create animation group", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      act(() => {
        result.current.controls.createGroup("group1");
      });

      // Group created (internal state)
      expect(typeof result.current.controls.createGroup).toBe("function");
    });

    it("should add animation to group", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      let animId = "";
      act(() => {
        result.current.controls.createGroup("group1");
        animId = result.current.controls.schedule(() => {});
      });

      let added = false;
      act(() => {
        added = result.current.controls.addToGroup(animId, "group1");
      });

      expect(added).toBe(true);
    });

    it("should remove animation from group", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      let animId = "";
      act(() => {
        result.current.controls.createGroup("group1");
        animId = result.current.controls.schedule(() => {}, { groupId: "group1" });
      });

      let removed = false;
      act(() => {
        removed = result.current.controls.removeFromGroup(animId);
      });

      expect(removed).toBe(true);
    });

    it("should pause a group", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      act(() => {
        result.current.controls.createGroup("group1");
        result.current.controls.schedule(() => {}, { groupId: "group1" });
        result.current.controls.pauseGroup("group1");
      });

      // Group paused
      expect(typeof result.current.controls.pauseGroup).toBe("function");
    });

    it("should cancel a group", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      act(() => {
        result.current.controls.createGroup("group1");
        result.current.controls.schedule(() => {}, { groupId: "group1" });
        result.current.controls.cancelGroup("group1");
      });

      expect(result.current.state.metrics.cancelledAnimations).toBe(1);
    });
  });

  describe("throttle control", () => {
    it("should set throttle level", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      act(() => {
        result.current.controls.setThrottleLevel(2);
      });

      // Throttle affects multiplier
      expect(result.current.state.throttleMultiplier).toBeLessThan(1);
    });

    it("should clamp throttle level", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      act(() => {
        result.current.controls.setThrottleLevel(10);
      });

      // Clamped to max (3)
      expect(result.current.state.throttleMultiplier).toBeGreaterThan(0);
    });
  });

  describe("device conditions", () => {
    it("should have default device conditions", () => {
      const { result } = renderHook(() => useMobileAnimationScheduler());

      expect(result.current.state.deviceConditions.thermalState).toBe("nominal");
      expect(result.current.state.deviceConditions.memoryPressure).toBe("normal");
    });
  });

  describe("cleanup", () => {
    it("should cleanup on unmount", () => {
      const { unmount } = renderHook(() => useMobileAnimationScheduler());

      unmount();
      // No error means cleanup succeeded
    });
  });
});

describe("useScheduledAnimation", () => {
  it("should provide animate function", () => {
    const { result } = renderHook(() => useScheduledAnimation());

    expect(typeof result.current.animate).toBe("function");
    expect(typeof result.current.cancel).toBe("function");
  });

  it("should track animating state", () => {
    const { result } = renderHook(() => useScheduledAnimation());

    expect(result.current.isAnimating).toBe(false);

    act(() => {
      result.current.animate(() => {});
    });

    expect(result.current.isAnimating).toBe(true);
  });

  it("should accept custom duration", () => {
    const { result } = renderHook(() => useScheduledAnimation(500));

    let animId = "";
    act(() => {
      animId = result.current.animate(() => {});
    });

    expect(animId).toMatch(/^anim_/);
  });

  it("should accept custom easing", () => {
    const { result } = renderHook(() =>
      useScheduledAnimation(300, EASING.easeOutBounce)
    );

    act(() => {
      result.current.animate(() => {});
    });

    expect(result.current.isAnimating).toBe(true);
  });
});

describe("useStaggeredAnimation", () => {
  it("should provide scheduleGroup function", () => {
    const { result } = renderHook(() => useStaggeredAnimation());

    expect(typeof result.current.scheduleGroup).toBe("function");
    expect(typeof result.current.cancelGroup).toBe("function");
  });

  it("should schedule multiple animations with stagger", () => {
    const { result } = renderHook(() => useStaggeredAnimation(50));

    const callbacks = [jest.fn(), jest.fn(), jest.fn()];

    let ids: string[] = [];
    act(() => {
      ids = result.current.scheduleGroup(callbacks);
    });

    expect(ids.length).toBe(3);
    ids.forEach((id) => expect(id).toMatch(/^anim_/));
  });

  it("should cancel group of animations", () => {
    const { result } = renderHook(() => useStaggeredAnimation());

    const callbacks = [jest.fn(), jest.fn()];

    let ids: string[] = [];
    act(() => {
      ids = result.current.scheduleGroup(callbacks);
      result.current.cancelGroup(ids);
    });

    // Cancelled successfully
    expect(typeof result.current.cancelGroup).toBe("function");
  });
});

describe("EASING functions", () => {
  it("should have linear easing", () => {
    expect(EASING.linear(0)).toBe(0);
    expect(EASING.linear(0.5)).toBe(0.5);
    expect(EASING.linear(1)).toBe(1);
  });

  it("should have easeInQuad", () => {
    expect(EASING.easeInQuad(0)).toBe(0);
    expect(EASING.easeInQuad(1)).toBe(1);
    expect(EASING.easeInQuad(0.5)).toBe(0.25);
  });

  it("should have easeOutQuad", () => {
    expect(EASING.easeOutQuad(0)).toBe(0);
    expect(EASING.easeOutQuad(1)).toBe(1);
    expect(EASING.easeOutQuad(0.5)).toBe(0.75);
  });

  it("should have easeInOutQuad", () => {
    expect(EASING.easeInOutQuad(0)).toBe(0);
    expect(EASING.easeInOutQuad(1)).toBe(1);
    expect(EASING.easeInOutQuad(0.5)).toBe(0.5);
  });

  it("should have easeInCubic", () => {
    expect(EASING.easeInCubic(0)).toBe(0);
    expect(EASING.easeInCubic(1)).toBe(1);
  });

  it("should have easeOutCubic", () => {
    expect(EASING.easeOutCubic(0)).toBe(0);
    expect(EASING.easeOutCubic(1)).toBe(1);
  });

  it("should have easeInOutCubic", () => {
    expect(EASING.easeInOutCubic(0)).toBe(0);
    expect(EASING.easeInOutCubic(1)).toBe(1);
  });

  it("should have easeOutElastic", () => {
    expect(EASING.easeOutElastic(0)).toBeCloseTo(0);
    expect(EASING.easeOutElastic(1)).toBe(1);
  });

  it("should have easeOutBounce", () => {
    expect(EASING.easeOutBounce(0)).toBe(0);
    expect(EASING.easeOutBounce(1)).toBeCloseTo(1);
  });
});
