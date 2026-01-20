"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { HER_COLORS, HER_SPRINGS } from "@/styles/her-theme";

// Voice interface
interface Voice {
  id: string;
  name: string;
  gender: "male" | "female" | "child";
  provider: "elevenlabs" | "openai" | "edge-tts";
  description: string;
  accent?: string;
}

// Provider info
interface ProviderStatus {
  elevenlabs: boolean;
  openai: boolean;
  "edge-tts": boolean;
}

// HER-style provider styling - subtle warm variations
const PROVIDER_CONFIG = {
  elevenlabs: {
    label: "ElevenLabs",
    bgActive: HER_COLORS.coral,
    bgInactive: `${HER_COLORS.cream}80`,
    textActive: HER_COLORS.warmWhite,
    textInactive: HER_COLORS.earth,
    quality: "Premium",
    glow: HER_COLORS.glowCoral,
  },
  openai: {
    label: "OpenAI",
    bgActive: HER_COLORS.blush,
    bgInactive: `${HER_COLORS.cream}80`,
    textActive: HER_COLORS.earth,
    textInactive: HER_COLORS.earth,
    quality: "Haute qualite",
    glow: HER_COLORS.glowWarm,
  },
  "edge-tts": {
    label: "Edge TTS",
    bgActive: HER_COLORS.earth,
    bgInactive: `${HER_COLORS.cream}80`,
    textActive: HER_COLORS.warmWhite,
    textInactive: HER_COLORS.earth,
    quality: "Gratuit",
    glow: `${HER_COLORS.earth}40`,
  },
};

// Gender labels - HER style
const GENDER_LABELS = {
  male: { label: "Homme", bg: `${HER_COLORS.earth}20`, text: HER_COLORS.earth },
  female: { label: "Femme", bg: `${HER_COLORS.coral}20`, text: HER_COLORS.coral },
  child: { label: "Enfant", bg: `${HER_COLORS.blush}40`, text: HER_COLORS.earth },
};

