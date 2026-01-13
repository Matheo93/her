"use client";

import { useCallback, useRef, useEffect, useState } from "react";

interface VADConfig {
  /** Threshold for speech detection (0-1). Higher = less sensitive. Default: 0.01 */
  threshold?: number;
  /** Minimum duration of speech to trigger (ms). Default: 200 */
  minSpeechDuration?: number;
  /** Duration of silence before speech ends (ms). Default: 800 */
  silenceTimeout?: number;
  /** Minimum duration of silence to confirm end (ms). Default: 400 */
  minSilenceDuration?: number;
  /** Called when speech starts */
  onSpeechStart?: () => void;
  /** Called when speech ends */
  onSpeechEnd?: () => void;
  /** Called with audio level updates (0-1) */
  onVolumeChange?: (volume: number) => void;
  /** FFT size for frequency analysis. Default: 2048 */
  fftSize?: number;
  /** Pause VAD detection (e.g., when system is speaking). Default: false */
  paused?: boolean;
}

interface VADReturn {
  /** Current speech state */
  isSpeaking: boolean;
  /** Current volume level (0-1) */
  volume: number;
  /** Start VAD monitoring */
  start: () => Promise<void>;
  /** Stop VAD monitoring */
  stop: () => void;
  /** Whether VAD is active */
  isActive: boolean;
  /** Get the current MediaStream */
  getStream: () => MediaStream | null;
  /** Error state */
  error: string | null;
}

/**
 * Voice Activity Detection (VAD) hook using WebAudio API
 *
 * Features:
 * - Real-time speech detection using RMS energy and frequency analysis
 * - Configurable thresholds and timing
 * - Debounced start/end detection to prevent flapping
 * - Volume level monitoring for visualization
 *
 * @param config VAD configuration options
 * @returns VAD control functions and state
 */
