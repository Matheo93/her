"use client";

/**
 * Confetti Components - Sprint 746
 *
 * Celebration animations:
 * - Confetti explosion
 * - Particle rain
 * - Fireworks
 * - Customizable colors
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  shape: "square" | "circle" | "star";
  opacity: number;
}

interface ConfettiProps {
  active?: boolean;
  count?: number;
  colors?: string[];
  duration?: number;
  spread?: number;
  startX?: number;
  startY?: number;
  gravity?: number;
  shapes?: ("square" | "circle" | "star")[];
  onComplete?: () => void;
  className?: string;
}

/**
 * Confetti Explosion
 */
export const Confetti = memo(function Confetti({
  active = false,
  count = 100,
  colors,
  duration = 3000,
  spread = 360,
  startX = 0.5,
  startY = 0.5,
  gravity = 0.5,
  shapes = ["square", "circle"],
  onComplete,
  className = "",
}: ConfettiProps) {
  const { colors: themeColors } = useTheme();
  const [particles, setParticles] = useState<Particle[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  const defaultColors = colors || [
    themeColors.coral,
    themeColors.cream,
    "#FFD700",
    "#FF69B4",
    "#00CED1",
    "#9370DB",
  ];

  const createParticles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return [];

    const newParticles: Particle[] = [];
    const angleSpread = (spread * Math.PI) / 180;
    const startAngle = -Math.PI / 2 - angleSpread / 2;

    for (let i = 0; i < count; i++) {
      const angle = startAngle + Math.random() * angleSpread;
      const velocity = 8 + Math.random() * 8;

      newParticles.push({
        id: i,
        x: canvas.width * startX,
        y: canvas.height * startY,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        color: defaultColors[Math.floor(Math.random() * defaultColors.length)],
        size: 6 + Math.random() * 6,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        shape: shapes[Math.floor(Math.random() * shapes.length)],
        opacity: 1,
      });
    }

    return newParticles;
  }, [count, spread, startX, startY, defaultColors, shapes]);

  const drawParticle = useCallback((ctx: CanvasRenderingContext2D, p: Particle) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;

    if (p.shape === "square") {
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    } else if (p.shape === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === "star") {
      drawStar(ctx, 0, 0, 5, p.size / 2, p.size / 4);
    }

    ctx.restore();
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let activeCount = 0;

    particlesRef.current = particlesRef.current.map((p) => {
      const newP = { ...p };
      newP.x += newP.vx;
      newP.y += newP.vy;
      newP.vy += gravity;
      newP.rotation += newP.rotationSpeed;
      newP.vx *= 0.99;

      if (newP.y > canvas.height + 50) {
        newP.opacity = 0;
      } else {
        activeCount++;
      }

      if (newP.opacity > 0) {
        drawParticle(ctx, newP);
      }

      return newP;
    });

    if (activeCount > 0) {
      animationRef.current = requestAnimationFrame(animate);
    } else {
      onComplete?.();
    }
  }, [gravity, drawParticle, onComplete]);

  useEffect(() => {
    if (active) {
      particlesRef.current = createParticles();
      animate();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [active, createParticles, animate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={"fixed inset-0 pointer-events-none z-50 " + className}
    />
  );
});

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number
) {
  let rot = (Math.PI / 2) * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);

  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }

  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fill();
}

interface ConfettiButtonProps {
  children: ReactNode;
  onClick?: () => void;
  confettiProps?: Partial<ConfettiProps>;
  disabled?: boolean;
  className?: string;
}

/**
 * Button with Confetti Effect
 */
export const ConfettiButton = memo(function ConfettiButton({
  children,
  onClick,
  confettiProps = {},
  disabled = false,
  className = "",
}: ConfettiButtonProps) {
  const { colors } = useTheme();
  const [showConfetti, setShowConfetti] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    if (disabled) return;

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const x = (rect.left + rect.width / 2) / window.innerWidth;
      const y = (rect.top + rect.height / 2) / window.innerHeight;

      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }

    onClick?.();
  }, [onClick, disabled]);

  return (
    <>
      <motion.button
        ref={buttonRef}
        onClick={handleClick}
        disabled={disabled}
        className={"px-6 py-3 rounded-xl font-medium transition-colors " + className}
        style={{
          backgroundColor: colors.coral,
          color: colors.warmWhite,
          opacity: disabled ? 0.5 : 1,
        }}
        whileHover={{ scale: disabled ? 1 : 1.05 }}
        whileTap={{ scale: disabled ? 1 : 0.95 }}
      >
        {children}
      </motion.button>

      <Confetti
        active={showConfetti}
        {...confettiProps}
      />
    </>
  );
});

