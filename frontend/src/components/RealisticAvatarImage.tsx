"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS, EMOTION_PRESENCE } from "@/styles/her-theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";

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

// Detailed mouth shape for each viseme
interface MouthShape {
  openness: number;      // 0-1: how open the mouth is
  width: number;         // -1 to 1: narrow to wide
  roundness: number;     // 0-1: how rounded (for O sounds)
  upperLipRaise: number; // 0-1: upper lip raises (for F, V)
  jawDrop: number;       // 0-1: jaw drops down
}

// Viseme to mouth shape mapping - includes French-specific sounds
const VISEME_SHAPES: Record<string, MouthShape> = {
  // Silence
  sil: { openness: 0, width: 0, roundness: 0, upperLipRaise: 0, jawDrop: 0 },

  // Bilabials: P, B, M - lips together
  PP: { openness: 0, width: 0.1, roundness: 0, upperLipRaise: 0, jawDrop: 0 },
  MM: { openness: 0.02, width: 0.05, roundness: 0, upperLipRaise: 0, jawDrop: 0 },  // M slightly more relaxed

  // Labiodentals: F, V - teeth on lip
  FF: { openness: 0.15, width: 0.2, roundness: 0, upperLipRaise: 0.4, jawDrop: 0.1 },

  // Dentals: TH, T, D, N, L - tongue touches teeth/roof
  TH: { openness: 0.2, width: 0.3, roundness: 0, upperLipRaise: 0, jawDrop: 0.15 },
  DD: { openness: 0.3, width: 0.2, roundness: 0, upperLipRaise: 0, jawDrop: 0.25 },
  NN: { openness: 0.25, width: 0.15, roundness: 0, upperLipRaise: 0, jawDrop: 0.2 },  // N - more closed
  LL: { openness: 0.35, width: 0.25, roundness: 0, upperLipRaise: 0, jawDrop: 0.25 }, // L - tongue up

  // Velars: K, G - back of tongue
  kk: { openness: 0.35, width: 0.1, roundness: 0, upperLipRaise: 0, jawDrop: 0.3 },

  // Affricates: CH, J, SH
  CH: { openness: 0.25, width: 0.4, roundness: 0.2, upperLipRaise: 0, jawDrop: 0.2 },

  // Sibilants: S, Z - teeth close
  SS: { openness: 0.15, width: 0.5, roundness: 0, upperLipRaise: 0, jawDrop: 0.1 },

  // R sounds - French R is uvular, slight roundness
  RR: { openness: 0.3, width: 0.2, roundness: 0.3, upperLipRaise: 0, jawDrop: 0.2 },

  // Vowels
  AA: { openness: 0.8, width: 0.3, roundness: 0, upperLipRaise: 0, jawDrop: 0.7 },   // A - wide open
  EE: { openness: 0.4, width: 0.6, roundness: 0, upperLipRaise: 0, jawDrop: 0.3 },   // E, I - wide smile
  II: { openness: 0.35, width: 0.65, roundness: 0, upperLipRaise: 0, jawDrop: 0.25 }, // I - tighter smile
  OO: { openness: 0.5, width: -0.3, roundness: 0.8, upperLipRaise: 0, jawDrop: 0.4 }, // O, U - rounded
  UU: { openness: 0.4, width: -0.4, roundness: 0.9, upperLipRaise: 0, jawDrop: 0.3 }, // U - tight rounded

  // French-specific: nasals (approximations)
  AN: { openness: 0.6, width: 0.2, roundness: 0.1, upperLipRaise: 0, jawDrop: 0.5 },  // "an" sound
  ON: { openness: 0.45, width: -0.2, roundness: 0.6, upperLipRaise: 0, jawDrop: 0.4 }, // "on" sound
};

// Calculate blended mouth shape from viseme weights with easing
function getMouthShape(weights: VisemeWeights): MouthShape {
  const result: MouthShape = { openness: 0, width: 0, roundness: 0, upperLipRaise: 0, jawDrop: 0 };
  let totalWeight = 0;

  for (const [viseme, weight] of Object.entries(weights)) {
    if (weight && weight > 0 && VISEME_SHAPES[viseme]) {
      const shape = VISEME_SHAPES[viseme];
      // Apply slight easing to weight for more natural blending
      const easedWeight = Math.pow(weight, 0.8); // Softer response curve
      result.openness += shape.openness * easedWeight;
      result.width += shape.width * easedWeight;
      result.roundness += shape.roundness * easedWeight;
      result.upperLipRaise += shape.upperLipRaise * easedWeight;
      result.jawDrop += shape.jawDrop * easedWeight;
      totalWeight += easedWeight;
    }
  }

  // Normalize
  if (totalWeight > 0) {
    result.openness /= totalWeight;
    result.width /= totalWeight;
    result.roundness /= totalWeight;
    result.upperLipRaise /= totalWeight;
    result.jawDrop /= totalWeight;
  }

  return result;
}

