"use client";

/**
 * Custom Cursor Components - Sprint 794
 *
 * Custom cursor effects:
 * - Custom cursor follower
 * - Cursor dot
 * - Cursor trail
 * - Magnetic cursor
 * - Text cursor
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useEffect,
  useRef,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { motion, useMotionValue, useSpring, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface CursorPosition {
  x: number;
  y: number;
}

interface CursorContextType {
  cursorType: string;
  setCursorType: (type: string) => void;
  cursorText: string;
  setCursorText: (text: string) => void;
  isHovering: boolean;
  setIsHovering: (hovering: boolean) => void;
}

const CursorContext = createContext<CursorContextType | null>(null);

export function useCursor() {
  const context = useContext(CursorContext);
  if (!context) {
    throw new Error("useCursor must be used within CursorProvider");
  }
  return context;
}

interface CursorProviderProps {
  children: ReactNode;
}

/**
 * Cursor Provider - Context for cursor state
 */
export const CursorProvider = memo(function CursorProvider({
  children,
}: CursorProviderProps) {
  const [cursorType, setCursorType] = useState("default");
  const [cursorText, setCursorText] = useState("");
  const [isHovering, setIsHovering] = useState(false);

  return (
    <CursorContext.Provider
      value={{
        cursorType,
        setCursorType,
        cursorText,
        setCursorText,
        isHovering,
        setIsHovering,
      }}
    >
      {children}
    </CursorContext.Provider>
  );
});

interface CustomCursorProps {
  size?: number;
  color?: string;
  borderWidth?: number;
  mixBlendMode?: "normal" | "difference" | "exclusion" | "multiply";
  className?: string;
}

/**
 * Custom Cursor - Smooth following cursor
 */
export const CustomCursor = memo(function CustomCursor({
  size = 40,
  color,
  borderWidth = 2,
  mixBlendMode = "normal",
  className = "",
}: CustomCursorProps) {
  const { colors } = useTheme();
  const cursorColor = color || colors.coral;

  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);

  const springConfig = { damping: 25, stiffness: 300 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);

  const [isVisible, setIsVisible] = useState(false);
  const [isClicking, setIsClicking] = useState(false);

  useEffect(() => {
    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX - size / 2);
      cursorY.set(e.clientY - size / 2);
      if (!isVisible) setIsVisible(true);
    };

    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);
    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    window.addEventListener("mousemove", moveCursor);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    document.body.addEventListener("mouseleave", handleMouseLeave);
    document.body.addEventListener("mouseenter", handleMouseEnter);

    return () => {
      window.removeEventListener("mousemove", moveCursor);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.removeEventListener("mouseleave", handleMouseLeave);
      document.body.removeEventListener("mouseenter", handleMouseEnter);
    };
  }, [cursorX, cursorY, size, isVisible]);

  return (
    <motion.div
      className={"fixed top-0 left-0 pointer-events-none z-[9999] rounded-full " + className}
      style={{
        x: cursorXSpring,
        y: cursorYSpring,
        width: size,
        height: size,
        border: borderWidth + "px solid " + cursorColor,
        mixBlendMode,
        opacity: isVisible ? 1 : 0,
      }}
      animate={{
        scale: isClicking ? 0.8 : 1,
      }}
      transition={{ duration: 0.15 }}
    />
  );
});

interface CursorDotProps {
  size?: number;
  dotSize?: number;
  color?: string;
  className?: string;
}

/**
 * Cursor Dot - Dot in center with outer ring
 */
