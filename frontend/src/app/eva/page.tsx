"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// Dynamic URL detection
function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("backend")) return params.get("backend")!;
    if (window.location.hostname.includes("trycloudflare.com")) {
      return "https://safari-launches-decor-reader.trycloudflare.com";
    }
  }
  return "http://localhost:8000";
}

function getLipsyncUrl(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("lipsync")) return params.get("lipsync")!;
    if (window.location.hostname.includes("trycloudflare.com")) {
      return "https://perry-solely-counter-employees.trycloudflare.com";
    }
  }
  return "http://localhost:8001";
}

// Emotion styles
const EMOTIONS: Record<string, { glow: string; label: string }> = {
  joy: { glow: "rgba(251,191,36,0.5)", label: "Heureuse" },
  sadness: { glow: "rgba(96,165,250,0.5)", label: "Triste" },
  anger: { glow: "rgba(239,68,68,0.5)", label: "En colère" },
  fear: { glow: "rgba(167,139,250,0.5)", label: "Inquiète" },
  surprise: { glow: "rgba(244,114,182,0.5)", label: "Surprise" },
  tenderness: { glow: "rgba(253,164,175,0.5)", label: "Tendre" },
  excitement: { glow: "rgba(251,146,60,0.5)", label: "Excitée" },
  neutral: { glow: "rgba(255,255,255,0.15)", label: "Sereine" },
};

