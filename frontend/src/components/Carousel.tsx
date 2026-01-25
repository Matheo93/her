"use client";

/**
 * Carousel Components - Sprint 672
 *
 * Image/content carousel:
 * - Slide navigation
 * - Auto-play
 * - Indicators
 * - Thumbnails
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface CarouselProps {
  children: ReactNode[];
  autoPlay?: boolean;
  interval?: number;
  showArrows?: boolean;
  showIndicators?: boolean;
  showThumbnails?: boolean;
  loop?: boolean;
  className?: string;
}

/**
 * Main Carousel Component
 */
export const Carousel = memo(function Carousel({
  children,
  autoPlay = false,
  interval = 5000,
  showArrows = true,
  showIndicators = true,
  showThumbnails = false,
  loop = true,
  className = "",
}: CarouselProps) {
  const { colors } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const totalSlides = children.length;

  const goToSlide = useCallback((index: number) => {
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
  }, [currentIndex]);

  const nextSlide = useCallback(() => {
    if (currentIndex === totalSlides - 1) {
      if (loop) {
        setDirection(1);
        setCurrentIndex(0);
      }
    } else {
      setDirection(1);
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, totalSlides, loop]);

  const prevSlide = useCallback(() => {
    if (currentIndex === 0) {
      if (loop) {
        setDirection(-1);
        setCurrentIndex(totalSlides - 1);
      }
    } else {
      setDirection(-1);
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex, totalSlides, loop]);

  // Auto-play
  useEffect(() => {
    if (autoPlay && !isPaused) {
      timerRef.current = setInterval(nextSlide, interval);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [autoPlay, isPaused, interval, nextSlide]);

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  return (
    <div
      className={"relative " + className}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Slides */}
      <div className="relative overflow-hidden rounded-lg" style={{ minHeight: 200 }}>
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            {children[currentIndex]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Arrows */}
      {showArrows && totalSlides > 1 && (
        <>
          <motion.button
            onClick={prevSlide}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: colors.warmWhite + "cc",
              color: colors.textPrimary,
            }}
            whileHover={{ scale: 1.1, backgroundColor: colors.warmWhite }}
            whileTap={{ scale: 0.9 }}
            disabled={!loop && currentIndex === 0}
          >
            <ChevronLeftIcon />
          </motion.button>
          <motion.button
            onClick={nextSlide}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: colors.warmWhite + "cc",
              color: colors.textPrimary,
            }}
            whileHover={{ scale: 1.1, backgroundColor: colors.warmWhite }}
            whileTap={{ scale: 0.9 }}
            disabled={!loop && currentIndex === totalSlides - 1}
          >
            <ChevronRightIcon />
          </motion.button>
        </>
      )}

      {/* Indicators */}
      {showIndicators && totalSlides > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {children.map((_, index) => (
            <motion.button
              key={index}
              onClick={() => goToSlide(index)}
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: index === currentIndex ? colors.coral : colors.warmWhite,
              }}
              whileHover={{ scale: 1.3 }}
            />
          ))}
        </div>
      )}

      {/* Thumbnails */}
      {showThumbnails && totalSlides > 1 && (
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
          {children.map((child, index) => (
            <motion.button
              key={index}
              onClick={() => goToSlide(index)}
              className="flex-shrink-0 w-16 h-12 rounded overflow-hidden"
              style={{
                border: index === currentIndex ? "2px solid " + colors.coral : "2px solid transparent",
                opacity: index === currentIndex ? 1 : 0.6,
              }}
              whileHover={{ opacity: 1 }}
            >
              <div className="w-full h-full scale-50 origin-top-left">
                {child}
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
});

interface ImageCarouselProps {
  images: Array<{
    src: string;
    alt?: string;
    caption?: string;
  }>;
  aspectRatio?: string;
  objectFit?: "cover" | "contain";
  autoPlay?: boolean;
  interval?: number;
  className?: string;
}

/**
 * Image-specific Carousel
 */
export const ImageCarousel = memo(function ImageCarousel({
  images,
  aspectRatio = "16/9",
  objectFit = "cover",
  autoPlay = false,
  interval = 5000,
  className = "",
}: ImageCarouselProps) {
  const { colors } = useTheme();

  return (
    <Carousel
      autoPlay={autoPlay}
      interval={interval}
      className={className}
    >
      {images.map((image, index) => (
        <div
          key={index}
          className="relative w-full"
          style={{ aspectRatio }}
        >
          <img
            src={image.src}
            alt={image.alt || "Slide " + (index + 1)}
            className="w-full h-full"
            style={{ objectFit }}
          />
          {image.caption && (
            <div
              className="absolute bottom-0 left-0 right-0 p-4"
              style={{
                background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
              }}
            >
              <p className="text-white text-sm">{image.caption}</p>
            </div>
          )}
        </div>
      ))}
    </Carousel>
  );
});

interface CardCarouselProps {
  cards: ReactNode[];
  visibleCards?: number;
  gap?: number;
  className?: string;
}

/**
 * Multi-card Carousel
 */
export const CardCarousel = memo(function CardCarousel({
  cards,
  visibleCards = 3,
  gap = 16,
  className = "",
}: CardCarouselProps) {
  const { colors } = useTheme();
  const [startIndex, setStartIndex] = useState(0);

  const canGoPrev = startIndex > 0;
  const canGoNext = startIndex + visibleCards < cards.length;

  const next = () => {
    if (canGoNext) setStartIndex(startIndex + 1);
  };

  const prev = () => {
    if (canGoPrev) setStartIndex(startIndex - 1);
  };

  const visibleCardsArray = cards.slice(startIndex, startIndex + visibleCards);

  return (
    <div className={"relative " + className}>
      <div
        className="flex overflow-hidden"
        style={{ gap }}
      >
        <AnimatePresence mode="popLayout">
          {visibleCardsArray.map((card, index) => (
            <motion.div
              key={startIndex + index}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
              className="flex-shrink-0"
              style={{ width: "calc((100% - " + (gap * (visibleCards - 1)) + "px) / " + visibleCards + ")" }}
            >
              {card}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      {cards.length > visibleCards && (
        <div className="flex justify-center gap-4 mt-4">
          <motion.button
            onClick={prev}
            disabled={!canGoPrev}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: colors.cream,
              color: canGoPrev ? colors.textPrimary : colors.textMuted,
              opacity: canGoPrev ? 1 : 0.5,
            }}
            whileHover={canGoPrev ? { scale: 1.1 } : {}}
          >
            <ChevronLeftIcon />
          </motion.button>
          <motion.button
            onClick={next}
            disabled={!canGoNext}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: colors.cream,
              color: canGoNext ? colors.textPrimary : colors.textMuted,
              opacity: canGoNext ? 1 : 0.5,
            }}
            whileHover={canGoNext ? { scale: 1.1 } : {}}
          >
            <ChevronRightIcon />
          </motion.button>
        </div>
      )}
    </div>
  );
});

interface FadeCarouselProps {
  children: ReactNode[];
  autoPlay?: boolean;
  interval?: number;
  className?: string;
}

/**
 * Fade Transition Carousel
 */
export const FadeCarousel = memo(function FadeCarousel({
  children,
  autoPlay = true,
  interval = 4000,
  className = "",
}: FadeCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!autoPlay) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % children.length);
    }, interval);
    return () => clearInterval(timer);
  }, [autoPlay, interval, children.length]);

  return (
    <div className={"relative " + className}>
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {children[currentIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

// Icons
function ChevronLeftIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export default Carousel;
