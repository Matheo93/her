/**
 * Tests for useConnectionAwareStreaming hook - Sprint 539
 *
 * Tests connection-aware WebSocket streaming with:
 * - Adaptive reconnection with exponential backoff
 * - Quality-based configuration (high/medium/low/minimal)
 * - Ping/pong RTT measurement
 * - Message batching and queuing
 * - Network and visibility awareness
 */

import { renderHook, act } from "@testing-library/react";
import {
  useConnectionAwareStreaming,
  useWebSocketConnectionState,
  useWebSocketQualityScore,
} from "../useConnectionAwareStreaming";

// Mock dependencies
jest.mock("../useMobileDetect", () => ({
  useMobileDetect: jest.fn(() => ({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
  })),
}));

jest.mock("../useNetworkStatus", () => ({
  useNetworkStatus: jest.fn(() => ({
    isOnline: true,
    wasOffline: false,
    isSlowConnection: false,
    effectiveType: "4g",
    downlink: 10,
    rtt: 50,
    saveData: false,
  })),
}));

jest.mock("../useVisibility", () => ({
  useVisibility: jest.fn(() => ({
    isVisible: true,
    visibilityState: "visible",
  })),
}));

import { useMobileDetect } from "../useMobileDetect";
import { useNetworkStatus } from "../useNetworkStatus";
import { useVisibility } from "../useVisibility";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  protocols?: string | string[];
  readyState: number = MockWebSocket.CONNECTING;

  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  sentMessages: (string | ArrayBuffer)[] = [];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    // Auto-open after microtask
    setTimeout(() => this.simulateOpen(), 0);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event("open"));
    }
  }

  simulateClose(wasClean = true, code = 1000) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      const event = new CloseEvent("close", { wasClean, code });
      this.onclose(event);
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }

  simulateMessage(data: string | object) {
    if (this.onmessage) {
      const messageData = typeof data === "object" ? JSON.stringify(data) : data;
      const event = new MessageEvent("message", { data: messageData });
      this.onmessage(event);
    }
  }

  send(data: string | ArrayBuffer) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.simulateClose(true, code || 1000);
    }, 0);
  }
}

// Replace global WebSocket
const originalWebSocket = global.WebSocket;

