"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS, EMOTION_PRESENCE } from "@/styles/her-theme";

// Compatible interface with RealisticAvatar3D
export interface VisemeWeights {
  sil?: number;
  PP?: number;
  FF?: number;
  TH?: number;
  DD?: number;
  kk?: number;
  CH?: number;
  SS?: number;
  RR?: number;
  AA?: number;
  EE?: number;
  OO?: number;
}

interface RealisticAvatarImageProps {
  visemeWeights?: VisemeWeights;
  emotion?: string;
  isSpeaking?: boolean;
  isListening?: boolean;
  audioLevel?: number;
  className?: string;
  conversationStartTime?: number;
  inputAudioLevel?: number;
}

// Calculate mouth openness from viseme weights
function getMouthOpenness(weights: VisemeWeights): number {
  const vowels = ["AA", "EE", "OO"] as const;
  let openness = 0;

  for (const v of vowels) {
    if (weights[v]) {
      openness = Math.max(openness, weights[v]!);
    }
  }

  // Other visemes contribute less
  const consonants = ["PP", "FF", "TH", "DD", "kk", "CH", "SS", "RR"] as const;
  for (const c of consonants) {
    if (weights[c]) {
      openness = Math.max(openness, weights[c]! * 0.5);
    }
  }

  return openness;
}

