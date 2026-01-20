"use client";

import { useRef, useEffect, useCallback } from "react";

interface PresenceSoundOptions {
  enabled: boolean;
  volume: number; // 0-1, very subtle (0.05 recommended)
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
}

/**
 * usePresenceSound - Creates a subtle ambient soundscape indicating EVA's presence
 *
 * This creates an almost imperceptible sound that subconsciously communicates
 * that EVA is "there" - like the subtle sounds you hear when someone is
 * in the room with you but silent.
 *
 * Inspired by research on "presence" in voice AI:
 * - Hume AI's EVI (Empathic Voice Interface)
 * - The importance of non-verbal audio cues in human connection
 */
export function usePresenceSound({
  enabled,
  volume = 0.03,
  isConnected,
  isListening,
  isSpeaking,
}: PresenceSoundOptions) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const lfoGainRef = useRef<GainNode | null>(null);
  const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const noiseGainRef = useRef<GainNode | null>(null);

  // Create pink noise buffer for subtle presence texture
  const createPinkNoiseBuffer = useCallback((context: AudioContext): AudioBuffer => {
    const bufferSize = context.sampleRate * 2; // 2 seconds
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);

    // Pink noise algorithm (1/f noise - more natural than white noise)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    return buffer;
  }, []);

  // Initialize audio context and nodes
  const initAudio = useCallback(() => {
    if (audioContextRef.current) return;

    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      // Main gain node (volume control)
      const mainGain = ctx.createGain();
      mainGain.gain.value = 0;
      mainGain.connect(ctx.destination);
      gainNodeRef.current = mainGain;

      // Low-pass filter for warmth
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 400; // Very warm, muffled
      filter.Q.value = 0.5;
      filter.connect(mainGain);
      filterRef.current = filter;

      // === SUBTLE TONE (EVA's "breathing" frequency) ===
      // Very low frequency, like a distant hum
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 60; // Low hum, almost sub-bass

      const oscGain = ctx.createGain();
      oscGain.gain.value = 0.3; // Relative to main gain
      osc.connect(oscGain);
      oscGain.connect(filter);
      osc.start();
      oscillatorRef.current = osc;

      // === LFO for subtle variation (breathing rhythm) ===
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.15; // ~4 second cycle (matches breathing)

      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 10; // Modulates filter frequency
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();
      lfoRef.current = lfo;
      lfoGainRef.current = lfoGain;

      // === PINK NOISE (subtle presence texture) ===
      const noiseBuffer = createPinkNoiseBuffer(ctx);
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.15; // Very subtle
      noiseSource.connect(noiseGain);
      noiseGain.connect(filter);
      noiseSource.start();
      noiseSourceRef.current = noiseSource;
      noiseGainRef.current = noiseGain;

    } catch (error) {
      console.warn("Presence sound initialization failed:", error);
    }
  }, [createPinkNoiseBuffer]);

  // Cleanup
  const cleanup = useCallback(() => {
    oscillatorRef.current?.stop();
    lfoRef.current?.stop();
    noiseSourceRef.current?.stop();
    audioContextRef.current?.close();

    audioContextRef.current = null;
    oscillatorRef.current = null;
    gainNodeRef.current = null;
    filterRef.current = null;
    lfoRef.current = null;
    lfoGainRef.current = null;
    noiseSourceRef.current = null;
    noiseGainRef.current = null;
  }, []);

  // Update volume and character based on state
  useEffect(() => {
    if (!enabled || !gainNodeRef.current || !filterRef.current || !lfoRef.current) return;

    const ctx = audioContextRef.current;
    if (!ctx) return;

    const currentTime = ctx.currentTime;

    // Target volume based on state
    let targetVolume = 0;
    let filterFreq = 400;
    let lfoFreq = 0.15;

    if (isConnected) {
      if (isSpeaking) {
        // During speech, presence sound is minimal (don't compete with voice)
        targetVolume = volume * 0.2;
        filterFreq = 300;
        lfoFreq = 0.2;
      } else if (isListening) {
        // While listening, slightly more present (engaged)
        targetVolume = volume * 0.8;
        filterFreq = 500;
        lfoFreq = 0.25; // Slightly faster breathing (attentive)
      } else {
        // Idle - subtle presence
        targetVolume = volume;
        filterFreq = 400;
        lfoFreq = 0.15; // Calm breathing
      }
    }

    // Smooth transitions
    gainNodeRef.current.gain.linearRampToValueAtTime(targetVolume, currentTime + 0.5);
    filterRef.current.frequency.linearRampToValueAtTime(filterFreq, currentTime + 0.3);
    lfoRef.current.frequency.linearRampToValueAtTime(lfoFreq, currentTime + 1);

  }, [enabled, volume, isConnected, isListening, isSpeaking]);

  // Initialize on mount if enabled
  useEffect(() => {
    if (enabled && !audioContextRef.current) {
      // Delay initialization to avoid autoplay restrictions
      const initOnInteraction = () => {
        initAudio();
        document.removeEventListener("click", initOnInteraction);
        document.removeEventListener("touchstart", initOnInteraction);
      };
      document.addEventListener("click", initOnInteraction);
      document.addEventListener("touchstart", initOnInteraction);

      return () => {
        document.removeEventListener("click", initOnInteraction);
        document.removeEventListener("touchstart", initOnInteraction);
      };
    }
  }, [enabled, initAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Manual control methods
  const start = useCallback(() => {
    if (!audioContextRef.current) {
      initAudio();
    }
    if (audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume();
    }
  }, [initAudio]);

  const stop = useCallback(() => {
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.linearRampToValueAtTime(
        0,
        audioContextRef.current.currentTime + 0.5
      );
    }
  }, []);

  return {
    start,
    stop,
    isInitialized: !!audioContextRef.current,
  };
}

export default usePresenceSound;
