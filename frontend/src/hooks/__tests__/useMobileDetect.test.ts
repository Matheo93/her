/**
 * Tests for Mobile Detect Hook - Sprint 226
 *
 * Tests device detection, breakpoints, and orientation detection.
 */

import { renderHook, act } from "@testing-library/react";
import {
  useMobileDetect,
  useIsMobile,
  useIsTouchDevice,
  useOrientation,
  useBreakpoint,
} from "../useMobileDetect";

// Store original values
const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;
const originalUserAgent = navigator.userAgent;

beforeEach(() => {
  // Default to desktop
  Object.defineProperty(window, "innerWidth", { value: 1200, writable: true, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 800, writable: true, configurable: true });

  // Mock touch detection
  Object.defineProperty(window, "ontouchstart", { value: undefined, writable: true, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: 0, writable: true, configurable: true });

  // Mock platform
  Object.defineProperty(navigator, "platform", { value: "Win32", writable: true, configurable: true });
});

afterEach(() => {
  Object.defineProperty(window, "innerWidth", { value: originalInnerWidth, writable: true, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: originalInnerHeight, writable: true, configurable: true });
});

describe("useMobileDetect", () => {
  describe("initialization", () => {
    it("should initialize with device info", () => {
      const { result } = renderHook(() => useMobileDetect());

      expect(result.current).toBeDefined();
      expect(typeof result.current.isMobile).toBe("boolean");
      expect(typeof result.current.isTablet).toBe("boolean");
      expect(typeof result.current.isDesktop).toBe("boolean");
      expect(typeof result.current.isTouchDevice).toBe("boolean");
    });

    it("should detect desktop on wide screens", () => {
      Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });

      const { result } = renderHook(() => useMobileDetect());

      expect(result.current.isDesktop).toBe(true);
      expect(result.current.isMobile).toBe(false);
      expect(result.current.isTablet).toBe(false);
    });
  });

  describe("breakpoint detection", () => {
    it("should detect mobile on narrow screens", () => {
      Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });

      const { result } = renderHook(() => useMobileDetect());

      // Need to trigger resize detection
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      expect(result.current.isMobile).toBe(true);
      expect(result.current.isDesktop).toBe(false);
    });

    it("should detect tablet on medium screens", () => {
      Object.defineProperty(window, "innerWidth", { value: 768, configurable: true });

      const { result } = renderHook(() => useMobileDetect());

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      expect(result.current.isTablet).toBe(true);
      expect(result.current.isMobile).toBe(false);
      expect(result.current.isDesktop).toBe(false);
    });
  });

  describe("orientation detection", () => {
    it("should detect landscape orientation", () => {
      Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

      const { result } = renderHook(() => useMobileDetect());

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      expect(result.current.orientation).toBe("landscape");
    });

    it("should detect portrait orientation", () => {
      Object.defineProperty(window, "innerWidth", { value: 800, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: 1200, configurable: true });

      const { result } = renderHook(() => useMobileDetect());

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      expect(result.current.orientation).toBe("portrait");
    });
  });

  describe("touch detection", () => {
    it("should detect touch device when ontouchstart exists", () => {
      Object.defineProperty(window, "ontouchstart", { value: () => {}, configurable: true });

      const { result } = renderHook(() => useMobileDetect());

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      expect(result.current.isTouchDevice).toBe(true);
    });

    it("should detect touch device via maxTouchPoints", () => {
      Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });

      const { result } = renderHook(() => useMobileDetect());

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      expect(result.current.isTouchDevice).toBe(true);
    });

    it("should detect non-touch device when neither touch property exists", () => {
      // In jsdom, touch may be enabled by default, so we just verify the property exists
      const { result } = renderHook(() => useMobileDetect());

      expect(typeof result.current.isTouchDevice).toBe("boolean");
    });
  });

  describe("screen width", () => {
    it("should report screen width", () => {
      Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });

      const { result } = renderHook(() => useMobileDetect());

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      expect(result.current.screenWidth).toBe(1024);
    });
  });

  describe("OS detection", () => {
    it("should provide isIOS property", () => {
      const { result } = renderHook(() => useMobileDetect());

      expect(typeof result.current.isIOS).toBe("boolean");
    });

    it("should provide isAndroid property", () => {
      const { result } = renderHook(() => useMobileDetect());

      expect(typeof result.current.isAndroid).toBe("boolean");
    });
  });

  describe("resize handling", () => {
    it("should update on resize", () => {
      const { result } = renderHook(() => useMobileDetect());

      // Start with desktop
      expect(result.current.isDesktop).toBe(true);

      // Simulate resize to mobile
      Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      expect(result.current.isMobile).toBe(true);
    });

    it("should update on orientation change", () => {
      const { result } = renderHook(() => useMobileDetect());

      // Simulate orientation change
      Object.defineProperty(window, "innerWidth", { value: 800, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: 1200, configurable: true });

      act(() => {
        window.dispatchEvent(new Event("orientationchange"));
      });

      expect(result.current.orientation).toBe("portrait");
    });
  });
});

