"use client";

/**
 * Floating Elements Components - Sprint 796
 *
 * Floating UI elements:
 * - Floating particles
 * - Floating bubbles
 * - Floating shapes
 * - Floating icons
 * - Animated background
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useEffect,
  useRef,
  useMemo,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface FloatingParticlesProps {
  count?: number;
  colors?: string[];
  minSize?: number;
  maxSize?: number;
  speed?: number;
  className?: string;
}

/**
 * Floating Particles - Random floating particles
 */
export const FloatingParticles = memo(function FloatingParticles({
  count = 50,
  colors,
  minSize = 2,
  maxSize = 6,
  speed = 1,
  className = "",
}: FloatingParticlesProps) {
  const { colors: themeColors } = useTheme();
  const particleColors = colors || [themeColors.coral, themeColors.cream, "#8b5cf6"];

  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: minSize + Math.random() * (maxSize - minSize),
      color: particleColors[Math.floor(Math.random() * particleColors.length)],
      duration: (10 + Math.random() * 20) / speed,
      delay: Math.random() * 5,
    }));
  }, [count, minSize, maxSize, particleColors, speed]);

  return (
    <div className={"absolute inset-0 overflow-hidden pointer-events-none " + className}>
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: particle.x + "%",
            top: particle.y + "%",
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, 10, -10, 0],
            opacity: [0.3, 0.8, 0.3],
          }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            delay: particle.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
});

interface FloatingBubblesProps {
  count?: number;
  color?: string;
  minSize?: number;
  maxSize?: number;
  speed?: number;
  className?: string;
}

/**
 * Floating Bubbles - Rising bubble animation
 */
export const FloatingBubbles = memo(function FloatingBubbles({
  count = 20,
  color,
  minSize = 10,
  maxSize = 40,
  speed = 1,
  className = "",
}: FloatingBubblesProps) {
  const { colors } = useTheme();
  const bubbleColor = color || colors.coral;

  const bubbles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      size: minSize + Math.random() * (maxSize - minSize),
      duration: (15 + Math.random() * 10) / speed,
      delay: Math.random() * 10,
    }));
  }, [count, minSize, maxSize, speed]);

  return (
    <div className={"absolute inset-0 overflow-hidden pointer-events-none " + className}>
      {bubbles.map((bubble) => (
        <motion.div
          key={bubble.id}
          className="absolute rounded-full"
          style={{
            left: bubble.x + "%",
            bottom: -bubble.size,
            width: bubble.size,
            height: bubble.size,
            border: "2px solid " + bubbleColor + "40",
            background: "radial-gradient(circle at 30% 30%, " + bubbleColor + "20, transparent)",
          }}
          animate={{
            y: [0, -window.innerHeight - bubble.size],
            x: [0, Math.sin(bubble.id) * 50],
          }}
          transition={{
            duration: bubble.duration,
            repeat: Infinity,
            delay: bubble.delay,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
});

type ShapeType = "circle" | "square" | "triangle" | "hexagon" | "star";

interface FloatingShapesProps {
  count?: number;
  shapes?: ShapeType[];
  colors?: string[];
  minSize?: number;
  maxSize?: number;
  speed?: number;
  rotate?: boolean;
  className?: string;
}

/**
 * Floating Shapes - Various geometric shapes
 */
export const FloatingShapes = memo(function FloatingShapes({
  count = 15,
  shapes = ["circle", "square", "triangle"],
  colors,
  minSize = 20,
  maxSize = 60,
  speed = 1,
  rotate = true,
  className = "",
}: FloatingShapesProps) {
  const { colors: themeColors } = useTheme();
  const shapeColors = colors || [themeColors.coral + "30", themeColors.cream + "30", "#8b5cf650"];

  const shapeElements = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: minSize + Math.random() * (maxSize - minSize),
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      color: shapeColors[Math.floor(Math.random() * shapeColors.length)],
      duration: (20 + Math.random() * 20) / speed,
      delay: Math.random() * 5,
      rotation: Math.random() * 360,
    }));
  }, [count, shapes, shapeColors, minSize, maxSize, speed]);

  const getShapeStyle = (shape: ShapeType, size: number, color: string) => {
    const base = { width: size, height: size, backgroundColor: color };

    switch (shape) {
      case "circle":
        return { ...base, borderRadius: "50%" };
      case "square":
        return { ...base, borderRadius: "4px" };
      case "triangle":
        return {
          width: 0,
          height: 0,
          backgroundColor: "transparent",
          borderLeft: size / 2 + "px solid transparent",
          borderRight: size / 2 + "px solid transparent",
          borderBottom: size + "px solid " + color,
        };
      case "hexagon":
        return {
          ...base,
          clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
        };
      case "star":
        return {
          ...base,
          clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
        };
      default:
        return base;
    }
  };

  return (
    <div className={"absolute inset-0 overflow-hidden pointer-events-none " + className}>
      {shapeElements.map((el) => (
        <motion.div
          key={el.id}
          className="absolute"
          style={{
            left: el.x + "%",
            top: el.y + "%",
            ...getShapeStyle(el.shape, el.size, el.color),
          }}
          animate={{
            y: [0, -20, 0, 20, 0],
            x: [0, 15, 0, -15, 0],
            rotate: rotate ? [el.rotation, el.rotation + 360] : undefined,
          }}
          transition={{
            duration: el.duration,
            repeat: Infinity,
            delay: el.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
});

interface FloatingIconsProps {
  icons: ReactNode[];
  count?: number;
  minSize?: number;
  maxSize?: number;
  speed?: number;
  className?: string;
}

/**
 * Floating Icons - Custom icons floating around
 */
export const FloatingIcons = memo(function FloatingIcons({
  icons,
  count = 20,
  minSize = 24,
  maxSize = 48,
  speed = 1,
  className = "",
}: FloatingIconsProps) {
  const iconElements = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: minSize + Math.random() * (maxSize - minSize),
      icon: icons[Math.floor(Math.random() * icons.length)],
      duration: (15 + Math.random() * 15) / speed,
      delay: Math.random() * 5,
    }));
  }, [icons, count, minSize, maxSize, speed]);

  return (
    <div className={"absolute inset-0 overflow-hidden pointer-events-none " + className}>
      {iconElements.map((el) => (
        <motion.div
          key={el.id}
          className="absolute flex items-center justify-center"
          style={{
            left: el.x + "%",
            top: el.y + "%",
            width: el.size,
            height: el.size,
            fontSize: el.size * 0.6,
          }}
          animate={{
            y: [0, -25, 0],
            rotate: [0, 10, -10, 0],
            opacity: [0.4, 0.8, 0.4],
          }}
          transition={{
            duration: el.duration,
            repeat: Infinity,
            delay: el.delay,
            ease: "easeInOut",
          }}
        >
          {el.icon}
        </motion.div>
      ))}
    </div>
  );
});

