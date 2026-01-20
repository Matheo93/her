"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import type { VisemeWeights } from "@/components/RealisticAvatar3D";
import { HER_COLORS } from "@/styles/her-theme";

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

export default function VoiceFirstPage() {
  // State
  const [state, setState] = useState<ConversationState>("idle");
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [visemeWeights, setVisemeWeights] = useState<VisemeWeights>({ sil: 1 });
  const [audioLevel, setAudioLevel] = useState(0);
  const [evaEmotion, setEvaEmotion] = useState("neutral");

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

      // Auto-stop after 5 seconds
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
          stream.getTracks().forEach((t) => t.stop());
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
      className="fixed inset-0 overflow-hidden flex flex-col items-center justify-center"
      style={{ backgroundColor: HER_COLORS.warmWhite }}
    >
      {/* Subtle warm ambient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
        }}
      />

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
        {/* 3D Avatar */}
        <div className="w-48 h-48 md:w-64 md:h-64">
          <RealisticAvatar3D
            visemeWeights={visemeWeights}
            emotion={getDisplayEmotion()}
            isSpeaking={state === "speaking"}
            isListening={state === "listening"}
            audioLevel={audioLevel}
          />
        </div>

        {/* Transcript - what user said */}
        <AnimatePresence mode="wait">
          {transcript && state !== "speaking" && (
            <motion.p
              className="mt-6 text-sm max-w-md text-center px-4"
              style={{ color: HER_COLORS.softShadow }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {transcript}
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

        {/* Thinking indicator */}
        <AnimatePresence>
          {state === "thinking" && !response && (
            <motion.div
              className="mt-6 flex gap-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: HER_COLORS.softShadow }}
                  animate={{
                    opacity: [0.3, 0.7, 0.3],
                    scale: [1, 1.2, 1],
                  }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* VOICE FIRST: Giant microphone button - the main interface */}
      <div className="pb-12 flex flex-col items-center">
        <motion.button
          onMouseDown={state === "idle" ? startListening : undefined}
          onMouseUp={state === "listening" ? stopListening : undefined}
          onTouchStart={state === "idle" ? startListening : undefined}
          onTouchEnd={state === "listening" ? stopListening : undefined}
          onClick={state === "idle" && !("ontouchstart" in window) ? startListening : undefined}
          disabled={!isConnected || state === "thinking" || state === "speaking"}
          className="relative w-24 h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center transition-all"
          style={{
            backgroundColor: state === "listening" ? HER_COLORS.coral : HER_COLORS.cream,
            boxShadow:
              state === "listening"
                ? `0 0 40px ${HER_COLORS.coral}60, 0 0 80px ${HER_COLORS.coral}30`
                : `0 4px 20px ${HER_COLORS.softShadow}40`,
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          animate={
            state === "listening"
              ? {
                  scale: [1, 1.05, 1],
                }
              : {}
          }
          transition={
            state === "listening"
              ? {
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
              : { duration: 0.2 }
          }
        >
          {/* Mic icon */}
          <svg
            className="w-10 h-10 md:w-12 md:h-12"
            fill="none"
            stroke={state === "listening" ? HER_COLORS.warmWhite : HER_COLORS.earth}
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>

          {/* Listening rings animation */}
          <AnimatePresence>
            {state === "listening" && (
              <>
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 rounded-full border-2"
                    style={{ borderColor: HER_COLORS.coral }}
                    initial={{ scale: 1, opacity: 0.6 }}
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

        {/* Subtle state text */}
        <motion.p
          className="mt-4 text-sm"
          style={{ color: HER_COLORS.softShadow }}
          animate={{ opacity: state === "idle" ? 1 : 0.6 }}
        >
          {state === "idle" && "Appuie pour parler"}
          {state === "listening" && "Je t\u2019\u00e9coute..."}
          {state === "thinking" && ""}
          {state === "speaking" && ""}
        </motion.p>
      </div>
    </div>
  );
}
