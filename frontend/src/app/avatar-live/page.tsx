"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const AVATAR_URL = process.env.NEXT_PUBLIC_AVATAR_URL || "http://localhost:8001";

export default function AvatarLive() {
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
          setStatus("Avatar Engine prêt (" + data.device + ")");
        }
      })
      .catch(() => {
        setError("Avatar Engine non disponible");
      });
  }, []);

  // Connect to backend WebSocket
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws/stream`);

      ws.onopen = () => {
        setIsConnected(true);
        setStatus("Connecté au backend");
        ws.send(JSON.stringify({
          type: "config",
          voice: "eva",
          auto_mood: true,
        }));
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatus("Déconnecté, reconnexion...");
        setTimeout(connect, 3000);
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          // Audio data from TTS - queue it
          const arrayBuffer = await event.data.arrayBuffer();
          audioQueueRef.current.push(arrayBuffer);
          playNextAudioRef.current();
          return;
        }

        const data = JSON.parse(event.data);

        switch (data.type) {
          case "transcript":
            setStatus(`Tu as dit: "${data.text}"`);
            break;
          case "token":
            // Eva is responding
            break;
          case "response_end":
            setStatus("Eva a fini de répondre");
            break;
          case "audio_start":
            setIsSpeaking(true);
            break;
          case "audio_end":
            // Audio streaming done, but might still be playing
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
        console.log("Avatar WS connected");
        ws.send(JSON.stringify({ type: "config", avatar_id: "eva" }));
      };

      ws.onclose = () => {
        console.log("Avatar WS disconnected, reconnecting...");
        setTimeout(connectAvatar, 3000);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof Blob) {
          // Received lip-synced frame
          const url = URL.createObjectURL(event.data);
          setAvatarFrame(prev => {
            if (prev && prev.startsWith("blob:")) {
              URL.revokeObjectURL(prev);
            }
            return url;
          });
        }
      };

      ws.onerror = (e) => {
        console.error("Avatar WS error:", e);
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
        // Convert AudioBuffer to raw PCM for lip-sync
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
          // Reset to static frame
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
        setStatus("Traitement de ta voix...");

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          audioQueueRef.current = [];
          wsRef.current.send(blob);
        }
      };

      mediaRecorder.start();
      setIsListening(true);
      setStatus("Écoute en cours... Relâche pour envoyer");
    } catch (err) {
      console.error("Mic error:", err);
      setError("Erreur d'accès au micro");
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Test TTS with avatar
  const testSpeak = async () => {
    setStatus("Test de parole...");

    try {
      const response = await fetch(`${BACKEND_URL}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Salut ! Je suis Eva, ton assistante vocale. Comment vas-tu aujourd'hui ?",
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
      setError("Erreur TTS: " + (e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-zinc-900 via-black to-zinc-900">
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-3xl transition-all duration-1000 ${
            isSpeaking
              ? "bg-rose-500/20 scale-110"
              : isListening
                ? "bg-emerald-500/20 animate-pulse"
                : "bg-zinc-500/10"
          }`}
        />
      </div>

      {/* Main content */}
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        {/* Status */}
        <div className="absolute top-6 left-0 right-0 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur">
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400" : "bg-red-400"}`} />
            <span className="text-white/80 text-sm">{status}</span>
          </div>
          {error && (
            <div className="mt-2 px-4 py-2 rounded-full bg-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Avatar Display */}
        <div className="relative">
          {/* Glow rings */}
          <div
            className={`absolute -inset-4 rounded-full transition-all duration-300 ${
              isSpeaking
                ? "ring-4 ring-rose-400/50 shadow-[0_0_80px_rgba(244,63,94,0.5)]"
                : isListening
                  ? "ring-4 ring-emerald-400/50 shadow-[0_0_60px_rgba(52,211,153,0.4)]"
                  : "ring-2 ring-white/20"
            }`}
          />

          {/* Avatar Image - Real Wav2Lip frames */}
          <div className="relative w-80 h-80 md:w-[400px] md:h-[400px] rounded-full overflow-hidden bg-zinc-800">
            {avatarFrame ? (
              <img
                src={avatarFrame}
                alt="Eva"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/40">
                Chargement...
              </div>
            )}
          </div>

          {/* Speaking pulse rings */}
          {isSpeaking && (
            <>
              <div className="absolute -inset-6 rounded-full border-2 border-rose-400/40 animate-ping" />
              <div className="absolute -inset-8 rounded-full border border-rose-400/20 animate-ping" style={{ animationDelay: "0.2s" }} />
            </>
          )}

          {/* Status text */}
          <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-center">
            <p className="text-white font-semibold text-2xl">Eva</p>
            <p className="text-white/60 text-sm mt-1">
              {isSpeaking ? "Parle..." : isListening ? "T'écoute..." : "En attente"}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex flex-col items-center gap-4 max-w-md mx-auto">
            <p className="text-white/60 text-sm">Avatar Wav2Lip - Lip-sync réel</p>

            <div className="flex items-center gap-4">
              {/* Push to talk button */}
              <button
                onMouseDown={startListening}
                onMouseUp={stopListening}
                onMouseLeave={stopListening}
                onTouchStart={startListening}
                onTouchEnd={stopListening}
                disabled={!isConnected}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                  isListening
                    ? "bg-gradient-to-br from-emerald-500 to-teal-500 text-white scale-110 shadow-lg shadow-emerald-500/50"
                    : isConnected
                      ? "bg-white/10 hover:bg-white/20 text-white hover:scale-105"
                      : "bg-white/5 text-white/30 cursor-not-allowed"
                }`}
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>

              {/* Test TTS button */}
              <button
                onClick={testSpeak}
                disabled={!isConnected || isSpeaking}
                className={`px-6 py-3 rounded-full transition-all ${
                  isConnected && !isSpeaking
                    ? "bg-rose-500 hover:bg-rose-600 text-white"
                    : "bg-white/5 text-white/30 cursor-not-allowed"
                }`}
              >
                Test Parole
              </button>
            </div>

            {isListening && (
              <p className="text-emerald-400 text-sm animate-pulse">
                🎤 Parle maintenant... Relâche pour envoyer
              </p>
            )}

            {/* Back to chat */}
            <Link href="/" className="text-white/40 hover:text-white/60 text-sm mt-4 transition-colors">
              ← Retour au chat
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
