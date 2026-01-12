"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type ConversationState = "idle" | "listening" | "thinking" | "speaking";

export default function VoiceMode() {
  const router = useRouter();
  const [state, setState] = useState<ConversationState>("idle");
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [conversationMode, setConversationMode] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // WebSocket connection
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws/chat`);

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setTimeout(connect, 3000);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "token") {
          setResponse((prev) => prev + data.content);
        } else if (data.type === "end") {
          // Play TTS when response is complete
          playTTS();
        }
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  // Play TTS
  const playTTS = useCallback(async () => {
    setState("speaking");

    try {
      const textToSpeak = response || transcript;
      if (!textToSpeak) {
        setState(conversationMode ? "listening" : "idle");
        return;
      }

      const res = await fetch(`${BACKEND_URL}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: response }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          setResponse("");

          // Auto-start listening if in conversation mode
          if (conversationMode) {
            startListening();
          } else {
            setState("idle");
          }
        };

        await audio.play();
      }
    } catch (err) {
      console.error("TTS error:", err);
      setState(conversationMode ? "listening" : "idle");
    }
  }, [response, conversationMode, transcript]);

  // Start listening
  const startListening = useCallback(async () => {
    if (state === "listening") return;

    setState("listening");
    setTranscript("");
    setResponse("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });

        // STT
        const formData = new FormData();
        formData.append("file", blob, "audio.webm");

        try {
          setState("thinking");
          const res = await fetch(`${BACKEND_URL}/stt`, {
            method: "POST",
            body: formData,
          });
          const data = await res.json();

          if (data.text && data.text !== "[STT non disponible]") {
            setTranscript(data.text);

            // Send to LLM
            if (wsRef.current) {
              wsRef.current.send(JSON.stringify({
                type: "message",
                content: data.text,
              }));
            }
          } else {
            setState(conversationMode ? "listening" : "idle");
          }
        } catch (err) {
          console.error("STT error:", err);
          setState(conversationMode ? "listening" : "idle");
        }
      };

      mediaRecorder.start();

      // Auto-stop after silence detection or max time
      setTimeout(() => {
        if (mediaRecorder.state === "recording") {
          mediaRecorder.stop();
          stream.getTracks().forEach((t) => t.stop());
        }
      }, 5000);
    } catch (err) {
      console.error("Mic error:", err);
      setState("idle");
    }
  }, [state, conversationMode]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
  }, []);

  // Stop everything
  const stopAll = useCallback(() => {
    setConversationMode(false);
    stopListening();
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setState("idle");
    setTranscript("");
    setResponse("");
  }, [stopListening]);

  // Toggle conversation mode
  const toggleConversation = useCallback(() => {
    if (conversationMode) {
      stopAll();
    } else {
      setConversationMode(true);
      startListening();
    }
  }, [conversationMode, stopAll, startListening]);

  // Get visual state
  const getStateColor = () => {
    switch (state) {
      case "listening":
        return "from-rose-500 to-red-500";
      case "thinking":
        return "from-amber-400 to-orange-500";
      case "speaking":
        return "from-emerald-400 to-teal-500";
      default:
        return "from-rose-300 to-orange-300 dark:from-rose-500 dark:to-orange-500";
    }
  };

  const getStateText = () => {
    switch (state) {
      case "listening":
        return "Je t'écoute...";
      case "thinking":
        return "Je réfléchis...";
      case "speaking":
        return "Je parle...";
      default:
        return "Appuie pour parler";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 to-zinc-900 flex flex-col items-center justify-center p-6">
      {/* Back button */}
      <button
        onClick={() => router.push("/")}
        className="absolute top-6 left-6 p-2 text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </button>

      {/* Connection status */}
      <div className="absolute top-6 right-6 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400" : "bg-zinc-500"}`} />
        <span className="text-sm text-zinc-500">{isConnected ? "Connecté" : "Déconnecté"}</span>
      </div>

      {/* Main orb */}
      <div className="flex flex-col items-center gap-8">
        <button
          onClick={state === "idle" ? startListening : stopListening}
          onMouseDown={state === "idle" && !conversationMode ? startListening : undefined}
          onMouseUp={state === "listening" && !conversationMode ? stopListening : undefined}
          className={`w-48 h-48 rounded-full bg-gradient-to-br ${getStateColor()} shadow-2xl transition-all duration-500 ${
            state === "listening" ? "scale-110 animate-pulse" : ""
          } ${state === "speaking" ? "animate-pulse" : ""}`}
        />

        {/* State text */}
        <p className="text-xl font-light text-zinc-300">{getStateText()}</p>

        {/* Transcript */}
        {transcript && (
          <div className="max-w-md text-center">
            <p className="text-sm text-zinc-500 mb-2">Tu as dit :</p>
            <p className="text-zinc-300">{transcript}</p>
          </div>
        )}

        {/* Response */}
        {response && (
          <div className="max-w-md text-center">
            <p className="text-sm text-zinc-500 mb-2">Eva :</p>
            <p className="text-zinc-100">{response}</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-8 flex items-center gap-4">
        {/* Conversation mode toggle */}
        <button
          onClick={toggleConversation}
          className={`px-6 py-3 rounded-full text-sm font-medium transition-all ${
            conversationMode
              ? "bg-rose-500 text-white"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          }`}
        >
          {conversationMode ? "Arrêter la conversation" : "Mode conversation"}
        </button>

        {/* Stop button (when active) */}
        {state !== "idle" && (
          <button
            onClick={stopAll}
            className="p-3 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
