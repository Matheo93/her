"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { RealtimeVoiceCall } from "@/components/realtime-voice-call";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";

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
  const [breathPhase, setBreathPhase] = useState(0);

  // Breathing animation
  useEffect(() => {
    const interval = setInterval(() => {
      setBreathPhase((prev) => (prev + 1) % 100);
    }, 40);
    return () => clearInterval(interval);
  }, []);

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

  const breathScale = 1 + Math.sin(breathPhase * Math.PI / 50) * 0.03;

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
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
      }}
    >
      {/* Back button */}
      <motion.button
        onClick={() => router.push("/")}
        className="absolute top-6 left-6 p-2 rounded-full transition-colors duration-300"
        style={{ color: HER_COLORS.earth }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Retour"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </motion.button>

      {/* Main content */}
      <div className="flex flex-col items-center gap-8 max-w-md text-center">
        {/* Breathing orb with status */}
        <div className="relative">
          <motion.div
            className="w-40 h-40 rounded-full"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral} 0%, ${HER_COLORS.blush} 50%, ${HER_COLORS.cream} 100%)`,
              boxShadow: `0 0 80px ${HER_COLORS.glowCoral}`,
              transform: `scale(${breathScale})`,
            }}
          />

          {/* Status indicator - subtle */}
          <motion.div
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-light"
            style={{
              backgroundColor: backendStatus === "online"
                ? `${HER_COLORS.success}30`
                : backendStatus === "offline"
                  ? `${HER_COLORS.error}30`
                  : `${HER_COLORS.warning}30`,
              color: backendStatus === "online"
                ? HER_COLORS.success
                : backendStatus === "offline"
                  ? HER_COLORS.error
                  : HER_COLORS.warning,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {backendStatus === "online"
              ? "Prête"
              : backendStatus === "offline"
                ? "Indisponible"
                : "..."}
          </motion.div>
        </div>

        {/* Title - warm, intimate */}
        <div>
          <h1
            className="text-3xl font-light mb-2"
            style={{ color: HER_COLORS.earth }}
          >
            Appeler Eva
          </h1>
          <p style={{ color: HER_COLORS.textSecondary }} className="text-sm">
            Parle librement, je t&apos;écoute.
          </p>
        </div>

        {/* Simple feature highlights - no tech terms */}
        <div className="grid grid-cols-2 gap-4 w-full">
          <motion.div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: `${HER_COLORS.cream}80`,
              border: `1px solid ${HER_COLORS.softShadow}40`,
            }}
            whileHover={{ scale: 1.02 }}
            transition={HER_SPRINGS.gentle}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-3 mx-auto"
              style={{ backgroundColor: `${HER_COLORS.success}20` }}
            >
              <svg className="w-5 h-5" style={{ color: HER_COLORS.success }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h3 className="font-medium text-sm" style={{ color: HER_COLORS.earth }}>Naturel</h3>
            <p className="text-xs mt-1" style={{ color: HER_COLORS.textMuted }}>Parle quand tu veux</p>
          </motion.div>

          <motion.div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: `${HER_COLORS.cream}80`,
              border: `1px solid ${HER_COLORS.softShadow}40`,
            }}
            whileHover={{ scale: 1.02 }}
            transition={HER_SPRINGS.gentle}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-3 mx-auto"
              style={{ backgroundColor: `${HER_COLORS.warning}20` }}
            >
              <svg className="w-5 h-5" style={{ color: HER_COLORS.warning }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-medium text-sm" style={{ color: HER_COLORS.earth }}>Fluide</h3>
            <p className="text-xs mt-1" style={{ color: HER_COLORS.textMuted }}>Interromps-moi librement</p>
          </motion.div>

          <motion.div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: `${HER_COLORS.cream}80`,
              border: `1px solid ${HER_COLORS.softShadow}40`,
            }}
            whileHover={{ scale: 1.02 }}
            transition={HER_SPRINGS.gentle}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-3 mx-auto"
              style={{ backgroundColor: `${HER_COLORS.coral}20` }}
            >
              <svg className="w-5 h-5" style={{ color: HER_COLORS.coral }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-medium text-sm" style={{ color: HER_COLORS.earth }}>Instantané</h3>
            <p className="text-xs mt-1" style={{ color: HER_COLORS.textMuted }}>Réponses immédiates</p>
          </motion.div>

          <motion.div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: `${HER_COLORS.cream}80`,
              border: `1px solid ${HER_COLORS.softShadow}40`,
            }}
            whileHover={{ scale: 1.02 }}
            transition={HER_SPRINGS.gentle}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-3 mx-auto"
              style={{ backgroundColor: `${HER_COLORS.blush}30` }}
            >
              <svg className="w-5 h-5" style={{ color: HER_COLORS.coral }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h3 className="font-medium text-sm" style={{ color: HER_COLORS.earth }}>Attentive</h3>
            <p className="text-xs mt-1" style={{ color: HER_COLORS.textMuted }}>Je ressens tes émotions</p>
          </motion.div>
        </div>

        {/* Voice selector - warm style */}
        <div className="w-full">
          <label className="text-sm mb-2 block" style={{ color: HER_COLORS.textSecondary }}>
            Ma voix
          </label>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="w-full rounded-xl px-4 py-3 focus:outline-none transition-all duration-300"
            style={{
              backgroundColor: HER_COLORS.cream,
              color: HER_COLORS.earth,
              border: `1px solid ${HER_COLORS.softShadow}40`,
            }}
            disabled={isLoading || backendStatus !== "online"}
          >
            {voices.length > 0 ? (
              voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id === "eva" && "Ariane (Suisse)"}
                  {v.id === "eva-warm" && "Eloise (Chaleureuse)"}
                  {v.id === "eva-young" && "Coralie (Jeune)"}
                  {v.id === "eva-soft" && "Vivienne (Intime)"}
                  {v.id === "eva-sensual" && "Brigitte (Sensuelle)"}
                  {v.id === "male" && "Henri"}
                  {v.id === "male-warm" && "Rémy (Chaleureux)"}
                  {v.id === "male-deep" && "Alain (Profond)"}
                  {v.id === "eva-en" && "Jenny (English)"}
                  {v.id === "eva-en-warm" && "Aria (US English)"}
                  {!["eva", "eva-warm", "eva-young", "eva-soft", "eva-sensual", "male", "male-warm", "male-deep", "eva-en", "eva-en-warm"].includes(v.id) && v.id}
                </option>
              ))
            ) : (
              <option value="eva">Ariane (Suisse)</option>
            )}
          </select>
        </div>

        {/* Start button */}
        <motion.button
          onClick={() => setShowCall(true)}
          disabled={isLoading || backendStatus !== "online"}
          className="w-full py-4 rounded-2xl font-medium transition-all duration-300"
          style={{
            backgroundColor: backendStatus === "online" ? HER_COLORS.coral : HER_COLORS.softShadow,
            color: backendStatus === "online" ? HER_COLORS.warmWhite : HER_COLORS.textMuted,
            cursor: backendStatus === "online" ? "pointer" : "not-allowed",
            boxShadow: backendStatus === "online" ? `0 8px 30px ${HER_COLORS.glowCoral}` : "none",
          }}
          whileHover={backendStatus === "online" ? { scale: 1.02 } : {}}
          whileTap={backendStatus === "online" ? { scale: 0.98 } : {}}
        >
          {isLoading
            ? "..."
            : backendStatus === "online"
              ? "M'appeler"
              : "Indisponible"}
        </motion.button>

        {/* Hint - minimal */}
        <AnimatePresence>
          {backendStatus === "offline" && (
            <motion.p
              className="text-xs"
              style={{ color: HER_COLORS.error }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Je ne suis pas disponible pour le moment
            </motion.p>
          )}
        </AnimatePresence>

        <p className="text-xs" style={{ color: HER_COLORS.textMuted }}>
          Autorise l&apos;accès au microphone
        </p>
      </div>
    </div>
  );
}
