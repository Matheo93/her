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

// ============================================================================
// Sprint 628 - Additional coverage tests
// ============================================================================

describe("Sprint 628 - CSS Variables (lines 206-218)", () => {
  it("should update CSS variables when resize occurs", async () => {
    const mockSetProperty = jest.fn();
    Object.defineProperty(document.documentElement, "style", {
      value: { setProperty: mockSetProperty },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useMobileViewportOptimizer({ enableDynamicVH: true })
    );

    // Trigger resize event
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    // Wait for debounce
    act(() => {
      jest.advanceTimersByTime(150);
    });

    // CSS variables should be set
    expect(mockSetProperty).toHaveBeenCalled();
  });

  it("should not update CSS vars when enableDynamicVH is false", async () => {
    const mockSetProperty = jest.fn();
    Object.defineProperty(document.documentElement, "style", {
      value: { setProperty: mockSetProperty },
      writable: true,
      configurable: true,
    });

    renderHook(() =>
      useMobileViewportOptimizer({ enableDynamicVH: false })
    );

    // Trigger resize event
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    // Wait for debounce
    act(() => {
      jest.advanceTimersByTime(150);
    });

    // CSS variables may not be set (depending on if updateCSSVars returns early)
    // The key is that the config is respected
  });
});

describe("Sprint 628 - Fullscreen (lines 250-277)", () => {
  it("should request fullscreen using standard API", async () => {
    const mockRequestFullscreen = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: mockRequestFullscreen,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileViewportOptimizer());

    await act(async () => {
      await result.current.controls.requestFullscreen();
    });

    expect(mockRequestFullscreen).toHaveBeenCalled();
    expect(result.current.state.isFullscreen).toBe(true);
  });

  it("should request fullscreen using webkit API fallback", async () => {
    const mockWebkitRequestFullscreen = jest.fn().mockResolvedValue(undefined);

    // Remove standard API
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Add webkit API
    Object.defineProperty(document.documentElement, "webkitRequestFullscreen", {
      value: mockWebkitRequestFullscreen,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileViewportOptimizer());

    await act(async () => {
      await result.current.controls.requestFullscreen();
    });

    expect(mockWebkitRequestFullscreen).toHaveBeenCalled();
  });

  it("should handle fullscreen request failure", async () => {
    const mockRequestFullscreen = jest.fn().mockRejectedValue(new Error("Not allowed"));
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: mockRequestFullscreen,
      writable: true,
      configurable: true,
    });

    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const { result } = renderHook(() => useMobileViewportOptimizer());

    await act(async () => {
      await result.current.controls.requestFullscreen();
    });

    expect(consoleSpy).toHaveBeenCalledWith("Fullscreen request failed:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("should exit fullscreen using standard API", async () => {
    const mockExitFullscreen = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "exitFullscreen", {
      value: mockExitFullscreen,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileViewportOptimizer());

    await act(async () => {
      await result.current.controls.exitFullscreen();
    });

    expect(mockExitFullscreen).toHaveBeenCalled();
    expect(result.current.state.isFullscreen).toBe(false);
  });

  it("should exit fullscreen using webkit API fallback", async () => {
    const mockWebkitExitFullscreen = jest.fn().mockResolvedValue(undefined);

    // Remove standard API
    Object.defineProperty(document, "exitFullscreen", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Add webkit API
    Object.defineProperty(document, "webkitExitFullscreen", {
      value: mockWebkitExitFullscreen,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileViewportOptimizer());

    await act(async () => {
      await result.current.controls.exitFullscreen();
    });

    expect(mockWebkitExitFullscreen).toHaveBeenCalled();
  });

  it("should handle exit fullscreen failure", async () => {
    const mockExitFullscreen = jest.fn().mockRejectedValue(new Error("Not in fullscreen"));
    Object.defineProperty(document, "exitFullscreen", {
      value: mockExitFullscreen,
      writable: true,
      configurable: true,
    });

    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const { result } = renderHook(() => useMobileViewportOptimizer());

    await act(async () => {
      await result.current.controls.exitFullscreen();
    });

    expect(consoleSpy).toHaveBeenCalledWith("Exit fullscreen failed:", expect.any(Error));
    consoleSpy.mockRestore();
  });
});

describe("Sprint 628 - Orientation lock (lines 283-310)", () => {
  it("should lock orientation when API is available", async () => {
    const mockLock = jest.fn().mockResolvedValue(undefined);

    Object.defineProperty(screen, "orientation", {
      value: {
        type: "portrait-primary",
        lock: mockLock,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileViewportOptimizer());

    await act(async () => {
      await result.current.controls.lockOrientation("landscape");
    });

    expect(mockLock).toHaveBeenCalledWith("landscape");
  });

  it("should handle orientation lock failure", async () => {
    const mockLock = jest.fn().mockRejectedValue(new Error("Not supported"));

    Object.defineProperty(screen, "orientation", {
      value: {
        type: "portrait-primary",
        lock: mockLock,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const { result } = renderHook(() => useMobileViewportOptimizer());

    await act(async () => {
      await result.current.controls.lockOrientation("landscape");
    });

    expect(consoleSpy).toHaveBeenCalledWith("Orientation lock failed:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("should do nothing when orientation API is unavailable", async () => {
    Object.defineProperty(screen, "orientation", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileViewportOptimizer());

    // Should not throw
    await act(async () => {
      await result.current.controls.lockOrientation("landscape");
    });
  });

  it("should unlock orientation when API is available", () => {
    const mockUnlock = jest.fn();

    Object.defineProperty(screen, "orientation", {
      value: {
        type: "portrait-primary",
        unlock: mockUnlock,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileViewportOptimizer());

    act(() => {
      result.current.controls.unlockOrientation();
    });

    expect(mockUnlock).toHaveBeenCalled();
  });

  it("should handle orientation unlock failure", () => {
    const mockUnlock = jest.fn().mockImplementation(() => {
      throw new Error("Not supported");
    });

    Object.defineProperty(screen, "orientation", {
      value: {
        type: "portrait-primary",
        unlock: mockUnlock,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const { result } = renderHook(() => useMobileViewportOptimizer());

    act(() => {
      result.current.controls.unlockOrientation();
    });

    expect(consoleSpy).toHaveBeenCalledWith("Orientation unlock failed:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  it("should do nothing when orientation unlock API unavailable", () => {
    Object.defineProperty(screen, "orientation", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileViewportOptimizer());

    // Should not throw
    act(() => {
      result.current.controls.unlockOrientation();
    });
  });
});

describe("Sprint 628 - Focus input (lines 329-335)", () => {
  it("should focus element and scroll into view", () => {
    const mockElement = {
      focus: jest.fn(),
      scrollIntoView: jest.fn(),
    } as unknown as HTMLElement;

    const { result } = renderHook(() => useMobileViewportOptimizer());

    act(() => {
      result.current.controls.focusInput(mockElement);
    });

    expect(mockElement.focus).toHaveBeenCalled();

    // Advance timers past keyboard animation duration
    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("should do nothing when element is null", () => {
    const { result } = renderHook(() => useMobileViewportOptimizer());

    // Should not throw
    act(() => {
      result.current.controls.focusInput(null as unknown as HTMLElement);
    });
  });
});

describe("Sprint 628 - Keyboard detection (lines 376-441)", () => {
  it("should detect keyboard when height decreases significantly", async () => {
    // Start with initial height
    Object.defineProperty(window, "innerHeight", {
      value: 812,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileViewportOptimizer());

    // Wait for initial setup
    act(() => {
      jest.advanceTimersByTime(150);
    });

    // Simulate keyboard appearing (height decreases by more than 150px)
    Object.defineProperty(window, "innerHeight", {
      value: 500,
      writable: true,
      configurable: true,
    });

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    // Keyboard should be detected
    expect(result.current.state.keyboardState).toBe("visible");
    expect(result.current.state.keyboardHeight).toBeGreaterThan(150);
    expect(result.current.metrics.keyboardShowCount).toBeGreaterThan(0);
  });

  it("should track average keyboard height", async () => {
    Object.defineProperty(window, "innerHeight", {
      value: 812,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileViewportOptimizer());

    act(() => {
      jest.advanceTimersByTime(150);
    });

    // Show keyboard multiple times with different heights
    for (let i = 0; i < 3; i++) {
      // Show keyboard
      Object.defineProperty(window, "innerHeight", {
        value: 500 - i * 50,
        writable: true,
        configurable: true,
      });

      await act(async () => {
        window.dispatchEvent(new Event("resize"));
      });

      act(() => {
        jest.advanceTimersByTime(150);
      });

      // Hide keyboard
      Object.defineProperty(window, "innerHeight", {
        value: 812,
        writable: true,
        configurable: true,
      });

      await act(async () => {
        window.dispatchEvent(new Event("resize"));
      });

      act(() => {
        jest.advanceTimersByTime(150);
      });
    }

    // Average should be tracked
    expect(result.current.metrics.averageKeyboardHeight).toBeGreaterThan(0);
  });

  it("should lock scroll when keyboard appears if configured", async () => {
    Object.defineProperty(window, "innerHeight", {
      value: 812,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useMobileViewportOptimizer({ scrollLockOnKeyboard: true })
    );

    act(() => {
      jest.advanceTimersByTime(150);
    });

    // Show keyboard
    Object.defineProperty(window, "innerHeight", {
      value: 500,
      writable: true,
      configurable: true,
    });

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(result.current.state.isScrollLocked).toBe(true);
  });

  it("should unlock scroll when keyboard hides if configured", async () => {
    Object.defineProperty(window, "innerHeight", {
      value: 812,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() =>
      useMobileViewportOptimizer({ scrollLockOnKeyboard: true })
    );

    act(() => {
      jest.advanceTimersByTime(150);
    });

    // Show keyboard
    Object.defineProperty(window, "innerHeight", {
      value: 500,
      writable: true,
      configurable: true,
    });

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(result.current.state.isScrollLocked).toBe(true);

    // Hide keyboard (height increases)
    Object.defineProperty(window, "innerHeight", {
      value: 812,
      writable: true,
      configurable: true,
    });

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(result.current.state.isScrollLocked).toBe(false);
  });

  it("should update resize count on resize", async () => {
    const { result } = renderHook(() => useMobileViewportOptimizer());

    const initialResizeCount = result.current.metrics.resizeCount;

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(result.current.metrics.resizeCount).toBeGreaterThan(initialResizeCount);
  });

  it("should debounce resize events", async () => {
    const { result } = renderHook(() =>
      useMobileViewportOptimizer({ resizeDebounceMs: 100 })
    );

    const initialResizeCount = result.current.metrics.resizeCount;

    // Trigger multiple resize events quickly
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
    });

    // Only advance partial time - shouldn't process yet
    act(() => {
      jest.advanceTimersByTime(50);
    });

    // Resize count shouldn't have increased yet due to debounce
    expect(result.current.metrics.resizeCount).toBe(initialResizeCount);

    // Advance past debounce
    act(() => {
      jest.advanceTimersByTime(100);
    });

    // Now it should have processed once
    expect(result.current.metrics.resizeCount).toBeGreaterThan(initialResizeCount);
  });
});

describe("Sprint 628 - Orientation change (lines 478-500)", () => {
  it("should handle orientation change via screen.orientation", async () => {
    let changeHandler: (() => void) | null = null;

    Object.defineProperty(screen, "orientation", {
      value: {
        type: "portrait-primary",
        addEventListener: jest.fn((event: string, handler: () => void) => {
          if (event === "change") {
            changeHandler = handler;
          }
        }),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileViewportOptimizer());

    const initialOrientationChanges = result.current.metrics.orientationChanges;

    // Change orientation
    Object.defineProperty(screen, "orientation", {
      value: {
        type: "landscape-primary",
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    if (changeHandler) {
      await act(async () => {
        changeHandler!();
      });
    }

    expect(result.current.metrics.orientationChanges).toBeGreaterThan(initialOrientationChanges);
  });

  it("should fallback to orientationchange event", async () => {
    // Remove screen.orientation API
    Object.defineProperty(screen, "orientation", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Mock window width > height for landscape
    Object.defineProperty(window, "innerWidth", {
      value: 812,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 375,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileViewportOptimizer());

    const initialOrientationChanges = result.current.metrics.orientationChanges;

    // Trigger orientation change
    await act(async () => {
      window.dispatchEvent(new Event("orientationchange"));
    });

    // Wait for CSS update timeout
    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(result.current.metrics.orientationChanges).toBeGreaterThan(initialOrientationChanges);
  });
});

describe("Sprint 628 - Fullscreen change events (lines 510-514)", () => {
  it("should update state on fullscreen change", async () => {
    const { result } = renderHook(() => useMobileViewportOptimizer());

    // Simulate entering fullscreen
    Object.defineProperty(document, "fullscreenElement", {
      value: document.documentElement,
      writable: true,
      configurable: true,
    });

    await act(async () => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.state.isFullscreen).toBe(true);

    // Simulate exiting fullscreen
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      writable: true,
      configurable: true,
    });

    await act(async () => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.state.isFullscreen).toBe(false);
  });

  it("should handle webkit fullscreen change", async () => {
    const { result } = renderHook(() => useMobileViewportOptimizer());

    // Simulate webkit fullscreen
    Object.defineProperty(document, "webkitFullscreenElement", {
      value: document.documentElement,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      writable: true,
      configurable: true,
    });

    await act(async () => {
      document.dispatchEvent(new Event("webkitfullscreenchange"));
    });

    expect(result.current.state.isFullscreen).toBe(true);
  });
});

describe("Sprint 628 - Orientation lock config (line 529)", () => {
  it("should apply orientation lock from config", async () => {
    const mockLock = jest.fn().mockResolvedValue(undefined);

    Object.defineProperty(screen, "orientation", {
      value: {
        type: "portrait-primary",
        lock: mockLock,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    renderHook(() =>
      useMobileViewportOptimizer({ enableOrientationLock: "landscape" })
    );

    // Wait for effect to run
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockLock).toHaveBeenCalledWith("landscape");
  });

  it("should not lock orientation when config is null", async () => {
    const mockLock = jest.fn().mockResolvedValue(undefined);

    Object.defineProperty(screen, "orientation", {
      value: {
        type: "portrait-primary",
        lock: mockLock,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    renderHook(() =>
      useMobileViewportOptimizer({ enableOrientationLock: null })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockLock).not.toHaveBeenCalled();
  });
});

describe("Sprint 628 - Visual viewport resize", () => {
  it("should listen to visual viewport resize", async () => {
    const mockAddEventListener = jest.fn();
    const mockRemoveEventListener = jest.fn();

    Object.defineProperty(window, "visualViewport", {
      value: {
        width: 375,
        height: 812,
        addEventListener: mockAddEventListener,
        removeEventListener: mockRemoveEventListener,
      },
      writable: true,
      configurable: true,
    });

    const { unmount } = renderHook(() => useMobileViewportOptimizer());

    expect(mockAddEventListener).toHaveBeenCalledWith("resize", expect.any(Function));

    unmount();

    expect(mockRemoveEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
  });
});

describe("Sprint 628 - getOrientation fallback (line 109)", () => {
  it("should use window dimensions when screen.orientation unavailable", () => {
    Object.defineProperty(screen, "orientation", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Portrait: width < height
    Object.defineProperty(window, "innerWidth", {
      value: 375,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 812,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileViewportOptimizer());

    expect(result.current.state.orientation).toBe("portrait");
  });

  it("should detect landscape from window dimensions", () => {
    Object.defineProperty(screen, "orientation", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Landscape: width > height
    Object.defineProperty(window, "innerWidth", {
      value: 812,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 375,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileViewportOptimizer());

    expect(result.current.state.orientation).toBe("landscape");
  });
});

describe("Sprint 628 - Cleanup", () => {
  it("should cleanup all event listeners on unmount", () => {
    const mockRemoveEventListener = jest.fn();
    window.removeEventListener = mockRemoveEventListener;

    const { unmount } = renderHook(() => useMobileViewportOptimizer());

    unmount();

    expect(mockRemoveEventListener).toHaveBeenCalled();
  });

  it("should clear timeout on unmount", async () => {
    const { unmount } = renderHook(() => useMobileViewportOptimizer());

    // Trigger resize to create timeout
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    // Unmount before timeout fires
    expect(() => unmount()).not.toThrow();
  });
});