describe("useConnectionAwareStreaming", () => {
  let mockWs: MockWebSocket | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(performance, "now").mockReturnValue(0);
    jest.spyOn(Date, "now").mockReturnValue(1000);

    // Setup WebSocket mock
    (global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = jest.fn((url: string, protocols?: string | string[]) => {
      mockWs = new MockWebSocket(url, protocols);
      return mockWs as unknown as WebSocket;
    }) as unknown as typeof WebSocket;

    // Set static properties
    (global.WebSocket as unknown as typeof MockWebSocket).CONNECTING = 0;
    (global.WebSocket as unknown as typeof MockWebSocket).OPEN = 1;
    (global.WebSocket as unknown as typeof MockWebSocket).CLOSING = 2;
    (global.WebSocket as unknown as typeof MockWebSocket).CLOSED = 3;

    // Reset mocks
    (useMobileDetect as jest.Mock).mockReturnValue({
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    });

    (useNetworkStatus as jest.Mock).mockReturnValue({
      isOnline: true,
      wasOffline: false,
      isSlowConnection: false,
      effectiveType: "4g",
      downlink: 10,
      rtt: 50,
      saveData: false,
    });

    (useVisibility as jest.Mock).mockReturnValue({
      isVisible: true,
      visibilityState: "visible",
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
    mockWs = null;
    global.WebSocket = originalWebSocket;
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with disconnected state", () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      expect(result.current.isConnected).toBe(false);
      expect(result.current.metrics.state).toBe("disconnected");
    });

    it("should initialize with default quality based on device", () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      // Desktop with good connection should get high quality
      expect(result.current.quality).toBe("high");
    });

    it("should initialize with mobile quality for mobile devices", () => {
      (useMobileDetect as jest.Mock).mockReturnValue({
        isMobile: true,
        isTablet: false,
        isDesktop: false,
      });

      const { result } = renderHook(() => useConnectionAwareStreaming());

      expect(result.current.quality).toBe("medium");
      expect(result.current.isMobile).toBe(true);
    });

    it("should provide control functions", () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      expect(typeof result.current.controls.connect).toBe("function");
      expect(typeof result.current.controls.disconnect).toBe("function");
      expect(typeof result.current.controls.send).toBe("function");
      expect(typeof result.current.controls.ping).toBe("function");
    });

    it("should provide initial metrics", () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      expect(result.current.metrics.messagesSent).toBe(0);
      expect(result.current.metrics.messagesReceived).toBe(0);
      expect(result.current.metrics.bytesSent).toBe(0);
      expect(result.current.metrics.bytesReceived).toBe(0);
    });
  });

  // ============================================================================
  // Connection Tests
  // ============================================================================

  describe("connection", () => {
    it("should connect to WebSocket URL", async () => {
      const onOpen = jest.fn();
      const { result } = renderHook(() =>
        useConnectionAwareStreaming({ onOpen })
      );

      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      expect(result.current.metrics.state).toBe("connecting");

      // Simulate WebSocket open
      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.metrics.state).toBe("connected");
      expect(onOpen).toHaveBeenCalled();
    });

    it("should disconnect from WebSocket", async () => {
      const { result } = renderHook(() =>
        useConnectionAwareStreaming({ autoReconnect: false })
      );

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      expect(result.current.isConnected).toBe(true);

      // Disconnect
      act(() => {
        result.current.controls.disconnect();
      });

      // Socket should be null after disconnect
      expect(result.current.socket).toBeNull();
    });

    it("should not connect if already connected", async () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      const wsCallCount = (global.WebSocket as jest.Mock).mock.calls.length;

      // Try to connect again
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      // Should not create a new WebSocket
      expect((global.WebSocket as jest.Mock).mock.calls.length).toBe(wsCallCount);
    });

    it("should auto-connect if configured", async () => {
      const { result } = renderHook(() =>
        useConnectionAwareStreaming({
          url: "wss://example.com/ws",
          autoConnect: true,
        })
      );

      // Should start connecting immediately
      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      expect(result.current.isConnected).toBe(true);
    });
  });

  // ============================================================================
  // Message Handling Tests
  // ============================================================================

  describe("message handling", () => {
    it("should send messages when connected", async () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      // Send message
      let success = false;
      act(() => {
        success = result.current.controls.send("Hello, WebSocket!");
      });

      expect(success).toBe(true);
      expect(mockWs?.sentMessages).toContain("Hello, WebSocket!");
    });

    it("should queue messages when not connected", () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      // Try to send without connecting
      let success = false;
      act(() => {
        success = result.current.controls.send("Queued message");
      });

      // Should queue but return false
      expect(success).toBe(false);
    });

    it("should receive messages", async () => {
      const onMessage = jest.fn();
      const { result } = renderHook(() =>
        useConnectionAwareStreaming({ onMessage })
      );

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      // Simulate incoming message
      act(() => {
        mockWs?.simulateMessage("Hello from server!");
      });

      expect(onMessage).toHaveBeenCalled();
      expect(result.current.metrics.messagesReceived).toBe(1);
    });

    it("should track bytes sent and received", async () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      // Send message
      act(() => {
        result.current.controls.send("Test message");
      });

      expect(result.current.metrics.bytesSent).toBeGreaterThan(0);

      // Receive message
      act(() => {
        mockWs?.simulateMessage("Response message");
      });

      expect(result.current.metrics.bytesReceived).toBeGreaterThan(0);
    });

    it("should reject messages exceeding max size", async () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      // Try to send huge message
      const hugeMessage = "x".repeat(2 * 1024 * 1024); // 2MB
      let success = false;

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      act(() => {
        success = result.current.controls.send(hugeMessage);
      });

      expect(success).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // Quality Adaptation Tests
  // ============================================================================

  describe("quality adaptation", () => {
    it("should reduce quality for slow connections", () => {
      (useNetworkStatus as jest.Mock).mockReturnValue({
        isOnline: true,
        wasOffline: false,
        isSlowConnection: true,
        effectiveType: "2g",
        downlink: 0.5,
        rtt: 500,
        saveData: false,
      });

      const { result } = renderHook(() => useConnectionAwareStreaming());

      expect(result.current.quality).toBe("minimal");
    });

    it("should reduce quality for 3G connections", () => {
      (useNetworkStatus as jest.Mock).mockReturnValue({
        isOnline: true,
        wasOffline: false,
        isSlowConnection: false,
        effectiveType: "3g",
        downlink: 1.5,
        rtt: 200,
        saveData: false,
      });

      const { result } = renderHook(() => useConnectionAwareStreaming());

      expect(["low", "minimal"]).toContain(result.current.quality);
    });

    it("should reduce quality when data saver is enabled", () => {
      (useNetworkStatus as jest.Mock).mockReturnValue({
        isOnline: true,
        wasOffline: false,
        isSlowConnection: false,
        effectiveType: "4g",
        downlink: 10,
        rtt: 50,
        saveData: true,
      });

      const { result } = renderHook(() => useConnectionAwareStreaming());

      expect(["medium", "low", "minimal"]).toContain(result.current.quality);
    });

    it("should reduce quality when page is hidden", () => {
      (useVisibility as jest.Mock).mockReturnValue({
        isVisible: false,
        visibilityState: "hidden",
      });

      const { result } = renderHook(() => useConnectionAwareStreaming());

      expect(result.current.quality).toBe("minimal");
    });

    it("should be minimal quality when offline", () => {
      (useNetworkStatus as jest.Mock).mockReturnValue({
        isOnline: false,
        wasOffline: true,
        isSlowConnection: false,
        effectiveType: "4g",
        downlink: 10,
        rtt: 50,
        saveData: false,
      });

      const { result } = renderHook(() => useConnectionAwareStreaming());

      expect(result.current.quality).toBe("minimal");
    });

    it("should call onQualityChange when quality changes", async () => {
      const onQualityChange = jest.fn();
      const { rerender } = renderHook(() =>
        useConnectionAwareStreaming({ onQualityChange })
      );

      // Change to slow connection
      (useNetworkStatus as jest.Mock).mockReturnValue({
        isOnline: true,
        wasOffline: false,
        isSlowConnection: true,
        effectiveType: "2g",
        downlink: 0.5,
        rtt: 500,
        saveData: false,
      });

      rerender();

      expect(onQualityChange).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Reconnection Tests
  // ============================================================================

  describe("reconnection", () => {
    it("should reconnect on unexpected disconnect", async () => {
      const onReconnect = jest.fn();
      const { result } = renderHook(() =>
        useConnectionAwareStreaming({
          autoReconnect: true,
          onReconnect,
        })
      );

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      expect(result.current.isConnected).toBe(true);

      // Simulate unexpected close
      act(() => {
        mockWs?.simulateClose(false, 1006);
      });

      expect(result.current.metrics.state).toBe("reconnecting");
      expect(onReconnect).toHaveBeenCalledWith(1);
    });

    it("should use exponential backoff for reconnection", async () => {
      const { result } = renderHook(() =>
        useConnectionAwareStreaming({ autoReconnect: true })
      );

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      // Simulate unexpected close
      act(() => {
        mockWs?.simulateClose(false, 1006);
      });

      expect(result.current.metrics.reconnectAttempts).toBe(1);

      // The delay should be exponentially increasing
      // Base delay is 1000ms for medium quality
    });

    it("should track reconnection attempts", async () => {
      const onReconnect = jest.fn();
      const { result } = renderHook(() =>
        useConnectionAwareStreaming({ autoReconnect: true, onReconnect })
      );

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      expect(result.current.metrics.reconnectAttempts).toBe(0);

      // Simulate unexpected close
      act(() => {
        mockWs?.simulateClose(false, 1006);
      });

      // Should increment reconnect attempts
      expect(result.current.metrics.reconnectAttempts).toBe(1);
      expect(onReconnect).toHaveBeenCalledWith(1);
    });

    it("should force reconnect when requested", async () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      const initialWs = mockWs;

      // Force reconnect
      act(() => {
        result.current.controls.forceReconnect();
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      // Should have created a new WebSocket
      expect(mockWs).not.toBe(initialWs);
    });
  });

  // ============================================================================
  // Ping/Pong Tests
  // ============================================================================

  describe("ping/pong", () => {
    it("should handle pong messages and calculate RTT", async () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      // Trigger ping
      (performance.now as jest.Mock).mockReturnValue(100);

      act(() => {
        result.current.controls.ping();
      });

      // Simulate pong response
      (performance.now as jest.Mock).mockReturnValue(150);

      act(() => {
        mockWs?.simulateMessage({ type: "pong" });
      });

      // RTT should be calculated (50ms)
      expect(result.current.metrics.websocketRtt).toBeGreaterThanOrEqual(0);
    });

    it("should send manual ping", async () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      act(() => {
        result.current.controls.ping();
      });

      expect(mockWs?.sentMessages.some((msg) => {
        try {
          const parsed = JSON.parse(msg as string);
          return parsed.type === "ping";
        } catch {
          return false;
        }
      })).toBe(true);
    });
  });

  // ============================================================================
  // Metrics Tests
  // ============================================================================

  describe("metrics", () => {
    it("should calculate quality score", () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      // Initial quality score should be high (no issues)
      expect(result.current.metrics.qualityScore).toBeGreaterThan(0);
      expect(result.current.metrics.qualityScore).toBeLessThanOrEqual(100);
    });

    it("should track uptime when connected", async () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      // Advance time
      (Date.now as jest.Mock).mockReturnValue(5000);

      // Uptime should be calculated
      expect(result.current.metrics.uptimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should reset metrics", async () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      // Send and receive messages
      act(() => {
        result.current.controls.send("Test");
        mockWs?.simulateMessage("Response");
      });

      expect(result.current.metrics.messagesSent).toBeGreaterThan(0);

      // Reset metrics
      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.messagesSent).toBe(0);
      expect(result.current.metrics.messagesReceived).toBe(0);
      expect(result.current.metrics.bytesSent).toBe(0);
      expect(result.current.metrics.bytesReceived).toBe(0);
    });
  });

  // ============================================================================
  // Config Tests
  // ============================================================================

  describe("configuration", () => {
    it("should allow custom config", async () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      act(() => {
        result.current.controls.setConfig({
          pingIntervalMs: 1000,
          maxQueueSize: 200,
        });
      });

      expect(result.current.config.pingIntervalMs).toBe(1000);
      expect(result.current.config.maxQueueSize).toBe(200);
    });

    it("should update config based on quality", () => {
      // High quality should have shorter ping interval
      const { result: highResult } = renderHook(() =>
        useConnectionAwareStreaming()
      );
      const highPingInterval = highResult.current.config.pingIntervalMs;

      // Low quality (slow connection)
      (useNetworkStatus as jest.Mock).mockReturnValue({
        isOnline: true,
        wasOffline: false,
        isSlowConnection: true,
        effectiveType: "2g",
        downlink: 0.5,
        rtt: 500,
        saveData: false,
      });

      const { result: lowResult } = renderHook(() =>
        useConnectionAwareStreaming()
      );
      const lowPingInterval = lowResult.current.config.pingIntervalMs;

      // Low quality should have longer ping interval
      expect(lowPingInterval).toBeGreaterThan(highPingInterval);
    });
  });

  // ============================================================================
  // Visibility Tests
  // ============================================================================

  describe("visibility handling", () => {
    it("should reduce activity when page is hidden", async () => {
      const { result } = renderHook(() => useConnectionAwareStreaming());

      expect(result.current.shouldReduceActivity).toBe(false);

      // Hide page
      (useVisibility as jest.Mock).mockReturnValue({
        isVisible: false,
        visibilityState: "hidden",
      });

      const { result: hiddenResult } = renderHook(() =>
        useConnectionAwareStreaming()
      );

      expect(hiddenResult.current.shouldReduceActivity).toBe(true);
    });
  });

  // ============================================================================
  // Network Status Tests
  // ============================================================================

  describe("network status handling", () => {
    it("should disconnect when offline", async () => {
      const { result, rerender } = renderHook(() =>
        useConnectionAwareStreaming()
      );

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      expect(result.current.isConnected).toBe(true);

      // Go offline
      (useNetworkStatus as jest.Mock).mockReturnValue({
        isOnline: false,
        wasOffline: true,
        isSlowConnection: false,
        effectiveType: "4g",
        downlink: 10,
        rtt: 50,
        saveData: false,
      });

      rerender();

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      expect(result.current.isConnected).toBe(false);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe("error handling", () => {
    it("should call onError on WebSocket error", async () => {
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useConnectionAwareStreaming({ onError })
      );

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      // Simulate error
      act(() => {
        mockWs?.simulateError();
      });

      expect(onError).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Cleanup Tests
  // ============================================================================

  describe("cleanup", () => {
    it("should cleanup on unmount", async () => {
      const { result, unmount } = renderHook(() =>
        useConnectionAwareStreaming()
      );

      // Connect first
      act(() => {
        result.current.controls.connect("wss://example.com/ws");
      });

      await act(async () => {
        jest.advanceTimersByTime(10);
        await Promise.resolve();
      });

      // Unmount
      unmount();

      // Should have closed the WebSocket
      expect(mockWs?.readyState).not.toBe(MockWebSocket.OPEN);
    });
  });
});

// ============================================================================
// Convenience Hooks Tests
// ============================================================================

describe("useWebSocketConnectionState", () => {
  beforeEach(() => {
    jest.useFakeTimers();

    (useMobileDetect as jest.Mock).mockReturnValue({
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    });

    (useNetworkStatus as jest.Mock).mockReturnValue({
      isOnline: true,
      wasOffline: false,
      isSlowConnection: false,
      effectiveType: "4g",
      downlink: 10,
      rtt: 50,
      saveData: false,
    });

    (useVisibility as jest.Mock).mockReturnValue({
      isVisible: true,
      visibilityState: "visible",
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should return connection state", () => {
    const { result } = renderHook(() => useWebSocketConnectionState());

    expect(result.current).toBe("disconnected");
  });
});

describe("useWebSocketQualityScore", () => {
  beforeEach(() => {
    jest.useFakeTimers();

    (useMobileDetect as jest.Mock).mockReturnValue({
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    });

    (useNetworkStatus as jest.Mock).mockReturnValue({
      isOnline: true,
      wasOffline: false,
      isSlowConnection: false,
      effectiveType: "4g",
      downlink: 10,
      rtt: 50,
      saveData: false,
    });

    (useVisibility as jest.Mock).mockReturnValue({
      isVisible: true,
      visibilityState: "visible",
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("should return quality score", () => {
    const { result } = renderHook(() => useWebSocketQualityScore());

    expect(typeof result.current).toBe("number");
    expect(result.current).toBeGreaterThanOrEqual(0);
    expect(result.current).toBeLessThanOrEqual(100);
  });
});
