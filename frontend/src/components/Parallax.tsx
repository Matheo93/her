"use client";

/**
 * Parallax Components - Sprint 790
 *
 * Parallax scrolling effects:
 * - Basic parallax
 * - Multi-layer parallax
 * - Horizontal parallax
 * - Parallax sections
 * - Mouse parallax
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
import { motion, useScroll, useTransform, useSpring, useMotionValue } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface ParallaxProps {
  children: ReactNode;
  speed?: number;
  direction?: "up" | "down";
  className?: string;
}

/**
 * Basic Parallax Container
 */
export const Parallax = memo(function Parallax({
  children,
  speed = 0.5,
  direction = "up",
  className = "",
}: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const multiplier = direction === "up" ? -1 : 1;
  const y = useTransform(scrollYProgress, [0, 1], [100 * speed * multiplier, -100 * speed * multiplier]);

  return (
    <div ref={ref} className={"relative overflow-hidden " + className}>
      <motion.div style={{ y }}>
        {children}
      </motion.div>
    </div>
  );
});

interface ParallaxLayerProps {
  children: ReactNode;
  speed?: number;
  zIndex?: number;
  className?: string;
}

/**
 * Parallax Layer for Multi-layer Effects
 */
export const ParallaxLayer = memo(function ParallaxLayer({
  children,
  speed = 0.5,
  zIndex = 0,
  className = "",
}: ParallaxLayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [100 * speed, -100 * speed]);

  return (
    <motion.div
      ref={ref}
      className={"absolute inset-0 " + className}
      style={{ y, zIndex }}
    >
      {children}
    </motion.div>
  );
});

interface ParallaxSectionProps {
  children: ReactNode;
  backgroundImage?: string;
  backgroundColor?: string;
  backgroundSpeed?: number;
  height?: string | number;
  className?: string;
}

/**
 * Full Section with Parallax Background
 */
export const ParallaxSection = memo(function ParallaxSection({
  children,
  backgroundImage,
  backgroundColor,
  backgroundSpeed = 0.5,
  height = "100vh",
  className = "",
}: ParallaxSectionProps) {
  const { colors } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", `${backgroundSpeed * 100}%`]);

  return (
    <div
      ref={ref}
      className={"relative overflow-hidden " + className}
      style={{ height }}
    >
      {/* Parallax background */}
      <motion.div
        className="absolute inset-0 -top-20 -bottom-20"
        style={{
          y,
          backgroundColor: backgroundColor || colors.cream,
          backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />

      {/* Content overlay */}
      <div className="relative z-10 h-full">
        {children}
      </div>
    </div>
  );
});

interface MouseParallaxProps {
  children: ReactNode;
  strength?: number;
  className?: string;
}

/**
 * Mouse-tracking Parallax
 */
export const MouseParallax = memo(function MouseParallax({
  children,
  strength = 20,
  className = "",
}: MouseParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { stiffness: 150, damping: 15 };
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const deltaX = (e.clientX - centerX) / rect.width;
      const deltaY = (e.clientY - centerY) / rect.height;

      x.set(deltaX * strength);
      y.set(deltaY * strength);
    };

    const handleMouseLeave = () => {
      x.set(0);
      y.set(0);
    };

    const element = ref.current;
    if (element) {
      element.addEventListener("mousemove", handleMouseMove);
      element.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      if (element) {
        element.removeEventListener("mousemove", handleMouseMove);
        element.removeEventListener("mouseleave", handleMouseLeave);
      }
    };
  }, [strength, x, y]);

  return (
    <div ref={ref} className={className}>
      <motion.div style={{ x: springX, y: springY }}>
        {children}
      </motion.div>
    </div>
  );
});

interface MouseParallaxLayerProps {
  children: ReactNode;
  depth?: number;
  className?: string;
}

/**
 * Mouse Parallax with Depth Layers
 */
export const MouseParallaxContainer = memo(function MouseParallaxContainer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      mouseX.set(x);
      mouseY.set(y);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <MouseParallaxContext.Provider value={{ mouseX, mouseY }}>
      <div ref={containerRef} className={"relative " + className}>
        {children}
      </div>
    </MouseParallaxContext.Provider>
  );
});

const MouseParallaxContext = React.createContext<{
  mouseX: ReturnType<typeof useMotionValue>;
  mouseY: ReturnType<typeof useMotionValue>;
} | null>(null);

