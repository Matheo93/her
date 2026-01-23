/**
 * Tests for Mobile Optimization Hook - Sprint 514
 *
 * Tests device detection, animation settings, and WebSocket settings
 */

import { renderHook, act } from "@testing-library/react";

// Mock window and navigator before importing the hook
const mockNavigator = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  maxTouchPoints: 0,
  hardwareConcurrency: 8,
  deviceMemory: 8,
  connection: {
    effectiveType: "4g",
    downlink: 10,
    rtt: 50,
    saveData: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
};

const mockWindow = {
  innerWidth: 1920,
  innerHeight: 1080,
  devicePixelRatio: 1,
  matchMedia: jest.fn().mockReturnValue({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

// Apply mocks
Object.defineProperty(global, "navigator", {
  value: mockNavigator,
  writable: true,
  configurable: true,
});

// Merge window properties instead of redefining
Object.assign(global.window || {}, mockWindow);

// Import after mocks are set up
import { useMobileOptimization } from "../useMobileOptimization";

describe("useMobileOptimization", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset to desktop defaults
    (global.navigator as typeof mockNavigator).userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
    (global.navigator as typeof mockNavigator).maxTouchPoints = 0;
    (global.navigator as typeof mockNavigator).hardwareConcurrency = 8;
    (global.navigator as typeof mockNavigator).deviceMemory = 8;
    (global.navigator as typeof mockNavigator).connection.effectiveType = "4g";
    (global.navigator as typeof mockNavigator).connection.saveData = false;
    (global.window as typeof mockWindow).innerWidth = 1920;
    (global.window as typeof mockWindow).innerHeight = 1080;
    (global.window as typeof mockWindow).matchMedia = jest.fn().mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });
  });

  describe("device detection", () => {
    it("should detect desktop device correctly", () => {
      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.device.isMobile).toBe(false);
      expect(result.current.device.isLowEndDevice).toBe(false);
      expect(result.current.device.memoryEstimate).toBe("high");
    });

    it("should detect mobile device from user agent", () => {
      (global.navigator as typeof mockNavigator).userAgent =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)";
      (global.navigator as typeof mockNavigator).maxTouchPoints = 5;
      (global.window as typeof mockWindow).innerWidth = 375;

      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.device.isMobile).toBe(true);
    });

    it("should detect low-end device from hardware concurrency", () => {
      (global.navigator as typeof mockNavigator).hardwareConcurrency = 2;

      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.device.isLowEndDevice).toBe(true);
    });

    it("should detect low memory device", () => {
      (global.navigator as typeof mockNavigator).deviceMemory = 2;

      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.device.memoryEstimate).toBe("low");
    });

    it("should respect prefers-reduced-motion", () => {
      (global.window as typeof mockWindow).matchMedia = jest.fn().mockReturnValue({
        matches: true,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      });

      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.device.hasReducedMotion).toBe(true);
      expect(result.current.device.isLowEndDevice).toBe(true);
    });
  });

  describe("connection detection", () => {
    it("should detect fast connection", () => {
      (global.navigator as typeof mockNavigator).connection.effectiveType = "4g";

      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.device.connectionType).toBe("fast");
    });

    it("should detect slow connection from effectiveType", () => {
      (global.navigator as typeof mockNavigator).connection.effectiveType = "2g";

      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.device.connectionType).toBe("slow");
    });

    it("should detect slow connection from high RTT", () => {
      (global.navigator as typeof mockNavigator).connection.effectiveType = undefined;
      (global.navigator as typeof mockNavigator).connection.rtt = 500;

      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.device.connectionType).toBe("slow");
    });

    it("should respect data saver mode", () => {
      (global.navigator as typeof mockNavigator).connection.saveData = true;

      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.device.connectionType).toBe("slow");
    });
  });

  describe("animation settings", () => {
    it("should return high quality settings for desktop", () => {
      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.animations.avatarQuality).toBe("high");
      expect(result.current.animations.targetFPS).toBe(60);
      expect(result.current.animations.enableParticles).toBe(true);
      expect(result.current.animations.enableBlurEffects).toBe(true);
    });

    it("should return medium quality settings for mobile with fast connection", () => {
      (global.navigator as typeof mockNavigator).userAgent =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)";
      (global.navigator as typeof mockNavigator).maxTouchPoints = 5;
      (global.window as typeof mockWindow).innerWidth = 375;
      (global.navigator as typeof mockNavigator).deviceMemory = 4;

      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.animations.avatarQuality).toBe("medium");
      expect(result.current.animations.targetFPS).toBe(30);
      expect(result.current.animations.enableBlurEffects).toBe(false);
    });

    it("should return low quality settings for low-end devices", () => {
      (global.navigator as typeof mockNavigator).hardwareConcurrency = 2;
      (global.navigator as typeof mockNavigator).deviceMemory = 2;

      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.animations.avatarQuality).toBe("low");
      expect(result.current.animations.targetFPS).toBe(24);
      expect(result.current.animations.enableParticles).toBe(false);
      expect(result.current.animations.enableGlowEffects).toBe(false);
    });

    it("should disable animations for reduced motion preference", () => {
      (global.window as typeof mockWindow).matchMedia = jest.fn().mockReturnValue({
        matches: true,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      });

      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.animations.enableBreathingAnimation).toBe(false);
      expect(result.current.animations.enableIdleAnimations).toBe(false);
      expect(result.current.animations.particleCount).toBe(0);
    });
  });

  describe("websocket settings", () => {
    it("should return fast reconnect settings for good connection", () => {
      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.websocket.reconnectDelay).toBe(1000);
      expect(result.current.websocket.pingInterval).toBe(10000);
    });

    it("should return slower reconnect settings for slow connection", () => {
      (global.navigator as typeof mockNavigator).connection.effectiveType = "2g";

      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.websocket.reconnectDelay).toBe(2000);
      expect(result.current.websocket.pingInterval).toBe(20000);
      expect(result.current.websocket.reconnectMaxDelay).toBe(30000);
    });

    it("should enable exponential backoff", () => {
      const { result } = renderHook(() => useMobileOptimization());

      expect(result.current.websocket.enableBackoff).toBe(true);
    });
  });

  describe("performance measurement", () => {
    it("should measure FPS performance", async () => {
      const mockRAF = jest.fn((cb: FrameRequestCallback) => {
        setTimeout(() => cb(performance.now()), 16);
        return 1;
      });
      global.requestAnimationFrame = mockRAF;

      const { result } = renderHook(() => useMobileOptimization());

      let fps: number = 0;
      await act(async () => {
        fps = await result.current.measurePerformance();
      });

      expect(fps).toBeGreaterThan(0);
    });
  });

  describe("connection type updates", () => {
    it("should update connection type manually", () => {
      const { result } = renderHook(() => useMobileOptimization());

      // Simulate connection change
      (global.navigator as typeof mockNavigator).connection.effectiveType = "3g";

      act(() => {
        result.current.updateConnectionType();
      });

      expect(result.current.device.connectionType).toBe("medium");
    });
  });
});