export const CursorDot = memo(function CursorDot({
  size = 40,
  dotSize = 8,
  color,
  className = "",
}: CursorDotProps) {
  const { colors } = useTheme();
  const cursorColor = color || colors.coral;

  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const dotX = useMotionValue(-100);
  const dotY = useMotionValue(-100);

  const ringSpringConfig = { damping: 20, stiffness: 200 };
  const dotSpringConfig = { damping: 50, stiffness: 500 };

  const cursorXSpring = useSpring(cursorX, ringSpringConfig);
  const cursorYSpring = useSpring(cursorY, ringSpringConfig);
  const dotXSpring = useSpring(dotX, dotSpringConfig);
  const dotYSpring = useSpring(dotY, dotSpringConfig);

  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX - size / 2);
      cursorY.set(e.clientY - size / 2);
      dotX.set(e.clientX - dotSize / 2);
      dotY.set(e.clientY - dotSize / 2);
    };

    const checkHover = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive =
        target.tagName === "A" ||
        target.tagName === "BUTTON" ||
        target.closest("a") ||
        target.closest("button") ||
        target.dataset.cursor === "pointer";
      setIsHovering(isInteractive);
    };

    window.addEventListener("mousemove", moveCursor);
    window.addEventListener("mouseover", checkHover);

    return () => {
      window.removeEventListener("mousemove", moveCursor);
      window.removeEventListener("mouseover", checkHover);
    };
  }, [cursorX, cursorY, dotX, dotY, size, dotSize]);

  return (
    <>
      {/* Outer ring */}
      <motion.div
        className={"fixed top-0 left-0 pointer-events-none z-[9999] rounded-full " + className}
        style={{
          x: cursorXSpring,
          y: cursorYSpring,
          width: size,
          height: size,
          border: "2px solid " + cursorColor,
        }}
        animate={{
          scale: isHovering ? 1.5 : 1,
          opacity: isHovering ? 0.5 : 1,
        }}
        transition={{ duration: 0.2 }}
      />
      {/* Inner dot */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] rounded-full"
        style={{
          x: dotXSpring,
          y: dotYSpring,
          width: dotSize,
          height: dotSize,
          backgroundColor: cursorColor,
        }}
        animate={{
          scale: isHovering ? 0 : 1,
        }}
        transition={{ duration: 0.2 }}
      />
    </>
  );
});

interface CursorTrailProps {
  length?: number;
  size?: number;
  color?: string;
  decay?: number;
  className?: string;
}

interface TrailPoint {
  x: number;
  y: number;
  id: number;
}

/**
 * Cursor Trail - Trail of dots following cursor
 */
