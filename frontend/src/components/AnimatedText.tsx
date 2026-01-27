"use client";

/**
 * Animated Text Components - Sprint 800
 *
 * Text animation effects:
 * - Split text animation
 * - Letter by letter
 * - Word by word
 * - Line by line
 * - Bounce text
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import { motion, Variants, useInView, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface SplitTextProps {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  animation?: "fade" | "slide" | "scale" | "rotate" | "blur";
  trigger?: boolean;
  once?: boolean;
}

/**
 * Split Text - Animate text letter by letter
 */
export const SplitText = memo(function SplitText({
  text,
  className = "",
  delay = 0,
  stagger = 0.03,
  animation = "fade",
  trigger = true,
  once = true,
}: SplitTextProps) {
  const { colors } = useTheme();
  const ref = React.useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once });

  const shouldAnimate = trigger && isInView;

  const variants: Record<string, Variants> = {
    fade: {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
    },
    slide: {
      hidden: { opacity: 0, y: 20 },
      visible: { opacity: 1, y: 0 },
    },
    scale: {
      hidden: { opacity: 0, scale: 0 },
      visible: { opacity: 1, scale: 1 },
    },
    rotate: {
      hidden: { opacity: 0, rotate: -90 },
      visible: { opacity: 1, rotate: 0 },
    },
    blur: {
      hidden: { opacity: 0, filter: "blur(10px)" },
      visible: { opacity: 1, filter: "blur(0px)" },
    },
  };

  const characters = useMemo(() => text.split(""), [text]);

  return (
    <span ref={ref} className={className} style={{ color: colors.textPrimary }}>
      {characters.map((char, index) => (
        <motion.span
          key={index}
          className="inline-block"
          style={{ whiteSpace: char === " " ? "pre" : undefined }}
          variants={variants[animation]}
          initial="hidden"
          animate={shouldAnimate ? "visible" : "hidden"}
          transition={{
            duration: 0.3,
            delay: delay + index * stagger,
          }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
});

interface WordByWordProps {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  animation?: "fade" | "slide" | "scale" | "wave";
  trigger?: boolean;
  once?: boolean;
}

/**
 * Word By Word - Animate text word by word
 */
export const WordByWord = memo(function WordByWord({
  text,
  className = "",
  delay = 0,
  stagger = 0.1,
  animation = "slide",
  trigger = true,
  once = true,
}: WordByWordProps) {
  const { colors } = useTheme();
  const ref = React.useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once });

  const shouldAnimate = trigger && isInView;

  const variants: Record<string, Variants> = {
    fade: {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
    },
    slide: {
      hidden: { opacity: 0, y: 30 },
      visible: { opacity: 1, y: 0 },
    },
    scale: {
      hidden: { opacity: 0, scale: 0.5 },
      visible: { opacity: 1, scale: 1 },
    },
    wave: {
      hidden: { opacity: 0, y: 30, rotate: 10 },
      visible: { opacity: 1, y: 0, rotate: 0 },
    },
  };

  const words = useMemo(() => text.split(" "), [text]);

  return (
    <span ref={ref} className={className} style={{ color: colors.textPrimary }}>
      {words.map((word, index) => (
        <motion.span
          key={index}
          className="inline-block"
          variants={variants[animation]}
          initial="hidden"
          animate={shouldAnimate ? "visible" : "hidden"}
          transition={{
            duration: 0.4,
            delay: delay + index * stagger,
            ease: "easeOut",
          }}
        >
          {word}
          {index < words.length - 1 && "\u00A0"}
        </motion.span>
      ))}
    </span>
  );
});

interface LineByLineProps {
  lines: string[];
  className?: string;
  lineClassName?: string;
  delay?: number;
  stagger?: number;
  animation?: "fade" | "slide" | "slideLeft" | "slideRight";
  trigger?: boolean;
  once?: boolean;
}

/**
 * Line By Line - Animate text line by line
 */
export const LineByLine = memo(function LineByLine({
  lines,
  className = "",
  lineClassName = "",
  delay = 0,
  stagger = 0.2,
  animation = "slide",
  trigger = true,
  once = true,
}: LineByLineProps) {
  const { colors } = useTheme();
  const ref = React.useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once });

  const shouldAnimate = trigger && isInView;

  const variants: Record<string, Variants> = {
    fade: {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
    },
    slide: {
      hidden: { opacity: 0, y: 40 },
      visible: { opacity: 1, y: 0 },
    },
    slideLeft: {
      hidden: { opacity: 0, x: -40 },
      visible: { opacity: 1, x: 0 },
    },
    slideRight: {
      hidden: { opacity: 0, x: 40 },
      visible: { opacity: 1, x: 0 },
    },
  };

  return (
    <div ref={ref} className={className}>
      {lines.map((line, index) => (
        <motion.div
          key={index}
          className={lineClassName}
          style={{ color: colors.textPrimary }}
          variants={variants[animation]}
          initial="hidden"
          animate={shouldAnimate ? "visible" : "hidden"}
          transition={{
            duration: 0.5,
            delay: delay + index * stagger,
            ease: "easeOut",
          }}
        >
          {line}
        </motion.div>
      ))}
    </div>
  );
});

