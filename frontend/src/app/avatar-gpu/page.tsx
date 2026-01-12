"use client";

import { useState, useRef, useEffect } from "react";

const AVATAR_API = process.env.NEXT_PUBLIC_AVATAR_URL || "http://localhost:8001";
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

interface Timings {
  tts?: number;
  avatar?: number;
  total?: number;
  stt?: number;
  llm?: number;
}

export default function AvatarGPUPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [timings, setTimings] = useState<Timings>({});
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

  // Process audio through the pipeline
  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setTranscript("");
    setResponse("");
    setTimings({});

    const startTime = performance.now();

    try {
      // 1. STT - Send audio to backend
      const formData = new FormData();
      formData.append("audio", audioBlob);

      const sttStart = performance.now();
      const sttResponse = await fetch(`${BACKEND_URL}/stt`, {
        method: "POST",
        body: formData,
      });

      if (!sttResponse.ok) throw new Error("STT failed");

      const sttData = await sttResponse.json();
      const sttTime = performance.now() - sttStart;
      setTranscript(sttData.text);
      setTimings((t) => ({ ...t, stt: Math.round(sttTime) }));

      // 2. LLM - Get response
      const llmStart = performance.now();
      const llmResponse = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: sttData.text,
          voice: "eva",
        }),
      });

      if (!llmResponse.ok) throw new Error("LLM failed");

      const llmData = await llmResponse.json();
      const llmTime = performance.now() - llmStart;
      setResponse(llmData.text);
      setTimings((t) => ({ ...t, llm: Math.round(llmTime) }));

      // 3. Avatar - Generate lip-sync video
      const avatarStart = performance.now();
      const avatarResponse = await fetch(`${AVATAR_API}/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: llmData.text,
          voice: "eva",
        }),
      });

      if (avatarResponse.ok) {
        const videoBlob = await avatarResponse.blob();
        const videoUrl = URL.createObjectURL(videoBlob);
        setAvatarUrl(videoUrl);

        // Get timing headers
        const ttsLatency = avatarResponse.headers.get("X-TTS-Latency-Ms");
        const avatarLatency = avatarResponse.headers.get("X-Avatar-Latency-Ms");

        setTimings((t) => ({
          ...t,
          tts: ttsLatency ? parseInt(ttsLatency) : undefined,
          avatar: avatarLatency ? parseInt(avatarLatency) : undefined,
        }));

        // Play video
        if (videoRef.current) {
          videoRef.current.src = videoUrl;
          videoRef.current.play();
        }
      } else {
        // Fallback to audio only
        const audioBlob = await avatarResponse.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();
      }

      const totalTime = performance.now() - startTime;
      setTimings((t) => ({ ...t, total: Math.round(totalTime) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setIsProcessing(false);
    }
  };

  // Send text directly
  const sendText = async (text: string) => {
    if (!text.trim()) return;

    setIsProcessing(true);
    setTranscript(text);
    setTimings({});

    const startTime = performance.now();

    try {
      // LLM
      const llmStart = performance.now();
      const llmResponse = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, voice: "eva" }),
      });

      const llmData = await llmResponse.json();
      setResponse(llmData.text);
      setTimings((t) => ({ ...t, llm: Math.round(performance.now() - llmStart) }));

      // Avatar
      const avatarResponse = await fetch(`${AVATAR_API}/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: llmData.text }),
      });

      if (avatarResponse.ok) {
        const blob = await avatarResponse.blob();
        const url = URL.createObjectURL(blob);
        setAvatarUrl(url);
        if (videoRef.current) {
          videoRef.current.src = url;
          videoRef.current.play();
        }
      }

      setTimings((t) => ({ ...t, total: Math.round(performance.now() - startTime) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-950 to-zinc-950 text-white">
      {/* Header */}
      <header className="p-4 border-b border-violet-800/30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <h1 className="text-xl font-light">EVA GPU Avatar</h1>
            <span className="text-xs bg-violet-600 px-2 py-1 rounded">RTX 4090</span>
          </div>
          <a href="/" className="text-violet-400 hover:text-violet-300 text-sm">
            ← Retour
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {/* Avatar Display */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-64 h-64 rounded-full overflow-hidden bg-violet-900/30 border-4 border-violet-500/50">
            {avatarUrl ? (
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
              />
            ) : (
              <img
                src="/avatars/eva.jpg"
                alt="Eva"
                className="w-full h-full object-cover"
              />
            )}
          </div>

          {/* Status */}
          <div className="mt-4 text-center">
            {isProcessing && (
              <p className="text-violet-400 animate-pulse">Processing...</p>
            )}
            {error && <p className="text-red-400">{error}</p>}
          </div>
        </div>

        {/* Timings Dashboard */}
        <div className="grid grid-cols-5 gap-2 mb-8">
          {[
            { label: "STT", value: timings.stt, target: 100 },
            { label: "LLM", value: timings.llm, target: 500 },
            { label: "TTS", value: timings.tts, target: 100 },
            { label: "Avatar", value: timings.avatar, target: 100 },
            { label: "Total", value: timings.total, target: 300 },
          ].map((item) => (
            <div
              key={item.label}
              className={`p-3 rounded-lg text-center ${
                item.value
                  ? item.value <= item.target
                    ? "bg-green-900/30 border border-green-500/50"
                    : "bg-yellow-900/30 border border-yellow-500/50"
                  : "bg-zinc-800/50 border border-zinc-700/50"
              }`}
            >
              <div className="text-xs text-zinc-400">{item.label}</div>
              <div className="text-lg font-mono">
                {item.value ? `${item.value}ms` : "-"}
              </div>
              <div className="text-xs text-zinc-500">target: {item.target}ms</div>
            </div>
          ))}
        </div>

        {/* Conversation */}
        <div className="space-y-4 mb-8">
          {transcript && (
            <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <div className="text-xs text-zinc-500 mb-1">You:</div>
              <p>{transcript}</p>
            </div>
          )}
          {response && (
            <div className="p-4 rounded-lg bg-violet-900/30 border border-violet-500/30">
              <div className="text-xs text-violet-400 mb-1">Eva:</div>
              <p>{response}</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={isProcessing}
            className={`p-6 rounded-full transition-all ${
              isRecording
                ? "bg-red-500 scale-110"
                : "bg-violet-600 hover:bg-violet-500"
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
        </div>

        <p className="text-center text-zinc-500 mt-4 text-sm">
          Maintiens le bouton pour parler
        </p>

        {/* Quick test input */}
        <div className="mt-8">
          <input
            type="text"
            placeholder="Ou tape un message..."
            className="w-full p-4 rounded-lg bg-zinc-800 border border-zinc-700 focus:border-violet-500 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isProcessing) {
                sendText((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = "";
              }
            }}
          />
        </div>
      </main>

      {/* Tech stack info */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-950/80 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto flex justify-center gap-6 text-xs text-zinc-500">
          <span>Whisper large-v3 GPU</span>
          <span>|</span>
          <span>Groq LLM</span>
          <span>|</span>
          <span>Fish Speech TTS</span>
          <span>|</span>
          <span>MuseTalk Avatar</span>
        </div>
      </footer>
    </div>
  );
}
