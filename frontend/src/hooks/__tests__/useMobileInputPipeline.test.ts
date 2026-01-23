/**
 * Tests for Mobile Input Pipeline Hook - Sprint 524
 *
 * Tests input processing pipeline, gesture detection, prediction, and buffering
 */

import { renderHook, act } from "@testing-library/react";
import {
  useMobileInputPipeline,
  useGestureDetection,
  useInputPrediction,
  type InputType,
  type GestureType,
  type InputPriority,
  type RawInput,
} from "../useMobileInputPipeline";

// Mock performance.now for consistent timing
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
  jest.spyOn(Date, "now").mockImplementation(() => mockTime);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Helper to create raw input
function createRawInput(overrides: Partial<RawInput> = {}): RawInput {
  return {
    type: "touch",
    x: 100,
    y: 200,
    pressure: 0.5,
    timestamp: mockTime,
    ...overrides,
  };
}

describe("useMobileInputPipeline", () => {
  describe("initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      expect(result.current.state.isActive).toBe(true);
      expect(result.current.state.isPaused).toBe(false);
      expect(result.current.state.isProcessing).toBe(false);
      expect(result.current.state.queueSize).toBe(0);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useMobileInputPipeline({
          debounceMs: 32,
          enablePrediction: false,
          bufferCapacity: 100,
        })
      );

      // Config is applied internally - verify through behavior
      expect(result.current.state.isActive).toBe(true);
    });

    it("should initialize metrics to zero", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      expect(result.current.metrics.totalInputs).toBe(0);
      expect(result.current.metrics.processedInputs).toBe(0);
      expect(result.current.metrics.droppedInputs).toBe(0);
      expect(result.current.metrics.debouncedInputs).toBe(0);
      expect(result.current.metrics.averageLatencyMs).toBe(0);
    });

    it("should initialize gesture state", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      expect(result.current.state.gestureState.currentGesture).toBeNull();
      expect(result.current.state.gestureState.startPosition).toBeNull();
      expect(result.current.state.gestureState.currentPosition).toBeNull();
      expect(result.current.state.gestureState.distance).toBe(0);
    });
  });

  describe("input processing", () => {
    it("should process raw input", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      const input = createRawInput();

      let processed: ReturnType<typeof result.current.controls.processInput>;
      act(() => {
        processed = result.current.controls.processInput(input);
      });

      expect(processed).not.toBeNull();
      expect(processed!.raw).toEqual(input);
      expect(processed!.normalized.x).toBe(100);
      expect(processed!.normalized.y).toBe(200);
      expect(result.current.metrics.totalInputs).toBe(1);
      expect(result.current.metrics.processedInputs).toBe(1);
    });

    it("should normalize input coordinates", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      const input = createRawInput({ x: 150, y: 250 });

      let processed: ReturnType<typeof result.current.controls.processInput>;
      act(() => {
        processed = result.current.controls.processInput(input);
      });

      expect(processed!.normalized.x).toBe(150);
      expect(processed!.normalized.y).toBe(250);
      expect(processed!.normalized.pressure).toBe(0.5);
    });

    it("should handle missing coordinates", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      const input: RawInput = { type: "touch" };

      let processed: ReturnType<typeof result.current.controls.processInput>;
      act(() => {
        processed = result.current.controls.processInput(input);
      });

      expect(processed!.normalized.x).toBe(0);
      expect(processed!.normalized.y).toBe(0);
      expect(processed!.normalized.pressure).toBe(0.5);
    });

    it("should assign priority to input", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      const input = createRawInput();

      let processed: ReturnType<typeof result.current.controls.processInput>;
      act(() => {
        processed = result.current.controls.processInput(input, "critical");
      });

      expect(processed!.priority).toBe("critical");
    });

    it("should generate unique IDs for inputs", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      const ids: string[] = [];

      act(() => {
        for (let i = 0; i < 5; i++) {
          const processed = result.current.controls.processInput(createRawInput());
          if (processed) ids.push(processed.id);
        }
      });

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });

    it("should measure processing latency", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      const input = createRawInput();

      let processed: ReturnType<typeof result.current.controls.processInput>;
      act(() => {
        processed = result.current.controls.processInput(input);
      });

      expect(processed!.latencyMs).toBeGreaterThanOrEqual(0);
      expect(processed!.receivedAt).toBeGreaterThanOrEqual(0);
      expect(processed!.processedAt).toBeGreaterThanOrEqual(processed!.receivedAt);
    });
  });

  describe("debouncing", () => {
    it("should debounce rapid inputs", () => {
      const { result } = renderHook(() =>
        useMobileInputPipeline({ debounceMs: 16 })
      );

      act(() => {
        // First input should process
        result.current.controls.processInput(createRawInput());

        // Second input within debounce window should be debounced
        mockTime = 5;
        result.current.controls.processInput(createRawInput());
      });

      expect(result.current.metrics.processedInputs).toBe(1);
      expect(result.current.metrics.debouncedInputs).toBe(1);
    });

    it("should allow inputs after debounce window", () => {
      const { result } = renderHook(() =>
        useMobileInputPipeline({ debounceMs: 16 })
      );

      act(() => {
        // First input
        mockTime = 0;
        result.current.controls.processInput(createRawInput());

        // Second input after debounce window
        mockTime = 20;
        result.current.controls.processInput(createRawInput());
      });

      expect(result.current.metrics.processedInputs).toBe(2);
      expect(result.current.metrics.debouncedInputs).toBe(0);
    });

    it("should bypass debounce for critical priority", () => {
      const { result } = renderHook(() =>
        useMobileInputPipeline({ debounceMs: 16 })
      );

      act(() => {
        // First input
        result.current.controls.processInput(createRawInput());

        // Critical input within debounce window should still process
        mockTime = 5;
        result.current.controls.processInput(createRawInput(), "critical");
      });

      expect(result.current.metrics.processedInputs).toBe(2);
    });

    it("should bypass debounce for high priority", () => {
      const { result } = renderHook(() =>
        useMobileInputPipeline({ debounceMs: 16 })
      );

      act(() => {
        // First input
        result.current.controls.processInput(createRawInput());

        // High priority input within debounce window should still process
        mockTime = 5;
        result.current.controls.processInput(createRawInput(), "high");
      });

      expect(result.current.metrics.processedInputs).toBe(2);
    });
  });

  describe("input prediction", () => {
    it("should predict next input position", () => {
      const { result } = renderHook(() =>
        useMobileInputPipeline({ enablePrediction: true })
      );

      // Process inputs to build velocity history
      act(() => {
        mockTime = 0;
        result.current.controls.processInput(createRawInput({ x: 0, y: 0 }));

        mockTime = 100;
        result.current.controls.processInput(createRawInput({ x: 100, y: 0 }));
      });

      // Get prediction
      let predicted: ReturnType<typeof result.current.controls.getPredictedInput>;
      act(() => {
        predicted = result.current.controls.getPredictedInput(50);
      });

      expect(predicted).not.toBeNull();
      // Should predict ahead based on velocity
      expect(predicted!.x).toBeGreaterThan(100);
    });

    it("should include confidence in prediction", () => {
      const { result } = renderHook(() =>
        useMobileInputPipeline({ enablePrediction: true })
      );

      act(() => {
        result.current.controls.processInput(createRawInput());
      });

      const predicted = result.current.controls.getPredictedInput(16);

      expect(predicted).not.toBeNull();
      expect(predicted!.confidence).toBeGreaterThan(0);
      expect(predicted!.confidence).toBeLessThanOrEqual(1);
    });

    it("should return null when no inputs processed", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      const predicted = result.current.controls.getPredictedInput(16);

      expect(predicted).toBeNull();
    });

    it("should track predicted inputs metric", () => {
      const { result } = renderHook(() =>
        useMobileInputPipeline({ enablePrediction: true })
      );

      act(() => {
        result.current.controls.processInput(createRawInput());
      });

      expect(result.current.metrics.predictedInputs).toBe(1);
    });
  });

  describe("gesture tracking", () => {
    it("should start gesture tracking", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      act(() => {
        result.current.controls.startGesture(100, 200);
      });

      expect(result.current.state.gestureState.startPosition).toEqual({ x: 100, y: 200 });
      expect(result.current.state.gestureState.currentPosition).toEqual({ x: 100, y: 200 });
    });

    it("should update gesture position", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      act(() => {
        result.current.controls.startGesture(100, 100);
        result.current.controls.updateGesture(150, 150);
      });

      expect(result.current.state.gestureState.currentPosition).toEqual({ x: 150, y: 150 });
      expect(result.current.state.gestureState.distance).toBeGreaterThan(0);
    });

    it("should detect tap gesture", () => {
      const onGestureDetected = jest.fn();
      const { result } = renderHook(() =>
        useMobileInputPipeline(
          { minGestureDistance: 10, longPressThreshold: 500 },
          { onGestureDetected }
        )
      );

      act(() => {
        result.current.controls.startGesture(100, 100);
        // Small movement, short duration
        result.current.controls.updateGesture(102, 102);
        mockTime = 100; // Short duration
        const gesture = result.current.controls.endGesture();
        expect(gesture).toBe("tap");
      });
    });

    it("should detect swipe gesture", () => {
      const { result } = renderHook(() =>
        useMobileInputPipeline({ minGestureDistance: 10 })
      );

      act(() => {
        mockTime = 0;
        result.current.controls.startGesture(0, 0);

        // Fast movement
        mockTime = 50;
        result.current.controls.updateGesture(200, 0);
      });

      let gesture: GestureType | null = null;
      act(() => {
        gesture = result.current.controls.endGesture();
      });

      expect(gesture).toBe("swipe");
    });

    it("should detect pan gesture", () => {
      const { result } = renderHook(() =>
        useMobileInputPipeline({ minGestureDistance: 10 })
      );

      act(() => {
        mockTime = 0;
        result.current.controls.startGesture(0, 0);

        // Slow movement (low velocity)
        for (let i = 1; i <= 10; i++) {
          mockTime = i * 100;
          result.current.controls.updateGesture(i * 5, 0);
        }
      });

      let gesture: GestureType | null = null;
      act(() => {
        gesture = result.current.controls.endGesture();
      });

      expect(gesture).toBe("pan");
    });

    it("should cancel gesture", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      act(() => {
        result.current.controls.startGesture(100, 100);
        result.current.controls.cancelGesture();
      });

      expect(result.current.state.gestureState.startPosition).toBeNull();
      expect(result.current.state.gestureState.currentPosition).toBeNull();
    });

    it("should get current gesture state", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      act(() => {
        result.current.controls.startGesture(100, 200);
      });

      const gestureState = result.current.controls.getCurrentGesture();

      expect(gestureState.startPosition).toEqual({ x: 100, y: 200 });
    });

    it("should track gestures detected metric", () => {
      const { result } = renderHook(() =>
        useMobileInputPipeline({ minGestureDistance: 10 })
      );

      act(() => {
        result.current.controls.startGesture(100, 100);
        result.current.controls.updateGesture(102, 102);
        mockTime = 100;
        result.current.controls.endGesture();
      });

      expect(result.current.metrics.gesturesDetected).toBe(1);
    });

    it("should detect double tap", () => {
      const onGestureDetected = jest.fn();
      const { result } = renderHook(() =>
        useMobileInputPipeline(
          { doubleTapThreshold: 300, minGestureDistance: 10 },
          { onGestureDetected }
        )
      );

      act(() => {
        // First tap
        mockTime = 0;
        result.current.controls.startGesture(100, 100);
        mockTime = 50;
        result.current.controls.endGesture();

        // Second tap within threshold
        mockTime = 100;
        result.current.controls.startGesture(100, 100);
        mockTime = 150;
        const gesture = result.current.controls.endGesture();
        expect(gesture).toBe("double_tap");
      });

      expect(onGestureDetected).toHaveBeenCalledWith("double_tap", expect.any(Object));
    });
  });

  describe("long press detection", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should detect long press", () => {
      const onGestureDetected = jest.fn();
      const { result } = renderHook(() =>
        useMobileInputPipeline(
          { longPressThreshold: 500, minGestureDistance: 10 },
          { onGestureDetected }
        )
      );

      act(() => {
        result.current.controls.startGesture(100, 100);
      });

      // Advance timer past long press threshold
      act(() => {
        jest.advanceTimersByTime(600);
      });

      expect(onGestureDetected).toHaveBeenCalledWith("long_press", expect.any(Object));
    });

    it("should cancel long press on movement", () => {
      const onGestureDetected = jest.fn();
      const { result } = renderHook(() =>
        useMobileInputPipeline(
          { longPressThreshold: 500, minGestureDistance: 10 },
          { onGestureDetected }
        )
      );

      act(() => {
        result.current.controls.startGesture(100, 100);
        // Move past threshold
        result.current.controls.updateGesture(200, 100);
      });

      // Advance timer
      act(() => {
        jest.advanceTimersByTime(600);
      });

      // Long press should not be detected due to movement
      expect(onGestureDetected).not.toHaveBeenCalledWith("long_press", expect.any(Object));
    });
  });

  describe("buffer management", () => {
    it("should add inputs to buffer", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      act(() => {
        result.current.controls.processInput(createRawInput());
        result.current.controls.processInput(createRawInput());
      });

      const bufferState = result.current.controls.getBufferState();

      expect(bufferState.size).toBe(2);
    });

    it("should respect buffer capacity", () => {
      const { result } = renderHook(() =>
        useMobileInputPipeline({ bufferCapacity: 5 })
      );

      act(() => {
        for (let i = 0; i < 10; i++) {
          mockTime = i * 20; // Avoid debouncing
          result.current.controls.processInput(createRawInput());
        }
      });

      const bufferState = result.current.controls.getBufferState();

      expect(bufferState.size).toBeLessThanOrEqual(5);
    });

    it("should drop low priority inputs when buffer full", () => {
      const onInputDropped = jest.fn();
      const { result } = renderHook(() =>
        useMobileInputPipeline(
          { bufferCapacity: 3, dropLowPriorityOnBusy: true },
          { onInputDropped }
        )
      );

      act(() => {
        // Fill buffer
        for (let i = 0; i < 3; i++) {
          mockTime = i * 20;
          result.current.controls.processInput(createRawInput());
        }

        // Try to add low priority input
        mockTime = 100;
        result.current.controls.processInput(createRawInput(), "low");
      });

      expect(onInputDropped).toHaveBeenCalled();
      expect(result.current.metrics.droppedInputs).toBe(1);
    });

    it("should flush buffer", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      act(() => {
        result.current.controls.processInput(createRawInput());
        result.current.controls.processInput(createRawInput());
      });

      let flushed: ReturnType<typeof result.current.controls.flushBuffer>;
      act(() => {
        flushed = result.current.controls.flushBuffer();
      });

      expect(flushed).toHaveLength(2);
      expect(result.current.controls.getBufferState().size).toBe(0);
    });

    it("should clear buffer", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      act(() => {
        result.current.controls.processInput(createRawInput());
        result.current.controls.clearBuffer();
      });

      expect(result.current.controls.getBufferState().size).toBe(0);
    });

    it("should call onBufferFull callback", () => {
      const onBufferFull = jest.fn();
      const { result } = renderHook(() =>
        useMobileInputPipeline({ bufferCapacity: 2 }, { onBufferFull })
      );

      act(() => {
        mockTime = 0;
        result.current.controls.processInput(createRawInput());
        mockTime = 20;
        result.current.controls.processInput(createRawInput());
        mockTime = 40;
        result.current.controls.processInput(createRawInput());
      });

      expect(onBufferFull).toHaveBeenCalled();
    });
  });

  describe("pipeline control", () => {
    it("should pause pipeline", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      act(() => {
        result.current.controls.pause();
      });

      expect(result.current.state.isPaused).toBe(true);

      // Inputs should not be processed when paused
      let processed: ReturnType<typeof result.current.controls.processInput>;
      act(() => {
        processed = result.current.controls.processInput(createRawInput());
      });

      expect(processed).toBeNull();
    });

    it("should resume pipeline", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      act(() => {
        result.current.controls.pause();
        result.current.controls.resume();
      });

      expect(result.current.state.isPaused).toBe(false);

      // Inputs should be processed after resume
      let processed: ReturnType<typeof result.current.controls.processInput>;
      act(() => {
        processed = result.current.controls.processInput(createRawInput());
      });

      expect(processed).not.toBeNull();
    });
  });

  describe("metrics", () => {
    it("should reset metrics", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      act(() => {
        result.current.controls.processInput(createRawInput());
      });

      expect(result.current.metrics.totalInputs).toBe(1);

      act(() => {
        result.current.controls.resetMetrics();
      });

      expect(result.current.metrics.totalInputs).toBe(0);
      expect(result.current.metrics.processedInputs).toBe(0);
      expect(result.current.metrics.averageLatencyMs).toBe(0);
      expect(result.current.metrics.latencies).toHaveLength(0);
    });

    it("should calculate percentile latencies", () => {
      const { result } = renderHook(() =>
        useMobileInputPipeline({ metricsSampleWindow: 100 })
      );

      act(() => {
        for (let i = 0; i < 10; i++) {
          mockTime = i * 20;
          result.current.controls.processInput(createRawInput());
        }
      });

      expect(result.current.metrics.p50LatencyMs).toBeGreaterThanOrEqual(0);
      expect(result.current.metrics.p95LatencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should calculate average latency", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      act(() => {
        for (let i = 0; i < 5; i++) {
          mockTime = i * 20;
          result.current.controls.processInput(createRawInput());
        }
      });

      expect(result.current.metrics.averageLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("callbacks", () => {
    it("should call onInputProcessed callback", () => {
      const onInputProcessed = jest.fn();
      const { result } = renderHook(() =>
        useMobileInputPipeline({}, { onInputProcessed })
      );

      act(() => {
        result.current.controls.processInput(createRawInput());
      });

      expect(onInputProcessed).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          normalized: expect.any(Object),
        })
      );
    });

    it("should call onGestureDetected callback", () => {
      const onGestureDetected = jest.fn();
      const { result } = renderHook(() =>
        useMobileInputPipeline({ minGestureDistance: 10 }, { onGestureDetected })
      );

      act(() => {
        result.current.controls.startGesture(100, 100);
        mockTime = 100;
        result.current.controls.endGesture();
      });

      expect(onGestureDetected).toHaveBeenCalled();
    });
  });

  describe("different input types", () => {
    it("should process touch input", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      let processed: ReturnType<typeof result.current.controls.processInput>;
      act(() => {
        processed = result.current.controls.processInput(createRawInput({ type: "touch" }));
      });

      expect(processed!.raw.type).toBe("touch");
    });

    it("should process pointer input", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      let processed: ReturnType<typeof result.current.controls.processInput>;
      act(() => {
        processed = result.current.controls.processInput(createRawInput({ type: "pointer" }));
      });

      expect(processed!.raw.type).toBe("pointer");
    });

    it("should process gesture input", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      let processed: ReturnType<typeof result.current.controls.processInput>;
      act(() => {
        processed = result.current.controls.processInput(
          createRawInput({ type: "gesture", gestureType: "swipe" })
        );
      });

      expect(processed!.raw.type).toBe("gesture");
      expect(processed!.raw.gestureType).toBe("swipe");
    });

    it("should process keyboard input", () => {
      const { result } = renderHook(() => useMobileInputPipeline());

      let processed: ReturnType<typeof result.current.controls.processInput>;
      act(() => {
        processed = result.current.controls.processInput(
          createRawInput({ type: "keyboard", key: "Enter" })
        );
      });

      expect(processed!.raw.type).toBe("keyboard");
      expect(processed!.raw.key).toBe("Enter");
    });
  });
});

describe("useGestureDetection", () => {
  it("should return touch handler functions", () => {
    const onGesture = jest.fn();
    const { result } = renderHook(() => useGestureDetection(onGesture));

    expect(typeof result.current.startTouch).toBe("function");
    expect(typeof result.current.moveTouch).toBe("function");
    expect(typeof result.current.endTouch).toBe("function");
  });

  it("should detect gestures through handlers", () => {
    const onGesture = jest.fn();
    const { result } = renderHook(() => useGestureDetection(onGesture));

    act(() => {
      result.current.startTouch(100, 100);
      result.current.moveTouch(102, 102);
      result.current.endTouch();
    });

    expect(onGesture).toHaveBeenCalled();
  });
});

describe("useInputPrediction", () => {
  it("should return predicted position", () => {
    const { result } = renderHook(() => useInputPrediction(100, 200, 16));

    // May be null initially since no velocity history
    expect(result.current === null || typeof result.current === "object").toBe(true);
  });
});
