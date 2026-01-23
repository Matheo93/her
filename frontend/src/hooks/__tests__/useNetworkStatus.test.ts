/**
 * Tests for useNetworkStatus hook - Sprint 536
 *
 * Tests:
 * - Initialization and default state
 * - Online/offline status detection
 * - Connection type detection (4g, 3g, 2g, wifi, ethernet)
 * - Network information (downlink, rtt, effectiveType)
 * - Slow connection detection
 * - Save data mode detection
 * - Event listeners (online, offline, connection change)
 * - Convenience hooks (useIsOnline, useIsSlowConnection)
 */

import { renderHook, act } from "@testing-library/react";
import {
  useNetworkStatus,
  useIsOnline,
  useIsSlowConnection,
} from "../useNetworkStatus";

describe("useNetworkStatus", () => {
  let originalNavigator: Navigator;
  let onlineListeners: EventListener[] = [];
  let offlineListeners: EventListener[] = [];
  let connectionListeners: EventListener[] = [];

  beforeEach(() => {
    // Store original navigator
    originalNavigator = window.navigator;

    // Reset listeners
    onlineListeners = [];
    offlineListeners = [];
    connectionListeners = [];

    // Mock addEventListener
    jest.spyOn(window, "addEventListener").mockImplementation((event, cb) => {
      if (event === "online") onlineListeners.push(cb as EventListener);
      if (event === "offline") offlineListeners.push(cb as EventListener);
    });

    jest.spyOn(window, "removeEventListener").mockImplementation((event, cb) => {
      if (event === "online") {
        onlineListeners = onlineListeners.filter((l) => l !== cb);
      }
      if (event === "offline") {
        offlineListeners = offlineListeners.filter((l) => l !== cb);
      }
    });

    // Default navigator.onLine to true
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });

    // Default navigator.connection
    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: "4g",
        downlink: 10,
        rtt: 50,
        saveData: false,
        type: "wifi",
        addEventListener: jest.fn((event: string, cb: EventListener) => {
          if (event === "change") connectionListeners.push(cb);
        }),
        removeEventListener: jest.fn((event: string, cb: EventListener) => {
          if (event === "change") {
            connectionListeners = connectionListeners.filter((l) => l !== cb);
          }
        }),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with online status", () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(true);
      expect(result.current.wasOffline).toBe(false);
    });

    it("should initialize with connection type", () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.connectionType).toBeDefined();
    });

    it("should initialize with network metrics", () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.downlink).toBeDefined();
      expect(result.current.rtt).toBeDefined();
      expect(result.current.effectiveType).toBeDefined();
    });

    it("should initialize with saveData status", () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.saveData).toBe(false);
    });

    it("should initialize isSlowConnection based on network", () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(typeof result.current.isSlowConnection).toBe("boolean");
    });
  });

  // ============================================================================
  // Online/Offline Status Tests
  // ============================================================================

  describe("online/offline status", () => {
    it("should detect offline status", () => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(false);
    });

    it("should update on online event", () => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(false);

      // Simulate coming online
      Object.defineProperty(navigator, "onLine", {
        value: true,
        writable: true,
        configurable: true,
      });

      act(() => {
        onlineListeners.forEach((cb) => cb(new Event("online")));
      });

      expect(result.current.isOnline).toBe(true);
    });

    it("should update on offline event", () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isOnline).toBe(true);

      // Simulate going offline
      Object.defineProperty(navigator, "onLine", {
        value: false,
        writable: true,
        configurable: true,
      });

      act(() => {
        offlineListeners.forEach((cb) => cb(new Event("offline")));
      });

      expect(result.current.isOnline).toBe(false);
    });

    it("should track wasOffline after going offline", () => {
      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.wasOffline).toBe(false);

      // Go offline
      Object.defineProperty(navigator, "onLine", {
        value: false,
        writable: true,
        configurable: true,
      });

      act(() => {
        offlineListeners.forEach((cb) => cb(new Event("offline")));
      });

      expect(result.current.wasOffline).toBe(true);

      // Come back online - wasOffline should stay true
      Object.defineProperty(navigator, "onLine", {
        value: true,
        writable: true,
        configurable: true,
      });

      act(() => {
        onlineListeners.forEach((cb) => cb(new Event("online")));
      });

      expect(result.current.wasOffline).toBe(true);
    });
  });

  // ============================================================================
  // Connection Type Tests
  // ============================================================================

  describe("connection type detection", () => {
    it("should detect wifi connection", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "4g",
          downlink: 10,
          rtt: 50,
          saveData: false,
          type: "wifi",
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.connectionType).toBe("wifi");
    });

    it("should detect ethernet connection", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "4g",
          downlink: 100,
          rtt: 10,
          saveData: false,
          type: "ethernet",
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.connectionType).toBe("ethernet");
    });

    it("should detect 4g connection from effectiveType", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "4g",
          downlink: 10,
          rtt: 50,
          saveData: false,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.connectionType).toBe("4g");
    });

    it("should detect 3g connection", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "3g",
          downlink: 1.5,
          rtt: 200,
          saveData: false,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.connectionType).toBe("3g");
    });

    it("should detect 2g connection", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "2g",
          downlink: 0.3,
          rtt: 500,
          saveData: false,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.connectionType).toBe("2g");
    });

    it("should detect slow-2g connection", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "slow-2g",
          downlink: 0.05,
          rtt: 2000,
          saveData: false,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.connectionType).toBe("slow-2g");
    });

    it("should handle unknown connection type", () => {
      Object.defineProperty(navigator, "connection", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.connectionType).toBe("unknown");
    });
  });

  // ============================================================================
  // Network Metrics Tests
  // ============================================================================

  describe("network metrics", () => {
    it("should provide downlink speed", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "4g",
          downlink: 15.5,
          rtt: 50,
          saveData: false,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.downlink).toBe(15.5);
    });

    it("should provide RTT", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "4g",
          downlink: 10,
          rtt: 75,
          saveData: false,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.rtt).toBe(75);
    });

    it("should provide effective type", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "4g",
          downlink: 10,
          rtt: 50,
          saveData: false,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.effectiveType).toBe("4g");
    });

    it("should handle null metrics when connection API unavailable", () => {
      Object.defineProperty(navigator, "connection", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.downlink).toBeNull();
      expect(result.current.rtt).toBeNull();
      expect(result.current.effectiveType).toBeNull();
    });
  });

  // ============================================================================
  // Slow Connection Detection Tests
  // ============================================================================

  describe("slow connection detection", () => {
    it("should detect slow-2g as slow", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "slow-2g",
          downlink: 0.05,
          rtt: 2000,
          saveData: false,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isSlowConnection).toBe(true);
    });

    it("should detect 2g as slow", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "2g",
          downlink: 0.3,
          rtt: 500,
          saveData: false,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isSlowConnection).toBe(true);
    });

    it("should detect high RTT as slow", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "4g",
          downlink: 10,
          rtt: 600, // > 500ms threshold
          saveData: false,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isSlowConnection).toBe(true);
    });

    it("should detect low downlink as slow", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "3g",
          downlink: 0.5, // < 1 Mbps threshold
          rtt: 200,
          saveData: false,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isSlowConnection).toBe(true);
    });

    it("should detect offline as slow", () => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isSlowConnection).toBe(true);
    });

    it("should not mark 4g with good metrics as slow", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "4g",
          downlink: 10,
          rtt: 50,
          saveData: false,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isSlowConnection).toBe(false);
    });
  });

  // ============================================================================
  // Save Data Mode Tests
  // ============================================================================

  describe("save data mode", () => {
    it("should detect save data mode enabled", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "4g",
          downlink: 10,
          rtt: 50,
          saveData: true,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.saveData).toBe(true);
    });

    it("should mark save data mode as slow connection", () => {
      Object.defineProperty(navigator, "connection", {
        value: {
          effectiveType: "4g",
          downlink: 10,
          rtt: 50,
          saveData: true,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        },
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.isSlowConnection).toBe(true);
    });
  });

  // ============================================================================
  // Connection Change Event Tests
  // ============================================================================

  describe("connection change events", () => {
    it("should update on connection change", () => {
      const mockConnection = {
        effectiveType: "4g",
        downlink: 10,
        rtt: 50,
        saveData: false,
        addEventListener: jest.fn((event: string, cb: EventListener) => {
          if (event === "change") connectionListeners.push(cb);
        }),
        removeEventListener: jest.fn(),
      };

      Object.defineProperty(navigator, "connection", {
        value: mockConnection,
        writable: true,
        configurable: true,
      });

      const { result } = renderHook(() => useNetworkStatus());

      expect(result.current.effectiveType).toBe("4g");

      // Change connection
      mockConnection.effectiveType = "3g";
      mockConnection.downlink = 1.5;
      mockConnection.rtt = 200;

      act(() => {
        connectionListeners.forEach((cb) => cb(new Event("change")));
      });

      expect(result.current.effectiveType).toBe("3g");
      expect(result.current.downlink).toBe(1.5);
      expect(result.current.rtt).toBe(200);
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe("cleanup", () => {
    it("should remove event listeners on unmount", () => {
      const removeOnline = jest.fn();
      const removeOffline = jest.fn();

      jest.spyOn(window, "removeEventListener").mockImplementation((event) => {
        if (event === "online") removeOnline();
        if (event === "offline") removeOffline();
      });

      const { unmount } = renderHook(() => useNetworkStatus());

      unmount();

      expect(removeOnline).toHaveBeenCalled();
      expect(removeOffline).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Convenience Hooks Tests
// ============================================================================

describe("useIsOnline", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: "4g",
        downlink: 10,
        rtt: 50,
        saveData: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    jest.spyOn(window, "addEventListener").mockImplementation(() => {});
    jest.spyOn(window, "removeEventListener").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return true when online", () => {
    const { result } = renderHook(() => useIsOnline());

    expect(result.current).toBe(true);
  });

  it("should return false when offline", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useIsOnline());

    expect(result.current).toBe(false);
  });
});

describe("useIsSlowConnection", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      writable: true,
      configurable: true,
    });

    jest.spyOn(window, "addEventListener").mockImplementation(() => {});
    jest.spyOn(window, "removeEventListener").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return false for fast connection", () => {
    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: "4g",
        downlink: 10,
        rtt: 50,
        saveData: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useIsSlowConnection());

    expect(result.current).toBe(false);
  });

  it("should return true for slow connection", () => {
    Object.defineProperty(navigator, "connection", {
      value: {
        effectiveType: "2g",
        downlink: 0.3,
        rtt: 500,
        saveData: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useIsSlowConnection());

    expect(result.current).toBe(true);
  });
});