export const CursorTrail = memo(function CursorTrail({
  length = 20,
  size = 10,
  color,
  decay = 0.05,
  className = "",
}: CursorTrailProps) {
  const { colors } = useTheme();
  const trailColor = color || colors.coral;
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const newPoint: TrailPoint = {
        x: e.clientX,
        y: e.clientY,
        id: nextId.current++,
      };

      setTrail((prev) => {
        const updated = [newPoint, ...prev].slice(0, length);
        return updated;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [length]);

  return (
    <>
      {trail.map((point, index) => {
        const scale = 1 - index * decay;
        const opacity = 1 - index / length;
        if (scale <= 0) return null;

        return (
          <div
            key={point.id}
            className={"fixed pointer-events-none z-[9998] rounded-full " + className}
            style={{
              left: point.x - (size * scale) / 2,
              top: point.y - (size * scale) / 2,
              width: size * scale,
              height: size * scale,
              backgroundColor: trailColor,
              opacity: opacity * 0.8,
            }}
          />
        );
      })}
    </>
  );
});

interface TextCursorProps {
  defaultText?: string;
  size?: number;
  fontSize?: number;
  backgroundColor?: string;
  textColor?: string;
  className?: string;
}

/**
 * Text Cursor - Cursor with text label
 */
export const TextCursor = memo(function TextCursor({
  defaultText = "",
  size = 80,
  fontSize = 12,
  backgroundColor,
  textColor,
  className = "",
}: TextCursorProps) {
  const { colors } = useTheme();
  const bgColor = backgroundColor || colors.coral;
  const txtColor = textColor || colors.warmWhite;

  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);

  const springConfig = { damping: 25, stiffness: 300 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);

  const [text, setText] = useState(defaultText);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX - size / 2);
      cursorY.set(e.clientY - size / 2);
    };

    const checkText = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cursorText = target.dataset.cursorText || target.closest("[data-cursor-text]")?.getAttribute("data-cursor-text");
      setText(cursorText || defaultText);
      setIsVisible(!!cursorText || !!defaultText);
    };

    window.addEventListener("mousemove", moveCursor);
    window.addEventListener("mouseover", checkText);

    return () => {
      window.removeEventListener("mousemove", moveCursor);
      window.removeEventListener("mouseover", checkText);
    };
  }, [cursorX, cursorY, size, defaultText]);

  return (
    <AnimatePresence>
      {isVisible && text && (
        <motion.div
          className={
            "fixed top-0 left-0 pointer-events-none z-[9999] rounded-full flex items-center justify-center " +
            className
          }
          style={{
            x: cursorXSpring,
            y: cursorYSpring,
            width: size,
            height: size,
            backgroundColor: bgColor,
            color: txtColor,
            fontSize,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <span className="font-medium text-center px-2">{text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

interface MagneticCursorProps {
  children: ReactNode;
  strength?: number;
  className?: string;
}

/**
 * Magnetic Cursor Area - Cursor attracts to center
 */
export const MagneticCursorArea = memo(function MagneticCursorArea({
  children,
  strength = 0.3,
  className = "",
}: MagneticCursorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { damping: 15, stiffness: 150 };
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const deltaX = e.clientX - centerX;
      const deltaY = e.clientY - centerY;

      x.set(deltaX * strength);
      y.set(deltaY * strength);
    },
    [strength, x, y]
  );

  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </motion.div>
  );
});

interface CursorGlowProps {
  size?: number;
  color?: string;
  blur?: number;
  className?: string;
}

/**
 * Cursor Glow - Glowing effect following cursor
 */
export const CursorGlow = memo(function CursorGlow({
  size = 200,
  color,
  blur = 80,
  className = "",
}: CursorGlowProps) {
  const { colors } = useTheme();
  const glowColor = color || colors.coral + "40";

  const cursorX = useMotionValue(-size);
  const cursorY = useMotionValue(-size);

  const springConfig = { damping: 30, stiffness: 200 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);

  useEffect(() => {
    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX - size / 2);
      cursorY.set(e.clientY - size / 2);
    };

    window.addEventListener("mousemove", moveCursor);
    return () => window.removeEventListener("mousemove", moveCursor);
  }, [cursorX, cursorY, size]);

  return (
    <motion.div
      className={"fixed top-0 left-0 pointer-events-none z-[9997] rounded-full " + className}
      style={{
        x: cursorXSpring,
        y: cursorYSpring,
        width: size,
        height: size,
        background: "radial-gradient(circle, " + glowColor + " 0%, transparent 70%)",
        filter: "blur(" + blur + "px)",
      }}
    />
  );
});

interface CursorSpotlightProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Cursor Spotlight - Spotlight effect following cursor
 */
export const CursorSpotlight = memo(function CursorSpotlight({
  size = 300,
  color,
  className = "",
}: CursorSpotlightProps) {
  const { colors } = useTheme();
  const spotlightColor = color || colors.coral;

  const cursorX = useMotionValue(0);
  const cursorY = useMotionValue(0);

  useEffect(() => {
    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
    };

    window.addEventListener("mousemove", moveCursor);
    return () => window.removeEventListener("mousemove", moveCursor);
  }, [cursorX, cursorY]);

  return (
    <motion.div
      className={"fixed inset-0 pointer-events-none z-[9996] " + className}
      style={{
        background: `radial-gradient(circle ${size}px at var(--x) var(--y), ${spotlightColor}10 0%, transparent 100%)`,
        "--x": cursorX,
        "--y": cursorY,
      } as React.CSSProperties}
    />
  );
});

interface CursorRippleProps {
  color?: string;
  duration?: number;
  maxSize?: number;
  className?: string;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

/**
 * Cursor Ripple - Ripple effect on click
 */
export const CursorRipple = memo(function CursorRipple({
  color,
  duration = 600,
  maxSize = 100,
  className = "",
}: CursorRippleProps) {
  const { colors } = useTheme();
  const rippleColor = color || colors.coral;
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const newRipple: Ripple = {
        id: nextId.current++,
        x: e.clientX,
        y: e.clientY,
      };

      setRipples((prev) => [...prev, newRipple]);

      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
      }, duration);
    };

    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [duration]);

  return (
    <>
      {ripples.map((ripple) => (
        <motion.div
          key={ripple.id}
          className={"fixed pointer-events-none z-[9998] rounded-full " + className}
          style={{
            left: ripple.x,
            top: ripple.y,
            border: "2px solid " + rippleColor,
            marginLeft: -maxSize / 2,
            marginTop: -maxSize / 2,
          }}
          initial={{ width: 0, height: 0, opacity: 1 }}
          animate={{ width: maxSize, height: maxSize, opacity: 0 }}
          transition={{ duration: duration / 1000, ease: "easeOut" }}
        />
      ))}
    </>
  );
});

interface HideCursorProps {
  children: ReactNode;
  className?: string;
}

/**
 * Hide System Cursor - Hides default cursor in area
 */
export const HideCursor = memo(function HideCursor({
  children,
  className = "",
}: HideCursorProps) {
  return (
    <div className={className} style={{ cursor: "none" }}>
      {children}
    </div>
  );
});

export default CustomCursor;
