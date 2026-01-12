"use client";

import { useState, useRef, useEffect } from "react";

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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [timings, setTimings] = useState<Timings>({});
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
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
      // 1. STT
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

      // 2. Chat + TTS
      const llmStart = performance.now();
      const chatResponse = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: sttData.text,
          voice: "eva",
        }),
      });

      if (!chatResponse.ok) throw new Error("Chat failed");

      const chatData = await chatResponse.json();
      const llmTime = performance.now() - llmStart;
      setResponse(chatData.text);
      setTimings((t) => ({ ...t, llm: Math.round(llmTime), tts: chatData.tts_ms }));

      // Play audio
      if (chatData.audio_base64 && audioRef.current) {
        const audioSrc = `data:audio/mp3;base64,${chatData.audio_base64}`;
        audioRef.current.src = audioSrc;
        setIsSpeaking(true);
        audioRef.current.play();
        audioRef.current.onended = () => setIsSpeaking(false);
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
      const llmStart = performance.now();
      const chatResponse = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, voice: "eva" }),
      });

      const chatData = await chatResponse.json();
      setResponse(chatData.text);
      setTimings((t) => ({ ...t, llm: Math.round(performance.now() - llmStart), tts: chatData.tts_ms }));

      if (chatData.audio_base64 && audioRef.current) {
        const audioSrc = `data:audio/mp3;base64,${chatData.audio_base64}`;
        audioRef.current.src = audioSrc;
        setIsSpeaking(true);
        audioRef.current.play();
        audioRef.current.onended = () => setIsSpeaking(false);
      }

      setTimings((t) => ({ ...t, total: Math.round(performance.now() - startTime) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Styles for idle animations */}
      <style jsx>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1) translateY(0); }
          50% { transform: scale(1.02) translateY(-2px); }
        }
        @keyframes blink {
          0%, 90%, 100% { clip-path: inset(0 0 0 0); }
          95% { clip-path: inset(42% 0 42% 0); }
        }
        @keyframes subtle-move {
          0%, 100% { transform: rotate(0deg) translateX(0); }
          25% { transform: rotate(0.3deg) translateX(1px); }
          75% { transform: rotate(-0.3deg) translateX(-1px); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 30px rgba(147, 51, 234, 0.3); }
          50% { box-shadow: 0 0 50px rgba(147, 51, 234, 0.5); }
        }
        @keyframes speaking {
          0%, 100% { transform: scale(1); }
          25% { transform: scale(1.01) translateY(-1px); }
          50% { transform: scale(0.99); }
          75% { transform: scale(1.01) translateY(1px); }
        }
        .avatar-container {
          animation: glow 3s ease-in-out infinite;
        }
        .avatar-idle {
          animation: breathe 4s ease-in-out infinite, subtle-move 8s ease-in-out infinite;
        }
        .avatar-speaking {
          animation: speaking 0.3s ease-in-out infinite;
        }
        .eye-blink {
          animation: blink 4s ease-in-out infinite;
          animation-delay: 2s;
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
          </div>
          <a href="/" className="text-purple-400 hover:text-purple-300 text-sm">
            ← Retour
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {/* Avatar Display */}
        <div className="flex flex-col items-center mb-8">
          <div className={`avatar-container relative w-72 h-72 rounded-full overflow-hidden bg-gradient-to-br from-purple-900/50 to-pink-900/50 border-2 border-purple-500/30`}>
            {/* Background glow effect */}
            <div className="absolute inset-0 bg-gradient-to-t from-purple-600/20 to-transparent" />

            {/* Avatar video with idle animation */}
            <div className={`relative w-full h-full ${isSpeaking ? 'avatar-speaking' : ''}`}>
              <video
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover object-top scale-125"
                style={{ marginTop: '-10%' }}
              >
                <source src="/avatars/eva_idle.mp4" type="video/mp4" />
              </video>
            </div>
          </div>

          {/* Status */}
          <div className="mt-4 text-center">
            {isProcessing && (
              <p className="text-purple-400 animate-pulse">Je réfléchis...</p>
            )}
            {isSpeaking && (
              <p className="text-pink-400 animate-pulse">Je parle...</p>
            )}
            {error && <p className="text-red-400">{error}</p>}
            {!isProcessing && !isSpeaking && !error && (
              <p className="text-slate-500 text-sm">En attente...</p>
            )}
          </div>
        </div>

        {/* Timings Dashboard */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { label: "STT", value: timings.stt, target: 100, icon: "🎤" },
            { label: "LLM", value: timings.llm, target: 500, icon: "🧠" },
            { label: "TTS", value: timings.tts, target: 100, icon: "🔊" },
            { label: "Total", value: timings.total, target: 800, icon: "⚡" },
          ].map((item) => (
            <div
              key={item.label}
              className={`p-4 rounded-xl text-center transition-all ${
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
              <div className="text-xl font-mono font-bold">
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
            disabled={isProcessing}
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
            {isRecording ? "🔴 Enregistrement..." : "Maintiens pour parler"}
          </p>
        </div>

        {/* Text input */}
        <div className="mt-6">
          <input
            type="text"
            placeholder="Ou écris-moi..."
            className="w-full p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-slate-200 placeholder-slate-500"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isProcessing) {
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
          <span>•</span>
          <span>Groq LLM</span>
          <span>•</span>
          <span>Edge-TTS</span>
          <span>•</span>
          <span>RTX 4090</span>
        </div>
      </footer>
    </div>
  );
}
