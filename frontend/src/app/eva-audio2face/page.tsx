"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ============================================================================
// CONFIG
// ============================================================================

function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const custom = params.get("backend");
    if (custom) return custom;
    if (window.location.hostname.includes("trycloudflare.com")) {
      return "https://safari-launches-decor-reader.trycloudflare.com";
    }
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
}

function getAudio2FaceUrl(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const custom = params.get("audio2face");
    if (custom) return custom;
    if (window.location.hostname.includes("trycloudflare.com")) {
      return "https://williams-volunteer-procedures-delhi.trycloudflare.com";
    }
  }
  return process.env.NEXT_PUBLIC_AUDIO2FACE_URL || "http://localhost:8004";
}

const FPS = 30;
const FRAME_INTERVAL = 1000 / FPS;

// ============================================================================
// AUDIO2FACE AVATAR COMPONENT
// ============================================================================

interface Audio2FaceAvatarProps {
  audioData?: ArrayBuffer;
  isIdle: boolean;
}

function Audio2FaceAvatar({ audioData }: Audio2FaceAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameQueueRef = useRef<string[]>([]);
  const animationRef = useRef<number>(0);
  const lastFrameTimeRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stats, setStats] = useState({ fps: 0, queueSize: 0, activeShapes: "" });

  // Connect to Audio2Face service
  useEffect(() => {
    const a2fUrl = getAudio2FaceUrl();
    const wsUrl = a2fUrl.replace("https://", "wss://").replace("http://", "ws://");

    console.log("Connecting to Audio2Face:", wsUrl);
    const ws = new WebSocket(`${wsUrl}/ws/audio2face`);

    ws.onopen = () => {
      console.log("Audio2Face connected");
      setIsConnected(true);
    };

    ws.onclose = () => {
      console.log("Audio2Face disconnected");
      setIsConnected(false);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "frame") {
        frameQueueRef.current.push(data.data);
        setStats(s => ({
          ...s,
          queueSize: frameQueueRef.current.length,
          activeShapes: data.blend_shapes
            ? Object.entries(data.blend_shapes)
                .filter(([, v]) => (v as number) > 0.1)
                .map(([k, v]) => `${k}:${((v as number) * 100).toFixed(0)}%`)
                .join(" ")
            : s.activeShapes
        }));
      } else if (data.type === "done") {
        console.log("Audio2Face processing complete");
        setIsProcessing(false);
      } else if (data.type === "error") {
        console.error("Audio2Face error:", data.message);
      }
    };

    ws.onerror = (e) => console.error("Audio2Face error:", e);

    wsRef.current = ws;
    return () => ws.close();
  }, []);

  // Send audio to Audio2Face
  useEffect(() => {
    if (audioData && wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("Sending audio to Audio2Face:", audioData.byteLength);
      setIsProcessing(true);

      const bytes = new Uint8Array(audioData);
      const binary = String.fromCharCode(...bytes);
      const base64 = btoa(binary);

      wsRef.current.send(JSON.stringify({
        type: "audio_wav",
        data: base64
      }));
    }
  }, [audioData]);

  // Frame rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameCount = 0;
    let lastFpsTime = performance.now();

    const renderFrame = (timestamp: number) => {
      if (timestamp - lastFrameTimeRef.current < FRAME_INTERVAL * 0.8) {
        animationRef.current = requestAnimationFrame(renderFrame);
        return;
      }
      lastFrameTimeRef.current = timestamp;

      if (frameQueueRef.current.length > 0) {
        const frameData = frameQueueRef.current.shift()!;
        setStats(s => ({ ...s, queueSize: frameQueueRef.current.length }));

        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
        };
        img.src = `data:image/jpeg;base64,${frameData}`;

        frameCount++;
      }

      // Calculate FPS
      if (timestamp - lastFpsTime > 1000) {
        setStats(s => ({ ...s, fps: frameCount }));
        frameCount = 0;
        lastFpsTime = timestamp;
      }

      animationRef.current = requestAnimationFrame(renderFrame);
    };

    animationRef.current = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* Fallback image when no frames */}
      {frameQueueRef.current.length === 0 && !isProcessing && (
        <img
          src="/avatars/eva_nobg.png"
          alt="Eva"
          className="absolute inset-0 w-full h-full object-contain"
        />
      )}

      {/* Streaming canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
      />

      {/* Stats overlay */}
      <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded font-mono max-w-xs">
        <div>Audio2Face: {isConnected ? "✓" : "✗"} | FPS: {stats.fps}</div>
        <div>Queue: {stats.queueSize} | {isProcessing ? "Processing..." : "Idle"}</div>
        {stats.activeShapes && <div className="text-[10px] opacity-70">{stats.activeShapes}</div>}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function EvaAudio2FacePage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Connexion...");
  const [currentText, setCurrentText] = useState("");
  const [inputText, setInputText] = useState("");
  const [audioToPlay, setAudioToPlay] = useState<ArrayBuffer | undefined>();

  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioQueueRef = useRef<{ audio: ArrayBuffer; text: string }[]>([]);
  const isPlayingRef = useRef(false);
  const playNextChunkRef = useRef<() => void>(() => {});

  // Connect to HER WebSocket
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
          user_id: "eva_audio2face_user",
          voice: "french"
        }));
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatus("Reconnexion...");
        setTimeout(connect, 3000);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "config_ok":
            setStatus("Prete");
            break;

          case "speaking_start":
            setIsSpeaking(true);
            setIsProcessing(false);
            break;

          case "speech":
          case "filler":
            if (data.audio_base64) {
              const audioBytes = Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0));
              audioQueueRef.current.push({
                audio: audioBytes.buffer,
                text: data.text || ""
              });

              if (!isPlayingRef.current) {
                playNextChunkRef.current();
              }
            }
            break;

          case "speaking_end":
            setIsSpeaking(false);
            setCurrentText("");
            break;

          case "processing":
            setIsProcessing(true);
            setStatus("Reflexion...");
            break;
        }
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  const playNextChunk = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setAudioToPlay(undefined);
      return;
    }

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;

    setAudioToPlay(chunk.audio);
    setCurrentText(prev => prev + chunk.text);

    if (audioRef.current) {
      const blob = new Blob([chunk.audio], { type: "audio/wav" });
      audioRef.current.src = URL.createObjectURL(blob);
      audioRef.current.play().catch(console.error);
    }
  }, []);

  // Keep ref updated
  useEffect(() => {
    playNextChunkRef.current = playNextChunk;
  }, [playNextChunk]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => playNextChunkRef.current();
    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, []);

  const sendText = useCallback(() => {
    if (!inputText.trim()) return;

    wsRef.current?.send(JSON.stringify({
      type: "message",
      content: inputText.trim()
    }));

    setInputText("");
    setIsProcessing(true);
    setStatus("Reflexion...");
  }, [inputText]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-cyan-900 to-blue-900 flex flex-col">
      {/* Header */}
      <div className="p-4 flex justify-between items-center">
        <div>
          <h1 className="text-white text-xl font-light">Eva Audio2Face</h1>
          <p className="text-white/50 text-xs">Option 2: Neural Audio-to-Face (~30-50ms latency)</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm ${
          isConnected ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
        }`}>
          {status}
        </div>
      </div>

      {/* Avatar */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative w-full max-w-2xl aspect-square bg-black/20 rounded-2xl overflow-hidden">
          <Audio2FaceAvatar
            audioData={audioToPlay}
            isIdle={!isSpeaking}
          />

          {isSpeaking && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur px-4 py-2 rounded-full">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                <span className="text-white/80 text-sm">Eva parle...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Text display */}
      {currentText && (
        <div className="px-4 pb-4">
          <div className="max-w-2xl mx-auto bg-white/5 backdrop-blur rounded-lg p-4">
            <p className="text-white/90 text-lg">{currentText}</p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="p-4 flex flex-col items-center gap-4">
        <div className="flex gap-2 w-full max-w-md">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendText()}
            placeholder="Ecris un message..."
            className="flex-1 bg-white/10 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          />
          <button
            onClick={sendText}
            disabled={!inputText.trim() || isSpeaking || isProcessing}
            className="bg-cyan-500/50 text-white px-4 py-2 rounded-lg hover:bg-cyan-500/70 disabled:opacity-50"
          >
            Envoyer
          </button>
        </div>
      </div>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
