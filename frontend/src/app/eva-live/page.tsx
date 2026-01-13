"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const LIPSYNC_URL = process.env.NEXT_PUBLIC_LIPSYNC_URL || "http://localhost:8001";

// Emotion styles
const EMOTION_STYLES: Record<string, { color: string; glow: string; label: string }> = {
  joy: { color: "from-amber-400 to-yellow-500", glow: "rgba(251,191,36,0.4)", label: "Heureuse" },
  sadness: { color: "from-blue-400 to-indigo-500", glow: "rgba(96,165,250,0.4)", label: "Triste" },
  anger: { color: "from-red-500 to-orange-500", glow: "rgba(239,68,68,0.4)", label: "En colère" },
  fear: { color: "from-purple-400 to-violet-500", glow: "rgba(167,139,250,0.4)", label: "Inquiète" },
  surprise: { color: "from-pink-400 to-rose-500", glow: "rgba(244,114,182,0.4)", label: "Surprise" },
  tenderness: { color: "from-rose-300 to-pink-400", glow: "rgba(253,164,175,0.4)", label: "Tendre" },
  excitement: { color: "from-orange-400 to-amber-500", glow: "rgba(251,146,60,0.4)", label: "Excitée" },
  neutral: { color: "from-zinc-400 to-slate-500", glow: "rgba(161,161,170,0.2)", label: "Sereine" },
};

