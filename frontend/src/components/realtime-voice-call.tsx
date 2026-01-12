"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useVAD } from "./use-vad";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  emotion?: string;
}

interface RealtimeVoiceCallProps {
  onClose: () => void;
  backendUrl: string;
  selectedVoice: string;
}

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";
type CallState = "idle" | "listening" | "processing" | "speaking";

/**
 * RealtimeVoiceCall Component
 *
 * A true real-time voice call experience with:
 * - Automatic Voice Activity Detection (VAD)
 * - Instant interruption when user speaks
 * - Low-latency chunked audio streaming
 * - Natural conversation flow like a phone call
 *
 * No push-to-talk required - just speak naturally!
 */
export function RealtimeVoiceCall({
  onClose,
  backendUrl,
  selectedVoice,
}: RealtimeVoiceCallProps) {
  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [callState, setCallState] = useState<CallState>("idle");

  // UI state
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [emotion, setEmotion] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [userVolume, setUserVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const isRecordingRef = useRef(false);
  const playNextAudioRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const callStateRef = useRef<CallState>("idle");

  // Stop current audio playback (for interruption)
  const stopAudio = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // Already stopped
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
      setCallState("idle");
      setCurrentResponse("");
    }
  }, [stopAudio]);

  // Ref to track if we're expecting more audio
  const expectingMoreAudioRef = useRef(false);

  // Play audio from queue
  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    const arrayBuffer = audioQueueRef.current.shift()!;

    // Create audio context if needed
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContext();
    }

    const ctx = audioContextRef.current;

    // Resume if suspended
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    try {
      // Clone the buffer before decoding (decodeAudioData detaches the buffer)
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

      // Update audio level for visualization
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

        // Check for more audio in queue
        if (audioQueueRef.current.length > 0) {
          // Play next chunk immediately
          playNextAudioRef.current?.();
        } else if (expectingMoreAudioRef.current) {
          // Wait a bit for more audio to arrive before going idle
          setTimeout(() => {
            if (audioQueueRef.current.length > 0) {
              playNextAudioRef.current?.();
            }
            // Don't set idle here - let speaking_end message handle it
          }, 100);
        }
        // Don't set idle - let speaking_end message handle it
      };

      source.start(0);
      updateLevel();
    } catch (err) {
      console.error("Audio play error:", err);
      isPlayingRef.current = false;
      currentSourceRef.current = null;
      setAudioLevel(0);

      // Try next chunk on error
      if (audioQueueRef.current.length > 0) {
        playNextAudioRef.current?.();
      }
    }
  }, []);

  // Keep ref updated
  useEffect(() => {
    playNextAudioRef.current = playNextAudio;
  }, [playNextAudio]);

  // Persistent stream ref for recording (reuse VAD stream)
  const persistentStreamRef = useRef<MediaStream | null>(null);

  // Start recording user speech
  const startRecording = useCallback(async () => {
    if (isRecordingRef.current || isMuted) return;

    try {
      // Reuse existing stream from VAD or create new one
      let stream = persistentStreamRef.current;

      if (!stream || stream.getTracks().some(t => t.readyState === "ended")) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        persistentStreamRef.current = stream;
      }

      // Check for supported MIME types
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      recordingChunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;
      isRecordingRef.current = true;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordingChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
    } catch (err) {
      console.error("Recording error:", err);
    }
  }, [isMuted]);

  // Stop recording and send audio
  const stopRecordingAndSend = useCallback(async () => {
    if (!isRecordingRef.current || !mediaRecorderRef.current) return;

    return new Promise<void>((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;

      mediaRecorder.onstop = async () => {
        isRecordingRef.current = false;

        // DON'T stop tracks here - keep the stream alive for reuse
        // mediaRecorder.stream.getTracks().forEach((track) => track.stop());

        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        recordingChunksRef.current = [];

        // Send to backend (minimum 500 bytes to avoid empty audio)
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && blob.size > 500) {
          console.log(`Sending audio: ${blob.size} bytes, type: ${mimeType}`);
          setCallState("processing");
          const arrayBuffer = await blob.arrayBuffer();
          wsRef.current.send(arrayBuffer);
        } else {
          console.log(`Audio too small or WS not ready: ${blob.size} bytes, WS state: ${wsRef.current?.readyState}`);
          setCallState("idle");
        }

        resolve();
      };

      mediaRecorder.stop();
    });
  }, []);

  // Keep callStateRef in sync
  useEffect(() => {
    console.log("📊 Call state changed:", callState);
    callStateRef.current = callState;
  }, [callState]);

  // VAD callbacks
  const handleSpeechStart = useCallback(() => {
    console.log("🎤 Speech detected - starting recording, current state:", callStateRef.current, "isPlaying:", isPlayingRef.current);

    // Interrupt Eva if she's speaking (use ref to avoid stale closure)
    if (callStateRef.current === "speaking" || isPlayingRef.current) {
      console.log("🛑 Interrupting Eva...");
      sendInterrupt();
    }

    setCallState("listening");
    callStateRef.current = "listening";
    startRecording();
  }, [sendInterrupt, startRecording]);

  const handleSpeechEnd = useCallback(() => {
    console.log("🎤 Speech ended - sending audio, current state:", callStateRef.current);
    stopRecordingAndSend();
  }, [stopRecordingAndSend]);

  // Initialize VAD - higher threshold when Eva is speaking to allow interruption but avoid echo
  const vad = useVAD({
    // When Eva speaks, require louder voice to interrupt (avoid echo triggering)
    // When idle, normal sensitivity
    threshold: callState === "speaking" ? 0.08 : 0.02,
    minSpeechDuration: callState === "speaking" ? 400 : 300, // Longer duration to confirm real speech during playback
    silenceTimeout: 800, // Wait 800ms of silence before ending (capture full sentences)
    minSilenceDuration: 400, // Confirm silence after 400ms
    onSpeechStart: handleSpeechStart,
    onSpeechEnd: handleSpeechEnd,
    onVolumeChange: setUserVolume,
  });

  // WebSocket connection
  useEffect(() => {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isCleanedUp = false;

    const connect = () => {
      if (isCleanedUp) return; // Don't connect if already cleaned up

      // Close existing connection if any
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, "Reconnecting");
      }

      setConnectionState("connecting");
      const wsUrl = `${backendUrl.replace("http", "ws")}/ws/interruptible`;
      console.log("Connecting to WebSocket:", wsUrl);
      const ws = new WebSocket(wsUrl);

      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        if (isCleanedUp) {
          ws.close(1000, "Component unmounted");
          return;
        }
        setConnectionState("connected");
        console.log("WebSocket connected successfully");
        reconnectAttempts = 0;

        // Configure session
        ws.send(
          JSON.stringify({
            type: "config",
            voice: selectedVoice,
            rate: "+15%",
            pitch: "+0Hz",
          })
        );

        // Start VAD after connection with a small delay
        setTimeout(() => {
          if (!isMuted && !isCleanedUp) {
            console.log("Starting VAD...");
            vad.start();
          }
        }, 500);
      };

      ws.onclose = (event) => {
        if (isCleanedUp) return;
        setConnectionState("disconnected");
        console.log("WebSocket disconnected:", event.code, event.reason);
        vad.stop();

        // Auto-reconnect if not intentionally closed and not cleaned up
        if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts && !isCleanedUp) {
          reconnectAttempts++;
          console.log(`Reconnecting... attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
          reconnectTimeout = setTimeout(connect, 2000);
        }
      };

      ws.onerror = (error) => {
        if (isCleanedUp) return;
        console.error("WebSocket error:", error);
        setConnectionState("error");
      };

      ws.onmessage = async (event) => {
        // Binary audio data
        if (event.data instanceof ArrayBuffer) {
          console.log(`Received audio chunk: ${event.data.byteLength} bytes`);
          audioQueueRef.current.push(event.data);
          playNextAudio();
          return;
        }

        try {
          const data = JSON.parse(event.data);
          console.log("WS message:", data.type, data.type === "token" ? "" : data);

          switch (data.type) {
            case "config_ok":
              console.log("Session configured:", data);
              break;

            case "speaking_start":
              console.log("Eva is speaking...");
              expectingMoreAudioRef.current = true;
              setCallState("speaking");
              break;

            case "speaking_end":
              console.log("🔊 Speaking end:", data.reason, "VAD active:", vad.isActive);
              expectingMoreAudioRef.current = false;
              if (data.reason === "interrupted") {
                stopAudio();
              }
              setCallState("idle");
              break;

            case "audio_chunk":
              console.log(`Audio chunk header received, size: ${data.size}`);
              // More audio is coming
              expectingMoreAudioRef.current = true;
              break;

            case "token":
              setCurrentResponse((prev) => prev + data.content);
              break;

            case "response_end":
              // Save message to history (prevent duplicates)
              setCurrentResponse((prev) => {
                if (prev) {
                  setMessages((msgs) => {
                    // Check if last message is same content (prevent duplicate)
                    const lastMsg = msgs[msgs.length - 1];
                    if (lastMsg?.role === "assistant" && lastMsg?.content === prev) {
                      return msgs;
                    }
                    return [
                      ...msgs,
                      {
                        role: "assistant",
                        content: prev,
                        timestamp: Date.now(),
                        emotion: emotion || undefined,
                      },
                    ];
                  });
                }
                return "";
              });
              break;

            case "transcript":
              console.log("Transcript received:", data.text);
              setCurrentTranscript(data.text);
              setMessages((msgs) => {
                // Check if last message is same content (prevent duplicate)
                const lastMsg = msgs[msgs.length - 1];
                if (lastMsg?.role === "user" && lastMsg?.content === data.text) {
                  return msgs;
                }
                return [
                  ...msgs,
                  {
                    role: "user",
                    content: data.text,
                    timestamp: Date.now(),
                  },
                ];
              });
              setCallState("processing");
              break;

            case "emotion":
              setEmotion(data.emotion);
              break;

            case "error":
              console.error("Server error:", data.message);
              setCallState("idle");
              break;

            case "pong":
              break;
          }
        } catch (e) {
          console.error("Failed to parse WS message:", e);
        }
      };

      wsRef.current = ws;
    };

    connect();

    // Start call timer
    callTimerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    // Keepalive ping - more frequent to keep connection alive
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 15000); // Every 15 seconds

    return () => {
      isCleanedUp = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect attempts
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close(1000, "Component unmounted");
        wsRef.current = null;
      }
      vad.stop();
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
      clearInterval(pingInterval);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      // Clean up persistent stream
      if (persistentStreamRef.current) {
        persistentStreamRef.current.getTracks().forEach(t => t.stop());
        persistentStreamRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, selectedVoice]);

  // Handle mute toggle
  const toggleMute = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      vad.start();
    } else {
      setIsMuted(true);
      vad.stop();
      if (isRecordingRef.current) {
        mediaRecorderRef.current?.stop();
        isRecordingRef.current = false;
      }
    }
  }, [isMuted, vad]);

  // End call
  const endCall = useCallback(() => {
    stopAudio();
    vad.stop();
    wsRef.current?.close();
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }
    onClose();
  }, [onClose, stopAudio, vad]);

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Get state info
  const getStateInfo = () => {
    switch (callState) {
      case "speaking":
        return { text: "Eva parle...", color: "from-rose-500 to-pink-500", glow: "rose" };
      case "processing":
        return { text: "Eva reflechit...", color: "from-violet-500 to-purple-500", glow: "violet" };
      case "listening":
        return { text: "Je t'ecoute...", color: "from-emerald-500 to-teal-500", glow: "emerald" };
      default:
        return { text: "Parle quand tu veux", color: "from-zinc-600 to-zinc-700", glow: "zinc" };
    }
  };

  const stateInfo = getStateInfo();

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-zinc-900 via-black to-zinc-900 flex flex-col">
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-3xl transition-all duration-700 ${
            callState === "speaking"
              ? "bg-rose-500/20 scale-110"
              : callState === "processing"
                ? "bg-violet-500/15 animate-pulse"
                : callState === "listening"
                  ? "bg-emerald-500/15 animate-pulse"
                  : "bg-zinc-500/10"
          }`}
        />
        {callState === "speaking" && (
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-2xl bg-rose-400/10"
            style={{
              transform: `translate(-50%, -50%) scale(${1 + audioLevel * 0.3})`,
              transition: "transform 0.1s ease-out",
            }}
          />
        )}
      </div>

      {/* Header */}
      <header className="relative z-10 p-6 bg-gradient-to-b from-black/80 to-transparent">
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
                ? "Appel en cours"
                : connectionState === "connecting"
                  ? "Connexion..."
                  : "Deconnecte"}
            </span>
          </div>
          <button
            onClick={endCall}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center relative z-10 px-4">
        {/* Transcript/Response display */}
        {(currentTranscript || currentResponse) && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 max-w-lg w-full px-4">
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl px-6 py-4 border border-white/10">
              <p className="text-white text-center text-lg">
                {currentResponse || currentTranscript}
                {callState === "processing" && !currentResponse && (
                  <span className="inline-flex gap-1 ml-2">
                    <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                    <span className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Main orb visualization */}
        <div className="relative">
          {/* Glow rings */}
          <div
            className={`absolute -inset-4 rounded-full transition-all duration-300 ${
              callState === "speaking"
                ? "ring-4 ring-rose-400/50 shadow-[0_0_80px_rgba(244,63,94,0.5)]"
                : callState === "processing"
                  ? "ring-4 ring-violet-400/50 shadow-[0_0_60px_rgba(139,92,246,0.4)] animate-pulse"
                  : callState === "listening"
                    ? "ring-4 ring-emerald-400/50 shadow-[0_0_60px_rgba(52,211,153,0.4)]"
                    : "ring-2 ring-white/20 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
            }`}
          />

          {/* Main orb */}
          <div
            className={`w-64 h-64 md:w-80 md:h-80 rounded-full bg-gradient-to-br ${stateInfo.color} shadow-2xl transition-all duration-500 flex items-center justify-center`}
            style={{
              transform: callState === "speaking"
                ? `scale(${1 + audioLevel * 0.1})`
                : callState === "listening"
                  ? `scale(${1 + userVolume * 0.1})`
                  : "scale(1)",
            }}
          >
            {/* Inner glow */}
            <div className="w-3/4 h-3/4 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
              {/* Microphone icon */}
              <svg
                className={`w-20 h-20 text-white/80 transition-all ${
                  callState === "listening" ? "scale-110" : callState === "speaking" ? "animate-pulse" : ""
                }`}
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
          {callState === "speaking" && (
            <>
              <div className="absolute -inset-6 rounded-full border-2 border-rose-400/40 animate-ping" />
              <div
                className="absolute -inset-8 rounded-full border border-rose-400/20 animate-ping"
                style={{ animationDelay: "0.2s" }}
              />
            </>
          )}

          {/* Listening indicator */}
          {callState === "listening" && (
            <div className="absolute -inset-6 rounded-full border-2 border-emerald-400/50 animate-pulse" />
          )}

          {/* Audio visualization ring */}
          {(callState === "speaking" || callState === "listening") && (
            <svg className="absolute -inset-10 w-[calc(100%+80px)] h-[calc(100%+80px)]" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="48"
                fill="none"
                stroke={callState === "speaking" ? "rgba(244, 63, 94, 0.4)" : "rgba(52, 211, 153, 0.4)"}
                strokeWidth="1"
                strokeDasharray={`${(callState === "speaking" ? audioLevel : userVolume) * 300} 1000`}
                className="transition-all duration-75"
                transform="rotate(-90 50 50)"
              />
            </svg>
          )}

          {/* Status text */}
          <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 text-center">
            <p className="text-white font-semibold text-2xl">Eva</p>
            <p className="text-white/60 text-sm mt-1">{stateInfo.text}</p>
            {emotion && (
              <p className="text-white/40 text-xs mt-1 capitalize">Mood: {emotion}</p>
            )}
          </div>
        </div>

        {/* Audio visualization bars when speaking */}
        {callState === "speaking" && (
          <div className="absolute bottom-48 left-1/2 -translate-x-1/2 flex items-end justify-center gap-1 h-16">
            {Array.from({ length: 32 }).map((_, i) => {
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

        {/* User volume indicator when listening */}
        {callState === "listening" && (
          <div className="absolute bottom-48 left-1/2 -translate-x-1/2 flex items-end justify-center gap-1 h-16">
            {Array.from({ length: 32 }).map((_, i) => {
              const barHeight = Math.max(4, Math.sin(i * 0.3 + userVolume * 10) * userVolume * 40 + userVolume * 20);
              return (
                <div
                  key={i}
                  className="w-1 bg-gradient-to-t from-emerald-500 to-emerald-300 rounded-full"
                  style={{
                    height: `${barHeight}px`,
                    opacity: 0.5 + userVolume * 0.5,
                    transition: "height 0.05s ease-out",
                  }}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* Controls */}
      <footer className="relative z-10 p-8 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-center gap-6 max-w-md mx-auto">
          {/* Interrupt button (only when Eva is speaking) */}
          {callState === "speaking" && (
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
            onClick={toggleMute}
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

          {/* VAD indicator */}
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
              callState === "listening"
                ? "bg-gradient-to-br from-emerald-500 to-teal-500 scale-110 shadow-lg shadow-emerald-500/50"
                : "bg-white/10"
            }`}
          >
            <svg
              className={`w-8 h-8 ${callState === "listening" ? "text-white" : "text-white/50"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>

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

        {/* Status hints */}
        <div className="text-center mt-6">
          {isMuted ? (
            <p className="text-red-400/80 text-sm">Micro desactive - clique pour reactiver</p>
          ) : callState === "speaking" ? (
            <p className="text-amber-400/80 text-sm">Tu peux interrompre Eva en parlant</p>
          ) : callState === "listening" ? (
            <p className="text-emerald-400/80 text-sm">Je t&apos;ecoute...</p>
          ) : (
            <p className="text-white/40 text-sm">Parle naturellement - pas besoin de bouton</p>
          )}
        </div>

        {/* VAD status */}
        {vad.error && (
          <p className="text-red-400 text-xs text-center mt-2">VAD Error: {vad.error}</p>
        )}
      </footer>

      {/* Conversation history */}
      {messages.length > 0 && (
        <div className="fixed bottom-32 left-4 right-4 max-h-32 overflow-y-auto pointer-events-none">
          <div className="max-w-2xl mx-auto space-y-1">
            {messages.slice(-4).map((msg, i) => (
              <div
                key={i}
                className={`text-xs px-3 py-1 rounded-full inline-block ${
                  msg.role === "user"
                    ? "bg-zinc-800/50 text-zinc-400"
                    : "bg-rose-500/20 text-rose-300"
                }`}
              >
                {msg.content.slice(0, 50)}
                {msg.content.length > 50 && "..."}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
