"use client";

/**
 * Interactive Card Components - Sprint 802
 *
 * Interactive card effects:
 * - Flip card
 * - Expandable card
 * - Swipeable card
 * - Reveal card
 * - Stack cards
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { motion, AnimatePresence, PanInfo, useMotionValue, useTransform } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface FlipCardProps {
  front: ReactNode;
  back: ReactNode;
  flipDirection?: "horizontal" | "vertical";
  flipOnHover?: boolean;
  flipOnClick?: boolean;
  className?: string;
}

/**
 * Flip Card - 3D flip effect
 */
export const FlipCard = memo(function FlipCard({
  front,
  back,
  flipDirection = "horizontal",
  flipOnHover = false,
  flipOnClick = true,
  className = "",
}: FlipCardProps) {
  const { colors } = useTheme();
  const [isFlipped, setIsFlipped] = useState(false);

  const flipAxis = flipDirection === "horizontal" ? "rotateY" : "rotateX";
  const flipValue = isFlipped ? 180 : 0;

  return (
    <div
      className={"relative cursor-pointer " + className}
      style={{ perspective: "1000px" }}
      onMouseEnter={() => flipOnHover && setIsFlipped(true)}
      onMouseLeave={() => flipOnHover && setIsFlipped(false)}
      onClick={() => flipOnClick && setIsFlipped(!isFlipped)}
    >
      <motion.div
        className="relative w-full h-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={{ [flipAxis]: flipValue }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 rounded-2xl p-6"
          style={{
            backfaceVisibility: "hidden",
            backgroundColor: colors.warmWhite,
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
          }}
        >
          {front}
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 rounded-2xl p-6"
          style={{
            backfaceVisibility: "hidden",
            backgroundColor: colors.coral,
            color: colors.warmWhite,
            transform: flipDirection === "horizontal" ? "rotateY(180deg)" : "rotateX(180deg)",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
          }}
        >
          {back}
        </div>
      </motion.div>
    </div>
  );
});

interface ExpandableCardProps {
  children: ReactNode;
  expandedContent: ReactNode;
  className?: string;
  expandedClassName?: string;
}

/**
 * Expandable Card - Expands to show more content
 */
export const ExpandableCard = memo(function ExpandableCard({
  children,
  expandedContent,
  className = "",
  expandedClassName = "",
}: ExpandableCardProps) {
  const { colors } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <motion.div
        className={"rounded-2xl p-6 cursor-pointer " + className}
        style={{
          backgroundColor: colors.warmWhite,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
        }}
        onClick={() => setIsExpanded(true)}
        layoutId="expandable-card"
        whileHover={{ scale: 1.02 }}
      >
        {children}
      </motion.div>

      <AnimatePresence>
        {isExpanded && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/50 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExpanded(false)}
            />

            {/* Expanded card */}
            <motion.div
              className={
                "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 rounded-2xl p-8 max-w-2xl w-full max-h-[80vh] overflow-auto " +
                expandedClassName
              }
              style={{
                backgroundColor: colors.warmWhite,
                boxShadow: "0 25px 50px rgba(0, 0, 0, 0.25)",
              }}
              layoutId="expandable-card"
            >
              <button
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/10"
                onClick={() => setIsExpanded(false)}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {children}
              <div className="mt-6">{expandedContent}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
});

interface SwipeableCardProps {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  className?: string;
}

/**
 * Swipeable Card - Swipe to dismiss/action
 */
