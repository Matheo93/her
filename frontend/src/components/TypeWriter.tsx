"use client";

/**
 * TypeWriter Components - Sprint 788
 *
 * Text animation effects:
 * - Typewriter effect
 * - Text reveal
 * - Scramble text
 * - Gradient text
 * - Text morphing
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface TypeWriterProps {
  text: string | string[];
  speed?: number;
  deleteSpeed?: number;
  delay?: number;
  loop?: boolean;
  cursor?: boolean;
  cursorChar?: string;
  onComplete?: () => void;
  onTypeStart?: (text: string) => void;
  className?: string;
}

/**
 * TypeWriter Effect
 */
export const TypeWriter = memo(function TypeWriter({
  text,
  speed = 50,
  deleteSpeed = 30,
  delay = 1500,
  loop = false,
  cursor = true,
  cursorChar = "|",
  onComplete,
  onTypeStart,
  className = "",
}: TypeWriterProps) {
  const { colors } = useTheme();
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [textIndex, setTextIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const texts = Array.isArray(text) ? text : [text];
  const currentText = texts[textIndex];

  useEffect(() => {
    if (isComplete && !loop) return;

    let timeout: ReturnType<typeof setTimeout>;

    if (isDeleting) {
      if (displayText.length > 0) {
        timeout = setTimeout(() => {
          setDisplayText((prev) => prev.slice(0, -1));
        }, deleteSpeed);
      } else {
        setIsDeleting(false);
        setTextIndex((prev) => (prev + 1) % texts.length);
      }
    } else {
      if (displayText.length < currentText.length) {
        if (displayText.length === 0) {
          onTypeStart?.(currentText);
        }
        timeout = setTimeout(() => {
          setDisplayText(currentText.slice(0, displayText.length + 1));
        }, speed);
      } else {
        // Text fully typed
        if (texts.length > 1 || loop) {
          timeout = setTimeout(() => {
            setIsDeleting(true);
          }, delay);
        } else {
          setIsComplete(true);
          onComplete?.();
        }
      }
    }

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, currentText, texts, speed, deleteSpeed, delay, loop, isComplete, onTypeStart, onComplete]);

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

interface TextRevealProps {
  text: string;
  delay?: number;
  stagger?: number;
  animation?: "fade" | "slide" | "scale" | "blur";
  trigger?: boolean;
  className?: string;
}

/**
 * Text Reveal Animation
 */
export const TextReveal = memo(function TextReveal({
  text,
  delay = 0,
  stagger = 0.03,
  animation = "fade",
  trigger = true,
  className = "",
}: TextRevealProps) {
  const { colors } = useTheme();

  const words = text.split(" ");

  const animations = {
    fade: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
    },
    slide: {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
    },
    scale: {
      initial: { opacity: 0, scale: 0.8 },
      animate: { opacity: 1, scale: 1 },
    },
    blur: {
      initial: { opacity: 0, filter: "blur(10px)" },
      animate: { opacity: 1, filter: "blur(0px)" },
    },
  };

  const anim = animations[animation];

  return (
    <span className={className} style={{ color: colors.textPrimary }}>
      {words.map((word, wordIndex) => (
        <span key={wordIndex} className="inline-block">
          {word.split("").map((char, charIndex) => (
            <motion.span
              key={charIndex}
              className="inline-block"
              initial={anim.initial}
              animate={trigger ? anim.animate : anim.initial}
              transition={{
                duration: 0.3,
                delay: delay + (wordIndex * word.length + charIndex) * stagger,
              }}
            >
              {char}
            </motion.span>
          ))}
          {wordIndex < words.length - 1 && "\u00A0"}
        </span>
      ))}
    </span>
  );
});

interface ScrambleTextProps {
  text: string;
  duration?: number;
  characters?: string;
  trigger?: boolean;
  onComplete?: () => void;
  className?: string;
}

/**
 * Scramble Text Effect
 */
export const ScrambleText = memo(function ScrambleText({
  text,
  duration = 1000,
  characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()",
  trigger = true,
  onComplete,
  className = "",
}: ScrambleTextProps) {
  const { colors } = useTheme();
  const [displayText, setDisplayText] = useState(text);
  const frameRef = useRef<number>();
  const startTimeRef = useRef<number>();

  useEffect(() => {
    if (!trigger) {
      setDisplayText(text);
      return;
    }

    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - (startTimeRef.current || 0);
      const progress = Math.min(elapsed / duration, 1);

      const result = text
        .split("")
        .map((char, index) => {
          if (char === " ") return " ";

          const charProgress = progress * text.length;
          if (index < charProgress) {
            return text[index];
          }

          return characters[Math.floor(Math.random() * characters.length)];
        })
        .join("");

      setDisplayText(result);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [text, duration, characters, trigger, onComplete]);

  return (
    <span className={"font-mono " + className} style={{ color: colors.textPrimary }}>
      {displayText}
    </span>
  );
});

interface GradientTextProps {
  text: string;
  from?: string;
  via?: string;
  to?: string;
  animate?: boolean;
  direction?: "horizontal" | "vertical" | "diagonal";
  className?: string;
}

/**
 * Gradient Text
 */
export const GradientText = memo(function GradientText({
  text,
  from,
  via,
  to,
  animate = false,
  direction = "horizontal",
  className = "",
}: GradientTextProps) {
  const { colors } = useTheme();

  const gradientFrom = from || colors.coral;
  const gradientTo = to || "#8b5cf6";
  const gradientVia = via;

  const directions = {
    horizontal: "to right",
    vertical: "to bottom",
    diagonal: "to bottom right",
  };

  const gradientColors = gradientVia
    ? gradientFrom + ", " + gradientVia + ", " + gradientTo
    : gradientFrom + ", " + gradientTo;

  const gradient = "linear-gradient(" + directions[direction] + ", " + gradientColors + ")";

  return (
    <motion.span
      className={"inline-block " + className}
      style={{
        background: gradient,
        backgroundSize: animate ? "200% 200%" : "100% 100%",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
      animate={
        animate
          ? {
              backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
            }
          : undefined
      }
      transition={
        animate
          ? {
              duration: 3,
              repeat: Infinity,
              ease: "linear",
            }
          : undefined
      }
    >
      {text}
    </motion.span>
  );
});

interface TextMorphProps {
  texts: string[];
  interval?: number;
  className?: string;
}

/**
 * Text Morphing Animation
 */
export const TextMorph = memo(function TextMorph({
  texts,
  interval = 3000,
  className = "",
}: TextMorphProps) {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % texts.length);
    }, interval);

    return () => clearInterval(timer);
  }, [texts.length, interval]);

  return (
    <div className={"relative " + className}>
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -20, filter: "blur(8px)" }}
          transition={{ duration: 0.5 }}
          style={{ color: colors.textPrimary }}
        >
          {texts[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
});

interface CountUpTextProps {
  from?: number;
  to: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  separator?: string;
  onComplete?: () => void;
  className?: string;
}

/**
 * Count Up Animation
 */
export const CountUpText = memo(function CountUpText({
  from = 0,
  to,
  duration = 2000,
  decimals = 0,
  prefix = "",
  suffix = "",
  separator = ",",
  onComplete,
  className = "",
}: CountUpTextProps) {
  const { colors } = useTheme();
  const [value, setValue] = useState(from);

  useEffect(() => {
    const startTime = performance.now();
    const diff = to - from;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + diff * eased;

      setValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };

    requestAnimationFrame(animate);
  }, [from, to, duration, onComplete]);

  const formatNumber = (num: number): string => {
    const fixed = num.toFixed(decimals);
    const parts = fixed.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
    return parts.join(".");
  };

  return (
    <span className={className} style={{ color: colors.textPrimary }}>
      {prefix}
      {formatNumber(value)}
      {suffix}
    </span>
  );
});

