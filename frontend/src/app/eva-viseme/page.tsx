"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ============================================================================
// CONFIG
// ============================================================================

const VISEME_NAMES = ["sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "RR", "AA", "EE", "OO"];

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

function getVisemeUrl(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const custom = params.get("viseme");
    if (custom) return custom;
    if (window.location.hostname.includes("trycloudflare.com")) {
      return "https://distinguished-pink-cycles-which.trycloudflare.com";
    }
  }
  return process.env.NEXT_PUBLIC_VISEME_URL || "http://localhost:8003";
}

// ============================================================================
// VISEME AVATAR COMPONENT
// ============================================================================

interface VisemeAvatarProps {
  audioData?: ArrayBuffer;
  isIdle: boolean;
}

function VisemeAvatar({ audioData }: VisemeAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visemeImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentWeights, setCurrentWeights] = useState<Record<string, number>>({ sil: 1.0 });
  const [isLoaded, setIsLoaded] = useState(false);
  const [imageCount, setImageCount] = useState(0);
  const animationRef = useRef<number>(0);

  // Load viseme images
  useEffect(() => {
    const loadImages = async () => {
      const promises = VISEME_NAMES.map(name => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            visemeImagesRef.current.set(name, img);
            resolve();
          };
          img.onerror = () => {
            console.warn(`Failed to load viseme: ${name}`);
            resolve();
          };
          img.src = `/avatars/visemes/${name}.png`;
        });
      });

      await Promise.all(promises);
      console.log(`Loaded ${visemeImagesRef.current.size} viseme images`);
      setImageCount(visemeImagesRef.current.size);
      setIsLoaded(visemeImagesRef.current.size > 0);
    };

    loadImages();
  }, []);

  // Connect to viseme service
  useEffect(() => {
    const visemeUrl = getVisemeUrl();
    const wsUrl = visemeUrl.replace("https://", "wss://").replace("http://", "ws://");

    console.log("Connecting to viseme service:", wsUrl);
    const ws = new WebSocket(`${wsUrl}/ws/viseme`);

    ws.onopen = () => {
      console.log("Viseme service connected");
      setIsConnected(true);
    };

    ws.onclose = () => {
      console.log("Viseme service disconnected");
      setIsConnected(false);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "viseme") {
        setCurrentWeights(data.weights);
      }
    };

    ws.onerror = (e) => console.error("Viseme error:", e);

    wsRef.current = ws;
    return () => ws.close();
  }, []);

  // Send audio to viseme service
  useEffect(() => {
    if (audioData && wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("Sending audio to viseme service:", audioData.byteLength);

      const bytes = new Uint8Array(audioData);
      const binary = String.fromCharCode(...bytes);
      const base64 = btoa(binary);

      wsRef.current.send(JSON.stringify({
        type: "audio_wav",
        data: base64
      }));
    }
  }, [audioData]);

  // Render blended visemes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isLoaded) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const render = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Get base dimensions from first loaded image
      const baseImg = visemeImagesRef.current.get("sil");
      if (baseImg) {
        canvas.width = baseImg.width;
        canvas.height = baseImg.height;
      }

      // Blend viseme images based on weights
      let totalWeight = 0;
      const weightEntries = Object.entries(currentWeights).sort((a, b) => b[1] - a[1]);

      for (const [name, weight] of weightEntries) {
        if (weight <= 0) continue;

        const img = visemeImagesRef.current.get(name);
        if (img) {
          ctx.globalAlpha = weight;
          ctx.drawImage(img, 0, 0);
          totalWeight += weight;
        }
      }

      // If no weights, show silent
      if (totalWeight === 0) {
        const silImg = visemeImagesRef.current.get("sil");
        if (silImg) {
          ctx.globalAlpha = 1;
          ctx.drawImage(silImg, 0, 0);
        }
      }

      ctx.globalAlpha = 1;
      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationRef.current);
  }, [isLoaded, currentWeights]);

  // Fallback if visemes not loaded
  if (!isLoaded) {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <img
          src="/avatars/eva_nobg.png"
          alt="Eva"
          className="w-full h-full object-contain"
        />
        <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
          Loading visemes...
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
      />

      {/* Stats overlay */}
      <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded font-mono">
        <div>Viseme: {isConnected ? "✓" : "✗"} | Images: {imageCount}</div>
        <div>Active: {Object.entries(currentWeights)
          .filter(([, w]) => w > 0.1)
          .map(([n, w]) => `${n}:${(w*100).toFixed(0)}%`)
          .join(" ")}</div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function EvaVisemePage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Connexion...");
  const [currentText, setCurrentText] = useState("");
  const [inputText, setInputText] = useState("");
  const [audioToPlay, setAudioToPlay] = useState<ArrayBuffer | undefined>();
  const [latency, setLatency] = useState(0);

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
          user_id: "eva_viseme_user",
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
            setLatency(Date.now());
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

          case "listening":
            setIsListening(data.active);
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

  // Play audio queue
  const playNextChunk = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setAudioToPlay(undefined);
      return;
    }

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;

    // Calculate latency on first chunk
    if (latency > 0) {
      const elapsed = Date.now() - latency;
      console.log(`First audio latency: ${elapsed}ms`);
      setLatency(0);
    }

    setAudioToPlay(chunk.audio);
    setCurrentText(prev => prev + chunk.text);

    if (audioRef.current) {
      const blob = new Blob([chunk.audio], { type: "audio/wav" });
      audioRef.current.src = URL.createObjectURL(blob);
      audioRef.current.play().catch(console.error);
    }
  }, [latency]);

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

  // Text input
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
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-purple-900 flex flex-col">
      {/* Header */}
      <div className="p-4 flex justify-between items-center">
        <div>
          <h1 className="text-white text-xl font-light">Eva Viseme</h1>
          <p className="text-white/50 text-xs">Option 1: Viseme Blending (~20-30ms latency)</p>
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
          <VisemeAvatar
            audioData={audioToPlay}
            isIdle={!isSpeaking}
          />

          {isSpeaking && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur px-4 py-2 rounded-full">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
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
            className="flex-1 bg-white/10 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
          <button
            onClick={sendText}
            disabled={!inputText.trim() || isSpeaking || isProcessing}
            className="bg-purple-500/50 text-white px-4 py-2 rounded-lg hover:bg-purple-500/70 disabled:opacity-50"
          >
            Envoyer
          </button>
        </div>
      </div>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
