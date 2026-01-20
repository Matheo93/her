"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { HER_COLORS, HER_SPRINGS, EMOTION_PRESENCE } from "@/styles/her-theme";

// Get backend URL - auto-detect public tunnel
function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const customBackend = params.get("backend");
    if (customBackend) return customBackend;

    if (window.location.hostname.includes("trycloudflare.com")) {
      return "https://safari-launches-decor-reader.trycloudflare.com";
    }
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
}

const LIPSYNC_URL = process.env.NEXT_PUBLIC_LIPSYNC_URL || "http://localhost:8001";

// HER-style warm emotion labels
const EMOTION_LABELS: Record<string, string> = {
  joy: "Joyeuse",
  sadness: "Mélancolique",
  anger: "Intense",
  fear: "Inquiète",
  surprise: "Surprise",
  tenderness: "Tendre",
  excitement: "Enthousiaste",
  neutral: "Sereine",
};

export default function EvaLivePage() {
  const router = useRouter();

  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Connexion...");
  const [evaEmotion, setEvaEmotion] = useState("neutral");
  const [userEmotion, setUserEmotion] = useState("neutral");
  const [currentText, setCurrentText] = useState("");
  const [inputText, setInputText] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const audioQueueRef = useRef<{ audio: ArrayBuffer; text: string; emotion: string }[]>([]);
  const isPlayingRef = useRef(false);
  const processAudioQueueRef = useRef<() => void>(() => {});

  const currentPresence = EMOTION_PRESENCE[evaEmotion] || EMOTION_PRESENCE.neutral;

  // Connect to HER WebSocket
  useEffect(() => {
    const connect = () => {
      const backendUrl = getBackendUrl();
      const wsUrl = backendUrl.replace("https://", "wss://").replace("http://", "ws://");

      const ws = new WebSocket(`${wsUrl}/ws/her`);

      ws.onopen = () => {
        setIsConnected(true);
        setStatus("Connectée");
        ws.send(JSON.stringify({
          type: "config",
          user_id: "eva_live_user",
          voice: "french"
        }));
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatus("Reconnexion...");
        setTimeout(connect, 3000);
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "config_ok":
            setStatus("Prête");
            break;

          case "her_context":
            setUserEmotion(data.user_emotion || "neutral");
            setEvaEmotion(data.response_emotion || "neutral");
            if (data.thought_prefix) {
              setCurrentText(data.thought_prefix + " ");
            }
            break;

          case "speaking_start":
            setIsSpeaking(true);
            setIsProcessing(false);
            break;

          case "filler":
            setStatus("Eva réfléchit...");
            break;

          case "token":
            setCurrentText(prev => prev + data.content);
            break;

          case "speech":
            if (data.audio_base64) {
              const audio = base64ToArrayBuffer(data.audio_base64);
              audioQueueRef.current.push({
                audio,
                text: data.text || "",
                emotion: data.emotion || "neutral"
              });
              processAudioQueueRef.current();
            }
            break;

          case "speaking_end":
            setCurrentText("");
            setStatus(data.reason === "interrupted" ? "Interrompue" : "Prête");
            break;

          case "proactive":
            setStatus("Eva veut te parler...");
            if (data.audio_base64) {
              const audio = base64ToArrayBuffer(data.audio_base64);
              audioQueueRef.current.push({
                audio,
                text: data.content || "",
                emotion: "tenderness"
              });
              processAudioQueueRef.current();
            }
            break;
        }
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  // Fallback audio playback
  const playAudioOnly = useCallback(async (audioData: ArrayBuffer): Promise<void> => {
    return new Promise((resolve) => {
      const audioContext = new AudioContext();
      audioContext.decodeAudioData(audioData.slice(0), (buffer) => {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.onended = () => resolve();
        source.start(0);
      }, () => resolve());
    });
  }, []);

  // Process audio queue with lip-sync
  const processAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const { audio, emotion } = audioQueueRef.current.shift()!;
    setEvaEmotion(emotion);
    setStatus(EMOTION_LABELS[emotion] || "Parle...");

    try {
      const audioBlob = new Blob([audio], { type: "audio/wav" });
      const formData = new FormData();
      formData.append("audio", audioBlob, "speech.wav");

      const lipsyncResponse = await fetch(`${LIPSYNC_URL}/lipsync`, {
        method: "POST",
        body: formData,
      });

      if (lipsyncResponse.ok) {
        const result = await lipsyncResponse.json();

        if (result.video_base64 && videoRef.current) {
          const videoBlob = base64ToBlob(result.video_base64, "video/mp4");
          const videoUrl = URL.createObjectURL(videoBlob);

          videoRef.current.src = videoUrl;
          videoRef.current.style.display = "block";
          if (idleVideoRef.current) idleVideoRef.current.style.display = "none";

          await videoRef.current.play();

          await new Promise<void>((resolve) => {
            if (videoRef.current) {
              videoRef.current.onended = () => {
                URL.revokeObjectURL(videoUrl);
                resolve();
              };
            }
          });
        }
      } else {
        await playAudioOnly(audio);
      }

    } catch (error) {
      console.error("Lip-sync error:", error);
      await playAudioOnly(audio);
    }

    if (videoRef.current) videoRef.current.style.display = "none";
    if (idleVideoRef.current) idleVideoRef.current.style.display = "block";

    isPlayingRef.current = false;

    if (audioQueueRef.current.length > 0) {
      processAudioQueueRef.current();
    } else {
      setIsSpeaking(false);
      setStatus("Prête");
    }
  }, [playAudioOnly]);

  useEffect(() => {
    processAudioQueueRef.current = processAudioQueue;
  }, [processAudioQueue]);

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
        setIsProcessing(true);
        setStatus("Traitement...");

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
      setStatus("Je t'écoute...");
    } catch (err) {
      console.error("Mic error:", err);
      setStatus("Erreur micro");
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Send text message
  const sendMessage = () => {
    if (!inputText.trim() || !wsRef.current) return;

    setIsProcessing(true);
    setCurrentText("");
    wsRef.current.send(JSON.stringify({
      type: "message",
      content: inputText,
      user_id: "eva_live_user"
    }));
    setInputText("");
    setStatus("Eva réfléchit...");
  };

  // Interrupt
  const interrupt = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "interrupt" }));
      audioQueueRef.current = [];
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.style.display = "none";
      }
      if (idleVideoRef.current) idleVideoRef.current.style.display = "block";
      setIsSpeaking(false);
      isPlayingRef.current = false;
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
      }}
    >
      {/* Ambient glow */}
      <motion.div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 40%, ${currentPresence.glow} 0%, transparent 50%)`
        }}
        animate={{
          opacity: isSpeaking ? 0.8 : 0.4,
        }}
        transition={{ duration: 0.7 }}
      />

      {/* Back button */}
      <motion.button
        onClick={() => router.push("/")}
        className="fixed top-6 left-6 p-2 rounded-full z-50"
        style={{
          backgroundColor: HER_COLORS.cream,
          color: HER_COLORS.earth,
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </motion.button>

      {/* Status bar */}
      <motion.div
        className="fixed top-6 left-0 right-0 flex justify-center z-40"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={HER_SPRINGS.gentle}
      >
        <div
          className="flex items-center gap-3 px-5 py-2.5 rounded-full"
          style={{
            backgroundColor: `${HER_COLORS.cream}E6`,
            border: `1px solid ${HER_COLORS.softShadow}40`,
          }}
        >
          <motion.div
            className="w-2.5 h-2.5 rounded-full"
            style={{
              backgroundColor: isConnected
                ? (isSpeaking ? HER_COLORS.coral : HER_COLORS.success)
                : HER_COLORS.error,
            }}
            animate={{
              scale: isSpeaking ? [1, 1.3, 1] : [1, 1.1, 1],
            }}
            transition={{
              duration: isSpeaking ? 0.8 : 2,
              repeat: Infinity,
            }}
          />
          <span className="text-sm" style={{ color: HER_COLORS.textSecondary }}>
            {status}
          </span>
          {userEmotion !== "neutral" && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${HER_COLORS.softShadow}40`,
                color: HER_COLORS.textSecondary,
              }}
            >
              Toi: {EMOTION_LABELS[userEmotion] || userEmotion}
            </span>
          )}
        </div>
      </motion.div>

      {/* Avatar container */}
      <div className="relative mb-8">
        {/* Glow ring */}
        <motion.div
          className="absolute -inset-4 rounded-full"
          style={{
            boxShadow: isSpeaking
              ? `0 0 60px 20px ${currentPresence.glow}, 0 0 100px 40px ${currentPresence.glow}`
              : isListening
                ? `0 0 40px 15px ${HER_COLORS.glowWarm}`
                : `0 0 20px 8px ${HER_COLORS.softShadow}20`
          }}
          animate={{
            scale: isSpeaking ? [1, 1.02, 1] : 1,
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Video container */}
        <motion.div
          className="relative w-72 h-72 md:w-96 md:h-96 rounded-full overflow-hidden"
          style={{
            backgroundColor: HER_COLORS.cream,
            border: isSpeaking
              ? `3px solid ${HER_COLORS.coral}`
              : isListening
                ? `3px solid ${HER_COLORS.blush}`
                : `2px solid ${HER_COLORS.softShadow}40`,
            boxShadow: `0 8px 40px ${HER_COLORS.softShadow}60`,
          }}
        >
          {/* Idle video */}
          <video
            ref={idleVideoRef}
            src="/avatars/eva_idle_transparent.webm"
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
          />

          {/* Lip-synced video */}
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ display: "none" }}
            playsInline
          />
        </motion.div>

        {/* Speaking animation rings */}
        {isSpeaking && (
          <>
            <motion.div
              className="absolute -inset-6 rounded-full"
              style={{
                border: `2px solid ${HER_COLORS.coral}40`,
              }}
              animate={{
                scale: [1, 1.3],
                opacity: [0.6, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
            <motion.div
              className="absolute -inset-10 rounded-full"
              style={{
                border: `1px solid ${HER_COLORS.coral}20`,
              }}
              animate={{
                scale: [1, 1.4],
                opacity: [0.4, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeOut",
                delay: 0.2,
              }}
            />
          </>
        )}

        {/* Name & emotion */}
        <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 text-center">
          <h2 className="text-2xl font-light" style={{ color: HER_COLORS.earth }}>
            Eva
          </h2>
          <p
            className="text-sm mt-1"
            style={{
              color: isSpeaking
                ? HER_COLORS.coral
                : isListening
                  ? HER_COLORS.blush
                  : HER_COLORS.textSecondary,
            }}
          >
            {isSpeaking
              ? EMOTION_LABELS[evaEmotion] || "Parle..."
              : isListening
                ? "T'écoute..."
                : isProcessing
                  ? "Réfléchit..."
                  : "En ligne"}
          </p>
        </div>
      </div>

      {/* Current text */}
      {currentText && (
        <motion.div
          className="max-w-lg mx-auto mb-8 px-6 py-4 rounded-2xl"
          style={{
            backgroundColor: `${HER_COLORS.cream}E6`,
            border: `1px solid ${HER_COLORS.softShadow}40`,
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={HER_SPRINGS.gentle}
        >
          <p className="text-center leading-relaxed" style={{ color: HER_COLORS.earth }}>
            {currentText}
          </p>
        </motion.div>
      )}

      {/* Controls */}
      <div
        className="fixed bottom-0 left-0 right-0 p-6"
        style={{
          background: `linear-gradient(to top, ${HER_COLORS.warmWhite} 0%, transparent 100%)`,
        }}
      >
        <div className="max-w-xl mx-auto space-y-4">
          {/* Text input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Écris à Eva..."
              className="flex-1 px-5 py-3 rounded-2xl focus:outline-none transition-all"
              style={{
                backgroundColor: HER_COLORS.cream,
                border: `1px solid ${HER_COLORS.softShadow}`,
                color: HER_COLORS.earth,
              }}
            />
            <motion.button
              onClick={sendMessage}
              disabled={!inputText.trim() || !isConnected}
              className="px-6 py-3 rounded-2xl font-medium transition-all"
              style={{
                backgroundColor: inputText.trim() && isConnected ? HER_COLORS.coral : `${HER_COLORS.cream}60`,
                color: inputText.trim() && isConnected ? HER_COLORS.warmWhite : HER_COLORS.textMuted,
                boxShadow: inputText.trim() && isConnected ? `0 4px 16px ${HER_COLORS.glowCoral}` : "none",
                cursor: inputText.trim() && isConnected ? "pointer" : "not-allowed",
              }}
              whileHover={inputText.trim() && isConnected ? { scale: 1.02 } : {}}
              whileTap={inputText.trim() && isConnected ? { scale: 0.98 } : {}}
            >
              Envoyer
            </motion.button>
          </div>

          {/* Voice controls */}
          <div className="flex items-center justify-center gap-4">
            {/* Push to talk */}
            <motion.button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              disabled={!isConnected || isSpeaking}
              className="w-16 h-16 rounded-full flex items-center justify-center transition-all"
              style={{
                backgroundColor: isListening
                  ? HER_COLORS.coral
                  : isConnected && !isSpeaking
                    ? HER_COLORS.cream
                    : `${HER_COLORS.cream}60`,
                color: isListening ? HER_COLORS.warmWhite : HER_COLORS.earth,
                boxShadow: isListening
                  ? `0 0 30px ${HER_COLORS.glowCoral}`
                  : `0 4px 16px ${HER_COLORS.softShadow}40`,
                cursor: isConnected && !isSpeaking ? "pointer" : "not-allowed",
                opacity: isConnected && !isSpeaking ? 1 : 0.6,
              }}
              whileHover={isConnected && !isSpeaking ? { scale: 1.05 } : {}}
              whileTap={isConnected && !isSpeaking ? { scale: 0.95 } : {}}
              animate={{
                scale: isListening ? [1, 1.08, 1] : 1,
              }}
              transition={{
                duration: 1,
                repeat: isListening ? Infinity : 0,
              }}
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </motion.button>

            {/* Interrupt */}
            {isSpeaking && (
              <motion.button
                onClick={interrupt}
                className="px-5 py-2.5 rounded-2xl font-medium transition-all"
                style={{
                  backgroundColor: HER_COLORS.earth,
                  color: HER_COLORS.warmWhite,
                }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Stop
              </motion.button>
            )}
          </div>

          {isListening && (
            <motion.p
              className="text-center text-sm"
              style={{ color: HER_COLORS.coral }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              Parle maintenant... Relâche pour envoyer
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
}

// Helpers
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
