"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// Canvas-based video renderer with optional chroma key
// Supports videos with alpha channel (no processing needed) and green screen videos
function useChromaKey2D(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  isActive: boolean
) {
  const animationRef = useRef<number>(0);
  const hasAlphaRef = useRef<boolean | null>(null);
  const renderRef = useRef<() => void>(() => {});

  // Store the render function in a ref to avoid self-reference issues
  const render = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.paused || video.ended || video.readyState < 2) {
      if (isActive) {
        animationRef.current = requestAnimationFrame(() => renderRef.current());
      }
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
    if (!ctx) return;

    // Match canvas to video native resolution
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 512;
      canvas.height = video.videoHeight || 512;
      hasAlphaRef.current = null; // Reset alpha detection on size change
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw video frame
    ctx.drawImage(video, 0, 0);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Detect if video has alpha channel (check first frame only)
    if (hasAlphaRef.current === null) {
      let hasTransparent = false;
      for (let i = 3; i < Math.min(data.length, 4000); i += 4) {
        if (data[i] < 250) {
          hasTransparent = true;
          break;
        }
      }
      hasAlphaRef.current = hasTransparent;
    }

    // If video has alpha, just draw it (no chroma key needed)
    if (hasAlphaRef.current) {
      ctx.putImageData(imageData, 0, 0);
      if (isActive) {
        animationRef.current = requestAnimationFrame(() => renderRef.current());
      }
      return;
    }

    // OPTIMIZED CHROMA KEY - using Uint32Array for faster pixel access
    const pixels = new Uint32Array(data.buffer);
    const len = pixels.length;

    for (let i = 0; i < len; i++) {
      const pixel = pixels[i];
      // Extract RGBA (little-endian: ABGR)
      const r = pixel & 0xFF;
      const g = (pixel >> 8) & 0xFF;
      const b = (pixel >> 16) & 0xFF;

      const maxRB = r > b ? r : b;
      const greenDominance = g - maxRB;

      if (greenDominance > 50 && g > 100) {
        // Make transparent (set alpha to 0)
        pixels[i] = pixel & 0x00FFFFFF; // Clear alpha byte
      } else if (greenDominance > 10) {
        // Despill: reduce green
        const newG = (maxRB + (greenDominance * 0.15)) | 0;
        pixels[i] = (pixel & 0xFF0000FF) | (newG << 8) | (b << 16) | 0xFF000000;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    if (isActive) {
      animationRef.current = requestAnimationFrame(() => renderRef.current());
    }
  }, [videoRef, canvasRef, isActive]);

  // Keep renderRef updated with latest render function
  useEffect(() => {
    renderRef.current = render;
  }, [render]);

  useEffect(() => {
    if (isActive) {
      animationRef.current = requestAnimationFrame(() => renderRef.current());
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive]);
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

  // Green screen idle video - chroma key applied in canvas
  const idleVideos = [
    "/avatars/eva_idle_transparent.webm",
  ];
  const [currentIdleIndex] = useState(0);
  const [, setSpeakingVideoSrc] = useState<string | null>(null);

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
    } catch {
      setError("Acces micro refuse");
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

      if (!voiceResponse.ok) throw new Error("Erreur traitement vocal");

      const data = await voiceResponse.json();

      setTranscript(data.user_text);
      setResponse(data.eva_response);
      setTimings({
        stt: data.latency?.stt_ms,
        llm: data.latency?.llm_ms,
        tts: data.latency?.tts_ms,
        total: data.latency?.total_ms,
      });

      // PLAY AUDIO IMMEDIATELY (no waiting for video!)
      if (data.audio_base64 && audioRef.current) {
        const audioSrc = `data:audio/mp3;base64,${data.audio_base64}`;
        audioRef.current.src = audioSrc;
        setIsSpeaking(true);
        audioRef.current.play();
        audioRef.current.onended = () => {
          // Only stop speaking if no video is playing
          if (!speakingVideoRef.current || speakingVideoRef.current.paused) {
            setIsSpeaking(false);
          }
        };
      }

      // Poll for lip-sync video in background
      if (data.lipsync_task_id && useLipsync) {
        const pollForVideo = async () => {
          const maxAttempts = 30; // Max 30 seconds
          for (let i = 0; i < maxAttempts; i++) {
            await new Promise(r => setTimeout(r, 1000)); // Wait 1s between polls
            try {
              const statusRes = await fetch(`${BACKEND_URL}/lipsync/status/${data.lipsync_task_id}`);
              const status = await statusRes.json();

              if (status.status === "ready" && status.video_base64 && speakingVideoRef.current) {
                // Video is ready! Switch from audio to video
                const videoSrc = `data:video/mp4;base64,${status.video_base64}`;
                setSpeakingVideoSrc(videoSrc);

                // Update timing
                setTimings(prev => ({ ...prev, lipsync: status.generation_time_ms }));

                // Pause audio, play video (video has its own audio)
                if (audioRef.current) {
                  audioRef.current.pause();
                }
                if (idleVideoRef.current) {
                  idleVideoRef.current.pause();
                }

                speakingVideoRef.current.src = videoSrc;
                speakingVideoRef.current.play();
                break;
              } else if (status.status === "error") {
                break;
              }
              // Still processing, continue polling
            } catch (e) {
              console.error("Error polling lip-sync status:", e);
            }
          }
        };

        // Start polling (don't await - let audio play)
        pollForVideo();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de traitement");
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
      if (useLipsync) {
        // Get LLM response
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
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsProcessing(false);
    }
  };

  // Get timing color based on performance
  const getTimingStyle = (value: number | undefined, target: number) => {
    if (!value) {
      return {
        bg: `${HER_COLORS.cream}80`,
        border: `${HER_COLORS.softShadow}40`,
        text: HER_COLORS.textMuted,
      };
    }
    if (value <= target) {
      return {
        bg: `${HER_COLORS.success}15`,
        border: `${HER_COLORS.success}40`,
        text: HER_COLORS.success,
      };
    }
    if (value <= target * 1.5) {
      return {
        bg: `${HER_COLORS.blush}40`,
        border: HER_COLORS.blush,
        text: HER_COLORS.earth,
      };
    }
    return {
      bg: `${HER_COLORS.error}15`,
      border: `${HER_COLORS.error}40`,
      text: HER_COLORS.error,
    };
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
      }}
    >
      <audio ref={audioRef} hidden />

      {/* Header */}
      <header
        className="p-4 backdrop-blur-sm"
        style={{
          backgroundColor: `${HER_COLORS.warmWhite}E6`,
          borderBottom: `1px solid ${HER_COLORS.softShadow}40`,
        }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: isSpeaking ? HER_COLORS.coral : HER_COLORS.success,
              }}
              animate={isSpeaking ? { scale: [1, 1.2, 1] } : {}}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
            <h1 className="text-xl font-light" style={{ color: HER_COLORS.earth }}>
              EVA
            </h1>
            <span
              className="text-xs px-2 py-1 rounded-full"
              style={{ backgroundColor: HER_COLORS.earth, color: HER_COLORS.warmWhite }}
            >
              GPU
            </span>
            {useLipsync && (
              <span
                className="text-xs px-2 py-1 rounded-full"
                style={{ backgroundColor: HER_COLORS.coral, color: HER_COLORS.warmWhite }}
              >
                Lip-Sync
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={useLipsync}
                onChange={(e) => setUseLipsync(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: HER_COLORS.coral }}
              />
              <span style={{ color: HER_COLORS.textSecondary }}>Lip-Sync</span>
            </label>
            <Link
              href="/"
              className="text-sm transition-colors"
              style={{ color: HER_COLORS.coral }}
            >
              Retour
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {/* Avatar Display */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            className="relative w-72 h-72 rounded-full overflow-hidden"
            style={{
              border: isSpeaking ? `3px solid ${HER_COLORS.coral}` : `2px solid ${HER_COLORS.softShadow}40`,
              boxShadow: isSpeaking
                ? `0 0 40px ${HER_COLORS.glowCoral}`
                : `0 4px 20px ${HER_COLORS.softShadow}40`,
            }}
            animate={isSpeaking ? { scale: [1, 1.02, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Warm background */}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to bottom, ${HER_COLORS.cream}, ${HER_COLORS.blush}40, ${HER_COLORS.cream})`,
                zIndex: 0,
              }}
            />
            {/* Subtle glow */}
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to top, ${HER_COLORS.coral}15, transparent)`,
                zIndex: 1,
              }}
            />

            {/* Hidden video sources for chroma key */}
            <video
              ref={idleVideoRef}
              autoPlay
              muted
              playsInline
              loop={true}
              className="absolute opacity-0 pointer-events-none"
              style={{ width: 1, height: 1, zIndex: -1 }}
              src={idleVideos[currentIdleIndex]}
            />
            <video
              ref={speakingVideoRef}
              muted={false}
              playsInline
              onEnded={handleSpeakingVideoEnd}
              className="absolute opacity-0 pointer-events-none"
              style={{ width: 1, height: 1, zIndex: -1 }}
            />

            {/* Chroma-keyed canvas - idle */}
            <canvas
              ref={idleCanvasRef}
              className={`absolute inset-0 w-full h-full scale-110 transition-opacity duration-300 ${isSpeaking ? 'opacity-0' : 'opacity-100'}`}
              style={{
                zIndex: 2,
                backgroundColor: 'transparent',
                background: 'none'
              }}
            />

            {/* Chroma-keyed canvas - speaking */}
            <canvas
              ref={speakingCanvasRef}
              className={`absolute inset-0 w-full h-full scale-110 transition-opacity duration-300 ${isSpeaking ? 'opacity-100' : 'opacity-0'}`}
              style={{
                zIndex: 2,
                backgroundColor: 'transparent',
                background: 'none'
              }}
            />
          </motion.div>

          {/* Status */}
          <div className="mt-4 text-center">
            {isProcessing && (
              <motion.p
                style={{ color: HER_COLORS.coral }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                Je reflechis...
              </motion.p>
            )}
            {isSpeaking && !isProcessing && (
              <motion.p
                style={{ color: HER_COLORS.coral }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                Je parle...
              </motion.p>
            )}
            {error && <p style={{ color: HER_COLORS.error }}>{error}</p>}
            {!isProcessing && !isSpeaking && !error && (
              <p className="text-sm" style={{ color: HER_COLORS.textMuted }}>
                En attente...
              </p>
            )}
          </div>
        </div>

        {/* Timings Dashboard - HER style */}
        <div className="grid grid-cols-5 gap-3 mb-8">
          {[
            { label: "STT", value: timings.stt, target: 100 },
            { label: "LLM", value: timings.llm, target: 500 },
            { label: "TTS", value: timings.tts, target: 100 },
            { label: "Lip", value: timings.lipsync, target: 2000 },
            { label: "Total", value: timings.total, target: 3000 },
          ].map((item) => {
            const style = getTimingStyle(item.value, item.target);
            return (
              <motion.div
                key={item.label}
                className="p-3 rounded-xl text-center transition-all"
                style={{
                  backgroundColor: style.bg,
                  border: `1px solid ${style.border}`,
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={HER_SPRINGS.gentle}
              >
                <div className="text-xs mb-1" style={{ color: HER_COLORS.textMuted }}>
                  {item.label}
                </div>
                <div className="text-lg font-mono font-medium" style={{ color: style.text }}>
                  {item.value ? `${item.value}` : "-"}
                </div>
                <div className="text-xs" style={{ color: HER_COLORS.textMuted }}>
                  ms
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Conversation */}
        {(transcript || response) && (
          <motion.div
            className="space-y-4 mb-8"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={HER_SPRINGS.gentle}
          >
            {transcript && (
              <div
                className="p-4 rounded-xl"
                style={{
                  backgroundColor: `${HER_COLORS.cream}E6`,
                  border: `1px solid ${HER_COLORS.softShadow}40`,
                }}
              >
                <div className="text-xs mb-1" style={{ color: HER_COLORS.textMuted }}>
                  Toi:
                </div>
                <p style={{ color: HER_COLORS.earth }}>{transcript}</p>
              </div>
            )}
            {response && (
              <div
                className="p-4 rounded-xl"
                style={{
                  backgroundColor: `${HER_COLORS.coral}15`,
                  border: `1px solid ${HER_COLORS.coral}40`,
                }}
              >
                <div className="text-xs mb-1" style={{ color: HER_COLORS.coral }}>
                  Eva:
                </div>
                <p style={{ color: HER_COLORS.earth }}>{response}</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Controls */}
        <div className="flex flex-col items-center gap-4">
          <motion.button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={isProcessing || isSpeaking}
            className="p-6 rounded-full transition-all"
            style={{
              backgroundColor: isRecording ? HER_COLORS.coral : HER_COLORS.cream,
              color: isRecording ? HER_COLORS.warmWhite : HER_COLORS.earth,
              boxShadow: isRecording
                ? `0 0 30px ${HER_COLORS.glowCoral}`
                : `0 4px 16px ${HER_COLORS.softShadow}40`,
              opacity: isProcessing || isSpeaking ? 0.5 : 1,
              cursor: isProcessing || isSpeaking ? "not-allowed" : "pointer",
            }}
            whileHover={!isProcessing && !isSpeaking ? { scale: 1.05 } : {}}
            whileTap={!isProcessing && !isSpeaking ? { scale: 0.95 } : {}}
            animate={isRecording ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 1, repeat: isRecording ? Infinity : 0 }}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </motion.button>
          <p className="text-sm" style={{ color: HER_COLORS.textMuted }}>
            {isRecording ? "Enregistrement..." : "Maintiens pour parler"}
          </p>
        </div>

        {/* Text input */}
        <div className="mt-6">
          <input
            type="text"
            placeholder="Ou ecris-moi..."
            className="w-full p-4 rounded-xl focus:outline-none transition-all"
            style={{
              backgroundColor: HER_COLORS.cream,
              border: `1px solid ${HER_COLORS.softShadow}`,
              color: HER_COLORS.earth,
            }}
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
      <footer
        className="fixed bottom-0 left-0 right-0 p-3 backdrop-blur-sm"
        style={{
          backgroundColor: `${HER_COLORS.warmWhite}E6`,
          borderTop: `1px solid ${HER_COLORS.softShadow}40`,
        }}
      >
        <div
          className="max-w-4xl mx-auto flex justify-center gap-4 text-xs"
          style={{ color: HER_COLORS.textMuted }}
        >
          <span>Whisper</span>
          <span style={{ color: HER_COLORS.softShadow }}>*</span>
          <span>Groq LLM</span>
          <span style={{ color: HER_COLORS.softShadow }}>*</span>
          <span>Edge-TTS</span>
          <span style={{ color: HER_COLORS.softShadow }}>*</span>
          <span>MuseTalk</span>
          <span style={{ color: HER_COLORS.softShadow }}>*</span>
          <span>GPU</span>
        </div>
      </footer>
    </div>
  );
}