interface GradientOrbsProps {
  count?: number;
  colors?: string[];
  minSize?: number;
  maxSize?: number;
  blur?: number;
  speed?: number;
  className?: string;
}

/**
 * Gradient Orbs - Glowing gradient orbs
 */
export const GradientOrbs = memo(function GradientOrbs({
  count = 5,
  colors,
  minSize = 100,
  maxSize = 300,
  blur = 60,
  speed = 1,
  className = "",
}: GradientOrbsProps) {
  const { colors: themeColors } = useTheme();
  const orbColors = colors || [themeColors.coral, "#8b5cf6", "#3b82f6", themeColors.cream];

  const orbs = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: minSize + Math.random() * (maxSize - minSize),
      color1: orbColors[Math.floor(Math.random() * orbColors.length)],
      color2: orbColors[Math.floor(Math.random() * orbColors.length)],
      duration: (30 + Math.random() * 20) / speed,
      delay: Math.random() * 5,
    }));
  }, [count, orbColors, minSize, maxSize, speed]);

  return (
    <div className={"absolute inset-0 overflow-hidden pointer-events-none " + className}>
      {orbs.map((orb) => (
        <motion.div
          key={orb.id}
          className="absolute rounded-full"
          style={{
            left: orb.x + "%",
            top: orb.y + "%",
            width: orb.size,
            height: orb.size,
            background: "radial-gradient(circle, " + orb.color1 + "40 0%, " + orb.color2 + "20 50%, transparent 70%)",
            filter: "blur(" + blur + "px)",
          }}
          animate={{
            x: [0, 50, -50, 0],
            y: [0, -50, 50, 0],
            scale: [1, 1.2, 0.8, 1],
          }}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            delay: orb.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
});

interface WavesBackgroundProps {
  layers?: number;
  colors?: string[];
  speed?: number;
  amplitude?: number;
  className?: string;
}

/**
 * Waves Background - Animated wave layers
 */
export const WavesBackground = memo(function WavesBackground({
  layers = 3,
  colors,
  speed = 1,
  amplitude = 20,
  className = "",
}: WavesBackgroundProps) {
  const { colors: themeColors } = useTheme();
  const waveColors = colors || [
    themeColors.coral + "20",
    themeColors.coral + "15",
    themeColors.coral + "10",
  ];

  return (
    <div className={"absolute inset-0 overflow-hidden pointer-events-none " + className}>
      {Array.from({ length: layers }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: 100 + i * 50,
            background: waveColors[i % waveColors.length],
            borderTopLeftRadius: "50%",
            borderTopRightRadius: "50%",
            transformOrigin: "bottom",
          }}
          animate={{
            scaleY: [1, 1 + amplitude / 100, 1],
            x: [0, i % 2 === 0 ? 20 : -20, 0],
          }}
          transition={{
            duration: (4 + i * 2) / speed,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.5,
          }}
        />
      ))}
    </div>
  );
});