export const SwipeableCard = memo(function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 100,
  className = "",
}: SwipeableCardProps) {
  const { colors } = useTheme();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);

  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacity = useTransform(
    x,
    [-threshold * 2, -threshold, 0, threshold, threshold * 2],
    [0, 0.5, 1, 0.5, 0]
  );

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);

    if (Math.abs(info.offset.x) > threshold) {
      if (info.offset.x > 0 && onSwipeRight) {
        onSwipeRight();
      } else if (info.offset.x < 0 && onSwipeLeft) {
        onSwipeLeft();
      }
    }

    if (Math.abs(info.offset.y) > threshold) {
      if (info.offset.y > 0 && onSwipeDown) {
        onSwipeDown();
      } else if (info.offset.y < 0 && onSwipeUp) {
        onSwipeUp();
      }
    }
  };

  return (
    <motion.div
      className={"rounded-2xl p-6 cursor-grab active:cursor-grabbing " + className}
      style={{
        x,
        y,
        rotate,
        opacity,
        backgroundColor: colors.warmWhite,
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
      }}
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.8}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
      whileTap={{ scale: isDragging ? 1 : 0.98 }}
    >
      {children}
    </motion.div>
  );
});

interface RevealCardProps {
  children: ReactNode;
  revealContent: ReactNode;
  direction?: "left" | "right" | "top" | "bottom";
  className?: string;
}

/**
 * Reveal Card - Hover to reveal content
 */
