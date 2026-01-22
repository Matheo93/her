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
  const [cheekRise, setCheekRise] = useState(0); // 0-1 for smile cheek lift
  // Idle animation states for lifelike presence
  const [idleLipPart, setIdleLipPart] = useState(0); // 0-1 subtle lip parting
  const [deepBreath, setDeepBreath] = useState(false); // Occasional deeper breath
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

    const animate = () => {
      setSmoothMouthShape(prev => {
        // Adaptive smoothing: faster for big changes, slower for small refinements
        const getAdaptiveFactor = (delta: number) => {
          const absDelta = Math.abs(delta);
          // Big changes (>0.3) use fast factor (0.35), small changes use slow factor (0.15)
          return absDelta > 0.3 ? 0.35 : absDelta > 0.1 ? 0.25 : 0.18;
        };

        const deltaOpen = targetMouthRef.current.openness - prev.openness;
        const deltaWidth = targetMouthRef.current.width - prev.width;
        const deltaRound = targetMouthRef.current.roundness - prev.roundness;
        const deltaLip = targetMouthRef.current.upperLipRaise - prev.upperLipRaise;
        const deltaJaw = targetMouthRef.current.jawDrop - prev.jawDrop;

        return {
          openness: prev.openness + deltaOpen * getAdaptiveFactor(deltaOpen),
          width: prev.width + deltaWidth * getAdaptiveFactor(deltaWidth),
          roundness: prev.roundness + deltaRound * getAdaptiveFactor(deltaRound),
          upperLipRaise: prev.upperLipRaise + deltaLip * getAdaptiveFactor(deltaLip),
          jawDrop: prev.jawDrop + deltaJaw * getAdaptiveFactor(deltaJaw),
        };
      });
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [targetMouthShape, prefersReducedMotion]);

  // Use smoothed mouth shape
  const mouthShape = smoothMouthShape;

  // Legacy openness for compatibility
  const mouthOpenness = mouthShape.openness;

  // Emotion intensity for smooth transitions (0-1)
  const [emotionIntensity, setEmotionIntensity] = useState(1);
  const [transitioningFrom, setTransitioningFrom] = useState<string | null>(null);

  // Smooth emotion transitions with intensity interpolation
  useEffect(() => {
    if (emotion !== prevEmotionRef.current) {
      // Start transition: remember old emotion, begin fading
      setTransitioningFrom(prevEmotionRef.current);
      setEmotionIntensity(0);

      // Transition duration varies by emotion intensity change
      // Bigger emotional shifts = longer transition for naturalness
      const emotionIntensityMap: Record<string, number> = {
        joy: 1.2, excitement: 1.3, anger: 1.1, fear: 0.9,
        sadness: 0.8, tenderness: 1.0, surprise: 1.2,
        neutral: 0.5, curiosity: 0.9, playful: 1.1,
      };
      const fromIntensity = emotionIntensityMap[prevEmotionRef.current || "neutral"] || 1;
      const toIntensity = emotionIntensityMap[emotion] || 1;
      const intensityDiff = Math.abs(toIntensity - fromIntensity);
      const transitionDuration = 300 + intensityDiff * 200; // 300-500ms based on difference
      const startTime = Date.now();
      let animationId: number;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / transitionDuration, 1);
        // Ease-out curve for natural feel
        const eased = 1 - Math.pow(1 - progress, 3);
        setEmotionIntensity(eased);

        if (progress < 1) {
          animationId = requestAnimationFrame(animate);
        } else {
          // Transition complete
          setSmoothEmotion(emotion);
          prevEmotionRef.current = emotion;
          setTransitioningFrom(null);
        }
      };

      // Brief delay before starting transition
      const timer = setTimeout(() => {
        setSmoothEmotion(emotion);
        animationId = requestAnimationFrame(animate);
      }, 50);

      return () => {
        clearTimeout(timer);
        if (animationId) cancelAnimationFrame(animationId);
      };
    }
  }, [emotion]);

  // Emotion to visual presence - interpolates between emotions during transition
  const emotionPresence = useMemo(() => {
    const targetPresence = EMOTION_PRESENCE[smoothEmotion] || EMOTION_PRESENCE.neutral;

    // If transitioning, blend between old and new presence
    if (transitioningFrom && emotionIntensity < 1) {
      const fromPresence = EMOTION_PRESENCE[transitioningFrom] || EMOTION_PRESENCE.neutral;

      // Parse RGBA values for interpolation
      const parseRGBA = (rgba: string) => {
        const match = rgba.match(/[\d.]+/g);
        return match ? match.map(Number) : [0, 0, 0, 0];
      };

      const fromGlow = parseRGBA(fromPresence.glow);
      const toGlow = parseRGBA(targetPresence.glow);

      // Interpolate glow color
      const blendedGlow = `rgba(${
        Math.round(fromGlow[0] + (toGlow[0] - fromGlow[0]) * emotionIntensity)
      }, ${
        Math.round(fromGlow[1] + (toGlow[1] - fromGlow[1]) * emotionIntensity)
      }, ${
        Math.round(fromGlow[2] + (toGlow[2] - fromGlow[2]) * emotionIntensity)
      }, ${
        (fromGlow[3] + (toGlow[3] - fromGlow[3]) * emotionIntensity).toFixed(2)
      })`;

      // Interpolate warmth
      const blendedWarmth = fromPresence.warmth + (targetPresence.warmth - fromPresence.warmth) * emotionIntensity;

      return { glow: blendedGlow, warmth: blendedWarmth };
    }

    return targetPresence;
  }, [smoothEmotion, transitioningFrom, emotionIntensity]);

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

      // Eye squint and cheek rise for genuine smiles (Duchenne marker)
      if (smoothEmotion === "joy" || smoothEmotion === "excitement") {
        setEyeSquint(0.2 + Math.random() * 0.2);
        setCheekRise(0.3 + Math.random() * 0.2); // Cheeks lift during genuine smile
      } else if (smoothEmotion === "tenderness" || smoothEmotion === "playful") {
        setEyeSquint(0.1 + Math.random() * 0.1);
        setCheekRise(0.15 + Math.random() * 0.1);
      } else {
        setEyeSquint(0);
        setCheekRise(0);
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
        setCheekRise((prev) => prev * 0.6); // Fade out cheek rise
        setNoseWrinkle(0);
      }, 300);
    }, 2500 + Math.random() * 3500);

    return () => clearInterval(interval);
  }, [smoothEmotion]);

  // Idle animations for lifelike presence when not speaking/listening
  useEffect(() => {
    if (prefersReducedMotion) return;
    if (isSpeaking || isListening) {
      setIdleLipPart(0);
      return;
    }

    // Subtle lip parting animation (like about to speak)
    const lipInterval = setInterval(() => {
      // 15% chance to briefly part lips
      if (Math.random() < 0.15) {
        setIdleLipPart(0.1 + Math.random() * 0.1);
        setTimeout(() => setIdleLipPart(0), 400 + Math.random() * 300);
      }
    }, 5000 + Math.random() * 5000);

    // Occasional deep breath (every 20-40 seconds)
    const breathInterval = setInterval(() => {
      setDeepBreath(true);
      setTimeout(() => setDeepBreath(false), 2000);
    }, 20000 + Math.random() * 20000);

    return () => {
      clearInterval(lipInterval);
      clearInterval(breathInterval);
    };
  }, [prefersReducedMotion, isSpeaking, isListening]);

  // Breathing values - memoized with state-dependent amplitude
  const breathAmplitude = useMemo(() => {
    // Deep breath increases amplitude significantly
    const deepBreathMultiplier = deepBreath ? 1.8 : 1;

    if (isSpeaking) return 0.012 * deepBreathMultiplier;
    if (isListening) return 0.006 * deepBreathMultiplier;
    // Idle: natural variation based on emotion
    if (smoothEmotion === "excitement" || smoothEmotion === "joy") return 0.01 * deepBreathMultiplier;
    if (smoothEmotion === "sadness") return 0.005 * deepBreathMultiplier;
    return 0.008 * deepBreathMultiplier; // Default
  }, [isSpeaking, isListening, smoothEmotion, deepBreath]);

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

  // Eyebrow position - memoized, uses smooth emotion and activity state
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
    // Slight raise when listening (attentive), slight lower when speaking
    const activityMod = isListening ? -1.5 : isSpeaking ? 0.5 : 0;
    return base + (microExpression * -1.5) + activityMod;
  }, [smoothEmotion, microExpression, isListening, isSpeaking]);

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
            {/* Main skin gradient */}
            <radialGradient id="skinGradient" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#F5D0C5" />
              <stop offset="50%" stopColor="#F0C5B5" />
              <stop offset="75%" stopColor="#EABAA8" />
              <stop offset="100%" stopColor="#D4A090" />
            </radialGradient>

            {/* Warm undertone for cheeks/nose area */}
            <radialGradient id="warmUndertone" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F2A89E" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#F2A89E" stopOpacity="0" />
            </radialGradient>

            {/* Subtle skin texture overlay */}
            <filter id="skinTexture" x="0%" y="0%" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" result="noise" seed="5" />
              <feColorMatrix type="saturate" values="0" result="gray" />
              <feBlend in="SourceGraphic" in2="gray" mode="overlay" result="blend" />
              <feComposite in="blend" in2="SourceAlpha" operator="in" />
            </filter>

            {/* Freckle pattern */}
            <pattern id="frecklePattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="5" cy="8" r="0.6" fill="#C89B8B" opacity="0.3" />
              <circle cx="18" cy="5" r="0.5" fill="#C89B8B" opacity="0.25" />
              <circle cx="32" cy="12" r="0.7" fill="#C89B8B" opacity="0.2" />
              <circle cx="12" cy="22" r="0.5" fill="#C89B8B" opacity="0.3" />
              <circle cx="28" cy="28" r="0.6" fill="#C89B8B" opacity="0.25" />
              <circle cx="8" cy="35" r="0.4" fill="#C89B8B" opacity="0.2" />
              <circle cx="35" cy="35" r="0.5" fill="#C89B8B" opacity="0.3" />
            </pattern>

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

            {/* Hair highlight gradient */}
            <linearGradient id="hairHighlight" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6B5344" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#5A4233" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#4A3728" stopOpacity="0" />
            </linearGradient>

            {/* Iris gradient - warm brown */}
            {/* Iris gradient - warm brown with depth */}
            <radialGradient id="irisGradient" cx="40%" cy="40%" r="55%">
              <stop offset="0%" stopColor="#A67C20" />
              <stop offset="30%" stopColor="#8B6914" />
              <stop offset="60%" stopColor="#5C4033" />
              <stop offset="85%" stopColor="#3D2817" />
              <stop offset="100%" stopColor="#2A1A0F" />
            </radialGradient>
            {/* Limbal ring - darker edge around iris */}
            <radialGradient id="limbalRing" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="85%" stopColor="transparent" />
              <stop offset="100%" stopColor="#1A0F08" stopOpacity="0.4" />
            </radialGradient>

            {/* Blush gradients - with warmth variation */}
            <radialGradient id="blushLeft" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={HER_COLORS.blush} stopOpacity="0.35" />
              <stop offset="60%" stopColor={HER_COLORS.blush} stopOpacity="0.15" />
              <stop offset="100%" stopColor={HER_COLORS.blush} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="blushRight" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={HER_COLORS.coral} stopOpacity="0.25" />
              <stop offset="70%" stopColor={HER_COLORS.blush} stopOpacity="0.1" />
              <stop offset="100%" stopColor={HER_COLORS.blush} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Hair back layer */}
          <ellipse cx="100" cy="70" rx="75" ry="65" fill="url(#hairGradient)" />
          <ellipse cx="100" cy="90" rx="82" ry="75" fill="url(#hairGradient)" />

          {/* Hair sides with volume */}
          <ellipse cx="35" cy="100" rx="25" ry="50" fill="url(#hairGradient)" />
          <ellipse cx="165" cy="100" rx="25" ry="50" fill="url(#hairGradient)" />

          {/* Hair volume layers */}
          <path
            d="M25 70 Q50 30 100 25 Q150 30 175 70 Q180 100 175 130 Q160 120 100 115 Q40 120 25 130 Q20 100 25 70"
            fill="url(#hairGradient)"
          />

          {/* Hair highlight sweep */}
          <path
            d="M40 50 Q70 35 100 32 Q130 35 150 50"
            fill="none"
            stroke="url(#hairHighlight)"
            strokeWidth="8"
            strokeLinecap="round"
            opacity="0.5"
          />

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

          {/* Warm undertone across central face - subtle warmth */}
          <ellipse cx="100" cy="130" rx="45" ry="35" fill="url(#warmUndertone)" />

          {/* Cheek blush - left (rises with smile) */}
          <ellipse
            cx="60"
            cy={130 - cheekRise * 4}
            rx="20"
            ry={15 + cheekRise * 2}
            fill="url(#blushLeft)"
          />

          {/* Cheek blush - right (rises with smile) */}
          <ellipse
            cx="140"
            cy={130 - cheekRise * 4}
            rx="20"
            ry={15 + cheekRise * 2}
            fill="url(#blushRight)"
          />

          {/* Additional blush highlight when smiling/happy */}
          {cheekRise > 0.3 && (
            <>
              <ellipse
                cx="55"
                cy={125 - cheekRise * 5}
                rx="8"
                ry="6"
                fill={HER_COLORS.coral}
                opacity={cheekRise * 0.15}
              />
              <ellipse
                cx="145"
                cy={125 - cheekRise * 5}
                rx="8"
                ry="6"
                fill={HER_COLORS.coral}
                opacity={cheekRise * 0.15}
              />
            </>
          )}

          {/* Subtle freckles across nose and cheeks */}
          <g opacity="0.4">
            {/* Left cheek freckles */}
            <circle cx="52" cy="125" r="0.8" fill="#C89B8B" />
            <circle cx="58" cy="130" r="0.6" fill="#C89B8B" />
            <circle cx="65" cy="127" r="0.7" fill="#C89B8B" />
            <circle cx="55" cy="135" r="0.5" fill="#C89B8B" />
            <circle cx="62" cy="133" r="0.6" fill="#C89B8B" />
            {/* Nose bridge freckles */}
            <circle cx="95" cy="125" r="0.5" fill="#C89B8B" />
            <circle cx="100" cy="128" r="0.6" fill="#C89B8B" />
            <circle cx="105" cy="125" r="0.5" fill="#C89B8B" />
            <circle cx="98" cy="132" r="0.4" fill="#C89B8B" />
            <circle cx="103" cy="130" r="0.5" fill="#C89B8B" />
            {/* Right cheek freckles */}
            <circle cx="135" cy="127" r="0.7" fill="#C89B8B" />
            <circle cx="142" cy="130" r="0.6" fill="#C89B8B" />
            <circle cx="148" cy="125" r="0.8" fill="#C89B8B" />
            <circle cx="138" cy="133" r="0.6" fill="#C89B8B" />
            <circle cx="145" cy="135" r="0.5" fill="#C89B8B" />
          </g>

          {/* Nasolabial folds (smile lines) - appear with smile and cheek rise */}
          {(cheekRise > 0.1 || smileAmount > 0.3) && (
            <g opacity={Math.min((cheekRise * 2 + smileAmount * 0.5), 0.5)}>
              {/* Left nasolabial fold */}
              <path
                d={`M85 ${145 - cheekRise * 3} Q78 ${155 - cheekRise * 2} 75 ${162 - cheekRise * 2}`}
                fill="none"
                stroke="#D4A090"
                strokeWidth="0.8"
                strokeLinecap="round"
              />
              {/* Right nasolabial fold */}
              <path
                d={`M115 ${145 - cheekRise * 3} Q122 ${155 - cheekRise * 2} 125 ${162 - cheekRise * 2}`}
                fill="none"
                stroke="#D4A090"
                strokeWidth="0.8"
                strokeLinecap="round"
              />
            </g>
          )}

          {/* Nose with detailed shading */}
          <g>
            {/* Nose bridge highlight */}
            <path
              d="M100 100 L100 130"
              fill="none"
              stroke="#F5D0C5"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.4"
            />
            {/* Main nose contour */}
            <path
              d="M100 105 L100 135 Q98 142 92 145 Q100 148 108 145 Q102 142 100 135"
              fill="none"
              stroke="#D4A090"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            {/* Nostril shadows */}
            <ellipse cx="94" cy="144" rx="3" ry="2" fill="#C89B8B" opacity="0.35" />
            <ellipse cx="106" cy="144" rx="3" ry="2" fill="#C89B8B" opacity="0.35" />
            {/* Nose side shadows */}
            <path
              d="M96 125 Q93 135 92 143"
              fill="none"
              stroke="#D4A090"
              strokeWidth="0.8"
              opacity="0.4"
            />
            <path
              d="M104 125 Q107 135 108 143"
              fill="none"
              stroke="#D4A090"
              strokeWidth="0.8"
              opacity="0.4"
            />
          </g>

          {/* Philtrum - groove between nose and upper lip */}
          <g opacity="0.35">
            {/* Left philtrum ridge */}
            <path
              d="M97 147 Q96 152 97 156"
              fill="none"
              stroke="#D4A090"
              strokeWidth="0.5"
              strokeLinecap="round"
            />
            {/* Right philtrum ridge */}
            <path
              d="M103 147 Q104 152 103 156"
              fill="none"
              stroke="#D4A090"
              strokeWidth="0.5"
              strokeLinecap="round"
            />
            {/* Philtrum highlight */}
            <path
              d="M98.5 148 Q100 153 101.5 148"
              fill="none"
              stroke="#F5D0C5"
              strokeWidth="0.8"
              opacity="0.5"
            />
          </g>

          {/* Nose wrinkle lines - for intense emotions */}
          {noseWrinkle > 0.05 && (
            <g opacity={noseWrinkle * 3}>
              <path
                d="M94 102 Q96 100 98 102"
                fill="none"
                stroke="#C89B8B"
                strokeWidth="0.6"
                strokeLinecap="round"
              />
              <path
                d="M102 102 Q104 100 106 102"
                fill="none"
                stroke="#C89B8B"
                strokeWidth="0.6"
                strokeLinecap="round"
              />
              <path
                d="M95 105 Q97 103 99 105"
                fill="none"
                stroke="#C89B8B"
                strokeWidth="0.5"
                strokeLinecap="round"
              />
              <path
                d="M101 105 Q103 103 105 105"
                fill="none"
                stroke="#C89B8B"
                strokeWidth="0.5"
                strokeLinecap="round"
              />
            </g>
          )}

          {/* Nose tip highlight */}
          <ellipse cx="100" cy="140" rx="6" ry="4" fill="#F5D0C5" opacity="0.5" />

          {/* Left eye group */}
          <g transform={`translate(${gazeOffset.x || 0}, ${gazeOffset.y || 0})`}>
            {/* Eye white */}
            <ellipse cx="72" cy="110" rx="14" ry="10" fill="white" />

            {/* Iris with limbal ring */}
            <motion.circle
              cx={72 + (gazeOffset.x || 0) * 0.5}
              cy="110"
              r="7"
              fill="url(#irisGradient)"
              transition={{ duration: 0.2 }}
            />
            {/* Limbal ring - darker edge */}
            <motion.circle
              cx={72 + (gazeOffset.x || 0) * 0.5}
              cy="110"
              r="7"
              fill="url(#limbalRing)"
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

            {/* Eye sparkles - multiple catchlights for life */}
            <g className="eye-sparkles">
              {/* Primary catchlight */}
              <circle cx="70" cy="107" r="2.5" fill="white" opacity="0.95" />
              {/* Secondary catchlight */}
              <circle cx="75" cy="113" r="1.2" fill="white" opacity="0.6" />
              {/* Tertiary micro sparkle */}
              <circle cx="68" cy="111" r="0.6" fill="white" opacity="0.4" />
              {/* Window reflection arc */}
              <path
                d="M67 106 Q70 104 73 106"
                fill="none"
                stroke="white"
                strokeWidth="0.8"
                opacity="0.3"
                strokeLinecap="round"
              />
            </g>

            {/* Eye moisture line - wet reflection along lower lid */}
            <path
              d="M60 117 Q72 119 84 117"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              opacity="0.25"
              strokeLinecap="round"
            />
          </g>

          {/* Left eyelid - blink animation + Duchenne squint */}
          <motion.rect
            x="56"
            y="98"
            width="32"
            height={(getEyeLidY() || 0.001) + eyeSquint * 4}
            fill="url(#skinGradient)"
            transition={{ duration: 0.05 }}
          />

          {/* Left lower eyelid - Duchenne squint pushes up */}
          {eyeSquint > 0.1 && (
            <motion.path
              d={`M58 ${118 - eyeSquint * 3} Q72 ${120 - eyeSquint * 4} 86 ${118 - eyeSquint * 3}`}
              fill="url(#skinGradient)"
              stroke="none"
              initial={{ opacity: 0 }}
              animate={{ opacity: eyeSquint * 0.8 }}
              transition={{ duration: 0.15 }}
            />
          )}

          {/* Left eye crease */}
          <path
            d="M58 100 Q72 96 86 100"
            fill="none"
            stroke="#C89B8B"
            strokeWidth="0.8"
          />

          {/* Left upper eyelashes - subtle curved strokes */}
          <g opacity={blinkState === "open" ? 0.7 : 0}>
            <path d="M60 101 Q59 98 58 96" fill="none" stroke="#3D2314" strokeWidth="0.6" strokeLinecap="round" />
            <path d="M65 99 Q64 96 63 94" fill="none" stroke="#3D2314" strokeWidth="0.7" strokeLinecap="round" />
            <path d="M70 98 Q70 95 69 93" fill="none" stroke="#3D2314" strokeWidth="0.8" strokeLinecap="round" />
            <path d="M75 98 Q76 95 76 93" fill="none" stroke="#3D2314" strokeWidth="0.7" strokeLinecap="round" />
            <path d="M80 99 Q82 96 83 94" fill="none" stroke="#3D2314" strokeWidth="0.6" strokeLinecap="round" />
            <path d="M84 101 Q86 98 88 97" fill="none" stroke="#3D2314" strokeWidth="0.5" strokeLinecap="round" />
          </g>

          {/* Left lower eyelash hints - very subtle */}
          <g opacity={blinkState === "open" ? 0.3 : 0}>
            <path d="M64 119 L63 121" fill="none" stroke="#5C4033" strokeWidth="0.4" strokeLinecap="round" />
            <path d="M72 120 L72 122" fill="none" stroke="#5C4033" strokeWidth="0.4" strokeLinecap="round" />
            <path d="M80 119 L81 121" fill="none" stroke="#5C4033" strokeWidth="0.4" strokeLinecap="round" />
          </g>

          {/* Left crow's feet - appear during genuine smiles */}
          {(eyeSquint > 0.15 || cheekRise > 0.2) && (
            <g opacity={(eyeSquint + cheekRise) * 0.6}>
              <path
                d="M50 108 L45 105"
                fill="none"
                stroke="#C89B8B"
                strokeWidth="0.5"
                strokeLinecap="round"
              />
              <path
                d="M48 112 L42 111"
                fill="none"
                stroke="#C89B8B"
                strokeWidth="0.5"
                strokeLinecap="round"
              />
              <path
                d="M50 116 L45 119"
                fill="none"
                stroke="#C89B8B"
                strokeWidth="0.4"
                strokeLinecap="round"
              />
            </g>
          )}

          {/* Right eye group */}
          <g transform={`translate(${gazeOffset.x || 0}, ${gazeOffset.y || 0})`}>
            {/* Eye white */}
            <ellipse cx="128" cy="110" rx="14" ry="10" fill="white" />

            {/* Iris */}
            {/* Iris with limbal ring */}
            <motion.circle
              cx={128 + (gazeOffset.x || 0) * 0.5}
              cy="110"
              r="7"
              fill="url(#irisGradient)"
              transition={{ duration: 0.2 }}
            />
            {/* Limbal ring - darker edge */}
            <motion.circle
              cx={128 + (gazeOffset.x || 0) * 0.5}
              cy="110"
              r="7"
              fill="url(#limbalRing)"
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

            {/* Eye sparkles - multiple catchlights for life */}
            <g className="eye-sparkles">
              {/* Primary catchlight */}
              <circle cx="126" cy="107" r="2.5" fill="white" opacity="0.95" />
              {/* Secondary catchlight */}
              <circle cx="131" cy="113" r="1.2" fill="white" opacity="0.6" />
              {/* Tertiary micro sparkle */}
              <circle cx="124" cy="111" r="0.6" fill="white" opacity="0.4" />
              {/* Window reflection arc */}
              <path
                d="M123 106 Q126 104 129 106"
                fill="none"
                stroke="white"
                strokeWidth="0.8"
                opacity="0.3"
                strokeLinecap="round"
              />
            </g>

            {/* Eye moisture line - wet reflection along lower lid */}
            <path
              d="M116 117 Q128 119 140 117"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              opacity="0.25"
              strokeLinecap="round"
            />
          </g>

          {/* Right eyelid - blink animation + Duchenne squint */}
          <motion.rect
            x="112"
            y="98"
            width="32"
            height={(getEyeLidY() || 0.001) + eyeSquint * 4}
            fill="url(#skinGradient)"
            transition={{ duration: 0.05 }}
          />

          {/* Right lower eyelid - Duchenne squint pushes up */}
          {eyeSquint > 0.1 && (
            <motion.path
              d={`M114 ${118 - eyeSquint * 3} Q128 ${120 - eyeSquint * 4} 142 ${118 - eyeSquint * 3}`}
              fill="url(#skinGradient)"
              stroke="none"
              initial={{ opacity: 0 }}
              animate={{ opacity: eyeSquint * 0.8 }}
              transition={{ duration: 0.15 }}
            />
          )}

          {/* Right crow's feet - appear during genuine smiles */}
          {(eyeSquint > 0.15 || cheekRise > 0.2) && (
            <g opacity={(eyeSquint + cheekRise) * 0.6}>
              <path
                d="M150 108 L155 105"
                fill="none"
                stroke="#C89B8B"
                strokeWidth="0.5"
                strokeLinecap="round"
              />
              <path
                d="M152 112 L158 111"
                fill="none"
                stroke="#C89B8B"
                strokeWidth="0.5"
                strokeLinecap="round"
              />
              <path
                d="M150 116 L155 119"
                fill="none"
                stroke="#C89B8B"
                strokeWidth="0.4"
                strokeLinecap="round"
              />
            </g>
          )}

          {/* Right eye crease */}
          <path
            d="M114 100 Q128 96 142 100"
            fill="none"
            stroke="#C89B8B"
            strokeWidth="0.8"
          />

          {/* Right upper eyelashes - subtle curved strokes */}
          <g opacity={blinkState === "open" ? 0.7 : 0}>
            <path d="M116 101 Q114 98 112 97" fill="none" stroke="#3D2314" strokeWidth="0.5" strokeLinecap="round" />
            <path d="M120 99 Q118 96 117 94" fill="none" stroke="#3D2314" strokeWidth="0.6" strokeLinecap="round" />
            <path d="M125 98 Q124 95 124 93" fill="none" stroke="#3D2314" strokeWidth="0.7" strokeLinecap="round" />
            <path d="M130 98 Q130 95 131 93" fill="none" stroke="#3D2314" strokeWidth="0.8" strokeLinecap="round" />
            <path d="M135 99 Q136 96 137 94" fill="none" stroke="#3D2314" strokeWidth="0.7" strokeLinecap="round" />
            <path d="M140 101 Q141 98 142 96" fill="none" stroke="#3D2314" strokeWidth="0.6" strokeLinecap="round" />
          </g>

          {/* Right lower eyelash hints - very subtle */}
          <g opacity={blinkState === "open" ? 0.3 : 0}>
            <path d="M120 119 L119 121" fill="none" stroke="#5C4033" strokeWidth="0.4" strokeLinecap="round" />
            <path d="M128 120 L128 122" fill="none" stroke="#5C4033" strokeWidth="0.4" strokeLinecap="round" />
            <path d="M136 119 L137 121" fill="none" stroke="#5C4033" strokeWidth="0.4" strokeLinecap="round" />
          </g>

          {/* Left eyebrow - multi-stroke for natural texture */}
          <g
            style={{
              transform: `rotate(${eyebrowInnerAngle * 0.5}deg)`,
              transformOrigin: "58px 90px",
            }}
          >
            {/* Main eyebrow shape - tapered */}
            <motion.path
              d={`M58 ${90 + (getEyebrowY() || 0) + asymmetry.eyebrow * 2} Q72 ${85 + (getEyebrowY() || 0) + asymmetry.eyebrow * 1.5} 86 ${88 + (getEyebrowY() || 0) + asymmetry.eyebrow}`}
              fill="none"
              stroke="#5C4033"
              strokeWidth="2.5"
              strokeLinecap="round"
              transition={{ duration: 0.3 }}
            />
            {/* Upper edge - thinner, lighter */}
            <motion.path
              d={`M60 ${88 + (getEyebrowY() || 0) + asymmetry.eyebrow * 2} Q72 ${83 + (getEyebrowY() || 0) + asymmetry.eyebrow * 1.5} 84 ${86 + (getEyebrowY() || 0) + asymmetry.eyebrow}`}
              fill="none"
              stroke="#4A3728"
              strokeWidth="1"
              strokeLinecap="round"
              opacity="0.6"
              transition={{ duration: 0.3 }}
            />
            {/* Hair texture strokes */}
            <g opacity="0.4">
              <path d="M62 89 L64 86" stroke="#3D2314" strokeWidth="0.5" />
              <path d="M68 87 L70 84" stroke="#3D2314" strokeWidth="0.5" />
              <path d="M74 86 L76 84" stroke="#3D2314" strokeWidth="0.5" />
              <path d="M80 87 L82 85" stroke="#3D2314" strokeWidth="0.5" />
            </g>
          </g>

          {/* Right eyebrow - multi-stroke for natural texture */}
          <g
            style={{
              transform: `rotate(${-eyebrowInnerAngle * 0.5}deg)`,
              transformOrigin: "142px 90px",
            }}
          >
            {/* Main eyebrow shape - tapered */}
            <motion.path
              d={`M114 ${88 + (getEyebrowY() || 0) - asymmetry.eyebrow} Q128 ${85 + (getEyebrowY() || 0) - asymmetry.eyebrow * 1.5} 142 ${90 + (getEyebrowY() || 0) - asymmetry.eyebrow * 2}`}
              fill="none"
              stroke="#5C4033"
              strokeWidth="2.5"
              strokeLinecap="round"
              transition={{ duration: 0.3 }}
            />
            {/* Upper edge - thinner, lighter */}
            <motion.path
              d={`M116 ${86 + (getEyebrowY() || 0) - asymmetry.eyebrow} Q128 ${83 + (getEyebrowY() || 0) - asymmetry.eyebrow * 1.5} 140 ${88 + (getEyebrowY() || 0) - asymmetry.eyebrow * 2}`}
              fill="none"
              stroke="#4A3728"
              strokeWidth="1"
              strokeLinecap="round"
              opacity="0.6"
              transition={{ duration: 0.3 }}
            />
            {/* Hair texture strokes */}
            <g opacity="0.4">
              <path d="M118 87 L120 85" stroke="#3D2314" strokeWidth="0.5" />
              <path d="M124 86 L126 84" stroke="#3D2314" strokeWidth="0.5" />
              <path d="M130 86 L132 84" stroke="#3D2314" strokeWidth="0.5" />
              <path d="M136 87 L138 86" stroke="#3D2314" strokeWidth="0.5" />
            </g>
          </g>

          {/* Mouth - animated with detailed viseme shapes + asymmetric smile */}
          <g>
            {/* Calculate mouth dimensions from shape */}
            {(() => {
              const smileAmt = getSmileAmount();
              const baseWidth = 20; // Half width of mouth
              const widthMod = 1 + mouthShape.width * 0.3; // Width modifier
              const roundMod = mouthShape.roundness; // Roundness for O sounds
              const upperRaise = mouthShape.upperLipRaise * 3; // Upper lip raise for F/V
              // Combine speaking jaw drop with idle lip parting
              const jawDrop = mouthShape.jawDrop * 12 + (isSpeaking ? 0 : idleLipPart * 3);

              // Asymmetric smile - one corner slightly higher
              const smileAsym = asymmetry.smile * 2;
              const leftSmileAdj = smileAsym > 0 ? smileAsym : 0;
              const rightSmileAdj = smileAsym < 0 ? -smileAsym : 0;

              const leftX = 100 - baseWidth * widthMod;
              const rightX = 100 + baseWidth * widthMod;
              const upperY = 158 - smileAmt * 2 - upperRaise;
              const lowerY = 162 + smileAmt * 2 + jawDrop;
              const mouthHeight = lowerY - upperY;

              return (
                <>
                  {/* Upper lip - with asymmetric corners */}
                  <motion.path
                    d={`M${leftX} ${upperY + leftSmileAdj}
                        Q${leftX + 10} ${upperY - 3 - upperRaise} 100 ${upperY - 5 - upperRaise + roundMod * 2}
                        Q${rightX - 10} ${upperY - 3 - upperRaise} ${rightX} ${upperY + rightSmileAdj}`}
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

                  {/* Lower lip - more rounded for O sounds, with asymmetry */}
                  <motion.path
                    d={`M${leftX + 2} ${lowerY - 2 + leftSmileAdj * 0.5}
                        Q100 ${lowerY + 8 + roundMod * 6}
                        ${rightX - 2} ${lowerY - 2 + rightSmileAdj * 0.5}`}
                    fill="url(#lipGradient)"
                    stroke="none"
                    transition={{ duration: 0.04 }}
                  />

                  {/* Lower lip highlight - gives glossy appearance */}
                  <motion.ellipse
                    cx="100"
                    cy={lowerY + 2 + roundMod * 3}
                    rx={10 * widthMod}
                    ry={3}
                    fill="white"
                    opacity="0.15"
                    transition={{ duration: 0.04 }}
                  />

                  {/* Lip line - subtle definition between lips */}
                  {!isSpeaking && (
                    <path
                      d={`M${leftX + 4} ${upperY + 1} Q100 ${upperY + 2} ${rightX - 4} ${upperY + 1}`}
                      fill="none"
                      stroke="#B86060"
                      strokeWidth="0.4"
                      opacity="0.5"
                    />
                  )}

                  {/* Mouth corner dimples - appear when smiling */}
                  {smileAmt > 0.2 && (
                    <>
                      <motion.path
                        d={`M${leftX - 2} ${upperY + 3} Q${leftX - 5} ${upperY + 1} ${leftX - 4} ${upperY - 2}`}
                        fill="none"
                        stroke="#C89B8B"
                        strokeWidth="0.5"
                        strokeLinecap="round"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: smileAmt * 0.4 }}
                        transition={{ duration: 0.1 }}
                      />
                      <motion.path
                        d={`M${rightX + 2} ${upperY + 3} Q${rightX + 5} ${upperY + 1} ${rightX + 4} ${upperY - 2}`}
                        fill="none"
                        stroke="#C89B8B"
                        strokeWidth="0.5"
                        strokeLinecap="round"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: smileAmt * 0.4 }}
                        transition={{ duration: 0.1 }}
                      />
                    </>
                  )}

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

                  {/* Upper teeth - visible for wide mouth shapes */}
                  {isSpeaking && mouthShape.openness > 0.2 && (
                    <g>
                      {/* Upper teeth row */}
                      <motion.path
                        d={`M${100 - 12 * widthMod} ${upperY + 2}
                            Q100 ${upperY + 1} ${100 + 12 * widthMod} ${upperY + 2}
                            L${100 + 10 * widthMod} ${upperY + 5}
                            Q100 ${upperY + 6} ${100 - 10 * widthMod} ${upperY + 5} Z`}
                        fill="#FAFAFA"
                        opacity={mouthShape.openness > 0.35 ? 0.9 : 0.7}
                        transition={{ duration: 0.03 }}
                      />
                      {/* Teeth line separations */}
                      <line x1="100" y1={upperY + 2} x2="100" y2={upperY + 5} stroke="#E8E8E8" strokeWidth="0.3" opacity="0.5" />
                      <line x1={100 - 5 * widthMod} y1={upperY + 2.5} x2={100 - 5 * widthMod} y2={upperY + 5} stroke="#E8E8E8" strokeWidth="0.2" opacity="0.4" />
                      <line x1={100 + 5 * widthMod} y1={upperY + 2.5} x2={100 + 5 * widthMod} y2={upperY + 5} stroke="#E8E8E8" strokeWidth="0.2" opacity="0.4" />
                    </g>
                  )}

                  {/* Lower teeth hint - only for very open mouth */}
                  {isSpeaking && mouthShape.openness > 0.5 && (
                    <motion.path
                      d={`M${100 - 8 * widthMod} ${lowerY - 3}
                          Q100 ${lowerY - 4} ${100 + 8 * widthMod} ${lowerY - 3}
                          L${100 + 6 * widthMod} ${lowerY - 1}
                          Q100 ${lowerY} ${100 - 6 * widthMod} ${lowerY - 1} Z`}
                      fill="#F5F5F5"
                      opacity={0.5}
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

          {/* Chin with jaw movement */}
          <motion.ellipse
            cx="100"
            cy={185 + mouthShape.jawDrop * 3}
            rx="15"
            ry="8"
            fill="#F5D0C5"
            opacity="0.4"
            transition={{ duration: 0.05 }}
          />
          {/* Chin shadow - moves with jaw */}
          <motion.path
            d={`M85 ${180 + mouthShape.jawDrop * 2} Q100 ${188 + mouthShape.jawDrop * 3} 115 ${180 + mouthShape.jawDrop * 2}`}
            fill="none"
            stroke="#D4A090"
            strokeWidth="0.6"
            opacity="0.3"
            transition={{ duration: 0.05 }}
          />
          {/* Chin dimple - subtle cleft */}
          <motion.g
            opacity={0.25}
            transition={{ duration: 0.05 }}
          >
            <motion.ellipse
              cx="100"
              cy={183 + mouthShape.jawDrop * 2.5}
              rx="2.5"
              ry="1.5"
              fill="#C89B8B"
            />
            {/* Dimple highlight arc */}
            <motion.path
              d={`M98 ${182 + mouthShape.jawDrop * 2.5} Q100 ${181 + mouthShape.jawDrop * 2.5} 102 ${182 + mouthShape.jawDrop * 2.5}`}
              fill="none"
              stroke="#F5D0C5"
              strokeWidth="0.6"
              opacity="0.6"
            />
          </motion.g>

          {/* Neck shadow - gives depth under chin */}
          <ellipse
            cx="100"
            cy="195"
            rx="35"
            ry="12"
            fill="#C89B8B"
            opacity="0.15"
          />
          <path
            d="M65 192 Q100 198 135 192"
            fill="none"
            stroke="#C89B8B"
            strokeWidth="1"
            opacity="0.2"
          />

          {/* Hair front wisps */}
          <path
            d="M45 75 Q60 50 75 60 Q65 45 55 50"
            fill="url(#hairGradient)"
          />
          <path
            d="M155 75 Q140 50 125 60 Q135 45 145 50"
            fill="url(#hairGradient)"
          />

          {/* Detailed hair strands */}
          <g opacity="0.9">
            {/* Left side strands */}
            <path d="M40 85 Q50 70 60 75" fill="none" stroke="#3D2314" strokeWidth="2" strokeLinecap="round" />
            <path d="M35 90 Q45 75 55 80" fill="none" stroke="#4A3728" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M38 95 Q48 82 58 87" fill="none" stroke="#3D2314" strokeWidth="1" strokeLinecap="round" />
            <path d="M42 80 Q52 65 62 70" fill="none" stroke="#5A4233" strokeWidth="1" strokeLinecap="round" opacity="0.7" />

            {/* Right side strands */}
            <path d="M160 85 Q150 70 140 75" fill="none" stroke="#3D2314" strokeWidth="2" strokeLinecap="round" />
            <path d="M165 90 Q155 75 145 80" fill="none" stroke="#4A3728" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M162 95 Q152 82 142 87" fill="none" stroke="#3D2314" strokeWidth="1" strokeLinecap="round" />
            <path d="M158 80 Q148 65 138 70" fill="none" stroke="#5A4233" strokeWidth="1" strokeLinecap="round" opacity="0.7" />

            {/* Top strands for texture */}
            <path d="M60 50 Q70 40 85 42" fill="none" stroke="#5A4233" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
            <path d="M140 50 Q130 40 115 42" fill="none" stroke="#5A4233" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
            <path d="M75 45 Q90 38 105 40" fill="none" stroke="#6B5344" strokeWidth="0.8" strokeLinecap="round" opacity="0.4" />
          </g>

          {/* Left ear with detail */}
          <g>
            {/* Ear base */}
            <ellipse cx="32" cy="115" rx="8" ry="12" fill="url(#skinGradient)" />
            {/* Inner ear detail */}
            <path
              d="M30 108 Q26 115 30 122"
              fill="none"
              stroke="#D4A090"
              strokeWidth="0.8"
              opacity="0.6"
            />
            {/* Ear highlight */}
            <ellipse cx="34" cy="112" rx="3" ry="4" fill="#F5D0C5" opacity="0.4" />
            {/* Small stud earring */}
            <circle cx="32" cy="122" r="1.5" fill={HER_COLORS.coral} opacity="0.7" />
            <circle cx="32" cy="122" r="0.8" fill="white" opacity="0.4" />
          </g>

          {/* Right ear with detail */}
          <g>
            {/* Ear base */}
            <ellipse cx="168" cy="115" rx="8" ry="12" fill="url(#skinGradient)" />
            {/* Inner ear detail */}
            <path
              d="M170 108 Q174 115 170 122"
              fill="none"
              stroke="#D4A090"
              strokeWidth="0.8"
              opacity="0.6"
            />
            {/* Ear highlight */}
            <ellipse cx="166" cy="112" rx="3" ry="4" fill="#F5D0C5" opacity="0.4" />
            {/* Small stud earring */}
            <circle cx="168" cy="122" r="1.5" fill={HER_COLORS.coral} opacity="0.7" />
            <circle cx="168" cy="122" r="0.8" fill="white" opacity="0.4" />
          </g>
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
