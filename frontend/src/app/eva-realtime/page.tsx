"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/**
 * EVA REALTIME - 100% Frontend GPU Lip-Sync
 *
 * NO backend round-trip for lip-sync!
 * - Audio analysis: Web Audio API (browser)
 * - Image blending: Canvas/WebGL (GPU)
 * - Latency: ~10-15ms
 */

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

const VISEMES = ["sil", "AA", "EE", "OO", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "RR"];

// ============================================================================
// GPU AUDIO ANALYZER - Web Audio API
// ============================================================================

class GPUAudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private floatArray: Float32Array | null = null;
  private source: AudioBufferSourceNode | MediaElementAudioSourceNode | null = null;
  private isPlaying = false;
  private smoothedEnergy = 0;
  private smoothedBrightness = 0;

  async connectToAudio(audioElement: HTMLAudioElement): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.3;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.floatArray = new Float32Array(this.analyser.frequencyBinCount);
    }

    // Connect audio element to analyser
    if (!this.source && this.analyser) {
      this.source = this.audioContext.createMediaElementSource(audioElement);
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  getVisemeWeights(): Record<string, number> {
    if (!this.analyser || !this.dataArray || !this.floatArray) {
      return { sil: 1.0 };
    }

    // Get frequency data
    this.analyser.getByteFrequencyData(this.dataArray as Uint8Array<ArrayBuffer>);

    // Calculate energy (volume)
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    const energy = sum / (this.dataArray.length * 255);

    // Smooth energy
    this.smoothedEnergy = 0.7 * this.smoothedEnergy + 0.3 * energy;

    // Calculate spectral centroid (brightness)
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      weightedSum += i * this.dataArray[i];
      totalWeight += this.dataArray[i];
    }
    const brightness = totalWeight > 0 ? weightedSum / totalWeight / this.dataArray.length : 0.5;
    this.smoothedBrightness = 0.7 * this.smoothedBrightness + 0.3 * brightness;

    // High frequency energy (for fricatives like S, F)
    let highFreqEnergy = 0;
    const highStart = Math.floor(this.dataArray.length * 0.6);
    for (let i = highStart; i < this.dataArray.length; i++) {
      highFreqEnergy += this.dataArray[i];
    }
    highFreqEnergy /= (this.dataArray.length - highStart) * 255;

    // Map to visemes
    const weights: Record<string, number> = {};
    const e = this.smoothedEnergy;
    const b = this.smoothedBrightness;
    const h = highFreqEnergy;

    if (e < 0.05) {
      // Silence
      weights.sil = 1.0;
    } else {
      const mouthOpen = Math.min(1.0, e * 2.5);

      // Fricatives (high frequency)
      if (h > 0.15) {
        weights.SS = 0.4 * mouthOpen;
        weights.FF = 0.3 * mouthOpen;
      }

      // Bright vowels (high centroid)
      if (b > 0.55) {
        weights.EE = 0.5 * mouthOpen;
        weights.AA = 0.3 * mouthOpen;
      }
      // Dark/round vowels (low centroid)
      else if (b < 0.4) {
        weights.OO = 0.5 * mouthOpen;
        weights.RR = 0.2 * mouthOpen;
      }
      // Neutral
      else {
        weights.AA = 0.5 * mouthOpen;
        weights.DD = 0.2 * mouthOpen;
      }

      // Ensure some silence for natural look
      const total = Object.values(weights).reduce((a, b) => a + b, 0);
      if (total < 0.95) {
        weights.sil = 1 - total;
      }
    }

    return weights;
  }

  getEnergy(): number {
    return this.smoothedEnergy;
  }
}

// ============================================================================
// GPU VISEME RENDERER - Canvas with optimal blending
// ============================================================================

interface VisemeRendererProps {
  weights: Record<string, number>;
  images: Map<string, HTMLImageElement>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

function renderVisemes({ weights, images, canvasRef }: VisemeRendererProps) {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) return;

  // Get dimensions from first image
  const firstImg = images.values().next().value;
  if (!firstImg) return;

  if (canvas.width !== firstImg.width || canvas.height !== firstImg.height) {
    canvas.width = firstImg.width;
    canvas.height = firstImg.height;
  }

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Sort weights by value (draw lowest first)
  const sorted = Object.entries(weights)
    .filter(([_, w]) => w > 0.01)
    .sort((a, b) => a[1] - b[1]);

  // Blend images
  for (const [name, weight] of sorted) {
    const img = images.get(name);
    if (img) {
      ctx.globalAlpha = Math.min(1, weight * 1.5); // Boost visibility
      ctx.drawImage(img, 0, 0);
    }
  }

