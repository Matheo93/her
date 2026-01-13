"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// Emotion to visual style mapping
const EMOTION_STYLES: Record<string, { color: string; glow: string; expression: string }> = {
  joy: { color: "from-amber-400 to-yellow-500", glow: "shadow-amber-500/50", expression: "Heureuse" },
  sadness: { color: "from-blue-400 to-indigo-500", glow: "shadow-blue-500/50", expression: "Triste" },
  anger: { color: "from-red-500 to-orange-500", glow: "shadow-red-500/50", expression: "En colère" },
  fear: { color: "from-purple-400 to-violet-500", glow: "shadow-purple-500/50", expression: "Inquiète" },
  surprise: { color: "from-pink-400 to-rose-500", glow: "shadow-pink-500/50", expression: "Surprise" },
  tenderness: { color: "from-rose-300 to-pink-400", glow: "shadow-rose-400/50", expression: "Tendre" },
  excitement: { color: "from-orange-400 to-amber-500", glow: "shadow-orange-500/50", expression: "Excitée" },
  neutral: { color: "from-zinc-400 to-slate-500", glow: "shadow-zinc-500/30", expression: "Sereine" },
};

export default function EvaHerPage() {
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [status, setStatus] = useState("Connexion...");
  const [userEmotion, setUserEmotion] = useState("neutral");
  const [evaEmotion, setEvaEmotion] = useState("neutral");
  const [currentText, setCurrentText] = useState("");
  const [thoughtPrefix, setThoughtPrefix] = useState<string | null>(null);
  const [showIdle, setShowIdle] = useState(true);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<{ audio: ArrayBuffer; emotion: string }[]>([]);
  const isPlayingRef = useRef(false);
  const idleVideoRef = useRef<HTMLVideoElement>(null);

  // Get emotion style
  const emotionStyle = EMOTION_STYLES[evaEmotion] || EMOTION_STYLES.neutral;

  // Connect to HER WebSocket
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws/her`);

      ws.onopen = () => {
        setIsConnected(true);
        setStatus("Connectée");
        // Configure session
        ws.send(JSON.stringify({
          type: "config",
          user_id: "eva_visual_user",
          voice: "french"
        }));
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatus("Déconnectée...");
        setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setStatus("Erreur connexion");
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "config_ok":
            setStatus("Prête");
            break;

          case "her_context":
            // HER context with emotions
            setUserEmotion(data.user_emotion || "neutral");
            setEvaEmotion(data.response_emotion || "neutral");
            setThoughtPrefix(data.thought_prefix);
            if (data.thought_prefix) {
              setStatus(`${data.thought_prefix}`);
            }
            break;

          case "speaking_start":
            setIsSpeaking(true);
            setShowIdle(false);
            setIsThinking(false);
            break;

          case "filler":
            // Instant filler sound
            if (data.audio_base64) {
              const audio = base64ToArrayBuffer(data.audio_base64);
              audioQueueRef.current.push({ audio, emotion: "neutral" });
              playNextAudio();
            }
            setStatus(data.text || "...");
            break;

          case "token":
            // Streaming text
            setCurrentText(prev => prev + data.content);
            setIsThinking(true);
            break;

          case "speech":
            // TTS audio chunk
            if (data.audio_base64) {
              const audio = base64ToArrayBuffer(data.audio_base64);
              audioQueueRef.current.push({ audio, emotion: data.emotion || "neutral" });
              playNextAudio();
            }
            setEvaEmotion(data.emotion || "neutral");
            break;

          case "breathing":
            // Natural breathing sound
            if (data.audio_base64) {
              const audio = base64ToArrayBuffer(data.audio_base64);
              audioQueueRef.current.push({ audio, emotion: "neutral" });
              playNextAudio();
            }
            break;

          case "speaking_end":
            setIsSpeaking(false);
            setIsThinking(false);
            setCurrentText("");
            setStatus(data.reason === "interrupted" ? "Interrompue" : "Prête");
            // Return to idle after delay
            setTimeout(() => setShowIdle(true), 500);
            break;

          case "proactive":
            // Eva initiates conversation
            setStatus("Eva veut te parler...");
            setCurrentText(data.content || "");
            if (data.audio_base64) {
              const audio = base64ToArrayBuffer(data.audio_base64);
              audioQueueRef.current.push({ audio, emotion: "tenderness" });
              playNextAudio();
            }
            break;

          case "silence":
            // Empathic silence
            setStatus("...");
            break;
        }
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  // Note: Avatar lip-sync via REST API (not WebSocket)
  // The idle video provides subtle movements
  // For full lip-sync, we'd need to call /lipsync endpoint per audio chunk

  // Play audio
  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);
    setShowIdle(false);

    const { audio: arrayBuffer, emotion } = audioQueueRef.current.shift()!;
    setEvaEmotion(emotion);

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const audioContext = audioContextRef.current;
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

      // Play audio
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      source.onended = () => {
        isPlayingRef.current = false;
        if (audioQueueRef.current.length > 0) {
          playNextAudio();
        } else {
          setIsSpeaking(false);
          setTimeout(() => setShowIdle(true), 500);
        }
      };

      source.start(0);
    } catch (e) {
      console.error("Audio error:", e);
      isPlayingRef.current = false;
      if (audioQueueRef.current.length > 0) {
        playNextAudio();
      } else {
        setIsSpeaking(false);
        setShowIdle(true);
      }
    }
  }, []);

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
        setStatus("Traitement...");

        // Convert to base64 and send
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
      setStatus("Parle...");
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
  const sendMessage = (text: string) => {
    if (!text.trim() || !wsRef.current) return;

    setCurrentText("");
    wsRef.current.send(JSON.stringify({
      type: "message",
      content: text,
      user_id: "eva_visual_user"
    }));
    setStatus("...");
    setIsThinking(true);
  };

  // Interrupt Eva
  const interruptEva = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "interrupt" }));
      audioQueueRef.current = [];
      setIsSpeaking(false);
      setShowIdle(true);
    }
  };

  // Text input handler
  const [inputText, setInputText] = useState("");
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
      setInputText("");
    }
  };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* Ambient background based on emotion */}
      <div
        className={`absolute inset-0 bg-gradient-radial from-transparent via-transparent to-black transition-all duration-1000`}
      >
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-3xl transition-all duration-700 opacity-30 bg-gradient-to-br ${emotionStyle.color}`}
        />
      </div>

      {/* Main container */}
      <div className="relative w-full h-full flex flex-col items-center justify-center">

        {/* Status bar */}
        <div className="absolute top-4 left-0 right-0 flex justify-center z-20">
          <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-black/50 backdrop-blur-sm border border-white/10">
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400" : "bg-red-400"} ${isSpeaking ? "animate-pulse" : ""}`} />
            <span className="text-white/80 text-sm">{status}</span>
            {userEmotion !== "neutral" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                Tu: {userEmotion}
              </span>
            )}
          </div>
        </div>

        {/* Avatar container */}
        <div className="relative">
          {/* Emotion glow ring */}
          <div
            className={`absolute -inset-4 rounded-full transition-all duration-500 ${
              isSpeaking
                ? `ring-4 ring-opacity-50 ${emotionStyle.glow} shadow-lg`
                : isListening
                  ? "ring-4 ring-emerald-400/50 shadow-emerald-500/30 shadow-lg"
                  : "ring-2 ring-white/20"
            }`}
            style={{
              boxShadow: isSpeaking ? `0 0 60px 20px rgba(244,63,94,0.3)` : undefined
            }}
          />

          {/* Avatar display */}
          <div className="relative w-80 h-80 md:w-[420px] md:h-[420px] rounded-full overflow-hidden bg-zinc-900">
            {/* Idle video (subtle movements) */}
            {showIdle && (
              <video
                ref={idleVideoRef}
                src="/avatars/eva_idle_transparent.webm"
                className="absolute inset-0 w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            )}

            {/* Lip-synced frame (when speaking) */}
            {!showIdle && avatarFrame && (
              <img
                src={avatarFrame}
                alt="Eva"
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}

            {/* Fallback static image */}
            {!showIdle && !avatarFrame && (
              <img
                src="/avatars/eva.jpg"
                alt="Eva"
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}

            {/* Emotion overlay effect */}
            <div
              className={`absolute inset-0 transition-opacity duration-500 pointer-events-none ${
                evaEmotion !== "neutral" ? "opacity-20" : "opacity-0"
              }`}
              style={{
                background: `radial-gradient(circle, transparent 40%, ${
                  evaEmotion === "joy" ? "rgba(251,191,36,0.3)" :
                  evaEmotion === "sadness" ? "rgba(96,165,250,0.3)" :
                  evaEmotion === "tenderness" ? "rgba(251,113,133,0.3)" :
                  "transparent"
                } 100%)`
              }}
            />
          </div>

          {/* Speaking pulse rings */}
          {isSpeaking && (
            <>
              <div className="absolute -inset-6 rounded-full border-2 border-rose-400/40 animate-ping" />
              <div className="absolute -inset-8 rounded-full border border-rose-400/20 animate-ping" style={{ animationDelay: "150ms" }} />
            </>
          )}

          {/* Listening indicator */}
          {isListening && (
            <div className="absolute -inset-6 rounded-full border-2 border-emerald-400/60 animate-pulse" />
          )}

          {/* Name and emotion */}
          <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-center">
            <p className="text-white font-semibold text-2xl">Eva</p>
            <p className={`text-sm mt-1 transition-colors duration-300 ${
              isSpeaking ? "text-rose-400" :
              isListening ? "text-emerald-400" :
              isThinking ? "text-amber-400" :
              "text-white/60"
            }`}>
              {isSpeaking ? emotionStyle.expression :
               isListening ? "T'écoute..." :
               isThinking ? "Réfléchit..." :
               "En attente"}
            </p>
          </div>
        </div>

        {/* Current text (what Eva is saying) */}
        {currentText && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 mt-56 max-w-lg text-center">
            <p className="text-white/80 text-lg leading-relaxed">
              {thoughtPrefix && <span className="text-rose-400 italic">{thoughtPrefix} </span>}
              {currentText}
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/80 to-transparent">
          <div className="max-w-2xl mx-auto space-y-4">

            {/* Text input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Écris quelque chose à Eva..."
                className="flex-1 px-4 py-3 rounded-full bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-rose-400/50"
              />
              <button
                onClick={() => { sendMessage(inputText); setInputText(""); }}
                disabled={!inputText.trim() || !isConnected}
                className="px-6 py-3 rounded-full bg-rose-500 hover:bg-rose-600 disabled:bg-white/10 disabled:text-white/30 text-white transition-all"
              >
                Envoyer
              </button>
            </div>

            {/* Voice controls */}
            <div className="flex items-center justify-center gap-4">
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
                    ? "bg-emerald-500 scale-110 shadow-lg shadow-emerald-500/50"
                    : isConnected
                      ? "bg-white/10 hover:bg-white/20 hover:scale-105"
                      : "bg-white/5 cursor-not-allowed"
                } text-white`}
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>

              {/* Interrupt button (when speaking) */}
              {isSpeaking && (
                <button
                  onClick={interruptEva}
                  className="px-4 py-2 rounded-full bg-red-500/80 hover:bg-red-500 text-white text-sm transition-all"
                >
                  Interrompre
                </button>
              )}
            </div>

            {isListening && (
              <p className="text-center text-emerald-400 text-sm animate-pulse">
                🎤 Parle maintenant... Relâche pour envoyer
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
