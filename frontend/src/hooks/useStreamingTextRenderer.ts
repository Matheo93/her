/**
 * useStreamingTextRenderer - Optimized streaming text display for AI responses
 *
 * Sprint 1590 - Provides smooth, natural text streaming with typewriter effects,
 * chunk buffering, and performance optimization for mobile.
 *
 * Features:
 * - Smooth typewriter animation
 * - Chunk-based rendering optimization
 * - Word/character streaming modes
 * - Natural typing speed variation
 * - Pause on punctuation
 * - Performance-optimized updates
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// Streaming modes
export type StreamingMode =
  | "character" // One character at a time
  | "word" // One word at a time
  | "chunk" // Chunks as received
  | "instant"; // No animation

export type StreamingState =
  | "idle" // No active stream
  | "buffering" // Receiving chunks
  | "rendering" // Animating text
  | "paused" // Paused by user
  | "complete"; // Stream finished

export interface TextChunk {
  id: string;
  content: string;
  timestamp: number;
  rendered: boolean;
}

export interface StreamingProgress {
  totalChunks: number;
  renderedChunks: number;
  totalCharacters: number;
  renderedCharacters: number;
  percentage: number;
}

export interface StreamingTextState {
  state: StreamingState;
  displayText: string;
  fullText: string;
  progress: StreamingProgress;
  currentChunk: TextChunk | null;
  isAnimating: boolean;
  speed: number; // Characters per second
}

export interface StreamingMetrics {
  totalStreams: number;
  totalCharactersRendered: number;
  averageSpeed: number;
  chunksReceived: number;
  renderLatency: number;
  droppedFrames: number;
}

export interface StreamingConfig {
  mode: StreamingMode;
  baseSpeed: number; // Characters per second
  speedVariation: number; // 0-1, randomness in speed
  punctuationPause: number; // ms to pause at punctuation
  wordPause: number; // ms pause between words (word mode)
  chunkBufferSize: number; // Max chunks to buffer
  smoothScrolling: boolean;
  batchSize: number; // Characters to render per frame
}

export interface StreamingControls {
  startStream: () => void;
  addChunk: (content: string) => void;
  completeStream: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  setSpeed: (speed: number) => void;
  setMode: (mode: StreamingMode) => void;
  skipToEnd: () => void;
  updateConfig: (config: Partial<StreamingConfig>) => void;
}

export interface UseStreamingTextRendererResult {
  state: StreamingTextState;
  metrics: StreamingMetrics;
  controls: StreamingControls;
  config: StreamingConfig;
}

const DEFAULT_CONFIG: StreamingConfig = {
  mode: "character",
  baseSpeed: 60, // Characters per second
  speedVariation: 0.2,
  punctuationPause: 150,
  wordPause: 50,
  chunkBufferSize: 100,
  smoothScrolling: true,
  batchSize: 3,
};

// Punctuation that causes pause
const PAUSE_PUNCTUATION = new Set([".", ",", "!", "?", ";", ":", "\n"]);
const LONG_PAUSE_PUNCTUATION = new Set([".", "!", "?", "\n"]);

function generateId(): string {
  return `chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useStreamingTextRenderer(
  initialConfig: Partial<StreamingConfig> = {}
): UseStreamingTextRendererResult {
  const [config, setConfig] = useState<StreamingConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  const [state, setState] = useState<StreamingTextState>({
    state: "idle",
    displayText: "",
    fullText: "",
    progress: {
      totalChunks: 0,
      renderedChunks: 0,
      totalCharacters: 0,
      renderedCharacters: 0,
      percentage: 0,
    },
    currentChunk: null,
    isAnimating: false,
    speed: config.baseSpeed,
  });

  const [metrics, setMetrics] = useState<StreamingMetrics>({
    totalStreams: 0,
    totalCharactersRendered: 0,
    averageSpeed: config.baseSpeed,
    chunksReceived: 0,
    renderLatency: 0,
    droppedFrames: 0,
  });

  // Refs
  const chunksRef = useRef<TextChunk[]>([]);
  const fullTextRef = useRef("");
  const displayIndexRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const lastRenderTimeRef = useRef(0);
  const isPausedRef = useRef(false);
  const isCompleteRef = useRef(false);
  const speedHistoryRef = useRef<number[]>([]);
  const frameTimesRef = useRef<number[]>([]);

  // Calculate current speed with variation
  const getCurrentSpeed = useCallback((): number => {
    const variation = 1 + (Math.random() - 0.5) * 2 * config.speedVariation;
    return config.baseSpeed * variation;
  }, [config.baseSpeed, config.speedVariation]);

  // Check if character should cause pause
  const getPauseForChar = useCallback(
    (char: string): number => {
      if (LONG_PAUSE_PUNCTUATION.has(char)) {
        return config.punctuationPause * 2;
      }
      if (PAUSE_PUNCTUATION.has(char)) {
        return config.punctuationPause;
      }
      if (char === " " && config.mode === "word") {
        return config.wordPause;
      }
      return 0;
    },
    [config.punctuationPause, config.wordPause, config.mode]
  );

  // Animation loop
  useEffect(() => {
    if (state.state !== "rendering" || isPausedRef.current) return;

    let lastFrameTime = performance.now();
    let accumulator = 0;
    let pauseUntil = 0;

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastFrameTime;
      lastFrameTime = currentTime;

      // Track frame times for dropped frame detection
      frameTimesRef.current.push(deltaTime);
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift();
      }

      // Check for dropped frames (> 33ms = < 30fps)
      if (deltaTime > 33) {
        setMetrics((prev) => ({
          ...prev,
          droppedFrames: prev.droppedFrames + 1,
        }));
      }

      // Handle pause
      if (currentTime < pauseUntil) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // Calculate characters to render
      const speed = getCurrentSpeed();
      const msPerChar = 1000 / speed;
      accumulator += deltaTime;

      let charsToRender = 0;
      if (config.mode === "instant") {
        charsToRender = fullTextRef.current.length - displayIndexRef.current;
      } else if (config.mode === "chunk") {
        // Render entire pending chunks
        const pendingChunks = chunksRef.current.filter((c) => !c.rendered);
        if (pendingChunks.length > 0) {
          const chunk = pendingChunks[0];
          chunk.rendered = true;
          charsToRender = chunk.content.length;
        }
      } else {
        // Character or word mode
        while (accumulator >= msPerChar && displayIndexRef.current < fullTextRef.current.length) {
          accumulator -= msPerChar;

          if (config.mode === "word") {
            // Find next word boundary
            const remaining = fullTextRef.current.slice(displayIndexRef.current);
            const wordMatch = remaining.match(/^\S*\s*/);
            if (wordMatch) {
              charsToRender += wordMatch[0].length;
            } else {
              charsToRender += 1;
            }
          } else {
            charsToRender += config.batchSize;
          }
        }
      }

      if (charsToRender > 0) {
        const startIndex = displayIndexRef.current;
        const endIndex = Math.min(
          displayIndexRef.current + charsToRender,
          fullTextRef.current.length
        );

        displayIndexRef.current = endIndex;
        const newDisplayText = fullTextRef.current.slice(0, endIndex);

        // Check for pause
        const lastChar = fullTextRef.current[endIndex - 1];
        if (lastChar) {
          const pauseMs = getPauseForChar(lastChar);
          if (pauseMs > 0) {
            pauseUntil = currentTime + pauseMs;
          }
        }

        // Track speed
        const actualSpeed = charsToRender / (deltaTime / 1000);
        speedHistoryRef.current.push(actualSpeed);
        if (speedHistoryRef.current.length > 30) {
          speedHistoryRef.current.shift();
        }

        // Update state
        const totalChars = fullTextRef.current.length;
        const renderedChars = displayIndexRef.current;

        setState((prev) => ({
          ...prev,
          displayText: newDisplayText,
          progress: {
            ...prev.progress,
            renderedCharacters: renderedChars,
            percentage: totalChars > 0 ? (renderedChars / totalChars) * 100 : 0,
          },
          speed: actualSpeed,
        }));

        setMetrics((prev) => ({
          ...prev,
          totalCharactersRendered: prev.totalCharactersRendered + (endIndex - startIndex),
          averageSpeed:
            speedHistoryRef.current.reduce((a, b) => a + b, 0) /
            speedHistoryRef.current.length,
          renderLatency: deltaTime,
        }));
      }

      // Check if complete
      if (displayIndexRef.current >= fullTextRef.current.length && isCompleteRef.current) {
        setState((prev) => ({
          ...prev,
          state: "complete",
          isAnimating: false,
        }));
        return;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state.state, config, getCurrentSpeed, getPauseForChar]);

  // Controls
  const startStream = useCallback(() => {
    chunksRef.current = [];
    fullTextRef.current = "";
    displayIndexRef.current = 0;
    isPausedRef.current = false;
    isCompleteRef.current = false;

    setState({
      state: "buffering",
      displayText: "",
      fullText: "",
      progress: {
        totalChunks: 0,
        renderedChunks: 0,
        totalCharacters: 0,
        renderedCharacters: 0,
        percentage: 0,
      },
      currentChunk: null,
      isAnimating: false,
      speed: config.baseSpeed,
    });

    setMetrics((prev) => ({
      ...prev,
      totalStreams: prev.totalStreams + 1,
    }));
  }, [config.baseSpeed]);

  const addChunk = useCallback(
    (content: string) => {
      const chunk: TextChunk = {
        id: generateId(),
        content,
        timestamp: Date.now(),
        rendered: false,
      };

      chunksRef.current.push(chunk);
      fullTextRef.current += content;

      // Enforce buffer limit
      if (chunksRef.current.length > config.chunkBufferSize) {
        chunksRef.current.shift();
      }

      setMetrics((prev) => ({
        ...prev,
        chunksReceived: prev.chunksReceived + 1,
      }));

      setState((prev) => ({
        ...prev,
        state: prev.state === "buffering" || prev.state === "idle" ? "rendering" : prev.state,
        fullText: fullTextRef.current,
        progress: {
          ...prev.progress,
          totalChunks: chunksRef.current.length,
          totalCharacters: fullTextRef.current.length,
        },
        currentChunk: chunk,
        isAnimating: true,
      }));
    },
    [config.chunkBufferSize]
  );

  const completeStream = useCallback(() => {
    isCompleteRef.current = true;

    // If already fully rendered, mark complete immediately
    if (displayIndexRef.current >= fullTextRef.current.length) {
      setState((prev) => ({
        ...prev,
        state: "complete",
        isAnimating: false,
      }));
    }
  }, []);

  const pause = useCallback(() => {
    isPausedRef.current = true;
    setState((prev) => ({
      ...prev,
      state: "paused",
      isAnimating: false,
    }));
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    setState((prev) => ({
      ...prev,
      state: "rendering",
      isAnimating: true,
    }));
  }, []);

  const reset = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    chunksRef.current = [];
    fullTextRef.current = "";
    displayIndexRef.current = 0;
    isPausedRef.current = false;
    isCompleteRef.current = false;

    setState({
      state: "idle",
      displayText: "",
      fullText: "",
      progress: {
        totalChunks: 0,
        renderedChunks: 0,
        totalCharacters: 0,
        renderedCharacters: 0,
        percentage: 0,
      },
      currentChunk: null,
      isAnimating: false,
      speed: config.baseSpeed,
    });
  }, [config.baseSpeed]);

  const setSpeed = useCallback((speed: number) => {
    setConfig((prev) => ({
      ...prev,
      baseSpeed: Math.max(1, Math.min(500, speed)),
    }));
  }, []);

  const setMode = useCallback((mode: StreamingMode) => {
    setConfig((prev) => ({ ...prev, mode }));
  }, []);

  const skipToEnd = useCallback(() => {
    displayIndexRef.current = fullTextRef.current.length;

    setState((prev) => ({
      ...prev,
      displayText: fullTextRef.current,
      state: isCompleteRef.current ? "complete" : "rendering",
      isAnimating: false,
      progress: {
        ...prev.progress,
        renderedCharacters: fullTextRef.current.length,
        percentage: 100,
      },
    }));
  }, []);

  const updateConfig = useCallback((updates: Partial<StreamingConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const controls: StreamingControls = useMemo(
    () => ({
      startStream,
      addChunk,
      completeStream,
      pause,
      resume,
      reset,
      setSpeed,
      setMode,
      skipToEnd,
      updateConfig,
    }),
    [
      startStream,
      addChunk,
      completeStream,
      pause,
      resume,
      reset,
      setSpeed,
      setMode,
      skipToEnd,
      updateConfig,
    ]
  );

  return {
    state,
    metrics,
    controls,
    config,
  };
}

// Sub-hook: Simple streaming text
export function useStreamingText(): {
  text: string;
  isStreaming: boolean;
  addChunk: (content: string) => void;
  complete: () => void;
  reset: () => void;
} {
  const { state, controls } = useStreamingTextRenderer();

  useEffect(() => {
    controls.startStream();
  }, []);

  return {
    text: state.displayText,
    isStreaming: state.state === "rendering",
    addChunk: controls.addChunk,
    complete: controls.completeStream,
    reset: controls.reset,
  };
}

// Sub-hook: Typewriter effect
export function useTypewriter(
  text: string,
  speed: number = 60
): {
  displayText: string;
  isComplete: boolean;
  restart: () => void;
} {
  const { state, controls } = useStreamingTextRenderer({ baseSpeed: speed });

  useEffect(() => {
    controls.startStream();
    controls.addChunk(text);
    controls.completeStream();
  }, [text, controls]);

  return {
    displayText: state.displayText,
    isComplete: state.state === "complete",
    restart: () => {
      controls.reset();
      controls.startStream();
      controls.addChunk(text);
      controls.completeStream();
    },
  };
}

export default useStreamingTextRenderer;
