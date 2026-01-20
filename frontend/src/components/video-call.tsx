"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, EMOTION_PRESENCE } from "@/styles/her-theme";

interface Message {
  role: "user" | "assistant";
  content: string;
  emotion?: string;
}

interface VideoCallProps {
  onClose: () => void;
  backendUrl: string;
  selectedVoice: string;
  messages: Message[];
  onNewMessage: (message: Message) => void;
}

// Procedural SVG Avatar - warm, intimate, alive
function EvaAvatar({
  isSpeaking,
  isListening,
  isThinking,
  emotion,
  audioLevel,
}: {
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  emotion: string;
  audioLevel: number;
}) {
  const presence = EMOTION_PRESENCE[emotion] || EMOTION_PRESENCE.neutral;

  // Natural breathing rhythm
  const breathingVariants = {
    breathe: {
      scale: [1, 1.02, 1],
      transition: {
        duration: 4,
        repeat: Infinity,
        ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
      },
    },
  };

  // Subtle idle movement
  const idleVariants = {
    idle: {
      y: [0, -3, 0, 2, 0],
      x: [0, 1, 0, -1, 0],
      rotate: [0, 0.5, 0, -0.3, 0],
      transition: {
        duration: 6,
        repeat: Infinity,
        ease: "easeInOut" as const,
      },
    },
  };

  // Mouth movement based on audio level
  const mouthOpen = Math.min(1, audioLevel * 2.5);

  return (
    <motion.div
      className="relative"
      variants={idleVariants}
      animate="idle"
    >
      {/* Warm glow behind avatar */}
      <motion.div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{ backgroundColor: presence.glow }}
        animate={{
          opacity: isSpeaking ? 0.8 : isListening ? 0.6 : isThinking ? 0.5 : 0.4,
          scale: isSpeaking ? 1.2 + audioLevel * 0.2 : 1,
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />

      {/* Main avatar - procedural SVG */}
      <motion.svg
        viewBox="0 0 200 200"
        className="w-64 h-64 md:w-80 md:h-80 relative z-10"
        variants={breathingVariants}
        animate="breathe"
      >
        {/* Warm background circle */}
        <motion.circle
          cx="100"
          cy="100"
          r="90"
          fill={HER_COLORS.cream}
          animate={{
            fill: isListening ? HER_COLORS.blush : HER_COLORS.cream,
          }}
          transition={{ duration: 0.5 }}
        />

        {/* Inner gradients */}
        <defs>
          <radialGradient id="faceGradientCall" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={HER_COLORS.warmWhite} />
            <stop offset="100%" stopColor={HER_COLORS.cream} />
          </radialGradient>
          <radialGradient id="warmGlowCall" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HER_COLORS.coral} stopOpacity="0.3" />
            <stop offset="100%" stopColor={HER_COLORS.coral} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Face base with gradient */}
        <circle cx="100" cy="100" r="80" fill="url(#faceGradientCall)" />

        {/* Warm glow when speaking */}
        <motion.circle
          cx="100"
          cy="100"
          r="75"
          fill="url(#warmGlowCall)"
          animate={{
            opacity: isSpeaking ? 0.5 + audioLevel * 0.5 : 0,
          }}
          transition={{ duration: 0.1 }}
        />

        {/* Eyes - gentle curves */}
        <g>
          <motion.path
            d="M 65 90 Q 75 85 85 90"
            stroke={HER_COLORS.earth}
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
            animate={isListening ? {
              d: ["M 65 90 Q 75 85 85 90", "M 65 88 Q 75 82 85 88", "M 65 90 Q 75 85 85 90"],
            } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.path
            d="M 115 90 Q 125 85 135 90"
            stroke={HER_COLORS.earth}
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
            animate={isListening ? {
              d: ["M 115 90 Q 125 85 135 90", "M 115 88 Q 125 82 135 88", "M 115 90 Q 125 85 135 90"],
            } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </g>

        {/* Natural blinking */}
        <motion.g
          animate={{
            opacity: [1, 1, 0, 1],
          }}
          transition={{
            duration: 0.15,
            repeat: Infinity,
            repeatDelay: 4,
            times: [0, 0.3, 0.5, 1],
          }}
        >
          <path d="M 65 90 Q 75 92 85 90" stroke={HER_COLORS.cream} strokeWidth="4" fill="none" />
          <path d="M 115 90 Q 125 92 135 90" stroke={HER_COLORS.cream} strokeWidth="4" fill="none" />
        </motion.g>

        {/* Mouth - animated with audio level */}
        <motion.path
          d={
            isSpeaking
              ? `M 85 125 Q 100 ${130 + mouthOpen * 15} 115 125`
              : isThinking
                ? "M 88 125 Q 100 128 112 125"
                : "M 85 125 Q 100 132 115 125"
          }
          stroke={HER_COLORS.coral}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          transition={{ duration: 0.05 }}
        />

        {/* Cheek warmth */}
        <motion.circle
          cx="60"
          cy="105"
          r="12"
          fill={HER_COLORS.blush}
          animate={{
            opacity: emotion === "joy" || emotion === "tenderness" ? 0.25 : isSpeaking ? 0.15 : 0.1,
          }}
          transition={{ duration: 0.5 }}
        />
        <motion.circle
          cx="140"
          cy="105"
          r="12"
          fill={HER_COLORS.blush}
          animate={{
            opacity: emotion === "joy" || emotion === "tenderness" ? 0.25 : isSpeaking ? 0.15 : 0.1,
          }}
          transition={{ duration: 0.5 }}
        />
      </motion.svg>

      {/* Listening ring */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: HER_COLORS.coral }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{
              opacity: [0.3, 0.6, 0.3],
              scale: [1, 1.05, 1],
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </AnimatePresence>

      {/* Speaking glow ring */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            className="absolute -inset-4 rounded-full"
            style={{
              boxShadow: `0 0 ${30 + audioLevel * 40}px ${HER_COLORS.coral}40`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 + audioLevel * 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function VideoCall({
  onClose,
  backendUrl,
  selectedVoice,
  onNewMessage,
}: VideoCallProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [emotion, setEmotion] = useState("neutral");

  const wsRef = useRef<WebSocket | null>(null);
  const audioQueueRef = useRef<Blob[]>([]);
  const isPlayingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playNextAudioRef = useRef<() => void>(() => {});
  const analyzerRef = useRef<AnalyserNode | null>(null);

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Audio queue player with level detection
  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const blob = audioQueueRef.current.shift()!;
    const arrayBuffer = await blob.arrayBuffer();

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const ctx = audioContextRef.current;

    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

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
        setAudioLevel(0);

        if (audioQueueRef.current.length > 0) {
          playNextAudioRef.current();
        } else {
          setIsSpeaking(false);
        }
      };

      source.start(0);
      updateLevel();
    } catch {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      setAudioLevel(0);

      if (audioQueueRef.current.length > 0) {
        playNextAudioRef.current();
      }
    }
  }, []);

  useEffect(() => {
    playNextAudioRef.current = playNextAudio;
  }, [playNextAudio]);

  // WebSocket connection
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${backendUrl.replace("http", "ws")}/ws/stream`);

      ws.onopen = () => {
        setIsConnected(true);
        ws.send(
          JSON.stringify({
            type: "config",
            voice: selectedVoice,
            auto_mood: true,
          })
        );
      };

      ws.onclose = () => {
        setIsConnected(false);
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          audioQueueRef.current.push(event.data);
          playNextAudio();
          return;
        }

        const data = JSON.parse(event.data);

        switch (data.type) {
          case "token":
            setCurrentResponse((prev) => prev + data.content);
            break;

          case "response_end":
            setCurrentResponse((prev) => {
              if (prev) {
                onNewMessage({ role: "assistant", content: prev });
              }
              return "";
            });
            setIsThinking(false);
            break;

          case "transcript":
            setTranscript(data.text);
            onNewMessage({ role: "user", content: data.text });
            setIsThinking(true);
            setCurrentResponse("");
            break;

          case "emotion":
            setEmotion(data.emotion || "neutral");
            break;
        }
      };

      wsRef.current = ws;
    };

    connect();

    callTimerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    return () => {
      wsRef.current?.close();
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
    };
  }, [backendUrl, selectedVoice, playNextAudio, onNewMessage]);

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
        stream.getTracks().forEach((t) => t.stop());
        setIsListening(false);
        setTranscript("");

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          setIsThinking(true);
          audioQueueRef.current = [];
          wsRef.current.send(blob);
        }
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.error("Mic error:", err);
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const endCall = useCallback(() => {
    wsRef.current?.close();
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }
    onClose();
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden flex flex-col"
      style={{ backgroundColor: HER_COLORS.warmWhite }}
    >
      {/* Ambient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
        }}
      />

      {/* Header - minimal */}
      <div className="relative z-10 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: isConnected ? HER_COLORS.coral : HER_COLORS.softShadow }}
            animate={{ opacity: isConnected ? [0.5, 1, 0.5] : 1 }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span style={{ color: HER_COLORS.earth }} className="text-sm">
            {formatDuration(callDuration)}
          </span>
        </div>
        <motion.button
          onClick={endCall}
          className="p-2 rounded-full"
          style={{ backgroundColor: HER_COLORS.cream, color: HER_COLORS.earth }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </motion.button>
      </div>

      {/* Main content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-4">
        {/* Avatar */}
        <EvaAvatar
          isSpeaking={isSpeaking}
          isListening={isListening}
          isThinking={isThinking}
          emotion={emotion}
          audioLevel={audioLevel}
        />

        {/* Eva's text */}
        <AnimatePresence mode="wait">
          {(currentResponse || transcript) && (
            <motion.div
              className="mt-8 max-w-md text-center px-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <p style={{ color: HER_COLORS.earth }} className="text-lg leading-relaxed">
                {currentResponse || transcript}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Thinking indicator */}
        <AnimatePresence>
          {isThinking && !currentResponse && (
            <motion.div
              className="mt-8 flex gap-1"
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

      {/* Controls - minimal */}
      <div className="relative z-10 p-6">
        <div className="flex items-center justify-center gap-4">
          {/* Push to talk */}
          <motion.button
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onMouseLeave={stopListening}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
            disabled={!isConnected}
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: isListening ? HER_COLORS.coral : HER_COLORS.cream,
              color: isListening ? HER_COLORS.warmWhite : HER_COLORS.earth,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </motion.button>

          {/* End call */}
          <motion.button
            onClick={endCall}
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: HER_COLORS.error, color: HER_COLORS.warmWhite }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.28 3H5z"
              />
            </svg>
          </motion.button>
        </div>

        {/* Status - only when not connected */}
        <AnimatePresence>
          {!isConnected && (
            <motion.p
              className="text-center text-sm mt-4"
              style={{ color: HER_COLORS.softShadow }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
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
