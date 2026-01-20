"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";

// Types of inner thoughts EVA might have
type ThoughtType = "wondering" | "remembering" | "feeling" | "noticing";

interface InnerThought {
  id: string;
  type: ThoughtType;
  content?: string; // Optional - sometimes just a feeling, no words
}

interface InnerMonologueProps {
  isIdle: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  conversationDuration: number; // seconds
  lastUserMessage?: string;
}

// Subtle thought fragments that might cross EVA's mind
// These are NOT shown to the user - they influence the visual indicator
const THOUGHT_FRAGMENTS: Record<ThoughtType, string[]> = {
  wondering: [
    "...",
    "hmm",
  ],
  remembering: [
    "...",
  ],
  feeling: [
    "...",
  ],
  noticing: [
    "...",
  ],
};

/**
 * InnerMonologue - Subtle visual indicator of EVA's "inner life"
 *
 * This shows that EVA is not just waiting for input, but has an
 * inner world of thoughts and feelings. Like when you see someone
 * lost in thought - you can tell they're thinking even if they
 * don't say anything.
 *
 * The key is SUBTLETY - this should be almost imperceptible,
 * just enough to make EVA feel alive.
 */
export function InnerMonologue({
  isIdle,
  isListening,
  isSpeaking,
  conversationDuration,
  lastUserMessage,
}: InnerMonologueProps) {
  const [currentThought, setCurrentThought] = useState<InnerThought | null>(null);
  const thoughtTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastThoughtTime = useRef<number>(0);

  // Visual state derived from thought type
  const visualState = useMemo(() => {
    if (!currentThought) return null;

    switch (currentThought.type) {
      case "wondering":
        return { symbol: "?", color: HER_COLORS.softShadow, scale: 0.6 };
      case "remembering":
        return { symbol: "~", color: HER_COLORS.earth, scale: 0.5 };
      case "feeling":
        return { symbol: "...", color: HER_COLORS.coral, scale: 0.4 };
      case "noticing":
        return { symbol: "!", color: HER_COLORS.blush, scale: 0.5 };
      default:
        return null;
    }
  }, [currentThought]);

  // Generate a random thought based on context
  const generateThought = (): InnerThought | null => {
    // Only generate thoughts when idle (not listening or speaking)
    if (!isIdle || isListening || isSpeaking) return null;

    // Random chance to have a thought (not constant)
    if (Math.random() > 0.3) return null;

    // Choose thought type based on context
    let type: ThoughtType;
    const rand = Math.random();

    if (conversationDuration > 60 && rand < 0.3) {
      // After a minute, more likely to "remember" parts of conversation
      type = "remembering";
    } else if (lastUserMessage && rand < 0.4) {
      // If there was a recent message, might be "wondering" about it
      type = "wondering";
    } else if (rand < 0.6) {
      // General feelings
      type = "feeling";
    } else {
      // Noticing something (environment, time passing)
      type = "noticing";
    }

    const fragments = THOUGHT_FRAGMENTS[type];
    const content = fragments[Math.floor(Math.random() * fragments.length)];

    return {
      id: `thought-${Date.now()}`,
      type,
      content,
    };
  };

  // Thought generation loop
  useEffect(() => {
    if (isListening || isSpeaking) {
      // Clear thought when actively engaged
      setCurrentThought(null);
      return;
    }

    // Generate thoughts at random intervals when idle
    const scheduleNextThought = () => {
      const minDelay = 8000; // At least 8 seconds between thoughts
      const maxDelay = 20000; // At most 20 seconds
      const delay = minDelay + Math.random() * (maxDelay - minDelay);

      thoughtTimerRef.current = setTimeout(() => {
        const now = Date.now();
        // Ensure minimum gap between thoughts
        if (now - lastThoughtTime.current < 5000) {
          scheduleNextThought();
          return;
        }

        const thought = generateThought();
        if (thought) {
          setCurrentThought(thought);
          lastThoughtTime.current = now;

          // Thought fades after a few seconds
          setTimeout(() => {
            setCurrentThought(null);
          }, 3000 + Math.random() * 2000);
        }

        scheduleNextThought();
      }, delay);
    };

    scheduleNextThought();

    return () => {
      if (thoughtTimerRef.current) {
        clearTimeout(thoughtTimerRef.current);
      }
    };
  }, [isIdle, isListening, isSpeaking, conversationDuration, lastUserMessage]);

  // Don't render anything if actively engaged
  if (isListening || isSpeaking) return null;

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <AnimatePresence mode="wait">
        {visualState && (
          <motion.div
            key={currentThought?.id}
            className="absolute"
            style={{
              // Position slightly above avatar center
              top: "35%",
              right: "30%",
            }}
            initial={{ opacity: 0, scale: 0.5, y: 5 }}
            animate={{
              opacity: [0, 0.4, 0.3, 0],
              scale: [0.5, visualState.scale, visualState.scale * 0.9],
              y: [5, 0, -3],
            }}
            exit={{ opacity: 0, scale: 0.3, y: -5 }}
            transition={{
              duration: 3,
              ease: "easeInOut",
              times: [0, 0.2, 0.8, 1],
            }}
          >
            {/* Soft glow behind */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background: `radial-gradient(circle, ${visualState.color}30 0%, transparent 70%)`,
                width: 24,
                height: 24,
                marginLeft: -12,
                marginTop: -12,
              }}
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* The thought indicator itself - just a subtle symbol */}
            <span
              className="text-xs font-light select-none"
              style={{
                color: visualState.color,
                fontSize: "10px",
                letterSpacing: "2px",
              }}
            >
              {visualState.symbol}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default InnerMonologue;