export function RealisticAvatarImage({
  visemeWeights = { sil: 1 },
  emotion = "neutral",
  isSpeaking = false,
  isListening = false,
  audioLevel = 0,
  className = "",
  conversationStartTime,
  inputAudioLevel = 0,
}: RealisticAvatarImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [breathPhase, setBreathPhase] = useState(0);
  const [blinkState, setBlinkState] = useState<"open" | "closing" | "closed" | "opening">("open");
  const [gazeOffset, setGazeOffset] = useState({ x: 0, y: 0 });

  // Mouth openness from visemes or audio level
  const mouthOpenness = useMemo(() => {
    const visemeOpen = getMouthOpenness(visemeWeights);
    return isSpeaking ? Math.max(visemeOpen, audioLevel * 0.8) : 0;
  }, [visemeWeights, isSpeaking, audioLevel]);

  // Emotion to visual presence
  const emotionPresence = useMemo(() => {
    return EMOTION_PRESENCE[emotion] || EMOTION_PRESENCE.neutral;
  }, [emotion]);

  // Breathing animation
  useEffect(() => {
    const interval = setInterval(() => {
      setBreathPhase((prev) => (prev + 0.05) % (Math.PI * 2));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Natural blinking
  useEffect(() => {
    const scheduleNextBlink = () => {
      // Blink every 3-6 seconds, more when listening
      const interval = isListening
        ? 2000 + Math.random() * 2000
        : 3000 + Math.random() * 3000;

      return setTimeout(() => {
        setBlinkState("closing");
        setTimeout(() => setBlinkState("closed"), 50);
        setTimeout(() => setBlinkState("opening"), 100);
        setTimeout(() => {
          setBlinkState("open");
          // 15% chance for double blink
          if (Math.random() < 0.15) {
            setTimeout(() => {
              setBlinkState("closing");
              setTimeout(() => setBlinkState("closed"), 50);
              setTimeout(() => setBlinkState("opening"), 100);
              setTimeout(() => setBlinkState("open"), 180);
            }, 200);
          }
        }, 180);
      }, interval);
    };

    const timer = scheduleNextBlink();
    const intervalId = setInterval(() => scheduleNextBlink(), 5000);

    return () => {
      clearTimeout(timer);
      clearInterval(intervalId);
    };
  }, [isListening]);

  // Micro eye movement (saccades)
  useEffect(() => {
    const interval = setInterval(() => {
      if (isListening) {
        // Focus on user when listening
        setGazeOffset({ x: 0, y: 0 });
      } else {
        // Small random movements when idle or speaking
        setGazeOffset({
          x: (Math.random() - 0.5) * 3,
          y: (Math.random() - 0.5) * 2,
        });
      }
    }, 800 + Math.random() * 500);

    return () => clearInterval(interval);
  }, [isListening]);

  // Breathing values
  const breathScale = 1 + Math.sin(breathPhase) * 0.008;
  const breathY = Math.sin(breathPhase) * 2;

  // Eye lid position based on blink state
  const getEyeLidY = () => {
    switch (blinkState) {
      case "closing": return 8;
      case "closed": return 12;
      case "opening": return 4;
      default: return 0;
    }
  };

  // Emotion affects expression
  const getEyebrowY = () => {
    switch (emotion) {
      case "joy":
      case "excitement": return -2;
      case "sadness": return 3;
      case "surprise": return -4;
      case "curiosity": return -2;
      default: return 0;
    }
  };

  const getSmileAmount = () => {
    switch (emotion) {
      case "joy": return 0.7;
      case "tenderness": return 0.4;
      case "excitement": return 0.6;
      case "playful": return 0.5;
      case "sadness": return -0.2;
      default: return 0.15;
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ width: "100%", height: "100%", minHeight: "200px" }}
    >
      {/* Warm ambient glow - emotion responsive */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${emotionPresence.glow} 0%, transparent 70%)`,
        }}
        animate={{
          scale: [1, 1.05, 1],
          opacity: isSpeaking ? 0.9 : isListening ? 0.7 : 0.5,
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Main avatar container with breathing */}
      <motion.div
        className="relative w-full h-full flex items-center justify-center"
        animate={{
          scale: breathScale,
          y: breathY,
        }}
        transition={{ duration: 0.1 }}
      >
        {/* Face container - SVG-based realistic female face */}
        <svg
          viewBox="0 0 200 240"
          className="w-full h-full max-w-[280px] max-h-[336px]"
          style={{ filter: "drop-shadow(0 4px 20px rgba(139, 115, 85, 0.15))" }}
        >
          <defs>
            {/* Skin gradient */}
            <radialGradient id="skinGradient" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#F5D0C5" />
              <stop offset="60%" stopColor="#EABAA8" />
              <stop offset="100%" stopColor="#D4A090" />
            </radialGradient>

            {/* Subtle skin texture */}
            <filter id="skinTexture">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="1" xChannelSelector="R" yChannelSelector="G" />
            </filter>

            {/* Eye shine */}
            <radialGradient id="eyeShine" cx="30%" cy="30%" r="50%">
              <stop offset="0%" stopColor="white" stopOpacity="0.9" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>

            {/* Lip gradient */}
            <linearGradient id="lipGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={HER_COLORS.coral} />
              <stop offset="100%" stopColor="#D4706A" />
            </linearGradient>

            {/* Hair gradient */}
            <linearGradient id="hairGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4A3728" />
              <stop offset="100%" stopColor="#3D2314" />
            </linearGradient>

            {/* Iris gradient - warm brown */}
            <radialGradient id="irisGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#8B6914" />
              <stop offset="50%" stopColor="#5C4033" />
              <stop offset="100%" stopColor="#3D2817" />
            </radialGradient>

            {/* Blush */}
            <radialGradient id="blushLeft" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={HER_COLORS.blush} stopOpacity="0.3" />
              <stop offset="100%" stopColor={HER_COLORS.blush} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Hair back */}
          <ellipse cx="100" cy="70" rx="75" ry="65" fill="url(#hairGradient)" />
          <ellipse cx="100" cy="90" rx="82" ry="75" fill="url(#hairGradient)" />

          {/* Hair sides */}
          <ellipse cx="35" cy="100" rx="25" ry="50" fill="url(#hairGradient)" />
          <ellipse cx="165" cy="100" rx="25" ry="50" fill="url(#hairGradient)" />

          {/* Face shape - oval */}
          <ellipse
            cx="100"
            cy="120"
            rx="58"
            ry="72"
            fill="url(#skinGradient)"
          />

          {/* Forehead */}
          <ellipse cx="100" cy="65" rx="50" ry="30" fill="url(#skinGradient)" />

          {/* Cheek blush - left */}
          <ellipse cx="60" cy="130" rx="20" ry="15" fill="url(#blushLeft)" />

          {/* Cheek blush - right */}
          <ellipse cx="140" cy="130" rx="20" ry="15" fill="url(#blushLeft)" />

          {/* Nose */}
          <path
            d="M100 105 L100 135 Q98 142 92 145 Q100 148 108 145 Q102 142 100 135"
            fill="none"
            stroke="#D4A090"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Nose tip highlight */}
          <ellipse cx="100" cy="140" rx="6" ry="4" fill="#F5D0C5" opacity="0.5" />

          {/* Left eye group */}
          <g transform={`translate(${gazeOffset.x || 0}, ${gazeOffset.y || 0})`}>
            {/* Eye white */}
            <ellipse cx="72" cy="110" rx="14" ry="10" fill="white" />

            {/* Iris */}
            <motion.circle
              cx={72 + (gazeOffset.x || 0) * 0.5}
              cy="110"
              r="7"
              fill="url(#irisGradient)"
              transition={{ duration: 0.2 }}
            />

            {/* Pupil - dilates with emotion */}
            <motion.circle
              cx={72 + (gazeOffset.x || 0) * 0.5}
              cy="110"
              r={emotion === "joy" || emotion === "tenderness" ? 3.5 : 3}
              fill="#0A0A0A"
              transition={{ duration: 0.2 }}
            />

            {/* Eye shine */}
            <circle cx="70" cy="107" r="2.5" fill="white" opacity="0.9" />
            <circle cx="74" cy="112" r="1" fill="white" opacity="0.5" />
          </g>

          {/* Left eyelid - blink animation */}
          <motion.rect
            x="56"
            y="98"
            width="32"
            height={getEyeLidY() || 0.001}
            fill="url(#skinGradient)"
            transition={{ duration: 0.05 }}
          />

          {/* Left eye crease */}
          <path
            d="M58 100 Q72 96 86 100"
            fill="none"
            stroke="#C89B8B"
            strokeWidth="0.8"
          />

          {/* Right eye group */}
          <g transform={`translate(${gazeOffset.x || 0}, ${gazeOffset.y || 0})`}>
            {/* Eye white */}
            <ellipse cx="128" cy="110" rx="14" ry="10" fill="white" />

            {/* Iris */}
            <motion.circle
              cx={128 + (gazeOffset.x || 0) * 0.5}
              cy="110"
              r="7"
              fill="url(#irisGradient)"
              transition={{ duration: 0.2 }}
            />

            {/* Pupil */}
            <motion.circle
              cx={128 + (gazeOffset.x || 0) * 0.5}
              cy="110"
              r={emotion === "joy" || emotion === "tenderness" ? 3.5 : 3}
              fill="#0A0A0A"
              transition={{ duration: 0.2 }}
            />

            {/* Eye shine */}
            <circle cx="126" cy="107" r="2.5" fill="white" opacity="0.9" />
            <circle cx="130" cy="112" r="1" fill="white" opacity="0.5" />
          </g>

          {/* Right eyelid - blink animation */}
          <motion.rect
            x="112"
            y="98"
            width="32"
            height={getEyeLidY() || 0.001}
            fill="url(#skinGradient)"
            transition={{ duration: 0.05 }}
          />

          {/* Right eye crease */}
          <path
            d="M114 100 Q128 96 142 100"
            fill="none"
            stroke="#C89B8B"
            strokeWidth="0.8"
          />

          {/* Left eyebrow */}
          <motion.path
            d={`M58 ${90 + (getEyebrowY() || 0)} Q72 ${85 + (getEyebrowY() || 0)} 86 ${88 + (getEyebrowY() || 0)}`}
            fill="none"
            stroke="#5C4033"
            strokeWidth="2.5"
            strokeLinecap="round"
            transition={{ duration: 0.3 }}
          />

          {/* Right eyebrow */}
          <motion.path
            d={`M114 ${88 + (getEyebrowY() || 0)} Q128 ${85 + (getEyebrowY() || 0)} 142 ${90 + (getEyebrowY() || 0)}`}
            fill="none"
            stroke="#5C4033"
            strokeWidth="2.5"
            strokeLinecap="round"
            transition={{ duration: 0.3 }}
          />

          {/* Mouth - animated for speech and emotion */}
          <g>
            {/* Upper lip */}
            <motion.path
              d={`M80 ${160 - getSmileAmount() * 2}
                  Q90 ${157 - getSmileAmount() * 3} 100 ${155 - getSmileAmount() * 2}
                  Q110 ${157 - getSmileAmount() * 3} 120 ${160 - getSmileAmount() * 2}`}
              fill="url(#lipGradient)"
              stroke="none"
              animate={{
                d: isSpeaking
                  ? `M80 ${160 - getSmileAmount() * 2 - mouthOpenness * 3}
                     Q90 ${157 - getSmileAmount() * 3 - mouthOpenness * 2} 100 ${155 - getSmileAmount() * 2 - mouthOpenness * 2}
                     Q110 ${157 - getSmileAmount() * 3 - mouthOpenness * 2} 120 ${160 - getSmileAmount() * 2 - mouthOpenness * 3}`
                  : undefined
              }}
              transition={{ duration: 0.05 }}
            />

            {/* Cupid's bow - upper lip detail */}
            <path
              d="M94 156 L100 153 L106 156"
              fill="none"
              stroke="#C97070"
              strokeWidth="0.5"
            />

            {/* Lower lip */}
            <motion.path
              d={`M82 ${162 + getSmileAmount() * 2}
                  Q100 ${170 + getSmileAmount() * 4 + mouthOpenness * 8}
                  118 ${162 + getSmileAmount() * 2}`}
              fill="url(#lipGradient)"
              stroke="none"
              animate={{
                d: isSpeaking
                  ? `M82 ${162 + getSmileAmount() * 2 + mouthOpenness * 4}
                     Q100 ${170 + getSmileAmount() * 4 + mouthOpenness * 12}
                     118 ${162 + getSmileAmount() * 2 + mouthOpenness * 4}`
                  : undefined
              }}
              transition={{ duration: 0.05 }}
            />

            {/* Mouth interior when speaking */}
            <AnimatePresence>
              {isSpeaking && mouthOpenness > 0.1 && (
                <motion.ellipse
                  cx="100"
                  cy={163 + mouthOpenness * 3}
                  rx={15 + mouthOpenness * 5}
                  ry={mouthOpenness * 8}
                  fill="#4A2020"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.9 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.05 }}
                />
              )}
            </AnimatePresence>

            {/* Teeth hint when speaking wide */}
            <AnimatePresence>
              {isSpeaking && mouthOpenness > 0.4 && (
                <motion.rect
                  x="90"
                  y={159 + mouthOpenness * 2}
                  width="20"
                  height="4"
                  rx="1"
                  fill="white"
                  opacity="0.7"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.7 }}
                  exit={{ opacity: 0 }}
                />
              )}
            </AnimatePresence>
          </g>

          {/* Chin highlight */}
          <ellipse cx="100" cy="185" rx="15" ry="8" fill="#F5D0C5" opacity="0.4" />

          {/* Hair front wisps */}
          <path
            d="M45 75 Q60 50 75 60 Q65 45 55 50"
            fill="url(#hairGradient)"
          />
          <path
            d="M155 75 Q140 50 125 60 Q135 45 145 50"
            fill="url(#hairGradient)"
          />

          {/* Subtle hair strands */}
          <path
            d="M40 85 Q50 70 60 75"
            fill="none"
            stroke="#3D2314"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M160 85 Q150 70 140 75"
            fill="none"
            stroke="#3D2314"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Ear hints */}
          <ellipse cx="32" cy="115" rx="8" ry="12" fill="url(#skinGradient)" />
          <ellipse cx="168" cy="115" rx="8" ry="12" fill="url(#skinGradient)" />
        </svg>
      </motion.div>

      {/* Listening indicator - subtle ring */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 pointer-events-none"
            style={{ borderColor: HER_COLORS.coral }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
              opacity: [0.3, 0.6, 0.3],
              scale: [1, 1.02, 1]
            }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        )}
      </AnimatePresence>

      {/* Speaking pulse */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral}20 0%, transparent 70%)`,
            }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0.3, 0.5, 0.3],
              scale: [1, 1 + audioLevel * 0.05, 1]
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.3,
              repeat: Infinity,
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default RealisticAvatarImage;
