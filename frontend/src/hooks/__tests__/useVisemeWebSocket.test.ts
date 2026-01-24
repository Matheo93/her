/**
 * Tests for useVisemeWebSocket hook - Sprint 531
 *
 * Tests:
 * - Initialization with default state
 * - WebSocket connection lifecycle
 * - Sending audio data (ArrayBuffer and base64)
 * - Receiving viseme weights
 * - Reconnection logic
 * - Cleanup on unmount
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useVisemeWebSocket } from "../useVisemeWebSocket";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sentMessages: string[] = [];
  eventListeners: Map<string, Set<() => void>> = new Map();

  constructor(url: string) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  addEventListener(event: string, handler: () => void) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  removeEventListener(event: string, handler: () => void) {
    this.eventListeners.get(event)?.delete(handler);
  }

  // Helper to simulate connection
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  // Helper to simulate message
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  // Helper to simulate error
  simulateError() {
    this.onerror?.();
  }
}

// Store WebSocket instances for testing
let mockWebSocketInstances: MockWebSocket[] = [];

// Use the actual WebSocket constants
const WS_OPEN = 1;

describe("useVisemeWebSocket", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockWebSocketInstances = [];

    // Mock global WebSocket with matching constants
    const MockWebSocketClass = jest.fn().mockImplementation((url: string) => {
      const ws = new MockWebSocket(url);
      mockWebSocketInstances.push(ws);
      return ws;
    }) as unknown as typeof WebSocket;

    // Add static constants that match the real WebSocket
    MockWebSocketClass.CONNECTING = 0;
    MockWebSocketClass.OPEN = 1;
    MockWebSocketClass.CLOSING = 2;
    MockWebSocketClass.CLOSED = 3;

    (global as unknown as { WebSocket: typeof WebSocket }).WebSocket = MockWebSocketClass;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe("initialization", () => {
    it("should initialize with default viseme weights", () => {
      const { result } = renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: false,
        })
      );

      expect(result.current.visemeWeights).toEqual({ sil: 1 });
      expect(result.current.isConnected).toBe(false);
    });

    it("should not connect when disabled", () => {
      renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: false,
        })
      );

      expect(mockWebSocketInstances.length).toBe(0);
    });

    it("should connect when enabled", () => {
      renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      expect(mockWebSocketInstances.length).toBe(1);
      expect(mockWebSocketInstances[0].url).toBe("ws://localhost:8000/ws/viseme");
    });

    it("should handle https to wss conversion", () => {
      renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "https://api.example.com",
          enabled: true,
        })
      );

      expect(mockWebSocketInstances[0].url).toBe("wss://api.example.com/ws/viseme");
    });
  });

  // ============================================================================
  // Connection Lifecycle Tests
  // ============================================================================

  describe("connection lifecycle", () => {
    it("should set isConnected to true when WebSocket opens", async () => {
      const { result } = renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      expect(result.current.isConnected).toBe(false);

      act(() => {
        mockWebSocketInstances[0].simulateOpen();
      });

      expect(result.current.isConnected).toBe(true);
    });

    it("should set isConnected to false when WebSocket closes", async () => {
      const { result } = renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      act(() => {
        mockWebSocketInstances[0].simulateOpen();
      });

      expect(result.current.isConnected).toBe(true);

      act(() => {
        mockWebSocketInstances[0].close();
      });

      expect(result.current.isConnected).toBe(false);
    });

    it("should reset viseme weights when WebSocket closes", async () => {
      const { result } = renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      act(() => {
        mockWebSocketInstances[0].simulateOpen();
        mockWebSocketInstances[0].simulateMessage({
          type: "viseme",
          weights: { A: 0.5, O: 0.3 },
        });
      });

      expect(result.current.visemeWeights).toEqual({ A: 0.5, O: 0.3 });

      act(() => {
        mockWebSocketInstances[0].close();
      });

      expect(result.current.visemeWeights).toEqual({ sil: 1 });
    });

    it("should attempt reconnection after close", async () => {
      renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      expect(mockWebSocketInstances.length).toBe(1);

      act(() => {
        mockWebSocketInstances[0].simulateOpen();
        mockWebSocketInstances[0].close();
      });

      // Advance timers by reconnect delay (3000ms)
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(mockWebSocketInstances.length).toBe(2);
    });

    it("should close WebSocket on error", async () => {
      renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      const closeSpy = jest.spyOn(mockWebSocketInstances[0], "close");

      act(() => {
        mockWebSocketInstances[0].simulateOpen();
        mockWebSocketInstances[0].simulateError();
      });

      expect(closeSpy).toHaveBeenCalled();
    });

    it("should cleanup on unmount", async () => {
      const { unmount } = renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      act(() => {
        mockWebSocketInstances[0].simulateOpen();
      });

      const closeSpy = jest.spyOn(mockWebSocketInstances[0], "close");

      act(() => {
        unmount();
      });

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Message Handling Tests
  // ============================================================================

  describe("message handling", () => {
    it("should update viseme weights on viseme message", async () => {
      const { result } = renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      act(() => {
        mockWebSocketInstances[0].simulateOpen();
        mockWebSocketInstances[0].simulateMessage({
          type: "viseme",
          weights: { A: 0.8, E: 0.2 },
        });
      });

      expect(result.current.visemeWeights).toEqual({ A: 0.8, E: 0.2 });
    });

    it("should ignore non-viseme messages", async () => {
      const { result } = renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      act(() => {
        mockWebSocketInstances[0].simulateOpen();
        mockWebSocketInstances[0].simulateMessage({
          type: "pong",
          timestamp: 12345,
        });
      });

      // Should still have default weights
      expect(result.current.visemeWeights).toEqual({ sil: 1 });
    });

    it("should ignore viseme messages without weights", async () => {
      const { result } = renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      act(() => {
        mockWebSocketInstances[0].simulateOpen();
        mockWebSocketInstances[0].simulateMessage({
          type: "viseme",
          // Missing weights property
        });
      });

      expect(result.current.visemeWeights).toEqual({ sil: 1 });
    });

    it("should handle invalid JSON gracefully", async () => {
      const { result } = renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      act(() => {
        mockWebSocketInstances[0].simulateOpen();
        // Send invalid JSON
        mockWebSocketInstances[0].onmessage?.({ data: "not valid json {" });
      });

      // Should still have default weights
      expect(result.current.visemeWeights).toEqual({ sil: 1 });
    });
  });

  // ============================================================================
  // Send Methods Tests
  // ============================================================================

  describe("sendAudio", () => {
    it("should send audio as base64 when connected", async () => {
      const { result } = renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      act(() => {
        mockWebSocketInstances[0].simulateOpen();
      });

      // Create test ArrayBuffer
      const testData = new Uint8Array([1, 2, 3, 4]);

      act(() => {
        result.current.sendAudio(testData.buffer);
      });

      expect(mockWebSocketInstances[0].sentMessages.length).toBe(1);
      const sent = JSON.parse(mockWebSocketInstances[0].sentMessages[0]);
      expect(sent.type).toBe("audio");
      expect(typeof sent.data).toBe("string");
    });

    it("should not send when not connected", async () => {
      const { result } = renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      const testData = new Uint8Array([1, 2, 3, 4]);

      act(() => {
        result.current.sendAudio(testData.buffer);
      });

      expect(mockWebSocketInstances[0].sentMessages.length).toBe(0);
    });
  });

  describe("sendAudioBase64", () => {
    it("should send audio_wav type when connected", async () => {
      const { result } = renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      act(() => {
        mockWebSocketInstances[0].simulateOpen();
      });

      act(() => {
        result.current.sendAudioBase64("SGVsbG8gV29ybGQ=");
      });

      expect(mockWebSocketInstances[0].sentMessages.length).toBe(1);
      const sent = JSON.parse(mockWebSocketInstances[0].sentMessages[0]);
      expect(sent.type).toBe("audio_wav");
      expect(sent.data).toBe("SGVsbG8gV29ybGQ=");
    });

    it("should not send when not connected", async () => {
      const { result } = renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      act(() => {
        result.current.sendAudioBase64("SGVsbG8gV29ybGQ=");
      });

      expect(mockWebSocketInstances[0].sentMessages.length).toBe(0);
    });
  });

  // ============================================================================
  // Ping Interval Tests
  // ============================================================================

  describe("ping interval", () => {
    it("should send ping every 10 seconds when connected", async () => {
      renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      act(() => {
        mockWebSocketInstances[0].simulateOpen();
      });

      expect(mockWebSocketInstances[0].sentMessages.length).toBe(0);

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(mockWebSocketInstances[0].sentMessages.length).toBe(1);
      expect(JSON.parse(mockWebSocketInstances[0].sentMessages[0])).toEqual({
        type: "ping",
      });

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(mockWebSocketInstances[0].sentMessages.length).toBe(2);
    });

    it("should stop ping interval when closed", async () => {
      renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      act(() => {
        mockWebSocketInstances[0].simulateOpen();
      });

      act(() => {
        mockWebSocketInstances[0].close();
      });

      act(() => {
        jest.advanceTimersByTime(20000);
      });

      // Should not have sent any pings after close
      expect(mockWebSocketInstances[0].sentMessages.length).toBe(0);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe("edge cases", () => {
    it("should handle connection failure and retry", async () => {
      // Make WebSocket constructor throw
      (global as unknown as { WebSocket: unknown }).WebSocket = jest
        .fn()
        .mockImplementationOnce(() => {
          throw new Error("Connection failed");
        })
        .mockImplementation((url: string) => {
          const ws = new MockWebSocket(url);
          mockWebSocketInstances.push(ws);
          return ws;
        });

      renderHook(() =>
        useVisemeWebSocket({
          backendUrl: "http://localhost:8000",
          enabled: true,
        })
      );

      // Should have attempted connection
      expect(mockWebSocketInstances.length).toBe(0);

      // Advance timers for retry
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Should have retried
      expect(mockWebSocketInstances.length).toBe(1);
    });

    it("should handle enabled prop change", async () => {
      const { rerender } = renderHook(
        ({ enabled }) =>
          useVisemeWebSocket({
            backendUrl: "http://localhost:8000",
            enabled,
          }),
        { initialProps: { enabled: false } }
      );

      expect(mockWebSocketInstances.length).toBe(0);

      rerender({ enabled: true });

      expect(mockWebSocketInstances.length).toBe(1);
    });

    it("should handle backendUrl change", async () => {
      const { rerender } = renderHook(
        ({ url }) =>
          useVisemeWebSocket({
            backendUrl: url,
            enabled: true,
          }),
        { initialProps: { url: "http://localhost:8000" } }
      );

      expect(mockWebSocketInstances.length).toBe(1);
      expect(mockWebSocketInstances[0].url).toBe("ws://localhost:8000/ws/viseme");

      // Rerender will trigger cleanup + new connection
      rerender({ url: "http://localhost:9000" });

      expect(mockWebSocketInstances.length).toBe(2);
      expect(mockWebSocketInstances[1].url).toBe("ws://localhost:9000/ws/viseme");
    });
  });
});
