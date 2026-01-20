"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  emotion?: string;
}

interface Avatar {
  id: string;
  name: string;
  gender: "male" | "female" | "unknown";
}

interface VideoCallProps {
  onClose: () => void;
  backendUrl: string;
  selectedVoice: string;
  messages: Message[];
  onNewMessage: (message: Message) => void;
}

// Avatar configuration with gender mapping
const AVATARS: Avatar[] = [
  { id: "eva", name: "Eva", gender: "female" },
  { id: "luna", name: "Luna", gender: "female" },
  { id: "emma", name: "Emma", gender: "female" },
  { id: "adam", name: "Adam", gender: "male" },
  { id: "alex", name: "Alex", gender: "male" },
];

// Map voices to default avatars
const VOICE_AVATAR_MAP: Record<string, string> = {
  "eva": "eva",
  "eva-warm": "eva",
  "eva-young": "luna",
  "eva-soft": "emma",
  "eva-sensual": "eva",
  "male": "adam",
  "male-warm": "adam",
  "male-deep": "alex",
  "eva-en": "eva",
  "eva-en-warm": "eva",
};

export function VideoCall({
  onClose,
  backendUrl,
  selectedVoice,
  messages,
  onNewMessage,
}: VideoCallProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  // Track manual avatar selection vs voice-derived
  const [manualAvatar, setManualAvatar] = useState<string | null>(null);
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);

  // Derive selectedAvatar from voice, but allow manual override
  const selectedAvatar = manualAvatar ?? VOICE_AVATAR_MAP[selectedVoice] ?? "eva";
  const setSelectedAvatar = (avatar: string) => setManualAvatar(avatar);

  const wsRef = useRef<WebSocket | null>(null);
  const audioQueueRef = useRef<Blob[]>([]);
  const isPlayingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playNextAudioRef = useRef<() => void>(() => {});
  const analyzerRef = useRef<AnalyserNode | null>(null);

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Audio queue player with real-time level detection
  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const blob = audioQueueRef.current.shift()!;
    const arrayBuffer = await blob.arrayBuffer();

    // Create audio context if needed
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const ctx = audioContextRef.current;

    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Create analyzer for lip-sync visualization
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
        setAudioLevel(0);

        if (audioQueueRef.current.length > 0) {
          playNextAudioRef.current();
        } else {
          setIsSpeaking(false);
        }
      };

      source.start(0);
      updateLevel();
    } catch (e) {
      console.error("Audio play error:", e);
      isPlayingRef.current = false;
      setIsSpeaking(false);
      setAudioLevel(0);

      if (audioQueueRef.current.length > 0) {
        playNextAudioRef.current();
      }
    }
  }, []);

  // Keep ref updated
  useEffect(() => {
    playNextAudioRef.current = playNextAudio;
  }, [playNextAudio]);

  // WebSocket connection to backend
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${backendUrl.replace("http", "ws")}/ws/stream`);

      ws.onopen = () => {
        setIsConnected(true);
        console.log("Video call connected");
        ws.send(
          JSON.stringify({
            type: "config",
            voice: selectedVoice,
            auto_mood: true,
          })
        );
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log("Video call disconnected");
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          audioQueueRef.current.push(event.data);
          playNextAudio();
          return;
        }

        const data = JSON.parse(event.data);

        switch (data.type) {
          case "token":
            setCurrentResponse((prev) => prev + data.content);
            break;

          case "response_end":
            setCurrentResponse((prev) => {
              if (prev) {
                onNewMessage({ role: "assistant", content: prev });
              }
              return "";
            });
            setIsThinking(false);
            break;

          case "transcript":
            setTranscript(data.text);
            onNewMessage({ role: "user", content: data.text });
            setIsThinking(true);
            setCurrentResponse("");
            break;

          case "error":
            console.error("WebSocket error:", data.message);
            setIsThinking(false);
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

    return () => {
      wsRef.current?.close();
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
    };
  }, [backendUrl, selectedVoice, playNextAudio, onNewMessage]);

  // Voice recording
  const startListening = useCallback(async () => {
    if (isListening || !wsRef.current || isMuted) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        setIsListening(false);
        setTranscript("");

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          setIsThinking(true);
          audioQueueRef.current = [];
          wsRef.current.send(blob);
        }
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.error("Mic error:", err);
      alert("Autorise l'acces au micro pour parler avec l'assistant");
    }
  }, [isListening, isMuted]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // End call
  const endCall = useCallback(() => {
    wsRef.current?.close();
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }
    onClose();
  }, [onClose]);

  // Calculate mouth open amount based on audio level
  const mouthOpen = Math.min(1, audioLevel * 2.5);

  // Get current avatar info
  const currentAvatar = AVATARS.find(a => a.id === selectedAvatar) || AVATARS[0];

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-zinc-900 via-black to-zinc-900">
      {/* Ambient background */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-3xl transition-all duration-1000 ${
            isSpeaking
              ? currentAvatar.gender === "male"
                ? "bg-blue-500/20 scale-110"
                : "bg-rose-500/20 scale-110"
              : isThinking
                ? "bg-violet-500/15 animate-pulse"
                : "bg-zinc-500/10"
          }`}
        />
        {isSpeaking && (
          <div
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-2xl ${
              currentAvatar.gender === "male" ? "bg-blue-400/10" : "bg-rose-400/10"
            }`}
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
              isSpeaking
                ? currentAvatar.gender === "male"
                  ? "ring-4 ring-blue-400/50 shadow-[0_0_80px_rgba(59,130,246,0.5)]"
                  : "ring-4 ring-rose-400/50 shadow-[0_0_80px_rgba(244,63,94,0.5)]"
                : isThinking
                  ? "ring-4 ring-violet-400/50 shadow-[0_0_60px_rgba(139,92,246,0.4)] animate-pulse"
                  : "ring-2 ring-white/20 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
            }`}
          />

          {/* Avatar Image with CSS lip-sync animation */}
          <div
            className="relative w-72 h-72 md:w-96 md:h-96 rounded-full overflow-hidden cursor-pointer"
            onClick={() => setShowAvatarSelector(!showAvatarSelector)}
          >
            <img
              src={`/avatars/${selectedAvatar}_nobg.png`}
              alt={currentAvatar.name}
              className="w-full h-full object-cover object-top"
              style={{
                filter: isSpeaking
                  ? "brightness(1.1) contrast(1.05)"
                  : isThinking
                    ? "brightness(0.95) saturate(0.9)"
                    : "brightness(1)",
                transform: isSpeaking ? `scaleY(${1 + mouthOpen * 0.02})` : "scaleY(1)",
                transformOrigin: "center 60%",
                transition: "transform 0.05s ease-out, filter 0.3s ease",
              }}
              onError={(e) => {
                // Fallback to jpg if nobg.png doesn't exist
                (e.target as HTMLImageElement).src = `/avatars/${selectedAvatar}.jpg`;
              }}
            />

            {/* Lip-sync mouth overlay (CSS-based) */}
            {isSpeaking && (
              <div
                className={`absolute bottom-[30%] left-1/2 -translate-x-1/2 w-16 h-4 rounded-full blur-sm ${
                  currentAvatar.gender === "male"
                    ? "bg-gradient-to-b from-blue-900/20 to-transparent"
                    : "bg-gradient-to-b from-rose-900/20 to-transparent"
                }`}
                style={{
                  height: `${8 + mouthOpen * 16}px`,
                  opacity: mouthOpen * 0.5,
                  transition: "height 0.05s ease-out, opacity 0.05s ease-out",
                }}
              />
            )}
          </div>

          {/* Speaking pulse rings */}
          {isSpeaking && (
            <>
              <div className={`absolute -inset-4 rounded-full border-2 animate-ping ${
                currentAvatar.gender === "male" ? "border-blue-400/40" : "border-rose-400/40"
              }`} />
              <div
                className={`absolute -inset-6 rounded-full border animate-ping ${
                  currentAvatar.gender === "male" ? "border-blue-400/20" : "border-rose-400/20"
                }`}
                style={{ animationDelay: "0.2s" }}
              />
            </>
          )}

          {/* Audio visualization ring */}
          {isSpeaking && (
            <svg
              className="absolute -inset-8 w-[calc(100%+64px)] h-[calc(100%+64px)]"
              viewBox="0 0 100 100"
            >
              <circle
                cx="50"
                cy="50"
                r="48"
                fill="none"
                stroke={currentAvatar.gender === "male" ? "rgba(59, 130, 246, 0.4)" : "rgba(244, 63, 94, 0.4)"}
                strokeWidth="1"
                strokeDasharray={`${audioLevel * 300} 1000`}
                className="transition-all duration-75"
                transform="rotate(-90 50 50)"
              />
            </svg>
          )}

          {/* Status text */}
          <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 text-center">
            <p className="text-white font-semibold text-2xl">{currentAvatar.name}</p>
            <p className="text-white/60 text-sm mt-1">
              {isSpeaking
                ? "Parle..."
                : isThinking
                  ? "Reflechit..."
                  : isListening
                    ? "T'ecoute..."
                    : "En appel"}
            </p>
          </div>

          {/* Avatar Selector Popup */}
          {showAvatarSelector && (
            <div className="absolute -bottom-48 left-1/2 -translate-x-1/2 bg-black/90 backdrop-blur-xl rounded-2xl p-4 border border-white/10 z-50">
              <p className="text-white/60 text-xs mb-3 text-center">Choisir un avatar</p>
              <div className="flex gap-3">
                {AVATARS.map((avatar) => (
                  <button
                    key={avatar.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAvatar(avatar.id);
                      setShowAvatarSelector(false);
                    }}
                    className={`relative w-16 h-16 rounded-full overflow-hidden border-2 transition-all ${
                      selectedAvatar === avatar.id
                        ? avatar.gender === "male"
                          ? "border-blue-400 scale-110"
                          : "border-rose-400 scale-110"
                        : "border-white/20 hover:border-white/40"
                    }`}
                  >
                    <img
                      src={`/avatars/${avatar.id}.jpg`}
                      alt={avatar.name}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] py-0.5">
                      {avatar.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Header */}
        <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`}
              />
              <span className="text-white font-medium">{formatDuration(callDuration)}</span>
              <span className="text-white/40 text-sm">
                {isConnected ? "Connecte" : "Connexion..."}
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
                {isThinking && !currentResponse && (
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
        {isSpeaking && (
          <div className="absolute bottom-48 left-1/2 -translate-x-1/2 flex items-end justify-center gap-1 h-16">
            {Array.from({ length: 32 }).map((_, i) => {
              const baseHeight = Math.max(4, Math.sin(i * 0.3) * 20 + audioLevel * 40);
              return (
                <div
                  key={i}
                  className={`w-1 rounded-full animate-pulse ${
                    currentAvatar.gender === "male"
                      ? "bg-gradient-to-t from-blue-500 to-blue-300"
                      : "bg-gradient-to-t from-rose-500 to-rose-300"
                  }`}
                  style={{
                    height: `${baseHeight}px`,
                    opacity: 0.5 + audioLevel * 0.5,
                    animationDelay: `${i * 50}ms`,
                    animationDuration: "300ms",
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/80 to-transparent">
          <div className="flex items-center justify-center gap-6 max-w-md mx-auto">
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
              disabled={!isConnected || isMuted}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                isListening
                  ? currentAvatar.gender === "male"
                    ? "bg-gradient-to-br from-blue-500 to-cyan-500 text-white scale-110 shadow-lg shadow-blue-500/50"
                    : "bg-gradient-to-br from-rose-500 to-pink-500 text-white scale-110 shadow-lg shadow-rose-500/50"
                  : isConnected && !isMuted
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
          {isListening && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <span className={`w-3 h-3 rounded-full animate-pulse ${
                currentAvatar.gender === "male" ? "bg-blue-500" : "bg-rose-500"
              }`} />
              <span className="text-white/80 text-sm">Parle, je t&apos;ecoute...</span>
            </div>
          )}

          {/* Hint */}
          {!isListening && !isSpeaking && !isThinking && isConnected && (
            <p className="text-white/40 text-sm text-center mt-6">
              Maintiens le bouton micro pour parler | Clique sur l&apos;avatar pour changer
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