interface FireworkProps {
  x: number;
  y: number;
  colors?: string[];
  size?: number;
  onComplete?: () => void;
}

/**
 * Single Firework
 */
const Firework = memo(function Firework({
  x,
  y,
  colors,
  size = 100,
  onComplete,
}: FireworkProps) {
  const { colors: themeColors } = useTheme();
  const [particles, setParticles] = useState<Array<{ angle: number; delay: number; color: string }>>([]);

  const defaultColors = colors || [
    themeColors.coral,
    "#FFD700",
    "#FF69B4",
    "#00CED1",
  ];

  useEffect(() => {
    const count = 12;
    const newParticles = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        angle: (i / count) * 360,
        delay: Math.random() * 0.2,
        color: defaultColors[Math.floor(Math.random() * defaultColors.length)],
      });
    }
    setParticles(newParticles);

    const timeout = setTimeout(() => onComplete?.(), 1500);
    return () => clearTimeout(timeout);
  }, [defaultColors, onComplete]);

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
    >
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full"
          style={{ backgroundColor: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: Math.cos((p.angle * Math.PI) / 180) * size,
            y: Math.sin((p.angle * Math.PI) / 180) * size,
            opacity: 0,
            scale: 0,
          }}
          transition={{
            duration: 1,
            delay: p.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
});

interface FireworksShowProps {
  active?: boolean;
  count?: number;
  interval?: number;
  duration?: number;
  colors?: string[];
  className?: string;
}

/**
 * Fireworks Show
 */
export const FireworksShow = memo(function FireworksShow({
  active = false,
  count = 5,
  interval = 500,
  duration = 3000,
  colors,
  className = "",
}: FireworksShowProps) {
  const [fireworks, setFireworks] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const idCounter = useRef(0);

  useEffect(() => {
    if (!active) {
      setFireworks([]);
      return;
    }

    const launchFirework = () => {
      const id = idCounter.current++;
      const x = 100 + Math.random() * (window.innerWidth - 200);
      const y = 100 + Math.random() * (window.innerHeight / 2);

      setFireworks((prev) => [...prev, { id, x, y }]);
    };

    // Launch initial fireworks
    for (let i = 0; i < count; i++) {
      setTimeout(launchFirework, i * interval);
    }

    // Stop after duration
    const timeout = setTimeout(() => {
      setFireworks([]);
    }, duration);

    return () => clearTimeout(timeout);
  }, [active, count, interval, duration]);

  const handleComplete = useCallback((id: number) => {
    setFireworks((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return (
    <div className={"fixed inset-0 pointer-events-none z-50 " + className}>
      <AnimatePresence>
        {fireworks.map((f) => (
          <Firework
            key={f.id}
            x={f.x}
            y={f.y}
            colors={colors}
            onComplete={() => handleComplete(f.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
});

interface ParticleRainProps {
  active?: boolean;
  count?: number;
  colors?: string[];
  speed?: number;
  className?: string;
}

/**
 * Particle Rain Effect
 */
export const ParticleRain = memo(function ParticleRain({
  active = true,
  count = 50,
  colors,
  speed = 1,
  className = "",
}: ParticleRainProps) {
  const { colors: themeColors } = useTheme();

  const defaultColors = colors || [
    themeColors.coral + "40",
    themeColors.cream + "40",
    "#FFD70040",
  ];

  const particles = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 5,
    duration: 3 + Math.random() * 4,
    size: 4 + Math.random() * 8,
    color: defaultColors[Math.floor(Math.random() * defaultColors.length)],
  }));

  if (!active) return null;

  return (
    <div className={"fixed inset-0 pointer-events-none overflow-hidden z-40 " + className}>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: p.x + "%",
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
          }}
          animate={{
            y: ["0vh", "100vh"],
          }}
          transition={{
            duration: p.duration / speed,
            delay: p.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
});

export default Confetti;
