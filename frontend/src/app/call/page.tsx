"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RealtimeVoiceCall } from "@/components/realtime-voice-call";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

interface Voice {
  id: string;
  name: string;
  default: boolean;
}

export default function CallPage() {
  const router = useRouter();
  const [selectedVoice, setSelectedVoice] = useState("eva");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCall, setShowCall] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");

  // Check backend status and load voices
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/health`, {
          method: "GET",
          headers: { "x-api-key": "eva-dev-key-change-in-prod" },
        });

        if (response.ok) {
          setBackendStatus("online");

          // Load voices
          const voicesResponse = await fetch(`${BACKEND_URL}/voices`);
          if (voicesResponse.ok) {
            const data = await voicesResponse.json();
            if (data.voices) {
              setVoices(data.voices);
              const defaultVoice = data.voices.find((v: Voice) => v.default);
              if (defaultVoice) setSelectedVoice(defaultVoice.id);
            }
          }
        } else {
          setBackendStatus("offline");
        }
      } catch {
        setBackendStatus("offline");
      } finally {
        setIsLoading(false);
      }
    };

    checkBackend();
  }, []);

  if (showCall) {
    return (
      <RealtimeVoiceCall
        onClose={() => setShowCall(false)}
        backendUrl={BACKEND_URL}
        selectedVoice={selectedVoice}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 via-black to-zinc-900 flex flex-col items-center justify-center p-6">
      {/* Back button */}
      <button
        onClick={() => router.push("/")}
        className="absolute top-6 left-6 p-2 text-zinc-400 hover:text-zinc-200 transition-colors"
        aria-label="Retour"
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

          {/* Status indicator */}
          <div
            className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-medium ${
              backendStatus === "online"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : backendStatus === "offline"
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
            }`}
          >
            {backendStatus === "online"
              ? "En ligne"
              : backendStatus === "offline"
                ? "Hors ligne"
                : "Verification..."}
          </div>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-3xl font-light text-white mb-2">Appel Temps Reel</h1>
          <p className="text-zinc-400 text-sm">
            Parle naturellement avec Eva.
            <br />
            <span className="text-emerald-400">Detection vocale automatique</span> - pas de bouton a maintenir.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-4 w-full">
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3 mx-auto">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h3 className="text-white font-medium text-sm">VAD Auto</h3>
            <p className="text-zinc-500 text-xs mt-1">Detecte ta voix automatiquement</p>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center mb-3 mx-auto">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-white font-medium text-sm">Interruption</h3>
            <p className="text-zinc-500 text-xs mt-1">Coupe Eva quand tu parles</p>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center mb-3 mx-auto">
              <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-white font-medium text-sm">Faible latence</h3>
            <p className="text-zinc-500 text-xs mt-1">Reponses en moins de 500ms</p>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center mb-3 mx-auto">
              <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h3 className="text-white font-medium text-sm">Emotionnelle</h3>
            <p className="text-zinc-500 text-xs mt-1">Detecte et repond aux emotions</p>
          </div>
        </div>

        {/* Voice selector */}
        <div className="w-full">
          <label className="text-zinc-400 text-sm mb-2 block">Voix d&apos;Eva</label>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            disabled={isLoading || backendStatus !== "online"}
          >
            {voices.length > 0 ? (
              voices.map((v) => (
                <option key={v.id} value={v.id} className="bg-zinc-900">
                  {v.id === "eva" && "Eva (Douce)"}
                  {v.id === "eva-warm" && "Eva (Chaleureuse)"}
                  {v.id === "eva-young" && "Eva (Jeune)"}
                  {v.id === "eva-soft" && "Eva (Intime)"}
                  {v.id === "eva-sensual" && "Eva (Sensuelle)"}
                  {v.id === "male" && "Adam (Masculin)"}
                  {v.id === "male-warm" && "Adam (Chaleureux)"}
                  {v.id === "male-deep" && "Adam (Grave)"}
                  {!["eva", "eva-warm", "eva-young", "eva-soft", "eva-sensual", "male", "male-warm", "male-deep"].includes(v.id) && v.id}
                </option>
              ))
            ) : (
              <option value="eva" className="bg-zinc-900">Eva (Douce)</option>
            )}
          </select>
        </div>

        {/* Start button */}
        <button
          onClick={() => setShowCall(true)}
          disabled={isLoading || backendStatus !== "online"}
          className={`w-full py-4 rounded-2xl font-medium transition-all shadow-lg ${
            backendStatus === "online"
              ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:scale-[1.02] shadow-rose-500/30"
              : "bg-zinc-700 text-zinc-400 cursor-not-allowed"
          }`}
        >
          {isLoading
            ? "Chargement..."
            : backendStatus === "online"
              ? "Demarrer l'appel"
              : "Backend hors ligne"}
        </button>

        {/* Hint */}
        <div className="space-y-2">
          <p className="text-zinc-500 text-xs">
            Autorise l&apos;acces au microphone pour commencer.
          </p>
          {backendStatus === "offline" && (
            <p className="text-red-400 text-xs">
              Verifie que le backend est demarre sur {BACKEND_URL}
            </p>
          )}
        </div>

        {/* Technical info */}
        <div className="w-full bg-white/5 rounded-xl p-4 border border-white/10 text-left">
          <h4 className="text-white text-sm font-medium mb-2">Comment ca marche</h4>
          <ul className="text-zinc-400 text-xs space-y-1">
            <li>1. Detection vocale en temps reel (VAD)</li>
            <li>2. Transcription instantanee (Whisper)</li>
            <li>3. Reponse IA streaming (LLaMA)</li>
            <li>4. Synthese vocale par chunks (Edge-TTS)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
