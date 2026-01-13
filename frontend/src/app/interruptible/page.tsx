"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { InterruptibleVoice } from "@/components/interruptible-voice";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

interface Message {
  role: "user" | "assistant";
  content: string;
  emotion?: string;
}

interface Voice {
  id: string;
  name: string;
  default: boolean;
}

export default function InterruptiblePage() {
  const router = useRouter();
  const [selectedVoice, setSelectedVoice] = useState("eva");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showCall, setShowCall] = useState(false);

  // Load available voices
  useEffect(() => {
    fetch(`${BACKEND_URL}/voices`)
      .then((res) => res.json())
      .then((data) => {
        if (data.voices) {
          setVoices(data.voices);
          const defaultVoice = data.voices.find((v: Voice) => v.default);
          if (defaultVoice) setSelectedVoice(defaultVoice.id);
        }
      })
      .catch(console.error);
  }, []);

  if (showCall) {
    return (
      <InterruptibleVoice
        onClose={() => setShowCall(false)}
        backendUrl={BACKEND_URL}
        selectedVoice={selectedVoice}
        messages={messages}
        onNewMessage={(msg) => setMessages((prev) => [...prev, msg])}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 via-black to-zinc-900 flex flex-col items-center justify-center p-6">
      {/* Back button */}
      <button
        onClick={() => router.push("/")}
        className="absolute top-6 left-6 p-2 text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </button>

      {/* Main content */}
      <div className="flex flex-col items-center gap-8 max-w-md text-center">
        {/* Animated orb */}
        <div className="relative">
          <div className="w-40 h-40 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 shadow-2xl shadow-rose-500/30 animate-pulse" />
          <div className="absolute inset-4 rounded-full bg-gradient-to-br from-rose-400 to-pink-400 opacity-50 blur-xl" />
        </div>

        {/* Title */}
        <div>
          <h1 className="text-3xl font-light text-white mb-2">Conversation Naturelle</h1>
          <p className="text-zinc-400 text-sm">
            Parle avec Eva comme si elle etait vraiment la.
            <br />
            Tu peux l&apos;interrompre a tout moment.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-4 w-full">
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3 mx-auto">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-white font-medium text-sm">Ultra Rapide</h3>
            <p className="text-zinc-500 text-xs mt-1">Reponses instantanees</p>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center mb-3 mx-auto">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-white font-medium text-sm">Interruptible</h3>
            <p className="text-zinc-500 text-xs mt-1">Coupe Eva quand tu veux</p>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center mb-3 mx-auto">
              <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <h3 className="text-white font-medium text-sm">Voix Naturelle</h3>
            <p className="text-zinc-500 text-xs mt-1">Parole fluide et rapide</p>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center mb-3 mx-auto">
              <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h3 className="text-white font-medium text-sm">Emotionnelle</h3>
            <p className="text-zinc-500 text-xs mt-1">Detecte tes emotions</p>
          </div>
        </div>

        {/* Voice selector */}
        <div className="w-full">
          <label className="text-zinc-400 text-sm mb-2 block">Voix d&apos;Eva</label>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id} className="bg-zinc-900">
                {v.id === "eva" && "Eva (Douce)"}
                {v.id === "eva-warm" && "Eva (Chaleureuse)"}
                {v.id === "eva-young" && "Eva (Jeune)"}
                {v.id === "eva-soft" && "Eva (Intime)"}
                {v.id === "eva-sensual" && "Eva (Sensuelle)"}
                {v.id === "male" && "Adam"}
                {!["eva", "eva-warm", "eva-young", "eva-soft", "eva-sensual", "male"].includes(v.id) && v.id}
              </option>
            ))}
          </select>
        </div>

        {/* Start button */}
        <button
          onClick={() => setShowCall(true)}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-medium hover:scale-[1.02] transition-all shadow-lg shadow-rose-500/30"
        >
          Commencer l&apos;appel
        </button>

        {/* Hint */}
        <p className="text-zinc-500 text-xs">
          Maintiens le bouton micro pour parler. Appuie sur pause pour interrompre Eva.
        </p>
      </div>

      {/* Conversation history */}
      {messages.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-xl border-t border-white/10 max-h-48 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-4 space-y-2">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`text-sm ${msg.role === "user" ? "text-zinc-400" : "text-white"}`}
              >
                <span className="font-medium">{msg.role === "user" ? "Toi" : "Eva"}:</span>{" "}
                {msg.content}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
