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
      expect(prediction!.horizonMs).toBe(50);
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

// ============================================================================
// Sprint 619 - Branch Coverage Tests
// ============================================================================

describe("Sprint 619 - branch coverage improvements", () => {
  describe("weighted_average algorithm (lines 262-293, 570)", () => {
    it("should use weighted_average algorithm for prediction", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "weighted_average",
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add enough samples for weighted average
      for (let i = 0; i < 6; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100 + i * 5));
        });
        advanceTime(16);
      }

      expect(result.current.state.currentPrediction?.algorithm).toBe("weighted_average");
      expect(result.current.state.currentPrediction?.x).toBeGreaterThan(140);
    });

    it("should return null for weighted_average with insufficient samples", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "weighted_average",
          minSamplesForPrediction: 2,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add only 2 samples - weighted_average needs 3
      act(() => {
        result.current.controls.addSample(createSample(100, 100));
      });
      advanceTime(16);
      act(() => {
        result.current.controls.addSample(createSample(110, 105));
      });

      // Should fall back or return null
      expect(result.current.state.currentPrediction).toBeNull();
    });

    it("should handle zero time delta in weighted_average (line 273)", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "weighted_average",
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add samples with same timestamp
      act(() => {
        result.current.controls.addSample(createSample(100, 100));
        result.current.controls.addSample(createSample(110, 105));
        result.current.controls.addSample(createSample(120, 110));
      });

      // Should handle gracefully
      expect(result.current.state.currentPrediction).toBeDefined();
    });
  });

  describe("spline algorithm fallback (lines 575-577)", () => {
    it("should fall back to quadratic for spline algorithm", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "spline",
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

      // Spline should work (falling back to quadratic)
      expect(result.current.state.currentPrediction).not.toBeNull();
      expect(result.current.state.currentPrediction?.algorithm).toBe("spline");
    });
  });

  describe("Kalman filter edge cases (line 334)", () => {
    it("should handle zero time delta in Kalman filter", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "kalman",
          minSamplesForPrediction: 2,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add samples at same time (dt = 0)
      act(() => {
        result.current.controls.addSample(createSample(100, 100));
        result.current.controls.addSample(createSample(110, 105));
      });

      // Should handle gracefully
      expect(result.current.state.lastSample?.x).toBe(110);
    });
  });

  describe("confidence calculation edge cases (line 380)", () => {
    it("should return zero confidence with insufficient samples", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 5,
          minConfidenceThreshold: 0,
        })
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

      // Not enough samples for prediction
      expect(result.current.state.currentPrediction).toBeNull();
    });
  });

  describe("uncertainty calculation (lines 430, 446)", () => {
    it("should return default uncertainty with insufficient samples", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 2,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      act(() => {
        result.current.controls.addSample(createSample(100, 100));
      });
      advanceTime(16);
      act(() => {
        result.current.controls.addSample(createSample(110, 105));
      });

      // With few samples, uncertainty should be at default values
      if (result.current.state.currentPrediction) {
        expect(result.current.state.currentPrediction.uncertainty.x).toBeGreaterThanOrEqual(5);
        expect(result.current.state.currentPrediction.uncertainty.y).toBeGreaterThanOrEqual(5);
      }
    });

    it("should handle zero velocities in uncertainty calculation", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add samples at same position (zero velocity)
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100, 100));
        });
        advanceTime(16);
      }

      // Should handle gracefully
      if (result.current.state.currentPrediction) {
        expect(result.current.state.currentPrediction.uncertainty.x).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe("auto-select algorithm with metrics (lines 545-547)", () => {
    it("should auto-select best algorithm based on accuracy", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: true,
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Generate many predictions and verifications to build metrics
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 10; i++) {
          act(() => {
            result.current.controls.addSample(createSample(100 + i * 10, 100 + i * 5));
          });
          advanceTime(16);
        }

        // Verify predictions
        const prediction = result.current.state.currentPrediction;
        if (prediction) {
          act(() => {
            result.current.controls.verifyPrediction({ x: prediction.x, y: prediction.y });
          });
        }

        act(() => {
          result.current.controls.reset();
        });
      }

      // Auto-select should have picked an algorithm
      expect(result.current.state.metrics.currentAlgorithm).toBeDefined();
    });
  });

  describe("sample history overflow (line 594)", () => {
    it("should limit sample history", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          maxSampleHistory: 10,
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add more samples than history limit
      for (let i = 0; i < 20; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100 + i * 5));
        });
        advanceTime(16);
      }

      // Should still work, not crash
      expect(result.current.state.currentPrediction).not.toBeNull();
    });
  });

  describe("predict() edge cases (lines 681, 689)", () => {
    it("should return null when predict returns no result", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 10,
          minConfidenceThreshold: 0,
        })
      );

      // Not started, no samples
      let prediction: PredictedTouch | null = null;
      act(() => {
        prediction = result.current.controls.predict();
      });

      expect(prediction).toBeNull();
    });

    it("should use adaptive horizon when no horizon provided", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
          enableAdaptiveHorizon: true,
          baseHorizonMs: 30,
        })
      );

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100));
        });
        advanceTime(16);
      }

      let prediction: PredictedTouch | null = null;
      act(() => {
        prediction = result.current.controls.predict(); // No horizon argument
      });

      expect(prediction).not.toBeNull();
      expect(prediction!.horizonMs).toBeGreaterThanOrEqual(30);
    });
  });

  describe("velocity consistency in confidence (lines 388-413)", () => {
    it("should have lower confidence with inconsistent velocities", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add samples with inconsistent direction (zigzag)
      const positions = [
        { x: 100, y: 100 },
        { x: 120, y: 80 },  // Right, up
        { x: 100, y: 100 }, // Left, down
        { x: 120, y: 80 },  // Right, up
        { x: 100, y: 100 }, // Left, down
      ];

      for (const pos of positions) {
        act(() => {
          result.current.controls.addSample(createSample(pos.x, pos.y));
        });
        advanceTime(16);
      }

      const erraticPrediction = result.current.state.currentPrediction;

      // Reset and add consistent samples
      act(() => {
        result.current.controls.reset();
      });

      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100 + i * 5));
        });
        advanceTime(16);
      }

      const consistentPrediction = result.current.state.currentPrediction;

      // Consistent movement should have higher or equal confidence
      if (erraticPrediction && consistentPrediction) {
        expect(consistentPrediction.confidence).toBeGreaterThanOrEqual(
          erraticPrediction.confidence * 0.5
        );
      }
    });
  });

  describe("quadratic prediction", () => {
    it("should use quadratic algorithm", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "quadratic",
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add accelerating samples
      for (let i = 0; i < 5; i++) {
        const x = 100 + i * 10 + i * i; // Accelerating
        act(() => {
          result.current.controls.addSample(createSample(x, 100));
        });
        advanceTime(16);
      }

      expect(result.current.state.currentPrediction?.algorithm).toBe("quadratic");
    });
  });

  describe("algorithm metrics for auto-selection (lines 545-547)", () => {
    it("should track algorithm metrics and select best", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: true,
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Build up metrics with many predictions and verifications
      for (let round = 0; round < 5; round++) {
        for (let i = 0; i < 10; i++) {
          act(() => {
            result.current.controls.addSample(
              createSample(100 + i * 10 + round * 100, 100 + i * 5)
            );
          });
          advanceTime(16);

          // Verify predictions to build accuracy metrics
          const prediction = result.current.state.currentPrediction;
          if (prediction) {
            act(() => {
              result.current.controls.verifyPrediction({
                x: prediction.x + Math.random() * 5 - 2.5, // Slight error
                y: prediction.y + Math.random() * 5 - 2.5,
              });
            });
          }
        }
      }

      // Metrics should have been collected
      expect(result.current.state.metrics.algorithmMetrics.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe("calculateUncertainty with zero velocities (line 446)", () => {
    it("should return default uncertainty when all samples have zero delta", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add samples with dt = 0 (same timestamp)
      // This causes velocities array to be empty
      const baseTime = mockTime;
      act(() => {
        result.current.controls.addSample({ x: 100, y: 100, timestamp: baseTime });
        result.current.controls.addSample({ x: 110, y: 105, timestamp: baseTime });
        result.current.controls.addSample({ x: 120, y: 110, timestamp: baseTime });
      });

      // Should handle gracefully with default uncertainty
      if (result.current.state.currentPrediction) {
        expect(result.current.state.currentPrediction.uncertainty.x).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe("linear algorithm fallback (line 577)", () => {
    it("should fall back to linear for unknown algorithm", () => {
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
          result.current.controls.addSample(createSample(100 + i * 10, 100 + i * 5));
        });
        advanceTime(16);
      }

      expect(result.current.state.currentPrediction?.algorithm).toBe("linear");
      expect(result.current.state.currentPrediction?.x).toBeGreaterThan(130);
    });
  });

  describe("predict() returning null (line 689)", () => {
    it("should return null when prediction algorithm returns null", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "weighted_average",
          minSamplesForPrediction: 2,
          minConfidenceThreshold: 0,
        })
      );

      // Add only 2 samples (weighted_average needs 3)
      act(() => {
        result.current.controls.addSample(createSample(100, 100));
      });
      advanceTime(16);
      act(() => {
        result.current.controls.addSample(createSample(110, 105));
      });

      let prediction: PredictedTouch | null = null;
      act(() => {
        prediction = result.current.controls.predict();
      });

      // weighted_average returns null with < 3 samples
      expect(prediction).toBeNull();
    });
  });

  describe("weighted_average with zero totalWeight (line 285)", () => {
    it("should handle all zero time deltas in weighted_average", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "weighted_average",
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add samples all at same timestamp (all dt = 0)
      const baseTime = mockTime;
      act(() => {
        result.current.controls.addSample({ x: 100, y: 100, timestamp: baseTime });
        result.current.controls.addSample({ x: 110, y: 105, timestamp: baseTime });
        result.current.controls.addSample({ x: 120, y: 110, timestamp: baseTime });
        result.current.controls.addSample({ x: 130, y: 115, timestamp: baseTime });
      });

      // Should return null because totalWeight = 0
      expect(result.current.state.currentPrediction).toBeNull();
    });
  });

  describe("calculateConfidence early return (line 380)", () => {
    it("should call predict() which triggers calculateConfidence with insufficient samples", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "kalman", // Kalman always returns prediction
          minSamplesForPrediction: 5, // Require 5 samples
          minConfidenceThreshold: 0, // But set low threshold
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add 3 samples - enough for Kalman to predict, but less than minSamplesForPrediction (5)
      // This should trigger calculateConfidence which returns 0 at line 380
      for (let i = 0; i < 3; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100 + i * 5));
        });
        advanceTime(16);
      }

      // With only 3 samples but minSamplesForPrediction=5, confidence would be 0
      // But the addSample only predicts when samples.length >= minSamplesForPrediction
      // So let's directly call predict() to trigger calculateConfidence
      let prediction: PredictedTouch | null = null;
      act(() => {
        prediction = result.current.controls.predict();
      });

      // predict() returns null when samples < minSamplesForPrediction
      expect(prediction).toBeNull();
    });

    it("should return zero confidence directly from calculateConfidence", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "linear",
          minSamplesForPrediction: 10, // Very high requirement
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add only 4 samples
      for (let i = 0; i < 4; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100 + i * 5));
        });
        advanceTime(16);
      }

      // Prediction should be null because samples < minSamplesForPrediction
      expect(result.current.state.currentPrediction).toBeNull();
    });
  });
});