export const RevealCard = memo(function RevealCard({
  children,
  revealContent,
  direction = "bottom",
  className = "",
}: RevealCardProps) {
  const { colors } = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  const revealVariants = {
    left: { x: isHovered ? 0 : "100%" },
    right: { x: isHovered ? 0 : "-100%" },
    top: { y: isHovered ? 0 : "100%" },
    bottom: { y: isHovered ? 0 : "-100%" },
  };

  return (
    <div
      className={"relative overflow-hidden rounded-2xl " + className}
      style={{
        backgroundColor: colors.warmWhite,
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="p-6">{children}</div>

      <motion.div
        className="absolute inset-0 p-6 flex items-center justify-center"
        style={{ backgroundColor: colors.coral, color: colors.warmWhite }}
        initial={revealVariants[direction]}
        animate={revealVariants[direction]}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {revealContent}
      </motion.div>
    </div>
  );
});

interface StackCardsProps {
  cards: ReactNode[];
  onCardRemove?: (index: number) => void;
  className?: string;
}

/**
 * Stack Cards - Stacked cards with swipe
 */
export const StackCards = memo(function StackCards({
  cards,
  onCardRemove,
  className = "",
}: StackCardsProps) {
  const { colors } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleSwipe = useCallback(() => {
    onCardRemove?.(currentIndex);
    setCurrentIndex((prev) => prev + 1);
  }, [currentIndex, onCardRemove]);

  const visibleCards = cards.slice(currentIndex, currentIndex + 3);

  return (
    <div className={"relative h-96 " + className}>
      {visibleCards.map((card, index) => {
        const isFirst = index === 0;
        return (
          <motion.div
            key={currentIndex + index}
            className="absolute inset-0 rounded-2xl p-6"
            style={{
              backgroundColor: colors.warmWhite,
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
              zIndex: visibleCards.length - index,
            }}
            initial={{ scale: 1 - index * 0.05, y: index * 10 }}
            animate={{ scale: 1 - index * 0.05, y: index * 10 }}
            drag={isFirst ? "x" : false}
            dragConstraints={{ left: -200, right: 200 }}
            dragElastic={0.5}
            onDragEnd={(_, info) => {
              if (Math.abs(info.offset.x) > 100) {
                handleSwipe();
              }
            }}
            whileDrag={{ cursor: "grabbing" }}
          >
            {card}
          </motion.div>
        );
      })}
    </div>
  );
});

interface TiltHoverCardProps {
  children: ReactNode;
  maxTilt?: number;
  glareEnabled?: boolean;
  className?: string;
}

/**
 * Tilt Hover Card - 3D tilt on hover
 */
export const TiltHoverCard = memo(function TiltHoverCard({
  children,
  maxTilt = 15,
  glareEnabled = true,
  className = "",
}: TiltHoverCardProps) {
  const { colors } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [glarePosition, setGlarePosition] = useState({ x: 50, y: 50 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      setRotation({
        x: (y - 0.5) * -maxTilt * 2,
        y: (x - 0.5) * maxTilt * 2,
      });
      setGlarePosition({ x: x * 100, y: y * 100 });
    },
    [maxTilt]
  );

  const handleMouseLeave = useCallback(() => {
    setRotation({ x: 0, y: 0 });
    setGlarePosition({ x: 50, y: 50 });
  }, []);

  return (
    <motion.div
      ref={ref}
      className={"relative rounded-2xl p-6 overflow-hidden " + className}
      style={{
        backgroundColor: colors.warmWhite,
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
        transformStyle: "preserve-3d",
        perspective: "1000px",
      }}
      animate={{
        rotateX: rotation.x,
        rotateY: rotation.y,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {glareEnabled && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at ${glarePosition.x}% ${glarePosition.y}%, rgba(255,255,255,0.3) 0%, transparent 60%)`,
          }}
        />
      )}
    </motion.div>
  );
});

interface AccordionCardProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Accordion Card - Collapsible card
 */
export const AccordionCard = memo(function AccordionCard({
  title,
  children,
  defaultOpen = false,
  className = "",
}: AccordionCardProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={"rounded-2xl overflow-hidden " + className}
      style={{
        backgroundColor: colors.warmWhite,
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
      }}
    >
      <button
        className="w-full p-6 flex items-center justify-between text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div style={{ color: colors.textPrimary }}>{title}</div>
        <motion.svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="px-6 pb-6" style={{ color: colors.textSecondary }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface HoverScaleCardProps {
  children: ReactNode;
  scale?: number;
  className?: string;
  onClick?: () => void;
}

/**
 * Hover Scale Card - Scale up on hover
 */
export const HoverScaleCard = memo(function HoverScaleCard({
  children,
  scale = 1.05,
  className = "",
  onClick,
}: HoverScaleCardProps) {
  const { colors } = useTheme();

  return (
    <motion.div
      className={"rounded-2xl p-6 cursor-pointer " + className}
      style={{
        backgroundColor: colors.warmWhite,
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
      }}
      whileHover={{
        scale,
        boxShadow: "0 10px 40px rgba(0, 0, 0, 0.15)",
      }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
});

interface ShineCardProps {
  children: ReactNode;
  className?: string;
}

/**
 * Shine Card - Animated shine effect
 */
export const ShineCard = memo(function ShineCard({
  children,
  className = "",
}: ShineCardProps) {
  const { colors } = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={"relative rounded-2xl p-6 overflow-hidden " + className}
      style={{
        backgroundColor: colors.warmWhite,
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}

      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.5) 50%, transparent 60%)",
          transform: "translateX(-100%)",
        }}
        animate={{
          transform: isHovered ? "translateX(100%)" : "translateX(-100%)",
        }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      />
    </div>
  );
});

interface PressableCardProps {
  children: ReactNode;
  className?: string;
  onPress?: () => void;
  pressDepth?: number;
}

/**
 * Pressable Card - Press down effect
 */
export const PressableCard = memo(function PressableCard({
  children,
  className = "",
  onPress,
  pressDepth = 4,
}: PressableCardProps) {
  const { colors } = useTheme();

  return (
    <motion.div
      className={"rounded-2xl p-6 cursor-pointer " + className}
      style={{
        backgroundColor: colors.warmWhite,
        boxShadow: "0 " + pressDepth + "px 0 " + colors.cream + ", 0 4px 20px rgba(0, 0, 0, 0.1)",
      }}
      whileHover={{ y: -2 }}
      whileTap={{
        y: pressDepth,
        boxShadow: "0 0px 0 " + colors.cream + ", 0 2px 10px rgba(0, 0, 0, 0.1)",
      }}
      transition={{ duration: 0.1 }}
      onClick={onPress}
    >
      {children}
    </motion.div>
  );
});

export default FlipCard;
