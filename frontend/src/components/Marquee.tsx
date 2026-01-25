"use client";

/**
 * Marquee Components - Sprint 696
 *
 * Scrolling content animations:
 * - Continuous scrolling
 * - Pause on hover
 * - Direction control
 * - Speed adjustment
 * - HER-themed styling
 */

import React, { memo, useState, useRef, useEffect, ReactNode, useCallback } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type MarqueeDirection = "left" | "right" | "up" | "down";

interface MarqueeProps {
  children: ReactNode;
  direction?: MarqueeDirection;
  speed?: number;
  pauseOnHover?: boolean;
  gap?: number;
  repeat?: number;
  className?: string;
}

/**
 * Marquee Component
 */
export const Marquee = memo(function Marquee({
  children,
  direction = "left",
  speed = 50,
  pauseOnHover = true,
  gap = 16,
  repeat = 4,
  className = "",
}: MarqueeProps) {
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentSize, setContentSize] = useState(0);

  const isHorizontal = direction === "left" || direction === "right";
  const isReverse = direction === "right" || direction === "down";

  useEffect(() => {
    if (contentRef.current) {
      const size = isHorizontal
        ? contentRef.current.offsetWidth
        : contentRef.current.offsetHeight;
      setContentSize(size + gap);
    }
  }, [children, isHorizontal, gap]);

  const duration = contentSize / speed;

  const getAnimationProps = () => {
    const distance = contentSize;
    if (isHorizontal) {
      return {
        x: isReverse ? [0, distance] : [0, -distance],
      };
    }
    return {
      y: isReverse ? [0, distance] : [0, -distance],
    };
  };

  return (
    <div
      ref={containerRef}
      className={"overflow-hidden " + className}
      onMouseEnter={() => pauseOnHover && setIsPaused(true)}
      onMouseLeave={() => pauseOnHover && setIsPaused(false)}
      style={{
        maskImage: isHorizontal
          ? "linear-gradient(to right, transparent, black 5%, black 95%, transparent)"
          : "linear-gradient(to bottom, transparent, black 5%, black 95%, transparent)",
      }}
    >
      <motion.div
        className={isHorizontal ? "flex flex-row" : "flex flex-col"}
        style={{ gap }}
        animate={getAnimationProps()}
        transition={{
          duration,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
        style={{
          animationPlayState: isPaused ? "paused" : "running",
        }}
      >
        {Array.from({ length: repeat }).map((_, i) => (
          <div
            key={i}
            ref={i === 0 ? contentRef : undefined}
            className={isHorizontal ? "flex flex-row shrink-0" : "flex flex-col shrink-0"}
            style={{ gap }}
          >
            {children}
          </div>
        ))}
      </motion.div>
    </div>
  );
});

interface TextMarqueeProps {
  text: string;
  direction?: MarqueeDirection;
  speed?: number;
  pauseOnHover?: boolean;
  fontSize?: number;
  fontWeight?: string;
  className?: string;
}

/**
 * Simple Text Marquee
 */
export const TextMarquee = memo(function TextMarquee({
  text,
  direction = "left",
  speed = 80,
  pauseOnHover = true,
  fontSize = 16,
  fontWeight = "normal",
  className = "",
}: TextMarqueeProps) {
  const { colors } = useTheme();

  return (
    <Marquee
      direction={direction}
      speed={speed}
      pauseOnHover={pauseOnHover}
      gap={48}
      className={className}
    >
      <span
        style={{
          fontSize,
          fontWeight,
          color: colors.textPrimary,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </span>
    </Marquee>
  );
});

interface LogoMarqueeItem {
  id: string;
  src: string;
  alt: string;
}

interface LogoMarqueeProps {
  logos: LogoMarqueeItem[];
  direction?: MarqueeDirection;
  speed?: number;
  logoHeight?: number;
  pauseOnHover?: boolean;
  grayscale?: boolean;
  className?: string;
}

/**
 * Logo/Image Marquee
 */
export const LogoMarquee = memo(function LogoMarquee({
  logos,
  direction = "left",
  speed = 40,
  logoHeight = 40,
  pauseOnHover = true,
  grayscale = true,
  className = "",
}: LogoMarqueeProps) {
  return (
    <Marquee
      direction={direction}
      speed={speed}
      pauseOnHover={pauseOnHover}
      gap={48}
      className={className}
    >
      {logos.map((logo) => (
        <motion.img
          key={logo.id}
          src={logo.src}
          alt={logo.alt}
          style={{
            height: logoHeight,
            width: "auto",
            filter: grayscale ? "grayscale(100%)" : "none",
            opacity: grayscale ? 0.6 : 1,
          }}
          whileHover={{
            filter: "grayscale(0%)",
            opacity: 1,
          }}
        />
      ))}
    </Marquee>
  );
});

interface TestimonialMarqueeItem {
  id: string;
  quote: string;
  author: string;
  role?: string;
  avatar?: string;
}

interface TestimonialMarqueeProps {
  testimonials: TestimonialMarqueeItem[];
  direction?: MarqueeDirection;
  speed?: number;
  pauseOnHover?: boolean;
  cardWidth?: number;
  className?: string;
}

/**
 * Testimonial Marquee
 */
export const TestimonialMarquee = memo(function TestimonialMarquee({
  testimonials,
  direction = "left",
  speed = 30,
  pauseOnHover = true,
  cardWidth = 320,
  className = "",
}: TestimonialMarqueeProps) {
  const { colors } = useTheme();

  return (
    <Marquee
      direction={direction}
      speed={speed}
      pauseOnHover={pauseOnHover}
      gap={24}
      className={className}
    >
      {testimonials.map((item) => (
        <motion.div
          key={item.id}
          className="p-5 rounded-xl shrink-0"
          style={{
            width: cardWidth,
            backgroundColor: colors.warmWhite,
            border: `1px solid ${colors.cream}`,
          }}
          whileHover={{ scale: 1.02 }}
        >
          <p
            className="text-sm italic leading-relaxed"
            style={{ color: colors.textPrimary }}
          >
            "{item.quote}"
          </p>
          <div className="flex items-center gap-3 mt-4">
            {item.avatar && (
              <img
                src={item.avatar}
                alt={item.author}
                className="w-10 h-10 rounded-full object-cover"
              />
            )}
            <div>
              <p
                className="font-medium text-sm"
                style={{ color: colors.textPrimary }}
              >
                {item.author}
              </p>
              {item.role && (
                <p
                  className="text-xs"
                  style={{ color: colors.textMuted }}
                >
                  {item.role}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </Marquee>
  );
});

interface AnnouncementMarqueeProps {
  message: string;
  icon?: ReactNode;
  direction?: MarqueeDirection;
  speed?: number;
  backgroundColor?: string;
  textColor?: string;
  className?: string;
}

/**
 * Announcement Bar Marquee
 */
export const AnnouncementMarquee = memo(function AnnouncementMarquee({
  message,
  icon,
  direction = "left",
  speed = 60,
  backgroundColor,
  textColor,
  className = "",
}: AnnouncementMarqueeProps) {
  const { colors } = useTheme();

  return (
    <div
      className={"py-2 " + className}
      style={{
        backgroundColor: backgroundColor || colors.coral,
        color: textColor || colors.warmWhite,
      }}
    >
      <Marquee direction={direction} speed={speed} pauseOnHover={false} gap={32}>
        <div className="flex items-center gap-2">
          {icon && <span>{icon}</span>}
          <span className="font-medium text-sm whitespace-nowrap">{message}</span>
        </div>
      </Marquee>
    </div>
  );
});

interface VerticalMarqueeProps {
  items: ReactNode[];
  speed?: number;
  pauseOnHover?: boolean;
  reverse?: boolean;
  className?: string;
}

/**
 * Vertical Scrolling Marquee
 */
export const VerticalMarquee = memo(function VerticalMarquee({
  items,
  speed = 30,
  pauseOnHover = true,
  reverse = false,
  className = "",
}: VerticalMarqueeProps) {
  return (
    <Marquee
      direction={reverse ? "down" : "up"}
      speed={speed}
      pauseOnHover={pauseOnHover}
      gap={16}
      className={className}
    >
      {items.map((item, i) => (
        <div key={i}>{item}</div>
      ))}
    </Marquee>
  );
});

interface DualMarqueeProps {
  topContent: ReactNode;
  bottomContent: ReactNode;
  speed?: number;
  gap?: number;
  className?: string;
}

/**
 * Dual Direction Marquee
 */
export const DualMarquee = memo(function DualMarquee({
  topContent,
  bottomContent,
  speed = 50,
  gap = 8,
  className = "",
}: DualMarqueeProps) {
  return (
    <div className={"flex flex-col " + className} style={{ gap }}>
      <Marquee direction="left" speed={speed}>
        {topContent}
      </Marquee>
      <Marquee direction="right" speed={speed}>
        {bottomContent}
      </Marquee>
    </div>
  );
});

// Hook for controlling marquee playback
export function useMarqueeControl() {
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(50);

  const pause = useCallback(() => setIsPaused(true), []);
  const play = useCallback(() => setIsPaused(false), []);
  const toggle = useCallback(() => setIsPaused((p) => !p), []);
  const faster = useCallback(() => setSpeed((s) => Math.min(s * 1.5, 200)), []);
  const slower = useCallback(() => setSpeed((s) => Math.max(s / 1.5, 10)), []);

  return {
    isPaused,
    speed,
    pause,
    play,
    toggle,
    faster,
    slower,
    setSpeed,
  };
}

export default Marquee;