export default function VoiceTestPage() {
  const router = useRouter();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [providers, setProviders] = useState<ProviderStatus>({
    elevenlabs: false,
    openai: false,
    "edge-tts": true,
  });
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [testText, setTestText] = useState(
    "Bonjour, je suis Eva. Comment puis-je vous aider aujourd'hui?"
  );
  const [loading, setLoading] = useState(true);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [filterGender, setFilterGender] = useState<string>("all");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Load voices and favorites
  useEffect(() => {
    const loadVoices = async () => {
      try {
        const response = await fetch("/api/tts/test");
        const data = await response.json();
        setVoices(data.voices);
        setProviders(data.providers);
      } catch (err) {
        console.error("Failed to load voices:", err);
        setError("Impossible de charger les voix");
      } finally {
        setLoading(false);
      }
    };

    // Load favorites from localStorage
    const savedFavorites = localStorage.getItem("eva-voice-favorites");
    if (savedFavorites) {
      setFavorites(new Set(JSON.parse(savedFavorites)));
    }

    loadVoices();
  }, []);

  // Save favorites to localStorage
  useEffect(() => {
    localStorage.setItem(
      "eva-voice-favorites",
      JSON.stringify(Array.from(favorites))
    );
  }, [favorites]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Toggle favorite
  const toggleFavorite = useCallback((voiceId: string) => {
    setFavorites((prev) => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(voiceId)) {
        newFavorites.delete(voiceId);
      } else {
        newFavorites.add(voiceId);
      }
      return newFavorites;
    });
  }, []);

  // Play voice
  const playVoice = useCallback(
    async (voice: Voice) => {
      // Stop current audio if playing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }

      // If clicking the same voice that was playing, just stop
      if (playingVoice === voice.id) {
        setPlayingVoice(null);
        return;
      }

      setLoadingVoice(voice.id);
      setError(null);

      try {
        const response = await fetch("/api/tts/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: testText,
            voiceId: voice.id,
            provider: voice.provider,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Erreur de synthese vocale");
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        audioUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setPlayingVoice(null);
          URL.revokeObjectURL(audioUrl);
          audioUrlRef.current = null;
        };

        audio.onerror = () => {
          setPlayingVoice(null);
          setError("Erreur de lecture audio");
        };

        await audio.play();
        setPlayingVoice(voice.id);
      } catch (err) {
        console.error("TTS error:", err);
        setError(err instanceof Error ? err.message : "Erreur TTS");
      } finally {
        setLoadingVoice(null);
      }
    },
    [testText, playingVoice]
  );

  // Filter voices
  const filteredVoices = voices.filter((voice) => {
    if (filterProvider !== "all" && voice.provider !== filterProvider) return false;
    if (filterGender !== "all" && voice.gender !== filterGender) return false;
    if (showFavoritesOnly && !favorites.has(voice.id)) return false;
    return true;
  });

  // Group voices by provider
  const groupedVoices = filteredVoices.reduce((acc, voice) => {
    if (!acc[voice.provider]) {
      acc[voice.provider] = [];
    }
    acc[voice.provider].push(voice);
    return acc;
  }, {} as Record<string, Voice[]>);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <motion.div
            className="w-12 h-12 rounded-full"
            style={{
              border: `3px solid ${HER_COLORS.coral}`,
              borderTopColor: "transparent",
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <p style={{ color: HER_COLORS.textSecondary }}>Chargement des voix...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen p-6"
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
      }}
    >
      {/* Header */}
      <header className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-6">
          <motion.button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 p-2 rounded-full transition-all"
            style={{
              backgroundColor: HER_COLORS.cream,
              color: HER_COLORS.earth,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="pr-2">Retour</span>
          </motion.button>

          <div className="flex items-center gap-2">
            {favorites.size > 0 && (
              <span className="text-sm" style={{ color: HER_COLORS.textMuted }}>
                {favorites.size} favori{favorites.size > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-3xl font-light mb-2" style={{ color: HER_COLORS.earth }}>
            Test des Voix
          </h1>
          <p style={{ color: HER_COLORS.textSecondary }}>
            Decouvrez la voix parfaite pour Eva
          </p>
        </div>
      </header>

      {/* Test Text Input */}
      <section className="max-w-6xl mx-auto mb-8">
        <motion.div
          className="p-6 rounded-2xl"
          style={{
            backgroundColor: `${HER_COLORS.cream}E6`,
            border: `1px solid ${HER_COLORS.softShadow}40`,
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={HER_SPRINGS.gentle}
        >
          <label className="block text-sm font-medium mb-2" style={{ color: HER_COLORS.textSecondary }}>
            Texte de test
          </label>
          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl resize-none focus:outline-none transition-all"
            style={{
              backgroundColor: HER_COLORS.warmWhite,
              border: `1px solid ${HER_COLORS.softShadow}`,
              color: HER_COLORS.earth,
            }}
            placeholder="Entrez le texte a synthetiser..."
          />
          <div className="flex flex-wrap gap-2 mt-3">
            {[
              { label: "Salutation", text: "Bonjour, je suis Eva. Comment puis-je vous aider aujourd'hui?" },
              { label: "Empathie", text: "Je comprends ce que tu ressens. Prends ton temps, je suis la pour toi." },
              { label: "Joie", text: "Oh la la, c'est trop drole! J'adore quand tu me racontes des histoires comme ca." },
              { label: "Reflexion", text: "Hmm, laisse-moi reflechir... C'est une question vraiment interessante." },
            ].map((preset) => (
              <motion.button
                key={preset.label}
                onClick={() => setTestText(preset.text)}
                className="px-3 py-1.5 text-xs rounded-lg transition-all"
                style={{
                  backgroundColor: HER_COLORS.cream,
                  color: HER_COLORS.earth,
                  border: `1px solid ${HER_COLORS.softShadow}40`,
                }}
                whileHover={{ scale: 1.02, backgroundColor: HER_COLORS.blush }}
                whileTap={{ scale: 0.98 }}
              >
                {preset.label}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Filters */}
      <section className="max-w-6xl mx-auto mb-8">
        <div className="flex flex-wrap items-center gap-4">
          {/* Provider filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: HER_COLORS.textMuted }}>Provider:</span>
            <div className="flex gap-1">
              <motion.button
                onClick={() => setFilterProvider("all")}
                className="px-3 py-1.5 text-xs rounded-lg transition-all"
                style={{
                  backgroundColor: filterProvider === "all" ? HER_COLORS.coral : HER_COLORS.cream,
                  color: filterProvider === "all" ? HER_COLORS.warmWhite : HER_COLORS.earth,
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Tous
              </motion.button>
              {Object.entries(PROVIDER_CONFIG).map(([key, config]) => (
                <motion.button
                  key={key}
                  onClick={() => setFilterProvider(key)}
                  disabled={!providers[key as keyof ProviderStatus]}
                  className="px-3 py-1.5 text-xs rounded-lg transition-all"
                  style={{
                    backgroundColor: filterProvider === key ? config.bgActive : config.bgInactive,
                    color: filterProvider === key ? config.textActive : config.textInactive,
                    opacity: providers[key as keyof ProviderStatus] ? 1 : 0.4,
                    cursor: providers[key as keyof ProviderStatus] ? "pointer" : "not-allowed",
                  }}
                  whileHover={providers[key as keyof ProviderStatus] ? { scale: 1.02 } : {}}
                  whileTap={providers[key as keyof ProviderStatus] ? { scale: 0.98 } : {}}
                >
                  {config.label}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Gender filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: HER_COLORS.textMuted }}>Genre:</span>
            <div className="flex gap-1">
              <motion.button
                onClick={() => setFilterGender("all")}
                className="px-3 py-1.5 text-xs rounded-lg transition-all"
                style={{
                  backgroundColor: filterGender === "all" ? HER_COLORS.coral : HER_COLORS.cream,
                  color: filterGender === "all" ? HER_COLORS.warmWhite : HER_COLORS.earth,
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Tous
              </motion.button>
              {Object.entries(GENDER_LABELS).map(([key, config]) => (
                <motion.button
                  key={key}
                  onClick={() => setFilterGender(key)}
                  className="px-3 py-1.5 text-xs rounded-lg transition-all"
                  style={{
                    backgroundColor: filterGender === key ? HER_COLORS.coral : HER_COLORS.cream,
                    color: filterGender === key ? HER_COLORS.warmWhite : HER_COLORS.earth,
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {config.label}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Favorites filter */}
          <motion.button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all"
            style={{
              backgroundColor: showFavoritesOnly ? HER_COLORS.coral : HER_COLORS.cream,
              color: showFavoritesOnly ? HER_COLORS.warmWhite : HER_COLORS.earth,
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <svg
              className="w-4 h-4"
              fill={showFavoritesOnly ? "currentColor" : "none"}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
            Favoris
          </motion.button>
        </div>
      </section>

      {/* Error message */}
      {error && (
        <motion.div
          className="max-w-6xl mx-auto mb-6"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div
            className="rounded-xl p-4 text-sm"
            style={{
              backgroundColor: `${HER_COLORS.error}15`,
              border: `1px solid ${HER_COLORS.error}40`,
              color: HER_COLORS.error,
            }}
          >
            {error}
          </div>
        </motion.div>
      )}

      {/* Voices Grid */}
      <section className="max-w-6xl mx-auto">
        {Object.entries(groupedVoices).map(([provider, providerVoices]) => (
          <motion.div
            key={provider}
            className="mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={HER_SPRINGS.gentle}
          >
            {/* Provider header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG]?.bgActive,
                  color: PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG]?.textActive,
                }}
              >
                {PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG]?.label}
              </div>
              <span className="text-sm" style={{ color: HER_COLORS.textMuted }}>
                {providerVoices.length} voix
              </span>
              <span className="text-xs" style={{ color: HER_COLORS.textMuted }}>
                {PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG]?.quality}
              </span>
            </div>

            {/* Voices grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {providerVoices.map((voice) => (
                <VoiceCard
                  key={voice.id}
                  voice={voice}
                  isFavorite={favorites.has(voice.id)}
                  isPlaying={playingVoice === voice.id}
                  isLoading={loadingVoice === voice.id}
                  onPlay={() => playVoice(voice)}
                  onToggleFavorite={() => toggleFavorite(voice.id)}
                />
              ))}
            </div>
          </motion.div>
        ))}

        {filteredVoices.length === 0 && (
          <div className="text-center py-12">
            <p style={{ color: HER_COLORS.textMuted }}>Aucune voix ne correspond aux filtres</p>
          </div>
        )}
      </section>

      {/* Footer with favorites summary */}
      {favorites.size > 0 && (
        <motion.footer
          className="max-w-6xl mx-auto mt-12 pt-8"
          style={{ borderTop: `1px solid ${HER_COLORS.softShadow}40` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <h3 className="text-lg font-light mb-4" style={{ color: HER_COLORS.earth }}>
            Vos voix favorites
          </h3>
          <div className="flex flex-wrap gap-2">
            {Array.from(favorites).map((voiceId) => {
              const voice = voices.find((v) => v.id === voiceId);
              if (!voice) return null;
              const config = PROVIDER_CONFIG[voice.provider];
              return (
                <motion.div
                  key={voiceId}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{
                    backgroundColor: `${HER_COLORS.cream}E6`,
                    border: `1px solid ${HER_COLORS.softShadow}40`,
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={HER_SPRINGS.gentle}
                >
                  <span style={{ color: HER_COLORS.earth }}>{voice.name}</span>
                  <span className="text-xs" style={{ color: HER_COLORS.textMuted }}>
                    ({config?.label})
                  </span>
                  <motion.button
                    onClick={() => toggleFavorite(voiceId)}
                    className="p-1 rounded transition-all"
                    style={{ color: HER_COLORS.textMuted }}
                    whileHover={{ scale: 1.1, color: HER_COLORS.error }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </motion.button>
                </motion.div>
              );
            })}
          </div>
        </motion.footer>
      )}
    </div>
  );
}

// Voice Card Component - HER style
interface VoiceCardProps {
  voice: Voice;
  isFavorite: boolean;
  isPlaying: boolean;
  isLoading: boolean;
  onPlay: () => void;
  onToggleFavorite: () => void;
}

function VoiceCard({
  voice,
  isFavorite,
  isPlaying,
  isLoading,
  onPlay,
  onToggleFavorite,
}: VoiceCardProps) {
  const config = PROVIDER_CONFIG[voice.provider];
  const genderConfig = GENDER_LABELS[voice.gender];

  return (
    <motion.div
      className="relative p-4 rounded-xl transition-all"
      style={{
        backgroundColor: isPlaying ? `${HER_COLORS.cream}F2` : `${HER_COLORS.warmWhite}E6`,
        border: isPlaying ? `2px solid ${HER_COLORS.coral}` : `1px solid ${HER_COLORS.softShadow}40`,
        boxShadow: isPlaying ? `0 4px 20px ${config.glow}` : "none",
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={HER_SPRINGS.gentle}
      whileHover={{ y: -2, boxShadow: `0 4px 16px ${HER_COLORS.softShadow}40` }}
    >
      {/* Favorite button */}
      <motion.button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className="absolute top-3 right-3 p-1.5 rounded-lg transition-all"
        style={{
          backgroundColor: isFavorite ? `${HER_COLORS.coral}20` : "transparent",
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <svg
          className="w-5 h-5 transition-colors"
          style={{
            color: isFavorite ? HER_COLORS.coral : HER_COLORS.textMuted,
          }}
          fill={isFavorite ? "currentColor" : "none"}
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
      </motion.button>

      {/* Voice info */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-medium" style={{ color: HER_COLORS.earth }}>
            {voice.name}
          </h3>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: genderConfig.bg,
              color: genderConfig.text,
            }}
          >
            {genderConfig.label}
          </span>
        </div>
        <p className="text-sm" style={{ color: HER_COLORS.textSecondary }}>
          {voice.description}
        </p>
        {voice.accent && (
          <span className="inline-block mt-1 text-xs" style={{ color: HER_COLORS.textMuted }}>
            {voice.accent}
          </span>
        )}
      </div>

      {/* Play button */}
      <motion.button
        onClick={onPlay}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all"
        style={{
          backgroundColor: isPlaying
            ? HER_COLORS.coral
            : isLoading
              ? HER_COLORS.cream
              : HER_COLORS.cream,
          color: isPlaying ? HER_COLORS.warmWhite : HER_COLORS.earth,
          boxShadow: isPlaying ? `0 4px 16px ${HER_COLORS.glowCoral}` : "none",
          cursor: isLoading ? "wait" : "pointer",
        }}
        whileHover={!isLoading ? { scale: 1.02 } : {}}
        whileTap={!isLoading ? { scale: 0.98 } : {}}
      >
        {isLoading ? (
          <>
            <motion.div
              className="w-4 h-4 rounded-full"
              style={{
                border: `2px solid ${HER_COLORS.textMuted}`,
                borderTopColor: "transparent",
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
            <span>Chargement...</span>
          </>
        ) : isPlaying ? (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
            <span>Arreter</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Ecouter</span>
          </>
        )}
      </motion.button>
    </motion.div>
  );
}
