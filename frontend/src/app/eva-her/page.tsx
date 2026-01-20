"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// HER color palette - warm, intimate, human
const HER_COLORS = {
  coral: "#E8846B",
  cream: "#F5E6D3",
  warmWhite: "#FAF8F5",
  earth: "#8B7355",
  softShadow: "#D4C4B5",
  blush: "#E8A090",
};

// Emotion to subtle visual changes (no labels, just feeling)
const EMOTION_PRESENCE: Record<string, { glow: string; warmth: number }> = {
  joy: { glow: "rgba(232, 132, 107, 0.4)", warmth: 1.2 },
  sadness: { glow: "rgba(139, 115, 85, 0.3)", warmth: 0.8 },
  tenderness: { glow: "rgba(232, 160, 144, 0.5)", warmth: 1.1 },
  excitement: { glow: "rgba(232, 132, 107, 0.5)", warmth: 1.3 },
  neutral: { glow: "rgba(212, 196, 181, 0.3)", warmth: 1.0 },
};

// Procedural SVG Avatar - abstract, warm, alive
function EvaAvatar({
  isSpeaking,
  isListening,
  emotion,
  isThinking
}: {
  isSpeaking: boolean;
  isListening: boolean;
  emotion: string;
  isThinking: boolean;
}) {
  const presence = EMOTION_PRESENCE[emotion] || EMOTION_PRESENCE.neutral;

  // Natural breathing rhythm (4 seconds inhale/exhale)
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

  // Subtle idle movement (like a person who's present)
  const idleVariants = {
    idle: {
      y: [0, -2, 0, 1, 0],
      x: [0, 0.5, 0, -0.5, 0],
      rotate: [0, 0.3, 0, -0.2, 0],
      transition: {
        duration: 6,
        repeat: Infinity,
        ease: "easeInOut" as const,
      },
    },
  };

  // Speaking animation - organic mouth movement
  const speakingVariants = {
    speaking: {
      scaleY: [1, 1.15, 1, 1.2, 1.1, 1],
      transition: {
        duration: 0.3,
        repeat: Infinity,
        ease: "easeInOut" as const,
      },
    },
  };

  // Listening - attentive presence (unused but kept for future)
  void (() => ({
    listening: {
      scale: [1, 1.03, 1],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
      },
    },
  }));

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
          opacity: isSpeaking ? 0.8 : isListening ? 0.6 : 0.4,
          scale: isSpeaking ? 1.2 : 1,
        }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />

      {/* Main avatar - procedural SVG */}
      <motion.svg
        viewBox="0 0 200 200"
        className="w-48 h-48 md:w-64 md:h-64 relative z-10"
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

        {/* Subtle inner gradient for depth */}
        <defs>
          <radialGradient id="faceGradient" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={HER_COLORS.warmWhite} />
            <stop offset="100%" stopColor={HER_COLORS.cream} />
          </radialGradient>
          <radialGradient id="warmGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={HER_COLORS.coral} stopOpacity="0.3" />
            <stop offset="100%" stopColor={HER_COLORS.coral} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Face base with gradient */}
        <circle cx="100" cy="100" r="80" fill="url(#faceGradient)" />

        {/* Warm presence glow when speaking */}
        <motion.circle
          cx="100"
          cy="100"
          r="75"
          fill="url(#warmGlow)"
          animate={{
            opacity: isSpeaking ? 0.8 : 0,
          }}
          transition={{ duration: 0.3 }}
        />

        {/* Eyes - closed curves, gentle, present */}
        <g>
          {/* Left eye */}
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
          {/* Right eye */}
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

        {/* Natural blinking every ~4 seconds */}
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
          {/* Blink overlay - thicker lines */}
          <path d="M 65 90 Q 75 92 85 90" stroke={HER_COLORS.cream} strokeWidth="4" fill="none" />
          <path d="M 115 90 Q 125 92 135 90" stroke={HER_COLORS.cream} strokeWidth="4" fill="none" />
        </motion.g>

        {/* Mouth - the key expression point */}
        <motion.g variants={isSpeaking ? speakingVariants : undefined} animate={isSpeaking ? "speaking" : undefined}>
          <motion.path
            d={
              isSpeaking
                ? "M 85 125 Q 100 140 115 125" // Open, speaking
                : isThinking
                  ? "M 88 125 Q 100 128 112 125" // Slight, thinking
                  : "M 85 125 Q 100 132 115 125" // Gentle smile, neutral
            }
            stroke={HER_COLORS.coral}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            animate={{
              d: isSpeaking
                ? ["M 85 125 Q 100 135 115 125", "M 85 125 Q 100 142 115 125", "M 85 125 Q 100 138 115 125"]
                : undefined,
            }}
            transition={isSpeaking ? { duration: 0.2, repeat: Infinity } : { duration: 0.3 }}
          />
        </motion.g>

        {/* Subtle cheek warmth when emotion is positive */}
        <motion.circle
          cx="60"
          cy="105"
          r="12"
          fill={HER_COLORS.blush}
          opacity="0.15"
          animate={{
            opacity: emotion === "joy" || emotion === "tenderness" ? 0.25 : 0.1,
          }}
          transition={{ duration: 0.5 }}
        />
        <motion.circle
          cx="140"
          cy="105"
          r="12"
          fill={HER_COLORS.blush}
          opacity="0.15"
          animate={{
            opacity: emotion === "joy" || emotion === "tenderness" ? 0.25 : 0.1,
          }}
          transition={{ duration: 0.5 }}
        />
      </motion.svg>

      {/* Listening indicator - subtle warm ring */}
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
    </motion.div>
  );
}

export default function EvaHerPage() {
  // State - minimal, essential only
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [evaEmotion, setEvaEmotion] = useState("neutral");
  const [currentText, setCurrentText] = useState("");
  const [inputText, setInputText] = useState("");

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<{ audio: ArrayBuffer; emotion: string }[]>([]);
  const isPlayingRef = useRef(false);
  const playNextAudioRef = useRef<() => void>(() => {});

  // Connect to WebSocket
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws/her`);

      ws.onopen = () => {
        setIsConnected(true);
        ws.send(JSON.stringify({
          type: "config",
          user_id: "eva_her_user",
          voice: "french"
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

  // Audio playback
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
      source.connect(audioContext.destination);

      source.onended = () => {
        isPlayingRef.current = false;
        if (audioQueueRef.current.length > 0) {
          playNextAudioRef.current();
        } else {
          setIsSpeaking(false);
        }
      };

      source.start(0);
    } catch {
      isPlayingRef.current = false;
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
      {/* Subtle warm ambient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
        }}
      />

      {/* Main content - centered, minimal */}
      <div className="relative flex flex-col items-center justify-center flex-1 px-4">

        {/* Avatar - the heart of the experience */}
        <EvaAvatar
          isSpeaking={isSpeaking}
          isListening={isListening}
          emotion={evaEmotion}
          isThinking={isThinking}
        />

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

        {/* Thinking indicator - very subtle */}
        <AnimatePresence>
          {isThinking && !currentText && (
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
            }}
          />

          {/* Microphone button - subtle, warm */}
          <motion.button
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onMouseLeave={stopListening}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
            disabled={!isConnected}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
            style={{
              backgroundColor: isListening ? HER_COLORS.coral : HER_COLORS.cream,
              color: isListening ? HER_COLORS.warmWhite : HER_COLORS.earth,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </motion.button>
        </div>

        {/* Connection status - minimal, only when disconnected */}
        <AnimatePresence>
          {!isConnected && (
            <motion.p
              className="text-center text-sm mt-3"
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

// Helper
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
