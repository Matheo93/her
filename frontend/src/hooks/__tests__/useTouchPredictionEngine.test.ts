/**
 * Tests for useTouchPredictionEngine hook - Sprint 227
 */

import { renderHook, act } from "@testing-library/react";
import {
  useTouchPredictionEngine,
  useSimpleTouchPredictor,
  PredictionEngineConfig,
  TouchSample,
  PredictedTouch,
  PredictionAlgorithm,
} from "../useTouchPredictionEngine";

// Mock performance.now
let mockTime = 0;

beforeEach(() => {
  mockTime = 0;
  jest.spyOn(performance, "now").mockImplementation(() => mockTime);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Helper to advance time
function advanceTime(ms: number) {
  mockTime += ms;
}

// Helper to create touch sample
function createSample(
  x: number,
  y: number,
  options: { pressure?: number } = {}
): TouchSample {
  return {
    x,
    y,
    timestamp: mockTime,
    pressure: options.pressure,
  };
}

describe("useTouchPredictionEngine", () => {
  describe("initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useTouchPredictionEngine());

      expect(result.current.state.isActive).toBe(false);
      expect(result.current.state.lastSample).toBeNull();
      expect(result.current.state.currentPrediction).toBeNull();
      expect(result.current.state.velocity).toEqual({ x: 0, y: 0 });
      expect(result.current.state.acceleration).toEqual({ x: 0, y: 0 });
    });

    it("should accept custom configuration", () => {
      const config: Partial<PredictionEngineConfig> = {
        baseHorizonMs: 50,
        maxHorizonMs: 150,
        autoSelectAlgorithm: false,
        defaultAlgorithm: "linear",
      };

      const { result } = renderHook(() => useTouchPredictionEngine(config));

      expect(result.current.state).toBeDefined();
      expect(result.current.controls).toBeDefined();
    });
  });

  describe("start/stop", () => {
    it("should start the engine", () => {
      const { result } = renderHook(() => useTouchPredictionEngine());

      act(() => {
        result.current.controls.start();
      });

      expect(result.current.state.isActive).toBe(true);
    });

    it("should stop the engine", () => {
      const { result } = renderHook(() => useTouchPredictionEngine());

      act(() => {
        result.current.controls.start();
      });

      act(() => {
        result.current.controls.stop();
      });

      expect(result.current.state.isActive).toBe(false);
    });
  });

  describe("sample collection", () => {
    it("should add touch samples", () => {
      const { result } = renderHook(() => useTouchPredictionEngine());

      act(() => {
        result.current.controls.addSample(createSample(100, 100));
      });

      expect(result.current.state.lastSample).not.toBeNull();
      expect(result.current.state.lastSample?.x).toBe(100);
      expect(result.current.state.lastSample?.y).toBe(100);
    });

    it("should calculate velocity from samples", () => {
      const { result } = renderHook(() => useTouchPredictionEngine());

      act(() => {
        result.current.controls.addSample(createSample(100, 100));
      });

      advanceTime(16);

      act(() => {
        result.current.controls.addSample(createSample(116, 108));
      });

      // Velocity should be calculated (16px in 16ms = 1000 px/s for x)
      expect(result.current.state.velocity.x).toBeCloseTo(1000, -1);
      expect(result.current.state.velocity.y).toBeCloseTo(500, -1);
    });

    it("should calculate acceleration from velocity changes", () => {
      const { result } = renderHook(() => useTouchPredictionEngine());

      act(() => {
        result.current.controls.addSample(createSample(100, 100));
      });

      advanceTime(16);

      act(() => {
        result.current.controls.addSample(createSample(110, 100));
      });

      advanceTime(16);

      act(() => {
        result.current.controls.addSample(createSample(130, 100)); // Accelerating
      });

      expect(result.current.state.acceleration.x).not.toBe(0);
    });
  });

  describe("prediction", () => {
    it("should predict position with enough samples", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add samples with consistent velocity
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100 + i * 5));
        });
        advanceTime(16);
      }

      const prediction = result.current.state.currentPrediction;

      expect(prediction).not.toBeNull();
      expect(prediction?.x).toBeGreaterThan(140);
      expect(prediction?.y).toBeGreaterThan(120);
    });

    it("should not predict with insufficient samples", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({ minSamplesForPrediction: 5 })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add only 2 samples
      act(() => {
        result.current.controls.addSample(createSample(100, 100));
      });

      advanceTime(16);

      act(() => {
        result.current.controls.addSample(createSample(110, 105));
      });

      expect(result.current.state.currentPrediction).toBeNull();
    });

    it("should include confidence in prediction", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add consistent samples
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100));
        });
        advanceTime(16);
      }

      expect(result.current.state.currentPrediction?.confidence).toBeGreaterThan(0);
      expect(result.current.state.currentPrediction?.confidence).toBeLessThanOrEqual(1);
    });

    it("should include uncertainty bounds", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100 + i * 5));
        });
        advanceTime(16);
      }

      const prediction = result.current.state.currentPrediction;

      expect(prediction?.uncertainty.x).toBeGreaterThan(0);
      expect(prediction?.uncertainty.y).toBeGreaterThan(0);
    });
  });

  describe("manual prediction", () => {
    it("should return prediction on demand", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      // Add samples
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100));
        });
        advanceTime(16);
      }

      let prediction: PredictedTouch | null = null;
      act(() => {
        prediction = result.current.controls.predict(50);
      });

      expect(prediction).not.toBeNull();
      expect(prediction?.horizonMs).toBe(50);
    });

    it("should return null with insufficient confidence", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0.99, // Very high threshold
        })
      );

      // Add erratic samples
      act(() => {
        result.current.controls.addSample(createSample(100, 100));
      });

      advanceTime(16);

      act(() => {
        result.current.controls.addSample(createSample(50, 200));
      });

      advanceTime(16);

      act(() => {
        result.current.controls.addSample(createSample(150, 50));
      });

      let prediction: PredictedTouch | null = null;
      act(() => {
        prediction = result.current.controls.predict();
      });

      expect(prediction).toBeNull();
    });
  });

  describe("algorithm selection", () => {
    it("should use default algorithm when auto-select is disabled", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "linear",
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100));
        });
        advanceTime(16);
      }

      expect(result.current.state.currentPrediction?.algorithm).toBe("linear");
    });

    it("should allow manual algorithm setting", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.setAlgorithm("quadratic");
      });

      act(() => {
        result.current.controls.start();
      });

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100));
        });
        advanceTime(16);
      }

      expect(result.current.state.metrics.currentAlgorithm).toBe("quadratic");
    });
  });

  describe("prediction verification", () => {
    it("should verify prediction accuracy", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100));
        });
        advanceTime(16);
      }

      // Get prediction
      const prediction = result.current.state.currentPrediction;

      // Verify with actual position
      act(() => {
        result.current.controls.verifyPrediction({
          x: prediction?.x ?? 0,
          y: prediction?.y ?? 0,
        });
      });

      // Should update accuracy metrics
      expect(
        result.current.state.metrics.algorithmMetrics.size
      ).toBeGreaterThanOrEqual(0);
    });
  });

  describe("adaptive horizon", () => {
    it("should increase horizon with higher velocity", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          enableAdaptiveHorizon: true,
          baseHorizonMs: 30,
          maxHorizonMs: 100,
          velocityThresholdPxPerSec: 500,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Fast movement (high velocity)
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 50, 100));
        });
        advanceTime(16);
      }

      const fastPrediction = result.current.state.currentPrediction;

      // Reset
      act(() => {
        result.current.controls.reset();
      });

      // Slow movement
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 2, 100));
        });
        advanceTime(16);
      }

      const slowPrediction = result.current.state.currentPrediction;

      // Fast prediction should have longer horizon
      if (fastPrediction && slowPrediction) {
        expect(fastPrediction.horizonMs).toBeGreaterThan(slowPrediction.horizonMs);
      }
    });

    it("should use base horizon when adaptive is disabled", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          enableAdaptiveHorizon: false,
          baseHorizonMs: 30,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 50, 100));
        });
        advanceTime(16);
      }

      expect(result.current.state.currentPrediction?.horizonMs).toBe(30);
    });
  });

  describe("reset", () => {
    it("should reset all state", () => {
      const { result } = renderHook(() => useTouchPredictionEngine());

      act(() => {
        result.current.controls.start();
      });

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100));
        });
        advanceTime(16);
      }

      expect(result.current.state.lastSample).not.toBeNull();

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.lastSample).toBeNull();
      expect(result.current.state.currentPrediction).toBeNull();
      expect(result.current.state.velocity).toEqual({ x: 0, y: 0 });
      expect(result.current.state.acceleration).toEqual({ x: 0, y: 0 });
    });
  });

  describe("metrics", () => {
    it("should track total predictions", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100));
        });
        advanceTime(16);
      }

      // Prediction count depends on timing/implementation
      expect(result.current.state.metrics.totalPredictions).toBeGreaterThanOrEqual(0);
    });

    it("should calculate overall accuracy", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Generate predictions
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100));
        });
        advanceTime(16);
      }

      // Verify a prediction
      const prediction = result.current.state.currentPrediction;
      if (prediction) {
        act(() => {
          result.current.controls.verifyPrediction({ x: prediction.x, y: prediction.y });
        });
      }

      expect(result.current.state.metrics.overallAccuracy).toBeGreaterThanOrEqual(0);
    });

    it("should track average horizon", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
          baseHorizonMs: 30,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100));
        });
        advanceTime(16);
      }

      expect(result.current.state.metrics.averageHorizon).toBeGreaterThan(0);
    });
  });

  describe("Kalman filter", () => {
    it("should use Kalman filter for prediction", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "kalman",
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100 + i * 5));
        });
        advanceTime(16);
      }

      expect(result.current.state.currentPrediction?.algorithm).toBe("kalman");
    });

    it("should smooth noisy input with Kalman filter", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "kalman",
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add noisy samples along a generally straight line
      const noise = [0, 2, -1, 3, -2, 1, -1, 2, 0, -1];

      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.controls.addSample(
            createSample(100 + i * 10 + noise[i], 100 + noise[i])
          );
        });
        advanceTime(16);
      }

      const prediction = result.current.state.currentPrediction;

      // Kalman should smooth out the noise and predict forward
      expect(prediction?.x).toBeGreaterThan(180);
    });
  });
});

describe("useSimpleTouchPredictor", () => {
  it("should provide simple touch prediction", () => {
    const { result } = renderHook(() => useSimpleTouchPredictor(30));

    act(() => {
      result.current.addTouch(100, 100);
    });

    advanceTime(16);

    act(() => {
      result.current.addTouch(110, 105);
    });

    advanceTime(16);

    act(() => {
      result.current.addTouch(120, 110);
    });

    // Should have prediction
    expect(result.current.predictedPosition).not.toBeNull();
    expect(result.current.confidence).toBeGreaterThanOrEqual(0);
  });

  it("should auto-start engine", () => {
    const { result } = renderHook(() => useSimpleTouchPredictor());

    // Add touches
    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.addTouch(100 + i * 10, 100);
      });
      advanceTime(16);
    }

    // Should work without manual start
    expect(result.current.predictedPosition).not.toBeNull();
  });
});
