"use client";

/**
 * Typewriter Components - Sprint 704
 *
 * Text animation effects:
 * - Character-by-character typing
 * - Delete and retype
 * - Multiple strings rotation
 * - Cursor animation
 * - HER-themed styling
 */

import React, { memo, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface TypewriterProps {
  text: string | string[];
  speed?: number;
  deleteSpeed?: number;
  delay?: number;
  pauseTime?: number;
  loop?: boolean;
  showCursor?: boolean;
  cursorChar?: string;
  cursorBlinkSpeed?: number;
  onComplete?: () => void;
  onStringComplete?: (index: number) => void;
  className?: string;
}

/**
 * Typewriter Component
 */
export const Typewriter = memo(function Typewriter({
  text,
  speed = 50,
  deleteSpeed = 30,
  delay = 0,
  pauseTime = 1500,
  loop = false,
  showCursor = true,
  cursorChar = "|",
  cursorBlinkSpeed = 500,
  onComplete,
  onStringComplete,
  className = "",
}: TypewriterProps) {
  const { colors } = useTheme();
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [stringIndex, setStringIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const strings = Array.isArray(text) ? text : [text];

  useEffect(() => {
    if (isComplete && !loop) return;

    const currentString = strings[stringIndex];

    const handleTyping = () => {
      if (!isDeleting) {
        // Typing
        if (displayText.length < currentString.length) {
          setDisplayText(currentString.slice(0, displayText.length + 1));
          timeoutRef.current = setTimeout(handleTyping, speed);
        } else {
          // Finished typing current string
          onStringComplete?.(stringIndex);

          if (strings.length > 1 || loop) {
            // Wait before deleting
            timeoutRef.current = setTimeout(() => {
              setIsDeleting(true);
              handleTyping();
            }, pauseTime);
          } else {
            setIsComplete(true);
            onComplete?.();
          }
        }
      } else {
        // Deleting
        if (displayText.length > 0) {
          setDisplayText(displayText.slice(0, -1));
          timeoutRef.current = setTimeout(handleTyping, deleteSpeed);
        } else {
          // Finished deleting
          setIsDeleting(false);
          const nextIndex = (stringIndex + 1) % strings.length;
          setStringIndex(nextIndex);

          if (nextIndex === 0 && !loop) {
            setIsComplete(true);
            onComplete?.();
          }
        }
      }
    };

    // Initial delay
    if (displayText.length === 0 && stringIndex === 0 && delay > 0) {
      timeoutRef.current = setTimeout(handleTyping, delay);
    } else {
      timeoutRef.current = setTimeout(handleTyping, isDeleting ? deleteSpeed : speed);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [displayText, isDeleting, stringIndex, strings, speed, deleteSpeed, pauseTime, delay, loop, onComplete, onStringComplete, isComplete]);

  return (
    <span className={className} style={{ color: colors.textPrimary }}>
      {displayText}
      {showCursor && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{
            duration: cursorBlinkSpeed / 1000,
            repeat: Infinity,
            ease: "steps(1)",
          }}
          style={{ color: colors.coral }}
        >
          {cursorChar}
        </motion.span>
      )}
    </span>
  );
});

interface TypewriterTextProps {
  children: string;
  as?: "p" | "span" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  speed?: number;
  delay?: number;
  showCursor?: boolean;
  onComplete?: () => void;
  className?: string;
}

/**
 * Typewriter with semantic element wrapper
 */
export const TypewriterText = memo(function TypewriterText({
  children,
  as: Tag = "span",
  speed = 50,
  delay = 0,
  showCursor = true,
  onComplete,
  className = "",
}: TypewriterTextProps) {
  return (
    <Tag className={className}>
      <Typewriter
        text={children}
        speed={speed}
        delay={delay}
        showCursor={showCursor}
        onComplete={onComplete}
      />
    </Tag>
  );
});

interface RotatingTextProps {
  texts: string[];
  speed?: number;
  deleteSpeed?: number;
  pauseTime?: number;
  prefix?: string;
  suffix?: string;
  showCursor?: boolean;
  className?: string;
}

/**
 * Rotating Text with prefix/suffix
 */
export const RotatingText = memo(function RotatingText({
  texts,
  speed = 50,
  deleteSpeed = 30,
  pauseTime = 2000,
  prefix = "",
  suffix = "",
  showCursor = true,
  className = "",
}: RotatingTextProps) {
  const { colors } = useTheme();

  return (
    <span className={className}>
      {prefix && (
        <span style={{ color: colors.textPrimary }}>{prefix}</span>
      )}
      <Typewriter
        text={texts}
        speed={speed}
        deleteSpeed={deleteSpeed}
        pauseTime={pauseTime}
        loop
        showCursor={showCursor}
      />
      {suffix && (
        <span style={{ color: colors.textPrimary }}>{suffix}</span>
      )}
    </span>
  );
});

interface RevealTextProps {
  text: string;
  trigger?: boolean;
  speed?: number;
  delay?: number;
  stagger?: number;
  className?: string;
}

/**
 * Reveal text word by word
 */
export const RevealText = memo(function RevealText({
  text,
  trigger = true,
  speed = 100,
  delay = 0,
  stagger = 50,
  className = "",
}: RevealTextProps) {
  const { colors } = useTheme();
  const words = text.split(" ");

  return (
    <span className={className}>
      <AnimatePresence>
        {trigger &&
          words.map((word, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: speed / 1000,
                delay: (delay + i * stagger) / 1000,
              }}
              style={{
                display: "inline-block",
                marginRight: "0.25em",
                color: colors.textPrimary,
              }}
            >
              {word}
            </motion.span>
          ))}
      </AnimatePresence>
    </span>
  );
});

