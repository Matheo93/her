"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ============================================================================
// CONFIG
// ============================================================================

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

function getStreamingUrl(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const custom = params.get("streaming");
    if (custom) return custom;
  }
  return process.env.NEXT_PUBLIC_STREAMING_URL || "http://localhost:8002";
}

const FPS = 25;
const FRAME_INTERVAL = 1000 / FPS;

// ============================================================================
// STREAMING AVATAR COMPONENT
// ============================================================================

interface StreamingAvatarProps {
  audioData?: ArrayBuffer;
  isIdle: boolean;
  onFrameReceived?: (index: number) => void;
}

function StreamingAvatar({ audioData, isIdle, onFrameReceived }: StreamingAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lipsyncWsRef = useRef<WebSocket | null>(null);
  const frameQueueRef = useRef<string[]>([]);
  const animationRef = useRef<number>(0);
  const lastFrameTimeRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stats, setStats] = useState({ fps: 0, latency: 0, queueSize: 0 });

  // Connect to lip-sync streaming service
  useEffect(() => {
    const streamingUrl = getStreamingUrl();
    const wsUrl = streamingUrl.replace("https://", "wss://").replace("http://", "ws://");

    console.log("Connecting to lipsync:", wsUrl);
    const ws = new WebSocket(`${wsUrl}/ws/lipsync`);

    ws.onopen = () => {
      console.log("Lipsync connected!");
      setIsConnected(true);
      ws.send(JSON.stringify({ type: "config", avatar: "eva" }));
    };

    ws.onclose = () => {
      console.log("Lipsync disconnected");
      setIsConnected(false);
      setTimeout(() => {}, 2000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "frame") {
        frameQueueRef.current.push(data.data);
        setStats(s => ({ ...s, queueSize: frameQueueRef.current.length }));
        onFrameReceived?.(data.index);
      } else if (data.type === "done") {
        console.log("Lipsync done:", data.stats);
        setStats(s => ({
          ...s,
          fps: data.stats?.effective_fps || 0,
          latency: data.stats?.avg_per_frame_ms || 0
        }));
        setIsPlaying(false);
      } else if (data.type === "config_ok") {
        console.log("Lipsync configured:", data.avatar);
      }
    };

    ws.onerror = (e) => console.error("Lipsync error:", e);

    lipsyncWsRef.current = ws;
    return () => ws.close();
  }, [onFrameReceived]);

  // No WebSocket for idle - use pre-rendered video instead
  // The idle video provides smooth animations at minimal cost

  // Send audio when received
  useEffect(() => {
    if (audioData && wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("Sending audio:", audioData.byteLength, "bytes");

      // Convert ArrayBuffer to base64
      const bytes = new Uint8Array(audioData);
      const binary = String.fromCharCode(...bytes);
      const base64 = btoa(binary);

      wsRef.current.send(JSON.stringify({
        type: "audio_wav",
        data: base64
      }));

      // Signal end after a small delay
      setTimeout(() => {
        wsRef.current?.send(JSON.stringify({ type: "end" }));
      }, 100);

      setIsPlaying(true);
    }
  }, [audioData]);

  // Frame rendering loop for lip-sync queue
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameCount = 0;
    let lastFpsTime = performance.now();

    const renderFrame = (timestamp: number) => {
      // Respect frame rate
      if (timestamp - lastFrameTimeRef.current < FRAME_INTERVAL * 0.8) {
        animationRef.current = requestAnimationFrame(renderFrame);
        return;
      }
      lastFrameTimeRef.current = timestamp;

      // Get next frame from lip-sync queue
      if (frameQueueRef.current.length > 0) {
        const frameData = frameQueueRef.current.shift()!;
        setStats(s => ({ ...s, queueSize: frameQueueRef.current.length }));

        // Decode and draw
        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
        };
        img.src = `data:image/jpeg;base64,${frameData}`;

        frameCount++;
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
        // Idle frames are handled by the idle WebSocket directly
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

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      {/* Idle video - shown when not speaking */}
      <video
        src="/avatars/eva_idle_transparent.webm"
        autoPlay
        loop
        muted
        playsInline
        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-200 ${
          isPlaying ? "opacity-0" : "opacity-100"
        }`}
      />

      {/* Streaming canvas - shown when speaking */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-200 ${
          isPlaying ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Stats overlay */}
      <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded font-mono">
        <div>LipSync: {isConnected ? "✓" : "✗"}</div>
        <div>Mode: {isPlaying ? "speaking" : "idle"} | Queue: {stats.queueSize}</div>
        {stats.latency > 0 && <div>{stats.latency.toFixed(0)}ms/frame</div>}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function EvaStreamPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Connexion...");
  const [currentText, setCurrentText] = useState("");
  const [inputText, setInputText] = useState("");
  const [audioToPlay, setAudioToPlay] = useState<ArrayBuffer | undefined>();

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioQueueRef = useRef<{ audio: ArrayBuffer; text: string }[]>([]);
  const isPlayingRef = useRef(false);

  // Connect to HER WebSocket
  useEffect(() => {
    const connect = () => {
      const backendUrl = getBackendUrl();
      const wsUrl = backendUrl.replace("https://", "wss://").replace("http://", "ws://");
      console.log("Connecting to HER:", wsUrl);

      const ws = new WebSocket(`${wsUrl}/ws/her`);

      ws.onopen = () => {
        setIsConnected(true);
        setStatus("Connectee");
        ws.send(JSON.stringify({
          type: "config",
          user_id: "eva_stream_user",
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
            setStatus("Prete");
            break;

          case "her_context":
            if (data.thought_prefix) {
              setCurrentText(data.thought_prefix + " ");
            }
            break;

          case "speaking_start":
            setIsSpeaking(true);
            setIsProcessing(false);
            break;

          case "audio_chunk":
            // Queue audio chunk
            if (data.audio) {
              const audioBytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
              audioQueueRef.current.push({
                audio: audioBytes.buffer,
                text: data.text || ""
              });

              if (!isPlayingRef.current) {
                playNextChunk();
              }
            }
            break;

          case "speaking_end":
            setIsSpeaking(false);
            setCurrentText("");
            break;

          case "listening":
            setIsListening(data.active);
            if (data.active) {
              setStatus("Ecoute...");
            }
            break;

          case "processing":
            setIsProcessing(true);
            setStatus("Reflexion...");
            break;

          case "error":
            console.error("HER error:", data.message);
            setStatus("Erreur");
            break;
        }
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Play audio queue
  const playNextChunk = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setAudioToPlay(undefined);
      return;
    }

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;

    // Set audio for streaming avatar
    setAudioToPlay(chunk.audio);
    setCurrentText(prev => prev + chunk.text);

    // Play audio
    if (audioRef.current) {
      const blob = new Blob([chunk.audio], { type: "audio/wav" });
      audioRef.current.src = URL.createObjectURL(blob);
      audioRef.current.play().catch(console.error);
    }
  }, []);

  // Audio ended handler
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      playNextChunk();
    };

    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, [playNextChunk]);

  // Voice recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          wsRef.current?.send(JSON.stringify({
            type: "audio",
            audio: base64,
            format: "webm"
          }));
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
      setStatus("Parle...");
    } catch (err) {
      console.error("Mic error:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsListening(false);
    setIsProcessing(true);
    setStatus("Traitement...");
  }, []);

  // Text input
  const sendText = useCallback(() => {
    if (!inputText.trim()) return;

    wsRef.current?.send(JSON.stringify({
      type: "text",
      text: inputText.trim()
    }));

    setInputText("");
    setIsProcessing(true);
    setStatus("Reflexion...");
  }, [inputText]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex flex-col">
      {/* Header */}
      <div className="p-4 flex justify-between items-center">
        <h1 className="text-white text-xl font-light">Eva Stream</h1>
        <div className={`px-3 py-1 rounded-full text-sm ${
          isConnected ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
        }`}>
          {status}
        </div>
      </div>

      {/* Avatar */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative w-full max-w-2xl aspect-square">
          <StreamingAvatar
            audioData={audioToPlay}
            isIdle={!isSpeaking}
          />

          {/* Speaking indicator */}
          {isSpeaking && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur px-4 py-2 rounded-full">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
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
        {/* Voice button */}
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          disabled={isSpeaking || isProcessing}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
            isListening
              ? "bg-red-500 scale-110 shadow-lg shadow-red-500/50"
              : isSpeaking || isProcessing
              ? "bg-zinc-600 cursor-not-allowed"
              : "bg-zinc-700 hover:bg-zinc-600 active:scale-95"
          }`}
        >
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          </svg>
        </button>
        <span className="text-white/50 text-sm">Maintenir pour parler</span>

        {/* Text input */}
        <div className="flex gap-2 w-full max-w-md">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendText()}
            placeholder="Ou ecris ici..."
            className="flex-1 bg-white/10 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-white/30"
          />
          <button
            onClick={sendText}
            disabled={!inputText.trim() || isSpeaking || isProcessing}
            className="bg-white/10 text-white px-4 py-2 rounded-lg hover:bg-white/20 disabled:opacity-50"
          >
            Envoyer
          </button>
        </div>
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
