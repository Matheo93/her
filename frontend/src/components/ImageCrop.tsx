"use client";

/**
 * Image Crop Components - Sprint 734
 *
 * Image cropping utilities:
 * - Crop area selection
 * - Aspect ratio locking
 * - Zoom and rotate
 * - Preview
 * - HER-themed styling
 */

import React, { memo, useState, useRef, useCallback, useEffect, ReactNode } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageCropProps {
  src: string;
  aspectRatio?: number;
  minWidth?: number;
  minHeight?: number;
  circular?: boolean;
  zoom?: number;
  rotation?: number;
  onCropChange?: (crop: CropArea) => void;
  onComplete?: (croppedImage: string) => void;
  className?: string;
}

/**
 * Image Crop
 */
export const ImageCrop = memo(function ImageCrop({
  src,
  aspectRatio,
  minWidth = 50,
  minHeight = 50,
  circular = false,
  zoom = 1,
  rotation = 0,
  onCropChange,
  onComplete,
  className = "",
}: ImageCropProps) {
  const { colors } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState<CropArea>({ x: 0, y: 0, width: 100, height: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string>("");
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Initialize crop area
  useEffect(() => {
    if (!imageLoaded || !containerRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    let cropWidth = containerWidth * 0.8;
    let cropHeight = containerHeight * 0.8;

    if (aspectRatio) {
      if (cropWidth / cropHeight > aspectRatio) {
        cropWidth = cropHeight * aspectRatio;
      } else {
        cropHeight = cropWidth / aspectRatio;
      }
    }

    const initialCrop = {
      x: (containerWidth - cropWidth) / 2,
      y: (containerHeight - cropHeight) / 2,
      width: cropWidth,
      height: cropHeight,
    };

    setCrop(initialCrop);
    onCropChange?.(initialCrop);
  }, [imageLoaded, aspectRatio, onCropChange]);

  // Handle image load
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    setImageLoaded(true);
  }, []);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent, handle?: string) => {
    e.preventDefault();

    if (handle) {
      setIsResizing(true);
      setResizeHandle(handle);
    } else {
      setIsDragging(true);
    }

    setDragStart({
      x: e.clientX - crop.x,
      y: e.clientY - crop.y,
    });
  }, [crop]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();

    if (isDragging) {
      const newX = Math.max(0, Math.min(e.clientX - dragStart.x, containerRect.width - crop.width));
      const newY = Math.max(0, Math.min(e.clientY - dragStart.y, containerRect.height - crop.height));

      const newCrop = { ...crop, x: newX, y: newY };
      setCrop(newCrop);
      onCropChange?.(newCrop);
    } else if (isResizing) {
      let newCrop = { ...crop };
      const mouseX = e.clientX - containerRect.left;
      const mouseY = e.clientY - containerRect.top;

      switch (resizeHandle) {
        case "se":
          newCrop.width = Math.max(minWidth, mouseX - crop.x);
          newCrop.height = aspectRatio
            ? newCrop.width / aspectRatio
            : Math.max(minHeight, mouseY - crop.y);
          break;
        case "sw":
          const newWidthSW = Math.max(minWidth, crop.x + crop.width - mouseX);
          newCrop.x = crop.x + crop.width - newWidthSW;
          newCrop.width = newWidthSW;
          newCrop.height = aspectRatio
            ? newCrop.width / aspectRatio
            : Math.max(minHeight, mouseY - crop.y);
          break;
        case "ne":
          newCrop.width = Math.max(minWidth, mouseX - crop.x);
          const newHeightNE = Math.max(minHeight, crop.y + crop.height - mouseY);
          newCrop.y = aspectRatio
            ? crop.y + crop.height - newCrop.width / aspectRatio
            : crop.y + crop.height - newHeightNE;
          newCrop.height = aspectRatio ? newCrop.width / aspectRatio : newHeightNE;
          break;
        case "nw":
          const newWidthNW = Math.max(minWidth, crop.x + crop.width - mouseX);
          const newHeightNW = aspectRatio
            ? newWidthNW / aspectRatio
            : Math.max(minHeight, crop.y + crop.height - mouseY);
          newCrop.x = crop.x + crop.width - newWidthNW;
          newCrop.y = aspectRatio
            ? crop.y + crop.height - newHeightNW
            : crop.y + crop.height - newHeightNW;
          newCrop.width = newWidthNW;
          newCrop.height = newHeightNW;
          break;
      }

      // Constrain to container
      newCrop.x = Math.max(0, Math.min(newCrop.x, containerRect.width - newCrop.width));
      newCrop.y = Math.max(0, Math.min(newCrop.y, containerRect.height - newCrop.height));

      setCrop(newCrop);
      onCropChange?.(newCrop);
    }
  }, [isDragging, isResizing, dragStart, crop, resizeHandle, aspectRatio, minWidth, minHeight, onCropChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle("");
  }, []);

  // Generate cropped image
  const generateCroppedImage = useCallback((): string => {
    if (!imageRef.current || !canvasRef.current || !containerRef.current) {
      return "";
    }

    const image = imageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) return "";

    const container = containerRef.current;
    const scaleX = image.naturalWidth / container.clientWidth;
    const scaleY = image.naturalHeight / container.clientHeight;

    canvas.width = crop.width * scaleX;
    canvas.height = crop.height * scaleY;

    // Apply transformations
    ctx.save();

    if (rotation !== 0) {
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
    }

    ctx.drawImage(
      image,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.restore();

    // Apply circular mask if needed
    if (circular) {
      ctx.globalCompositeOperation = "destination-in";
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvas.toDataURL("image/png");
  }, [crop, rotation, circular]);

  // Handle complete
  const handleComplete = useCallback(() => {
    const croppedImage = generateCroppedImage();
    onComplete?.(croppedImage);
  }, [generateCroppedImage, onComplete]);

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div
        ref={containerRef}
        className="relative overflow-hidden bg-gray-100 rounded-xl select-none"
        style={{ minHeight: 300 }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Image */}
        <img
          ref={imageRef}
          src={src}
          alt="Crop source"
          className="w-full h-full object-contain pointer-events-none"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: "center",
          }}
          onLoad={handleImageLoad}
        />

        {/* Overlay */}
        {imageLoaded && (
          <>
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            />

            {/* Crop area */}
            <motion.div
              className="absolute cursor-move"
              style={{
                left: crop.x,
                top: crop.y,
                width: crop.width,
                height: crop.height,
                borderRadius: circular ? "50%" : 4,
                border: `2px solid ${colors.coral}`,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
              }}
              onMouseDown={(e) => handleMouseDown(e)}
            >
              {/* Grid lines */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/30" />
                <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/30" />
                <div className="absolute top-1/3 left-0 right-0 border-t border-white/30" />
                <div className="absolute top-2/3 left-0 right-0 border-t border-white/30" />
              </div>

              {/* Resize handles */}
              {!circular && (
                <>
                  <ResizeHandle position="nw" onMouseDown={handleMouseDown} color={colors.coral} />
                  <ResizeHandle position="ne" onMouseDown={handleMouseDown} color={colors.coral} />
                  <ResizeHandle position="sw" onMouseDown={handleMouseDown} color={colors.coral} />
                  <ResizeHandle position="se" onMouseDown={handleMouseDown} color={colors.coral} />
                </>
              )}
            </motion.div>
          </>
        )}

        {/* Hidden canvas for export */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Apply button */}
      {onComplete && (
        <button
          onClick={handleComplete}
          className="px-6 py-2 rounded-lg font-medium transition-colors"
          style={{
            backgroundColor: colors.coral,
            color: colors.warmWhite,
          }}
        >
          Apply Crop
        </button>
      )}
    </div>
  );
});

