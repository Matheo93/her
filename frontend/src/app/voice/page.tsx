"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import type { VisemeWeights } from "@/components/RealisticAvatar3D";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";
import { MemoryParticles, type MemoryTrace } from "@/components/MemoryParticles";
import { InnerMonologue } from "@/components/InnerMonologue";
import { usePresenceSound } from "@/hooks/usePresenceSound";

// Haptic feedback for iOS - subtle, intimate
const triggerHaptic = (style: "light" | "medium" | "heavy" = "light") => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    const duration = style === "light" ? 10 : style === "medium" ? 20 : 30;
    navigator.vibrate(duration);
  }
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const VISEME_URL = process.env.NEXT_PUBLIC_VISEME_URL || "http://localhost:8003";

// Dynamic import for 3D avatar (avoid SSR issues with Three.js)
const RealisticAvatar3D = dynamic(
  () => import("@/components/RealisticAvatar3D").then((mod) => mod.RealisticAvatar3D),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full h-full rounded-full flex items-center justify-center"
        style={{ backgroundColor: HER_COLORS.cream }}
      >
        <motion.div
          className="w-8 h-8 rounded-full"
          style={{ backgroundColor: HER_COLORS.coral }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    ),
  }
);

type ConversationState = "idle" | "listening" | "thinking" | "speaking";

// Bio-data simulation for presence feeling
interface BioData {
  heartRate: number; // Simulated BPM
  breathPhase: number; // 0-1 breathing cycle
  presence: number; // 0-1 how "present" EVA feels
}

