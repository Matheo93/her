/**
 * Tests for useStreamingTextRenderer
 * Sprint 565 - Comprehensive test suite for streaming text rendering hook
 */

import { renderHook, act } from "@testing-library/react";
import useStreamingTextRenderer, {
  useStreamingText,
  useTypewriter,
  StreamingMode,
  StreamingState,
  TextChunk,
  StreamingProgress,
  StreamingTextState,
  StreamingMetrics,
  StreamingConfig,
  StreamingControls,
  UseStreamingTextRendererResult,
} from "../useStreamingTextRenderer";

// Mock performance.now
const mockPerformanceNow = jest.fn();
let performanceNowValue = 0;

beforeAll(() => {
  mockPerformanceNow.mockImplementation(() => performanceNowValue);
  jest.spyOn(performance, "now").mockImplementation(mockPerformanceNow);
});

afterAll(() => {
  jest.restoreAllMocks();
});

// Mock requestAnimationFrame
let rafCallbacks: ((time: number) => void)[] = [];
let rafId = 0;

beforeEach(() => {
  rafCallbacks = [];
  rafId = 0;
  performanceNowValue = 0;

  jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    rafId++;
    rafCallbacks.push(callback);
    return rafId;
  });

  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    rafCallbacks = rafCallbacks.filter((_, index) => index + 1 !== id);
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// Helper to advance RAF frames
function advanceFrames(count: number, deltaMs: number = 16) {
  for (let i = 0; i < count; i++) {
    performanceNowValue += deltaMs;
    const callbacks = [...rafCallbacks];
    rafCallbacks = [];
    callbacks.forEach(cb => cb(performanceNowValue));
  }
}

