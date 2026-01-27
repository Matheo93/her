"use client";

/**
 * Image Gallery Components - Sprint 744
 *
 * Image gallery with lightbox:
 * - Grid layout
 * - Lightbox viewer
 * - Navigation
 * - Zoom and pan
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface GalleryImage {
  src: string;
  thumbnail?: string;
  alt?: string;
  title?: string;
  description?: string;
}

interface ImageGalleryProps {
  images: GalleryImage[];
  columns?: number;
  gap?: number;
  aspectRatio?: number;
  enableLightbox?: boolean;
  onImageClick?: (index: number) => void;
  className?: string;
}

/**
 * Image Gallery
 */
export const ImageGallery = memo(function ImageGallery({
  images,
  columns = 3,
  gap = 8,
  aspectRatio = 1,
  enableLightbox = true,
  onImageClick,
  className = "",
}: ImageGalleryProps) {
  const { colors } = useTheme();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleImageClick = useCallback((index: number) => {
    if (enableLightbox) {
      setLightboxIndex(index);
    }
    onImageClick?.(index);
  }, [enableLightbox, onImageClick]);

  const handleClose = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const handlePrev = useCallback(() => {
    setLightboxIndex((prev) => 
      prev !== null ? (prev - 1 + images.length) % images.length : null
    );
  }, [images.length]);

  const handleNext = useCallback(() => {
    setLightboxIndex((prev) => 
      prev !== null ? (prev + 1) % images.length : null
    );
  }, [images.length]);

  return (
    <>
      <div
        className={"grid " + className}
        style={{
          gridTemplateColumns: "repeat(" + columns + ", minmax(0, 1fr))",
          gap: gap,
        }}
      >
        {images.map((image, index) => (
          <GalleryThumbnail
            key={index}
            image={image}
            aspectRatio={aspectRatio}
            onClick={() => handleImageClick(index)}
          />
        ))}
      </div>

      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox
            images={images}
            currentIndex={lightboxIndex}
            onClose={handleClose}
            onPrev={handlePrev}
            onNext={handleNext}
          />
        )}
      </AnimatePresence>
    </>
  );
});

interface GalleryThumbnailProps {
  image: GalleryImage;
  aspectRatio: number;
  onClick: () => void;
}

/**
 * Gallery Thumbnail
 */
const GalleryThumbnail = memo(function GalleryThumbnail({
  image,
  aspectRatio,
  onClick,
}: GalleryThumbnailProps) {
  const { colors } = useTheme();
  const [loaded, setLoaded] = useState(false);

  return (
    <motion.button
      onClick={onClick}
      className="relative overflow-hidden rounded-lg"
      style={{ 
        aspectRatio: aspectRatio,
        backgroundColor: colors.cream,
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <img
        src={image.thumbnail || image.src}
        alt={image.alt || ""}
        className={"absolute inset-0 w-full h-full object-cover transition-opacity duration-300 " + (loaded ? "opacity-100" : "opacity-0")}
        onLoad={() => setLoaded(true)}
      />
      
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div 
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: colors.coral, borderTopColor: "transparent" }}
          />
        </div>
      )}

      {image.title && (
        <div 
          className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/50 to-transparent"
        >
          <p className="text-white text-sm font-medium truncate">{image.title}</p>
        </div>
      )}
    </motion.button>
  );
});

interface LightboxProps {
  images: GalleryImage[];
  currentIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Lightbox Viewer
 */
const Lightbox = memo(function Lightbox({
  images,
  currentIndex,
  onClose,
  onPrev,
  onNext,
}: LightboxProps) {
  const { colors } = useTheme();
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const currentImage = images[currentIndex];

  // Reset zoom on image change
  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          onPrev();
          break;
        case "ArrowRight":
          onNext();
          break;
        case "+":
        case "=":
          setZoom((z) => Math.min(z + 0.5, 4));
          break;
        case "-":
          setZoom((z) => Math.max(z - 0.5, 1));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onPrev, onNext]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setZoom((z) => Math.min(Math.max(z + delta, 1), 4));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [zoom, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 0.5, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - 0.5, 1));
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="text-white">
          <span className="text-lg font-medium">{currentIndex + 1}</span>
          <span className="text-white/60"> / {images.length}</span>
        </div>

        <div className="flex items-center gap-2">
          <LightboxButton onClick={handleZoomOut} disabled={zoom <= 1}>
            <ZoomOutIcon />
          </LightboxButton>
          <span className="text-white text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
          <LightboxButton onClick={handleZoomIn} disabled={zoom >= 4}>
            <ZoomInIcon />
          </LightboxButton>
          <LightboxButton onClick={handleReset}>
            <ResetIcon />
          </LightboxButton>
          <LightboxButton onClick={onClose}>
            <CloseIcon />
          </LightboxButton>
        </div>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <motion.img
          key={currentIndex}
          src={currentImage.src}
          alt={currentImage.alt || ""}
          className="max-w-full max-h-full object-contain select-none"
          style={{
            transform: "scale(" + zoom + ") translate(" + (position.x / zoom) + "px, " + (position.y / zoom) + "px)",
            cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          draggable={false}
        />
      </div>

      {/* Navigation */}
      <div className="absolute inset-y-0 left-0 flex items-center p-4">
        <LightboxButton onClick={onPrev} size="lg">
          <ChevronLeftIcon />
        </LightboxButton>
      </div>

      <div className="absolute inset-y-0 right-0 flex items-center p-4">
        <LightboxButton onClick={onNext} size="lg">
          <ChevronRightIcon />
        </LightboxButton>
      </div>

      {/* Footer */}
      {(currentImage.title || currentImage.description) && (
        <div className="p-4 text-center">
          {currentImage.title && (
            <h3 className="text-white text-lg font-medium">{currentImage.title}</h3>
          )}
          {currentImage.description && (
            <p className="text-white/70 text-sm mt-1">{currentImage.description}</p>
          )}
        </div>
      )}

      {/* Thumbnails */}
      <div className="p-4 flex justify-center gap-2 overflow-x-auto">
        {images.map((image, index) => (
          <button
            key={index}
            onClick={() => {
              setZoom(1);
              setPosition({ x: 0, y: 0 });
            }}
            className={"w-16 h-16 rounded-lg overflow-hidden transition-all " + (index === currentIndex ? "ring-2 ring-white" : "opacity-50 hover:opacity-100")}
          >
            <img
              src={image.thumbnail || image.src}
              alt=""
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    </motion.div>
  );
});

interface LightboxButtonProps {
  onClick: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

/**
 * Lightbox Button
 */
const LightboxButton = memo(function LightboxButton({
  onClick,
  disabled = false,
  size = "md",
  children,
}: LightboxButtonProps) {
  const sizes = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={"flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed " + sizes[size]}
    >
      {children}
    </button>
  );
});

// Icons
const ZoomInIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const ZoomOutIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const ResetIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export default ImageGallery;
