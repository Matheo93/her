"use client";

/**
 * ProactivePresenceIndicator - Visual cues for EVA reaching out
 *
 * Shows subtle visual feedback when EVA wants to connect proactively.
 * This should feel inviting, not intrusive.
 *
 * "Proactive engagement should feel like someone thinking of you,
 * not like a notification demanding attention."
 */

import { motion, AnimatePresence } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";
import { type ProactivePresenceState, type ProactiveType } from "@/hooks/useProactivePresence";

interface ProactivePresenceIndicatorProps {
  // Proactive state from the hook
  presence: ProactivePresenceState;

  // Type of indicator
  type?: "message" | "glow" | "invitation";

  // Callback when message is dismissed
  onDismiss?: () => void;

  className?: string;
}

export function ProactivePresenceIndicator({
  presence,
  type = "glow",
  onDismiss,
  className = "",
}: ProactivePresenceIndicatorProps) {
  if (type === "message") {
    return (
      <ProactiveMessage
        presence={presence}
        onDismiss={onDismiss}
        className={className}
      />
    );
  }

  if (type === "invitation") {
    return (
      <ProactiveInvitation
        presence={presence}
        className={className}
      />
    );
  }

  return <ProactiveGlow presence={presence} className={className} />;
}

/**
 * ProactiveMessage - The actual message EVA wants to say
 */
function ProactiveMessage({
  presence,
  onDismiss,
  className,
}: {
  presence: ProactivePresenceState;
  onDismiss?: () => void;
  className: string;
}) {
  const { currentAction, shouldInitiate } = presence;

  // Only show if there's a non-visual-only message
  if (!shouldInitiate || !currentAction?.message) {
    return null;
  }

  // Style based on urgency
  const urgencyStyles = {
    soft: {
      opacity: 0.7,
      scale: 0.98,
    },
    gentle: {
      opacity: 0.85,
      scale: 1,
    },
    warm: {
      opacity: 1,
      scale: 1,
    },
  };

  const style = urgencyStyles[currentAction.urgency];

  return (
    <AnimatePresence>
      <motion.div
        className={`text-center ${className}`}
        initial={{ opacity: 0, y: 15, scale: 0.95 }}
        animate={{
          opacity: style.opacity,
          y: 0,
          scale: style.scale,
        }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={HER_SPRINGS.gentle}
      >
        {/* Message container */}
        <motion.div
          className="inline-block px-6 py-3 rounded-2xl"
          style={{
            backgroundColor: `${HER_COLORS.cream}90`,
            boxShadow: `0 4px 20px ${HER_COLORS.softShadow}30`,
          }}
          animate={{
            boxShadow: [
              `0 4px 20px ${HER_COLORS.softShadow}30`,
              `0 6px 25px ${HER_COLORS.coral}20`,
              `0 4px 20px ${HER_COLORS.softShadow}30`,
            ],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <p
            className="text-base font-light"
            style={{ color: HER_COLORS.earth }}
          >
            {currentAction.message}
          </p>
        </motion.div>

        {/* Dismiss hint (very subtle) */}
        {currentAction.canDismiss && onDismiss && (
          <motion.button
            onClick={onDismiss}
            className="mt-2 text-xs"
            style={{ color: HER_COLORS.softShadow, opacity: 0.4 }}
            whileHover={{ opacity: 0.7 }}
            whileTap={{ scale: 0.95 }}
          >
            ✕
          </motion.button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * ProactiveGlow - Subtle visual cue that EVA wants to connect
 */
function ProactiveGlow({
  presence,
  className,
}: {
  presence: ProactivePresenceState;
  className: string;
}) {
  const { visualHints, currentAction } = presence;

  // Don't show if nothing to show
  if (!visualHints.showReadyGlow && !visualHints.showWarmth && !visualHints.showCare) {
    return null;
  }

  // Determine glow color based on type
  const getGlowColor = () => {
    if (visualHints.showCare) return HER_COLORS.blush;
    if (visualHints.showWarmth) return HER_COLORS.coral;
    return HER_COLORS.cream;
  };

  const glowColor = getGlowColor();
  const intensity = visualHints.showCare ? 0.4 : visualHints.showWarmth ? 0.3 : 0.2;

  return (
    <AnimatePresence>
      <motion.div
        className={`absolute inset-0 pointer-events-none rounded-full ${className}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.5 }}
      >
        {/* Outer glow - "reaching out" effect */}
        <motion.div
          className="absolute -inset-8 rounded-full"
          style={{
            background: `radial-gradient(circle, ${glowColor}${Math.round(intensity * 100).toString(16).padStart(2, '0')} 0%, transparent 70%)`,
          }}
          animate={{
            scale: [1, 1.05, 1],
            opacity: [intensity, intensity + 0.1, intensity],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Inner warmth - "I'm here" feeling */}
        {visualHints.showWarmth && (
          <motion.div
            className="absolute -inset-4 rounded-full"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral}15 0%, transparent 60%)`,
            }}
            animate={{
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}

        {/* Care indicator - soft pulse when offering comfort */}
        {visualHints.showCare && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: `inset 0 0 30px ${HER_COLORS.blush}20`,
            }}
            animate={{
              boxShadow: [
                `inset 0 0 30px ${HER_COLORS.blush}20`,
                `inset 0 0 40px ${HER_COLORS.blush}30`,
                `inset 0 0 30px ${HER_COLORS.blush}20`,
              ],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * ProactiveInvitation - Subtle invitation to speak
 */
function ProactiveInvitation({
  presence,
  className,
}: {
  presence: ProactivePresenceState;
  className: string;
}) {
  const { visualHints, awareness } = presence;

  // Only show when there's an invitation to give
  if (!visualHints.showInvitation) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        className={`flex flex-col items-center ${className}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 5 }}
        transition={HER_SPRINGS.gentle}
      >
        {/* Breathing dots - "I'm here, ready when you are" */}
        <motion.div
          className="flex gap-1"
          animate={{
            y: [0, -2, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1 h-1 rounded-full"
              style={{ backgroundColor: HER_COLORS.coral }}
              animate={{
                opacity: [0.3, 0.6, 0.3],
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                delay: i * 0.2,
                ease: "easeInOut",
              }}
            />
          ))}
        </motion.div>

        {/* Very subtle text */}
        <motion.span
          className="mt-2 text-xs"
          style={{ color: HER_COLORS.softShadow, opacity: 0.3 }}
          animate={{
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          ...
        </motion.span>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * ReturnWelcome - Special component for welcoming user back
 */
interface ReturnWelcomeProps {
  isReturning: boolean;
  awayDuration: number;
  className?: string;
}

export function ReturnWelcome({ isReturning, awayDuration, className = "" }: ReturnWelcomeProps) {
  if (!isReturning) return null;

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return "quelques instants";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    return `${Math.floor(seconds / 3600)} heures`;
  };

  return (
    <AnimatePresence>
      <motion.div
        className={`text-center ${className}`}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -10 }}
        transition={HER_SPRINGS.gentle}
      >
        {/* Welcome glow effect */}
        <motion.div
          className="absolute -inset-10 rounded-full -z-10"
          style={{
            background: `radial-gradient(circle, ${HER_COLORS.coral}15 0%, transparent 60%)`,
          }}
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <p
          className="text-lg font-light"
          style={{ color: HER_COLORS.earth }}
        >
          Te revoilà...
        </p>

        {/* Only show away duration for longer absences */}
        {awayDuration > 300 && (
          <motion.p
            className="text-sm mt-1"
            style={{ color: HER_COLORS.softShadow, opacity: 0.6 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 0.5 }}
          >
            J'étais là, à t'attendre
          </motion.p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
