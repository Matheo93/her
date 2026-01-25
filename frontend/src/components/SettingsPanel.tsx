"use client";

/**
 * Settings Panel - Sprint 584
 *
 * User preferences panel for EVA companion.
 * Slide-out drawer with organized settings.
 *
 * Categories:
 * - Voice: voice selection, speed, pitch
 * - Display: dark mode, font size, animations
 * - Privacy: data retention, anonymization
 * - About: version, credits
 */

import React, { memo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface SettingsPanelProps {
  /** Whether panel is open */
  isOpen: boolean;
  /** Callback to close panel */
  onClose: () => void;
  /** Current settings */
  settings?: UserSettings;
  /** Callback when settings change */
  onSettingsChange?: (settings: UserSettings) => void;
  /** Available voices */
  voices?: VoiceOption[];
}

interface UserSettings {
  // Voice settings
  voiceId: string;
  voiceSpeed: number; // 0.5 - 2.0
  voicePitch: number; // 0.5 - 2.0

  // Display settings
  darkMode: boolean;
  fontSize: "small" | "medium" | "large";
  showAnimations: boolean;
  reducedMotion: boolean;

  // Privacy settings
  saveHistory: boolean;
  anonymizeExports: boolean;

  // Audio settings
  autoPlay: boolean;
  soundEffects: boolean;
}

interface VoiceOption {
  id: string;
  name: string;
  gender: "female" | "male" | "neutral";
  language: string;
}

const DEFAULT_SETTINGS: UserSettings = {
  voiceId: "eva",
  voiceSpeed: 1.0,
  voicePitch: 1.0,
  darkMode: false,
  fontSize: "medium",
  showAnimations: true,
  reducedMotion: false,
  saveHistory: true,
  anonymizeExports: false,
  autoPlay: true,
  soundEffects: true,
};

const DEFAULT_VOICES: VoiceOption[] = [
  { id: "eva", name: "EVA (Natural)", gender: "female", language: "fr-FR" },
  { id: "eva-warm", name: "EVA (Warm)", gender: "female", language: "fr-FR" },
  { id: "eva-soft", name: "EVA (Soft)", gender: "female", language: "fr-FR" },
  { id: "eva-clear", name: "EVA (Clear)", gender: "female", language: "fr-FR" },
];

/**
 * Settings Section Header
 */
const SectionHeader = memo(function SectionHeader({
  title,
  icon,
  colors,
}: {
  title: string;
  icon: React.ReactNode;
  colors: any;
}) {
  return (
    <div
      className="flex items-center gap-2 py-3 border-b"
      style={{ borderColor: colors.cream }}
    >
      <span style={{ color: colors.coral }}>{icon}</span>
      <h3
        className="text-sm font-medium"
        style={{ color: colors.textPrimary }}
      >
        {title}
      </h3>
    </div>
  );
});

/**
 * Toggle Switch
 */
const Toggle = memo(function Toggle({
  checked,
  onChange,
  disabled = false,
  colors,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  colors: any;
}) {
  return (
    <motion.button
      className="relative rounded-full"
      style={{
        width: 44,
        height: 24,
        backgroundColor: checked ? colors.coral : colors.cream,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onClick={() => !disabled && onChange(!checked)}
      whileTap={!disabled ? { scale: 0.95 } : {}}
    >
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 20,
          height: 20,
          top: 2,
          backgroundColor: colors.warmWhite,
          boxShadow: `0 1px 3px ${colors.softShadow}`,
        }}
        animate={{ left: checked ? 22 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </motion.button>
  );
});

/**
 * Slider Control
 */
const Slider = memo(function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  colors,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  label: string;
  colors: any;
}) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="text-xs" style={{ color: colors.textSecondary }}>
          {label}
        </span>
        <span className="text-xs font-mono" style={{ color: colors.coral }}>
          {value.toFixed(1)}
        </span>
      </div>
      <div className="relative h-2">
        <div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: colors.cream }}
        />
        <div
          className="absolute left-0 top-0 bottom-0 rounded-full"
          style={{
            width: `${percentage}%`,
            backgroundColor: colors.coral,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
});

/**
 * Select Dropdown
 */