export default function EvaPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Connexion...");
  const [evaEmotion, setEvaEmotion] = useState("neutral");
  const [currentText, setCurrentText] = useState("");
  const [inputText, setInputText] = useState("");

  // Blink state for natural eye animation
  const [isBlinking, setIsBlinking] = useState(false);
  const [lookDirection, setLookDirection] = useState({ x: 0, y: 0 });
  const [breathPhase, setBreathPhase] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioQueueRef = useRef<{ audio: ArrayBuffer; text: string; emotion: string }[]>([]);
  const isPlayingRef = useRef(false);

  const emotion = EMOTIONS[evaEmotion] || EMOTIONS.neutral;

  // Natural blink animation
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      // Random blink every 2-6 seconds
      if (Math.random() < 0.3) {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 150);
      }
    }, 2000);

    return () => clearInterval(blinkInterval);
  }, []);

  // Subtle eye movement
  useEffect(() => {
    const lookInterval = setInterval(() => {
      if (!isSpeaking && Math.random() < 0.4) {
        setLookDirection({
          x: (Math.random() - 0.5) * 4,
          y: (Math.random() - 0.5) * 2
        });
        // Return to center after a moment
        setTimeout(() => {
          setLookDirection({ x: 0, y: 0 });
        }, 800 + Math.random() * 1000);
      }
    }, 3000);

    return () => clearInterval(lookInterval);
  }, [isSpeaking]);

  // Breathing animation
  useEffect(() => {
    const breathInterval = setInterval(() => {
      setBreathPhase(prev => (prev + 1) % 100);
    }, 50);
    return () => clearInterval(breathInterval);
  }, []);

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
          user_id: "eva_user",
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
              processAudioQueue();
            }
            break;

          case "speaking_end":
            setIsSpeaking(false);
            setCurrentText("");
            setStatus("Prête");
            break;
        }
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  // Process audio with lip-sync
  const processAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const { audio, emotion } = audioQueueRef.current.shift()!;
    setEvaEmotion(emotion);

    try {
      // Try lip-sync first
      const lipsyncUrl = getLipsyncUrl();
      const audioBlob = new Blob([audio], { type: "audio/wav" });
      const formData = new FormData();
      formData.append("audio", audioBlob, "speech.wav");

      const lipsyncResponse = await fetch(`${lipsyncUrl}/lipsync`, {
        method: "POST",
        body: formData,
      });

      if (lipsyncResponse.ok) {
        const result = await lipsyncResponse.json();

        if (result.video_base64 && videoRef.current) {
          const videoBlob = base64ToBlob(result.video_base64, "video/mp4");
          const videoUrl = URL.createObjectURL(videoBlob);

          videoRef.current.src = videoUrl;
          videoRef.current.style.opacity = "1";

          await videoRef.current.play();

          await new Promise<void>((resolve) => {
            if (videoRef.current) {
              videoRef.current.onended = () => {
                URL.revokeObjectURL(videoUrl);
                if (videoRef.current) videoRef.current.style.opacity = "0";
                resolve();
              };
            }
          });
        }
      } else {
        // Fallback: just play audio
        await playAudioOnly(audio);
      }
    } catch (error) {
      console.log("Lip-sync unavailable, playing audio only");
      await playAudioOnly(audio);
    }

    isPlayingRef.current = false;

    if (audioQueueRef.current.length > 0) {
      processAudioQueue();
    } else {
      setIsSpeaking(false);
    }
  }, []);

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

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "audio", data: base64 }));
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start();
      setIsListening(true);
      setStatus("Parle...");
    } catch (err) {
      setStatus("Erreur micro");
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const sendMessage = () => {
    if (!inputText.trim() || !wsRef.current) return;
    setIsProcessing(true);
    setCurrentText("");
    wsRef.current.send(JSON.stringify({
      type: "message",
      content: inputText,
      user_id: "eva_user"
    }));
    setInputText("");
    setStatus("Eva réfléchit...");
  };

  const interrupt = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "interrupt" }));
      audioQueueRef.current = [];
      if (videoRef.current) videoRef.current.pause();
      setIsSpeaking(false);
      isPlayingRef.current = false;
    }
  };

  // Calculate breathing scale
  const breathScale = 1 + Math.sin(breathPhase * 0.0628) * 0.008;

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 overflow-hidden">

      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none transition-all duration-1000"
        style={{
          background: `radial-gradient(ellipse at 50% 35%, ${emotion.glow} 0%, transparent 50%)`
        }}
      />

      {/* Status */}
      <div className="fixed top-4 z-50">
        <div className="flex items-center gap-3 px-5 py-2 rounded-full bg-black/70 backdrop-blur border border-white/10">
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? (isSpeaking ? "bg-rose-400 animate-pulse" : "bg-emerald-400") : "bg-red-400"
          }`} />
          <span className="text-white/80 text-sm">{status}</span>
        </div>
      </div>

      {/* Avatar */}
      <div className="relative mb-20">
        {/* Glow */}
        <div
          className="absolute -inset-6 rounded-full transition-all duration-700"
          style={{
            boxShadow: isSpeaking
              ? `0 0 100px 40px ${emotion.glow}`
              : `0 0 40px 15px rgba(255,255,255,0.05)`
          }}
        />

        {/* Face container with subtle animations */}
        <div
          className="relative w-72 h-72 md:w-80 md:h-80 rounded-full overflow-hidden bg-zinc-900 border border-white/10"
          style={{
            transform: `scale(${breathScale}) translateY(${Math.sin(breathPhase * 0.0314) * 1}px)`,
            transition: "transform 0.1s ease-out"
          }}
        >
          {/* Static face image */}
          <img
            src="/avatars/eva.jpg"
            alt="Eva"
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              transform: `translate(${lookDirection.x}px, ${lookDirection.y}px)`,
              transition: "transform 0.5s ease-out"
            }}
          />

          {/* Eye blink overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: isBlinking
                ? "linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.9) 42%, rgba(0,0,0,0.9) 48%, transparent 60%)"
                : "transparent",
              transition: "background 0.05s"
            }}
          />

          {/* Lip-sync video (overlays when speaking) */}
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
            style={{ opacity: 0 }}
            playsInline
            muted={false}
          />

          {/* Speaking mouth indicator */}
          {isSpeaking && !videoRef.current?.src && (
            <div className="absolute bottom-[35%] left-1/2 -translate-x-1/2">
              <div
                className="w-8 h-2 bg-rose-900/40 rounded-full"
                style={{
                  animation: "speak 0.15s ease-in-out infinite alternate",
                }}
              />
            </div>
          )}
        </div>

        {/* Pulse when speaking */}
        {isSpeaking && (
          <>
            <div className="absolute -inset-8 rounded-full border border-rose-400/30 animate-ping" />
            <div className="absolute -inset-12 rounded-full border border-rose-400/20 animate-ping" style={{ animationDelay: "0.2s" }} />
          </>
        )}

        {/* Name */}
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-center">
          <h2 className="text-white text-2xl font-medium">Eva</h2>
          <p className={`text-sm mt-1 ${isSpeaking ? "text-rose-400" : "text-white/50"}`}>
            {isSpeaking ? emotion.label : isListening ? "T'écoute..." : "En ligne"}
          </p>
        </div>
      </div>

      {/* Response text */}
      {currentText && (
        <div className="max-w-md mx-auto mb-8 px-5 py-3 rounded-2xl bg-white/5 border border-white/10">
          <p className="text-white/90 text-center">{currentText}</p>
        </div>
      )}

      {/* Controls */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/90 to-transparent">
        <div className="max-w-lg mx-auto space-y-4">

          {/* Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Écris à Eva..."
              className="flex-1 px-4 py-3 rounded-full bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-rose-400/50"
            />
            <button
              onClick={sendMessage}
              disabled={!inputText.trim() || !isConnected}
              className="px-5 py-3 rounded-full bg-rose-500 hover:bg-rose-600 disabled:bg-white/10 text-white transition"
            >
              Envoyer
            </button>
          </div>

          {/* Voice */}
          <div className="flex justify-center gap-4">
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              disabled={!isConnected || isSpeaking}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
                isListening ? "bg-emerald-500 scale-110" : "bg-white/10 hover:bg-white/20"
              } text-white disabled:opacity-50`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            {isSpeaking && (
              <button onClick={interrupt} className="px-4 py-2 rounded-full bg-red-500/80 text-white text-sm">
                Stop
              </button>
            )}
          </div>

          {isListening && (
            <p className="text-center text-emerald-400 text-sm animate-pulse">🎤 Parle...</p>
          )}
        </div>
      </div>

      {/* CSS animation */}
      <style jsx>{`
        @keyframes speak {
          from { transform: scaleY(1); }
          to { transform: scaleY(2.5); }
        }
      `}</style>
    </div>
  );
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
