"use client";

/**
 * Color Picker Components - Sprint 664
 *
 * Color selection components:
 * - Color picker
 * - Palette picker
 * - Gradient picker
 * - Alpha slider
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  showAlpha?: boolean;
  showInput?: boolean;
  presets?: string[];
  disabled?: boolean;
  className?: string;
}

/**
 * Full Color Picker
 */
export const ColorPicker = memo(function ColorPicker({
  value,
  onChange,
  showAlpha = false,
  showInput = true,
  presets,
  disabled = false,
  className = "",
}: ColorPickerProps) {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [lightness, setLightness] = useState(50);
  const [alpha, setAlpha] = useState(1);

  const satLightRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  // Parse initial color
  useEffect(() => {
    const parsed = parseColor(value);
    if (parsed) {
      setHue(parsed.h);
      setSaturation(parsed.s);
      setLightness(parsed.l);
      setAlpha(parsed.a);
    }
  }, [value]);

  const updateColor = useCallback((h: number, s: number, l: number, a: number) => {
    const newColor = showAlpha
      ? hslToHex(h, s, l) + Math.round(a * 255).toString(16).padStart(2, "0")
      : hslToHex(h, s, l);
    onChange(newColor);
  }, [onChange, showAlpha]);

  const handleSatLightChange = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!satLightRef.current || disabled) return;
    const rect = satLightRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const s = x * 100;
    const l = 100 - y * 100;
    setSaturation(s);
    setLightness(l);
    updateColor(hue, s, l, alpha);
  }, [disabled, hue, alpha, updateColor]);

  const handleHueChange = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!hueRef.current || disabled) return;
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const h = x * 360;
    setHue(h);
    updateColor(h, saturation, lightness, alpha);
  }, [disabled, saturation, lightness, alpha, updateColor]);

  return (
    <div className={"relative inline-block " + className}>
      {/* Trigger */}
      <motion.button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-lg border-2 shadow-sm"
        style={{
          backgroundColor: value,
          borderColor: colors.cream,
          opacity: disabled ? 0.5 : 1,
        }}
        whileHover={disabled ? {} : { scale: 1.05 }}
        disabled={disabled}
      />

      {/* Popup */}
      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute top-full left-0 mt-2 z-50 p-4 rounded-lg shadow-lg"
              style={{
                backgroundColor: colors.warmWhite,
                border: "1px solid " + colors.cream,
              }}
            >
              {/* Saturation/Lightness area */}
              <div
                ref={satLightRef}
                className="w-48 h-40 rounded cursor-crosshair relative"
                style={{
                  background: "linear-gradient(to bottom, white, transparent, black), " +
                    "linear-gradient(to right, gray, hsl(" + hue + ", 100%, 50%))",
                }}
                onMouseDown={(e) => {
                  handleSatLightChange(e);
                  const handleMove = (e: MouseEvent) => handleSatLightChange(e);
                  const handleUp = () => {
                    document.removeEventListener("mousemove", handleMove);
                    document.removeEventListener("mouseup", handleUp);
                  };
                  document.addEventListener("mousemove", handleMove);
                  document.addEventListener("mouseup", handleUp);
                }}
              >
                <div
                  className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: saturation + "%",
                    top: (100 - lightness) + "%",
                    backgroundColor: value,
                  }}
                />
              </div>

              {/* Hue slider */}
              <div
                ref={hueRef}
                className="w-48 h-3 rounded mt-3 cursor-pointer relative"
                style={{
                  background: "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
                }}
                onMouseDown={(e) => {
                  handleHueChange(e);
                  const handleMove = (e: MouseEvent) => handleHueChange(e);
                  const handleUp = () => {
                    document.removeEventListener("mousemove", handleMove);
                    document.removeEventListener("mouseup", handleUp);
                  };
                  document.addEventListener("mousemove", handleMove);
                  document.addEventListener("mouseup", handleUp);
                }}
              >
                <div
                  className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md -translate-x-1/2 top-1/2 -translate-y-1/2"
                  style={{
                    left: (hue / 360 * 100) + "%",
                    backgroundColor: "hsl(" + hue + ", 100%, 50%)",
                  }}
                />
              </div>

              {/* Alpha slider */}
              {showAlpha && (
                <div
                  className="w-48 h-3 rounded mt-3 cursor-pointer relative"
                  style={{
                    background: "linear-gradient(to right, transparent, " + hslToHex(hue, saturation, lightness) + "), " +
                      "repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 50% / 8px 8px",
                  }}
                  onMouseDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const updateAlpha = (e: MouseEvent) => {
                      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      setAlpha(x);
                      updateColor(hue, saturation, lightness, x);
                    };
                    updateAlpha(e.nativeEvent);
                    const handleUp = () => {
                      document.removeEventListener("mousemove", updateAlpha);
                      document.removeEventListener("mouseup", handleUp);
                    };
                    document.addEventListener("mousemove", updateAlpha);
                    document.addEventListener("mouseup", handleUp);
                  }}
                >
                  <div
                    className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md -translate-x-1/2 top-1/2 -translate-y-1/2"
                    style={{
                      left: (alpha * 100) + "%",
                      backgroundColor: value,
                    }}
                  />
                </div>
              )}

              {/* Input */}
              {showInput && (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  className="w-48 mt-3 px-2 py-1 text-sm rounded border"
                  style={{
                    backgroundColor: colors.warmWhite,
                    borderColor: colors.cream,
                    color: colors.textPrimary,
                  }}
                />
              )}

              {/* Presets */}
              {presets && presets.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {presets.map((preset) => (
                    <motion.button
                      key={preset}
                      onClick={() => onChange(preset)}
                      className="w-6 h-6 rounded border"
                      style={{
                        backgroundColor: preset,
                        borderColor: preset === value ? colors.coral : colors.cream,
                      }}
                      whileHover={{ scale: 1.1 }}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
});

interface PalettePickerProps {
  value: string;
  onChange: (color: string) => void;
  colors: string[];
  columns?: number;
  className?: string;
}

/**
 * Palette Color Picker
 */
export const PalettePicker = memo(function PalettePicker({
  value,
  onChange,
  colors: palette,
  columns = 6,
  className = "",
}: PalettePickerProps) {
  const { colors } = useTheme();

  return (
    <div
      className={"grid gap-1 " + className}
      style={{ gridTemplateColumns: "repeat(" + columns + ", 1fr)" }}
    >
      {palette.map((color) => (
        <motion.button
          key={color}
          onClick={() => onChange(color)}
          className="w-8 h-8 rounded-lg border-2"
          style={{
            backgroundColor: color,
            borderColor: color === value ? colors.coral : "transparent",
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        />
      ))}
    </div>
  );
});

interface GradientPickerProps {
  value: string;
  onChange: (gradient: string) => void;
  type?: "linear" | "radial";
  className?: string;
}

/**
 * Gradient Picker
 */
export const GradientPicker = memo(function GradientPicker({
  value,
  onChange,
  type = "linear",
  className = "",
}: GradientPickerProps) {
  const { colors } = useTheme();
  const [startColor, setStartColor] = useState("#ff6b6b");
  const [endColor, setEndColor] = useState("#4ecdc4");
  const [angle, setAngle] = useState(90);

  const updateGradient = useCallback(() => {
    const gradient = type === "linear"
      ? "linear-gradient(" + angle + "deg, " + startColor + ", " + endColor + ")"
      : "radial-gradient(circle, " + startColor + ", " + endColor + ")";
    onChange(gradient);
  }, [type, angle, startColor, endColor, onChange]);

  useEffect(() => {
    updateGradient();
  }, [updateGradient]);

  return (
    <div className={className}>
      {/* Preview */}
      <div
        className="w-full h-16 rounded-lg mb-4"
        style={{ background: value }}
      />

      {/* Colors */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1">
          <label className="text-xs mb-1 block" style={{ color: colors.textMuted }}>
            Start
          </label>
          <input
            type="color"
            value={startColor}
            onChange={(e) => setStartColor(e.target.value)}
            className="w-full h-10 rounded cursor-pointer"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs mb-1 block" style={{ color: colors.textMuted }}>
            End
          </label>
          <input
            type="color"
            value={endColor}
            onChange={(e) => setEndColor(e.target.value)}
            className="w-full h-10 rounded cursor-pointer"
          />
        </div>
      </div>

      {/* Angle (linear only) */}
      {type === "linear" && (
        <div>
          <label className="text-xs mb-1 block" style={{ color: colors.textMuted }}>
            Angle: {angle}
          </label>
          <input
            type="range"
            min="0"
            max="360"
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
});

interface ColorInputProps {
  value: string;
  onChange: (color: string) => void;
  format?: "hex" | "rgb" | "hsl";
  className?: string;
}

/**
 * Color Input Field
 */
export const ColorInput = memo(function ColorInput({
  value,
  onChange,
  format = "hex",
  className = "",
}: ColorInputProps) {
  const { colors } = useTheme();

  return (
    <div className={"flex items-center gap-2 " + className}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-10 h-10 rounded cursor-pointer border-0"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
        className="flex-1 px-3 py-2 rounded-lg border text-sm"
        style={{
          backgroundColor: colors.warmWhite,
          borderColor: colors.cream,
          color: colors.textPrimary,
        }}
      />
    </div>
  );
});

// Helper functions
function parseColor(color: string): { h: number; s: number; l: number; a: number } | null {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return { h: h * 360, s: s * 100, l: l * 100, a };
  }
  return null;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return "#" + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}

export default ColorPicker;