const Select = memo(function Select<T extends string>({
  value,
  options,
  onChange,
  colors,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  colors: any;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="px-3 py-2 rounded-lg text-sm w-full appearance-none cursor-pointer"
      style={{
        backgroundColor: colors.cream,
        color: colors.textPrimary,
        border: `1px solid ${colors.warmWhite}`,
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
});

/**
 * Setting Row
 */
const SettingRow = memo(function SettingRow({
  label,
  description,
  children,
  colors,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  colors: any;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 pr-4">
        <div className="text-sm" style={{ color: colors.textPrimary }}>
          {label}
        </div>
        {description && (
          <div
            className="text-xs mt-0.5"
            style={{ color: colors.textMuted }}
          >
            {description}
          </div>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
});

/**
 * Close Icon
 */
const CloseIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

/**
 * Section Icons
 */
const VoiceIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const DisplayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const PrivacyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

/**
 * Main Settings Panel
 */
export const SettingsPanel = memo(function SettingsPanel({
  isOpen,
  onClose,
  settings: initialSettings,
  onSettingsChange,
  voices = DEFAULT_VOICES,
}: SettingsPanelProps) {
  const { colors, mode, toggleMode } = useTheme();
  const isDark = mode === "dark";
  const [settings, setSettings] = useState<UserSettings>(
    initialSettings || DEFAULT_SETTINGS
  );

  const updateSetting = useCallback(
    <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      onSettingsChange?.(newSettings);
    },
    [settings, onSettingsChange]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40"
            style={{ backgroundColor: `${colors.softShadow}80` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed right-0 top-0 bottom-0 z-50 overflow-y-auto"
            style={{
              width: 360,
              maxWidth: "90vw",
              backgroundColor: colors.warmWhite,
              boxShadow: `-4px 0 20px ${colors.softShadow}40`,
            }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div
              className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b"
              style={{
                backgroundColor: colors.warmWhite,
                borderColor: colors.cream,
              }}
            >
              <h2
                className="text-lg font-light"
                style={{ color: colors.textPrimary }}
              >
                Paramètres
              </h2>
              <motion.button
                onClick={onClose}
                className="p-2 rounded-full"
                style={{ color: colors.textSecondary }}
                whileHover={{ backgroundColor: `${colors.cream}` }}
                whileTap={{ scale: 0.9 }}
              >
                <CloseIcon />
              </motion.button>
            </div>

            {/* Content */}
            <div className="px-5 py-4 space-y-6">
              {/* Voice Settings */}
              <section>
                <SectionHeader
                  title="Voix"
                  icon={<VoiceIcon />}
                  colors={colors}
                />
                <div className="mt-3 space-y-4">
                  <SettingRow label="Voix d'EVA" colors={colors}>
                    <Select
                      value={settings.voiceId}
                      options={voices.map((v) => ({ value: v.id, label: v.name }))}
                      onChange={(v) => updateSetting("voiceId", v)}
                      colors={colors}
                    />
                  </SettingRow>

                  <Slider
                    value={settings.voiceSpeed}
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    onChange={(v) => updateSetting("voiceSpeed", v)}
                    label="Vitesse"
                    colors={colors}
                  />

                  <Slider
                    value={settings.voicePitch}
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    onChange={(v) => updateSetting("voicePitch", v)}
                    label="Tonalité"
                    colors={colors}
                  />

                  <SettingRow
                    label="Lecture automatique"
                    description="Lire les réponses d'EVA automatiquement"
                    colors={colors}
                  >
                    <Toggle
                      checked={settings.autoPlay}
                      onChange={(v) => updateSetting("autoPlay", v)}
                      colors={colors}
                    />
                  </SettingRow>
                </div>
              </section>

              {/* Display Settings */}
              <section>
                <SectionHeader
                  title="Affichage"
                  icon={<DisplayIcon />}
                  colors={colors}
                />
                <div className="mt-3 space-y-1">
                  <SettingRow
                    label="Mode sombre"
                    description="Interface en couleurs foncées"
                    colors={colors}
                  >
                    <Toggle
                      checked={isDark}
                      onChange={() => toggleMode()}
                      colors={colors}
                    />
                  </SettingRow>

                  <SettingRow label="Taille du texte" colors={colors}>
                    <Select
                      value={settings.fontSize}
                      options={[
                        { value: "small", label: "Petit" },
                        { value: "medium", label: "Moyen" },
                        { value: "large", label: "Grand" },
                      ]}
                      onChange={(v) => updateSetting("fontSize", v as UserSettings["fontSize"])}
                      colors={colors}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Animations"
                    description="Effets visuels et transitions"
                    colors={colors}
                  >
                    <Toggle
                      checked={settings.showAnimations}
                      onChange={(v) => updateSetting("showAnimations", v)}
                      colors={colors}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Mouvement réduit"
                    description="Pour les sensibilités au mouvement"
                    colors={colors}
                  >
                    <Toggle
                      checked={settings.reducedMotion}
                      onChange={(v) => updateSetting("reducedMotion", v)}
                      colors={colors}
                    />
                  </SettingRow>
                </div>
              </section>

              {/* Privacy Settings */}
              <section>
                <SectionHeader
                  title="Confidentialité"
                  icon={<PrivacyIcon />}
                  colors={colors}
                />
                <div className="mt-3 space-y-1">
                  <SettingRow
                    label="Sauvegarder l'historique"
                    description="Conserver les conversations passées"
                    colors={colors}
                  >
                    <Toggle
                      checked={settings.saveHistory}
                      onChange={(v) => updateSetting("saveHistory", v)}
                      colors={colors}
                    />
                  </SettingRow>

                  <SettingRow
                    label="Anonymiser les exports"
                    description="Masquer les identifiants lors de l'export"
                    colors={colors}
                  >
                    <Toggle
                      checked={settings.anonymizeExports}
                      onChange={(v) => updateSetting("anonymizeExports", v)}
                      colors={colors}
                    />
                  </SettingRow>
                </div>
              </section>

              {/* About */}
              <section className="pt-4 border-t" style={{ borderColor: colors.cream }}>
                <div
                  className="text-center text-xs space-y-1"
                  style={{ color: colors.textMuted }}
                >
                  <div>EVA Voice Companion</div>
                  <div style={{ color: colors.coral }}>Version 2.0.0</div>
                  <div className="pt-2">Inspiré par le film "Her"</div>
                </div>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

export default SettingsPanel;