interface BounceTextProps {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  bounceHeight?: number;
  trigger?: boolean;
}

/**
 * Bounce Text - Letters bounce up and down
 */
export const BounceText = memo(function BounceText({
  text,
  className = "",
  delay = 0,
  stagger = 0.1,
  bounceHeight = -20,
  trigger = true,
}: BounceTextProps) {
  const { colors } = useTheme();

  const characters = useMemo(() => text.split(""), [text]);

  return (
    <span className={className} style={{ color: colors.textPrimary }}>
      {characters.map((char, index) => (
        <motion.span
          key={index}
          className="inline-block"
          style={{ whiteSpace: char === " " ? "pre" : undefined }}
          animate={
            trigger
              ? {
                  y: [0, bounceHeight, 0],
                }
              : { y: 0 }
          }
          transition={{
            duration: 0.6,
            delay: delay + index * stagger,
            repeat: Infinity,
            repeatDelay: text.length * stagger + 0.5,
          }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
});

interface WavyTextProps {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  amplitude?: number;
  speed?: number;
}

/**
 * Wavy Text - Continuous wave animation
 */
export const WavyText = memo(function WavyText({
  text,
  className = "",
  delay = 0,
  stagger = 0.08,
  amplitude = 10,
  speed = 0.5,
}: WavyTextProps) {
  const { colors } = useTheme();

  const characters = useMemo(() => text.split(""), [text]);

  return (
    <span className={className} style={{ color: colors.textPrimary }}>
      {characters.map((char, index) => (
        <motion.span
          key={index}
          className="inline-block"
          style={{ whiteSpace: char === " " ? "pre" : undefined }}
          animate={{
            y: [0, -amplitude, 0, amplitude, 0],
          }}
          transition={{
            duration: 1 / speed,
            delay: delay + index * stagger,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
});

interface GlitchTextProps {
  text: string;
  className?: string;
  glitchColor1?: string;
  glitchColor2?: string;
  active?: boolean;
}

/**
 * Glitch Text - Digital glitch effect
 */
export const GlitchText = memo(function GlitchText({
  text,
  className = "",
  glitchColor1,
  glitchColor2,
  active = true,
}: GlitchTextProps) {
  const { colors } = useTheme();
  const color1 = glitchColor1 || colors.coral;
  const color2 = glitchColor2 || "#00ffff";

  return (
    <div className={"relative inline-block " + className}>
      {/* Main text */}
      <span className="relative z-10" style={{ color: colors.textPrimary }}>
        {text}
      </span>

      {active && (
        <>
          {/* Glitch layer 1 */}
          <motion.span
            className="absolute top-0 left-0 z-0"
            style={{ color: color1, clipPath: "inset(0 0 0 0)" }}
            animate={{
              x: [-2, 2, -2, 0, 2],
              clipPath: [
                "inset(0 0 85% 0)",
                "inset(15% 0 70% 0)",
                "inset(30% 0 55% 0)",
                "inset(45% 0 40% 0)",
                "inset(60% 0 25% 0)",
              ],
            }}
            transition={{
              duration: 0.3,
              repeat: Infinity,
              repeatDelay: 2,
            }}
          >
            {text}
          </motion.span>

          {/* Glitch layer 2 */}
          <motion.span
            className="absolute top-0 left-0 z-0"
            style={{ color: color2, clipPath: "inset(0 0 0 0)" }}
            animate={{
              x: [2, -2, 2, 0, -2],
              clipPath: [
                "inset(60% 0 25% 0)",
                "inset(45% 0 40% 0)",
                "inset(30% 0 55% 0)",
                "inset(15% 0 70% 0)",
                "inset(0 0 85% 0)",
              ],
            }}
            transition={{
              duration: 0.3,
              repeat: Infinity,
              repeatDelay: 2,
              delay: 0.1,
            }}
          >
            {text}
          </motion.span>
        </>
      )}
    </div>
  );
});

interface ShimmerTextProps {
  text: string;
  className?: string;
  shimmerColor?: string;
  duration?: number;
}

/**
 * Shimmer Text - Shimmering highlight effect
 */
export const ShimmerText = memo(function ShimmerText({
  text,
  className = "",
  shimmerColor,
  duration = 2,
}: ShimmerTextProps) {
  const { colors } = useTheme();
  const color = shimmerColor || colors.coral;

  return (
    <motion.span
      className={"relative inline-block overflow-hidden " + className}
      style={{ color: colors.textPrimary }}
    >
      {text}
      <motion.span
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent 0%, " + color + "40 50%, transparent 100%)",
          backgroundSize: "200% 100%",
        }}
        animate={{
          backgroundPosition: ["200% 0%", "-200% 0%"],
        }}
        transition={{
          duration,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </motion.span>
  );
});

interface RotatingTextProps {
  texts: string[];
  className?: string;
  interval?: number;
  animation?: "fade" | "slide" | "flip";
}

/**
 * Rotating Text - Cycle through multiple texts
 */
export const RotatingText = memo(function RotatingText({
  texts,
  className = "",
  interval = 3000,
  animation = "fade",
}: RotatingTextProps) {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % texts.length);
    }, interval);

    return () => clearInterval(timer);
  }, [texts.length, interval]);

  const variants: Record<string, Variants> = {
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
    slide: {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -20 },
    },
    flip: {
      initial: { opacity: 0, rotateX: 90 },
      animate: { opacity: 1, rotateX: 0 },
      exit: { opacity: 0, rotateX: -90 },
    },
  };

  return (
    <div
      className={"relative inline-block " + className}
      style={{ color: colors.textPrimary, perspective: animation === "flip" ? "1000px" : undefined }}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          variants={variants[animation]}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.3 }}
          style={{ display: "inline-block" }}
        >
          {texts[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
});

interface TypingTextProps {
  text: string;
  className?: string;
  speed?: number;
  cursor?: boolean;
  cursorChar?: string;
  onComplete?: () => void;
}

/**
 * Typing Text - Simple typing animation
 */
export const TypingText = memo(function TypingText({
  text,
  className = "",
  speed = 50,
  cursor = true,
  cursorChar = "|",
  onComplete,
}: TypingTextProps) {
  const { colors } = useTheme();
  const [displayText, setDisplayText] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    setDisplayText("");
    setIsComplete(false);

    let index = 0;
    const timer = setInterval(() => {
      if (index < text.length) {
        setDisplayText(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(timer);
        setIsComplete(true);
        onComplete?.();
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed, onComplete]);

  return (
    <span className={className} style={{ color: colors.textPrimary }}>
      {displayText}
      {cursor && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
          style={{ color: colors.coral }}
        >
          {cursorChar}
        </motion.span>
      )}
    </span>
  );
});

interface HighlightOnScrollProps {
  children: ReactNode;
  highlightColor?: string;
  className?: string;
}

/**
 * Highlight On Scroll - Highlight text when in view
 */
export const HighlightOnScroll = memo(function HighlightOnScroll({
  children,
  highlightColor,
  className = "",
}: HighlightOnScrollProps) {
  const { colors } = useTheme();
  const ref = React.useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-20%" });
  const color = highlightColor || colors.coral;

  return (
    <span ref={ref} className={"relative inline-block " + className}>
      <span className="relative z-10">{children}</span>
      <motion.span
        className="absolute bottom-0 left-0 h-3 w-full -z-10"
        style={{ backgroundColor: color + "40" }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: isInView ? 1 : 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        transformOrigin="left"
      />
    </span>
  );
});

export default SplitText;
