"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// Canvas-based chroma key hook (2D context, simpler than WebGL)
function useChromaKey2D(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  isActive: boolean
) {
  const animationRef = useRef<number>(0);

  const render = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.paused || video.ended || video.readyState < 2) {
      if (isActive) {
        animationRef.current = requestAnimationFrame(render);
      }
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
    if (!ctx) return;

    // Match canvas to video native resolution for speed
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 512;
      canvas.height = video.videoHeight || 512;
    }

    // Clear canvas for transparency
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw video frame
    ctx.drawImage(video, 0, 0);

    // Get image data and apply chroma key
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // ADVANCED CHROMA KEY with edge refinement for natural hair preservation
    // Reference green in Lab: pure #00FF00 ≈ L:87.7, a:-86.2, b:83.2
    const keyL = 87.7, keyA = -86.2, keyB = 83.2;
    const tolerance = 35;      // Tight core for precise keying
    const softness = 50;       // Wide soft edge for smooth natural blending
    const spillSuppress = 0.9; // Strong spill removal

    const w = canvas.width;
    const h = canvas.height;

    // First pass: calculate alpha and spill-corrected colors
    const alphaMap = new Float32Array(w * h);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const pixelIdx = i / 4;

      // RGB to XYZ (sRGB with gamma correction)
      let rr = r / 255, gg = g / 255, bb = b / 255;
      rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
      gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
      bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

      const x = (rr * 0.4124 + gg * 0.3576 + bb * 0.1805) / 0.95047;
      const y = (rr * 0.2126 + gg * 0.7152 + bb * 0.0722) / 1.0;
      const z = (rr * 0.0193 + gg * 0.1192 + bb * 0.9505) / 1.08883;

      // XYZ to Lab
      const fx = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
      const fy = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
      const fz = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;

      const L = (116 * fy) - 16;
      const A = 500 * (fx - fy);
      const B = 200 * (fy - fz);

      // Delta E (CIE76) - Euclidean distance in Lab space
      const dE = Math.sqrt(
        Math.pow(L - keyL, 2) +
        Math.pow(A - keyA, 2) +
        Math.pow(B - keyB, 2)
      );

      // Calculate alpha with cubic ease for smoother gradients
      let alpha = 1;
      if (dE < tolerance) {
        alpha = 0;
      } else if (dE < tolerance + softness) {
        const t = (dE - tolerance) / softness;
        // Smooth cubic ease-in-out for natural transitions
        alpha = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      }

      alphaMap[pixelIdx] = alpha;

      // Spill suppression: reduce green cast on edges
      const maxRB = Math.max(r, b);
      let finalG = g;

      if (g > maxRB + 3) {
        const excess = g - maxRB;
        const proximityFactor = Math.max(0, 1 - dE / 120);
        const suppress = Math.min(1, (excess / 60) + proximityFactor * 0.6);
        finalG = Math.round(maxRB + excess * (1 - suppress * spillSuppress));
      }

      data[i + 1] = finalG;
      data[i + 3] = Math.round(alpha * 255);
    }

    // Second pass: edge refinement with 3x3 box blur on alpha for anti-aliasing
    const refinedAlpha = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const currentAlpha = alphaMap[idx];

        // Only refine edge pixels (not fully transparent or opaque)
        if (currentAlpha > 0.01 && currentAlpha < 0.99) {
          let sum = 0;
          let count = 0;

          // 3x3 neighborhood average
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                sum += alphaMap[ny * w + nx];
                count++;
              }
            }
          }

          // Blend original with smoothed (70% smooth, 30% original for sharpness)
          refinedAlpha[idx] = sum / count * 0.7 + currentAlpha * 0.3;
        } else {
          refinedAlpha[idx] = currentAlpha;
        }
      }
    }

    // Apply refined alpha
    for (let i = 0; i < data.length; i += 4) {
      data[i + 3] = Math.round(refinedAlpha[i / 4] * 255);
    }

    ctx.putImageData(imageData, 0, 0);

    if (isActive) {
      animationRef.current = requestAnimationFrame(render);
    }
  }, [videoRef, canvasRef, isActive]);

  useEffect(() => {
    if (isActive) {
      animationRef.current = requestAnimationFrame(render);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, render]);
}