interface GridPatternProps {
  size?: number;
  color?: string;
  fade?: boolean;
  animated?: boolean;
  className?: string;
}

/**
 * Grid Pattern - Animated grid background
 */
export const GridPattern = memo(function GridPattern({
  size = 40,
  color,
  fade = true,
  animated = true,
  className = "",
}: GridPatternProps) {
  const { colors } = useTheme();
  const gridColor = color || colors.coral + "20";

  return (
    <div
      className={"absolute inset-0 pointer-events-none " + className}
      style={{
        backgroundImage: `
          linear-gradient(${gridColor} 1px, transparent 1px),
          linear-gradient(90deg, ${gridColor} 1px, transparent 1px)
        `,
        backgroundSize: size + "px " + size + "px",
        mask: fade
          ? "radial-gradient(ellipse at center, black 0%, transparent 70%)"
          : undefined,
        WebkitMask: fade
          ? "radial-gradient(ellipse at center, black 0%, transparent 70%)"
          : undefined,
      }}
    >
      {animated && (
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(${gridColor} 1px, transparent 1px),
              linear-gradient(90deg, ${gridColor} 1px, transparent 1px)
            `,
            backgroundSize: size + "px " + size + "px",
          }}
          animate={{
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}
    </div>
  );
});

interface DotsPatternProps {
  size?: number;
  spacing?: number;
  color?: string;
  animated?: boolean;
  className?: string;
}

/**
 * Dots Pattern - Animated dot grid
 */
export const DotsPattern = memo(function DotsPattern({
  size = 4,
  spacing = 24,
  color,
  animated = true,
  className = "",
}: DotsPatternProps) {
  const { colors } = useTheme();
  const dotColor = color || colors.coral + "30";

  return (
    <motion.div
      className={"absolute inset-0 pointer-events-none " + className}
      style={{
        backgroundImage: `radial-gradient(circle, ${dotColor} ${size / 2}px, transparent ${size / 2}px)`,
        backgroundSize: spacing + "px " + spacing + "px",
      }}
      animate={
        animated
          ? {
              opacity: [0.5, 1, 0.5],
            }
          : undefined
      }
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
});

interface NoisyBackgroundProps {
  opacity?: number;
  animated?: boolean;
  className?: string;
}

/**
 * Noisy Background - Film grain / noise effect
 */
export const NoisyBackground = memo(function NoisyBackground({
  opacity = 0.1,
  animated = true,
  className = "",
}: NoisyBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener("resize", resize);

    let animationId: number;

    const render = () => {
      const imageData = ctx.createImageData(canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const value = Math.random() * 255;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = 255;
      }

      ctx.putImageData(imageData, 0, 0);

      if (animated) {
        animationId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [animated]);

  return (
    <canvas
      ref={canvasRef}
      className={"absolute inset-0 pointer-events-none mix-blend-overlay " + className}
      style={{ opacity }}
    />
  );
});

interface FloatingTextProps {
  words: string[];
  count?: number;
  minSize?: number;
  maxSize?: number;
  color?: string;
  speed?: number;
  className?: string;
}

/**
 * Floating Text - Random floating words
 */
export const FloatingText = memo(function FloatingText({
  words,
  count = 15,
  minSize = 12,
  maxSize = 24,
  color,
  speed = 1,
  className = "",
}: FloatingTextProps) {
  const { colors } = useTheme();
  const textColor = color || colors.coral + "40";

  const textElements = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: minSize + Math.random() * (maxSize - minSize),
      word: words[Math.floor(Math.random() * words.length)],
      duration: (20 + Math.random() * 20) / speed,
      delay: Math.random() * 5,
      rotation: (Math.random() - 0.5) * 30,
    }));
  }, [words, count, minSize, maxSize, speed]);

  return (
    <div className={"absolute inset-0 overflow-hidden pointer-events-none " + className}>
      {textElements.map((el) => (
        <motion.span
          key={el.id}
          className="absolute font-medium select-none"
          style={{
            left: el.x + "%",
            top: el.y + "%",
            fontSize: el.size,
            color: textColor,
            transform: "rotate(" + el.rotation + "deg)",
          }}
          animate={{
            y: [0, -15, 0],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: el.duration,
            repeat: Infinity,
            delay: el.delay,
            ease: "easeInOut",
          }}
        >
          {el.word}
        </motion.span>
      ))}
    </div>
  );
});

export default FloatingParticles;