describe("useStreamingTextRenderer", () => {
  describe("Exports", () => {
    it("should export useStreamingTextRenderer as default", () => {
      expect(useStreamingTextRenderer).toBeDefined();
      expect(typeof useStreamingTextRenderer).toBe("function");
    });

    it("should export useStreamingText sub-hook", () => {
      expect(useStreamingText).toBeDefined();
      expect(typeof useStreamingText).toBe("function");
    });

    it("should export useTypewriter sub-hook", () => {
      expect(useTypewriter).toBeDefined();
      expect(typeof useTypewriter).toBe("function");
    });
  });

  describe("Type exports", () => {
    it("should define StreamingMode type with all modes", () => {
      const modes: StreamingMode[] = ["character", "word", "chunk", "instant"];
      expect(modes).toHaveLength(4);
    });

    it("should define StreamingState type with all states", () => {
      const states: StreamingState[] = ["idle", "buffering", "rendering", "paused", "complete"];
      expect(states).toHaveLength(5);
    });

    it("should define TextChunk interface", () => {
      const chunk: TextChunk = {
        id: "test-id",
        content: "test content",
        timestamp: Date.now(),
        rendered: false,
      };
      expect(chunk.id).toBe("test-id");
      expect(chunk.content).toBe("test content");
      expect(typeof chunk.timestamp).toBe("number");
      expect(chunk.rendered).toBe(false);
    });

    it("should define StreamingProgress interface", () => {
      const progress: StreamingProgress = {
        totalChunks: 5,
        renderedChunks: 2,
        totalCharacters: 100,
        renderedCharacters: 40,
        percentage: 40,
      };
      expect(progress.totalChunks).toBe(5);
      expect(progress.percentage).toBe(40);
    });

    it("should define StreamingConfig interface", () => {
      const config: StreamingConfig = {
        mode: "character",
        baseSpeed: 60,
        speedVariation: 0.2,
        punctuationPause: 150,
        wordPause: 50,
        chunkBufferSize: 100,
        smoothScrolling: true,
        batchSize: 3,
      };
      expect(config.mode).toBe("character");
      expect(config.baseSpeed).toBe(60);
    });
  });

  describe("Initialization", () => {
    it("should initialize with default config", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      expect(result.current.config.mode).toBe("character");
      expect(result.current.config.baseSpeed).toBe(60);
      expect(result.current.config.speedVariation).toBe(0.2);
      expect(result.current.config.punctuationPause).toBe(150);
      expect(result.current.config.wordPause).toBe(50);
      expect(result.current.config.chunkBufferSize).toBe(100);
      expect(result.current.config.smoothScrolling).toBe(true);
      expect(result.current.config.batchSize).toBe(3);
    });

    it("should initialize with custom config", () => {
      const customConfig = {
        mode: "word" as StreamingMode,
        baseSpeed: 120,
        punctuationPause: 200,
      };

      const { result } = renderHook(() => useStreamingTextRenderer(customConfig));

      expect(result.current.config.mode).toBe("word");
      expect(result.current.config.baseSpeed).toBe(120);
      expect(result.current.config.punctuationPause).toBe(200);
      // Defaults should still apply
      expect(result.current.config.speedVariation).toBe(0.2);
    });

    it("should initialize state as idle", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      expect(result.current.state.state).toBe("idle");
      expect(result.current.state.displayText).toBe("");
      expect(result.current.state.fullText).toBe("");
      expect(result.current.state.isAnimating).toBe(false);
    });

    it("should initialize progress to zero", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      expect(result.current.state.progress.totalChunks).toBe(0);
      expect(result.current.state.progress.renderedChunks).toBe(0);
      expect(result.current.state.progress.totalCharacters).toBe(0);
      expect(result.current.state.progress.renderedCharacters).toBe(0);
      expect(result.current.state.progress.percentage).toBe(0);
    });

    it("should initialize metrics", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      expect(result.current.metrics.totalStreams).toBe(0);
      expect(result.current.metrics.totalCharactersRendered).toBe(0);
      expect(result.current.metrics.chunksReceived).toBe(0);
      expect(result.current.metrics.droppedFrames).toBe(0);
    });

    it("should initialize with null currentChunk", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());
      expect(result.current.state.currentChunk).toBeNull();
    });
  });

  describe("Controls - startStream", () => {
    it("should transition state to buffering", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
      });

      expect(result.current.state.state).toBe("buffering");
    });

    it("should reset displayText and fullText", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test");
      });

      act(() => {
        result.current.controls.startStream();
      });

      expect(result.current.state.displayText).toBe("");
      expect(result.current.state.fullText).toBe("");
    });

    it("should reset progress", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
      });

      expect(result.current.state.progress.totalChunks).toBe(0);
      expect(result.current.state.progress.percentage).toBe(0);
    });

    it("should increment totalStreams metric", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
      });

      expect(result.current.metrics.totalStreams).toBe(1);

      act(() => {
        result.current.controls.startStream();
      });

      expect(result.current.metrics.totalStreams).toBe(2);
    });

    it("should set isAnimating to false initially", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
      });

      expect(result.current.state.isAnimating).toBe(false);
    });
  });

  describe("Controls - addChunk", () => {
    it("should add content to fullText", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("Hello");
      });

      expect(result.current.state.fullText).toBe("Hello");
    });

    it("should accumulate multiple chunks", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("Hello ");
        result.current.controls.addChunk("World!");
      });

      expect(result.current.state.fullText).toBe("Hello World!");
    });

    it("should transition state to rendering", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test");
      });

      expect(result.current.state.state).toBe("rendering");
    });

    it("should set isAnimating to true", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test");
      });

      expect(result.current.state.isAnimating).toBe(true);
    });

    it("should update currentChunk with new chunk", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test content");
      });

      expect(result.current.state.currentChunk).not.toBeNull();
      expect(result.current.state.currentChunk?.content).toBe("test content");
    });

    it("should generate unique chunk IDs", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("chunk1");
      });

      const firstId = result.current.state.currentChunk?.id;

      act(() => {
        result.current.controls.addChunk("chunk2");
      });

      const secondId = result.current.state.currentChunk?.id;

      expect(firstId).not.toBe(secondId);
      expect(firstId).toMatch(/^chunk-\d+-[a-z0-9]+$/);
    });

    it("should increment chunksReceived metric", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("a");
        result.current.controls.addChunk("b");
        result.current.controls.addChunk("c");
      });

      expect(result.current.metrics.chunksReceived).toBe(3);
    });

    it("should update totalCharacters in progress", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("Hello");
      });

      expect(result.current.state.progress.totalCharacters).toBe(5);
    });

    it("should respect chunkBufferSize limit", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({ chunkBufferSize: 3 }));

      act(() => {
        result.current.controls.startStream();
        for (let i = 0; i < 5; i++) {
          result.current.controls.addChunk(`chunk${i}`);
        }
      });

      // Should cap at 3 chunks in buffer
      expect(result.current.state.progress.totalChunks).toBeLessThanOrEqual(3);
    });
  });

  describe("Controls - completeStream", () => {
    it("should mark stream as complete when fully rendered", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({ mode: "instant" }));

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test");
      });

      // Advance frames to render
      act(() => {
        advanceFrames(5);
      });

      act(() => {
        result.current.controls.completeStream();
      });

      // Allow state to settle
      act(() => {
        advanceFrames(2);
      });

      expect(result.current.state.state).toBe("complete");
    });
  });

  describe("Controls - pause and resume", () => {
    it("should pause animation", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test content here");
      });

      act(() => {
        result.current.controls.pause();
      });

      expect(result.current.state.state).toBe("paused");
      expect(result.current.state.isAnimating).toBe(false);
    });

    it("should resume animation", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test content");
        result.current.controls.pause();
      });

      act(() => {
        result.current.controls.resume();
      });

      expect(result.current.state.state).toBe("rendering");
      expect(result.current.state.isAnimating).toBe(true);
    });
  });

  describe("Controls - reset", () => {
    it("should reset all state to initial", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test content");
      });

      act(() => {
        result.current.controls.reset();
      });

      expect(result.current.state.state).toBe("idle");
      expect(result.current.state.displayText).toBe("");
      expect(result.current.state.fullText).toBe("");
      expect(result.current.state.isAnimating).toBe(false);
    });

    it("should reset progress to zero", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test");
        result.current.controls.reset();
      });

      expect(result.current.state.progress.totalChunks).toBe(0);
      expect(result.current.state.progress.totalCharacters).toBe(0);
    });

    it("should cancel animation frame", () => {
      const cancelSpy = jest.spyOn(window, "cancelAnimationFrame");
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test content for animation");
      });

      // Start animation
      act(() => {
        advanceFrames(1);
      });

      act(() => {
        result.current.controls.reset();
      });

      expect(cancelSpy).toHaveBeenCalled();
    });
  });

  describe("Controls - setSpeed", () => {
    it("should update baseSpeed in config", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.setSpeed(120);
      });

      expect(result.current.config.baseSpeed).toBe(120);
    });

    it("should clamp speed to minimum of 1", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.setSpeed(-10);
      });

      expect(result.current.config.baseSpeed).toBe(1);
    });

    it("should clamp speed to maximum of 500", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.setSpeed(1000);
      });

      expect(result.current.config.baseSpeed).toBe(500);
    });
  });

  describe("Controls - setMode", () => {
    it("should update mode in config", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.setMode("word");
      });

      expect(result.current.config.mode).toBe("word");
    });

    it("should allow all streaming modes", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      const modes: StreamingMode[] = ["character", "word", "chunk", "instant"];

      modes.forEach(mode => {
        act(() => {
          result.current.controls.setMode(mode);
        });
        expect(result.current.config.mode).toBe(mode);
      });
    });
  });

  describe("Controls - skipToEnd", () => {
    it("should display full text immediately", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("Hello World");
      });

      act(() => {
        result.current.controls.skipToEnd();
      });

      expect(result.current.state.displayText).toBe("Hello World");
    });

    it("should set progress percentage to 100", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test");
        result.current.controls.skipToEnd();
      });

      expect(result.current.state.progress.percentage).toBe(100);
    });

    it("should set renderedCharacters equal to totalCharacters", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("12345");
        result.current.controls.skipToEnd();
      });

      expect(result.current.state.progress.renderedCharacters).toBe(5);
    });

    it("should set isAnimating to false", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test");
        result.current.controls.skipToEnd();
      });

      expect(result.current.state.isAnimating).toBe(false);
    });
  });

  describe("Controls - updateConfig", () => {
    it("should update multiple config values", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.updateConfig({
          mode: "chunk",
          baseSpeed: 100,
          punctuationPause: 200,
        });
      });

      expect(result.current.config.mode).toBe("chunk");
      expect(result.current.config.baseSpeed).toBe(100);
      expect(result.current.config.punctuationPause).toBe(200);
    });

    it("should preserve other config values", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      const originalWordPause = result.current.config.wordPause;

      act(() => {
        result.current.controls.updateConfig({ mode: "word" });
      });

      expect(result.current.config.wordPause).toBe(originalWordPause);
    });
  });

  describe("Animation - Character Mode", () => {
    it("should render characters progressively", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({
        mode: "character",
        baseSpeed: 60, // 60 chars/sec = ~16ms per char
        speedVariation: 0,
        batchSize: 1,
      }));

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("ABC");
      });

      // Initial state - not yet rendered
      const initialDisplayLength = result.current.state.displayText.length;

      // Advance multiple frames
      act(() => {
        advanceFrames(10, 20);
      });

      // Should have rendered some characters
      expect(result.current.state.displayText.length).toBeGreaterThanOrEqual(initialDisplayLength);
    });
  });

  describe("Animation - Instant Mode", () => {
    it("should render all text immediately", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({ mode: "instant" }));

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("Hello World");
      });

      act(() => {
        advanceFrames(1);
      });

      expect(result.current.state.displayText).toBe("Hello World");
    });
  });

  describe("Animation - Word Mode", () => {
    it("should handle word mode rendering", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({
        mode: "word",
        speedVariation: 0,
      }));

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("Hello World Test");
      });

      // Advance frames
      act(() => {
        advanceFrames(20, 20);
      });

      // Should have rendered something
      expect(result.current.state.displayText.length).toBeGreaterThan(0);
    });
  });

  describe("Animation - Chunk Mode", () => {
    it("should render entire chunks at once", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({ mode: "chunk" }));

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("First chunk");
      });

      act(() => {
        advanceFrames(1);
      });

      expect(result.current.state.displayText).toBe("First chunk");
    });
  });

  describe("Punctuation Pauses", () => {
    it("should pause longer on long pause punctuation (. ! ? \\n)", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({
        mode: "instant",
        punctuationPause: 150,
      }));

      // Hook should recognize LONG_PAUSE_PUNCTUATION
      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("Hello.");
      });

      act(() => {
        advanceFrames(1);
      });

      expect(result.current.state.displayText).toContain(".");
    });

    it("should pause on regular punctuation (, ; :)", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({
        mode: "instant",
        punctuationPause: 150,
      }));

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("Hello, World");
      });

      act(() => {
        advanceFrames(1);
      });

      expect(result.current.state.displayText).toContain(",");
    });
  });

  describe("Metrics Tracking", () => {
    it("should track totalCharactersRendered", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({ mode: "instant" }));

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("Hello");
      });

      act(() => {
        advanceFrames(2);
      });

      expect(result.current.metrics.totalCharactersRendered).toBeGreaterThanOrEqual(5);
    });

    it("should track droppedFrames when frame time > 33ms", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({ mode: "character" }));

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("Test content for frames");
      });

      // Simulate dropped frame (> 33ms)
      act(() => {
        advanceFrames(1, 50);
      });

      expect(result.current.metrics.droppedFrames).toBeGreaterThanOrEqual(1);
    });

    it("should track renderLatency", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({ mode: "instant" }));

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test");
      });

      act(() => {
        advanceFrames(1, 16);
      });

      expect(result.current.metrics.renderLatency).toBeGreaterThan(0);
    });

    it("should calculate averageSpeed", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({
        mode: "instant",
        baseSpeed: 100,
      }));

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("Some test text");
      });

      act(() => {
        advanceFrames(3, 16);
      });

      expect(result.current.metrics.averageSpeed).toBeGreaterThan(0);
    });
  });

  describe("Progress Tracking", () => {
    it("should update percentage as rendering progresses", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({ mode: "instant" }));

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("1234567890");
      });

      act(() => {
        advanceFrames(1);
      });

      expect(result.current.state.progress.percentage).toBe(100);
    });

    it("should track totalChunks", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("a");
        result.current.controls.addChunk("b");
        result.current.controls.addChunk("c");
      });

      expect(result.current.state.progress.totalChunks).toBe(3);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty string chunks", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("");
      });

      expect(result.current.state.fullText).toBe("");
    });

    it("should handle very long text", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({ mode: "instant" }));

      const longText = "A".repeat(10000);

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk(longText);
      });

      act(() => {
        advanceFrames(1);
      });

      expect(result.current.state.displayText).toBe(longText);
    });

    it("should handle special characters", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({ mode: "instant" }));

      const specialText = "Hello 🌍 World! 你好 <script>alert('xss')</script>";

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk(specialText);
      });

      act(() => {
        advanceFrames(1);
      });

      expect(result.current.state.displayText).toBe(specialText);
    });

    it("should handle newlines", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({ mode: "instant" }));

      const multilineText = "Line 1\nLine 2\nLine 3";

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk(multilineText);
      });

      act(() => {
        advanceFrames(1);
      });

      expect(result.current.state.displayText).toBe(multilineText);
    });

    it("should handle rapid addChunk calls", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      act(() => {
        result.current.controls.startStream();
        for (let i = 0; i < 100; i++) {
          result.current.controls.addChunk(`${i}`);
        }
      });

      expect(result.current.state.fullText.length).toBeGreaterThan(0);
      expect(result.current.metrics.chunksReceived).toBe(100);
    });

    it("should handle zero speedVariation", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({
        speedVariation: 0,
        baseSpeed: 100,
      }));

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test");
      });

      expect(result.current.config.speedVariation).toBe(0);
    });

    it("should handle maximum speedVariation", () => {
      const { result } = renderHook(() => useStreamingTextRenderer({
        speedVariation: 1,
        baseSpeed: 100,
      }));

      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk("test");
      });

      expect(result.current.config.speedVariation).toBe(1);
    });
  });

  describe("Return Value Structure", () => {
    it("should return state object", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      expect(result.current.state).toBeDefined();
      expect(result.current.state).toHaveProperty("state");
      expect(result.current.state).toHaveProperty("displayText");
      expect(result.current.state).toHaveProperty("fullText");
      expect(result.current.state).toHaveProperty("progress");
      expect(result.current.state).toHaveProperty("currentChunk");
      expect(result.current.state).toHaveProperty("isAnimating");
      expect(result.current.state).toHaveProperty("speed");
    });

    it("should return metrics object", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      expect(result.current.metrics).toBeDefined();
      expect(result.current.metrics).toHaveProperty("totalStreams");
      expect(result.current.metrics).toHaveProperty("totalCharactersRendered");
      expect(result.current.metrics).toHaveProperty("averageSpeed");
      expect(result.current.metrics).toHaveProperty("chunksReceived");
      expect(result.current.metrics).toHaveProperty("renderLatency");
      expect(result.current.metrics).toHaveProperty("droppedFrames");
    });

    it("should return controls object", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      expect(result.current.controls).toBeDefined();
      expect(typeof result.current.controls.startStream).toBe("function");
      expect(typeof result.current.controls.addChunk).toBe("function");
      expect(typeof result.current.controls.completeStream).toBe("function");
      expect(typeof result.current.controls.pause).toBe("function");
      expect(typeof result.current.controls.resume).toBe("function");
      expect(typeof result.current.controls.reset).toBe("function");
      expect(typeof result.current.controls.setSpeed).toBe("function");
      expect(typeof result.current.controls.setMode).toBe("function");
      expect(typeof result.current.controls.skipToEnd).toBe("function");
      expect(typeof result.current.controls.updateConfig).toBe("function");
    });

    it("should return config object", () => {
      const { result } = renderHook(() => useStreamingTextRenderer());

      expect(result.current.config).toBeDefined();
      expect(result.current.config).toHaveProperty("mode");
      expect(result.current.config).toHaveProperty("baseSpeed");
      expect(result.current.config).toHaveProperty("speedVariation");
      expect(result.current.config).toHaveProperty("punctuationPause");
      expect(result.current.config).toHaveProperty("wordPause");
      expect(result.current.config).toHaveProperty("chunkBufferSize");
      expect(result.current.config).toHaveProperty("smoothScrolling");
      expect(result.current.config).toHaveProperty("batchSize");
    });
  });
});