export default function EvaLivePage() {
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Connexion...");
  const [evaEmotion, setEvaEmotion] = useState("neutral");
  const [userEmotion, setUserEmotion] = useState("neutral");
  const [currentText, setCurrentText] = useState("");
  const [inputText, setInputText] = useState("");

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const audioQueueRef = useRef<{ audio: ArrayBuffer; text: string; emotion: string }[]>([]);
  const isPlayingRef = useRef(false);

  const emotionStyle = EMOTION_STYLES[evaEmotion] || EMOTION_STYLES.neutral;

  // Connect to HER WebSocket
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws/her`);

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
            setStatus("Prête à parler");
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
            // Queue audio + text for lip-sync
            if (data.audio_base64) {
              const audio = base64ToArrayBuffer(data.audio_base64);
              audioQueueRef.current.push({
                audio,
                text: data.text || "",
                emotion: data.emotion || "neutral"
              });
              processAudioQueue();
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
              processAudioQueue();
            }
            break;
        }
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  // Process audio queue with lip-sync
  const processAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const { audio, text, emotion } = audioQueueRef.current.shift()!;
    setEvaEmotion(emotion);
    setStatus(EMOTION_STYLES[emotion]?.label || "Parle...");

    try {
      // Create audio blob for lip-sync API
      const audioBlob = new Blob([audio], { type: "audio/wav" });

      // Generate lip-synced video
      const formData = new FormData();
      formData.append("audio", audioBlob, "speech.wav");

      // Call MuseTalk API
      const lipsyncResponse = await fetch(`${LIPSYNC_URL}/lipsync`, {
        method: "POST",
        body: formData,
      });

      if (lipsyncResponse.ok) {
        const result = await lipsyncResponse.json();

        if (result.video_base64 && videoRef.current) {
          // Create video URL from base64
          const videoBlob = base64ToBlob(result.video_base64, "video/mp4");
          const videoUrl = URL.createObjectURL(videoBlob);

          // Set video source and play
          videoRef.current.src = videoUrl;
          videoRef.current.style.display = "block";
          if (idleVideoRef.current) idleVideoRef.current.style.display = "none";

          await videoRef.current.play();

          // Wait for video to end
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
        // Fallback: just play audio without lip-sync
        await playAudioOnly(audio);
      }

    } catch (error) {
      console.error("Lip-sync error:", error);
      // Fallback: play audio only
      await playAudioOnly(audio);
    }

    // Show idle video again
    if (videoRef.current) videoRef.current.style.display = "none";
    if (idleVideoRef.current) idleVideoRef.current.style.display = "block";

    isPlayingRef.current = false;

    // Process next in queue
    if (audioQueueRef.current.length > 0) {
      processAudioQueue();
    } else {
      setIsSpeaking(false);
      setStatus("Prête");
    }
  }, []);

  // Fallback audio playback
  const playAudioOnly = async (audioData: ArrayBuffer): Promise<void> => {
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
  };

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

        // Send audio as base64
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
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 via-black to-zinc-900 flex flex-col items-center justify-center p-4">

      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none transition-all duration-700"
        style={{
          background: `radial-gradient(circle at 50% 40%, ${emotionStyle.glow} 0%, transparent 50%)`
        }}
      />

      {/* Status bar */}
      <div className="fixed top-4 left-0 right-0 flex justify-center z-50">
        <div className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
          <div className={`w-2.5 h-2.5 rounded-full transition-colors ${
            isConnected ? (isSpeaking ? "bg-rose-400 animate-pulse" : "bg-emerald-400") : "bg-red-400"
          }`} />
          <span className="text-white/90 text-sm font-medium">{status}</span>
          {userEmotion !== "neutral" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/70">
              Toi: {userEmotion}
            </span>
          )}
        </div>
      </div>

      {/* Avatar container */}
      <div className="relative mb-8">
        {/* Glow ring */}
        <div
          className={`absolute -inset-3 rounded-full transition-all duration-500`}
          style={{
            boxShadow: isSpeaking
              ? `0 0 80px 30px ${emotionStyle.glow}, 0 0 120px 60px ${emotionStyle.glow}`
              : isListening
                ? "0 0 60px 20px rgba(52,211,153,0.3)"
                : "0 0 30px 10px rgba(255,255,255,0.05)"
          }}
        />

        {/* Video container */}
        <div className="relative w-72 h-72 md:w-96 md:h-96 rounded-full overflow-hidden bg-zinc-800 border-2 border-white/10">
          {/* Idle video (subtle movements) */}
          <video
            ref={idleVideoRef}
            src="/avatars/eva_idle_transparent.webm"
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
          />

          {/* Lip-synced video (when speaking) */}
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ display: "none" }}
            playsInline
          />
        </div>

        {/* Speaking waves */}
        {isSpeaking && (
          <>
            <div className="absolute -inset-6 rounded-full border-2 border-rose-400/30 animate-ping" />
            <div className="absolute -inset-10 rounded-full border border-rose-400/20 animate-ping" style={{ animationDelay: "200ms" }} />
          </>
        )}

        {/* Name & emotion */}
        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-center">
          <h2 className="text-white text-2xl font-semibold">Eva</h2>
          <p className={`text-sm mt-1 transition-colors ${
            isSpeaking ? "text-rose-400" : isListening ? "text-emerald-400" : "text-white/50"
          }`}>
            {isSpeaking ? emotionStyle.label : isListening ? "T'écoute..." : isProcessing ? "Réfléchit..." : "En ligne"}
          </p>
        </div>
      </div>

      {/* Current text */}
      {currentText && (
        <div className="max-w-lg mx-auto mb-8 px-6 py-4 rounded-2xl bg-white/5 backdrop-blur border border-white/10">
          <p className="text-white/90 text-center leading-relaxed">{currentText}</p>
        </div>
      )}

      {/* Controls */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black to-transparent">
        <div className="max-w-xl mx-auto space-y-4">

          {/* Text input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Écris à Eva..."
              className="flex-1 px-5 py-3 rounded-full bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-rose-400/50 transition-colors"
            />
            <button
              onClick={sendMessage}
              disabled={!inputText.trim() || !isConnected}
              className="px-6 py-3 rounded-full bg-rose-500 hover:bg-rose-600 disabled:bg-white/10 disabled:text-white/30 text-white font-medium transition-all"
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
              disabled={!isConnected || isSpeaking}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                isListening
                  ? "bg-emerald-500 scale-110 shadow-lg shadow-emerald-500/50"
                  : "bg-white/10 hover:bg-white/20 hover:scale-105"
              } text-white disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            {/* Interrupt */}
            {isSpeaking && (
              <button
                onClick={interrupt}
                className="px-5 py-2.5 rounded-full bg-red-500/80 hover:bg-red-500 text-white text-sm font-medium transition-all"
              >
                Stop
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
