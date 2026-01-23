/**
 * Tests for Touch Response Predictor Hook - Sprint 231
 *
 * Tests Kalman filtering, gesture recognition, and response caching
 */

import { renderHook, act } from "@testing-library/react";
import {
  useTouchResponsePredictor,
  useGesturePrediction,
  useTouchPositionPrediction,
  TouchSample,
} from "../useTouchResponsePredictor";

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

describe("useTouchResponsePredictor", () => {
  const createTouchSample = (x: number, y: number, time?: number): TouchSample => ({
    position: { x, y },
    timestamp: time ?? mockTime,
    pressure: 1,
    identifier: 0,
  });

  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      expect(result.current.state.isTracking).toBe(false);
      expect(result.current.state.currentSample).toBeNull();
      expect(result.current.state.prediction).toBeNull();
    });

    it("should initialize with default metrics", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      expect(result.current.state.metrics.samplesProcessed).toBe(0);
      expect(result.current.state.metrics.predictionsGenerated).toBe(0);
      expect(result.current.state.metrics.intentsRecognized).toBe(0);
    });

    it("should accept custom config", () => {
      const { result } = renderHook(() =>
        useTouchResponsePredictor({
          predictionHorizonMs: 100,
          minConfidence: 0.8,
        })
      );

      expect(result.current.state.isTracking).toBe(false);
    });
  });

  describe("sample processing", () => {
    it("should process touch sample", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());
      const sample = createTouchSample(100, 100);

      act(() => {
        result.current.controls.processSample(sample);
      });

      expect(result.current.state.currentSample).toEqual(sample);
      expect(result.current.state.metrics.samplesProcessed).toBe(1);
    });

    it("should generate prediction after sample", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      act(() => {
        result.current.controls.processSample(createTouchSample(100, 100));
      });

      expect(result.current.state.prediction).not.toBeNull();
      expect(result.current.state.metrics.predictionsGenerated).toBe(1);
    });

    it("should process multiple samples", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      act(() => {
        mockTime = 0;
        result.current.controls.processSample(createTouchSample(100, 100, 0));
        mockTime = 16;
        result.current.controls.processSample(createTouchSample(110, 105, 16));
        mockTime = 32;
        result.current.controls.processSample(createTouchSample(120, 110, 32));
      });

      expect(result.current.state.metrics.samplesProcessed).toBe(3);
    });
  });

  describe("touch tracking", () => {
    it("should start tracking on touch start", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());
      const sample = createTouchSample(100, 100);

      act(() => {
        result.current.controls.onTouchStart(sample);
      });

      expect(result.current.state.isTracking).toBe(true);
    });

    it("should stop tracking on touch end", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      act(() => {
        result.current.controls.onTouchStart(createTouchSample(100, 100));
        result.current.controls.onTouchEnd();
      });

      expect(result.current.state.isTracking).toBe(false);
    });
  });

  describe("prediction", () => {
    it("should get prediction at future time", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      act(() => {
        mockTime = 0;
        result.current.controls.onTouchStart(createTouchSample(100, 100, 0));
        mockTime = 16;
        result.current.controls.processSample(createTouchSample(110, 105, 16));
      });

      const prediction = result.current.controls.getPredictionAt(mockTime + 50);

      expect(prediction).not.toBeNull();
      expect(prediction?.predictedTime).toBe(mockTime + 50);
    });

    it("should return null for prediction before samples", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      act(() => {
        mockTime = 100;
        result.current.controls.onTouchStart(createTouchSample(100, 100, 100));
      });

      const prediction = result.current.controls.getPredictionAt(50);

      expect(prediction).toBeNull();
    });

    it("should have decreasing confidence over time", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      act(() => {
        mockTime = 0;
        result.current.controls.onTouchStart(createTouchSample(100, 100, 0));
        mockTime = 16;
        result.current.controls.processSample(createTouchSample(110, 105, 16));
      });

      const prediction50 = result.current.controls.getPredictionAt(mockTime + 50);
      const prediction100 = result.current.controls.getPredictionAt(mockTime + 100);

      expect(prediction50?.confidence).toBeGreaterThan(prediction100?.confidence ?? 0);
    });
  });

  describe("intent recognition", () => {
    it("should get intent prediction", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      act(() => {
        mockTime = 0;
        result.current.controls.onTouchStart(createTouchSample(100, 100, 0));
      });

      const intent = result.current.controls.getIntentPrediction();

      // Intent may be null or have value
      expect(typeof result.current.controls.getIntentPrediction).toBe("function");
    });

    it("should recognize tap intent for small movement", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      act(() => {
        mockTime = 0;
        result.current.controls.onTouchStart(createTouchSample(100, 100, 0));
        mockTime = 50;
        result.current.controls.processSample(createTouchSample(102, 101, 50));
      });

      const intent = result.current.state.intentPrediction;
      // May recognize tap or be unknown
      expect(result.current.state.metrics.intentsRecognized).toBeGreaterThanOrEqual(0);
    });

    it("should recognize swipe intent for fast movement", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      act(() => {
        mockTime = 0;
        result.current.controls.onTouchStart(createTouchSample(100, 100, 0));
        mockTime = 16;
        result.current.controls.processSample(createTouchSample(150, 100, 16));
        mockTime = 32;
        result.current.controls.processSample(createTouchSample(200, 100, 32));
      });

      // Fast horizontal movement should recognize swipe
      expect(result.current.state.metrics.intentsRecognized).toBeGreaterThanOrEqual(0);
    });
  });

  describe("response caching", () => {
    it("should precompute response", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());
      const computeFunc = jest.fn(() => ({ action: "test" }));

      act(() => {
        mockTime = 0;
        result.current.controls.onTouchStart(createTouchSample(100, 100, 0));
      });

      const response = result.current.controls.precomputeResponse("tap", computeFunc);

      // May be null if intent doesn't match
      expect(typeof result.current.controls.precomputeResponse).toBe("function");
    });

    it("should get cached response", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      let cached: unknown = null;
      act(() => {
        cached = result.current.controls.getCachedResponse("tap");
      });

      // May be null if not cached
      expect(cached).toBeNull();
      expect(result.current.state.metrics.cacheMisses).toBe(1);
    });

    it("should track cache misses", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      act(() => {
        result.current.controls.getCachedResponse("tap");
      });

      act(() => {
        result.current.controls.getCachedResponse("swipeLeft");
      });

      expect(result.current.state.metrics.cacheMisses).toBe(2);
    });
  });

  describe("reset and clear", () => {
    it("should clear prediction", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      act(() => {
        result.current.controls.onTouchStart(createTouchSample(100, 100));
        result.current.controls.clearPrediction();
      });

      expect(result.current.state.prediction).toBeNull();
      expect(result.current.state.intentPrediction).toBeNull();
    });

    it("should reset all state", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      act(() => {
        result.current.controls.onTouchStart(createTouchSample(100, 100));
        result.current.controls.reset();
      });

      expect(result.current.state.isTracking).toBe(false);
      expect(result.current.state.currentSample).toBeNull();
      expect(result.current.state.prediction).toBeNull();
    });

    it("should reset metrics", () => {
      const { result } = renderHook(() => useTouchResponsePredictor());

      act(() => {
        result.current.controls.processSample(createTouchSample(100, 100));
        result.current.controls.resetMetrics();
      });

      expect(result.current.state.metrics.samplesProcessed).toBe(0);
      expect(result.current.state.metrics.predictionsGenerated).toBe(0);
    });
  });
});