interface HighlightTextProps {
  text: string;
  highlight: string | string[];
  highlightStyle?: "background" | "underline" | "bold" | "color";
  color?: string;
  caseSensitive?: boolean;
  className?: string;
}

/**
 * Text with Highlighted Parts
 */
export const HighlightText = memo(function HighlightText({
  text,
  highlight,
  highlightStyle = "background",
  color,
  caseSensitive = false,
  className = "",
}: HighlightTextProps) {
  const { colors } = useTheme();
  const highlightColor = color || colors.coral;

  const highlights = Array.isArray(highlight) ? highlight : [highlight];

  const getHighlightedText = (): ReactNode[] => {
    let result: ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      let earliestMatch: { index: number; length: number; match: string } | null = null;

      for (const h of highlights) {
        const searchText = caseSensitive ? remaining : remaining.toLowerCase();
        const searchHighlight = caseSensitive ? h : h.toLowerCase();
        const index = searchText.indexOf(searchHighlight);

        if (index !== -1 && (!earliestMatch || index < earliestMatch.index)) {
          earliestMatch = { index, length: h.length, match: remaining.slice(index, index + h.length) };
        }
      }

      if (earliestMatch) {
        // Add text before match
        if (earliestMatch.index > 0) {
          result.push(
            <span key={key++}>{remaining.slice(0, earliestMatch.index)}</span>
          );
        }

        // Add highlighted text
        const styles: Record<string, any> = {};
        let highlightClass = "";

        switch (highlightStyle) {
          case "background":
            styles.backgroundColor = highlightColor + "30";
            styles.padding = "0 2px";
            styles.borderRadius = "2px";
            break;
          case "underline":
            styles.textDecoration = "underline";
            styles.textDecorationColor = highlightColor;
            styles.textUnderlineOffset = "2px";
            break;
          case "bold":
            highlightClass = "font-bold";
            break;
          case "color":
            styles.color = highlightColor;
            break;
        }

        result.push(
          <span key={key++} className={highlightClass} style={styles}>
            {earliestMatch.match}
          </span>
        );

        remaining = remaining.slice(earliestMatch.index + earliestMatch.length);
      } else {
        result.push(<span key={key++}>{remaining}</span>);
        break;
      }
    }

    return result;
  };

  return (
    <span className={className} style={{ color: colors.textPrimary }}>
      {getHighlightedText()}
    </span>
  );
});

export default TypeWriter;
