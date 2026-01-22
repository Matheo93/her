"use client";

/**
 * useAudioVisualization - Audio Level and Spectrum Analysis
 *
 * Provides audio analysis data for visualizations, meters, and
 * avatar reactivity to voice/speech.
 *
 * Sprint 230: Avatar UX and mobile latency improvements
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

interface AudioAnalysisData {
  // Overall volume level (0-1)
  level: number;

  // Peak level (0-1)
  peak: number;

  // RMS (Root Mean Square) level (0-1)
  rms: number;

  // Frequency spectrum data (normalized 0-1)
  spectrum: number[];

  // Frequency bands (bass, mid, treble)
  bands: {
    bass: number;
    lowMid: number;
    mid: number;
    highMid: number;
    treble: number;
  };

  // Whether audio is currently detected
  isActive: boolean;

  // Whether audio is clipping
  isClipping: boolean;

  // Dominant frequency (Hz)
  dominantFrequency: number;
}

interface AudioVisualizationControls {
  // Start analysis from audio element
  startFromElement: (element: HTMLAudioElement | HTMLVideoElement) => void;

  // Start analysis from media stream
  startFromStream: (stream: MediaStream) => void;

  // Stop analysis
  stop: () => void;

  // Pause analysis
  pause: () => void;

  // Resume analysis
  resume: () => void;

  // Get current data snapshot
  getSnapshot: () => AudioAnalysisData;
}

interface UseAudioVisualizationOptions {
  // FFT size (power of 2, default 256)
  fftSize?: 64 | 128 | 256 | 512 | 1024 | 2048;

  // Smoothing time constant (0-1, default 0.8)
  smoothingTimeConstant?: number;

  // Minimum decibels for analysis (default -90)
  minDecibels?: number;

  // Maximum decibels for analysis (default -10)
  maxDecibels?: number;

  // Update rate in Hz (default 60)
  updateRate?: number;

  // Whether to auto-start on mount
  autoStart?: boolean;

  // Callback on level change
  onLevelChange?: (level: number) => void;

  // Callback when audio becomes active
  onAudioStart?: () => void;

  // Callback when audio becomes silent
  onAudioStop?: () => void;

  // Silence threshold (default 0.01)
  silenceThreshold?: number;
}

interface UseAudioVisualizationResult {
  data: AudioAnalysisData;
  controls: AudioVisualizationControls;
  isAnalyzing: boolean;
}

export function useAudioVisualization(
  options: UseAudioVisualizationOptions = {}
): UseAudioVisualizationResult {
  const {
    fftSize = 256,
    smoothingTimeConstant = 0.8,
    minDecibels = -90,
    maxDecibels = -10,
    updateRate = 60,
    autoStart = false,
    onLevelChange,
    onAudioStart,
    onAudioStop,
    silenceThreshold = 0.01,
  } = options;

  // Analysis data
  const [data, setData] = useState<AudioAnalysisData>({
    level: 0,
    peak: 0,
    rms: 0,
    spectrum: [],
    bands: { bass: 0, lowMid: 0, mid: 0, highMid: 0, treble: 0 },
    isActive: false,
    isClipping: false,
    dominantFrequency: 0,
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0);
  const isPausedRef = useRef(false);
  const peakHoldRef = useRef(0);
  const peakDecayRef = useRef(0);
  const wasActiveRef = useRef(false);

  const updateInterval = 1000 / updateRate;

  // Initialize audio context and analyser
  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    if (!analyserRef.current) {
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = fftSize;
      analyserRef.current.smoothingTimeConstant = smoothingTimeConstant;
      analyserRef.current.minDecibels = minDecibels;
      analyserRef.current.maxDecibels = maxDecibels;
    }

    return { audioContext: audioContextRef.current, analyser: analyserRef.current };
  }, [fftSize, smoothingTimeConstant, minDecibels, maxDecibels]);

  // Calculate frequency bands from spectrum
  const calculateBands = useCallback((spectrum: Uint8Array, sampleRate: number) => {
    const binCount = spectrum.length;
    const nyquist = sampleRate / 2;
    const binWidth = nyquist / binCount;

    // Frequency ranges (Hz)
    const ranges = {
      bass: [20, 250],
      lowMid: [250, 500],
      mid: [500, 2000],
      highMid: [2000, 4000],
      treble: [4000, 20000],
    };

    const bands: AudioAnalysisData["bands"] = {
      bass: 0,
      lowMid: 0,
      mid: 0,
      highMid: 0,
      treble: 0,
    };

    for (const [band, [low, high]] of Object.entries(ranges)) {
      const lowBin = Math.floor(low / binWidth);
      const highBin = Math.min(Math.floor(high / binWidth), binCount - 1);
      let sum = 0;
      let count = 0;

      for (let i = lowBin; i <= highBin; i++) {
        sum += spectrum[i] / 255;
        count++;
      }

      bands[band as keyof typeof bands] = count > 0 ? sum / count : 0;
    }

    return bands;
  }, []);

  // Find dominant frequency
  const findDominantFrequency = useCallback((spectrum: Uint8Array, sampleRate: number) => {
    let maxValue = 0;
    let maxIndex = 0;

    for (let i = 0; i < spectrum.length; i++) {
      if (spectrum[i] > maxValue) {
        maxValue = spectrum[i];
        maxIndex = i;
      }
    }

    const nyquist = sampleRate / 2;
    const binWidth = nyquist / spectrum.length;
    return maxIndex * binWidth;
  }, []);

  // Analysis loop
  const analyze = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current || isPausedRef.current) {
      return;
    }

    const now = performance.now();
    const elapsed = now - lastUpdateTimeRef.current;

    if (elapsed < updateInterval) {
      animationFrameRef.current = requestAnimationFrame(analyze);
      return;
    }

    lastUpdateTimeRef.current = now;

    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;

    // Get frequency data
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequencyData);

    // Get time domain data for RMS
    const timeDomainData = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(timeDomainData);

    // Calculate RMS
    let sumSquares = 0;
    for (let i = 0; i < timeDomainData.length; i++) {
      const normalized = (timeDomainData[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / timeDomainData.length);

    // Calculate level (average of frequency data)
    const sum = frequencyData.reduce((a, b) => a + b, 0);
    const level = sum / frequencyData.length / 255;

    // Peak with decay
    if (level > peakHoldRef.current) {
      peakHoldRef.current = level;
      peakDecayRef.current = 0;
    } else {
      peakDecayRef.current += elapsed / 1000;
      if (peakDecayRef.current > 1) {
        peakHoldRef.current = Math.max(level, peakHoldRef.current * 0.95);
      }
    }

    // Check for clipping
    let isClipping = false;
    for (let i = 0; i < timeDomainData.length; i++) {
      if (timeDomainData[i] <= 1 || timeDomainData[i] >= 254) {
        isClipping = true;
        break;
      }
    }

    // Normalize spectrum
    const spectrum = Array.from(frequencyData).map((v) => v / 255);

    // Calculate bands
    const bands = calculateBands(frequencyData, audioContext.sampleRate);

    // Find dominant frequency
    const dominantFrequency = findDominantFrequency(frequencyData, audioContext.sampleRate);

    // Check if audio is active
    const isActive = level > silenceThreshold;

    // Trigger callbacks
    if (isActive !== wasActiveRef.current) {
      if (isActive) {
        onAudioStart?.();
      } else {
        onAudioStop?.();
      }
      wasActiveRef.current = isActive;
    }

    onLevelChange?.(level);

    setData({
      level,
      peak: peakHoldRef.current,
      rms,
      spectrum,
      bands,
      isActive,
      isClipping,
      dominantFrequency,
    });

    animationFrameRef.current = requestAnimationFrame(analyze);
  }, [
    updateInterval,
    silenceThreshold,
    calculateBands,
    findDominantFrequency,
    onLevelChange,
    onAudioStart,
    onAudioStop,
  ]);

  // Start from audio/video element
  const startFromElement = useCallback(
    (element: HTMLAudioElement | HTMLVideoElement) => {
      const { audioContext, analyser } = initAudio();

      // Disconnect existing source
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch {
          // Already disconnected
        }
      }

      // Create new source
      sourceRef.current = audioContext.createMediaElementSource(element);
      sourceRef.current.connect(analyser);
      analyser.connect(audioContext.destination);

      setIsAnalyzing(true);
      isPausedRef.current = false;
      lastUpdateTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(analyze);
    },
    [initAudio, analyze]
  );

  // Start from media stream
  const startFromStream = useCallback(
    (stream: MediaStream) => {
      const { audioContext, analyser } = initAudio();

      // Disconnect existing source
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch {
          // Already disconnected
        }
      }

      // Create new source
      sourceRef.current = audioContext.createMediaStreamSource(stream);
      sourceRef.current.connect(analyser);
      // Don't connect to destination for microphone (prevents feedback)

      setIsAnalyzing(true);
      isPausedRef.current = false;
      lastUpdateTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(analyze);
    },
    [initAudio, analyze]
  );

  // Stop analysis
  const stop = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // Already disconnected
      }
      sourceRef.current = null;
    }

    setIsAnalyzing(false);
    isPausedRef.current = false;
    peakHoldRef.current = 0;
    wasActiveRef.current = false;

    setData({
      level: 0,
      peak: 0,
      rms: 0,
      spectrum: [],
      bands: { bass: 0, lowMid: 0, mid: 0, highMid: 0, treble: 0 },
      isActive: false,
      isClipping: false,
      dominantFrequency: 0,
    });
  }, []);

  // Pause analysis
  const pause = useCallback(() => {
    isPausedRef.current = true;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  // Resume analysis
  const resume = useCallback(() => {
    if (!isAnalyzing) return;
    isPausedRef.current = false;
    lastUpdateTimeRef.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(analyze);
  }, [isAnalyzing, analyze]);

  // Get current snapshot
  const getSnapshot = useCallback((): AudioAnalysisData => ({ ...data }), [data]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  const controls = useMemo(
    (): AudioVisualizationControls => ({
      startFromElement,
      startFromStream,
      stop,
      pause,
      resume,
      getSnapshot,
    }),
    [startFromElement, startFromStream, stop, pause, resume, getSnapshot]
  );

  return { data, controls, isAnalyzing };
}

/**
 * Simple hook for audio level only
 */