  ctx.globalAlpha = 1;
}

// ============================================================================
// REALTIME AVATAR COMPONENT
// ============================================================================

interface RealtimeAvatarProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
}

function RealtimeAvatar({ audioElement, isPlaying }: RealtimeAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzerRef = useRef<GPUAudioAnalyzer | null>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const animationRef = useRef<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentWeights, setCurrentWeights] = useState<Record<string, number>>({ sil: 1 });
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(0);

  // Load viseme images
  useEffect(() => {
    const loadImages = async () => {
      const promises = VISEMES.map(name => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            imagesRef.current.set(name, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = `/avatars/visemes/${name}.png`;
        });
      });

      await Promise.all(promises);
      console.log(`Loaded ${imagesRef.current.size} viseme images`);
      setIsLoaded(imagesRef.current.size >= 6);
    };

    loadImages();
  }, []);

  // Initialize audio analyzer
  useEffect(() => {
    analyzerRef.current = new GPUAudioAnalyzer();
  }, []);

  // Connect to audio when playing
  useEffect(() => {
    if (audioElement && isPlaying && analyzerRef.current) {
      analyzerRef.current.connectToAudio(audioElement).catch(console.error);
    }
  }, [audioElement, isPlaying]);

  // Render loop - runs at display refresh rate
  useEffect(() => {
    if (!isLoaded) return;

    let frameCount = 0;
    let lastFpsTime = performance.now();
    let lastLatencyCheck = 0;

    const render = () => {
      const startTime = performance.now();

      // Get viseme weights from audio
      const weights = analyzerRef.current?.getVisemeWeights() || { sil: 1 };
      setCurrentWeights(weights);

      // Render to canvas
      renderVisemes({
        weights,
        images: imagesRef.current,
        canvasRef
      });

      // Calculate latency
      const renderTime = performance.now() - startTime;
      if (startTime - lastLatencyCheck > 100) {
        setLatency(renderTime);
        lastLatencyCheck = startTime;
      }

      // Calculate FPS
      frameCount++;
      if (startTime - lastFpsTime > 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsTime = startTime;
      }

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationRef.current);
  }, [isLoaded]);

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <img src="/avatars/eva_nobg.png" alt="Eva" className="w-full h-full object-contain" />
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
        style={{ imageRendering: "auto" }}
      />

      {/* Stats */}
      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded font-mono">
        <div className="text-green-400">GPU Realtime Mode</div>
        <div>FPS: {fps} | Latency: {latency.toFixed(1)}ms</div>
        <div className="text-[10px] opacity-70">
          {Object.entries(currentWeights)
            .filter(([_, w]) => w > 0.1)
            .map(([n, w]) => `${n}:${(w * 100).toFixed(0)}%`)
            .join(" ")}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function EvaRealtimePage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Connexion...");
  const [currentText, setCurrentText] = useState("");
  const [inputText, setInputText] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioQueueRef = useRef<{ audio: ArrayBuffer; text: string }[]>([]);
  const isPlayingRef = useRef(false);

  // Connect to HER
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
          user_id: "eva_realtime_user",
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
              const binaryStr = atob(data.audio_base64);
              const audioBytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                audioBytes[i] = binaryStr.charCodeAt(i);
              }
              audioQueueRef.current.push({
                audio: audioBytes.buffer as ArrayBuffer,
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
      return;
    }

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;

    setCurrentText(prev => prev + chunk.text);

    if (audioRef.current) {
      const blob = new Blob([chunk.audio], { type: "audio/wav" });
      audioRef.current.src = URL.createObjectURL(blob);
      audioRef.current.play().catch(console.error);
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => playNextChunk();
    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, [playNextChunk]);

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
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-900 to-emerald-900 flex flex-col">
      {/* Header */}
      <div className="p-4 flex justify-between items-center">
        <div>
          <h1 className="text-white text-xl font-light">Eva Realtime</h1>
          <p className="text-emerald-300 text-xs font-mono">100% GPU Frontend • ~10-15ms latency</p>
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
          <RealtimeAvatar
            audioElement={audioRef.current}
            isPlaying={isSpeaking || isPlayingRef.current}
          />

          {isSpeaking && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur px-4 py-2 rounded-full">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-white/80 text-sm">Eva parle...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Text */}
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
            className="flex-1 bg-white/10 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          />
          <button
            onClick={sendText}
            disabled={!inputText.trim() || isSpeaking || isProcessing}
            className="bg-emerald-500/50 text-white px-4 py-2 rounded-lg hover:bg-emerald-500/70 disabled:opacity-50"
          >
            Envoyer
          </button>
        </div>
      </div>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