describe("animation settings calculation", () => {
  it("should calculate appropriate particle count for device tier", () => {
    // High-end
    (global.navigator as typeof mockNavigator).deviceMemory = 16;
    const { result: highEnd } = renderHook(() => useMobileOptimization());
    expect(highEnd.current.animations.particleCount).toBe(15);

    // Low-end
    (global.navigator as typeof mockNavigator).deviceMemory = 2;
    (global.navigator as typeof mockNavigator).hardwareConcurrency = 2;
    const { result: lowEnd } = renderHook(() => useMobileOptimization());
    expect(lowEnd.current.animations.particleCount).toBeLessThanOrEqual(3);
  });

  it("should calculate appropriate spring physics for device tier", () => {
    // High-end: stiffer, faster animations
    (global.navigator as typeof mockNavigator).deviceMemory = 16;
    const { result: highEnd } = renderHook(() => useMobileOptimization());
    expect(highEnd.current.animations.springStiffness).toBeGreaterThan(100);

    // Low-end: softer, simpler animations
    (global.navigator as typeof mockNavigator).deviceMemory = 2;
    (global.navigator as typeof mockNavigator).hardwareConcurrency = 2;
    const { result: lowEnd } = renderHook(() => useMobileOptimization());
    expect(lowEnd.current.animations.springStiffness).toBeLessThan(100);
  });
});