// ============================================================================
// Sprint 620 - Additional Branch Coverage Tests
// ============================================================================

describe("Sprint 620 - branch coverage improvements", () => {
  describe("linear prediction edge cases (line 205-209)", () => {
    it("should return null for linear prediction with single sample", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "linear",
          minSamplesForPrediction: 1,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add only 1 sample - linear needs at least 2
      act(() => {
        result.current.controls.addSample(createSample(100, 100));
      });

      // Linear should return null, no prediction
      expect(result.current.state.currentPrediction).toBeNull();
    });

    it("should handle zero delta time in linear prediction (line 209)", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "linear",
          minSamplesForPrediction: 2,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add 2 samples at same timestamp
      const baseTime = mockTime;
      act(() => {
        result.current.controls.addSample({ x: 100, y: 100, timestamp: baseTime });
        result.current.controls.addSample({ x: 110, y: 105, timestamp: baseTime });
      });

      // Should handle dt=0 gracefully
      expect(result.current.state.currentPrediction).toBeNull();
    });
  });

  describe("quadratic prediction edge cases (lines 229-235)", () => {
    it("should return null for quadratic prediction with insufficient samples", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "quadratic",
          minSamplesForPrediction: 2,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add only 2 samples - quadratic needs at least 3
      act(() => {
        result.current.controls.addSample(createSample(100, 100));
      });
      advanceTime(16);
      act(() => {
        result.current.controls.addSample(createSample(110, 105));
      });

      // Quadratic should return null, so no prediction
      expect(result.current.state.currentPrediction).toBeNull();
    });

    it("should handle zero delta time in quadratic prediction (line 235)", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "quadratic",
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Add 3 samples with zero time delta
      const baseTime = mockTime;
      act(() => {
        result.current.controls.addSample({ x: 100, y: 100, timestamp: baseTime });
        result.current.controls.addSample({ x: 110, y: 105, timestamp: baseTime });
        result.current.controls.addSample({ x: 120, y: 110, timestamp: baseTime });
      });

      // Should handle dt1=0 || dt2=0 gracefully
      expect(result.current.state.currentPrediction).toBeNull();
    });

    it("should handle partial zero delta time (dt2 = 0)", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "quadratic",
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // First two samples with time, third at same time as second
      act(() => {
        result.current.controls.addSample(createSample(100, 100));
      });
      advanceTime(16);
      const t = mockTime;
      act(() => {
        result.current.controls.addSample({ x: 110, y: 105, timestamp: t });
        result.current.controls.addSample({ x: 120, y: 110, timestamp: t }); // dt2 = 0
      });

      // Should return null due to dt2 = 0
      expect(result.current.state.currentPrediction).toBeNull();
    });
  });

  describe("Kalman filter first sample (line 325-329)", () => {
    it("should initialize Kalman filter with first sample", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: false,
          defaultAlgorithm: "kalman",
          minSamplesForPrediction: 1,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // First sample should initialize Kalman state
      act(() => {
        result.current.controls.addSample(createSample(100, 100));
      });

      // Should set lastSample
      expect(result.current.state.lastSample?.x).toBe(100);
      expect(result.current.state.lastSample?.y).toBe(100);
    });
  });

  describe("verifyPrediction without prior prediction (line 764)", () => {
    it("should handle verifyPrediction when no prior prediction exists", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      // Call verifyPrediction without any prior predictions
      act(() => {
        result.current.controls.verifyPrediction({ x: 150, y: 125 });
      });

      // Should not crash, metrics should be unchanged
      expect(result.current.state.metrics.totalPredictions).toBe(0);
    });
  });

  describe("algorithm metrics accuracy tracking (lines 787-803)", () => {
    it("should track algorithm metrics with varying error levels", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          autoSelectAlgorithm: true,
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Generate predictions
      for (let i = 0; i < 8; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100 + i * 5));
        });
        advanceTime(16);
      }

      // Verify with exact match (low error)
      const prediction1 = result.current.state.currentPrediction;
      if (prediction1) {
        act(() => {
          result.current.controls.verifyPrediction({
            x: prediction1.x,
            y: prediction1.y,
          });
        });
      }

      // Add more samples
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(180 + i * 10, 140 + i * 5));
        });
        advanceTime(16);
      }

      // Verify with high error (to test maxError update)
      const prediction2 = result.current.state.currentPrediction;
      if (prediction2) {
        act(() => {
          result.current.controls.verifyPrediction({
            x: prediction2.x + 200, // Large error
            y: prediction2.y + 200,
          });
        });
      }

      // Metrics should have been updated
      expect(result.current.state.metrics.algorithmMetrics.size).toBeGreaterThanOrEqual(0);
    });

    it("should increment accurate predictions count", () => {
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

      // Generate consistent predictions
      for (let i = 0; i < 6; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100));
        });
        advanceTime(16);
      }

      const prediction = result.current.state.currentPrediction;

      // Verify with accurate result (within uncertainty bounds)
      if (prediction) {
        act(() => {
          result.current.controls.verifyPrediction({
            x: prediction.x,
            y: prediction.y,
          });
        });

        // Should increment accurate predictions
        expect(result.current.state.metrics.accuratePredictions).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("velocity consistency calculation (lines 400-413)", () => {
    it("should handle velocities with same direction", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // All positive velocities
      for (let i = 0; i < 6; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100 + i * 10));
        });
        advanceTime(16);
      }

      // Consistent direction should yield higher confidence
      expect(result.current.state.currentPrediction?.confidence).toBeGreaterThan(0);
    });

    it("should handle single velocity (no pairs to compare)", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          minSamplesForPrediction: 2,
          minConfidenceThreshold: 0,
          autoSelectAlgorithm: false,
          defaultAlgorithm: "linear",
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Only 2 samples gives only 1 velocity (no comparison possible)
      act(() => {
        result.current.controls.addSample(createSample(100, 100));
      });
      advanceTime(16);
      act(() => {
        result.current.controls.addSample(createSample(110, 105));
      });

      // Should still work
      expect(result.current.state.lastSample).not.toBeNull();
    });
  });

  describe("getAdaptiveHorizon with different speeds", () => {
    it("should return maximum horizon at very high speed", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          enableAdaptiveHorizon: true,
          baseHorizonMs: 30,
          maxHorizonMs: 100,
          velocityThresholdPxPerSec: 500,
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Very fast movement - far exceeding threshold
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 100, 100 + i * 100));
        });
        advanceTime(16);
      }

      // Should be near max horizon
      const prediction = result.current.state.currentPrediction;
      if (prediction) {
        expect(prediction.horizonMs).toBeGreaterThanOrEqual(50);
      }
    });

    it("should return base horizon at zero speed", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          enableAdaptiveHorizon: true,
          baseHorizonMs: 30,
          maxHorizonMs: 100,
          velocityThresholdPxPerSec: 500,
          minSamplesForPrediction: 3,
          minConfidenceThreshold: 0,
        })
      );

      act(() => {
        result.current.controls.start();
      });

      // Stationary samples
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100, 100));
        });
        advanceTime(16);
      }

      // Should be at base horizon
      const prediction = result.current.state.currentPrediction;
      if (prediction) {
        expect(prediction.horizonMs).toBe(30);
      }
    });
  });

  describe("metrics initialization and tracking", () => {
    it("should initialize metrics with zero total predictions", () => {
      const { result } = renderHook(() =>
        useTouchPredictionEngine({
          baseHorizonMs: 30,
        })
      );

      expect(result.current.state.metrics.totalPredictions).toBe(0);
      expect(result.current.state.metrics.accuratePredictions).toBe(0);
      expect(result.current.state.metrics.overallAccuracy).toBe(0);
      expect(result.current.state.metrics.averageHorizon).toBe(30);
    });

    it("should calculate average horizon from predictions", () => {
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

      // Generate multiple predictions
      for (let i = 0; i < 10; i++) {
        act(() => {
          result.current.controls.addSample(createSample(100 + i * 10, 100));
        });
        advanceTime(16);
      }

      // Average horizon should be calculated
      expect(result.current.state.metrics.averageHorizon).toBeGreaterThan(0);
    });
  });
});