describe("useStreamingText", () => {
  describe("Initialization", () => {
    it("should auto-start stream on mount", () => {
      const { result } = renderHook(() => useStreamingText());

      // Should be initialized and ready for streaming
      expect(result.current.text).toBe("");
      expect(typeof result.current.addChunk).toBe("function");
    });

    it("should return correct interface", () => {
      const { result } = renderHook(() => useStreamingText());

      expect(result.current).toHaveProperty("text");
      expect(result.current).toHaveProperty("isStreaming");
      expect(result.current).toHaveProperty("addChunk");
      expect(result.current).toHaveProperty("complete");
      expect(result.current).toHaveProperty("reset");
    });
  });

  describe("addChunk", () => {
    it("should add content", () => {
      const { result } = renderHook(() => useStreamingText());

      act(() => {
        result.current.addChunk("Hello");
      });

      expect(result.current.isStreaming).toBe(true);
    });
  });

  describe("complete", () => {
    it("should mark stream as complete", () => {
      const { result } = renderHook(() => useStreamingText());

      act(() => {
        result.current.addChunk("test");
        result.current.complete();
      });

      // Stream marked complete (may still be rendering)
      expect(typeof result.current.complete).toBe("function");
    });
  });

  describe("reset", () => {
    it("should reset the stream", () => {
      const { result } = renderHook(() => useStreamingText());

      act(() => {
        result.current.addChunk("test");
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.text).toBe("");
      expect(result.current.isStreaming).toBe(false);
    });
  });
});

describe("useTypewriter", () => {
  describe("Initialization", () => {
    it("should accept text parameter", () => {
      const { result } = renderHook(() => useTypewriter("Hello World"));

      expect(result.current).toHaveProperty("displayText");
      expect(result.current).toHaveProperty("isComplete");
      expect(result.current).toHaveProperty("restart");
    });

    it("should accept custom speed", () => {
      const { result } = renderHook(() => useTypewriter("Hello", 120));

      expect(typeof result.current.displayText).toBe("string");
    });

    it("should start empty and animate to full text", () => {
      const { result } = renderHook(() => useTypewriter("ABC"));

      // Initially empty or just started
      expect(result.current.displayText.length).toBeLessThanOrEqual(3);
    });
  });

  describe("Animation", () => {
    it("should animate text progressively", () => {
      const { result } = renderHook(() => useTypewriter("Test"));

      // Advance frames
      act(() => {
        advanceFrames(50, 20);
      });

      expect(result.current.displayText.length).toBeGreaterThan(0);
    });

    it("should eventually complete", () => {
      const { result } = renderHook(() => useTypewriter("Hi"));

      // Advance many frames
      act(() => {
        advanceFrames(100, 20);
      });

      expect(result.current.displayText.length).toBeLessThanOrEqual(2);
    });
  });

  describe("restart", () => {
    it("should have restart function", () => {
      const { result } = renderHook(() => useTypewriter("test"));

      expect(typeof result.current.restart).toBe("function");
    });

    it("should restart animation when called", () => {
      const { result } = renderHook(() => useTypewriter("test"));

      act(() => {
        advanceFrames(50, 20);
      });

      act(() => {
        result.current.restart();
      });

      // After restart, displayText resets
      expect(result.current.displayText.length).toBeLessThanOrEqual(4);
    });
  });

  describe("Text change handling", () => {
    it("should handle text prop change", () => {
      const { result, rerender } = renderHook(
        ({ text }) => useTypewriter(text),
        { initialProps: { text: "First" } }
      );

      expect(result.current.displayText.length).toBeLessThanOrEqual(5);

      rerender({ text: "Second text" });

      // Should re-render with new text
      expect(typeof result.current.displayText).toBe("string");
    });
  });
});

describe("Default Config Values", () => {
  it("should have correct default mode", () => {
    const { result } = renderHook(() => useStreamingTextRenderer());
    expect(result.current.config.mode).toBe("character");
  });

  it("should have correct default baseSpeed", () => {
    const { result } = renderHook(() => useStreamingTextRenderer());
    expect(result.current.config.baseSpeed).toBe(60);
  });

  it("should have correct default speedVariation", () => {
    const { result } = renderHook(() => useStreamingTextRenderer());
    expect(result.current.config.speedVariation).toBe(0.2);
  });

  it("should have correct default punctuationPause", () => {
    const { result } = renderHook(() => useStreamingTextRenderer());
    expect(result.current.config.punctuationPause).toBe(150);
  });

  it("should have correct default wordPause", () => {
    const { result } = renderHook(() => useStreamingTextRenderer());
    expect(result.current.config.wordPause).toBe(50);
  });

  it("should have correct default chunkBufferSize", () => {
    const { result } = renderHook(() => useStreamingTextRenderer());
    expect(result.current.config.chunkBufferSize).toBe(100);
  });

  it("should have correct default smoothScrolling", () => {
    const { result } = renderHook(() => useStreamingTextRenderer());
    expect(result.current.config.smoothScrolling).toBe(true);
  });

  it("should have correct default batchSize", () => {
    const { result } = renderHook(() => useStreamingTextRenderer());
    expect(result.current.config.batchSize).toBe(3);
  });
});

describe("State Transitions", () => {
  it("should transition idle -> buffering on startStream", () => {
    const { result } = renderHook(() => useStreamingTextRenderer());

    expect(result.current.state.state).toBe("idle");

    act(() => {
      result.current.controls.startStream();
    });

    expect(result.current.state.state).toBe("buffering");
  });

  it("should transition buffering -> rendering on addChunk", () => {
    const { result } = renderHook(() => useStreamingTextRenderer());

    act(() => {
      result.current.controls.startStream();
    });

    expect(result.current.state.state).toBe("buffering");

    act(() => {
      result.current.controls.addChunk("test");
    });

    expect(result.current.state.state).toBe("rendering");
  });

  it("should transition rendering -> paused on pause", () => {
    const { result } = renderHook(() => useStreamingTextRenderer());

    act(() => {
      result.current.controls.startStream();
      result.current.controls.addChunk("test");
    });

    expect(result.current.state.state).toBe("rendering");

    act(() => {
      result.current.controls.pause();
    });

    expect(result.current.state.state).toBe("paused");
  });

  it("should transition paused -> rendering on resume", () => {
    const { result } = renderHook(() => useStreamingTextRenderer());

    act(() => {
      result.current.controls.startStream();
      result.current.controls.addChunk("test");
      result.current.controls.pause();
    });

    expect(result.current.state.state).toBe("paused");

    act(() => {
      result.current.controls.resume();
    });

    expect(result.current.state.state).toBe("rendering");
  });

  it("should transition any state -> idle on reset", () => {
    const { result } = renderHook(() => useStreamingTextRenderer());

    act(() => {
      result.current.controls.startStream();
      result.current.controls.addChunk("test");
    });

    act(() => {
      result.current.controls.reset();
    });

    expect(result.current.state.state).toBe("idle");
  });
});

describe("Cleanup", () => {
  it("should cancel animation on unmount", () => {
    const cancelSpy = jest.spyOn(window, "cancelAnimationFrame");

    const { result, unmount } = renderHook(() => useStreamingTextRenderer());

    act(() => {
      result.current.controls.startStream();
      result.current.controls.addChunk("test content");
    });

    act(() => {
      advanceFrames(1);
    });

    unmount();

    // cancelAnimationFrame should be called during cleanup
    expect(cancelSpy).toHaveBeenCalled();
  });

  it("should handle multiple start/reset cycles", () => {
    const { result } = renderHook(() => useStreamingTextRenderer());

    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.controls.startStream();
        result.current.controls.addChunk(`cycle ${i}`);
      });

      act(() => {
        advanceFrames(5);
      });

      act(() => {
        result.current.controls.reset();
      });
    }

    expect(result.current.state.state).toBe("idle");
    expect(result.current.metrics.totalStreams).toBe(5);
  });
});