export default function VoiceFirstPage() {
  // State
  const [state, setState] = useState<ConversationState>("idle");
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [visemeWeights, setVisemeWeights] = useState<VisemeWeights>({ sil: 1 });
  const [audioLevel, setAudioLevel] = useState(0);
  const [inputAudioLevel, setInputAudioLevel] = useState(0); // User's mic level
  const [evaEmotion, setEvaEmotion] = useState("neutral");

  // JARVIS Feature: Bio-data for presence feeling
  const [bioData, setBioData] = useState<BioData>({
    heartRate: 72,
    breathPhase: 0,
    presence: 0.8,
  });

  // JARVIS Feature: Proactive messages from EVA
  const [proactiveMessage, setProactiveMessage] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);

  // Wake-up animation: EVA "awakens" when first connecting
  const [justAwoke, setJustAwoke] = useState(false);

  // Conversation tracking for fatigue simulation
  const [conversationStartTime] = useState<number>(() => Date.now());

  // SPRINT 12: Memory traces - visual representation of conversation moments
  const [memoryTraces, setMemoryTraces] = useState<MemoryTrace[]>([]);

  // SPRINT 12: Presence sound enabled state
  const [presenceSoundEnabled, setPresenceSoundEnabled] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const visemeWsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const playTTSRef = useRef<() => void>(() => {});
  const startListeningRef = useRef<() => void>(() => {});
  const bioAnimationRef = useRef<number | null>(null);

  // Track user's speaking energy for emotional mirroring
  const userEnergyRef = useRef(0);

  // JARVIS Feature: Bio-data animation for presence with EMOTIONAL MIRRORING
  useEffect(() => {
    let startTime = Date.now();

    const animateBio = () => {
      const elapsed = (Date.now() - startTime) / 1000;

      // Breathing cycle: 4 seconds in, 4 seconds out
      const breathPhase = (Math.sin(elapsed * Math.PI / 4) + 1) / 2;

      // EMOTIONAL MIRRORING: EVA's heartrate responds to user's energy
      // When user speaks loudly/energetically, EVA's heart beats faster (attunement)
      const userEnergy = userEnergyRef.current;
      const mirroredHRBoost = userEnergy * 10; // Up to +10 BPM when user is energetic

      // Heart rate varies based on state AND user's energy
      const baseHR = state === "listening" ? 78 + mirroredHRBoost : state === "speaking" ? 75 : 72;
      const hrVariation = Math.sin(elapsed * 0.5) * 3;

      // Presence increases when interacting, MORE when user is engaged
      const engagementBoost = userEnergy * 0.1; // Up to +0.1 presence from user energy
      const targetPresence = state === "idle"
        ? 0.7
        : state === "listening"
          ? Math.min(1, 0.95 + engagementBoost)
          : 0.9;

      setBioData((prev) => ({
        heartRate: Math.round(baseHR + hrVariation),
        breathPhase,
        presence: prev.presence + (targetPresence - prev.presence) * 0.05,
      }));

      // Decay user energy over time (returns to baseline)
      userEnergyRef.current = Math.max(0, userEnergyRef.current - 0.01);

      bioAnimationRef.current = requestAnimationFrame(animateBio);
    };

    bioAnimationRef.current = requestAnimationFrame(animateBio);
    return () => {
      if (bioAnimationRef.current) cancelAnimationFrame(bioAnimationRef.current);
    };
  }, [state]);

  // Welcome message disappears after first interaction
  useEffect(() => {
    if (state !== "idle") {
      setShowWelcome(false);
    }
  }, [state]);

  // Connect to Viseme WebSocket for lip-sync
  useEffect(() => {
    const connectViseme = () => {
      try {
        const ws = new WebSocket(`${VISEME_URL.replace("http", "ws")}/ws/viseme`);

        ws.onopen = () => {
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
            // Ignore parse errors
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

  // WebSocket connection to main backend
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws/chat`);

      ws.onopen = () => {
        setIsConnected(true);
        // Trigger wake-up animation
        setJustAwoke(true);
        setTimeout(() => setJustAwoke(false), 2000); // Fade after 2 seconds
      };

      ws.onclose = () => {
        setIsConnected(false);
        setTimeout(connect, 3000);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "token") {
          setResponse((prev) => prev + data.content);
        } else if (data.type === "end") {
          playTTSRef.current();
        } else if (data.type === "emotion") {
          setEvaEmotion(data.emotion || "neutral");
        }
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  // Play TTS with audio level detection
  const playTTS = useCallback(async () => {
    setState("speaking");

    try {
      const textToSpeak = response;
      if (!textToSpeak) {
        setState("idle");
        return;
      }

      const res = await fetch(`${BACKEND_URL}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: response }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();

        // Send to viseme service
        if (visemeWsRef.current?.readyState === WebSocket.OPEN) {
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce(
              (data, byte) => data + String.fromCharCode(byte),
              ""
            )
          );
          visemeWsRef.current.send(
            JSON.stringify({
              type: "audio_wav",
              data: base64,
            })
          );
        }

        // Play audio with level analysis
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }
        const audioContext = audioContextRef.current;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        const analyzer = audioContext.createAnalyser();
        analyzer.fftSize = 32;
        analyzer.smoothingTimeConstant = 0.5;
        analyzerRef.current = analyzer;

        source.connect(analyzer);
        analyzer.connect(audioContext.destination);

        const dataArray = new Uint8Array(analyzer.frequencyBinCount);
        let isPlaying = true;

        const updateLevel = () => {
          if (!isPlaying) return;
          analyzer.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
          setAudioLevel(avg);
          requestAnimationFrame(updateLevel);
        };

        source.onended = () => {
          isPlaying = false;
          setAudioLevel(0);
          setVisemeWeights({ sil: 1 });
          setResponse("");
          setState("idle");
        };

        source.start(0);
        updateLevel();
      }
    } catch (err) {
      console.error("TTS error:", err);
      setState("idle");
    }
  }, [response]);

  useEffect(() => {
    playTTSRef.current = playTTS;
  }, [playTTS]);

  // Start listening - Voice First approach
  const startListening = useCallback(async () => {
    if (state === "listening") return;

    setState("listening");
    setTranscript("");
    setResponse("");
    setEvaEmotion("listening");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });

        // STT
        const formData = new FormData();
        formData.append("file", blob, "audio.webm");

        try {
          setState("thinking");
          setEvaEmotion("curiosity");
          const res = await fetch(`${BACKEND_URL}/stt`, {
            method: "POST",
            body: formData,
          });
          const data = await res.json();

          if (data.text && data.text !== "[STT non disponible]") {
            setTranscript(data.text);

            // Send to LLM
            if (wsRef.current) {
              wsRef.current.send(
                JSON.stringify({
                  type: "message",
                  content: data.text,
                })
              );
            }
          } else {
            setState("idle");
            setEvaEmotion("neutral");
          }
        } catch (err) {
          console.error("STT error:", err);
          setState("idle");
          setEvaEmotion("neutral");
        }
      };

      mediaRecorder.start();

      // Analyze input audio level for surprise reactions
      const inputAudioContext = new AudioContext();
      const inputAnalyzer = inputAudioContext.createAnalyser();
      inputAnalyzer.fftSize = 32;
      const inputSource = inputAudioContext.createMediaStreamSource(stream);
      inputSource.connect(inputAnalyzer);
      const inputData = new Uint8Array(inputAnalyzer.frequencyBinCount);

      let isRecording = true;
      const updateInputLevel = () => {
        if (!isRecording) return;
        inputAnalyzer.getByteFrequencyData(inputData);
        const avg = inputData.reduce((a, b) => a + b, 0) / inputData.length / 255;
        setInputAudioLevel(avg);

        // EMOTIONAL MIRRORING: Track user's speaking energy
        // Higher audio levels = more energetic speaking = EVA mirrors this
        if (avg > 0.2) {
          userEnergyRef.current = Math.min(1, userEnergyRef.current + avg * 0.1);
        }

        requestAnimationFrame(updateInputLevel);
      };
      updateInputLevel();

      // Auto-stop after 5 seconds
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          isRecording = false;
          setInputAudioLevel(0);
          mediaRecorder.stop();
          stream.getTracks().forEach((t) => t.stop());
          inputAudioContext.close();
        }
      }, 5000);
    } catch (err) {
      console.error("Mic error:", err);
      setState("idle");
    }
  }, [state]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
  }, []);

  // Map state to avatar emotion
  const getDisplayEmotion = () => {
    if (state === "listening") return "listening";
    if (state === "thinking") return "curiosity";
    if (state === "speaking") return evaEmotion;
    return "neutral";
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden flex flex-col items-center justify-center touch-none select-none"
      style={{
        backgroundColor: HER_COLORS.warmWhite,
        // Safe area insets for notched devices (iPhone X+, etc.)
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Living ambient background - breathes with EVA */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{
          background: [
            `radial-gradient(ellipse at 50% 40%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
            `radial-gradient(ellipse at 50% 38%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 72%)`,
            `radial-gradient(ellipse at 50% 40%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
          ],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* JARVIS Feature: Bio-Data - subtle presence indicator (hidden on small mobile) */}
      <div className="absolute top-4 left-4 md:top-6 md:left-6 flex flex-col gap-2">
        <AnimatePresence>
          {isConnected && (
            <motion.div
              className="flex items-center gap-2 md:gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 0.6, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {/* Heartbeat indicator - just visual on mobile */}
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
                  className="w-3 h-3 md:w-4 md:h-4"
                  viewBox="0 0 24 24"
                  fill={HER_COLORS.coral}
                  style={{ opacity: 0.7 }}
                >
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                {/* Hide numeric BPM on mobile - just the visual heartbeat */}
                <span
                  className="hidden md:inline text-xs font-light tabular-nums"
                  style={{ color: HER_COLORS.earth, opacity: 0.5 }}
                >
                  {bioData.heartRate}
                </span>
              </motion.div>

              {/* Presence bar - smaller on mobile */}
              <div
                className="w-10 md:w-16 h-0.5 md:h-1 rounded-full overflow-hidden"
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

      {/* Connection indicator - minimal, only when disconnected */}
      <AnimatePresence>
        {!isConnected && (
          <motion.div
            className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full"
            style={{ backgroundColor: HER_COLORS.cream, color: HER_COLORS.earth }}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <span className="text-sm">Connexion...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className="relative flex flex-col items-center justify-center flex-1 w-full">
        {/* Breathing glow around avatar */}
        <motion.div
          className="absolute w-56 h-56 md:w-72 md:h-72 rounded-full"
          style={{
            background: `radial-gradient(circle, ${HER_COLORS.coral}20 0%, transparent 70%)`,
          }}
          animate={{
            scale: [1, 1 + bioData.breathPhase * 0.08, 1],
            opacity: [0.4, 0.6, 0.4],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Wake-up glow effect - EVA awakening */}
        <AnimatePresence>
          {justAwoke && (
            <motion.div
              className="absolute w-56 h-56 md:w-72 md:h-72 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${HER_COLORS.coral}50 0%, ${HER_COLORS.coral}20 30%, transparent 70%)`,
              }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1.2, opacity: [0, 0.8, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>

        {/* 3D Avatar */}
        <div className="w-48 h-48 md:w-64 md:h-64 relative z-10">
          <RealisticAvatar3D
            visemeWeights={visemeWeights}
            emotion={getDisplayEmotion()}
            isSpeaking={state === "speaking"}
            isListening={state === "listening"}
            audioLevel={audioLevel}
            conversationStartTime={conversationStartTime}
            inputAudioLevel={inputAudioLevel}
          />
        </div>

        {/* JARVIS Feature: Welcome message (proactive, delayed for natural feel) */}
        <AnimatePresence>
          {showWelcome && state === "idle" && isConnected && (
            <motion.div
              className="mt-8 text-center px-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 1.2, ...HER_SPRINGS.gentle }}
            >
              <motion.p
                className="text-lg font-light"
                style={{ color: HER_COLORS.earth }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.9 }}
                transition={{ delay: 1.5, duration: 0.8 }}
              >
                Je suis là...
              </motion.p>
              <motion.p
                className="text-sm mt-2 max-w-xs mx-auto"
                style={{ color: HER_COLORS.softShadow }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                transition={{ delay: 2.2, duration: 0.8 }}
              >
                Parle-moi
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transcript - what user said */}
        <AnimatePresence mode="wait">
          {transcript && state !== "speaking" && (
            <motion.p
              className="mt-6 text-sm max-w-md text-center px-4 italic"
              style={{ color: HER_COLORS.softShadow }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 0.7, y: 0 }}
              exit={{ opacity: 0 }}
            >
              &ldquo;{transcript}&rdquo;
            </motion.p>
          )}
        </AnimatePresence>

        {/* Eva's response */}
        <AnimatePresence mode="wait">
          {response && (
            <motion.div
              className="mt-6 max-w-md text-center px-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <p className="text-lg leading-relaxed" style={{ color: HER_COLORS.earth }}>
                {response}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Thinking indicator - organic, not mechanical */}
        <AnimatePresence>
          {state === "thinking" && !response && (
            <motion.div
              className="mt-6 flex gap-1.5"
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

        {/* Proactive message from EVA */}
        <AnimatePresence>
          {proactiveMessage && (
            <motion.div
              className="mt-6 max-w-md text-center px-4"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={HER_SPRINGS.gentle}
            >
              <p
                className="text-sm leading-relaxed"
                style={{ color: HER_COLORS.earth, opacity: 0.8 }}
              >
                {proactiveMessage}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* VOICE FIRST: Giant microphone button - the main interface */}
      <div className="pb-8 md:pb-12 flex flex-col items-center">
        {/* Ambient ring that breathes */}
        <div className="relative">
          <motion.div
            className="absolute -inset-4 rounded-full"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral}15 0%, transparent 70%)`,
            }}
            animate={{
              scale: [1, 1.1, 1],
              opacity: state === "listening" ? [0.8, 1, 0.8] : [0.3, 0.5, 0.3],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />

          <motion.button
            onMouseDown={state === "idle" ? startListening : undefined}
            onMouseUp={state === "listening" ? stopListening : undefined}
            onTouchStart={(e) => {
              e.preventDefault(); // Prevent double-firing
              if (state === "idle") {
                triggerHaptic("medium");
                startListening();
              }
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              if (state === "listening") {
                triggerHaptic("light");
                stopListening();
              }
            }}
            disabled={!isConnected || state === "thinking" || state === "speaking"}
            className="relative w-18 h-18 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: state === "listening" ? HER_COLORS.coral : HER_COLORS.cream,
              boxShadow:
                state === "listening"
                  ? `0 0 60px ${HER_COLORS.coral}50, 0 0 100px ${HER_COLORS.coral}20, inset 0 0 30px ${HER_COLORS.warmWhite}30`
                  : `0 8px 32px ${HER_COLORS.softShadow}30, inset 0 2px 4px ${HER_COLORS.warmWhite}50`,
            }}
            whileHover={{ scale: 1.08, boxShadow: `0 12px 40px ${HER_COLORS.coral}30` }}
            whileTap={{ scale: 0.95 }}
            animate={
              state === "listening"
                ? {
                    scale: [1, 1.03, 1],
                  }
                : state === "speaking"
                  ? {
                      scale: [1, 1 + audioLevel * 0.05, 1],
                    }
                  : {}
            }
            transition={{
              duration: state === "listening" ? 1.2 : 0.15,
              repeat: state === "listening" ? Infinity : 0,
              ease: "easeInOut",
            }}
          >
            {/* Mic icon - elegant, minimal */}
            <motion.svg
              className="w-8 h-8 md:w-10 md:h-10"
              fill="none"
              stroke={state === "listening" ? HER_COLORS.warmWhite : HER_COLORS.earth}
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              animate={{
                scale: state === "listening" ? [1, 1.1, 1] : 1,
              }}
              transition={{ duration: 0.8, repeat: state === "listening" ? Infinity : 0 }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </motion.svg>

            {/* Listening rings animation - softer, more organic */}
            <AnimatePresence>
              {state === "listening" && (
                <>
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="absolute inset-0 rounded-full"
                      style={{
                        border: `1.5px solid ${HER_COLORS.coral}`,
                      }}
                      initial={{ scale: 1, opacity: 0.5 }}
                      animate={{ scale: 1.6 + i * 0.25, opacity: 0 }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        delay: i * 0.4,
                        ease: "easeOut",
                      }}
                    />
                  ))}
                </>
              )}
            </AnimatePresence>

            {/* Speaking audio visualizer */}
            <AnimatePresence>
              {state === "speaking" && audioLevel > 0.1 && (
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{
                    border: `2px solid ${HER_COLORS.coral}`,
                    opacity: audioLevel * 0.8,
                  }}
                  initial={{ scale: 1 }}
                  animate={{ scale: 1 + audioLevel * 0.3 }}
                  exit={{ scale: 1, opacity: 0 }}
                />
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* State text - minimal, only when needed */}
        <AnimatePresence mode="wait">
          <motion.p
            key={state}
            className="mt-5 text-sm font-light tracking-wide"
            style={{ color: HER_COLORS.softShadow }}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: state === "idle" || state === "listening" ? 0.7 : 0, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.3 }}
          >
            {state === "idle" && "Maintiens pour parler"}
            {state === "listening" && "Je t'écoute..."}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
