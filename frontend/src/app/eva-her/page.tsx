"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import type { VisemeWeights } from "@/components/RealisticAvatarImage";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";
import { usePersistentMemory } from "@/hooks/usePersistentMemory";
import { useEmotionalWarmth } from "@/hooks/useEmotionalWarmth";
import { useVoiceWarmth } from "@/hooks/useVoiceWarmth";
import { useHerStatus } from "@/hooks/useHerStatus";
import { useBackendMemory } from "@/hooks/useBackendMemory";
import { useBackchannel, shouldTriggerBackchannel } from "@/hooks/useBackchannel";
import { useDarkMode } from "@/hooks/useDarkMode";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { MemoryIndicator } from "@/components/MemoryIndicator";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const VISEME_URL = process.env.NEXT_PUBLIC_VISEME_URL || "http://localhost:8003";

// Bio-data simulation for presence feeling
interface BioData {
  heartRate: number;
  breathPhase: number;
  presence: number;
}

// Dynamic import for avatar (avoid SSR issues)
const RealisticAvatarImage = dynamic(
  () => import("@/components/RealisticAvatarImage").then((mod) => mod.RealisticAvatarImage),
  {
    ssr: false,
    loading: () => (
      <div className="w-64 h-64 md:w-80 md:h-80 rounded-full flex items-center justify-center"
        style={{ backgroundColor: HER_COLORS.cream }}>
        <div
          className="w-8 h-8 rounded-full"
          style={{
            backgroundColor: HER_COLORS.coral,
            animation: "breathe 4s ease-in-out infinite"
          }}
        />
        <style>{`@keyframes breathe { 0%, 100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.1); } }`}</style>
      </div>
    ),
  }
);

