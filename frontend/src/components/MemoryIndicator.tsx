"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useMemo, memo } from "react";
import type { PersistentMemoryState } from "@/hooks/usePersistentMemory";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface MemoryIndicatorProps {
  memory: PersistentMemoryState;
  colors: {
    coral: string;
    cream: string;
    earth: string;
    softShadow: string;
  };
  isVisible?: boolean;
}

function MemoryIndicatorComponent({ memory, colors, isVisible = true }: MemoryIndicatorProps) {
  const prefersReducedMotion = useReducedMotion();

  // Memory strength visualization (0-5 dots)
  const memoryStrength = useMemo(() => {
    const { stats, restoredWarmth, sessionNumber } = memory;

    // Calculate based on multiple factors
    let strength = 0;

    // Session count adds memory
    if (sessionNumber >= 2) strength++;
    if (sessionNumber >= 5) strength++;
    if (sessionNumber >= 10) strength++;

    // Warmth level
    if (restoredWarmth > 0.3) strength++;
    if (restoredWarmth > 0.6) strength++;

    // Shared moments
    if (stats.totalSharedMoments > 3) strength++;

    return Math.min(strength, 5);
  }, [memory]);

  // Memory phrase based on state
  const memoryPhrase = useMemo(() => {
    const { isReturningUser, reunionType, sessionNumber } = memory;

    if (!isReturningUser || sessionNumber <= 1) {
      return null; // No phrase for first visit
    }

    if (reunionType === "very_long") {
      return "Je me souviens...";
    } else if (reunionType === "long") {
      return "Notre histoire continue";
    } else if (sessionNumber > 10) {
      return "Tant de souvenirs";
    } else if (sessionNumber > 5) {
      return "Je te connais";
    }

    return "Tu es revenu";
  }, [memory]);

  if (!isVisible || !memory.isReturningUser) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="flex items-center gap-2"
        initial={prefersReducedMotion ? { opacity: 0.7 } : { opacity: 0, y: -10 }}
        animate={{ opacity: 0.7, y: 0 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
        transition={prefersReducedMotion ? { duration: 0.2 } : { delay: 1, duration: 0.5 }}
      >
        {/* Memory dots */}
        <div className="flex gap-0.5">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: i < memoryStrength ? colors.coral : colors.softShadow,
                opacity: i < memoryStrength ? 0.8 : 0.3,
              }}
              initial={prefersReducedMotion ? { scale: 1 } : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={prefersReducedMotion ? {} : { delay: 1.2 + i * 0.1, type: "spring" }}
            />
          ))}
        </div>

        {/* Memory phrase */}
        {memoryPhrase && (
          <motion.span
            className="text-xs font-light italic"
            style={{ color: colors.earth, opacity: 0.5 }}
            initial={prefersReducedMotion ? { opacity: 0.5 } : { opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={prefersReducedMotion ? {} : { delay: 2 }}
          >
            {memoryPhrase}
          </motion.span>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// Memoized export to prevent unnecessary re-renders
export const MemoryIndicator = memo(MemoryIndicatorComponent);
