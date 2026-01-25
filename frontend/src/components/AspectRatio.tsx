"use client";

/**
 * AspectRatio Components - Sprint 710
 *
 * Constrained aspect ratio containers:
 * - Preset ratios (16:9, 4:3, etc.)
 * - Custom ratios
 * - Responsive
 * - Media embedding
 * - HER-themed styling
 */

import React, { memo, ReactNode, CSSProperties } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type PresetRatio = "1:1" | "4:3" | "3:2" | "16:9" | "21:9" | "2:3" | "3:4" | "9:16";

interface AspectRatioProps {
  ratio?: number | PresetRatio;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const PRESET_RATIOS: Record<PresetRatio, number> = {
  "1:1": 1,
  "4:3": 4 / 3,
  "3:2": 3 / 2,
  "16:9": 16 / 9,
  "21:9": 21 / 9,
  "2:3": 2 / 3,
  "3:4": 3 / 4,
  "9:16": 9 / 16,
};

/**
 * AspectRatio Container
 */
export const AspectRatio = memo(function AspectRatio({
  ratio = "16:9",
  children,
  className = "",
  style,
}: AspectRatioProps) {
  const numericRatio = typeof ratio === "number" ? ratio : PRESET_RATIOS[ratio] || 16 / 9;
  const paddingTop = `${(1 / numericRatio) * 100}%`;

  return (
    <div
      className={"relative w-full " + className}
      style={{
        paddingTop,
        ...style,
      }}
    >
      <div className="absolute inset-0">{children}</div>
    </div>
  );
});

interface AspectImageProps {
  src: string;
  alt: string;
  ratio?: number | PresetRatio;
  objectFit?: "cover" | "contain" | "fill" | "none";
  objectPosition?: string;
  loading?: "lazy" | "eager";
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * Image with aspect ratio constraint
 */
export const AspectImage = memo(function AspectImage({
  src,
  alt,
  ratio = "16:9",
  objectFit = "cover",
  objectPosition = "center",
  loading = "lazy",
  className = "",
  onLoad,
  onError,
}: AspectImageProps) {
  return (
    <AspectRatio ratio={ratio} className={className}>
      <img
        src={src}
        alt={alt}
        loading={loading}
        onLoad={onLoad}
        onError={onError}
        className="w-full h-full"
        style={{
          objectFit,
          objectPosition,
        }}
      />
    </AspectRatio>
  );
});

interface AspectVideoProps {
  src?: string;
  poster?: string;
  ratio?: number | PresetRatio;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  playsInline?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * Video with aspect ratio constraint
 */
export const AspectVideo = memo(function AspectVideo({
  src,
  poster,
  ratio = "16:9",
  autoPlay = false,
  muted = true,
  loop = false,
  controls = true,
  playsInline = true,
  className = "",
  children,
}: AspectVideoProps) {
  return (
    <AspectRatio ratio={ratio} className={className}>
      <video
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        controls={controls}
        playsInline={playsInline}
        className="w-full h-full object-cover"
      >
        {children}
      </video>
    </AspectRatio>
  );
});

interface AspectIframeProps {
  src: string;
  title: string;
  ratio?: number | PresetRatio;
  allow?: string;
  allowFullScreen?: boolean;
  className?: string;
}

/**
 * Iframe with aspect ratio constraint (for embeds)
 */
export const AspectIframe = memo(function AspectIframe({
  src,
  title,
  ratio = "16:9",
  allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
  allowFullScreen = true,
  className = "",
}: AspectIframeProps) {
  return (
    <AspectRatio ratio={ratio} className={className}>
      <iframe
        src={src}
        title={title}
        allow={allow}
        allowFullScreen={allowFullScreen}
        className="w-full h-full border-0"
      />
    </AspectRatio>
  );
});

interface YouTubeEmbedProps {
  videoId: string;
  title?: string;
  ratio?: number | PresetRatio;
  autoplay?: boolean;
  start?: number;
  className?: string;
}

/**
 * YouTube video embed
 */
export const YouTubeEmbed = memo(function YouTubeEmbed({
  videoId,
  title = "YouTube video",
  ratio = "16:9",
  autoplay = false,
  start,
  className = "",
}: YouTubeEmbedProps) {
  let src = `https://www.youtube.com/embed/${videoId}`;
  const params: string[] = [];

  if (autoplay) params.push("autoplay=1");
  if (start) params.push(`start=${start}`);

  if (params.length) src += `?${params.join("&")}`;

  return (
    <AspectIframe
      src={src}
      title={title}
      ratio={ratio}
      className={className}
    />
  );
});

interface VimeoEmbedProps {
  videoId: string;
  title?: string;
  ratio?: number | PresetRatio;
  autoplay?: boolean;
  className?: string;
}

/**
 * Vimeo video embed
 */
export const VimeoEmbed = memo(function VimeoEmbed({
  videoId,
  title = "Vimeo video",
  ratio = "16:9",
  autoplay = false,
  className = "",
}: VimeoEmbedProps) {
  const src = `https://player.vimeo.com/video/${videoId}${autoplay ? "?autoplay=1" : ""}`;

  return (
    <AspectIframe
      src={src}
      title={title}
      ratio={ratio}
      className={className}
    />
  );
});

interface AspectCardProps {
  ratio?: number | PresetRatio;
  image?: string;
  imageAlt?: string;
  overlay?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  className?: string;
}

/**
 * Card with aspect ratio and optional overlay
 */
export const AspectCard = memo(function AspectCard({
  ratio = "16:9",
  image,
  imageAlt = "",
  overlay,
  children,
  onClick,
  className = "",
}: AspectCardProps) {
  const { colors } = useTheme();

  return (
    <motion.div
      onClick={onClick}
      className={"rounded-xl overflow-hidden " + className}
      style={{
        cursor: onClick ? "pointer" : "default",
        backgroundColor: colors.cream,
      }}
      whileHover={onClick ? { scale: 1.02 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
    >
      <AspectRatio ratio={ratio}>
        {image && (
          <img
            src={image}
            alt={imageAlt}
            className="w-full h-full object-cover"
          />
        )}
        {overlay && (
          <div className="absolute inset-0">{overlay}</div>
        )}
        {children && (
          <div className="absolute inset-0 flex items-center justify-center">
            {children}
          </div>
        )}
      </AspectRatio>
    </motion.div>
  );
});

interface ResponsiveAspectProps {
  children: ReactNode;
  ratios?: {
    default?: number | PresetRatio;
    sm?: number | PresetRatio;
    md?: number | PresetRatio;
    lg?: number | PresetRatio;
    xl?: number | PresetRatio;
  };
  className?: string;
}

/**
 * Responsive aspect ratio (changes at breakpoints)
 */
export const ResponsiveAspect = memo(function ResponsiveAspect({
  children,
  ratios = { default: "16:9" },
  className = "",
}: ResponsiveAspectProps) {
  // This creates separate containers for each breakpoint
  // CSS will show/hide the appropriate one
  const defaultRatio = ratios.default || "16:9";

  return (
    <>
      {/* XL */}
      {ratios.xl && (
        <div className={`hidden xl:block ${className}`}>
          <AspectRatio ratio={ratios.xl}>{children}</AspectRatio>
        </div>
      )}

      {/* LG */}
      {ratios.lg && (
        <div className={`hidden lg:block ${ratios.xl ? "xl:hidden" : ""} ${className}`}>
          <AspectRatio ratio={ratios.lg}>{children}</AspectRatio>
        </div>
      )}

      {/* MD */}
      {ratios.md && (
        <div
          className={`hidden md:block ${ratios.lg ? "lg:hidden" : ""} ${ratios.xl ? "xl:hidden" : ""} ${className}`}
        >
          <AspectRatio ratio={ratios.md}>{children}</AspectRatio>
        </div>
      )}

      {/* SM */}
      {ratios.sm && (
        <div
          className={`hidden sm:block ${ratios.md ? "md:hidden" : ""} ${ratios.lg ? "lg:hidden" : ""} ${ratios.xl ? "xl:hidden" : ""} ${className}`}
        >
          <AspectRatio ratio={ratios.sm}>{children}</AspectRatio>
        </div>
      )}

      {/* Default */}
      <div
        className={`block ${ratios.sm ? "sm:hidden" : ""} ${ratios.md ? "md:hidden" : ""} ${ratios.lg ? "lg:hidden" : ""} ${ratios.xl ? "xl:hidden" : ""} ${className}`}
      >
        <AspectRatio ratio={defaultRatio}>{children}</AspectRatio>
      </div>
    </>
  );
});

// Helper hook for calculating aspect ratio
export function useAspectRatio(width: number, height: number) {
  const ratio = width / height;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);

  return {
    ratio,
    simplified: `${width / divisor}:${height / divisor}`,
    paddingTop: `${(1 / ratio) * 100}%`,
  };
}

export default AspectRatio;
