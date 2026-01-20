"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { HER_COLORS, HER_SPRINGS, EMOTION_PRESENCE } from "@/styles/her-theme";

type Emotion = "joy" | "sadness" | "tenderness" | "excitement" | "anger" | "fear" | "neutral";

// HER-style emotion display - subtle, warm, no emojis
const EMOTION_LABELS: Record<Emotion, string> = {
  joy: "Joyeuse",
  sadness: "Mélancolique",
  tenderness: "Tendre",
  excitement: "Enthousiaste",
  anger: "Intense",
  fear: "Inquiète",
  neutral: "Sereine",
};

interface AudioFeatures {
  energy: number;
  pitch: number;
  tempo: number;
  variance: number;
}

export default function VoiceEmotionPage() {
  const router = useRouter();
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const processAudioRef = useRef<() => void>(() => {});

  const [isListening, setIsListening] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<Emotion>("neutral");
  const [confidence, setConfidence] = useState(0);
  const [volume, setVolume] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ emotion: Emotion; time: Date }[]>([]);

  // Audio features for emotion detection
  const featuresRef = useRef<AudioFeatures>({
    energy: 0,
    pitch: 0,
    tempo: 0,
    variance: 0,
  });
  const pitchHistoryRef = useRef<number[]>([]);
  const energyHistoryRef = useRef<number[]>([]);

  // Get current emotion presence (glow, warmth)
  const currentPresence = EMOTION_PRESENCE[currentEmotion] || EMOTION_PRESENCE.neutral;

  // Analyze voice emotion based on audio features
  const analyzeEmotion = useCallback((features: AudioFeatures): { emotion: Emotion; confidence: number } => {
    const { energy, pitch, variance } = features;

    let emotion: Emotion = "neutral";
    let conf = 0.5;

    if (energy > 0.6 && variance > 0.5) {
      if (pitch > 0.6) {
        emotion = "anger";
        conf = Math.min(0.95, 0.5 + energy * 0.3 + variance * 0.2);
      } else {
        emotion = "fear";
        conf = Math.min(0.9, 0.4 + variance * 0.3 + energy * 0.2);
      }
    } else if (energy > 0.5 && pitch > 0.5 && variance < 0.4) {
      emotion = "joy";
      conf = Math.min(0.9, 0.5 + energy * 0.2 + pitch * 0.2);
    } else if (energy > 0.4 && pitch > 0.4 && variance > 0.3) {
      emotion = "excitement";
      conf = Math.min(0.85, 0.5 + energy * 0.2 + variance * 0.15);
    } else if (energy < 0.3 && pitch < 0.4) {
      if (variance < 0.2) {
        emotion = "tenderness";
        conf = Math.min(0.85, 0.5 + (1 - energy) * 0.2 + (1 - variance) * 0.2);
      } else {
        emotion = "sadness";
        conf = Math.min(0.85, 0.4 + (1 - energy) * 0.25 + (1 - pitch) * 0.2);
      }
    } else if (energy < 0.4 && variance < 0.3) {
      emotion = "neutral";
      conf = 0.6;
    }

    return { emotion, confidence: conf };
  }, []);

  // Process audio data
  const processAudio = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    const frequencyData = new Uint8Array(bufferLength);

    analyser.getFloatTimeDomainData(dataArray);
    analyser.getByteFrequencyData(frequencyData);

    // Calculate RMS energy
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const normalizedEnergy = Math.min(1, rms * 5);
    setVolume(normalizedEnergy);

    // Detect if speaking (energy threshold)
    const speaking = normalizedEnergy > 0.05;
    setIsSpeaking(speaking);

    if (speaking) {
      // Calculate pitch (spectral centroid as proxy)
      let weightedSum = 0;
      let totalEnergy = 0;
      const sampleRate = audioContextRef.current.sampleRate;
      const binWidth = sampleRate / (analyser.fftSize || 2048);

      for (let i = 0; i < frequencyData.length; i++) {
        const frequency = i * binWidth;
        const amplitude = frequencyData[i];
        weightedSum += frequency * amplitude;
        totalEnergy += amplitude;
      }

      const spectralCentroid = totalEnergy > 0 ? weightedSum / totalEnergy : 0;
      const normalizedPitch = Math.min(1, Math.max(0, (spectralCentroid - 100) / 3000));

      // Track history for variance calculation
      pitchHistoryRef.current.push(normalizedPitch);
      energyHistoryRef.current.push(normalizedEnergy);

      // Keep last 30 samples (~0.5s at 60fps)
      if (pitchHistoryRef.current.length > 30) pitchHistoryRef.current.shift();
      if (energyHistoryRef.current.length > 30) energyHistoryRef.current.shift();

      // Calculate variance
      const pitchMean = pitchHistoryRef.current.reduce((a, b) => a + b, 0) / pitchHistoryRef.current.length;
      const pitchVariance = pitchHistoryRef.current.reduce((a, b) => a + Math.pow(b - pitchMean, 2), 0) / pitchHistoryRef.current.length;
      const normalizedVariance = Math.min(1, pitchVariance * 50);

      // Calculate tempo (zero crossings as proxy for speech rate)
      let zeroCrossings = 0;
      for (let i = 1; i < dataArray.length; i++) {
        if ((dataArray[i] >= 0 && dataArray[i - 1] < 0) || (dataArray[i] < 0 && dataArray[i - 1] >= 0)) {
          zeroCrossings++;
        }
      }
      const normalizedTempo = Math.min(1, zeroCrossings / 500);

      // Update features with smoothing
      const alpha = 0.3;
      featuresRef.current = {
        energy: featuresRef.current.energy * (1 - alpha) + normalizedEnergy * alpha,
        pitch: featuresRef.current.pitch * (1 - alpha) + normalizedPitch * alpha,
        tempo: featuresRef.current.tempo * (1 - alpha) + normalizedTempo * alpha,
        variance: featuresRef.current.variance * (1 - alpha) + normalizedVariance * alpha,
      };

      // Analyze emotion
      const result = analyzeEmotion(featuresRef.current);

      if (result.emotion !== currentEmotion && result.confidence > 0.5) {
        setCurrentEmotion(result.emotion);
        setHistory(prev => [...prev.slice(-9), { emotion: result.emotion, time: new Date() }]);
      }
      setConfidence(result.confidence);
    }

    animationRef.current = requestAnimationFrame(() => processAudioRef.current());
  }, [analyzeEmotion, currentEmotion]);

  // Keep ref updated
  useEffect(() => {
    processAudioRef.current = processAudio;
  }, [processAudio]);

  // Start listening
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsListening(true);
      setError(null);

      // Start processing
      animationRef.current = requestAnimationFrame(processAudio);
    } catch (err) {
      console.error("Microphone error:", err);
      setError("Impossible d'accéder au micro");
    }
  }, [processAudio]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsListening(false);
    setIsSpeaking(false);
    setVolume(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopListening();
  }, [stopListening]);

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <motion.button
          onClick={() => router.push("/")}
          className="p-2 rounded-full transition-all"
          style={{
            backgroundColor: HER_COLORS.cream,
            color: HER_COLORS.earth,
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </motion.button>
        <h1 className="font-light" style={{ color: HER_COLORS.earth }}>Ressenti Vocal</h1>
        <div className="w-10" />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-6">
        {/* Emotion orb - HER style breathing presence */}
        <motion.div
          className="relative"
          animate={{
            scale: isSpeaking ? [1, 1.1, 1] : 1,
          }}
          transition={{
            duration: 1.5,
            repeat: isSpeaking ? Infinity : 0,
            ease: "easeInOut",
          }}
        >
          {/* Glow background */}
          <motion.div
            className="absolute -inset-8 rounded-full"
            style={{
              background: currentPresence.glow,
              filter: "blur(40px)",
            }}
            animate={{
              opacity: [0.5, 0.8, 0.5],
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Main orb */}
          <motion.div
            className="w-48 h-48 rounded-full flex items-center justify-center"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral} 0%, ${HER_COLORS.blush} 50%, ${HER_COLORS.cream} 100%)`,
              boxShadow: `0 0 60px ${currentPresence.glow}`,
            }}
            animate={{
              scale: [1, 1.03, 1],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            {/* Inner presence indicator */}
            <motion.div
              className="w-16 h-16 rounded-full"
              style={{
                backgroundColor: HER_COLORS.warmWhite,
                opacity: 0.6,
              }}
              animate={{
                scale: volume > 0.1 ? [1, 1 + volume * 0.5, 1] : 1,
              }}
              transition={{
                duration: 0.2,
              }}
            />
          </motion.div>
        </motion.div>

        {/* Emotion label - subtle, warm */}
        <div className="text-center">
          <motion.h2
            className="text-2xl font-light"
            style={{ color: HER_COLORS.earth }}
            key={currentEmotion}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={HER_SPRINGS.gentle}
          >
            {EMOTION_LABELS[currentEmotion]}
          </motion.h2>
          <p className="mt-2 text-sm" style={{ color: HER_COLORS.textSecondary }}>
            {Math.round(confidence * 100)}% de certitude
          </p>
        </div>

        {/* Volume indicator - warm bar */}
        <div
          className="w-64 h-1 rounded-full overflow-hidden"
          style={{ backgroundColor: HER_COLORS.cream }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{
              backgroundColor: HER_COLORS.coral,
              width: `${volume * 100}%`,
            }}
            transition={{ duration: 0.05 }}
          />
        </div>
        <p className="text-sm" style={{ color: HER_COLORS.textMuted }}>
          {isSpeaking ? "Je t'écoute..." : "En attente de ta voix..."}
        </p>

        {/* Start/Stop button - HER coral style */}
        {!isListening ? (
          <motion.button
            onClick={startListening}
            className="px-8 py-4 rounded-2xl font-medium transition-all"
            style={{
              backgroundColor: HER_COLORS.coral,
              color: HER_COLORS.warmWhite,
              boxShadow: `0 4px 20px ${HER_COLORS.glowCoral}`,
            }}
            whileHover={{ scale: 1.02, boxShadow: `0 6px 30px ${HER_COLORS.glowCoral}` }}
            whileTap={{ scale: 0.98 }}
          >
            Commencer l&apos;analyse
          </motion.button>
        ) : (
          <motion.button
            onClick={stopListening}
            className="px-8 py-4 rounded-2xl font-medium transition-all"
            style={{
              backgroundColor: HER_COLORS.earth,
              color: HER_COLORS.warmWhite,
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Arrêter
          </motion.button>
        )}

        {error && (
          <p style={{ color: HER_COLORS.error }}>{error}</p>
        )}
      </div>

      {/* History - warm, minimal */}
      {history.length > 0 && (
        <motion.div
          className="h-20 flex items-center justify-center gap-3 px-4"
          style={{
            backgroundColor: `${HER_COLORS.warmWhite}E6`,
            borderTop: `1px solid ${HER_COLORS.cream}`,
          }}
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          transition={HER_SPRINGS.gentle}
        >
          {history.map((item, i) => (
            <motion.div
              key={i}
              className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-light"
              style={{
                backgroundColor: HER_COLORS.cream,
                color: HER_COLORS.earth,
                boxShadow: `0 2px 8px ${HER_COLORS.softShadow}40`,
              }}
              title={`${EMOTION_LABELS[item.emotion]} - ${item.time.toLocaleTimeString()}`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={HER_SPRINGS.gentle}
            >
              {EMOTION_LABELS[item.emotion].charAt(0)}
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
