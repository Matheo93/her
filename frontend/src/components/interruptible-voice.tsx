"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  emotion?: string;
}

interface InterruptibleVoiceProps {
  onClose: () => void;
  backendUrl: string;
  selectedVoice: string;
  messages: Message[];
  onNewMessage: (message: Message) => void;
}

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";
type SpeakingState = "idle" | "listening" | "thinking" | "speaking";

/**
 * InterruptibleVoice Component
 *
 * Features:
 * - Real-time speech interruption: User can interrupt Eva mid-speech
 * - Chunked audio streaming for low latency
 * - Natural conversation flow with overlapping speech detection
 * - Visual feedback for all states
 */
export function InterruptibleVoice({
  onClose,
  backendUrl,
  selectedVoice,
  messages: _messages, // Available for future use (conversation history display)
  onNewMessage,
}: InterruptibleVoiceProps) {
  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [speakingState, setSpeakingState] = useState<SpeakingState>("idle");

  // UI state
  const [transcript, setTranscript] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [emotion, setEmotion] = useState<string | null>(null);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Stop current audio playback (for interruption)
  const stopAudio = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // Already stopped - ignore error
      }
      currentSourceRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setAudioLevel(0);
  }, []);

  // Send interrupt signal to backend
  const sendInterrupt = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "interrupt" }));
      stopAudio();
      setSpeakingState("idle");
    }
  }, [stopAudio]);

  // Play audio from queue - using a ref to avoid self-reference issue
  const playNextAudioRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;

    const arrayBuffer = audioQueueRef.current.shift()!;

    // Create audio context if needed
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContext();
    }

    const ctx = audioContextRef.current;

    // Resume if suspended (browser autoplay policy)
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      currentSourceRef.current = source;

      // Create analyzer for visualization
      const analyzer = ctx.createAnalyser();
      analyzer.fftSize = 32;
      analyzer.smoothingTimeConstant = 0.5;
      analyzerRef.current = analyzer;

      source.connect(analyzer);
      analyzer.connect(ctx.destination);

      // Update audio level for mouth animation
      const dataArray = new Uint8Array(analyzer.frequencyBinCount);
      const updateLevel = () => {
        if (!isPlayingRef.current) return;
        analyzer.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
        setAudioLevel(avg);
        requestAnimationFrame(updateLevel);
      };

      source.onended = () => {
        isPlayingRef.current = false;
        currentSourceRef.current = null;
        setAudioLevel(0);

        if (audioQueueRef.current.length > 0) {
          playNextAudioRef.current?.();
        } else {
          // All audio finished
          setSpeakingState("idle");
        }
      };

      source.start(0);
      updateLevel();
    } catch (_err) {
      console.error("Audio play error:", _err);
      isPlayingRef.current = false;
      currentSourceRef.current = null;
      setAudioLevel(0);

      if (audioQueueRef.current.length > 0) {
        playNextAudioRef.current?.();
      } else {
        setSpeakingState("idle");
      }
    }
  }, []);

  // Keep ref updated for self-reference in callbacks
  useEffect(() => {
    playNextAudioRef.current = playNextAudio;
  }, [playNextAudio]);

  // WebSocket connection
  useEffect(() => {
    const connect = () => {
      setConnectionState("connecting");
      const ws = new WebSocket(`${backendUrl.replace("http", "ws")}/ws/interruptible`);

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        setConnectionState("connected");
        console.log("Interruptible voice connected");

        // Configure session
        ws.send(
          JSON.stringify({
            type: "config",
            voice: selectedVoice,
            rate: "+15%",  // Fast natural speech
            pitch: "+0Hz",
          })
        );
      };

      ws.onclose = () => {
        setConnectionState("disconnected");
        console.log("Interruptible voice disconnected");
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setConnectionState("error");
      };

      ws.onmessage = async (event) => {
        // Binary audio data
        if (event.data instanceof ArrayBuffer) {
          audioQueueRef.current.push(event.data);
          playNextAudio();
          return;
        }

        const data = JSON.parse(event.data);

        switch (data.type) {
          case "config_ok":
            console.log("Session configured:", data);
            break;

          case "speaking_start":
            setSpeakingState("speaking");
            break;

          case "speaking_end":
            if (data.reason === "interrupted") {
              console.log("Speech interrupted by user");
            }
            stopAudio();
            setSpeakingState("idle");
            break;

          case "token":
            setCurrentResponse((prev) => prev + data.content);
            break;

          case "response_end":
            setCurrentResponse((prev) => {
              if (prev) {
                onNewMessage({ role: "assistant", content: prev, emotion: emotion || undefined });
              }
              return "";
            });
            setSpeakingState(speakingState === "speaking" ? "speaking" : "idle");
            break;

          case "transcript":
            setTranscript(data.text);
            onNewMessage({ role: "user", content: data.text });
            setSpeakingState("thinking");
            setCurrentResponse("");
            break;

          case "emotion":
            setEmotion(data.emotion);
            break;

          case "audio_chunk":
            // Audio chunk notification - actual data comes as binary
            break;

          case "error":
            console.error("WebSocket error:", data.message);
            setSpeakingState("idle");
            break;

          case "pong":
            // Keepalive response
            break;
        }
      };

      wsRef.current = ws;
    };

    connect();

    // Start call timer
    callTimerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    // Keepalive ping
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    return () => {
      wsRef.current?.close();
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
      clearInterval(pingInterval);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [backendUrl, selectedVoice, playNextAudio, onNewMessage, stopAudio, emotion, speakingState]);

  // Voice recording with interrupt capability
  const startListening = useCallback(async () => {
    if (speakingState === "listening" || !wsRef.current || isMuted) return;

    // If Eva is speaking, interrupt her
    if (speakingState === "speaking") {
      sendInterrupt();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];

      mediaRecorderRef.current = mediaRecorder;

      // Notify backend that user is speaking (to interrupt Eva)
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "user_speaking" }));
      }

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          setSpeakingState("thinking");
          setTranscript("");
          audioQueueRef.current = [];

          // Convert blob to ArrayBuffer and send
          const arrayBuffer = await blob.arrayBuffer();
          wsRef.current.send(arrayBuffer);
        } else {
          setSpeakingState("idle");
        }
      };

      mediaRecorder.start();
      setSpeakingState("listening");
    } catch (err) {
      console.error("Mic error:", err);
      alert("Autorise l'accès au micro pour parler avec Eva");
      setSpeakingState("idle");
    }
  }, [speakingState, isMuted, sendInterrupt]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Send text message - available for future text input feature
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    // Interrupt any ongoing speech
    if (speakingState === "speaking") {
      sendInterrupt();
    }

    wsRef.current.send(JSON.stringify({
      type: "message",
      content,
    }));

    onNewMessage({ role: "user", content });
    setSpeakingState("thinking");
    setCurrentResponse("");
  }, [speakingState, sendInterrupt, onNewMessage]);

  // End call
  const endCall = useCallback(() => {
    stopAudio();
    wsRef.current?.close();
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    onClose();
  }, [onClose, stopAudio]);

  // Calculate mouth open amount based on audio level
  const mouthOpen = Math.min(1, audioLevel * 2.5);

  // Get state color
  const getStateColor = () => {
    switch (speakingState) {
      case "speaking":
        return "from-rose-500 to-pink-500";
      case "thinking":
        return "from-violet-500 to-purple-500";
      case "listening":
        return "from-emerald-500 to-teal-500";
      default:
        return "from-zinc-600 to-zinc-700";
    }
  };

  // Get state text
  const getStateText = () => {
    switch (speakingState) {
      case "speaking":
        return "Parle...";
      case "thinking":
        return "Réfléchit...";
      case "listening":
        return "T'écoute...";
      default:
        return "En attente";
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-zinc-900 via-black to-zinc-900">
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-3xl transition-all duration-1000 ${
            speakingState === "speaking"
              ? "bg-rose-500/20 scale-110"
              : speakingState === "thinking"
                ? "bg-violet-500/15 animate-pulse"
                : speakingState === "listening"
                  ? "bg-emerald-500/15 animate-pulse"
                  : "bg-zinc-500/10"
          }`}
        />
        {speakingState === "speaking" && (
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-2xl bg-rose-400/10"
            style={{
              transform: `translate(-50%, -50%) scale(${1 + audioLevel * 0.3})`,
              transition: "transform 0.1s ease-out",
            }}
          />
        )}
      </div>

      {/* Video container */}
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Avatar Display */}
        <div className="relative">
          {/* Glow rings */}
          <div
            className={`absolute -inset-2 rounded-full transition-all duration-300 ${
              speakingState === "speaking"
                ? "ring-4 ring-rose-400/50 shadow-[0_0_80px_rgba(244,63,94,0.5)]"
                : speakingState === "thinking"
                  ? "ring-4 ring-violet-400/50 shadow-[0_0_60px_rgba(139,92,246,0.4)] animate-pulse"
                  : speakingState === "listening"
                    ? "ring-4 ring-emerald-400/50 shadow-[0_0_60px_rgba(52,211,153,0.4)]"
                    : "ring-2 ring-white/20 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
            }`}
          />

          {/* Main orb */}
          <div
            className={`w-72 h-72 md:w-96 md:h-96 rounded-full bg-gradient-to-br ${getStateColor()} shadow-2xl transition-all duration-500 flex items-center justify-center`}
            style={{
              transform: speakingState === "speaking" ? `scale(${1 + mouthOpen * 0.05})` : "scale(1)",
            }}
          >
            {/* Inner glow */}
            <div className="w-3/4 h-3/4 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
              {/* Voice icon */}
              <svg
                className={`w-24 h-24 text-white/80 ${speakingState === "speaking" ? "animate-pulse" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>
          </div>

          {/* Speaking pulse rings */}
          {speakingState === "speaking" && (
            <>
              <div className="absolute -inset-4 rounded-full border-2 border-rose-400/40 animate-ping" />
              <div
                className="absolute -inset-6 rounded-full border border-rose-400/20 animate-ping"
                style={{ animationDelay: "0.2s" }}
              />
            </>
          )}

          {/* Audio visualization ring */}
          {speakingState === "speaking" && (
            <svg
              className="absolute -inset-8 w-[calc(100%+64px)] h-[calc(100%+64px)]"
              viewBox="0 0 100 100"
            >
              <circle
                cx="50"
                cy="50"
                r="48"
                fill="none"
                stroke="rgba(244, 63, 94, 0.4)"
                strokeWidth="1"
                strokeDasharray={`${audioLevel * 300} 1000`}
                className="transition-all duration-75"
                transform="rotate(-90 50 50)"
              />
            </svg>
          )}

          {/* Status text */}
          <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 text-center">
            <p className="text-white font-semibold text-2xl">Eva</p>
            <p className="text-white/60 text-sm mt-1">{getStateText()}</p>
            {emotion && (
              <p className="text-white/40 text-xs mt-1 capitalize">Mood: {emotion}</p>
            )}
          </div>
        </div>

        {/* Header */}
        <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  connectionState === "connected"
                    ? "bg-emerald-400 animate-pulse"
                    : connectionState === "connecting"
                      ? "bg-amber-400 animate-pulse"
                      : "bg-red-400"
                }`}
              />
              <span className="text-white font-medium">{formatDuration(callDuration)}</span>
              <span className="text-white/40 text-sm">
                {connectionState === "connected"
                  ? "Connecté - Parole interruptible"
                  : connectionState === "connecting"
                    ? "Connexion..."
                    : "Déconnecté"}
              </span>
            </div>
            <button
              onClick={endCall}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Current transcript/response */}
        {(transcript || currentResponse) && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 max-w-lg w-full px-4">
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl px-6 py-4 border border-white/10">
              <p className="text-white text-center text-lg">
                {currentResponse || transcript}
                {speakingState === "thinking" && !currentResponse && (
                  <span className="inline-flex gap-1 ml-2">
                    <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" />
                    <span
                      className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    />
                    <span
                      className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Audio visualization bars */}
        {speakingState === "speaking" && (
          <div className="absolute bottom-48 left-1/2 -translate-x-1/2 flex items-end justify-center gap-1 h-16">
            {Array.from({ length: 32 }).map((_, i) => {
              // Use audioLevel-based animation instead of Date.now() for purity
              const barHeight = Math.max(4, Math.sin(i * 0.3 + audioLevel * 10) * audioLevel * 40 + audioLevel * 20);
              return (
                <div
                  key={i}
                  className="w-1 bg-gradient-to-t from-rose-500 to-rose-300 rounded-full"
                  style={{
                    height: `${barHeight}px`,
                    opacity: 0.5 + audioLevel * 0.5,
                    transition: "height 0.05s ease-out",
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center justify-center gap-6 max-w-md mx-auto">
            {/* Interrupt button (only when Eva is speaking) */}
            {speakingState === "speaking" && (
              <button
                onClick={sendInterrupt}
                className="w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center transition-all animate-pulse"
                title="Interrompre Eva"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            )}

            {/* Mute toggle */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                isMuted ? "bg-red-500 text-white" : "bg-white/10 hover:bg-white/20 text-white"
              }`}
            >
              {isMuted ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              )}
            </button>

            {/* Push to talk */}
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              disabled={connectionState !== "connected" || isMuted}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                speakingState === "listening"
                  ? "bg-gradient-to-br from-emerald-500 to-teal-500 text-white scale-110 shadow-lg shadow-emerald-500/50"
                  : connectionState === "connected" && !isMuted
                    ? "bg-white/20 hover:bg-white/30 text-white hover:scale-105"
                    : "bg-white/5 text-white/30 cursor-not-allowed"
              }`}
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

            {/* End call */}
            <button
              onClick={endCall}
              className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all hover:scale-105"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.28 3H5z"
                />
              </svg>
            </button>
          </div>

          {/* Listening indicator */}
          {speakingState === "listening" && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-white/80 text-sm">Parle, je t&apos;ecoute...</span>
            </div>
          )}

          {/* Interrupt hint */}
          {speakingState === "speaking" && (
            <p className="text-amber-400/80 text-sm text-center mt-6">
              Tu peux m&apos;interrompre en appuyant sur le bouton pause ou en parlant
            </p>
          )}

          {/* Hint */}
          {speakingState === "idle" && connectionState === "connected" && (
            <p className="text-white/40 text-sm text-center mt-6">
              Maintiens le bouton micro pour parler - Tu peux interrompre Eva a tout moment
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