export const MouseParallaxLayer = memo(function MouseParallaxLayer({
  children,
  depth = 1,
  className = "",
}: MouseParallaxLayerProps) {
  const context = React.useContext(MouseParallaxContext);

  if (!context) {
    return <div className={className}>{children}</div>;
  }

  const { mouseX, mouseY } = context;

  const springConfig = { stiffness: 100, damping: 20 };
  const x = useSpring(useTransform(mouseX, (v) => v * depth * 50), springConfig);
  const y = useSpring(useTransform(mouseY, (v) => v * depth * 50), springConfig);

  return (
    <motion.div className={className} style={{ x, y }}>
      {children}
    </motion.div>
  );
});

interface HorizontalParallaxProps {
  children: ReactNode;
  speed?: number;
  className?: string;
}

/**
 * Horizontal Scroll Parallax
 */
export const HorizontalParallax = memo(function HorizontalParallax({
  children,
  speed = 0.5,
  className = "",
}: HorizontalParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const x = useTransform(scrollYProgress, [0, 1], [200 * speed, -200 * speed]);

  return (
    <div ref={ref} className={"overflow-hidden " + className}>
      <motion.div style={{ x }}>
        {children}
      </motion.div>
    </div>
  );
});

interface TiltCardProps {
  children: ReactNode;
  maxTilt?: number;
  scale?: number;
  perspective?: number;
  className?: string;
}

/**
 * 3D Tilt Card Effect
 */
export const TiltCard = memo(function TiltCard({
  children,
  maxTilt = 10,
  scale = 1.02,
  perspective = 1000,
  className = "",
}: TiltCardProps) {
  const { colors } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const scaleValue = useMotionValue(1);

  const springConfig = { stiffness: 300, damping: 20 };
  const springRotateX = useSpring(rotateX, springConfig);
  const springRotateY = useSpring(rotateY, springConfig);
  const springScale = useSpring(scaleValue, springConfig);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      rotateX.set(-y * maxTilt);
      rotateY.set(x * maxTilt);
      scaleValue.set(scale);
    },
    [maxTilt, scale, rotateX, rotateY, scaleValue]
  );

  const handleMouseLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
    scaleValue.set(1);
  }, [rotateX, rotateY, scaleValue]);

  return (
    <motion.div
      ref={ref}
      className={"rounded-2xl " + className}
      style={{
        perspective,
        backgroundColor: colors.warmWhite,
        transformStyle: "preserve-3d",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        style={{
          rotateX: springRotateX,
          rotateY: springRotateY,
          scale: springScale,
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
});

interface ScrollProgressProps {
  className?: string;
  color?: string;
  height?: number;
  position?: "top" | "bottom";
}

/**
 * Scroll Progress Indicator
 */
export const ScrollProgress = memo(function ScrollProgress({
  className = "",
  color,
  height = 4,
  position = "top",
}: ScrollProgressProps) {
  const { colors } = useTheme();
  const progressColor = color || colors.coral;
  const { scrollYProgress } = useScroll();

  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      className={"fixed left-0 right-0 z-50 " + (position === "top" ? "top-0" : "bottom-0") + " " + className}
      style={{
        height,
        backgroundColor: progressColor,
        transformOrigin: "0%",
        scaleX,
      }}
    />
  );
});

interface FadeInOnScrollProps {
  children: ReactNode;
  direction?: "up" | "down" | "left" | "right";
  distance?: number;
  delay?: number;
  duration?: number;
  className?: string;
}

/**
 * Fade In On Scroll
 */
export const FadeInOnScroll = memo(function FadeInOnScroll({
  children,
  direction = "up",
  distance = 50,
  delay = 0,
  duration = 0.5,
  className = "",
}: FadeInOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"],
  });

  const directionMap = {
    up: { y: distance, x: 0 },
    down: { y: -distance, x: 0 },
    left: { x: distance, y: 0 },
    right: { x: -distance, y: 0 },
  };

  const initial = directionMap[direction];

  const opacity = useTransform(scrollYProgress, [0, 0.5], [0, 1]);
  const y = useTransform(scrollYProgress, [0, 0.5], [initial.y, 0]);
  const x = useTransform(scrollYProgress, [0, 0.5], [initial.x, 0]);

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ opacity, y, x }}
      transition={{ delay, duration }}
    >
      {children}
    </motion.div>
  );
});

export default Parallax;
