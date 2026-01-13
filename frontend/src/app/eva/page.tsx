"use client";

import { useState, useRef, useEffect, useCallback } from "react";

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

const EMOTIONS: Record<string, { glow: string; color: string; label: string }> = {
  joy: { glow: "rgba(251,191,36,0.4)", color: "#fbbf24", label: "Heureuse" },
  sadness: { glow: "rgba(96,165,250,0.4)", color: "#60a5fa", label: "Triste" },
  anger: { glow: "rgba(239,68,68,0.4)", color: "#ef4444", label: "En colère" },
  fear: { glow: "rgba(167,139,250,0.4)", color: "#a78bfa", label: "Inquiète" },
  surprise: { glow: "rgba(244,114,182,0.4)", color: "#f472b6", label: "Surprise" },
  tenderness: { glow: "rgba(253,164,175,0.4)", color: "#fda4af", label: "Tendre" },
  excitement: { glow: "rgba(251,146,60,0.4)", color: "#fb923c", label: "Excitée" },
  neutral: { glow: "rgba(255,255,255,0.1)", color: "#ffffff", label: "Sereine" },
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
  const [mouthOpen, setMouthOpen] = useState(0);

  // Simple animation states
  const [headX, setHeadX] = useState(0);
  const [headY, setHeadY] = useState(0);
  const [headRotate, setHeadRotate] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Audio queue for sequential playback
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingAudioRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const emotion = EMOTIONS[evaEmotion] || EMOTIONS.neutral;

  // Head movement animation - runs continuously
  useEffect(() => {
    const moveHead = () => {
      // Random subtle movement
      setHeadX((Math.random() - 0.5) * 10);
      setHeadY((Math.random() - 0.5) * 8);
      setHeadRotate((Math.random() - 0.5) * 4);
    };

    // Initial movement
    moveHead();

    // Move every 2-4 seconds
    const interval = setInterval(moveHead, 2000 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, []);

  // Connect WebSocket
  useEffect(() => {
    const connect = () => {
      const backendUrl = getBackendUrl();
      const wsUrl = backendUrl.replace("https://", "wss://").replace("http://", "ws://");
      const ws = new WebSocket(`${wsUrl}/ws/her`);

      ws.onopen = () => {
        setIsConnected(true);
        setStatus("Connectee");
        ws.send(JSON.stringify({
          type: "config",
          user_id: "eva_user",
          voice: "french"
        }));
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatus("Reconnexion...");
        setTimeout(connect, 2000);
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "config_ok":
            setStatus("Prete");
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

          case "token":
            setCurrentText(prev => prev + data.content);
            break;

          case "speech":
            if (data.audio_base64) {
              const audio = base64ToArrayBuffer(data.audio_base64);
              // Add to queue and process
              audioQueueRef.current.push(audio);
              processAudioQueue();
            }
            break;

          case "speaking_end":
            // Will be handled when audio queue is empty
            break;
        }
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  // Process audio queue SEQUENTIALLY - one at a time
  const processAudioQueue = useCallback(async () => {
    // If already playing, don't start another
    if (isPlayingAudioRef.current) return;

    // If queue is empty, we're done
    if (audioQueueRef.current.length === 0) {
      setIsSpeaking(false);
      setMouthOpen(0);
      setCurrentText("");
      setStatus("Prete");
      return;
    }

    isPlayingAudioRef.current = true;
    setIsSpeaking(true);

    // Get next audio from queue
    const audioData = audioQueueRef.current.shift()!;

    try {
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;

      const buffer = await ctx.decodeAudioData(audioData.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      currentSourceRef.current = source;

      // Analyser for mouth animation
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      // Mouth animation loop
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let animationId: number;

      const animateMouth = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setMouthOpen(Math.min(1, avg / 100));
        animationId = requestAnimationFrame(animateMouth);
      };

      source.onended = () => {
        cancelAnimationFrame(animationId);
        setMouthOpen(0);
        isPlayingAudioRef.current = false;
        currentSourceRef.current = null;
        // Process next in queue
        processAudioQueue();
      };

      source.start(0);
      animateMouth();

    } catch (e) {
      console.error("Audio error:", e);
      isPlayingAudioRef.current = false;
      // Try next audio
      processAudioQueue();
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

    // Stop any current audio
    if (currentSourceRef.current) {
      currentSourceRef.current.stop();
    }
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;

    setIsProcessing(true);
    setCurrentText("");
    wsRef.current.send(JSON.stringify({
      type: "message",
      content: inputText,
      user_id: "eva_user"
    }));
    setInputText("");
    setStatus("Eva reflechit...");
  };

  const interrupt = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "interrupt" }));
    }
    // Stop current audio
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch(e) {}
    }
    audioQueueRef.current = [];
    isPlayingAudioRef.current = false;
    setIsSpeaking(false);
    setMouthOpen(0);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(to bottom, #0a0a0a, #000, #0a0a0a)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      fontFamily: "system-ui, sans-serif"
    }}>

      {/* Status */}
      <div style={{
        position: "fixed",
        top: "20px",
        padding: "8px 20px",
        borderRadius: "20px",
        background: "rgba(0,0,0,0.7)",
        border: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        alignItems: "center",
        gap: "10px"
      }}>
        <div style={{
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: isConnected ? (isSpeaking ? "#f43f5e" : "#22c55e") : "#ef4444",
          animation: isSpeaking ? "pulse 1s infinite" : "none"
        }} />
        <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "14px" }}>{status}</span>
      </div>

      {/* Avatar */}
      <div style={{ position: "relative", marginBottom: "100px" }}>

        {/* Glow effect */}
        <div style={{
          position: "absolute",
          inset: "-30px",
          borderRadius: "50%",
          background: `radial-gradient(circle, ${emotion.glow} 0%, transparent 70%)`,
          opacity: isSpeaking ? 1 : 0.3,
          transition: "opacity 0.5s"
        }} />

        {/* Face container with head movements */}
        <div style={{
          position: "relative",
          width: "320px",
          height: "320px",
          borderRadius: "50%",
          overflow: "hidden",
          border: "2px solid rgba(255,255,255,0.1)",
          transform: `translateX(${headX}px) translateY(${headY}px) rotate(${headRotate}deg)`,
          transition: "transform 1s ease-in-out"
        }}>
          {/* Eva image */}
          <img
            src="/avatars/eva.jpg"
            alt="Eva"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover"
            }}
          />

          {/* Mouth overlay when speaking */}
          {isSpeaking && (
            <div style={{
              position: "absolute",
              bottom: "28%",
              left: "50%",
              transform: "translateX(-50%)",
              width: `${25 + mouthOpen * 15}px`,
              height: `${5 + mouthOpen * 18}px`,
              background: "linear-gradient(to bottom, #8b4513 0%, #5c2a0a 50%, #3d1a06 100%)",
              borderRadius: "50%",
              boxShadow: "inset 0 3px 8px rgba(0,0,0,0.7)",
              transition: "all 0.05s"
            }} />
          )}
        </div>

        {/* Speaking rings */}
        {isSpeaking && (
          <>
            <div style={{
              position: "absolute",
              inset: "-15px",
              borderRadius: "50%",
              border: `2px solid ${emotion.color}`,
              opacity: 0.5,
              animation: "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite"
            }} />
          </>
        )}

        {/* Name */}
        <div style={{
          position: "absolute",
          bottom: "-70px",
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center"
        }}>
          <h2 style={{ color: "white", fontSize: "24px", margin: 0, fontWeight: 300 }}>Eva</h2>
          <p style={{
            color: isSpeaking ? emotion.color : "rgba(255,255,255,0.5)",
            fontSize: "14px",
            margin: "5px 0 0 0",
            transition: "color 0.3s"
          }}>
            {isSpeaking ? emotion.label : isListening ? "T'ecoute..." : "En ligne"}
          </p>
        </div>
      </div>

      {/* Text bubble */}
      {currentText && (
        <div style={{
          maxWidth: "500px",
          margin: "0 auto 30px",
          padding: "15px 25px",
          borderRadius: "20px",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)"
        }}>
          <p style={{ color: "rgba(255,255,255,0.9)", textAlign: "center", margin: 0, lineHeight: 1.5 }}>
            {currentText}
          </p>
        </div>
      )}

      {/* Controls */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "30px",
        background: "linear-gradient(to top, black, transparent)"
      }}>
        <div style={{ maxWidth: "500px", margin: "0 auto" }}>

          {/* Input */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Ecris a Eva..."
              style={{
                flex: 1,
                padding: "15px 20px",
                borderRadius: "25px",
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "white",
                fontSize: "16px",
                outline: "none"
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!inputText.trim() || !isConnected}
              style={{
                padding: "15px 25px",
                borderRadius: "25px",
                background: inputText.trim() && isConnected ? "#f43f5e" : "rgba(255,255,255,0.1)",
                border: "none",
                color: "white",
                fontSize: "16px",
                cursor: inputText.trim() && isConnected ? "pointer" : "default",
                opacity: inputText.trim() && isConnected ? 1 : 0.5
              }}
            >
              Envoyer
            </button>
          </div>

          {/* Voice button */}
          <div style={{ display: "flex", justifyContent: "center", gap: "15px" }}>
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              disabled={!isConnected || isSpeaking}
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: isListening ? "#22c55e" : "rgba(255,255,255,0.1)",
                border: "none",
                color: "white",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: isListening ? "scale(1.1)" : "scale(1)",
                transition: "all 0.2s"
              }}
            >
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            {isSpeaking && (
              <button
                onClick={interrupt}
                style={{
                  padding: "10px 20px",
                  borderRadius: "20px",
                  background: "#ef4444",
                  border: "none",
                  color: "white",
                  cursor: "pointer"
                }}
              >
                Stop
              </button>
            )}
          </div>

          {isListening && (
            <p style={{ textAlign: "center", color: "#22c55e", marginTop: "10px" }}>
              Je t'ecoute...
            </p>
          )}
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes ping {
          75%, 100% {
            transform: scale(1.5);
            opacity: 0;
          }
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