export default function EvaHerPage() {
  // State - minimal, essential only
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [evaEmotion, setEvaEmotion] = useState("neutral");
  const [currentText, setCurrentText] = useState("");
  const [inputText, setInputText] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [visemeWeights, setVisemeWeights] = useState<VisemeWeights>({ sil: 1 });
  const [messageSent, setMessageSent] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // HER Feature: Persistent Memory - EVA remembers you
  const persistentMemory = usePersistentMemory();

  // HER Feature: Emotional Warmth - Connection grows over time
  const emotionalWarmth = useEmotionalWarmth({
    initialWarmth: persistentMemory.restoredWarmth,
    connectionDuration: 0, // Will be updated by hook
    sharedMoments: persistentMemory.stats.totalSharedMoments,
    proactiveCareCount: 0,
    silenceQuality: 0.5,
    attunementLevel: 0.5,
    currentEmotion: evaEmotion,
    emotionalIntensity: 0.5,
    isConnected,
    isSpeaking,
    isListening,
    isInDistress: false,
    enabled: true,
  });

  // HER Feature: Voice Warmth - Voice changes with connection depth
  const voiceWarmth = useVoiceWarmth({
    warmthLevel: emotionalWarmth.level,
    warmthNumeric: emotionalWarmth.levelNumeric,
    voiceHints: emotionalWarmth.voiceHints,
    currentEmotion: evaEmotion,
    emotionalIntensity: 0.5,
    isSpeaking,
    isListening,
    isIdle: !isSpeaking && !isListening && !isThinking,
    isProactive: false,
    reunionVoiceBoost: persistentMemory.isReunion ? {
      rateAdjustment: -0.1,    // Slower, warmer
      pitchAdjustment: -1,      // Softer tone
      volumeAdjustment: 0.95,   // Slightly softer
      breathinessBoost: 0.1,    // More intimate
    } : undefined,
    enabled: true,
  });

  // SPRINT 26: HER Backend Status - Monitor system health
  const herStatus = useHerStatus({
    pollInterval: 30000,
    enablePolling: isConnected,
  });

  // SPRINT 26: Backend Memory - Sync with server-side memory
  const backendMemory = useBackendMemory({
    userId: "eva_her_user",
    autoFetch: isConnected,
  });

  // SPRINT 26: Backchannel - Natural reactions during conversation
  const backchannel = useBackchannel({
    withAudio: true,
    onBackchannel: (sound, type) => {
      // Backchannel played - could update UI or log
      console.debug(`[Backchannel] ${type}: ${sound}`);
    },
  });

  // SPRINT 86: Dark mode support
  const darkMode = useDarkMode();
  const colors = darkMode.colors;

  // SPRINT 89: Accessibility - reduced motion support
  const prefersReducedMotion = useReducedMotion();

  // Ref to track last backchannel time for throttling
  const lastBackchannelTimeRef = useRef<number | null>(null);

  // JARVIS Feature: Bio-data for presence feeling
  const [bioData, setBioData] = useState<BioData>({
    heartRate: 72,
    breathPhase: 0,
    presence: persistentMemory.restoredWarmth || 0.8,
  });
  const [showWelcome, setShowWelcome] = useState(!persistentMemory.isReturningUser);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const visemeWsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<{ audio: ArrayBuffer; emotion: string }[]>([]);
  const isPlayingRef = useRef(false);
  const playNextAudioRef = useRef<() => void>(() => {});
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const bioAnimationRef = useRef<number | null>(null);

  // Determine current state for bio-data
  const currentState = isSpeaking ? "speaking" : isListening ? "listening" : isThinking ? "thinking" : "idle";

  // JARVIS Feature: Bio-data animation
  useEffect(() => {
    const startTime = Date.now();

    const animateBio = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const breathPhase = (Math.sin(elapsed * Math.PI / 4) + 1) / 2;
      const baseHR = isListening ? 78 : isSpeaking ? 75 : 72;
      const hrVariation = Math.sin(elapsed * 0.5) * 3;
      const targetPresence = currentState === "idle" ? 0.7 : currentState === "listening" ? 0.95 : 0.9;

      setBioData((prev) => ({
        heartRate: Math.round(baseHR + hrVariation),
        breathPhase,
        presence: prev.presence + (targetPresence - prev.presence) * 0.05,
      }));

      bioAnimationRef.current = requestAnimationFrame(animateBio);
    };

    bioAnimationRef.current = requestAnimationFrame(animateBio);
    return () => {
      if (bioAnimationRef.current) cancelAnimationFrame(bioAnimationRef.current);
    };
  }, [currentState, isListening, isSpeaking]);

  // Welcome disappears after first interaction
  useEffect(() => {
    if (isListening || isSpeaking || isThinking) {
      setShowWelcome(false);
    }
  }, [isListening, isSpeaking, isThinking]);

  // Refs for stable callbacks to avoid infinite loops
  const persistentMemorySaveRef = useRef(persistentMemory.save);
  const persistentMemoryAddMomentRef = useRef(persistentMemory.addSharedMoment);
  useEffect(() => {
    persistentMemorySaveRef.current = persistentMemory.save;
    persistentMemoryAddMomentRef.current = persistentMemory.addSharedMoment;
  }, [persistentMemory.save, persistentMemory.addSharedMoment]);

  // HER Feature: Sync warmth to persistent memory every 30s
  const warmthLevelRef = useRef(emotionalWarmth.levelNumeric);
  const connectionRef = useRef(emotionalWarmth.connection);
  useEffect(() => {
    warmthLevelRef.current = emotionalWarmth.levelNumeric;
    connectionRef.current = emotionalWarmth.connection;
  }, [emotionalWarmth.levelNumeric, emotionalWarmth.connection]);

  useEffect(() => {
    const saveInterval = setInterval(() => {
      if (warmthLevelRef.current > 0) {
        persistentMemorySaveRef.current({
          warmthBaseline: warmthLevelRef.current,
          familiarityScore: connectionRef.current?.familiarityScore || 0.5,
          trustLevel: connectionRef.current?.trustLevel || 0.5,
        });
      }
    }, 30000);

    // Save on unmount too
    return () => {
      clearInterval(saveInterval);
      if (warmthLevelRef.current > 0) {
        persistentMemorySaveRef.current({
          warmthBaseline: warmthLevelRef.current,
          familiarityScore: connectionRef.current?.familiarityScore || 0.5,
          trustLevel: connectionRef.current?.trustLevel || 0.5,
        });
      }
    };
  }, []);

  // HER Feature: Track shared moments (emotional peaks)
  const lastEmotionRef = useRef(evaEmotion);
  useEffect(() => {
    // Detect emotional peaks - joy, tenderness, excitement
    const peakEmotions = ["joy", "tenderness", "excitement", "love"];
    const vulnerabilityEmotions = ["sadness", "fear", "empathy"];
    const comfortEmotions = ["calm", "peaceful", "soothed"];

    if (evaEmotion !== lastEmotionRef.current) {
      const intensity = warmthLevelRef.current;

      if (peakEmotions.includes(evaEmotion) && intensity > 0.5) {
        persistentMemoryAddMomentRef.current("peak", intensity);
      } else if (vulnerabilityEmotions.includes(evaEmotion) && intensity > 0.3) {
        persistentMemoryAddMomentRef.current("vulnerability", intensity);
      } else if (comfortEmotions.includes(evaEmotion) && intensity > 0.4) {
        persistentMemoryAddMomentRef.current("comfort", intensity);
      }

      lastEmotionRef.current = evaEmotion;
    }
  }, [evaEmotion]);

  // Connect to Viseme WebSocket
  useEffect(() => {
    const connectViseme = () => {
      try {
        const ws = new WebSocket(`${VISEME_URL.replace("http", "ws")}/ws/viseme`);

        ws.onopen = () => {
          // Ping to keep alive
          const interval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 10000);
          ws.addEventListener("close", () => clearInterval(interval));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "viseme" && data.weights) {
              setVisemeWeights(data.weights);
            }
          } catch {
            // Ignore
          }
        };

        ws.onclose = () => {
          setTimeout(connectViseme, 5000);
        };

        visemeWsRef.current = ws;
      } catch {
        setTimeout(connectViseme, 5000);
      }
    };

    connectViseme();
    return () => visemeWsRef.current?.close();
  }, []);

  // Connect to main WebSocket with improved error handling
  useEffect(() => {
    const connect = () => {
      try {
        const ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws/her`);

        ws.onopen = () => {
          setIsConnected(true);
          setConnectionError(null);
          reconnectAttemptsRef.current = 0;
          ws.send(JSON.stringify({
            type: "config",
            user_id: "eva_her_user",
            voice: "french",
            // Voice warmth parameters from hook
            voice_warmth: {
              rate: voiceWarmth.params.rate,
              pitch: voiceWarmth.params.pitch,
              volume: voiceWarmth.params.volume,
              mode: voiceWarmth.mode,
            }
          }));
        };

        ws.onerror = () => {
          setConnectionError("Erreur de connexion");
        };

        ws.onclose = (event) => {
          setIsConnected(false);

          // Handle different close codes
          if (event.code === 1000) {
            // Normal closure
            setConnectionError(null);
          } else if (event.code === 1006) {
            // Abnormal closure
            setConnectionError("Connexion interrompue");
          }

          // Reconnect with exponential backoff
          reconnectAttemptsRef.current++;
          if (reconnectAttemptsRef.current <= maxReconnectAttempts) {
            const delay = Math.min(3000 * Math.pow(1.5, reconnectAttemptsRef.current - 1), 15000);
            setTimeout(connect, delay);
          } else {
            setConnectionError("Impossible de se connecter. Rafraîchissez la page.");
          }
        };

        ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "her_context":
            setEvaEmotion(data.response_emotion || "neutral");
            break;

          case "speaking_start":
            setIsSpeaking(true);
            setIsThinking(false);
            break;

          case "filler":
            if (data.audio_base64) {
              const audio = base64ToArrayBuffer(data.audio_base64);
              audioQueueRef.current.push({ audio, emotion: "neutral" });
              playNextAudioRef.current();

              // Send to viseme service
              if (visemeWsRef.current?.readyState === WebSocket.OPEN) {
                visemeWsRef.current.send(JSON.stringify({
                  type: "audio_wav",
                  data: data.audio_base64,
                }));
              }
            }
            break;

          case "token":
            setCurrentText(prev => prev + data.content);
            setIsThinking(true);
            break;

          case "speech":
            if (data.audio_base64) {
              const audio = base64ToArrayBuffer(data.audio_base64);
              audioQueueRef.current.push({ audio, emotion: data.emotion || "neutral" });
              playNextAudioRef.current();

              // Send to viseme service for lip-sync
              if (visemeWsRef.current?.readyState === WebSocket.OPEN) {
                visemeWsRef.current.send(JSON.stringify({
                  type: "audio_wav",
                  data: data.audio_base64,
                }));
              }
            }
            setEvaEmotion(data.emotion || "neutral");
            break;

          case "breathing":
            if (data.audio_base64) {
              const audio = base64ToArrayBuffer(data.audio_base64);
              audioQueueRef.current.push({ audio, emotion: "neutral" });
              playNextAudioRef.current();
            }
            break;

          case "speaking_end":
            setIsSpeaking(false);
            setIsThinking(false);
            setCurrentText("");
            setVisemeWeights({ sil: 1 });
            break;

          case "proactive":
            setCurrentText(data.content || "");
            if (data.audio_base64) {
              const audio = base64ToArrayBuffer(data.audio_base64);
              audioQueueRef.current.push({ audio, emotion: "tenderness" });
              playNextAudioRef.current();
            }
            break;
        }
        };

        wsRef.current = ws;
      } catch (err) {
        console.error("WebSocket connection error:", err);
        setConnectionError("Erreur de connexion au serveur");
      }
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  // Audio playback with level detection
  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const { audio: arrayBuffer, emotion } = audioQueueRef.current.shift()!;
    setEvaEmotion(emotion);

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const audioContext = audioContextRef.current;
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;

      // Create analyzer for audio level
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 32;
      analyzer.smoothingTimeConstant = 0.5;
      analyzerRef.current = analyzer;

      source.connect(analyzer);
      analyzer.connect(audioContext.destination);

      // Update audio level for avatar
      const dataArray = new Uint8Array(analyzer.frequencyBinCount);
      const updateLevel = () => {
        if (!isPlayingRef.current) return;
        analyzer.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
        setAudioLevel(avg);
        requestAnimationFrame(updateLevel);
      };

      source.onended = () => {
        isPlayingRef.current = false;
        setAudioLevel(0);
        if (audioQueueRef.current.length > 0) {
          playNextAudioRef.current();
        } else {
          setIsSpeaking(false);
          setVisemeWeights({ sil: 1 });
        }
      };

      source.start(0);
      updateLevel();
    } catch {
      isPlayingRef.current = false;
      setAudioLevel(0);
      if (audioQueueRef.current.length > 0) {
        playNextAudioRef.current();
      } else {
        setIsSpeaking(false);
      }
    }
  }, []);

  useEffect(() => {
    playNextAudioRef.current = playNextAudio;
  }, [playNextAudio]);

  // Voice recording
  const startListening = useCallback(async () => {
    if (isListening || !wsRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        setIsListening(false);

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: "audio",
              data: base64
            }));
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.error("Mic error:", err);
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Stable ref for backchannel trigger to avoid infinite loops
  const triggerBackchannelRef = useRef(backchannel.triggerBackchannel);
  useEffect(() => {
    triggerBackchannelRef.current = backchannel.triggerBackchannel;
  }, [backchannel.triggerBackchannel]);

  // SPRINT 26: Trigger backchannels during emotional moments
  useEffect(() => {
    if (!isConnected || isListening || isSpeaking) return;

    // Check if we should trigger a backchannel based on emotional context
    const shouldTrigger = shouldTriggerBackchannel(
      evaEmotion,
      lastBackchannelTimeRef.current,
      5000 // minimum 5s between backchannels
    );

    if (shouldTrigger) {
      triggerBackchannelRef.current(evaEmotion);
      lastBackchannelTimeRef.current = Date.now();
    }
  }, [evaEmotion, isConnected, isListening, isSpeaking]);

  // Send text message with visual feedback
  const sendMessage = (text: string) => {
    if (!text.trim() || !wsRef.current) return;

    setCurrentText("");
    wsRef.current.send(JSON.stringify({
      type: "message",
      content: text,
      user_id: "eva_her_user"
    }));
    setIsThinking(true);

    // Visual feedback for message sent
    setMessageSent(true);
    setTimeout(() => setMessageSent(false), 1500);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
      setInputText("");
    }
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden flex flex-col items-center justify-center transition-colors duration-500"
      style={{ backgroundColor: colors.warmWhite }}
    >
      {/* Skip to content link for accessibility */}
      <a
        href="#eva-input"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-1/2 focus:-translate-x-1/2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-full focus:text-sm"
        style={{
          backgroundColor: colors.coral,
          color: colors.warmWhite,
        }}
      >
        Aller au champ de saisie
      </a>

      {/* Living ambient background - respects reduced motion */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={prefersReducedMotion ? {} : {
          background: [
            `radial-gradient(ellipse at 50% 30%, ${colors.cream} 0%, ${colors.warmWhite} 70%)`,
            `radial-gradient(ellipse at 50% 28%, ${colors.cream} 0%, ${colors.warmWhite} 72%)`,
            `radial-gradient(ellipse at 50% 30%, ${colors.cream} 0%, ${colors.warmWhite} 70%)`,
          ],
        }}
        style={prefersReducedMotion ? {
          background: `radial-gradient(ellipse at 50% 30%, ${colors.cream} 0%, ${colors.warmWhite} 70%)`,
        } : {}}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* JARVIS Feature: Bio-Data indicator */}
      <div className="absolute top-4 sm:top-6 left-4 sm:left-6 flex flex-col gap-2">
        <AnimatePresence>
          {isConnected && (
            <motion.div
              className="flex items-center gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 0.6, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <motion.div
                className="flex items-center gap-2"
                animate={prefersReducedMotion ? {} : { scale: [1, 1.05, 1] }}
                transition={{
                  duration: 60 / bioData.heartRate,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill={colors.coral}
                  style={{ opacity: 0.7 }}
                >
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                <span
                  className="text-xs font-light tabular-nums"
                  style={{ color: colors.earth, opacity: 0.5 }}
                >
                  {bioData.heartRate}
                </span>
              </motion.div>
              <div
                className="w-16 h-1 rounded-full overflow-hidden"
                style={{ backgroundColor: `${colors.softShadow}40` }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: colors.coral }}
                  animate={{ width: `${bioData.presence * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SPRINT 87: Memory indicator */}
        <MemoryIndicator
          memory={persistentMemory}
          colors={colors}
          isVisible={isConnected && !isSpeaking && !isListening}
        />
      </div>

      {/* SPRINT 26: HER System Status - Top right */}
      <div className="absolute top-4 sm:top-6 right-4 sm:right-6 flex flex-col items-end gap-2">
        {/* Dark mode toggle */}
        <motion.button
          onClick={darkMode.toggle}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{
            backgroundColor: `${colors.cream}90`,
            // @ts-expect-error CSS custom property for focus ring
            "--tw-ring-color": colors.coral,
          }}
          whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
          whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
          aria-label={darkMode.isDark ? "Passer en mode clair" : "Passer en mode sombre"}
        >
          <motion.div
            initial={false}
            animate={{ rotate: darkMode.isDark ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            {darkMode.isDark ? (
              <svg className="w-4 h-4" fill={colors.earth} viewBox="0 0 24 24">
                <path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill={colors.earth} viewBox="0 0 24 24">
                <path d="M12 7a5 5 0 100 10 5 5 0 000-10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke={colors.earth} strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </motion.div>
          <span
            className="text-xs font-light hidden sm:inline"
            style={{ color: colors.earth, opacity: 0.7 }}
          >
            {darkMode.isDark ? "Sombre" : "Clair"}
          </span>
        </motion.button>

        <AnimatePresence>
          {herStatus.isConnected && (
            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: `${colors.cream}90` }}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 0.8, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              {/* Health indicator dot */}
              <motion.div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: herStatus.healthScore > 0.7
                    ? "#4ade80" // green
                    : herStatus.healthScore > 0.4
                      ? "#fbbf24" // yellow
                      : "#f87171", // red
                }}
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span
                className="text-xs font-light"
                style={{ color: colors.earth, opacity: 0.7 }}
              >
                HER {Math.round(herStatus.healthScore * 100)}%
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Backend memory indicator */}
        <AnimatePresence>
          {backendMemory.memories.length > 0 && (
            <motion.div
              className="flex items-center gap-1.5 px-2 py-1 rounded-full"
              style={{ backgroundColor: `${HER_COLORS.cream}70` }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 0.6, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke={colors.earth}
                strokeWidth={1.5}
                style={{ opacity: 0.5 }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              <span
                className="text-xs font-light"
                style={{ color: colors.earth, opacity: 0.5 }}
              >
                {backendMemory.memories.length}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main content - centered, minimal */}
      <div className="relative flex flex-col items-center justify-center flex-1 px-4">
        {/* Breathing glow around avatar - respects reduced motion */}
        <motion.div
          className="absolute w-72 h-72 md:w-96 md:h-96 rounded-full"
          style={{
            background: `radial-gradient(circle, ${colors.coral}15 0%, transparent 70%)`,
            opacity: prefersReducedMotion ? 0.5 : undefined,
          }}
          animate={prefersReducedMotion ? {} : {
            scale: [1, 1 + bioData.breathPhase * 0.06, 1],
            opacity: [0.4, 0.6, 0.4],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Realistic Human Avatar */}
        <div className="avatar w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 relative z-10">
          <RealisticAvatarImage
            visemeWeights={visemeWeights}
            emotion={evaEmotion}
            isSpeaking={isSpeaking}
            isListening={isListening}
            audioLevel={audioLevel}
          />
        </div>

        {/* Welcome message - personalized based on memory */}
        <AnimatePresence>
          {showWelcome && !isListening && !isSpeaking && !isThinking && isConnected && (
            <motion.p
              className="mt-8 text-base max-w-md text-center px-4"
              style={{ color: colors.earth }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 0.8, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.5, ...HER_SPRINGS.gentle }}
            >
              {persistentMemory.isReunion
                ? persistentMemory.reunionType === "very_long"
                  ? "Tu es revenu... enfin"
                  : persistentMemory.reunionType === "long"
                    ? "Tu m'as manqué..."
                    : persistentMemory.reunionType === "medium"
                      ? "Je pensais à toi"
                      : "Te revoilà..."
                : persistentMemory.isReturningUser
                  ? "Rebonjour..."
                  : "Je suis là..."}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Eva's words - subtle, appearing below avatar */}
        <AnimatePresence mode="wait">
          {currentText && (
            <motion.div
              className="mt-8 max-w-md text-center px-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <p
                className="text-lg leading-relaxed"
                style={{ color: colors.earth }}
              >
                {currentText}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Thinking indicator - organic, breathing animation */}
        <AnimatePresence>
          {isThinking && !currentText && (
            <motion.div
              className="mt-8 flex items-center gap-3"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.3 }}
            >
              {/* Breathing circle - respects reduced motion */}
              <motion.div
                className="relative"
                animate={prefersReducedMotion ? {} : { scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <motion.div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: colors.coral }}
                  animate={prefersReducedMotion ? {} : { opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
                {!prefersReducedMotion && (
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: colors.coral }}
                    animate={{ scale: [1, 1.8], opacity: [0.4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
              </motion.div>

              {/* Flowing dots - respects reduced motion */}
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1 h-1 rounded-full"
                    style={{ backgroundColor: colors.coral }}
                    animate={prefersReducedMotion ? {} : {
                      opacity: [0.2, 0.7, 0.2],
                      scale: [0.8, 1.2, 0.8],
                    }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: i * 0.2,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>

              {/* Optional text hint */}
              <motion.span
                className="text-xs font-light"
                style={{ color: colors.earth, opacity: 0.4 }}
                animate={{ opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                ...
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input area - minimal, at the bottom - mobile optimized */}
      <div className="w-full max-w-lg px-4 sm:px-6 pb-6 sm:pb-8">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Text input - with accessibility */}
          <div className="relative flex-1">
            <input
              type="text"
              value={inputText}
              id="eva-input"
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Dis quelque chose..."
              aria-label="Message pour EVA"
              aria-describedby="eva-status"
              autoComplete="off"
              className="w-full px-4 sm:px-5 py-2.5 sm:py-3 rounded-full border-0 outline-none text-sm sm:text-base focus:ring-2 focus:ring-offset-2 transition-shadow"
              style={{
                backgroundColor: colors.cream,
                color: colors.earth,
                boxShadow: `inset 0 2px 4px ${colors.softShadow}20`,
                // @ts-expect-error CSS custom property for focus ring
                "--tw-ring-color": colors.coral,
              }}
            />
            {/* Message sent feedback */}
            <AnimatePresence>
              {messageSent && (
                <motion.div
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <svg
                    className="w-4 h-4"
                    fill={colors.coral}
                    viewBox="0 0 24 24"
                  >
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* Screen reader status */}
          <span id="eva-status" className="sr-only">
            {isConnected
              ? isListening
                ? "EVA vous écoute"
                : isSpeaking
                  ? "EVA parle"
                  : isThinking
                    ? "EVA réfléchit"
                    : "EVA est prête"
              : "Connexion en cours"}
          </span>

          {/* Microphone button - with breathing ambient ring */}
          <div className="relative">
            <motion.div
              className="absolute -inset-2 rounded-full"
              style={{
                background: `radial-gradient(circle, ${colors.coral}15 0%, transparent 70%)`,
                opacity: prefersReducedMotion ? (isListening ? 0.9 : 0.3) : undefined,
              }}
              animate={prefersReducedMotion ? {} : {
                scale: [1, 1.1, 1],
                opacity: isListening ? [0.8, 1, 0.8] : [0.2, 0.4, 0.2],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />

            <motion.button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              disabled={!isConnected}
              aria-label={isListening ? "Relâcher pour envoyer" : "Maintenir pour parler"}
              aria-pressed={isListening}
              className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{
                backgroundColor: isListening ? colors.coral : colors.cream,
                boxShadow: isListening
                  ? `0 0 30px ${colors.coral}40, inset 0 0 15px ${colors.warmWhite}30`
                  : `0 4px 12px ${colors.softShadow}30`,
                // @ts-expect-error CSS custom property for focus ring
                "--tw-ring-color": colors.coral,
              }}
              whileHover={prefersReducedMotion ? {} : { scale: 1.08 }}
              whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
              animate={
                prefersReducedMotion ? {} :
                isListening
                  ? { scale: [1, 1.05, 1] }
                  : isSpeaking && audioLevel > 0.1
                    ? { scale: [1, 1 + audioLevel * 0.05, 1] }
                    : {}
              }
              transition={{
                duration: isListening ? 1.2 : 0.15,
                repeat: isListening ? Infinity : 0,
              }}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke={isListening ? colors.warmWhite : colors.earth}
                viewBox="0 0 24 24"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>

              {/* Listening rings */}
              <AnimatePresence>
                {isListening && (
                  <>
                    {[0, 1].map((i) => (
                      <motion.div
                        key={i}
                        className="absolute inset-0 rounded-full"
                        style={{ border: `1px solid ${colors.coral}` }}
                        initial={{ scale: 1, opacity: 0.5 }}
                        animate={{ scale: 1.5 + i * 0.2, opacity: 0 }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          delay: i * 0.3,
                          ease: "easeOut",
                        }}
                      />
                    ))}
                  </>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>

        {/* Connection status - animated, only when disconnected */}
        <AnimatePresence>
          {!isConnected && (
            <motion.div
              className="flex flex-col items-center justify-center gap-2 mt-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              role="status"
              aria-live="polite"
            >
              {connectionError ? (
                // Error state
                <motion.div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: `${colors.coral}20` }}
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                >
                  <svg
                    className="w-4 h-4"
                    fill={colors.coral}
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                  </svg>
                  <span
                    className="text-sm font-light"
                    style={{ color: colors.coral }}
                  >
                    {connectionError}
                  </span>
                </motion.div>
              ) : (
                // Connecting animation
                <>
                  <motion.div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: colors.coral }}
                        animate={prefersReducedMotion ? {} : {
                          scale: [1, 1.3, 1],
                          opacity: [0.3, 0.8, 0.3],
                        }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          delay: i * 0.15,
                        }}
                      />
                    ))}
                  </motion.div>
                  <motion.span
                    className="text-sm font-light"
                    style={{ color: colors.softShadow }}
                    animate={prefersReducedMotion ? {} : { opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    Connexion...
                  </motion.span>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Helper
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