interface ResizeHandleProps {
  position: "nw" | "ne" | "sw" | "se";
  onMouseDown: (e: React.MouseEvent, handle: string) => void;
  color: string;
}

/**
 * Resize Handle
 */
const ResizeHandle = memo(function ResizeHandle({
  position,
  onMouseDown,
  color,
}: ResizeHandleProps) {
  const positionStyles: Record<string, React.CSSProperties> = {
    nw: { top: -4, left: -4, cursor: "nw-resize" },
    ne: { top: -4, right: -4, cursor: "ne-resize" },
    sw: { bottom: -4, left: -4, cursor: "sw-resize" },
    se: { bottom: -4, right: -4, cursor: "se-resize" },
  };

  return (
    <div
      className="absolute w-3 h-3 rounded-full"
      style={{
        ...positionStyles[position],
        backgroundColor: color,
        border: "2px solid white",
      }}
      onMouseDown={(e) => onMouseDown(e, position)}
    />
  );
});

interface ImageCropPreviewProps {
  src: string;
  crop: CropArea;
  circular?: boolean;
  size?: number;
  className?: string;
}

/**
 * Crop Preview
 */
export const ImageCropPreview = memo(function ImageCropPreview({
  src,
  crop,
  circular = false,
  size = 100,
  className = "",
}: ImageCropPreviewProps) {
  const { colors } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = size;
      canvas.height = size;

      const scaleX = img.naturalWidth / crop.width;
      const scaleY = img.naturalHeight / crop.height;

      ctx.drawImage(
        img,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        size,
        size
      );

      if (circular) {
        ctx.globalCompositeOperation = "destination-in";
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      setPreview(canvas.toDataURL());
    };
    img.src = src;
  }, [src, crop, circular, size]);

  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: circular ? "50%" : 8,
        border: `2px solid ${colors.cream}`,
      }}
    >
      {preview && <img src={preview} alt="Preview" className="w-full h-full object-cover" />}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
});

interface ImageCropControlsProps {
  zoom: number;
  rotation: number;
  onZoomChange: (zoom: number) => void;
  onRotationChange: (rotation: number) => void;
  onReset?: () => void;
  className?: string;
}

/**
 * Crop Controls
 */
export const ImageCropControls = memo(function ImageCropControls({
  zoom,
  rotation,
  onZoomChange,
  onRotationChange,
  onReset,
  className = "",
}: ImageCropControlsProps) {
  const { colors } = useTheme();

  return (
    <div className={`flex flex-col gap-4 p-4 rounded-xl ${className}`} style={{ backgroundColor: colors.cream }}>
      {/* Zoom */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>
            Zoom
          </span>
          <span className="text-sm" style={{ color: colors.textMuted }}>
            {Math.round(zoom * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.1}
          value={zoom}
          onChange={(e) => onZoomChange(parseFloat(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{ backgroundColor: colors.warmWhite }}
        />
      </div>

      {/* Rotation */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: colors.textPrimary }}>
            Rotation
          </span>
          <span className="text-sm" style={{ color: colors.textMuted }}>
            {rotation}°
          </span>
        </div>
        <input
          type="range"
          min={-180}
          max={180}
          step={1}
          value={rotation}
          onChange={(e) => onRotationChange(parseInt(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{ backgroundColor: colors.warmWhite }}
        />
      </div>

      {/* Reset */}
      {onReset && (
        <button
          onClick={onReset}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: colors.warmWhite,
            color: colors.textPrimary,
          }}
        >
          Reset
        </button>
      )}
    </div>
  );
});

export default ImageCrop;