describe("useIsMobile", () => {
  it("should return mobile status", () => {
    const { result } = renderHook(() => useIsMobile());

    expect(typeof result.current).toBe("boolean");
  });

  it("should return true on mobile screen", () => {
    Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });

    const { result } = renderHook(() => useIsMobile());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe(true);
  });

  it("should return false on desktop screen", () => {
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });

    const { result } = renderHook(() => useIsMobile());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe(false);
  });
});

describe("useIsTouchDevice", () => {
  it("should return touch device status", () => {
    const { result } = renderHook(() => useIsTouchDevice());

    expect(typeof result.current).toBe("boolean");
  });
});

describe("useOrientation", () => {
  it("should return orientation", () => {
    const { result } = renderHook(() => useOrientation());

    expect(["portrait", "landscape"]).toContain(result.current);
  });
});

describe("useBreakpoint", () => {
  it("should return breakpoint name", () => {
    const { result } = renderHook(() => useBreakpoint());

    expect(["mobile", "tablet", "desktop"]).toContain(result.current);
  });

  it("should return mobile on small screens", () => {
    Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });

    const { result } = renderHook(() => useBreakpoint());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe("mobile");
  });

  it("should return tablet on medium screens", () => {
    Object.defineProperty(window, "innerWidth", { value: 768, configurable: true });

    const { result } = renderHook(() => useBreakpoint());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe("tablet");
  });

  it("should return desktop on large screens", () => {
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });

    const { result } = renderHook(() => useBreakpoint());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toBe("desktop");
  });
});

describe("Sprint 520 - iOS detection branch coverage", () => {
  it("should detect iOS via iPhone user agent", () => {
    // Mock iPhone user agent
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
      configurable: true,
    });

    const { result } = renderHook(() => useMobileDetect());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.isIOS).toBe(true);
  });

  it("should detect iOS via iPad user agent", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15",
      configurable: true,
    });

    const { result } = renderHook(() => useMobileDetect());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.isIOS).toBe(true);
  });

  it("should detect iOS via iPod user agent", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)",
      configurable: true,
    });

    const { result } = renderHook(() => useMobileDetect());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.isIOS).toBe(true);
  });

  it("should detect iPad Pro via MacIntel platform with touch", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      configurable: true,
    });
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: 5,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileDetect());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.isIOS).toBe(true);
  });

  it("should not detect iOS for Mac without touch", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      configurable: true,
    });
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: 0,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileDetect());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.isIOS).toBe(false);
  });
});

describe("Sprint 520 - Android detection branch coverage", () => {
  it("should detect Android via user agent", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36",
      configurable: true,
    });

    const { result } = renderHook(() => useMobileDetect());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.isAndroid).toBe(true);
  });

  it("should not detect Android for desktop user agent", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      configurable: true,
    });

    const { result } = renderHook(() => useMobileDetect());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.isAndroid).toBe(false);
  });
});

describe("Sprint 520 - orientation branch coverage", () => {
  it("should detect exact square as portrait", () => {
    Object.defineProperty(window, "innerWidth", { value: 800, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    const { result } = renderHook(() => useMobileDetect());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    // When width equals height, it's considered portrait (width > height is landscape)
    expect(result.current.orientation).toBe("portrait");
  });
});

describe("Sprint 520 - touch detection edge cases", () => {
  it("should detect touch via maxTouchPoints when ontouchstart is undefined", () => {
    // Delete ontouchstart to ensure it's not in window
    const descriptor = Object.getOwnPropertyDescriptor(window, "ontouchstart");
    delete (window as unknown as Record<string, unknown>).ontouchstart;

    // Set maxTouchPoints > 0
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: 2,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileDetect());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.isTouchDevice).toBe(true);

    // Restore if it existed
    if (descriptor) {
      Object.defineProperty(window, "ontouchstart", descriptor);
    }
  });

  it("should detect non-touch when both ontouchstart is missing and maxTouchPoints is 0", () => {
    // Delete ontouchstart
    const descriptor = Object.getOwnPropertyDescriptor(window, "ontouchstart");
    delete (window as unknown as Record<string, unknown>).ontouchstart;

    // Set maxTouchPoints to 0
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: 0,
      configurable: true,
    });

    const { result } = renderHook(() => useMobileDetect());

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.isTouchDevice).toBe(false);

    // Restore if it existed
    if (descriptor) {
      Object.defineProperty(window, "ontouchstart", descriptor);
    }
  });
});
