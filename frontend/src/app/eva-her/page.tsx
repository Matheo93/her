"use client";

import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
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
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Lazy load non-critical components
const MemoryIndicator = dynamic(
  () => import("@/components/MemoryIndicator").then((mod) => mod.MemoryIndicator),
  { ssr: false }
);

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const VISEME_URL = process.env.NEXT_PUBLIC_VISEME_URL || "http://localhost:8003";

// Performance metrics logging (Sprint 108)
const logPerformanceMetric = (metric: string, value: number | string, extra?: Record<string, unknown>) => {
  if (process.env.NODE_ENV === "development") {
    const timestamp = new Date().toISOString().slice(11, 23);
    console.log(`[PERF ${timestamp}] ${metric}: ${value}`, extra ? extra : "");
  }
};

// Bio-data simulation for presence feeling
interface BioData {
  heartRate: number;
  breathPhase: number;
  presence: number;
}

// Loading skeleton for avatar
function AvatarLoadingSkeleton() {
  return (
    <div
      className="w-full h-full rounded-full flex flex-col items-center justify-center gap-3 avatar-skeleton-container"
      style={{ backgroundColor: HER_COLORS.cream }}
      role="status"
      aria-label="Chargement de l'avatar"
    >
      {/* Face silhouette skeleton */}
      <div className="relative">
        {/* Head oval */}
        <div
          className="w-24 h-28 sm:w-32 sm:h-36 rounded-full"
          style={{
            background: `linear-gradient(135deg, ${HER_COLORS.softShadow}30 0%, ${HER_COLORS.softShadow}10 100%)`,
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
        {/* Eyes placeholder */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 flex gap-4">
          <div
            className="w-3 h-2 rounded-full"
            style={{
              backgroundColor: `${HER_COLORS.softShadow}30`,
              animation: "pulse 2s ease-in-out infinite 0.2s",
            }}
          />
          <div
            className="w-3 h-2 rounded-full"
            style={{
              backgroundColor: `${HER_COLORS.softShadow}30`,
              animation: "pulse 2s ease-in-out infinite 0.2s",
            }}
          />
        </div>
        {/* Mouth placeholder */}
        <div
          className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-6 h-1.5 rounded-full"
          style={{
            backgroundColor: `${HER_COLORS.coral}40`,
            animation: "pulse 2s ease-in-out infinite 0.4s",
          }}
        />
      </div>
      {/* Loading text */}
      <span
        className="text-xs font-light"
        style={{ color: HER_COLORS.earth, opacity: 0.5 }}
      >
        Chargement...
      </span>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .avatar-skeleton-container {
          animation: breathe 4s ease-in-out infinite;
        }
        .skeleton-shimmer {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.3) 50%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}

// Dynamic import for avatar (avoid SSR issues)
const RealisticAvatarImage = dynamic(
  () => import("@/components/RealisticAvatarImage").then((mod) => mod.RealisticAvatarImage),
  {
    ssr: false,
    loading: () => <AvatarLoadingSkeleton />,
  }
);

export default function EvaHerPage() {
  // State - minimal, essential only
  const [isPageReady, setIsPageReady] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [evaEmotion, setEvaEmotion] = useState("neutral");
  const [currentText, setCurrentText] = useState("");
  const [inputText, setInputText] = useState("");
  const [isUserTyping, setIsUserTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [visemeWeights, setVisemeWeights] = useState<VisemeWeights>({ sil: 1 });
  const [messageSent, setMessageSent] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [inputMicLevel, setInputMicLevel] = useState(0);
  const [showKeyboardHint, setShowKeyboardHint] = useState(false);
  const [connectionLatency, setConnectionLatency] = useState<number | null>(null);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [audioQueueLength, setAudioQueueLength] = useState(0);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isMuted, setIsMuted] = useState(() => {
    // Load muted preference from localStorage on mount
    if (typeof window !== "undefined") {
      return localStorage.getItem("eva-muted") === "true";
    }
    return false;
  });
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPingTimeRef = useRef<number>(0);
  const inputAnalyzerRef = useRef<AnalyserNode | null>(null);
  const inputAnimationRef = useRef<number | null>(null);
  const messageSentTimeRef = useRef<number>(0); // Track message send time for response latency
  const touchStartYRef = useRef<number>(0);

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

  // Page ready after brief delay for smooth fade-in
  useEffect(() => {
    const timer = setTimeout(() => setIsPageReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Show keyboard hint to new users after 5 seconds of inactivity
  useEffect(() => {
    if (!persistentMemory.isReturningUser && isConnected && !isListening && !isSpeaking) {
      const timer = setTimeout(() => {
        setShowKeyboardHint(true);
        // Auto-hide after 10 seconds
        setTimeout(() => setShowKeyboardHint(false), 10000);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [persistentMemory.isReturningUser, isConnected, isListening, isSpeaking]);

  // Persist mute preference to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("eva-muted", isMuted.toString());
    }
  }, [isMuted]);

  // Toggle mute function
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // Keep muted ref in sync with state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      logPerformanceMetric("network", "online");
    };
    const handleOffline = () => {
      setIsOnline(false);
      setErrorToast("Connexion réseau perdue");
      setTimeout(() => setErrorToast(null), 5000);
      logPerformanceMetric("network", "offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const visemeWsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<{ audio: ArrayBuffer; emotion: string }[]>([]);
  const isPlayingRef = useRef(false);
  const playNextAudioRef = useRef<() => void>(() => {});
  const isMutedRef = useRef(isMuted);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const bioAnimationRef = useRef<number | null>(null);
  const audioContextInitializedRef = useRef(false);

  // Pre-initialize AudioContext on user interaction for lower latency
  const initAudioContext = useCallback(() => {
    if (audioContextInitializedRef.current) return;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      // Resume if suspended (browser policy)
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume();
      }
      audioContextInitializedRef.current = true;
      logPerformanceMetric("audioContext", "initialized", {
        sampleRate: audioContextRef.current.sampleRate,
        state: audioContextRef.current.state,
      });
    }
  }, []);

  // Determine current state for bio-data - memoized
  const currentState = useMemo(() =>
    isSpeaking ? "speaking" : isListening ? "listening" : isThinking ? "thinking" : "idle",
    [isSpeaking, isListening, isThinking]
  );

  // Memoized screen reader status text
  const statusText = useMemo(() =>
    isConnected
      ? isListening
        ? "EVA vous écoute"
        : isSpeaking
          ? "EVA parle"
          : isThinking
            ? "EVA réfléchit"
            : "EVA est prête"
      : "Connexion en cours",
    [isConnected, isListening, isSpeaking, isThinking]
  );

  // Memoized welcome message based on memory
  const welcomeMessage = useMemo(() => {
    if (persistentMemory.isReunion) {
      switch (persistentMemory.reunionType) {
        case "very_long": return "Tu es revenu... enfin";
        case "long": return "Tu m'as manqué...";
        case "medium": return "Je pensais à toi";
        default: return "Te revoilà...";
      }
    }
    return persistentMemory.isReturningUser ? "Rebonjour..." : "Je suis là...";
  }, [persistentMemory.isReunion, persistentMemory.reunionType, persistentMemory.isReturningUser]);

  // Memoized latency color and quality
  const latencyColor = useMemo(() => {
    if (connectionLatency === null) return "#4ade80";
    if (connectionLatency < 100) return "#4ade80"; // green - excellent
    if (connectionLatency < 300) return "#fbbf24"; // yellow - good
    return "#f87171"; // red - poor
  }, [connectionLatency]);

  // Connection quality label for accessibility with signal bars
  const connectionQuality = useMemo(() => {
    if (connectionLatency === null) return { label: "Connecté", bars: 2 };
    if (connectionLatency < 100) return { label: "Excellent", bars: 4 };
    if (connectionLatency < 200) return { label: "Bon", bars: 3 };
    if (connectionLatency < 400) return { label: "Moyen", bars: 2 };
    return { label: "Faible", bars: 1 };
  }, [connectionLatency]);

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

  // Connect to Viseme WebSocket with exponential backoff
  const visemeReconnectRef = useRef(0);
  useEffect(() => {
    let pingInterval: NodeJS.Timeout | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectViseme = () => {
      try {
        const ws = new WebSocket(`${VISEME_URL.replace("http", "ws")}/ws/viseme`);

        ws.onopen = () => {
          visemeReconnectRef.current = 0; // Reset on success
          // Ping to keep alive every 10s
          pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 10000);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "viseme" && data.weights) {
              setVisemeWeights(data.weights);
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = () => {
          // Silent error handling - will trigger close
        };

        ws.onclose = () => {
          if (pingInterval) clearInterval(pingInterval);
          // Exponential backoff with max 30s
          visemeReconnectRef.current++;
          const delay = Math.min(2000 * Math.pow(1.5, visemeReconnectRef.current - 1), 30000);
          reconnectTimeout = setTimeout(connectViseme, delay);
        };

        visemeWsRef.current = ws;
      } catch {
        // Connection failed, retry with backoff
        visemeReconnectRef.current++;
        const delay = Math.min(2000 * Math.pow(1.5, visemeReconnectRef.current - 1), 30000);
        reconnectTimeout = setTimeout(connectViseme, delay);
      }
    };

    connectViseme();
    return () => {
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      visemeWsRef.current?.close();
    };
  }, []);

  // Connect to main WebSocket with improved error handling
  const connectRef = useRef<() => void>(() => {});
  useEffect(() => {
    const connect = () => {
      try {
        const ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws/her`);

        ws.onopen = () => {
          setIsConnected(true);
          setConnectionError(null);
          reconnectAttemptsRef.current = 0;
          logPerformanceMetric("wsConnected", "main", { url: BACKEND_URL });
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

          // Start ping interval to measure latency
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              lastPingTimeRef.current = Date.now();
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 10000);
        };

        ws.onerror = () => {
          setConnectionError("Erreur de connexion");
        };

        ws.onclose = (event) => {
          setIsConnected(false);

          // Clear ping interval
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }

          // Handle different close codes
          if (event.code === 1000) {
            // Normal closure
            setConnectionError(null);
          } else if (event.code === 1006) {
            // Abnormal closure
            setConnectionError("Connexion interrompue");
          }

          // Reconnect with exponential backoff and countdown display
          reconnectAttemptsRef.current++;
          setReconnectAttempt(reconnectAttemptsRef.current);

          if (reconnectAttemptsRef.current <= maxReconnectAttempts) {
            const delay = Math.min(3000 * Math.pow(1.5, reconnectAttemptsRef.current - 1), 15000);
            const delaySeconds = Math.ceil(delay / 1000);

            // Start countdown
            setReconnectCountdown(delaySeconds);
            let remaining = delaySeconds;
            const countdownInterval = setInterval(() => {
              remaining--;
              if (remaining > 0) {
                setReconnectCountdown(remaining);
              } else {
                clearInterval(countdownInterval);
                setReconnectCountdown(null);
              }
            }, 1000);

            setTimeout(() => {
              clearInterval(countdownInterval);
              setReconnectCountdown(null);
              connect();
            }, delay);
          } else {
            setReconnectCountdown(null);
            setConnectionError("Impossible de se connecter. Rafraîchissez la page.");
          }
        };

        ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "pong":
            // Calculate latency from ping
            if (lastPingTimeRef.current > 0) {
              const latency = Date.now() - lastPingTimeRef.current;
              setConnectionLatency(latency);
              logPerformanceMetric("wsLatency", `${latency}ms`);
            }
            break;

          case "her_context":
            setEvaEmotion(data.response_emotion || "neutral");
            break;

          case "speaking_start":
            // Log time to first audio response
            if (messageSentTimeRef.current > 0) {
              const responseTime = Date.now() - messageSentTimeRef.current;
              logPerformanceMetric("timeToSpeech", `${responseTime}ms`);
              messageSentTimeRef.current = 0;
            }
            setIsSpeaking(true);
            setIsThinking(false);
            setIsProcessingAudio(false);
            break;

          case "filler":
            if (data.audio_base64) {
              const audio = base64ToArrayBuffer(data.audio_base64);
              audioQueueRef.current.push({ audio, emotion: "neutral" });
              setAudioQueueLength(audioQueueRef.current.length);
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
              setAudioQueueLength(audioQueueRef.current.length);
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
              setAudioQueueLength(audioQueueRef.current.length);
              playNextAudioRef.current();
            }
            break;

          case "speaking_end":
            setAudioQueueLength(0);
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
              setAudioQueueLength(audioQueueRef.current.length);
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

    connectRef.current = connect;
    connect();
    return () => wsRef.current?.close();
  }, []);

  // Manual reconnect callback
  const handleManualReconnect = useCallback(() => {
    setConnectionError(null);
    reconnectAttemptsRef.current = 0;
    wsRef.current?.close();
    setTimeout(() => connectRef.current(), 100);
  }, []);

  // Pre-decoded audio buffer for gapless playback
  const predecodedBufferRef = useRef<AudioBuffer | null>(null);
  const predecodingPromiseRef = useRef<Promise<AudioBuffer | null> | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const BUFFER_HIGH_WATERMARK = 3; // Start playback when buffer has 3+ chunks
  const BUFFER_LOW_WATERMARK = 1; // Warning when buffer drops to 1

  // Pre-decode next audio chunk for seamless playback
  const predecodeNext = useCallback(async () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      predecodedBufferRef.current = null;
      return;
    }
    const nextItem = audioQueueRef.current[0];
    if (!nextItem) return;
    try {
      predecodedBufferRef.current = await audioContextRef.current.decodeAudioData(
        nextItem.audio.slice(0)
      );
    } catch {
      predecodedBufferRef.current = null;
    }
  }, []);

  // Audio playback with level detection and pre-decoding
  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const { audio: arrayBuffer, emotion } = audioQueueRef.current.shift()!;
    const remainingQueue = audioQueueRef.current.length;
    setAudioQueueLength(remainingQueue);
    setEvaEmotion(emotion);

    // Log audio queue status with watermark info
    const bufferStatus = remainingQueue >= BUFFER_HIGH_WATERMARK ? "healthy" :
                         remainingQueue <= BUFFER_LOW_WATERMARK ? "low" : "ok";
    logPerformanceMetric("audioQueue", remainingQueue, {
      bufferSize: arrayBuffer.byteLength,
      emotion,
      hasPreDecoded: !!predecodedBufferRef.current,
      bufferStatus,
    });

    try {
      // Use pre-initialized context or create one
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
        audioContextInitializedRef.current = true;
      }
      const audioContext = audioContextRef.current;

      // Ensure context is running (may be suspended by browser policy)
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      // Use pre-decoded buffer if available, otherwise decode now
      let audioBuffer: AudioBuffer;
      if (predecodedBufferRef.current) {
        audioBuffer = predecodedBufferRef.current;
        predecodedBufferRef.current = null;
      } else {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      }

      // Start pre-decoding next chunk for gapless playback
      predecodeNext();

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;

      // Create analyzer for audio level
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 32;
      analyzer.smoothingTimeConstant = 0.5;
      analyzerRef.current = analyzer;

      // Create gain node for crossfade
      const gainNode = gainNodeRef.current || audioContext.createGain();
      gainNodeRef.current = gainNode;
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(1, audioContext.currentTime + 0.02); // 20ms fade in

      source.connect(gainNode);
      gainNode.connect(analyzer);

      // Only connect to destination if not muted
      if (!isMutedRef.current) {
        analyzer.connect(audioContext.destination);
      }

      // Schedule fade out before chunk ends
      const fadeDuration = 0.02; // 20ms fade
      const fadeOutTime = Math.max(0, audioBuffer.duration - fadeDuration);
      gainNode.gain.setValueAtTime(1, audioContext.currentTime + fadeOutTime);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + audioBuffer.duration);

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
    } catch (err) {
      logPerformanceMetric("audioError", "playback_failed", { error: String(err) });
      isPlayingRef.current = false;
      setAudioLevel(0);

      // Show error toast only if this is a persistent issue
      const remainingItems = audioQueueRef.current.length;
      if (remainingItems === 0) {
        setErrorToast("Erreur de lecture audio");
        setTimeout(() => setErrorToast(null), 3000);
      }

      if (remainingItems > 0) {
        playNextAudioRef.current();
      } else {
        setIsSpeaking(false);
      }
    }
  }, []);

  useEffect(() => {
    playNextAudioRef.current = playNextAudio;
  }, [playNextAudio]);

  // Voice recording with real-time volume indicator
  const startListening = useCallback(async () => {
    if (isListening || !wsRef.current) return;

    // Haptic feedback for mobile (vibration API)
    if ("vibrate" in navigator) {
      navigator.vibrate(50); // Short vibration on start
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];

      // Setup audio analyzer for real-time volume
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyzer = audioContext.createAnalyser();
      analyzer.fftSize = 32;
      analyzer.smoothingTimeConstant = 0.5;
      source.connect(analyzer);
      inputAnalyzerRef.current = analyzer;

      // Update input mic level animation
      const dataArray = new Uint8Array(analyzer.frequencyBinCount);
      const updateInputLevel = () => {
        if (!inputAnalyzerRef.current) return;
        analyzer.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
        setInputMicLevel(avg);
        inputAnimationRef.current = requestAnimationFrame(updateInputLevel);
      };
      inputAnimationRef.current = requestAnimationFrame(updateInputLevel);

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

      mediaRecorder.onstop = async () => {
        // Clean up analyzer
        if (inputAnimationRef.current) {
          cancelAnimationFrame(inputAnimationRef.current);
        }
        inputAnalyzerRef.current = null;
        setInputMicLevel(0);
        audioContext.close();

        const blob = new Blob(chunks, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        setIsListening(false);

        // Show processing state
        setIsProcessingAudio(true);

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            // Track audio send time for response latency
            messageSentTimeRef.current = Date.now();
            logPerformanceMetric("messageSent", "audio", { size: blob.size });
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
    // Haptic feedback for mobile (double pulse on stop)
    if ("vibrate" in navigator) {
      navigator.vibrate([30, 50, 30]); // Short-pause-short pattern
    }
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

  // Send text message with visual feedback - memoized
  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || !wsRef.current) return;

    // Track message send time for response latency
    messageSentTimeRef.current = Date.now();
    logPerformanceMetric("messageSent", "text", { length: text.length });

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
  }, []);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
      setInputText("");
    }
  }, [inputText, sendMessage]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if not typing in input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Space key for push-to-talk
      if (e.code === "Space" && !e.repeat && isConnected && !isListening) {
        e.preventDefault();
        startListening();
      }

      // Escape to cancel recording or clear input
      if (e.code === "Escape") {
        if (isListening) {
          e.preventDefault();
          stopListening();
          logPerformanceMetric("shortcut", "escape_cancel_recording");
        } else if (inputText) {
          setInputText("");
          logPerformanceMetric("shortcut", "escape_clear_input");
        }
      }

      // M to toggle mute
      if (e.code === "KeyM" && !e.repeat && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleMute();
        logPerformanceMetric("shortcut", "toggle_mute");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Only trigger if not typing in input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Release Space to send
      if (e.code === "Space" && isListening) {
        e.preventDefault();
        stopListening();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isConnected, isListening, inputText, startListening, stopListening, toggleMute]);

  // Touch gestures for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchStartYRef.current - touchEndY;
    const swipeThreshold = 50;

    // Swipe up to show keyboard hints
    if (deltaY > swipeThreshold && !showKeyboardHint) {
      setShowKeyboardHint(true);
      logPerformanceMetric("gesture", "swipe_up_hints");
    }
    // Swipe down to hide keyboard hints
    if (deltaY < -swipeThreshold && showKeyboardHint) {
      setShowKeyboardHint(false);
      logPerformanceMetric("gesture", "swipe_down_hints");
    }
  }, [showKeyboardHint]);

  return (
    <motion.div
      className="fixed inset-0 overflow-hidden flex flex-col items-center justify-center"
      style={{ backgroundColor: colors.warmWhite }}
      initial={{ opacity: 0 }}
      animate={{ opacity: isPageReady ? 1 : 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      role="application"
      aria-label="EVA - Assistant vocal"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={initAudioContext}
      onKeyDown={initAudioContext}
    >
      {/* Skip links for keyboard navigation */}
      <nav className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:top-4 focus-within:left-1/2 focus-within:-translate-x-1/2 focus-within:z-50 focus-within:flex focus-within:gap-2">
        <a
          href="#eva-input"
          className="px-4 py-2 rounded-full text-sm"
          style={{
            backgroundColor: colors.coral,
            color: colors.warmWhite,
          }}
        >
          Aller au champ de saisie
        </a>
        <a
          href="#eva-mic"
          className="px-4 py-2 rounded-full text-sm"
          style={{
            backgroundColor: colors.coral,
            color: colors.warmWhite,
          }}
        >
          Aller au microphone
        </a>
      </nav>

      {/* Error toast notification - enhanced with dismiss button */}
      <AnimatePresence>
        {errorToast && (
          <motion.div
            className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl flex items-center gap-3 shadow-lg backdrop-blur-sm"
            style={{
              backgroundColor: `${colors.coral}F0`,
              color: colors.warmWhite,
              boxShadow: `0 4px 20px ${colors.coral}40`,
            }}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            role="alert"
            aria-live="assertive"
          >
            {/* Warning icon with pulse */}
            <motion.svg
              className="w-5 h-5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 24 24"
              animate={prefersReducedMotion ? {} : { scale: [1, 1.1, 1] }}
              transition={{ duration: 1, repeat: 2 }}
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </motion.svg>
            <span className="text-sm font-medium">{errorToast}</span>
            {/* Dismiss button */}
            <button
              onClick={() => setErrorToast(null)}
              className="ml-1 p-1 rounded-full hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              aria-label="Fermer la notification"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screen reader status announcements */}
      <div
        id="eva-status"
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusText}
      </div>

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
              {/* Presence bar */}
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

        {/* Warmth level indicator - shows connection depth */}
        <AnimatePresence>
          {isConnected && emotionalWarmth.levelNumeric > 0.1 && (
            <motion.div
              className="flex items-center gap-2"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 0.5, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              title={`Chaleur: ${emotionalWarmth.level}`}
            >
              {/* Warmth flame icon */}
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill={colors.coral}
                style={{ opacity: 0.6 + emotionalWarmth.levelNumeric * 0.4 }}
              >
                <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
              </svg>
              {/* Warmth level dots */}
              <div className="flex gap-0.5">
                {[0.2, 0.4, 0.6, 0.8, 1.0].map((threshold, i) => (
                  <motion.div
                    key={i}
                    className="w-1 h-1 rounded-full"
                    style={{
                      backgroundColor: emotionalWarmth.levelNumeric >= threshold
                        ? colors.coral
                        : `${colors.softShadow}40`,
                    }}
                    animate={emotionalWarmth.levelNumeric >= threshold && !prefersReducedMotion ? {
                      scale: [1, 1.2, 1],
                    } : {}}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
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
          className="relative flex items-center gap-2 px-3 py-2 sm:py-1.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 overflow-hidden touch-manipulation"
          style={{
            backgroundColor: `${colors.cream}90`,
            // @ts-expect-error CSS custom property for focus ring
            "--tw-ring-color": colors.coral,
          }}
          whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
          whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
          aria-label={darkMode.isDark ? "Passer en mode clair" : "Passer en mode sombre"}
        >
          {/* Animated icon container with crossfade */}
          <div className="relative w-4 h-4">
            {/* Moon icon */}
            <motion.div
              className="absolute inset-0"
              initial={false}
              animate={{
                opacity: darkMode.isDark ? 1 : 0,
                scale: darkMode.isDark ? 1 : 0.5,
                rotate: darkMode.isDark ? 0 : -90,
              }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <svg className="w-4 h-4" fill={colors.earth} viewBox="0 0 24 24">
                <path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />
              </svg>
            </motion.div>
            {/* Sun icon */}
            <motion.div
              className="absolute inset-0"
              initial={false}
              animate={{
                opacity: darkMode.isDark ? 0 : 1,
                scale: darkMode.isDark ? 0.5 : 1,
                rotate: darkMode.isDark ? 90 : 0,
              }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="5" fill={colors.earth} />
                {/* Sun rays */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
                  <motion.line
                    key={i}
                    x1="12"
                    y1="2"
                    x2="12"
                    y2="4"
                    stroke={colors.earth}
                    strokeWidth="2"
                    strokeLinecap="round"
                    transform={`rotate(${angle} 12 12)`}
                    initial={false}
                    animate={prefersReducedMotion ? {} : { opacity: [0.6, 1, 0.6] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.1,
                    }}
                  />
                ))}
              </svg>
            </motion.div>
          </div>
          <motion.span
            className="text-xs font-light hidden sm:inline"
            style={{ color: colors.earth, opacity: 0.7 }}
            initial={false}
            animate={{ opacity: 0.7 }}
            key={darkMode.isDark ? "dark" : "light"}
          >
            {darkMode.isDark ? "Sombre" : "Clair"}
          </motion.span>
        </motion.button>

        {/* Mute toggle button */}
        <motion.button
          onClick={toggleMute}
          className="flex items-center gap-2 px-3 py-2 sm:py-1.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 touch-manipulation"
          style={{
            backgroundColor: `${colors.cream}90`,
            // @ts-expect-error CSS custom property for focus ring
            "--tw-ring-color": colors.coral,
          }}
          whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
          whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
          aria-label={isMuted ? "Activer le son" : "Couper le son"}
          aria-pressed={isMuted}
        >
          {/* Speaker icon with animated state */}
          <div className="relative w-4 h-4">
            {/* Speaker base */}
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill={colors.earth}>
              <path d="M3 9v6h4l5 5V4L7 9H3z" />
              {/* Sound waves - hidden when muted */}
              {!isMuted && (
                <>
                  <motion.path
                    d="M14 9.5c1.5 1 1.5 4 0 5"
                    stroke={colors.earth}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    fill="none"
                    initial={{ opacity: 0, pathLength: 0 }}
                    animate={{ opacity: 1, pathLength: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                  <motion.path
                    d="M16.5 7c2.5 2 2.5 8 0 10"
                    stroke={colors.earth}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    fill="none"
                    initial={{ opacity: 0, pathLength: 0 }}
                    animate={{ opacity: 1, pathLength: 1 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                  />
                </>
              )}
            </svg>
            {/* Mute slash */}
            <AnimatePresence>
              {isMuted && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <line
                      x1="4"
                      y1="4"
                      x2="20"
                      y2="20"
                      stroke={colors.coral}
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <span
            className="text-xs font-light hidden sm:inline"
            style={{ color: colors.earth, opacity: 0.7 }}
          >
            {isMuted ? "Muet" : "Son"}
          </span>
        </motion.button>

        {/* Voice mode indicator - shows current voice warmth mode */}
        <AnimatePresence>
          {isConnected && voiceWarmth.mode !== "default" && (
            <motion.div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{ backgroundColor: `${colors.cream}80` }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 0.6, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              title={voiceWarmth.description}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill={colors.coral} style={{ opacity: 0.7 }}>
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
              <span className="text-xs font-light capitalize" style={{ color: colors.earth, opacity: 0.6 }}>
                {voiceWarmth.mode === "intimate" ? "intime" :
                 voiceWarmth.mode === "warm" ? "chaleureux" :
                 voiceWarmth.mode === "protective" ? "protecteur" :
                 voiceWarmth.mode === "excited" ? "enthousiaste" : voiceWarmth.mode}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

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

        {/* Network offline indicator */}
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: `${colors.coral}30` }}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              role="status"
              aria-live="polite"
            >
              <svg className="w-3 h-3" fill={colors.coral} viewBox="0 0 24 24">
                <path d="M23.64 7c-.45-.34-4.93-4-11.64-4-1.5 0-2.89.19-4.15.48L18.18 13.8 23.64 7zM1.41 1.58L0 3l2.05 2.05C.94 6.25.42 7.05.36 7c-.37.28-.36.85 0 1.15C1.04 8.72 5.35 12 12 12c1.33 0 2.57-.15 3.72-.38l9.87 9.87 1.41-1.41L1.41 1.58zM3.84 11.98c.38.31.75.59 1.12.87l1.11-1.11c-.38-.23-.73-.48-1.06-.75l-1.17.99z" />
              </svg>
              <span className="text-xs font-light" style={{ color: colors.coral }}>
                Hors ligne
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

      {/* Main content - centered, minimal - optimized for small screens */}
      <div className="relative flex flex-col items-center justify-center flex-1 px-2 sm:px-4">
        {/* Breathing glow around avatar - respects reduced motion */}
        <motion.div
          className="absolute w-56 h-56 xs:w-72 xs:h-72 md:w-96 md:h-96 rounded-full"
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

        {/* Realistic Human Avatar - responsive sizing with error boundary */}
        <div className="avatar w-40 h-40 xs:w-48 xs:h-48 sm:w-64 sm:h-64 md:w-80 md:h-80 relative z-10">
          <ErrorBoundary
            onError={(error) => console.error("Avatar error:", error)}
            fallback={
              <div
                className="w-full h-full rounded-full flex items-center justify-center"
                style={{ backgroundColor: colors.cream }}
              >
                <motion.div
                  className="w-16 h-16 rounded-full"
                  style={{ backgroundColor: colors.coral }}
                  animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
            }
          >
            <RealisticAvatarImage
              visemeWeights={visemeWeights}
              emotion={evaEmotion}
              isSpeaking={isSpeaking}
              isListening={isListening}
              audioLevel={audioLevel}
            />
          </ErrorBoundary>
        </div>

        {/* User typing indicator - Eva is attentively waiting */}
        <AnimatePresence>
          {isUserTyping && inputText.length > 0 && !isSpeaking && !isListening && (
            <motion.div
              className="mt-4 flex items-center gap-2"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 0.6, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: colors.coral }}
                animate={prefersReducedMotion ? {} : { scale: [1, 1.3, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
              <span
                className="text-xs font-light italic"
                style={{ color: colors.earth }}
              >
                Eva t'écoute...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Welcome message - personalized based on memory */}
        <AnimatePresence>
          {showWelcome && !isListening && !isSpeaking && !isThinking && isConnected && !isUserTyping && (
            <motion.p
              className="mt-8 text-base max-w-md text-center px-4"
              style={{ color: colors.earth }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 0.8, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.5, ...HER_SPRINGS.gentle }}
            >
              {welcomeMessage}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Eva's words - elegant, appearing below avatar with smooth entrance */}
        <AnimatePresence mode="wait">
          {currentText && (
            <motion.div
              className="mt-8 max-w-lg text-center px-6"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <motion.p
                className="text-lg sm:text-xl leading-relaxed tracking-wide font-light"
                style={{
                  color: colors.earth,
                  textShadow: `0 1px 2px ${colors.softShadow}20`,
                }}
                initial={{ opacity: 0.7 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                {currentText}
                {/* Typing cursor when still receiving tokens */}
                {isThinking && (
                  <motion.span
                    className="inline-block w-[2px] h-5 ml-1 align-middle rounded-full"
                    style={{ backgroundColor: colors.coral }}
                    animate={{ opacity: [1, 0.3] }}
                    transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Listening indicator - shows when user is speaking */}
        <AnimatePresence>
          {isListening && (
            <motion.div
              className="mt-8 flex items-center gap-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Pulsing ear icon */}
              <motion.div
                animate={prefersReducedMotion ? {} : { scale: [1, 1.1, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <svg
                  className="w-5 h-5"
                  fill={colors.coral}
                  viewBox="0 0 24 24"
                >
                  <path d="M12 1a9 9 0 00-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7a9 9 0 00-9-9z" />
                </svg>
              </motion.div>
              <span
                className="text-sm font-light"
                style={{ color: colors.earth, opacity: 0.7 }}
              >
                Je t&apos;écoute...
              </span>
              {/* Volume bars */}
              <div className="flex gap-0.5 items-end h-4">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1 rounded-full"
                    style={{ backgroundColor: colors.coral }}
                    animate={prefersReducedMotion ? { height: 8 } : {
                      height: [4 + i * 2, 8 + i * 4 + inputMicLevel * 8, 4 + i * 2],
                    }}
                    transition={{
                      duration: 0.3,
                      repeat: Infinity,
                      delay: i * 0.1,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Audio processing indicator - shows after recording, before EVA responds */}
        <AnimatePresence>
          {isProcessingAudio && !isThinking && !isSpeaking && (
            <motion.div
              className="mt-8 flex items-center gap-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Processing waveform animation - enhanced visibility */}
              <div className="flex gap-1 items-center h-5">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <motion.div
                    key={i}
                    className="w-[3px] rounded-full"
                    style={{ backgroundColor: colors.coral }}
                    animate={prefersReducedMotion ? { height: 10 } : {
                      height: [5, 16, 5],
                    }}
                    transition={{
                      duration: 0.5,
                      repeat: Infinity,
                      delay: i * 0.08,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
              <span
                className="text-sm font-light"
                style={{ color: colors.earth, opacity: 0.7 }}
              >
                Traitement...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Thinking indicator - organic, breathing animation with text skeleton */}
        <AnimatePresence>
          {isThinking && !currentText && !isListening && !isProcessingAudio && (
            <motion.div
              className="mt-8 flex flex-col items-center gap-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {/* Text skeleton - shows where text will appear with shimmer effect */}
              <div className="flex flex-col items-center gap-2 max-w-xs">
                {[0.85, 0.6, 0.75].map((width, i) => (
                  <motion.div
                    key={i}
                    className="h-3 rounded-full relative overflow-hidden"
                    style={{
                      width: `${width * 100}%`,
                      minWidth: 80,
                      maxWidth: 200,
                      backgroundColor: `${colors.softShadow}40`,
                    }}
                    initial={{ opacity: 0, scaleX: 0.8 }}
                    animate={{
                      opacity: prefersReducedMotion ? 0.5 : [0.3, 0.6, 0.3],
                      scaleX: 1,
                    }}
                    transition={{
                      opacity: { duration: 1.5, repeat: Infinity, delay: i * 0.2 },
                      scaleX: { duration: 0.3, delay: i * 0.1 },
                    }}
                  >
                    {/* Shimmer overlay */}
                    {!prefersReducedMotion && (
                      <div
                        className="absolute inset-0 skeleton-shimmer"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Breathing circle with subtle glow */}
              <div className="flex items-center gap-3">
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
                      animate={{ scale: [1, 2], opacity: [0.3, 0] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                    />
                  )}
                </motion.div>

                <span
                  className="text-sm font-light"
                  style={{ color: colors.earth, opacity: 0.6 }}
                >
                  Eva réfléchit...
                </span>

                {/* Flowing dots - respects reduced motion */}
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1 h-1 rounded-full"
                      style={{ backgroundColor: colors.coral }}
                      animate={prefersReducedMotion ? { opacity: 0.5 } : {
                        y: [0, -4, 0],
                        opacity: [0.3, 1, 0.3],
                      }}
                      transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        delay: i * 0.15,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Input area - minimal, at the bottom - optimized for mobile with safe area */}
      <div className="w-full max-w-lg px-3 sm:px-6 pb-safe sm:pb-8" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Text input - with accessibility */}
          <div className="relative flex-1">
            <input
              type="text"
              value={inputText}
              id="eva-input"
              onChange={(e) => {
                setInputText(e.target.value.slice(0, 500));
                // Detect typing activity
                setIsUserTyping(true);
                if (typingTimeoutRef.current) {
                  clearTimeout(typingTimeoutRef.current);
                }
                typingTimeoutRef.current = setTimeout(() => {
                  setIsUserTyping(false);
                }, 1500);
              }}
              onKeyDown={handleKeyPress}
              placeholder="Dis quelque chose..."
              aria-label="Message pour EVA"
              aria-describedby="eva-status"
              autoComplete="off"
              maxLength={500}
              className="w-full px-4 sm:px-5 py-2.5 sm:py-3 rounded-full border-2 border-transparent outline-none text-sm sm:text-base focus:ring-2 focus:ring-offset-1 transition-all duration-200"
              style={{
                backgroundColor: colors.cream,
                color: colors.earth,
                boxShadow: `inset 0 2px 4px ${colors.softShadow}15, 0 1px 3px ${colors.softShadow}10`,
                // @ts-expect-error CSS custom property for focus ring
                "--tw-ring-color": colors.coral,
              }}
            />
            {/* Send button - appears when text is entered */}
            <AnimatePresence>
              {inputText.length > 0 && !messageSent && (
                <motion.button
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2"
                  style={{
                    backgroundColor: inputText.trim() ? colors.coral : `${colors.softShadow}30`,
                    // @ts-expect-error CSS custom property for focus ring
                    "--tw-ring-color": colors.coral,
                  }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={inputText.trim() ? { scale: 1.1 } : {}}
                  whileTap={inputText.trim() ? { scale: 0.95 } : {}}
                  onClick={() => {
                    if (inputText.trim()) {
                      sendMessage(inputText);
                      setInputText("");
                      setIsUserTyping(false);
                    }
                  }}
                  disabled={!inputText.trim()}
                  aria-label="Envoyer le message"
                >
                  <svg
                    className="w-4 h-4"
                    fill={inputText.trim() ? colors.warmWhite : colors.earth}
                    viewBox="0 0 24 24"
                    style={{ transform: "rotate(-45deg)", marginLeft: 2 }}
                  >
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </motion.button>
              )}
            </AnimatePresence>
            {/* Character count - show above send button */}
            <AnimatePresence>
              {inputText.length > 200 && !messageSent && (
                <motion.div
                  className="absolute right-12 top-1/2 -translate-y-1/2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.4 }}
                  exit={{ opacity: 0 }}
                >
                  <span
                    className="text-xs tabular-nums"
                    style={{
                      color: inputText.length > 450 ? colors.coral : colors.earth,
                    }}
                  >
                    {inputText.length}/500
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
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
            {statusText}
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
              id="eva-mic"
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              onTouchStart={(e) => {
                e.preventDefault(); // Prevent double-tap zoom
                startListening();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                stopListening();
              }}
              disabled={!isConnected}
              aria-label={isListening ? "En cours d'écoute, relâcher pour envoyer" : "Maintenir pour parler à Eva"}
              aria-pressed={isListening}
              aria-describedby="mic-instructions"
              className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent select-none touch-manipulation"
              style={{
                backgroundColor: isListening ? colors.coral : colors.cream,
                boxShadow: isListening
                  ? `0 0 30px ${colors.coral}40, inset 0 0 15px ${colors.warmWhite}30`
                  : `0 4px 12px ${colors.softShadow}30`,
                // @ts-expect-error CSS custom property for focus ring
                "--tw-ring-color": colors.coral,
                WebkitTapHighlightColor: "transparent", // Remove iOS tap highlight
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
                {isListening && !prefersReducedMotion && (
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

              {/* Input level pulse - responds to mic input */}
              {isListening && inputMicLevel > 0.1 && (
                <motion.div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    backgroundColor: colors.coral,
                    opacity: inputMicLevel * 0.3,
                  }}
                  animate={{
                    scale: 1 + inputMicLevel * 0.15,
                  }}
                  transition={{ duration: 0.05 }}
                />
              )}

              {/* Real-time mic volume indicator - sound wave bars */}
              <AnimatePresence>
                {isListening && (
                  <motion.div
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                  >
                    <div
                      className="flex gap-[2px] items-center h-4"
                      role="meter"
                      aria-label="Niveau du microphone"
                      aria-valuenow={Math.round(inputMicLevel * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      {[0.15, 0.3, 0.5, 0.7, 0.5, 0.3, 0.15].map((baseHeight, i) => {
                        const isActive = inputMicLevel > 0.05;
                        const dynamicHeight = isActive
                          ? Math.max(baseHeight, inputMicLevel * (0.5 + Math.sin(Date.now() / 100 + i) * 0.3))
                          : baseHeight * 0.3;
                        return (
                          <motion.div
                            key={i}
                            className="w-[3px] rounded-full"
                            style={{
                              backgroundColor: isActive ? colors.coral : `${colors.coral}50`,
                            }}
                            animate={prefersReducedMotion ? { height: `${dynamicHeight * 16}px` } : {
                              height: isActive
                                ? [`${baseHeight * 8}px`, `${dynamicHeight * 16}px`, `${baseHeight * 8}px`]
                                : `${baseHeight * 5}px`,
                            }}
                            transition={{
                              duration: isActive ? 0.15 : 0.3,
                              repeat: isActive && !prefersReducedMotion ? Infinity : 0,
                              delay: i * 0.05,
                            }}
                          />
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>

        {/* Hidden instructions for screen readers */}
        <p id="mic-instructions" className="sr-only">
          Maintenez le bouton ou appuyez sur Espace pour parler. Relâchez pour envoyer votre message.
        </p>

        {/* Keyboard shortcut hints - enhanced styling */}
        <AnimatePresence>
          {showKeyboardHint && !isListening && !isSpeaking && (
            <motion.div
              className="flex flex-wrap items-center justify-center gap-4 mt-3 px-4 py-2 rounded-full"
              role="region"
              aria-label="Raccourcis clavier"
              style={{ backgroundColor: `${colors.cream}40` }}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center gap-1.5">
                <kbd
                  className="px-2.5 py-1 text-xs rounded-md font-medium"
                  style={{
                    backgroundColor: colors.cream,
                    color: colors.earth,
                    boxShadow: `0 1px 2px ${colors.softShadow}30, inset 0 -1px 0 ${colors.softShadow}20`,
                  }}
                >
                  Espace
                </kbd>
                <span
                  className="text-xs font-light"
                  style={{ color: colors.earth, opacity: 0.7 }}
                >
                  parler
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <kbd
                  className="px-2 py-1 text-xs rounded-md font-medium"
                  style={{
                    backgroundColor: colors.cream,
                    color: colors.earth,
                    boxShadow: `0 1px 2px ${colors.softShadow}30, inset 0 -1px 0 ${colors.softShadow}20`,
                  }}
                >
                  Esc
                </kbd>
                <span
                  className="text-xs font-light"
                  style={{ color: colors.earth, opacity: 0.7 }}
                >
                  annuler
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <kbd
                  className="px-2 py-1 text-xs rounded-md font-medium"
                  style={{
                    backgroundColor: colors.cream,
                    color: colors.earth,
                    boxShadow: `0 1px 2px ${colors.softShadow}30, inset 0 -1px 0 ${colors.softShadow}20`,
                  }}
                >
                  ⌘M
                </kbd>
                <span
                  className="text-xs font-light"
                  style={{ color: colors.earth, opacity: 0.7 }}
                >
                  muet
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Latency indicator when connected */}
        <AnimatePresence>
          {isConnected && connectionLatency !== null && (
            <motion.div
              className="flex items-center justify-center gap-1.5 mt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              role="status"
              aria-label={`Connexion ${connectionQuality.label}, latence ${connectionLatency} millisecondes`}
            >
              {/* Signal strength bars */}
              <div className="flex gap-[1px] items-end h-3" aria-hidden="true">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className="w-[2px] rounded-sm transition-colors"
                    style={{
                      height: level * 2 + 2,
                      backgroundColor: level <= connectionQuality.bars
                        ? latencyColor
                        : `${colors.softShadow}30`,
                    }}
                  />
                ))}
              </div>
              <span
                className="text-xs font-light tabular-nums"
                style={{ color: colors.earth, opacity: 0.5 }}
                aria-hidden="true"
              >
                {connectionLatency}ms
              </span>
              {/* Audio buffer indicator with watermark status */}
              {audioQueueLength > 0 && (
                <motion.div
                  className="flex items-center gap-1 ml-2"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 0.5, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  {/* Buffer bars visualization */}
                  <div className="flex gap-px items-end h-3">
                    {[1, 2, 3].map((level) => (
                      <motion.div
                        key={level}
                        className="w-0.5 rounded-sm"
                        style={{
                          height: level * 3 + 3,
                          backgroundColor: audioQueueLength >= level
                            ? audioQueueLength >= BUFFER_HIGH_WATERMARK
                              ? colors.success || "#7A9E7E"
                              : audioQueueLength <= BUFFER_LOW_WATERMARK
                                ? colors.coral
                                : colors.earth
                            : `${colors.softShadow}50`,
                        }}
                        animate={audioQueueLength >= level && !prefersReducedMotion ? {
                          opacity: [0.6, 1, 0.6],
                        } : {}}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                    ))}
                  </div>
                  <span
                    className="text-xs font-light tabular-nums"
                    style={{
                      color: audioQueueLength >= BUFFER_HIGH_WATERMARK
                        ? colors.success || "#7A9E7E"
                        : audioQueueLength <= BUFFER_LOW_WATERMARK
                          ? colors.coral
                          : colors.earth,
                      opacity: 0.5,
                    }}
                  >
                    {audioQueueLength}
                  </span>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

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
                // Error state with retry button
                <motion.div
                  className="flex flex-col items-center gap-2"
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                >
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                    style={{ backgroundColor: `${colors.coral}20` }}
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
                  </div>
                  <motion.button
                    onClick={handleManualReconnect}
                    className="px-4 py-1.5 rounded-full text-sm font-light focus:outline-none focus:ring-2"
                    style={{
                      backgroundColor: colors.coral,
                      color: colors.warmWhite,
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Réessayer
                  </motion.button>
                </motion.div>
              ) : (
                // Connecting animation - progressive wave
                <motion.div
                  className="flex flex-col items-center gap-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="flex items-center gap-0.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1 rounded-full"
                        style={{ backgroundColor: colors.coral }}
                        animate={prefersReducedMotion ? { height: 8 } : {
                          height: [4, 14, 4],
                          opacity: [0.4, 1, 0.4],
                        }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          delay: i * 0.1,
                          ease: "easeInOut",
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <motion.span
                      className="text-sm font-light"
                      style={{ color: colors.earth, opacity: 0.7 }}
                      animate={prefersReducedMotion ? {} : { opacity: [0.5, 0.8, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      {reconnectCountdown !== null
                        ? `Reconnexion dans ${reconnectCountdown}s...`
                        : "Connexion..."
                      }
                    </motion.span>
                    <span
                      className="text-xs font-light"
                      style={{ color: colors.softShadow }}
                    >
                      {reconnectAttempt > 0
                        ? `Tentative ${reconnectAttempt}/5`
                        : "Eva se prépare"
                      }
                    </span>
                    {/* Progress bar for reconnect attempts */}
                    {reconnectAttempt > 0 && (
                      <div
                        className="w-20 h-1 rounded-full mt-1 overflow-hidden"
                        style={{ backgroundColor: `${colors.softShadow}30` }}
                      >
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: colors.coral }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(reconnectAttempt / 5) * 100}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
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