export function useVAD(config: VADConfig = {}): VADReturn {
  const {
    threshold = 0.01,
    minSpeechDuration = 200,
    silenceTimeout = 800,
    minSilenceDuration = 400,
    onSpeechStart,
    onSpeechEnd,
    onVolumeChange,
    fftSize = 2048,
    paused = false,
  } = config;

  // State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup and state tracking
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);
  const speechStartTimeRef = useRef<number | null>(null);
  const lastSpeechTimeRef = useRef<number | null>(null);
  const silenceStartTimeRef = useRef<number | null>(null);
  const isActiveRef = useRef(false);
  const pausedRef = useRef(paused);

  // Keep pausedRef in sync
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Config refs to avoid stale closures in the detection loop
  const configRef = useRef({
    threshold,
    minSpeechDuration,
    silenceTimeout,
    minSilenceDuration,
  });

  // Update config ref when values change
  useEffect(() => {
    configRef.current = {
      threshold,
      minSpeechDuration,
      silenceTimeout,
      minSilenceDuration,
    };
  }, [threshold, minSpeechDuration, silenceTimeout, minSilenceDuration]);

  // Callback refs to avoid stale closures
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);
  const onVolumeChangeRef = useRef(onVolumeChange);

  // Update refs when callbacks change
  useEffect(() => {
    onSpeechStartRef.current = onSpeechStart;
    onSpeechEndRef.current = onSpeechEnd;
    onVolumeChangeRef.current = onVolumeChange;
  }, [onSpeechStart, onSpeechEnd, onVolumeChange]);

  // Calculate RMS (Root Mean Square) energy for voice detection
  const calculateRMS = (dataArray: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    return Math.sqrt(sum / dataArray.length);
  };

  // Calculate spectral centroid for voice vs noise detection
  const calculateSpectralCentroid = (
    frequencyData: Uint8Array,
    sampleRate: number,
    fftSizeVal: number
  ): number => {
    let weightedSum = 0;
    let totalEnergy = 0;
    const binWidth = sampleRate / fftSizeVal;

    for (let i = 0; i < frequencyData.length; i++) {
      const frequency = i * binWidth;
      const amplitude = frequencyData[i];
      weightedSum += frequency * amplitude;
      totalEnergy += amplitude;
    }

    return totalEnergy > 0 ? weightedSum / totalEnergy : 0;
  };

  // Voice detection loop using refs for self-reference
  const runDetectionLoop = useCallback(() => {
    const detectVoice = () => {
      if (!isActiveRef.current || !analyserRef.current || !audioContextRef.current) {
        return;
      }

      const analyser = analyserRef.current;
      const timeData = new Float32Array(analyser.fftSize);
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);

      analyser.getFloatTimeDomainData(timeData);
      analyser.getByteFrequencyData(frequencyData);

      const rms = calculateRMS(timeData);
      const spectralCentroid = calculateSpectralCentroid(
        frequencyData,
        audioContextRef.current.sampleRate,
        analyser.fftSize
      );

      // Normalize volume for visualization (0-1)
      const normalizedVolume = Math.min(1, rms * 10);
      setVolume(normalizedVolume);
      onVolumeChangeRef.current?.(normalizedVolume);

      // Debug log every ~2 seconds (assuming 60fps)
      if (Math.random() < 0.008) {
        console.log(`VAD: rms=${rms.toFixed(4)}, threshold=${configRef.current.threshold}, spectral=${spectralCentroid.toFixed(0)}, paused=${pausedRef.current}`);
      }

      // Skip detection if paused (e.g., when system is speaking to avoid echo)
      if (pausedRef.current) {
        animationFrameRef.current = requestAnimationFrame(detectVoice);
        return;
      }

      const now = Date.now();
      const cfg = configRef.current;

      // Voice is typically in 85-4000 Hz range with higher energy
      // Check both RMS threshold and frequency characteristics
      // Expanded upper limit to 4500 to catch more voice frequencies
      const isVoice = rms > cfg.threshold && spectralCentroid > 85 && spectralCentroid < 4500;

      if (isVoice) {
        lastSpeechTimeRef.current = now;
        silenceStartTimeRef.current = null;

        if (!isSpeakingRef.current) {
          // Start tracking potential speech
          if (!speechStartTimeRef.current) {
            speechStartTimeRef.current = now;
            console.log("VAD: Potential speech started");
          }

          // Confirm speech after minimum duration
          if (now - speechStartTimeRef.current >= cfg.minSpeechDuration) {
            console.log("VAD: Speech confirmed! Triggering onSpeechStart");
            isSpeakingRef.current = true;
            setIsSpeaking(true);
            onSpeechStartRef.current?.();
          }
        }
      } else {
        // Reset speech start tracking
        speechStartTimeRef.current = null;

        if (isSpeakingRef.current) {
          // Start tracking silence
          if (!silenceStartTimeRef.current) {
            silenceStartTimeRef.current = now;
          }

          // Check if silence has lasted long enough
          const silenceDuration = now - silenceStartTimeRef.current;
          const timeSinceLastSpeech = lastSpeechTimeRef.current
            ? now - lastSpeechTimeRef.current
            : Infinity;

          if (silenceDuration >= cfg.minSilenceDuration && timeSinceLastSpeech >= cfg.silenceTimeout) {
            isSpeakingRef.current = false;
            setIsSpeaking(false);
            onSpeechEndRef.current?.();
            silenceStartTimeRef.current = null;
          }
        }
      }

      // Continue the detection loop
      if (isActiveRef.current) {
        animationFrameRef.current = requestAnimationFrame(detectVoice);
      }
    };

    // Start the loop
    detectVoice();
  }, []);

  // Start VAD
  const start = useCallback(async () => {
    if (isActiveRef.current) {
      console.log("VAD already active, skipping start");
      return;
    }

    try {
      setError(null);
      console.log("VAD: Requesting microphone access...");

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      console.log("VAD: Microphone access granted, tracks:", stream.getAudioTracks().length);
      streamRef.current = stream;

      // Create audio context
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      console.log("VAD: AudioContext created, state:", audioContext.state);

      // Resume context if suspended (browser autoplay policy)
      if (audioContext.state === "suspended") {
        console.log("VAD: Resuming suspended AudioContext...");
        await audioContext.resume();
      }

      // Create analyser
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      // Connect microphone to analyser
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      console.log("VAD: Analyser connected, starting detection loop");

      // Start detection loop
      isActiveRef.current = true;
      setIsActive(true);
      runDetectionLoop();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start VAD";
      setError(message);
      console.error("VAD start error:", err);
    }
  }, [fftSize, runDetectionLoop]);

  // Stop VAD
  const stop = useCallback(() => {
    isActiveRef.current = false;

    // Cancel animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;

    // Reset state
    setIsActive(false);
    setIsSpeaking(false);
    setVolume(0);
    isSpeakingRef.current = false;
    speechStartTimeRef.current = null;
    lastSpeechTimeRef.current = null;
    silenceStartTimeRef.current = null;
  }, []);

  // Get current stream
  const getStream = useCallback(() => streamRef.current, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isSpeaking,
    volume,
    start,
    stop,
    isActive,
    getStream,
    error,
  };
}
