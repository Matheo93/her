"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const AVATAR_URL = process.env.NEXT_PUBLIC_AVATAR_URL || "http://localhost:8001";

export default function LipSyncPage() {
  const [status, setStatus] = useState("Initialisation...");
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [currentFrame, setCurrentFrame] = useState<string>("/avatars/eva.jpg");

  const wsRef = useRef<WebSocket | null>(null);
  const lipsyncWsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const frameUrlRef = useRef<string | null>(null);

  // Connect to backend for TTS
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws/stream`);

      ws.onopen = () => {
        setIsConnected(true);
        setStatus("Connecté");
        ws.send(JSON.stringify({ type: "config", voice: "eva", auto_mood: true }));
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatus("Déconnecté...");
        setTimeout(connect, 3000);
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          // Got TTS audio - send to lip-sync engine
          const arrayBuffer = await event.data.arrayBuffer();

          // Play audio
          playAudioWithLipSync(arrayBuffer);
          return;
        }

        const data = JSON.parse(event.data);
        if (data.type === "transcript") {
          setStatus(`Tu: "${data.text}"`);
        } else if (data.type === "response_end") {
          setStatus("Eva a répondu");
        }
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  // Connect to lip-sync WebSocket
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${AVATAR_URL.replace("http", "ws")}/ws/lipsync`);

      ws.onopen = () => {
        console.log("Lip-sync connected");
        ws.send(JSON.stringify({ type: "config", avatar_id: "eva" }));
      };

      ws.onmessage = (event) => {
        if (event.data instanceof Blob) {
          // Received lip-synced frame - display it
          const url = URL.createObjectURL(event.data);

          // Revoke old URL to prevent memory leak
          if (frameUrlRef.current) {
            URL.revokeObjectURL(frameUrlRef.current);
          }
          frameUrlRef.current = url;
          setCurrentFrame(url);
        } else {
          const data = JSON.parse(event.data);
          if (data.type === "done") {
            // Lip-sync done, show static frame
            setIsSpeaking(false);
            setCurrentFrame("/avatars/eva.jpg");
          }
        }
      };

      ws.onclose = () => {
        console.log("Lip-sync disconnected, reconnecting...");
        setTimeout(connect, 3000);
      };

      ws.onerror = (e) => {
        console.error("Lip-sync error:", e);
      };

      lipsyncWsRef.current = ws;
    };

    connect();
    return () => lipsyncWsRef.current?.close();
  }, []);

  // Play audio and send to lip-sync engine
  const playAudioWithLipSync = async (arrayBuffer: ArrayBuffer) => {
    setIsSpeaking(true);

    try {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

      // Convert to 16-bit PCM for lip-sync
      const channelData = audioBuffer.getChannelData(0);
      const pcm16 = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(channelData[i] * 32767)));
      }

      // Send to lip-sync engine
      if (lipsyncWsRef.current?.readyState === WebSocket.OPEN) {
        lipsyncWsRef.current.send(pcm16.buffer);
      }

      // Play audio
      const playContext = new AudioContext();
      const playBuffer = await playContext.decodeAudioData(arrayBuffer.slice(0));
      const source = playContext.createBufferSource();
      source.buffer = playBuffer;
      source.connect(playContext.destination);

      source.onended = () => {
        setIsSpeaking(false);
        // Reset to static after a small delay
        setTimeout(() => setCurrentFrame("/avatars/eva.jpg"), 500);
      };

      source.start(0);
    } catch (e) {
      console.error("Audio error:", e);
      setIsSpeaking(false);
    }
  };

  // Record voice
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
          wsRef.current.send(blob);
        }
      };

      mediaRecorder.start();
      setIsListening(true);
      setStatus("Parle maintenant...");
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

  // Test TTS
  const testSpeak = async () => {
    setStatus("Test parole...");
    try {
      const res = await fetch(`${BACKEND_URL}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Salut ! Je suis Eva. Comment vas-tu ?", voice: "eva" }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        playAudioWithLipSync(arrayBuffer);
      }
    } catch (e) {
      setStatus("Erreur TTS");
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      {/* Status */}
      <div className="absolute top-4 left-4 right-4 flex justify-center">
        <div className="px-4 py-2 bg-white/10 rounded-full text-white/80 text-sm flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
          {status}
        </div>
      </div>

      {/* Avatar */}
      <div className="relative">
        {/* Glow effect */}
        <div
          className={`absolute -inset-4 rounded-full transition-all duration-300 ${
            isSpeaking
              ? "ring-4 ring-rose-500/50 shadow-[0_0_60px_rgba(244,63,94,0.4)]"
              : isListening
                ? "ring-4 ring-green-500/50 shadow-[0_0_60px_rgba(34,197,94,0.4)]"
                : "ring-2 ring-white/20"
          }`}
        />

        {/* Avatar frame - THIS IS THE REAL LIP-SYNC */}
        <div className="w-80 h-80 md:w-96 md:h-96 rounded-full overflow-hidden bg-zinc-900">
          <img
            src={currentFrame}
            alt="Eva"
            className="w-full h-full object-cover"
            style={{ imageRendering: "auto" }}
          />
        </div>

        {/* Pulse rings when speaking */}
        {isSpeaking && (
          <>
            <div className="absolute -inset-6 rounded-full border-2 border-rose-500/30 animate-ping" />
            <div className="absolute -inset-8 rounded-full border border-rose-500/20 animate-ping" style={{ animationDelay: "150ms" }} />
          </>
        )}

        {/* Name */}
        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-center">
          <p className="text-white font-semibold text-xl">Eva</p>
          <p className="text-white/60 text-sm">
            {isSpeaking ? "Parle..." : isListening ? "T'écoute..." : "Wav2Lip Real-time"}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-4">
        <div className="flex gap-4">
          {/* Push to talk */}
          <button
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onMouseLeave={stopListening}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
            disabled={!isConnected}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              isListening
                ? "bg-green-500 scale-110 shadow-lg shadow-green-500/50"
                : isConnected
                  ? "bg-white/10 hover:bg-white/20"
                  : "bg-white/5 cursor-not-allowed"
            } text-white`}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>

          {/* Test button */}
          <button
            onClick={testSpeak}
            disabled={!isConnected || isSpeaking}
            className="px-6 py-3 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-500/30 rounded-full text-white transition-all"
          >
            Test Parole
          </button>
        </div>

        {isListening && (
          <p className="text-green-400 text-sm animate-pulse">🎤 Parle... Relâche pour envoyer</p>
        )}

        <a href="/" className="text-white/40 hover:text-white/60 text-sm">← Retour</a>
      </div>
    </div>
  );
}
