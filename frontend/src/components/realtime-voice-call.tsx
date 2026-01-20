"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useVAD } from "./use-vad";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  emotion?: string;
}

interface RealtimeVoiceCallProps {
  onClose: () => void;
  backendUrl: string;
  selectedVoice: string;
}

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";
type CallState = "idle" | "listening" | "processing" | "speaking";

export function RealtimeVoiceCall({
  onClose,
  backendUrl,
  selectedVoice,
}: RealtimeVoiceCallProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [callState, setCallState] = useState<CallState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [emotion, setEmotion] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [userVolume, setUserVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [breathPhase, setBreathPhase] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const playNextAudioRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const callStateRef = useRef<CallState>("idle");

  // Breathing animation
  useEffect(() => {
    const interval = setInterval(() => {
      setBreathPhase((prev) => (prev + 1) % 100);
    }, 40);
    return () => clearInterval(interval);
  }, []);

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
      setCallState("idle");
      setCurrentResponse("");
    }
  }, [stopAudio]);

  const expectingMoreAudioRef = useRef(false);

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
        } else if (expectingMoreAudioRef.current) {
          setTimeout(() => {
            if (audioQueueRef.current.length > 0) {
              playNextAudioRef.current?.();
            }
          }, 100);
        }
      };

      source.start(0);
      updateLevel();
    } catch (err) {
      console.error("Audio play error:", err);
      isPlayingRef.current = false;
      currentSourceRef.current = null;
      setAudioLevel(0);

      if (audioQueueRef.current.length > 0) {
        playNextAudioRef.current?.();
      }
    }
  }, []);

  useEffect(() => {
    playNextAudioRef.current = playNextAudio;
  }, [playNextAudio]);

  const persistentStreamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current || isMuted) return;

    try {
      let stream = persistentStreamRef.current;

      if (!stream || stream.getTracks().some(t => t.readyState === "ended")) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        persistentStreamRef.current = stream;
      }

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      recordingChunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;
      isRecordingRef.current = true;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordingChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(100);
    } catch (err) {
      console.error("Recording error:", err);
    }
  }, [isMuted]);

  const stopRecordingAndSend = useCallback(async () => {
    if (!isRecordingRef.current || !mediaRecorderRef.current) return;

    return new Promise<void>((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;

      mediaRecorder.onstop = async () => {
        isRecordingRef.current = false;

        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        recordingChunksRef.current = [];

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && blob.size > 500) {
          setCallState("processing");
          const arrayBuffer = await blob.arrayBuffer();
          wsRef.current.send(arrayBuffer);
        } else {
          setCallState("idle");
        }

        resolve();
      };

      mediaRecorder.stop();
    });
  }, []);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  const handleSpeechStart = useCallback(() => {
    if (callStateRef.current === "speaking" || isPlayingRef.current) {
      sendInterrupt();
    }

    setCallState("listening");
    callStateRef.current = "listening";
    startRecording();
  }, [sendInterrupt, startRecording]);

  const handleSpeechEnd = useCallback(() => {
    stopRecordingAndSend();
  }, [stopRecordingAndSend]);

  const vad = useVAD({
    threshold: callState === "speaking" ? 0.08 : 0.02,
    minSpeechDuration: callState === "speaking" ? 400 : 300,
    silenceTimeout: 800,
    minSilenceDuration: 400,
    onSpeechStart: handleSpeechStart,
    onSpeechEnd: handleSpeechEnd,
    onVolumeChange: setUserVolume,
  });

  useEffect(() => {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isCleanedUp = false;

    const connect = () => {
      if (isCleanedUp) return;

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, "Reconnecting");
      }

      setConnectionState("connecting");
      const wsUrl = `${backendUrl.replace("http", "ws")}/ws/interruptible`;
      const ws = new WebSocket(wsUrl);

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        if (isCleanedUp) {
          ws.close(1000, "Component unmounted");
          return;
        }
        setConnectionState("connected");
        reconnectAttempts = 0;

        ws.send(
          JSON.stringify({
            type: "config",
            voice: selectedVoice,
            rate: "+15%",
            pitch: "+0Hz",
          })
        );

        setTimeout(() => {
          if (!isMuted && !isCleanedUp) {
            vad.start();
          }
        }, 500);
      };

      ws.onclose = (event) => {
        if (isCleanedUp) return;
        setConnectionState("disconnected");
        vad.stop();

        if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts && !isCleanedUp) {
          reconnectAttempts++;
          reconnectTimeout = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        if (isCleanedUp) return;
        setConnectionState("error");
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof ArrayBuffer) {
          audioQueueRef.current.push(event.data);
          playNextAudio();
          return;
        }

        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "config_ok":
              break;

            case "speaking_start":
              expectingMoreAudioRef.current = true;
              setCallState("speaking");
              break;

            case "speaking_end":
              expectingMoreAudioRef.current = false;
              if (data.reason === "interrupted") {
                stopAudio();
              }
              setCallState("idle");
              break;

            case "audio_chunk":
              expectingMoreAudioRef.current = true;
              break;

            case "token":
              setCurrentResponse((prev) => prev + data.content);
              break;

            case "response_end":
              setCurrentResponse((prev) => {
                if (prev) {
                  setMessages((msgs) => {
                    const lastMsg = msgs[msgs.length - 1];
                    if (lastMsg?.role === "assistant" && lastMsg?.content === prev) {
                      return msgs;
                    }
                    return [
                      ...msgs,
                      {
                        role: "assistant",
                        content: prev,
                        timestamp: Date.now(),
                        emotion: emotion || undefined,
                      },
                    ];
                  });
                }
                return "";
              });
              break;

            case "transcript":
              setCurrentTranscript(data.text);
              setMessages((msgs) => {
                const lastMsg = msgs[msgs.length - 1];
                if (lastMsg?.role === "user" && lastMsg?.content === data.text) {
                  return msgs;
                }
                return [
                  ...msgs,
                  {
                    role: "user",
                    content: data.text,
                    timestamp: Date.now(),
                  },
                ];
              });
              setCallState("processing");
              break;

            case "emotion":
              setEmotion(data.emotion);
              break;

            case "error":
              console.error("Server error:", data.message);
              setCallState("idle");
              break;

            case "pong":
              break;
          }
        } catch (e) {
          console.error("Failed to parse WS message:", e);
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
    }, 15000);

    return () => {
      isCleanedUp = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close(1000, "Component unmounted");
        wsRef.current = null;
      }
      vad.stop();
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
      clearInterval(pingInterval);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      if (persistentStreamRef.current) {
        persistentStreamRef.current.getTracks().forEach(t => t.stop());
        persistentStreamRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, selectedVoice]);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      vad.start();
    } else {
      setIsMuted(true);
      vad.stop();
      if (isRecordingRef.current) {
        mediaRecorderRef.current?.stop();
        isRecordingRef.current = false;
      }
    }
  }, [isMuted, vad]);

  const endCall = useCallback(() => {
    stopAudio();
    vad.stop();
    wsRef.current?.close();
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }
    onClose();
  }, [onClose, stopAudio, vad]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getStateGlow = () => {
    switch (callState) {
      case "speaking":
        return HER_COLORS.glowCoral;
      case "processing":
        return HER_COLORS.glowWarm;
      case "listening":
        return HER_COLORS.success + "60";
      default:
        return HER_COLORS.softShadow + "40";
    }
  };

  const breathScale = 1 + Math.sin(breathPhase * Math.PI / 50) * 0.02;
  const stateGlow = getStateGlow();

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
      }}
    >
      {/* Ambient background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${stateGlow} 0%, transparent 70%)`,
          }}
          animate={{
            scale: callState === "speaking"
              ? 1.1 + audioLevel * 0.2
              : callState === "listening"
                ? 1 + userVolume * 0.15
                : 1,
          }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Header */}
      <header
        className="relative z-10 p-6"
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
            aria-label="Fermer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </motion.button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center relative z-10 px-4">
        {/* Transcript/Response display */}
        <AnimatePresence>
          {(currentTranscript || currentResponse) && (
            <motion.div
              className="absolute top-4 left-1/2 -translate-x-1/2 max-w-lg w-full px-4"
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
                  {currentResponse || currentTranscript}
                  {callState === "processing" && !currentResponse && (
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

        {/* Main orb visualization */}
        <div className="relative">
          {/* Outer glow ring */}
          <motion.div
            className="absolute -inset-8 rounded-full"
            style={{
              boxShadow: `0 0 60px ${stateGlow}`,
            }}
            animate={{
              scale: callState === "speaking"
                ? [1, 1.05, 1]
                : callState === "listening"
                  ? [1, 1.03, 1]
                  : 1,
            }}
            transition={{
              duration: callState === "speaking" ? 0.5 : 0.8,
              repeat: callState !== "idle" ? Infinity : 0,
            }}
          />

          {/* Main orb */}
          <motion.div
            className="w-64 h-64 md:w-80 md:h-80 rounded-full flex items-center justify-center"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral} 0%, ${HER_COLORS.blush} 50%, ${HER_COLORS.cream} 100%)`,
              boxShadow: `0 0 80px ${HER_COLORS.glowCoral}`,
              transform: `scale(${breathScale})`,
            }}
            animate={{
              scale: callState === "speaking"
                ? breathScale * (1 + audioLevel * 0.1)
                : callState === "listening"
                  ? breathScale * (1 + userVolume * 0.1)
                  : breathScale,
            }}
            transition={{ duration: 0.1 }}
          >
            {/* Inner glow */}
            <div
              className="w-3/4 h-3/4 rounded-full backdrop-blur-sm flex items-center justify-center"
              style={{ backgroundColor: `${HER_COLORS.warmWhite}30` }}
            >
              <svg
                className="w-20 h-20"
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
          <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 text-center">
            <p style={{ color: HER_COLORS.earth }} className="font-light text-2xl">
              Eva
            </p>
            <p style={{ color: HER_COLORS.textSecondary }} className="text-sm mt-1">
              {callState === "speaking"
                ? "Je te parle..."
                : callState === "processing"
                  ? "Je réfléchis..."
                  : callState === "listening"
                    ? "Je t'écoute..."
                    : "Parle-moi"}
            </p>
            {emotion && (
              <p style={{ color: HER_COLORS.textMuted }} className="text-xs mt-1 capitalize">
                {emotion}
              </p>
            )}
          </div>
        </div>

        {/* Audio visualization */}
        <AnimatePresence>
          {(callState === "speaking" || callState === "listening") && (
            <motion.div
              className="absolute bottom-48 left-1/2 -translate-x-1/2 flex items-end justify-center gap-0.5 h-16"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {Array.from({ length: 32 }).map((_, i) => {
                const level = callState === "speaking" ? audioLevel : userVolume;
                const barHeight = Math.max(4, Math.sin(i * 0.3 + level * 10) * level * 40 + level * 20);
                return (
                  <motion.div
                    key={i}
                    className="w-1 rounded-full"
                    style={{
                      backgroundColor: HER_COLORS.blush,
                      height: `${barHeight}px`,
                      opacity: 0.5 + level * 0.5,
                    }}
                  />
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Controls */}
      <footer
        className="relative z-10 p-8"
        style={{
          background: `linear-gradient(to top, ${HER_COLORS.warmWhite}E6, transparent)`,
        }}
      >
        <div className="flex items-center justify-center gap-6 max-w-md mx-auto">
          {/* Interrupt button */}
          <AnimatePresence>
            {callState === "speaking" && (
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
            onClick={toggleMute}
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

          {/* VAD indicator */}
          <motion.div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: callState === "listening"
                ? HER_COLORS.success
                : HER_COLORS.cream,
              boxShadow: callState === "listening"
                ? `0 0 30px ${HER_COLORS.success}60`
                : "none",
            }}
            animate={{
              scale: callState === "listening" ? 1.1 : 1,
            }}
            transition={HER_SPRINGS.gentle}
          >
            <svg
              className="w-8 h-8"
              style={{
                color: callState === "listening" ? HER_COLORS.warmWhite : HER_COLORS.textMuted,
              }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </motion.div>

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

        {/* Status hint */}
        <div className="text-center mt-6">
          <p style={{ color: HER_COLORS.textMuted }} className="text-sm font-light">
            {isMuted
              ? "Micro désactivé"
              : callState === "speaking"
                ? "Tu peux m'interrompre"
                : callState === "listening"
                  ? "Je t'écoute..."
                  : "Parle naturellement"}
          </p>
        </div>

        {vad.error && (
          <p style={{ color: HER_COLORS.error }} className="text-xs text-center mt-2">
            {vad.error}
          </p>
        )}
      </footer>

      {/* Conversation history */}
      <AnimatePresence>
        {messages.length > 0 && (
          <motion.div
            className="fixed bottom-32 left-4 right-4 max-h-32 overflow-y-auto pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="max-w-2xl mx-auto space-y-1">
              {messages.slice(-4).map((msg, i) => (
                <div
                  key={i}
                  className="text-xs px-3 py-1 rounded-full inline-block"
                  style={{
                    backgroundColor: msg.role === "user"
                      ? `${HER_COLORS.earth}20`
                      : `${HER_COLORS.coral}20`,
                    color: msg.role === "user"
                      ? HER_COLORS.earth
                      : HER_COLORS.coral,
                  }}
                >
                  {msg.content.slice(0, 50)}
                  {msg.content.length > 50 && "..."}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
