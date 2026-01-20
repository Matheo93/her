"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

type Emotion = "happy" | "sad" | "angry" | "fearful" | "calm" | "neutral";

const EMOTION_EMOJIS: Record<Emotion, string> = {
  happy: "😊",
  sad: "😢",
  angry: "😠",
  fearful: "😰",
  calm: "😌",
  neutral: "😐",
};

const EMOTION_LABELS: Record<Emotion, string> = {
  happy: "Joyeux",
  sad: "Triste",
  angry: "En colère",
  fearful: "Anxieux",
  calm: "Calme",
  neutral: "Neutre",
};

const EMOTION_COLORS: Record<Emotion, string> = {
  happy: "from-yellow-400 to-orange-500",
  sad: "from-blue-400 to-indigo-500",
  angry: "from-red-500 to-rose-600",
  fearful: "from-purple-400 to-violet-500",
  calm: "from-emerald-400 to-teal-500",
  neutral: "from-zinc-400 to-slate-500",
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

  // Analyze voice emotion based on audio features
  const analyzeEmotion = useCallback((features: AudioFeatures): { emotion: Emotion; confidence: number } => {
    const { energy, pitch, tempo, variance } = features;

    // High energy + high pitch + high variance = angry or happy
    // Low energy + low pitch = sad or calm
    // High variance = emotional (angry/fearful)
    // Low variance = calm/neutral

    let emotion: Emotion = "neutral";
    let conf = 0.5;

    if (energy > 0.6 && variance > 0.5) {
      if (pitch > 0.6) {
        emotion = "angry";
        conf = Math.min(0.95, 0.5 + energy * 0.3 + variance * 0.2);
      } else {
        emotion = "fearful";
        conf = Math.min(0.9, 0.4 + variance * 0.3 + energy * 0.2);
      }
    } else if (energy > 0.5 && pitch > 0.5 && variance < 0.4) {
      emotion = "happy";
      conf = Math.min(0.9, 0.5 + energy * 0.2 + pitch * 0.2);
    } else if (energy < 0.3 && pitch < 0.4) {
      if (variance < 0.2) {
        emotion = "calm";
        conf = Math.min(0.85, 0.5 + (1 - energy) * 0.2 + (1 - variance) * 0.2);
      } else {
        emotion = "sad";
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
      // Normalize pitch (voice typically 85-400Hz fundamental, harmonics higher)
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
    <div className="fixed inset-0 bg-gradient-to-b from-zinc-900 to-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <button
          onClick={() => router.push("/")}
          className="p-2 bg-white/10 rounded-full text-white"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h1 className="text-white font-medium">Analyse Vocale</h1>
        <div className="w-10" />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-6">
        {/* Emotion display */}
        <div className={`w-48 h-48 rounded-full bg-gradient-to-br ${EMOTION_COLORS[currentEmotion]} flex items-center justify-center shadow-2xl transition-all duration-500 ${isSpeaking ? "scale-110" : "scale-100"}`}>
          <span className="text-8xl">{EMOTION_EMOJIS[currentEmotion]}</span>
        </div>

        {/* Emotion label */}
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white">{EMOTION_LABELS[currentEmotion]}</h2>
          <p className="text-zinc-400 mt-1">Confiance: {Math.round(confidence * 100)}%</p>
        </div>

        {/* Volume indicator */}
        <div className="w-64 h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-75"
            style={{ width: `${volume * 100}%` }}
          />
        </div>
        <p className="text-zinc-500 text-sm">
          {isSpeaking ? "🎤 Parle..." : "En attente de ta voix..."}
        </p>

        {/* Start/Stop button */}
        {!isListening ? (
          <button
            onClick={startListening}
            className="px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-medium text-lg transition-all"
          >
            Commencer l&apos;analyse
          </button>
        ) : (
          <button
            onClick={stopListening}
            className="px-8 py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-medium text-lg transition-all"
          >
            Arrêter
          </button>
        )}

        {error && <p className="text-red-400">{error}</p>}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="h-20 bg-zinc-900/80 backdrop-blur flex items-center justify-center gap-2 px-4">
          {history.map((item, i) => (
            <div
              key={i}
              className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center"
              title={`${EMOTION_LABELS[item.emotion]} - ${item.time.toLocaleTimeString()}`}
            >
              <span className="text-xl">{EMOTION_EMOJIS[item.emotion]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