interface Timings {
  tts?: number;
  avatar?: number;
  total?: number;
  stt?: number;
  llm?: number;
  lipsync?: number;
}

export default function AvatarGPUPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [timings, setTimings] = useState<Timings>({});
  const [error, setError] = useState<string | null>(null);
  const [useLipsync, setUseLipsync] = useState(true);

  const audioRef = useRef<HTMLAudioElement>(null);
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const speakingVideoRef = useRef<HTMLVideoElement>(null);
  const idleCanvasRef = useRef<HTMLCanvasElement>(null);
  const speakingCanvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Apply chroma key to videos
  useChromaKey2D(idleVideoRef, idleCanvasRef, !isSpeaking);
  useChromaKey2D(speakingVideoRef, speakingCanvasRef, isSpeaking);

  // Green screen idle video for chroma key
  const idleVideos = [
    "/avatars/eva_idle_transparent.webm",
  ];
  const [currentIdleIndex, setCurrentIdleIndex] = useState(0);
  const [speakingVideoSrc, setSpeakingVideoSrc] = useState<string | null>(null);

  // Change idle video randomly when loop ends
  const handleIdleVideoEnd = () => {
    if (!isSpeaking) {
      const newIndex = Math.floor(Math.random() * idleVideos.length);
      setCurrentIdleIndex(newIndex);
    }
  };

  // When speaking video ends, return to idle
  const handleSpeakingVideoEnd = () => {
    setIsSpeaking(false);
    setSpeakingVideoSrc(null);
    // Resume idle video
    if (idleVideoRef.current) {
      idleVideoRef.current.play();
    }
  };

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        await processAudio(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      setError("Microphone access denied");
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Process audio through the pipeline with lip-sync
  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setTranscript("");
    setResponse("");
    setTimings({});

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");

      // Use lip-sync endpoint if enabled, otherwise regular voice endpoint
      const endpoint = useLipsync ? "/voice/lipsync" : "/voice";
      const voiceResponse = await fetch(`${BACKEND_URL}${endpoint}?voice=eva`, {
        method: "POST",
        body: formData,
      });

      if (!voiceResponse.ok) throw new Error("Voice processing failed");

      const data = await voiceResponse.json();

      setTranscript(data.user_text);
      setResponse(data.eva_response);
      setTimings({
        stt: data.latency?.stt_ms,
        llm: data.latency?.llm_ms,
        tts: data.latency?.tts_ms,
        lipsync: data.latency?.lipsync_ms,
        total: data.latency?.total_ms,
      });

      // Play lip-sync video if available
      if (data.video_base64 && speakingVideoRef.current) {
        const videoSrc = `data:video/mp4;base64,${data.video_base64}`;
        setSpeakingVideoSrc(videoSrc);
        setIsSpeaking(true);

        // Pause idle video
        if (idleVideoRef.current) {
          idleVideoRef.current.pause();
        }

        // Play speaking video
        speakingVideoRef.current.src = videoSrc;
        speakingVideoRef.current.play();
      }
      // Fallback: play audio only (no lip-sync video)
      else if (data.audio_base64 && audioRef.current) {
        const audioSrc = `data:audio/mp3;base64,${data.audio_base64}`;
        audioRef.current.src = audioSrc;
        setIsSpeaking(true);
        audioRef.current.play();
        audioRef.current.onended = () => setIsSpeaking(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setIsProcessing(false);
    }
  };

  // Send text directly with lip-sync
  const sendText = async (text: string) => {
    if (!text.trim()) return;

    setIsProcessing(true);
    setTranscript(text);
    setTimings({});

    try {
      // Use TTS + lip-sync endpoint
      const endpoint = useLipsync ? "/tts/lipsync" : "/tts";

      if (useLipsync) {
        const response = await fetch(`${BACKEND_URL}/tts/lipsync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "eva" }),
        });

        const data = await response.json();

        // Also get LLM response
        const chatResponse = await fetch(`${BACKEND_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        const chatData = await chatResponse.json();
        setResponse(chatData.response);

        // Now generate lip-sync for the response
        const llmLipsyncResponse = await fetch(`${BACKEND_URL}/tts/lipsync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chatData.response, voice: "eva" }),
        });
        const llmLipsyncData = await llmLipsyncResponse.json();

        setTimings({
          llm: chatData.latency_ms,
          tts: llmLipsyncData.latency?.tts_ms,
          lipsync: llmLipsyncData.latency?.lipsync_ms,
          total: llmLipsyncData.latency?.total_ms,
        });

        // Play lip-sync video
        if (llmLipsyncData.video_base64 && speakingVideoRef.current) {
          const videoSrc = `data:video/mp4;base64,${llmLipsyncData.video_base64}`;
          setSpeakingVideoSrc(videoSrc);
          setIsSpeaking(true);

          if (idleVideoRef.current) {
            idleVideoRef.current.pause();
          }

          speakingVideoRef.current.src = videoSrc;
          speakingVideoRef.current.play();
        } else if (llmLipsyncData.audio_base64 && audioRef.current) {
          const audioSrc = `data:audio/mp3;base64,${llmLipsyncData.audio_base64}`;
          audioRef.current.src = audioSrc;
          setIsSpeaking(true);
          audioRef.current.play();
          audioRef.current.onended = () => setIsSpeaking(false);
        }
      } else {
        // Fallback without lip-sync
        const chatResponse = await fetch(`${BACKEND_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, voice: "eva" }),
        });

        const chatData = await chatResponse.json();
        setResponse(chatData.text || chatData.response);
        setTimings({ llm: chatData.latency_ms, tts: chatData.tts_ms });

        if (chatData.audio_base64 && audioRef.current) {
          const audioSrc = `data:audio/mp3;base64,${chatData.audio_base64}`;
          audioRef.current.src = audioSrc;
          setIsSpeaking(true);
          audioRef.current.play();
          audioRef.current.onended = () => setIsSpeaking(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Styles for animations */}
      <style jsx>{`
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 30px rgba(147, 51, 234, 0.3); }
          50% { box-shadow: 0 0 50px rgba(147, 51, 234, 0.5); }
        }
        @keyframes speaking-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(236, 72, 153, 0.4); }
          50% { box-shadow: 0 0 60px rgba(236, 72, 153, 0.7); }
        }
        .avatar-container {
          animation: glow 3s ease-in-out infinite;
        }
        .avatar-container.speaking {
          animation: speaking-glow 1s ease-in-out infinite;
        }
      `}</style>

      <audio ref={audioRef} hidden />

      {/* Header */}
      <header className="p-4 border-b border-purple-800/30 backdrop-blur-sm bg-slate-950/50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isSpeaking ? 'bg-pink-500 animate-pulse' : 'bg-green-500'}`} />
            <h1 className="text-xl font-light tracking-wide">EVA</h1>
            <span className="text-xs bg-purple-600/80 px-2 py-1 rounded-full">RTX 4090</span>
            {useLipsync && <span className="text-xs bg-pink-600/80 px-2 py-1 rounded-full">Lip-Sync</span>}
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={useLipsync}
                onChange={(e) => setUseLipsync(e.target.checked)}
                className="w-4 h-4 accent-pink-500"
              />
              <span className="text-slate-400">Lip-Sync</span>
            </label>
            <a href="/" className="text-purple-400 hover:text-purple-300 text-sm">
              Retour
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {/* Avatar Display */}
        <div className="flex flex-col items-center mb-8">
          <div className={`avatar-container ${isSpeaking ? 'speaking' : ''} relative w-72 h-72 rounded-full overflow-hidden bg-gradient-to-br from-purple-900/50 to-pink-900/50 border-2 ${isSpeaking ? 'border-pink-500/50' : 'border-purple-500/30'}`}>
            {/* Background glow effect */}
            <div className="absolute inset-0 bg-gradient-to-t from-purple-600/20 to-transparent" />

            {/* Hidden video sources for chroma key */}
            <video
              ref={idleVideoRef}
              autoPlay
              muted
              playsInline
              loop={true}
              className="absolute opacity-0 pointer-events-none"
              style={{ width: 1, height: 1 }}
              src={idleVideos[currentIdleIndex]}
            />
            <video
              ref={speakingVideoRef}
              muted={false}
              playsInline
              onEnded={handleSpeakingVideoEnd}
              className="absolute opacity-0 pointer-events-none"
              style={{ width: 1, height: 1 }}
            />

            {/* Chroma-keyed canvas - idle */}
            <canvas
              ref={idleCanvasRef}
              className={`absolute inset-0 w-full h-full object-cover scale-110 transition-opacity duration-300 ${isSpeaking ? 'opacity-0' : 'opacity-100'}`}
              style={{
                objectFit: 'cover',
                objectPosition: 'top',
                background: 'transparent',
                imageRendering: 'auto'
              }}
            />

            {/* Chroma-keyed canvas - speaking */}
            <canvas
              ref={speakingCanvasRef}
              className={`absolute inset-0 w-full h-full object-cover scale-110 transition-opacity duration-300 ${isSpeaking ? 'opacity-100' : 'opacity-0'}`}
              style={{
                objectFit: 'cover',
                objectPosition: 'top',
                background: 'transparent',
                imageRendering: 'auto'
              }}
            />
          </div>

          {/* Status */}
          <div className="mt-4 text-center">
            {isProcessing && (
              <p className="text-purple-400 animate-pulse">Je reflechis...</p>
            )}
            {isSpeaking && !isProcessing && (
              <p className="text-pink-400 animate-pulse">Je parle...</p>
            )}
            {error && <p className="text-red-400">{error}</p>}
            {!isProcessing && !isSpeaking && !error && (
              <p className="text-slate-500 text-sm">En attente...</p>
            )}
          </div>
        </div>

        {/* Timings Dashboard */}
        <div className="grid grid-cols-5 gap-3 mb-8">
          {[
            { label: "STT", value: timings.stt, target: 100, icon: "\u{1F3A4}" },
            { label: "LLM", value: timings.llm, target: 500, icon: "\u{1F9E0}" },
            { label: "TTS", value: timings.tts, target: 100, icon: "\u{1F50A}" },
            { label: "Lip", value: timings.lipsync, target: 2000, icon: "\u{1F444}" },
            { label: "Total", value: timings.total, target: 3000, icon: "\u{26A1}" },
          ].map((item) => (
            <div
              key={item.label}
              className={`p-3 rounded-xl text-center transition-all ${
                item.value
                  ? item.value <= item.target
                    ? "bg-green-900/30 border border-green-500/50"
                    : item.value <= item.target * 1.5
                    ? "bg-yellow-900/30 border border-yellow-500/50"
                    : "bg-red-900/30 border border-red-500/50"
                  : "bg-slate-800/50 border border-slate-700/50"
              }`}
            >
              <div className="text-lg mb-1">{item.icon}</div>
              <div className="text-xs text-slate-400 mb-1">{item.label}</div>
              <div className="text-lg font-mono font-bold">
                {item.value ? `${item.value}` : "-"}
              </div>
              <div className="text-xs text-slate-500">ms</div>
            </div>
          ))}
        </div>

        {/* Conversation */}
        {(transcript || response) && (
          <div className="space-y-4 mb-8">
            {transcript && (
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs text-slate-500 mb-1">Toi:</div>
                <p className="text-slate-200">{transcript}</p>
              </div>
            )}
            {response && (
              <div className="p-4 rounded-xl bg-purple-900/30 border border-purple-500/30">
                <div className="text-xs text-purple-400 mb-1">Eva:</div>
                <p className="text-slate-200">{response}</p>
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col items-center gap-4">
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={isProcessing || isSpeaking}
            className={`p-6 rounded-full transition-all transform ${
              isRecording
                ? "bg-red-500 scale-110 shadow-lg shadow-red-500/50"
                : "bg-purple-600 hover:bg-purple-500 hover:scale-105"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </button>
          <p className="text-slate-500 text-sm">
            {isRecording ? "\u{1F534} Enregistrement..." : "Maintiens pour parler"}
          </p>
        </div>

        {/* Text input */}
        <div className="mt-6">
          <input
            type="text"
            placeholder="Ou ecris-moi..."
            className="w-full p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-slate-200 placeholder-slate-500"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isProcessing && !isSpeaking) {
                sendText((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = "";
              }
            }}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 p-3 bg-slate-950/80 backdrop-blur-sm border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto flex justify-center gap-4 text-xs text-slate-500">
          <span>Whisper large-v3</span>
          <span>*</span>
          <span>Groq LLM</span>
          <span>*</span>
          <span>Edge-TTS</span>
          <span>*</span>
          <span>MuseTalk</span>
          <span>*</span>
          <span>RTX 4090</span>
        </div>
      </footer>
    </div>
  );
}
