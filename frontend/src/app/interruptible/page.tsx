"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { InterruptibleVoice } from "@/components/interruptible-voice";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";

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
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
      }}
    >
      {/* Back button */}
      <motion.button
        onClick={() => router.push("/")}
        className="absolute top-6 left-6 p-2 rounded-full transition-all duration-300"
        style={{
          backgroundColor: HER_COLORS.cream,
          color: HER_COLORS.earth,
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </motion.button>

      {/* Main content */}
      <div className="flex flex-col items-center gap-8 max-w-md text-center">
        {/* Breathing orb - HER style */}
        <div className="relative">
          <motion.div
            className="w-40 h-40 rounded-full"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral} 0%, ${HER_COLORS.blush} 50%, ${HER_COLORS.cream} 100%)`,
              boxShadow: `0 0 60px ${HER_COLORS.glowCoral}`,
            }}
            animate={{
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </div>

        {/* Title */}
        <div>
          <h1
            className="text-3xl font-light mb-2"
            style={{ color: HER_COLORS.earth }}
          >
            Conversation Naturelle
          </h1>
          <p style={{ color: HER_COLORS.textSecondary }} className="text-sm">
            Parle avec Eva comme si elle était vraiment là.
            <br />
            Tu peux l&apos;interrompre à tout moment.
          </p>
        </div>

        {/* Features - HER warm style */}
        <div className="grid grid-cols-2 gap-4 w-full">
          <motion.div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: HER_COLORS.warmWhite,
              border: `1px solid ${HER_COLORS.cream}`,
              boxShadow: `0 2px 12px ${HER_COLORS.softShadow}40`,
            }}
            whileHover={{ scale: 1.02 }}
            transition={HER_SPRINGS.gentle}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-3 mx-auto"
              style={{ backgroundColor: HER_COLORS.blush }}
            >
              <svg className="w-5 h-5" style={{ color: HER_COLORS.coral }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 style={{ color: HER_COLORS.earth }} className="font-medium text-sm">Ultra Rapide</h3>
            <p style={{ color: HER_COLORS.textMuted }} className="text-xs mt-1">Réponses instantanées</p>
          </motion.div>

          <motion.div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: HER_COLORS.warmWhite,
              border: `1px solid ${HER_COLORS.cream}`,
              boxShadow: `0 2px 12px ${HER_COLORS.softShadow}40`,
            }}
            whileHover={{ scale: 1.02 }}
            transition={HER_SPRINGS.gentle}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-3 mx-auto"
              style={{ backgroundColor: HER_COLORS.blush }}
            >
              <svg className="w-5 h-5" style={{ color: HER_COLORS.coral }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 style={{ color: HER_COLORS.earth }} className="font-medium text-sm">Interruptible</h3>
            <p style={{ color: HER_COLORS.textMuted }} className="text-xs mt-1">Coupe Eva quand tu veux</p>
          </motion.div>

          <motion.div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: HER_COLORS.warmWhite,
              border: `1px solid ${HER_COLORS.cream}`,
              boxShadow: `0 2px 12px ${HER_COLORS.softShadow}40`,
            }}
            whileHover={{ scale: 1.02 }}
            transition={HER_SPRINGS.gentle}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-3 mx-auto"
              style={{ backgroundColor: HER_COLORS.blush }}
            >
              <svg className="w-5 h-5" style={{ color: HER_COLORS.coral }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
            <h3 style={{ color: HER_COLORS.earth }} className="font-medium text-sm">Voix Naturelle</h3>
            <p style={{ color: HER_COLORS.textMuted }} className="text-xs mt-1">Parole fluide et rapide</p>
          </motion.div>

          <motion.div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: HER_COLORS.warmWhite,
              border: `1px solid ${HER_COLORS.cream}`,
              boxShadow: `0 2px 12px ${HER_COLORS.softShadow}40`,
            }}
            whileHover={{ scale: 1.02 }}
            transition={HER_SPRINGS.gentle}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-3 mx-auto"
              style={{ backgroundColor: HER_COLORS.blush }}
            >
              <svg className="w-5 h-5" style={{ color: HER_COLORS.coral }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h3 style={{ color: HER_COLORS.earth }} className="font-medium text-sm">Émotionnelle</h3>
            <p style={{ color: HER_COLORS.textMuted }} className="text-xs mt-1">Détecte tes émotions</p>
          </motion.div>
        </div>

        {/* Voice selector */}
        <div className="w-full">
          <label style={{ color: HER_COLORS.textSecondary }} className="text-sm mb-2 block">
            Voix d&apos;Eva
          </label>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="w-full rounded-xl px-4 py-3 focus:outline-none transition-all duration-300"
            style={{
              backgroundColor: HER_COLORS.cream,
              border: `1px solid ${HER_COLORS.softShadow}`,
              color: HER_COLORS.earth,
            }}
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id} style={{ backgroundColor: HER_COLORS.warmWhite }}>
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

        {/* Start button - HER coral style */}
        <motion.button
          onClick={() => setShowCall(true)}
          className="w-full py-4 rounded-2xl font-medium transition-all"
          style={{
            backgroundColor: HER_COLORS.coral,
            color: HER_COLORS.warmWhite,
            boxShadow: `0 4px 20px ${HER_COLORS.glowCoral}`,
          }}
          whileHover={{ scale: 1.02, boxShadow: `0 6px 30px ${HER_COLORS.glowCoral}` }}
          whileTap={{ scale: 0.98 }}
        >
          Commencer l&apos;appel
        </motion.button>

        {/* Hint */}
        <p style={{ color: HER_COLORS.textMuted }} className="text-xs">
          Maintiens le bouton micro pour parler. Appuie sur pause pour interrompre Eva.
        </p>
      </div>

      {/* Conversation history */}
      {messages.length > 0 && (
        <motion.div
          className="fixed bottom-0 left-0 right-0 backdrop-blur-sm max-h-48 overflow-y-auto"
          style={{
            backgroundColor: `${HER_COLORS.warmWhite}E6`,
            borderTop: `1px solid ${HER_COLORS.cream}`,
          }}
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={HER_SPRINGS.gentle}
        >
          <div className="max-w-2xl mx-auto p-4 space-y-2">
            {messages.map((msg, i) => (
              <div
                key={i}
                className="text-sm"
                style={{ color: msg.role === "user" ? HER_COLORS.textSecondary : HER_COLORS.earth }}
              >
                <span className="font-medium">{msg.role === "user" ? "Toi" : "Eva"}:</span>{" "}
                {msg.content}
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
