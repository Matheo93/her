"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const AVATAR_URL = process.env.NEXT_PUBLIC_AVATAR_URL || "http://localhost:8001";

export default function AvatarLive() {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("Initialisation...");
  const [avatarFrame, setAvatarFrame] = useState<string | null>("/avatars/eva.jpg");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const avatarWsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const playNextAudioRef = useRef<() => void>(() => {});

  // Check avatar engine health on mount
  useEffect(() => {
    fetch(`${AVATAR_URL}/health`)
      .then(res => res.json())
      .then(data => {
        if (data.status === "healthy") {
          setStatus("Avatar prêt");
        }
      })
      .catch(() => {
        setError("Avatar non disponible");
      });
  }, []);

  // Connect to backend WebSocket
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws/stream`);

      ws.onopen = () => {
        setIsConnected(true);
        setStatus("Connectée");
        ws.send(JSON.stringify({
          type: "config",
          voice: "eva",
          auto_mood: true,
        }));
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatus("Reconnexion...");
        setTimeout(connect, 3000);
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer();
          audioQueueRef.current.push(arrayBuffer);
          playNextAudioRef.current();
          return;
        }

        const data = JSON.parse(event.data);

        switch (data.type) {
          case "transcript":
            setStatus(`"${data.text}"`);
            break;
          case "response_end":
            setStatus("Eva a répondu");
            break;
          case "audio_start":
            setIsSpeaking(true);
            break;
          case "error":
            setError(data.message);
            break;
        }
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  // Connect to Avatar WebSocket for real-time lip-sync
  useEffect(() => {
    const connectAvatar = () => {
      const ws = new WebSocket(`${AVATAR_URL.replace("http", "ws")}/ws/avatar`);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "config", avatar_id: "eva" }));
      };

      ws.onclose = () => {
        setTimeout(connectAvatar, 3000);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof Blob) {
          const url = URL.createObjectURL(event.data);
          setAvatarFrame(prev => {
            if (prev && prev.startsWith("blob:")) {
              URL.revokeObjectURL(prev);
            }
            return url;
          });
        }
      };

      avatarWsRef.current = ws;
    };

    connectAvatar();
    return () => avatarWsRef.current?.close();
  }, []);

  // Play audio and send to avatar for lip-sync
  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const arrayBuffer = audioQueueRef.current.shift()!;

    try {
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

      // Send audio to avatar engine for lip-sync
      if (avatarWsRef.current?.readyState === WebSocket.OPEN) {
        const pcmData = audioBuffer.getChannelData(0);
        const int16Array = new Int16Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
          int16Array[i] = Math.max(-32768, Math.min(32767, pcmData[i] * 32768));
        }
        avatarWsRef.current.send(int16Array.buffer);
      }

      // Play the audio
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      source.onended = () => {
        isPlayingRef.current = false;
        if (audioQueueRef.current.length > 0) {
          playNextAudioRef.current();
        } else {
          setIsSpeaking(false);
          setAvatarFrame("/avatars/eva.jpg");
        }
      };

      source.start(0);
    } catch (e) {
      console.error("Audio play error:", e);
      isPlayingRef.current = false;
      setIsSpeaking(false);
      if (audioQueueRef.current.length > 0) {
        playNextAudioRef.current();
      }
    }
  }, []);

  // Keep ref updated with latest callback
  useEffect(() => {
    playNextAudioRef.current = playNextAudio;
  }, [playNextAudio]);

  // Voice recording - Push to talk
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
        setStatus("Traitement...");

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          audioQueueRef.current = [];
          wsRef.current.send(blob);
        }
      };

      mediaRecorder.start();
      setIsListening(true);
      setStatus("Je t'écoute...");
    } catch (err) {
      console.error("Mic error:", err);
      setError("Erreur micro");
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Test TTS with avatar
  const testSpeak = async () => {
    setStatus("Test...");

    try {
      const response = await fetch(`${BACKEND_URL}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Salut ! Je suis Eva. Comment vas-tu aujourd'hui ?",
          voice: "eva"
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        audioQueueRef.current.push(arrayBuffer);
        playNextAudio();
      }
    } catch (e) {
      setError("Erreur: " + (e as Error).message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
      }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{
            background: isSpeaking
              ? HER_COLORS.glowCoral
              : isListening
                ? HER_COLORS.glowWarm
                : `${HER_COLORS.softShadow}20`,
            filter: "blur(80px)",
          }}
          animate={{
            scale: isSpeaking ? [1, 1.1, 1] : isListening ? [1, 1.05, 1] : 1,
            opacity: isSpeaking ? 0.6 : isListening ? 0.4 : 0.2,
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Main content */}
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        {/* Status */}
        <div className="absolute top-6 left-0 right-0 flex flex-col items-center gap-2">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full"
            style={{
              backgroundColor: `${HER_COLORS.cream}E6`,
              border: `1px solid ${HER_COLORS.softShadow}40`,
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={HER_SPRINGS.gentle}
          >
            <motion.div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: isConnected ? HER_COLORS.success : HER_COLORS.error,
              }}
              animate={{
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
              }}
            />
            <span className="text-sm" style={{ color: HER_COLORS.textSecondary }}>
              {status}
            </span>
          </motion.div>
          {error && (
            <motion.div
              className="px-4 py-2 rounded-full text-sm"
              style={{
                backgroundColor: `${HER_COLORS.error}20`,
                color: HER_COLORS.error,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}
        </div>

        {/* Back button */}
        <motion.button
          onClick={() => router.push("/")}
          className="absolute top-6 left-6 p-2 rounded-full transition-all"
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

        {/* Avatar Display */}
        <div className="relative">
          {/* Glow ring */}
          <motion.div
            className="absolute -inset-4 rounded-full"
            style={{
              border: isSpeaking
                ? `3px solid ${HER_COLORS.coral}`
                : isListening
                  ? `3px solid ${HER_COLORS.blush}`
                  : `2px solid ${HER_COLORS.softShadow}40`,
              boxShadow: isSpeaking
                ? `0 0 60px ${HER_COLORS.glowCoral}`
                : isListening
                  ? `0 0 40px ${HER_COLORS.glowWarm}`
                  : "none",
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

          {/* Avatar Image */}
          <motion.div
            className="relative w-72 h-72 md:w-96 md:h-96 rounded-full overflow-hidden"
            style={{
              backgroundColor: HER_COLORS.cream,
              boxShadow: `0 8px 40px ${HER_COLORS.softShadow}60`,
            }}
          >
            {avatarFrame ? (
              <img
                src={avatarFrame}
                alt="Eva"
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ color: HER_COLORS.textMuted }}
              >
                Chargement...
              </div>
            )}
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
                className="absolute -inset-8 rounded-full"
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
                  delay: 0.3,
                }}
              />
            </>
          )}

          {/* Name and status */}
          <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-center">
            <p className="font-light text-2xl" style={{ color: HER_COLORS.earth }}>
              Eva
            </p>
            <p className="text-sm mt-1" style={{ color: HER_COLORS.textSecondary }}>
              {isSpeaking ? "Parle..." : isListening ? "T'écoute..." : "En attente"}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div
          className="absolute bottom-0 left-0 right-0 p-8"
          style={{
            background: `linear-gradient(to top, ${HER_COLORS.warmWhite} 0%, transparent 100%)`,
          }}
        >
          <div className="flex flex-col items-center gap-4 max-w-md mx-auto">
            <div className="flex items-center gap-4">
              {/* Push to talk button */}
              <motion.button
                onMouseDown={startListening}
                onMouseUp={stopListening}
                onMouseLeave={stopListening}
                onTouchStart={startListening}
                onTouchEnd={stopListening}
                disabled={!isConnected}
                className="w-16 h-16 rounded-full flex items-center justify-center transition-all"
                style={{
                  backgroundColor: isListening
                    ? HER_COLORS.coral
                    : isConnected
                      ? HER_COLORS.cream
                      : `${HER_COLORS.cream}60`,
                  color: isListening ? HER_COLORS.warmWhite : HER_COLORS.earth,
                  boxShadow: isListening
                    ? `0 0 30px ${HER_COLORS.glowCoral}`
                    : `0 4px 16px ${HER_COLORS.softShadow}40`,
                  cursor: isConnected ? "pointer" : "not-allowed",
                }}
                whileHover={isConnected ? { scale: 1.05 } : {}}
                whileTap={isConnected ? { scale: 0.95 } : {}}
                animate={{
                  scale: isListening ? [1, 1.05, 1] : 1,
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

              {/* Test TTS button */}
              <motion.button
                onClick={testSpeak}
                disabled={!isConnected || isSpeaking}
                className="px-5 py-3 rounded-2xl transition-all"
                style={{
                  backgroundColor: isConnected && !isSpeaking ? HER_COLORS.coral : `${HER_COLORS.cream}60`,
                  color: isConnected && !isSpeaking ? HER_COLORS.warmWhite : HER_COLORS.textMuted,
                  boxShadow: isConnected && !isSpeaking ? `0 4px 16px ${HER_COLORS.glowCoral}` : "none",
                  cursor: isConnected && !isSpeaking ? "pointer" : "not-allowed",
                }}
                whileHover={isConnected && !isSpeaking ? { scale: 1.02 } : {}}
                whileTap={isConnected && !isSpeaking ? { scale: 0.98 } : {}}
              >
                Test
              </motion.button>
            </div>

            {isListening && (
              <motion.p
                className="text-sm"
                style={{ color: HER_COLORS.coral }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                Parle maintenant...
              </motion.p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