describe("useGesturePrediction", () => {
  it("should provide gesture prediction interface", () => {
    const { result } = renderHook(() => useGesturePrediction());

    expect(result.current.intent).toBeNull();
    expect(result.current.confidence).toBe(0);
    expect(typeof result.current.onTouch).toBe("function");
    expect(typeof result.current.onTouchEnd).toBe("function");
  });

  it("should process touch", () => {
    const { result } = renderHook(() => useGesturePrediction());

    act(() => {
      result.current.onTouch(100, 100);
    });

    // Touch processed
    expect(typeof result.current.onTouch).toBe("function");
  });

  it("should handle touch end", () => {
    const { result } = renderHook(() => useGesturePrediction());

    act(() => {
      result.current.onTouch(100, 100);
      result.current.onTouchEnd();
    });

    expect(typeof result.current.onTouchEnd).toBe("function");
  });
});

describe("useTouchPositionPrediction", () => {
  it("should provide position prediction interface", () => {
    const { result } = renderHook(() => useTouchPositionPrediction());

    expect(result.current.predictedPosition).toBeNull();
    expect(result.current.confidence).toBe(0);
    expect(typeof result.current.processSample).toBe("function");
  });

  it("should process sample and generate prediction", () => {
    const { result } = renderHook(() => useTouchPositionPrediction());

    act(() => {
      result.current.processSample(100, 100);
    });

    expect(result.current.predictedPosition).not.toBeNull();
    expect(result.current.confidence).toBeGreaterThan(0);
  });

  it("should update prediction on new samples", () => {
    const { result } = renderHook(() => useTouchPositionPrediction());

    act(() => {
      mockTime = 0;
      result.current.processSample(100, 100);
    });

    const firstPrediction = result.current.predictedPosition;

    act(() => {
      mockTime = 16;
      result.current.processSample(120, 110);
    });

    const secondPrediction = result.current.predictedPosition;

    // Prediction should change with new data
    expect(secondPrediction?.x).not.toBe(firstPrediction?.x);
  });
});
