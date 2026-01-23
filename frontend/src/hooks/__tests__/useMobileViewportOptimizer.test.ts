/**
 * Tests for Mobile Viewport Optimizer Hook - Sprint 528
 *
 * Tests viewport management, safe areas, keyboard detection,
 * and orientation handling for mobile devices.
 */

import { renderHook, act } from "@testing-library/react";
import {
  useMobileViewportOptimizer,
  useViewportDimensions,
  useKeyboardAwareHeight,
  useSafeAreaInsets,
} from "../useMobileViewportOptimizer";

// Store original values
const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

beforeEach(() => {
  jest.useFakeTimers();

  // Mock window dimensions
  Object.defineProperty(window, "innerWidth", { value: 375, writable: true, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 812, writable: true, configurable: true });
  Object.defineProperty(window, "devicePixelRatio", { value: 3, writable: true, configurable: true });

  // Mock visualViewport
  Object.defineProperty(window, "visualViewport", {
    value: {
      width: 375,
      height: 812,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    writable: true,
    configurable: true,
  });

  // Mock scrollTo
  window.scrollTo = jest.fn();

  // Mock screen.orientation
  Object.defineProperty(screen, "orientation", {
    value: {
      type: "portrait-primary",
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    writable: true,
    configurable: true,
  });

  // Mock getComputedStyle
  window.getComputedStyle = jest.fn().mockReturnValue({
    getPropertyValue: jest.fn().mockReturnValue("0"),
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();

  // Restore original values
  Object.defineProperty(window, "innerWidth", { value: originalInnerWidth, writable: true, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: originalInnerHeight, writable: true, configurable: true });
});

describe("useMobileViewportOptimizer", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      expect(result.current.state).toBeDefined();
      expect(result.current.state.dimensions).toBeDefined();
      expect(result.current.state.orientation).toBeDefined();
      expect(result.current.state.keyboardState).toBe("hidden");
      expect(result.current.state.isScrollLocked).toBe(false);
      expect(result.current.state.isFullscreen).toBe(false);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useMobileViewportOptimizer({
          enableDynamicVH: false,
          resizeDebounceMs: 200,
        })
      );

      expect(result.current.config.enableDynamicVH).toBe(false);
      expect(result.current.config.resizeDebounceMs).toBe(200);
    });

    it("should initialize metrics to zero", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      expect(result.current.metrics.orientationChanges).toBe(0);
      expect(result.current.metrics.keyboardShowCount).toBe(0);
      expect(result.current.metrics.scrollLockCount).toBe(0);
    });
  });

  describe("viewport dimensions", () => {
    it("should provide viewport dimensions", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      expect(result.current.state.dimensions.innerWidth).toBe(375);
      expect(result.current.state.dimensions.innerHeight).toBe(812);
      expect(result.current.state.dimensions.devicePixelRatio).toBe(3);
    });
  });

  describe("safe area insets", () => {
    it("should provide safe area insets", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      expect(result.current.state.safeAreaInsets).toBeDefined();
      expect(typeof result.current.state.safeAreaInsets.top).toBe("number");
      expect(typeof result.current.state.safeAreaInsets.bottom).toBe("number");
      expect(typeof result.current.state.safeAreaInsets.left).toBe("number");
      expect(typeof result.current.state.safeAreaInsets.right).toBe("number");
    });
  });

  describe("keyboard handling", () => {
    it("should initially have keyboard hidden", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      expect(result.current.state.keyboardState).toBe("hidden");
      expect(result.current.state.keyboardHeight).toBe(0);
    });
  });

  describe("scroll lock", () => {
    it("should lock scroll", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      act(() => {
        result.current.controls.lockScroll();
      });

      expect(result.current.state.isScrollLocked).toBe(true);
      expect(result.current.metrics.scrollLockCount).toBe(1);
    });

    it("should unlock scroll", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      act(() => {
        result.current.controls.lockScroll();
      });

      act(() => {
        result.current.controls.unlockScroll();
      });

      expect(result.current.state.isScrollLocked).toBe(false);
    });
  });

  describe("scroll helpers", () => {
    it("should scroll to top", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      act(() => {
        result.current.controls.scrollToTop();
      });

      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 0,
        behavior: "smooth",
      });
    });

    it("should scroll to top without smooth behavior", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      act(() => {
        result.current.controls.scrollToTop(false);
      });

      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 0,
        behavior: "auto",
      });
    });

    it("should scroll to bottom", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      act(() => {
        result.current.controls.scrollToBottom();
      });

      expect(window.scrollTo).toHaveBeenCalledWith({
        top: expect.any(Number),
        behavior: "smooth",
      });
    });
  });

  describe("config updates", () => {
    it("should update config", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      act(() => {
        result.current.controls.updateConfig({
          enableKeyboardDetection: false,
          keyboardAnimationDuration: 500,
        });
      });

      expect(result.current.config.enableKeyboardDetection).toBe(false);
      expect(result.current.config.keyboardAnimationDuration).toBe(500);
    });
  });

  describe("CSS variables", () => {
    it("should get CSS variables", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      const cssVars = result.current.controls.getCSSVars();

      expect(cssVars["--vh"]).toBeDefined();
      expect(cssVars["--viewport-height"]).toBeDefined();
      expect(cssVars["--keyboard-height"]).toBeDefined();
      expect(cssVars["--safe-area-top"]).toBeDefined();
      expect(cssVars["--available-height"]).toBeDefined();
    });
  });

  describe("orientation", () => {
    it("should detect orientation", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      expect(result.current.state.orientation).toBeDefined();
      expect(typeof result.current.state.orientation).toBe("string");
    });
  });

  describe("available height", () => {
    it("should calculate available height", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      expect(result.current.state.availableHeight).toBeGreaterThan(0);
    });
  });

  describe("default config", () => {
    it("should have correct default values", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      expect(result.current.config.enableDynamicVH).toBe(true);
      expect(result.current.config.enableSafeAreaHandling).toBe(true);
      expect(result.current.config.enableKeyboardDetection).toBe(true);
      expect(result.current.config.keyboardAnimationDuration).toBe(300);
      expect(result.current.config.resizeDebounceMs).toBe(100);
      expect(result.current.config.scrollLockOnKeyboard).toBe(false);
    });
  });

  describe("focus input", () => {
    it("should provide focusInput function", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      expect(typeof result.current.controls.focusInput).toBe("function");
    });
  });

  describe("fullscreen", () => {
    it("should provide requestFullscreen function", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      expect(typeof result.current.controls.requestFullscreen).toBe("function");
    });

    it("should provide exitFullscreen function", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      expect(typeof result.current.controls.exitFullscreen).toBe("function");
    });
  });

  describe("orientation lock", () => {
    it("should provide lockOrientation function", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      expect(typeof result.current.controls.lockOrientation).toBe("function");
    });

    it("should provide unlockOrientation function", () => {
      const { result } = renderHook(() => useMobileViewportOptimizer());

      expect(typeof result.current.controls.unlockOrientation).toBe("function");
    });
  });
});

describe("useViewportDimensions", () => {
  it("should return viewport dimensions", () => {
    const { result } = renderHook(() => useViewportDimensions());

    expect(result.current).toBeDefined();
    expect(result.current.innerWidth).toBe(375);
    expect(result.current.innerHeight).toBe(812);
  });
});

describe("useKeyboardAwareHeight", () => {
  it("should return keyboard-aware height info", () => {
    const { result } = renderHook(() => useKeyboardAwareHeight());

    expect(result.current).toBeDefined();
    expect(result.current.height).toBeGreaterThan(0);
    expect(result.current.keyboardHeight).toBe(0);
    expect(result.current.isKeyboardVisible).toBe(false);
  });
});

describe("useSafeAreaInsets", () => {
  it("should return safe area insets", () => {
    const { result } = renderHook(() => useSafeAreaInsets());

    expect(result.current).toBeDefined();
    expect(typeof result.current.top).toBe("number");
    expect(typeof result.current.bottom).toBe("number");
    expect(typeof result.current.left).toBe("number");
    expect(typeof result.current.right).toBe("number");
  });
});