export function useAudioLevel(
  source: HTMLAudioElement | MediaStream | null,
  options: { smoothing?: number; updateRate?: number } = {}
): number {
  const { smoothing = 0.8, updateRate = 30 } = options;
  const { data, controls, isAnalyzing } = useAudioVisualization({
    smoothingTimeConstant: smoothing,
    updateRate,
    fftSize: 64, // Smaller for better performance
  });

  useEffect(() => {
    if (!source) {
      controls.stop();
      return;
    }

    if (source instanceof HTMLAudioElement) {
      controls.startFromElement(source);
    } else {
      controls.startFromStream(source);
    }

    return () => {
      controls.stop();
    };
  }, [source, controls]);

  return data.level;
}

/**
 * Hook for voice activity detection
 */
export function useVoiceActivity(
  stream: MediaStream | null,
  options: {
    threshold?: number;
    debounceMs?: number;
  } = {}
): {
  isActive: boolean;
  level: number;
  duration: number;
} {
  const { threshold = 0.02, debounceMs = 200 } = options;
  const [isActive, setIsActive] = useState(false);
  const [duration, setDuration] = useState(0);
  const startTimeRef = useRef<number>(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data, controls } = useAudioVisualization({
    fftSize: 64,
    updateRate: 30,
    silenceThreshold: threshold,
  });

  useEffect(() => {
    if (stream) {
      controls.startFromStream(stream);
    } else {
      controls.stop();
    }

    return () => {
      controls.stop();
    };
  }, [stream, controls]);

  // Debounced activity detection
  useEffect(() => {
    if (data.isActive) {
      if (!isActive) {
        startTimeRef.current = performance.now();
        setIsActive(true);
      }
      setDuration(performance.now() - startTimeRef.current);

      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    } else if (isActive && !debounceTimeoutRef.current) {
      debounceTimeoutRef.current = setTimeout(() => {
        setIsActive(false);
        setDuration(0);
        debounceTimeoutRef.current = null;
      }, debounceMs);
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [data.isActive, isActive, debounceMs]);

  return { isActive, level: data.level, duration };
}

/**
 * Hook for spectrum visualization data
 */
export function useSpectrumBars(
  source: HTMLAudioElement | MediaStream | null,
  barCount: number = 32
): number[] {
  const { data, controls } = useAudioVisualization({
    fftSize: Math.pow(2, Math.ceil(Math.log2(barCount * 2))) as 64 | 128 | 256 | 512 | 1024 | 2048,
    smoothingTimeConstant: 0.7,
  });

  useEffect(() => {
    if (!source) {
      controls.stop();
      return;
    }

    if (source instanceof HTMLAudioElement) {
      controls.startFromElement(source);
    } else {
      controls.startFromStream(source);
    }

    return () => {
      controls.stop();
    };
  }, [source, controls]);

  // Resample spectrum to requested bar count
  return useMemo(() => {
    if (data.spectrum.length === 0) {
      return Array(barCount).fill(0);
    }

    const result: number[] = [];
    const step = data.spectrum.length / barCount;

    for (let i = 0; i < barCount; i++) {
      const startIndex = Math.floor(i * step);
      const endIndex = Math.floor((i + 1) * step);
      let sum = 0;
      for (let j = startIndex; j < endIndex; j++) {
        sum += data.spectrum[j];
      }
      result.push(sum / (endIndex - startIndex));
    }

    return result;
  }, [data.spectrum, barCount]);
}