// Legacy function for compatibility
function getMouthOpenness(weights: VisemeWeights): number {
  return getMouthShape(weights).openness;
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
  const prefersReducedMotion = useReducedMotion();
  const [breathPhase, setBreathPhase] = useState(0);
  const [blinkState, setBlinkState] = useState<"open" | "closing" | "closed" | "opening">("open");
  const [gazeOffset, setGazeOffset] = useState({ x: 0, y: 0 });
  const [headTilt, setHeadTilt] = useState({ x: 0, y: 0, rotation: 0 });
  const [microExpression, setMicroExpression] = useState(0); // 0-1 subtle expression intensity
  const [smoothEmotion, setSmoothEmotion] = useState(emotion);
  // Asymmetric micro-expressions for naturalism
  const [asymmetry, setAsymmetry] = useState({ eyebrow: 0, smile: 0 }); // -1 to 1
  const [eyeSquint, setEyeSquint] = useState(0); // 0-1 for genuine smile (Duchenne)
  const [noseWrinkle, setNoseWrinkle] = useState(0); // 0-1 for intense emotions
  const prevEmotionRef = useRef(emotion);

  // Smoothed mouth shape for natural lip sync transitions
  const [smoothMouthShape, setSmoothMouthShape] = useState<MouthShape>({
    openness: 0, width: 0, roundness: 0, upperLipRaise: 0, jawDrop: 0
  });
  const targetMouthRef = useRef<MouthShape>({
    openness: 0, width: 0, roundness: 0, upperLipRaise: 0, jawDrop: 0
  });

  // Calculate target mouth shape from visemes
  const targetMouthShape = useMemo(() => {
    const shape = getMouthShape(visemeWeights);
    // Blend with audio level for fallback when visemes aren't precise
    if (isSpeaking && shape.openness < audioLevel * 0.5) {
      shape.openness = Math.max(shape.openness, audioLevel * 0.6);
      shape.jawDrop = Math.max(shape.jawDrop, audioLevel * 0.5);
    }
    return isSpeaking ? shape : { openness: 0, width: 0, roundness: 0, upperLipRaise: 0, jawDrop: 0 };
  }, [visemeWeights, isSpeaking, audioLevel]);

  // Smooth interpolation for mouth shape (60fps)
  useEffect(() => {
    if (prefersReducedMotion) {
      setSmoothMouthShape(targetMouthShape);
      return;
    }

    targetMouthRef.current = targetMouthShape;
    let animationId: number;
    const smoothingFactor = 0.25; // Higher = faster transitions

    const animate = () => {
      setSmoothMouthShape(prev => ({
        openness: prev.openness + (targetMouthRef.current.openness - prev.openness) * smoothingFactor,
        width: prev.width + (targetMouthRef.current.width - prev.width) * smoothingFactor,
        roundness: prev.roundness + (targetMouthRef.current.roundness - prev.roundness) * smoothingFactor,
        upperLipRaise: prev.upperLipRaise + (targetMouthRef.current.upperLipRaise - prev.upperLipRaise) * smoothingFactor,
        jawDrop: prev.jawDrop + (targetMouthRef.current.jawDrop - prev.jawDrop) * smoothingFactor,
      }));
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [targetMouthShape, prefersReducedMotion]);

  // Use smoothed mouth shape
  const mouthShape = smoothMouthShape;

  // Legacy openness for compatibility
  const mouthOpenness = mouthShape.openness;

  // Smooth emotion transitions
  useEffect(() => {
    if (emotion !== prevEmotionRef.current) {
      // Delayed transition for natural feel
      const timer = setTimeout(() => {
        setSmoothEmotion(emotion);
        prevEmotionRef.current = emotion;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [emotion]);

  // Emotion to visual presence - uses smoothed emotion
  const emotionPresence = useMemo(() => {
    return EMOTION_PRESENCE[smoothEmotion] || EMOTION_PRESENCE.neutral;
  }, [smoothEmotion]);

  // Breathing animation - respects reduced motion, varies with state
  useEffect(() => {
    if (prefersReducedMotion) return;

    // Breathing rate varies by state
    const breathRate = isSpeaking ? 0.07 : isListening ? 0.04 : 0.05;
    const interval = setInterval(() => {
      setBreathPhase((prev) => (prev + breathRate) % (Math.PI * 2));
    }, 50);
    return () => clearInterval(interval);
  }, [prefersReducedMotion, isSpeaking, isListening]);

  // Natural blinking with emotion-aware timing
  useEffect(() => {
    const scheduleNextBlink = () => {
      // Blink frequency varies by state and emotion
      let baseInterval = 3500;

      if (isListening) {
        baseInterval = 2500; // More attentive blinks when listening
      } else if (isSpeaking) {
        baseInterval = 4000; // Fewer blinks when speaking
      } else if (smoothEmotion === "excitement" || smoothEmotion === "surprise") {
        baseInterval = 2000; // More blinks when excited
      } else if (smoothEmotion === "sadness") {
        baseInterval = 5000; // Slower blinks when sad
      }

      const interval = baseInterval + Math.random() * (baseInterval * 0.5);

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
    const intervalId = setInterval(() => scheduleNextBlink(), 4000);

    return () => {
      clearTimeout(timer);
      clearInterval(intervalId);
    };
  }, [isListening, isSpeaking, smoothEmotion]);

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

  // Natural head micro-movements (subtle nodding, tilting) - respects reduced motion
  useEffect(() => {
    if (prefersReducedMotion) {
      setHeadTilt({ x: 0, y: 0, rotation: 0 });
      return;
    }

    const startTime = Date.now();
    let animationId: number;

    const animate = () => {
      const elapsed = (Date.now() - startTime) / 1000;

      // Very subtle head movements - layered sine waves
      const tiltX = Math.sin(elapsed * 0.3) * 0.5 + Math.sin(elapsed * 0.7) * 0.3;
      const tiltY = Math.sin(elapsed * 0.4) * 0.4 + Math.cos(elapsed * 0.6) * 0.2;
      const rotation = Math.sin(elapsed * 0.2) * 0.5;

      // More movement when speaking, less when listening
      const intensity = isSpeaking ? 1.2 : isListening ? 0.3 : 0.8;

      setHeadTilt({
        x: tiltX * intensity,
        y: tiltY * intensity,
        rotation: rotation * intensity,
      });

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [isSpeaking, isListening, prefersReducedMotion]);

  // Micro-expressions - subtle emotional flickers with asymmetry
  useEffect(() => {
    const interval = setInterval(() => {
      // Random micro-expression intensity
      setMicroExpression(Math.random() * 0.3);

      // Asymmetric expressions for naturalism (one eyebrow higher, slight smile asymmetry)
      setAsymmetry({
        eyebrow: (Math.random() - 0.5) * 0.4, // One eyebrow slightly higher
        smile: (Math.random() - 0.5) * 0.15, // Slight smile asymmetry
      });

      // Eye squint for genuine smiles (Duchenne marker)
      if (smoothEmotion === "joy" || smoothEmotion === "excitement") {
        setEyeSquint(0.2 + Math.random() * 0.2);
      } else {
        setEyeSquint(0);
      }

      // Nose wrinkle for intense emotions
      if (smoothEmotion === "joy" || smoothEmotion === "anger" || smoothEmotion === "disgust") {
        setNoseWrinkle(Math.random() * 0.15);
      } else {
        setNoseWrinkle(0);
      }

      // Reset after short duration
      setTimeout(() => {
        setMicroExpression(0);
        setAsymmetry({ eyebrow: 0, smile: 0 });
        setEyeSquint((prev) => prev * 0.5); // Fade out squint
        setNoseWrinkle(0);
      }, 300);
    }, 2500 + Math.random() * 3500);

    return () => clearInterval(interval);
  }, [smoothEmotion]);

  // Breathing values - memoized with state-dependent amplitude
  const breathAmplitude = useMemo(() => {
    if (isSpeaking) return 0.012; // More visible when speaking
    if (isListening) return 0.006; // Subtle when listening
    // Idle: natural variation based on emotion
    if (smoothEmotion === "excitement" || smoothEmotion === "joy") return 0.01;
    if (smoothEmotion === "sadness") return 0.005;
    return 0.008; // Default
  }, [isSpeaking, isListening, smoothEmotion]);

  const breathScale = useMemo(() => 1 + Math.sin(breathPhase) * breathAmplitude, [breathPhase, breathAmplitude]);
  const breathY = useMemo(() => Math.sin(breathPhase) * (breathAmplitude * 250), [breathPhase, breathAmplitude]);

  // Eye lid position - memoized
  const eyeLidY = useMemo(() => {
    switch (blinkState) {
      case "closing": return 8;
      case "closed": return 12;
      case "opening": return 4;
      default: return 0;
    }
  }, [blinkState]);

  // Eyebrow position - memoized, uses smooth emotion
  const eyebrowY = useMemo(() => {
    let base = 0;
    switch (smoothEmotion) {
      case "joy":
      case "excitement": base = -2; break;
      case "sadness": base = 3; break;
      case "surprise": base = -4; break;
      case "curiosity": base = -2; break;
      default: base = 0;
    }
    return base + (microExpression * -1.5);
  }, [smoothEmotion, microExpression]);

  // Smile amount - memoized, uses smooth emotion
  const smileAmount = useMemo(() => {
    switch (smoothEmotion) {
      case "joy": return 0.7;
      case "tenderness": return 0.4;
      case "excitement": return 0.6;
      case "playful": return 0.5;
      case "sadness": return -0.2;
      default: return 0.15;
    }
  }, [smoothEmotion]);

  // Pupil dilation - emotions affect pupil size
  const pupilSize = useMemo(() => {
    let base = 4; // Base pupil radius
    switch (smoothEmotion) {
      case "joy":
      case "excitement":
      case "surprise":
        base = 4.8; // Dilated when happy/excited
        break;
      case "tenderness":
      case "curiosity":
        base = 4.5; // Slightly dilated
        break;
      case "fear":
      case "anger":
        base = 3.5; // Constricted
        break;
      case "sadness":
        base = 3.8;
        break;
      default:
        base = 4;
    }
    // Add subtle variation based on audio level when speaking
    if (isSpeaking && audioLevel > 0.3) {
      base += audioLevel * 0.3;
    }
    return base;
  }, [smoothEmotion, isSpeaking, audioLevel]);

  // Eyebrow inner angle for expressiveness
  const eyebrowInnerAngle = useMemo(() => {
    switch (smoothEmotion) {
      case "sadness": return 8; // Inner corners up
      case "anger": return -10; // Inner corners down (furrowed)
      case "fear": return 6;
      case "surprise": return 4;
      case "curiosity": return 3;
      default: return 0;
    }
  }, [smoothEmotion]);

  // Legacy function wrappers for compatibility
  const getEyeLidY = () => eyeLidY;
  const getEyebrowY = () => eyebrowY;
  const getSmileAmount = () => smileAmount;

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ width: "100%", height: "100%", minHeight: "200px" }}
    >
      {/* Warm ambient glow - emotion responsive, respects reduced motion */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${emotionPresence.glow} 0%, transparent 70%)`,
          opacity: prefersReducedMotion ? (isSpeaking ? 0.9 : isListening ? 0.7 : 0.5) : undefined,
        }}
        animate={prefersReducedMotion ? {} : {
          scale: [1, 1.05, 1],
          opacity: isSpeaking ? 0.9 : isListening ? 0.7 : 0.5,
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Main avatar container with breathing and head micro-movements */}
      <motion.div
        className="relative w-full h-full flex items-center justify-center"
        animate={{
          scale: breathScale,
          y: breathY + headTilt.y,
          x: headTilt.x,
          rotate: headTilt.rotation,
        }}
        transition={{ duration: 0.15, ease: "easeOut" }}
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
              r={pupilSize}
              fill="#0A0A0A"
              animate={{ r: pupilSize }}
              transition={{ duration: 0.3, ease: "easeOut" }}
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

            {/* Pupil - dilates with emotion */}
            <motion.circle
              cx={128 + (gazeOffset.x || 0) * 0.5}
              cy="110"
              r={pupilSize}
              fill="#0A0A0A"
              animate={{ r: pupilSize }}
              transition={{ duration: 0.3, ease: "easeOut" }}
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

          {/* Mouth - animated with detailed viseme shapes */}
          <g>
            {/* Calculate mouth dimensions from shape */}
            {(() => {
              const smileAmt = getSmileAmount();
              const baseWidth = 20; // Half width of mouth
              const widthMod = 1 + mouthShape.width * 0.3; // Width modifier
              const roundMod = mouthShape.roundness; // Roundness for O sounds
              const upperRaise = mouthShape.upperLipRaise * 3; // Upper lip raise for F/V
              const jawDrop = mouthShape.jawDrop * 12; // Jaw drop amount

              const leftX = 100 - baseWidth * widthMod;
              const rightX = 100 + baseWidth * widthMod;
              const upperY = 158 - smileAmt * 2 - upperRaise;
              const lowerY = 162 + smileAmt * 2 + jawDrop;
              const mouthHeight = lowerY - upperY;

              return (
                <>
                  {/* Upper lip */}
                  <motion.path
                    d={`M${leftX} ${upperY}
                        Q${leftX + 10} ${upperY - 3 - upperRaise} 100 ${upperY - 5 - upperRaise + roundMod * 2}
                        Q${rightX - 10} ${upperY - 3 - upperRaise} ${rightX} ${upperY}`}
                    fill="url(#lipGradient)"
                    stroke="none"
                    transition={{ duration: 0.04 }}
                  />

                  {/* Cupid's bow */}
                  <motion.path
                    d={`M94 ${upperY - 2} L100 ${upperY - 5 + roundMod * 2} L106 ${upperY - 2}`}
                    fill="none"
                    stroke="#C97070"
                    strokeWidth="0.5"
                    transition={{ duration: 0.04 }}
                  />

                  {/* Lower lip - more rounded for O sounds */}
                  <motion.path
                    d={`M${leftX + 2} ${lowerY - 2}
                        Q100 ${lowerY + 8 + roundMod * 6}
                        ${rightX - 2} ${lowerY - 2}`}
                    fill="url(#lipGradient)"
                    stroke="none"
                    transition={{ duration: 0.04 }}
                  />

                  {/* Mouth interior when speaking */}
                  {isSpeaking && mouthShape.openness > 0.1 && (
                    <motion.ellipse
                      cx="100"
                      cy={upperY + mouthHeight / 2}
                      rx={(baseWidth - 5) * widthMod * (1 - roundMod * 0.3)}
                      ry={mouthHeight / 2 - 2}
                      fill="#3A1515"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.95 }}
                      transition={{ duration: 0.03 }}
                    />
                  )}

                  {/* Teeth - visible for wide mouth shapes */}
                  {isSpeaking && mouthShape.openness > 0.25 && (
                    <motion.rect
                      x={100 - 10 * widthMod}
                      y={upperY + 3}
                      width={20 * widthMod}
                      height={Math.min(5, mouthHeight * 0.4)}
                      rx="1"
                      fill="white"
                      opacity={mouthShape.openness > 0.4 ? 0.85 : 0.6}
                      transition={{ duration: 0.03 }}
                    />
                  )}

                  {/* Tongue hint for certain visemes */}
                  {isSpeaking && (mouthShape.openness > 0.3 || visemeWeights.TH || visemeWeights.DD) && (
                    <motion.ellipse
                      cx="100"
                      cy={lowerY - 4}
                      rx={8 * widthMod}
                      ry={3}
                      fill="#D47070"
                      opacity={0.7}
                      transition={{ duration: 0.03 }}
                    />
                  )}
                </>
              );
            })()}
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

      {/* Listening indicator - subtle ring, respects reduced motion */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 pointer-events-none"
            style={{
              borderColor: HER_COLORS.coral,
              opacity: prefersReducedMotion ? 0.5 : undefined,
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={prefersReducedMotion ? { opacity: 0.5, scale: 1 } : {
              opacity: [0.3, 0.6, 0.3],
              scale: [1, 1.02, 1]
            }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{
              duration: 2,
              repeat: prefersReducedMotion ? 0 : Infinity,
              ease: "easeInOut"
            }}
          />
        )}
      </AnimatePresence>

      {/* Speaking pulse - respects reduced motion */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral}20 0%, transparent 70%)`,
              opacity: prefersReducedMotion ? 0.4 : undefined,
            }}
            initial={{ opacity: 0 }}
            animate={prefersReducedMotion ? { opacity: 0.4 } : {
              opacity: [0.3, 0.5, 0.3],
              scale: [1, 1 + audioLevel * 0.05, 1]
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.3,
              repeat: prefersReducedMotion ? 0 : Infinity,
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default RealisticAvatarImage;