interface CharacterRevealProps {
  text: string;
  trigger?: boolean;
  speed?: number;
  stagger?: number;
  className?: string;
}

/**
 * Reveal text character by character with animation
 */
export const CharacterReveal = memo(function CharacterReveal({
  text,
  trigger = true,
  speed = 50,
  stagger = 20,
  className = "",
}: CharacterRevealProps) {
  const { colors } = useTheme();
  const characters = text.split("");

  return (
    <span className={className}>
      <AnimatePresence>
        {trigger &&
          characters.map((char, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: speed / 1000,
                delay: (i * stagger) / 1000,
                type: "spring",
                stiffness: 200,
              }}
              style={{
                display: "inline-block",
                color: colors.textPrimary,
                whiteSpace: char === " " ? "pre" : "normal",
              }}
            >
              {char === " " ? "\u00A0" : char}
            </motion.span>
          ))}
      </AnimatePresence>
    </span>
  );
});

interface GlitchTextProps {
  text: string;
  isActive?: boolean;
  intensity?: number;
  className?: string;
}

/**
 * Glitch text effect
 */
export const GlitchText = memo(function GlitchText({
  text,
  isActive = true,
  intensity = 3,
  className = "",
}: GlitchTextProps) {
  const { colors } = useTheme();
  const [displayText, setDisplayText] = useState(text);

  useEffect(() => {
    if (!isActive) {
      setDisplayText(text);
      return;
    }

    const glitchChars = "!@#$%^&*()_+-=[]{}|;':\",./<>?";

    const interval = setInterval(() => {
      const chars = text.split("");
      const glitchCount = Math.floor(Math.random() * intensity) + 1;

      for (let i = 0; i < glitchCount; i++) {
        const pos = Math.floor(Math.random() * chars.length);
        chars[pos] = glitchChars[Math.floor(Math.random() * glitchChars.length)];
      }

      setDisplayText(chars.join(""));

      // Reset after short time
      setTimeout(() => setDisplayText(text), 50);
    }, 100);

    return () => clearInterval(interval);
  }, [text, isActive, intensity]);

  return (
    <span
      className={className}
      style={{
        color: colors.textPrimary,
        fontFamily: "monospace",
      }}
    >
      {displayText}
    </span>
  );
});

interface ScrambleTextProps {
  text: string;
  trigger?: boolean;
  speed?: number;
  className?: string;
}

/**
 * Scramble text reveal
 */
export const ScrambleText = memo(function ScrambleText({
  text,
  trigger = true,
  speed = 50,
  className = "",
}: ScrambleTextProps) {
  const { colors } = useTheme();
  const [displayText, setDisplayText] = useState("");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  useEffect(() => {
    if (!trigger) {
      setDisplayText("");
      return;
    }

    let currentIndex = 0;
    let iterations = 0;

    const interval = setInterval(() => {
      setDisplayText((prev) => {
        return text
          .split("")
          .map((char, i) => {
            if (i < currentIndex) {
              return text[i];
            }
            if (char === " ") return " ";
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join("");
      });

      iterations++;

      if (iterations % 3 === 0 && currentIndex < text.length) {
        currentIndex++;
      }

      if (currentIndex >= text.length) {
        clearInterval(interval);
        setDisplayText(text);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, trigger, speed, chars]);

  return (
    <span
      className={className}
      style={{
        color: colors.textPrimary,
        fontFamily: "monospace",
      }}
    >
      {displayText}
    </span>
  );
});

// Custom hook for typewriter state
export function useTypewriter(options: {
  text: string | string[];
  speed?: number;
  loop?: boolean;
  autoStart?: boolean;
}) {
  const [isTyping, setIsTyping] = useState(options.autoStart ?? true);
  const [currentText, setCurrentText] = useState("");

  const start = useCallback(() => setIsTyping(true), []);
  const stop = useCallback(() => setIsTyping(false), []);
  const reset = useCallback(() => {
    setCurrentText("");
    setIsTyping(true);
  }, []);

  return {
    isTyping,
    currentText,
    start,
    stop,
    reset,
    Component: isTyping ? (
      <Typewriter
        text={options.text}
        speed={options.speed}
        loop={options.loop}
      />
    ) : null,
  };
}

export default Typewriter;
