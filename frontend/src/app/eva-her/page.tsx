"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import type { VisemeWeights } from "@/components/RealisticAvatar3D";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";
import { usePersistentMemory } from "@/hooks/usePersistentMemory";
import { useEmotionalWarmth } from "@/hooks/useEmotionalWarmth";
import { useVoiceWarmth } from "@/hooks/useVoiceWarmth";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const VISEME_URL = process.env.NEXT_PUBLIC_VISEME_URL || "http://localhost:8003";

// Bio-data simulation for presence feeling
interface BioData {
  heartRate: number;
  breathPhase: number;
  presence: number;
}

// Dynamic import for 3D avatar (avoid SSR issues with Three.js)
const RealisticAvatar3D = dynamic(
  () => import("@/components/RealisticAvatar3D").then((mod) => mod.RealisticAvatar3D),
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

  // HER Feature: Sync warmth to persistent memory every 30s
  useEffect(() => {
    const saveInterval = setInterval(() => {
      if (emotionalWarmth.levelNumeric > 0) {
        persistentMemory.save({
          warmthBaseline: emotionalWarmth.levelNumeric,
          familiarityScore: emotionalWarmth.connection?.familiarityScore || 0.5,
          trustLevel: emotionalWarmth.connection?.trustLevel || 0.5,
        });
      }
    }, 30000);

    // Save on unmount too
    return () => {
      clearInterval(saveInterval);
      if (emotionalWarmth.levelNumeric > 0) {
        persistentMemory.save({
          warmthBaseline: emotionalWarmth.levelNumeric,
          familiarityScore: emotionalWarmth.connection?.familiarityScore || 0.5,
          trustLevel: emotionalWarmth.connection?.trustLevel || 0.5,
        });
      }
    };
  }, [emotionalWarmth.levelNumeric, emotionalWarmth.connection, persistentMemory]);

  // HER Feature: Track shared moments (emotional peaks)
  const lastEmotionRef = useRef(evaEmotion);
  useEffect(() => {
    // Detect emotional peaks - joy, tenderness, excitement
    const peakEmotions = ["joy", "tenderness", "excitement", "love"];
    const vulnerabilityEmotions = ["sadness", "fear", "empathy"];
    const comfortEmotions = ["calm", "peaceful", "soothed"];

    if (evaEmotion !== lastEmotionRef.current) {
      const intensity = emotionalWarmth.levelNumeric;

      if (peakEmotions.includes(evaEmotion) && intensity > 0.5) {
        persistentMemory.addSharedMoment("peak", intensity);
      } else if (vulnerabilityEmotions.includes(evaEmotion) && intensity > 0.3) {
        persistentMemory.addSharedMoment("vulnerability", intensity);
      } else if (comfortEmotions.includes(evaEmotion) && intensity > 0.4) {
        persistentMemory.addSharedMoment("comfort", intensity);
      }

      lastEmotionRef.current = evaEmotion;
    }
  }, [evaEmotion, emotionalWarmth.levelNumeric, persistentMemory]);

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

  // Connect to main WebSocket
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws/her`);

      ws.onopen = () => {
        setIsConnected(true);
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

      ws.onclose = () => {
        setIsConnected(false);
        setTimeout(connect, 3000);
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

  // Send text message
  const sendMessage = (text: string) => {
    if (!text.trim() || !wsRef.current) return;

    setCurrentText("");
    wsRef.current.send(JSON.stringify({
      type: "message",
      content: text,
      user_id: "eva_her_user"
    }));
    setIsThinking(true);
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
      className="fixed inset-0 overflow-hidden flex flex-col items-center justify-center"
      style={{ backgroundColor: HER_COLORS.warmWhite }}
    >
      {/* Living ambient background */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{
          background: [
            `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
            `radial-gradient(ellipse at 50% 28%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 72%)`,
            `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
          ],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* JARVIS Feature: Bio-Data indicator */}
      <div className="absolute top-6 left-6 flex flex-col gap-2">
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
                animate={{ scale: [1, 1.05, 1] }}
                transition={{
                  duration: 60 / bioData.heartRate,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill={HER_COLORS.coral}
                  style={{ opacity: 0.7 }}
                >
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                <span
                  className="text-xs font-light tabular-nums"
                  style={{ color: HER_COLORS.earth, opacity: 0.5 }}
                >
                  {bioData.heartRate}
                </span>
              </motion.div>
              <div
                className="w-16 h-1 rounded-full overflow-hidden"
                style={{ backgroundColor: `${HER_COLORS.softShadow}40` }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: HER_COLORS.coral }}
                  animate={{ width: `${bioData.presence * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main content - centered, minimal */}
      <div className="relative flex flex-col items-center justify-center flex-1 px-4">
        {/* Breathing glow around avatar */}
        <motion.div
          className="absolute w-72 h-72 md:w-96 md:h-96 rounded-full"
          style={{
            background: `radial-gradient(circle, ${HER_COLORS.coral}15 0%, transparent 70%)`,
          }}
          animate={{
            scale: [1, 1 + bioData.breathPhase * 0.06, 1],
            opacity: [0.4, 0.6, 0.4],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* 3D Realistic Avatar */}
        <div className="w-64 h-64 md:w-80 md:h-80 relative z-10">
          <RealisticAvatar3D
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
              style={{ color: HER_COLORS.earth }}
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
                style={{ color: HER_COLORS.earth }}
              >
                {currentText}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Thinking indicator - organic, coral colored */}
        <AnimatePresence>
          {isThinking && !currentText && (
            <motion.div
              className="mt-8 flex gap-1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: HER_COLORS.coral }}
                  animate={{
                    opacity: [0.3, 0.8, 0.3],
                    y: [0, -3, 0],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input area - minimal, at the bottom */}
      <div className="w-full max-w-lg px-6 pb-8">
        <div className="flex items-center gap-3">
          {/* Text input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Dis quelque chose..."
            className="flex-1 px-5 py-3 rounded-full border-0 outline-none text-base"
            style={{
              backgroundColor: HER_COLORS.cream,
              color: HER_COLORS.earth,
              boxShadow: `inset 0 2px 4px ${HER_COLORS.softShadow}20`,
            }}
          />

          {/* Microphone button - with breathing ambient ring */}
          <div className="relative">
            <motion.div
              className="absolute -inset-2 rounded-full"
              style={{
                background: `radial-gradient(circle, ${HER_COLORS.coral}15 0%, transparent 70%)`,
              }}
              animate={{
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
              className="relative w-12 h-12 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: isListening ? HER_COLORS.coral : HER_COLORS.cream,
                boxShadow: isListening
                  ? `0 0 30px ${HER_COLORS.coral}40, inset 0 0 15px ${HER_COLORS.warmWhite}30`
                  : `0 4px 12px ${HER_COLORS.softShadow}30`,
              }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              animate={
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
                stroke={isListening ? HER_COLORS.warmWhite : HER_COLORS.earth}
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
                        style={{ border: `1px solid ${HER_COLORS.coral}` }}
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

        {/* Connection status - minimal, only when disconnected */}
        <AnimatePresence>
          {!isConnected && (
            <motion.p
              className="text-center text-sm mt-3 font-light"
              style={{ color: HER_COLORS.softShadow }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
            >
              Connexion...
            </motion.p>
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
