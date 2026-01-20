"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";

interface Message {
  role: "user" | "assistant";
  content: string;
  emotion?: string;
}

interface InterruptibleVoiceProps {
  onClose: () => void;
  backendUrl: string;
  selectedVoice: string;
  messages: Message[];
  onNewMessage: (message: Message) => void;
}

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";
type SpeakingState = "idle" | "listening" | "thinking" | "speaking";

export function InterruptibleVoice({
  onClose,
  backendUrl,
  selectedVoice,
  messages: _,
  onNewMessage,
}: InterruptibleVoiceProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [speakingState, setSpeakingState] = useState<SpeakingState>("idle");
  const [transcript, setTranscript] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [emotion, setEmotion] = useState<string | null>(null);
  const [breathPhase, setBreathPhase] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Breathing animation
  useEffect(() => {
    const interval = setInterval(() => {
      setBreathPhase((prev) => (prev + 1) % 100);
    }, 40);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const stopAudio = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // Already stopped
      }
      currentSourceRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setAudioLevel(0);
  }, []);

  const sendInterrupt = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "interrupt" }));
      stopAudio();
      setSpeakingState("idle");
    }
  }, [stopAudio]);

  const playNextAudioRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;

    const arrayBuffer = audioQueueRef.current.shift()!;

    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContext();
    }

    const ctx = audioContextRef.current;

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      currentSourceRef.current = source;

      const analyzer = ctx.createAnalyser();
      analyzer.fftSize = 32;
      analyzer.smoothingTimeConstant = 0.5;
      analyzerRef.current = analyzer;

      source.connect(analyzer);
      analyzer.connect(ctx.destination);

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
        currentSourceRef.current = null;
        setAudioLevel(0);

        if (audioQueueRef.current.length > 0) {
          playNextAudioRef.current?.();
        } else {
          setSpeakingState("idle");
        }
      };

      source.start(0);
      updateLevel();
    } catch (_err) {
      console.error("Audio play error:", _err);
      isPlayingRef.current = false;
      currentSourceRef.current = null;
      setAudioLevel(0);

      if (audioQueueRef.current.length > 0) {
        playNextAudioRef.current?.();
      } else {
        setSpeakingState("idle");
      }
    }
  }, []);

  useEffect(() => {
    playNextAudioRef.current = playNextAudio;
  }, [playNextAudio]);

  useEffect(() => {
    const connect = () => {
      setConnectionState("connecting");
      const ws = new WebSocket(`${backendUrl.replace("http", "ws")}/ws/interruptible`);

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        setConnectionState("connected");

        ws.send(
          JSON.stringify({
            type: "config",
            voice: selectedVoice,
            rate: "+15%",
            pitch: "+0Hz",
          })
        );
      };

      ws.onclose = () => {
        setConnectionState("disconnected");
      };

      ws.onerror = () => {
        setConnectionState("error");
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof ArrayBuffer) {
          audioQueueRef.current.push(event.data);
          playNextAudio();
          return;
        }

        const data = JSON.parse(event.data);

        switch (data.type) {
          case "config_ok":
            break;

          case "speaking_start":
            setSpeakingState("speaking");
            break;

          case "speaking_end":
            stopAudio();
            setSpeakingState("idle");
            break;

          case "token":
            setCurrentResponse((prev) => prev + data.content);
            break;

          case "response_end":
            setCurrentResponse((prev) => {
              if (prev) {
                onNewMessage({ role: "assistant", content: prev, emotion: emotion || undefined });
              }
              return "";
            });
            setSpeakingState(speakingState === "speaking" ? "speaking" : "idle");
            break;

          case "transcript":
            setTranscript(data.text);
            onNewMessage({ role: "user", content: data.text });
            setSpeakingState("thinking");
            setCurrentResponse("");
            break;

          case "emotion":
            setEmotion(data.emotion);
            break;

          case "audio_chunk":
            break;

          case "error":
            console.error("WebSocket error:", data.message);
            setSpeakingState("idle");
            break;

          case "pong":
            break;
        }
      };

      wsRef.current = ws;
    };

    connect();

    callTimerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    return () => {
      wsRef.current?.close();
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
      clearInterval(pingInterval);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [backendUrl, selectedVoice, playNextAudio, onNewMessage, stopAudio, emotion, speakingState]);

  const startListening = useCallback(async () => {
    if (speakingState === "listening" || !wsRef.current || isMuted) return;

    if (speakingState === "speaking") {
      sendInterrupt();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];

      mediaRecorderRef.current = mediaRecorder;

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "user_speaking" }));
      }

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          setSpeakingState("thinking");
          setTranscript("");
          audioQueueRef.current = [];

          const arrayBuffer = await blob.arrayBuffer();
          wsRef.current.send(arrayBuffer);
        } else {
          setSpeakingState("idle");
        }
      };

      mediaRecorder.start();
      setSpeakingState("listening");
    } catch (err) {
      console.error("Mic error:", err);
      setSpeakingState("idle");
    }
  }, [speakingState, isMuted, sendInterrupt]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    if (speakingState === "speaking") {
      sendInterrupt();
    }

    wsRef.current.send(JSON.stringify({
      type: "message",
      content,
    }));

    onNewMessage({ role: "user", content });
    setSpeakingState("thinking");
    setCurrentResponse("");
  }, [speakingState, sendInterrupt, onNewMessage]);

  const endCall = useCallback(() => {
    stopAudio();
    wsRef.current?.close();
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    onClose();
  }, [onClose, stopAudio]);

  const mouthOpen = Math.min(1, audioLevel * 2.5);
  const breathScale = 1 + Math.sin(breathPhase * Math.PI / 50) * 0.02;

  const getStateGlow = () => {
    switch (speakingState) {
      case "speaking":
        return HER_COLORS.glowCoral;
      case "thinking":
        return HER_COLORS.glowWarm;
      case "listening":
        return HER_COLORS.success + "60";
      default:
        return HER_COLORS.softShadow + "40";
    }
  };

  const getStateText = () => {
    switch (speakingState) {
      case "speaking":
        return "Je te parle...";
      case "thinking":
        return "Je réfléchis...";
      case "listening":
        return "Je t'écoute...";
      default:
        return "Parle-moi";
    }
  };

  const stateGlow = getStateGlow();

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
      }}
    >
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${stateGlow} 0%, transparent 70%)`,
          }}
          animate={{
            scale: speakingState === "speaking"
              ? 1.1 + audioLevel * 0.2
              : speakingState === "listening"
                ? 1.05
                : 1,
          }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Video container */}
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Avatar Display */}
        <div className="relative">
          {/* Outer glow ring */}
          <motion.div
            className="absolute -inset-8 rounded-full"
            style={{
              boxShadow: `0 0 60px ${stateGlow}`,
            }}
            animate={{
              scale: speakingState === "speaking"
                ? [1, 1.05, 1]
                : speakingState === "listening"
                  ? [1, 1.03, 1]
                  : 1,
            }}
            transition={{
              duration: speakingState === "speaking" ? 0.5 : 0.8,
              repeat: speakingState !== "idle" && speakingState !== "thinking" ? Infinity : 0,
            }}
          />

          {/* Main orb */}
          <motion.div
            className="w-72 h-72 md:w-96 md:h-96 rounded-full flex items-center justify-center"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral} 0%, ${HER_COLORS.blush} 50%, ${HER_COLORS.cream} 100%)`,
              boxShadow: `0 0 80px ${HER_COLORS.glowCoral}`,
              transform: `scale(${breathScale * (speakingState === "speaking" ? 1 + mouthOpen * 0.05 : 1)})`,
            }}
          >
            {/* Inner glow */}
            <div
              className="w-3/4 h-3/4 rounded-full backdrop-blur-sm flex items-center justify-center"
              style={{ backgroundColor: `${HER_COLORS.warmWhite}30` }}
            >
              <svg
                className="w-24 h-24"
                style={{ color: HER_COLORS.warmWhite, opacity: 0.8 }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>
          </motion.div>

          {/* Status text */}
          <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 text-center">
            <p style={{ color: HER_COLORS.earth }} className="font-light text-2xl">
              Eva
            </p>
            <p style={{ color: HER_COLORS.textSecondary }} className="text-sm mt-1">
              {getStateText()}
            </p>
            {emotion && (
              <p style={{ color: HER_COLORS.textMuted }} className="text-xs mt-1 capitalize">
                {emotion}
              </p>
            )}
          </div>
        </div>

        {/* Header */}
        <header
          className="absolute top-0 left-0 right-0 p-6"
          style={{
            background: `linear-gradient(to bottom, ${HER_COLORS.warmWhite}E6, transparent)`,
          }}
        >
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            <div className="flex items-center gap-3">
              <motion.div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: connectionState === "connected"
                    ? HER_COLORS.success
                    : connectionState === "connecting"
                      ? HER_COLORS.warning
                      : HER_COLORS.error,
                }}
                animate={{
                  scale: connectionState === "connected" ? [1, 1.2, 1] : 1,
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span style={{ color: HER_COLORS.earth }} className="font-light">
                {formatDuration(callDuration)}
              </span>
              <span style={{ color: HER_COLORS.textMuted }} className="text-sm">
                {connectionState === "connected"
                  ? "En ligne"
                  : connectionState === "connecting"
                    ? "..."
                    : "Hors ligne"}
              </span>
            </div>
            <motion.button
              onClick={endCall}
              className="p-2 rounded-full transition-all duration-300"
              style={{
                backgroundColor: HER_COLORS.cream,
                color: HER_COLORS.earth,
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </motion.button>
          </div>
        </header>

        {/* Current transcript/response */}
        <AnimatePresence>
          {(transcript || currentResponse) && (
            <motion.div
              className="absolute top-28 left-1/2 -translate-x-1/2 max-w-lg w-full px-4"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={HER_SPRINGS.gentle}
            >
              <div
                className="backdrop-blur-sm rounded-2xl px-6 py-4"
                style={{
                  backgroundColor: `${HER_COLORS.warmWhite}E6`,
                  border: `1px solid ${HER_COLORS.cream}`,
                  boxShadow: `0 4px 20px ${HER_COLORS.softShadow}40`,
                }}
              >
                <p style={{ color: HER_COLORS.earth }} className="text-center text-lg">
                  {currentResponse || transcript}
                  {speakingState === "thinking" && !currentResponse && (
                    <span className="inline-flex gap-1 ml-2">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: HER_COLORS.blush }}
                          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                    </span>
                  )}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Audio visualization bars */}
        <AnimatePresence>
          {speakingState === "speaking" && (
            <motion.div
              className="absolute bottom-48 left-1/2 -translate-x-1/2 flex items-end justify-center gap-0.5 h-16"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {Array.from({ length: 32 }).map((_, i) => {
                const barHeight = Math.max(4, Math.sin(i * 0.3 + audioLevel * 10) * audioLevel * 40 + audioLevel * 20);
                return (
                  <motion.div
                    key={i}
                    className="w-1 rounded-full"
                    style={{
                      backgroundColor: HER_COLORS.blush,
                      height: `${barHeight}px`,
                      opacity: 0.5 + audioLevel * 0.5,
                    }}
                  />
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <footer
          className="absolute bottom-0 left-0 right-0 p-8"
          style={{
            background: `linear-gradient(to top, ${HER_COLORS.warmWhite}E6, transparent)`,
          }}
        >
          <div className="flex items-center justify-center gap-6 max-w-md mx-auto">
            {/* Interrupt button */}
            <AnimatePresence>
              {speakingState === "speaking" && (
                <motion.button
                  onClick={sendInterrupt}
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: HER_COLORS.warning,
                    color: HER_COLORS.warmWhite,
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  title="Interrompre"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </motion.button>
              )}
            </AnimatePresence>

            {/* Mute toggle */}
            <motion.button
              onClick={() => setIsMuted(!isMuted)}
              className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300"
              style={{
                backgroundColor: isMuted ? HER_COLORS.error : HER_COLORS.cream,
                color: isMuted ? HER_COLORS.warmWhite : HER_COLORS.earth,
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              {isMuted ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </motion.button>

            {/* Push to talk */}
            <motion.button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              disabled={connectionState !== "connected" || isMuted}
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: speakingState === "listening"
                  ? HER_COLORS.success
                  : connectionState === "connected" && !isMuted
                    ? HER_COLORS.cream
                    : HER_COLORS.softShadow,
                color: speakingState === "listening"
                  ? HER_COLORS.warmWhite
                  : HER_COLORS.earth,
                boxShadow: speakingState === "listening"
                  ? `0 0 30px ${HER_COLORS.success}60`
                  : "none",
                cursor: connectionState === "connected" && !isMuted ? "pointer" : "not-allowed",
                opacity: connectionState === "connected" && !isMuted ? 1 : 0.5,
              }}
              animate={{
                scale: speakingState === "listening" ? 1.1 : 1,
              }}
              whileHover={connectionState === "connected" && !isMuted ? { scale: 1.05 } : {}}
              whileTap={connectionState === "connected" && !isMuted ? { scale: 0.95 } : {}}
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </motion.button>

            {/* End call */}
            <motion.button
              onClick={endCall}
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: HER_COLORS.error,
                color: HER_COLORS.warmWhite,
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.28 3H5z" />
              </svg>
            </motion.button>
          </div>

          {/* Status hints */}
          <div className="text-center mt-6">
            <AnimatePresence mode="wait">
              {speakingState === "listening" && (
                <motion.div
                  className="flex items-center justify-center gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: HER_COLORS.success }}
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span style={{ color: HER_COLORS.textSecondary }} className="text-sm">
                    Parle, je t&apos;écoute...
                  </span>
                </motion.div>
              )}
              {speakingState === "speaking" && (
                <motion.p
                  style={{ color: HER_COLORS.textMuted }}
                  className="text-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  Tu peux m&apos;interrompre
                </motion.p>
              )}
              {speakingState === "idle" && connectionState === "connected" && (
                <motion.p
                  style={{ color: HER_COLORS.textMuted }}
                  className="text-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  Maintiens le bouton pour parler
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </footer>
      </div>
    </div>
  );
}
