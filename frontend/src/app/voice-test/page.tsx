"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

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

// Provider colors and labels
const PROVIDER_CONFIG = {
  elevenlabs: {
    label: "ElevenLabs",
    color: "from-violet-500 to-purple-600",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
    textColor: "text-violet-400",
    quality: "Premium",
  },
  openai: {
    label: "OpenAI",
    color: "from-emerald-500 to-teal-600",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    textColor: "text-emerald-400",
    quality: "Haute qualite",
  },
  "edge-tts": {
    label: "Edge TTS",
    color: "from-blue-500 to-cyan-600",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    textColor: "text-blue-400",
    quality: "Gratuit",
  },
};

// Gender labels
const GENDER_LABELS = {
  male: { label: "Homme", icon: "M" },
  female: { label: "Femme", icon: "F" },
  child: { label: "Enfant", icon: "E" },
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
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 to-zinc-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400">Chargement des voix...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 to-zinc-900 p-6">
      {/* Header */}
      <header className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            <span>Retour</span>
          </button>

          <div className="flex items-center gap-2">
            {favorites.size > 0 && (
              <span className="text-sm text-zinc-500">
                {favorites.size} favori{favorites.size > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">
            Test des Voix Francaises
          </h1>
          <p className="text-zinc-400">
            Testez differentes voix TTS pour trouver celle qui vous convient
          </p>
        </div>
      </header>

      {/* Test Text Input */}
      <section className="max-w-6xl mx-auto mb-8">
        <div className="bg-zinc-900/50 backdrop-blur border border-zinc-800 rounded-2xl p-6">
          <label className="block text-sm font-medium text-zinc-400 mb-2">
            Texte de test
          </label>
          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent resize-none"
            placeholder="Entrez le texte a synthetiser..."
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={() =>
                setTestText(
                  "Bonjour, je suis Eva. Comment puis-je vous aider aujourd'hui?"
                )
              }
              className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
            >
              Salutation
            </button>
            <button
              onClick={() =>
                setTestText(
                  "Je comprends ce que tu ressens. Prends ton temps, je suis la pour toi."
                )
              }
              className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
            >
              Empathie
            </button>
            <button
              onClick={() =>
                setTestText(
                  "Oh la la, c'est trop drole! J'adore quand tu me racontes des histoires comme ca."
                )
              }
              className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
            >
              Joie
            </button>
            <button
              onClick={() =>
                setTestText(
                  "Hmm, laisse-moi reflechir... C'est une question vraiment interessante."
                )
              }
              className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
            >
              Reflexion
            </button>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="max-w-6xl mx-auto mb-8">
        <div className="flex flex-wrap items-center gap-4">
          {/* Provider filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500">Provider:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setFilterProvider("all")}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  filterProvider === "all"
                    ? "bg-rose-500 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                Tous
              </button>
              {Object.entries(PROVIDER_CONFIG).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setFilterProvider(key)}
                  disabled={!providers[key as keyof ProviderStatus]}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    filterProvider === key
                      ? `bg-gradient-to-r ${config.color} text-white`
                      : providers[key as keyof ProviderStatus]
                      ? `${config.bgColor} ${config.textColor} hover:opacity-80`
                      : "bg-zinc-800/50 text-zinc-600 cursor-not-allowed"
                  }`}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          {/* Gender filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500">Genre:</span>
            <div className="flex gap-1">
              <button
                onClick={() => setFilterGender("all")}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  filterGender === "all"
                    ? "bg-rose-500 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                Tous
              </button>
              {Object.entries(GENDER_LABELS).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setFilterGender(key)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    filterGender === key
                      ? "bg-rose-500 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          {/* Favorites filter */}
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              showFavoritesOnly
                ? "bg-amber-500 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
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
                strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
            Favoris
          </button>
        </div>
      </section>

      {/* Error message */}
      {error && (
        <div className="max-w-6xl mx-auto mb-6">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Voices Grid */}
      <section className="max-w-6xl mx-auto">
        {Object.entries(groupedVoices).map(([provider, providerVoices]) => (
          <div key={provider} className="mb-8">
            {/* Provider header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${
                  PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG]?.color
                } text-white`}
              >
                {PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG]?.label}
              </div>
              <span className="text-sm text-zinc-500">
                {providerVoices.length} voix
              </span>
              <span className="text-xs text-zinc-600">
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
          </div>
        ))}

        {filteredVoices.length === 0 && (
          <div className="text-center py-12">
            <p className="text-zinc-500">Aucune voix ne correspond aux filtres</p>
          </div>
        )}
      </section>

      {/* Footer with favorites summary */}
      {favorites.size > 0 && (
        <footer className="max-w-6xl mx-auto mt-12 pt-8 border-t border-zinc-800">
          <h3 className="text-lg font-medium text-white mb-4">
            Vos voix favorites
          </h3>
          <div className="flex flex-wrap gap-2">
            {Array.from(favorites).map((voiceId) => {
              const voice = voices.find((v) => v.id === voiceId);
              if (!voice) return null;
              return (
                <div
                  key={voiceId}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                    PROVIDER_CONFIG[voice.provider]?.bgColor
                  } ${PROVIDER_CONFIG[voice.provider]?.borderColor} border`}
                >
                  <span className={PROVIDER_CONFIG[voice.provider]?.textColor}>
                    {voice.name}
                  </span>
                  <span className="text-xs text-zinc-500">
                    ({PROVIDER_CONFIG[voice.provider]?.label})
                  </span>
                  <button
                    onClick={() => toggleFavorite(voiceId)}
                    className="text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </footer>
      )}
    </div>
  );
}

// Voice Card Component
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
    <div
      className={`relative p-4 rounded-xl border transition-all ${
        isPlaying
          ? `${config.bgColor} ${config.borderColor} ring-2 ring-offset-2 ring-offset-zinc-950`
          : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
      }`}
      style={
        isPlaying
          ? { ["--tw-ring-color" as string]: config.textColor.replace("text-", "rgb(var(--") + ")" }
          : {}
      }
    >
      {/* Favorite button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
      >
        <svg
          className={`w-5 h-5 transition-colors ${
            isFavorite ? "text-amber-400 fill-amber-400" : "text-zinc-600"
          }`}
          fill={isFavorite ? "currentColor" : "none"}
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
      </button>

      {/* Voice info */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-medium text-white">{voice.name}</h3>
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              voice.gender === "female"
                ? "bg-pink-500/20 text-pink-400"
                : voice.gender === "male"
                ? "bg-blue-500/20 text-blue-400"
                : "bg-amber-500/20 text-amber-400"
            }`}
          >
            {genderConfig.label}
          </span>
        </div>
        <p className="text-sm text-zinc-400">{voice.description}</p>
        {voice.accent && (
          <span className="inline-block mt-1 text-xs text-zinc-500">
            {voice.accent}
          </span>
        )}
      </div>

      {/* Play button */}
      <button
        onClick={onPlay}
        disabled={isLoading}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
          isPlaying
            ? `bg-gradient-to-r ${config.color} text-white`
            : isLoading
            ? "bg-zinc-800 text-zinc-500 cursor-wait"
            : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        }`}
      >
        {isLoading ? (
          <>
            <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
            <span>Chargement...</span>
          </>
        ) : isPlaying ? (
          <>
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
              />
            </svg>
            <span>Arreter</span>
          </>
        ) : (
          <>
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>Ecouter</span>
          </>
        )}
      </button>
    </div>
  );
}
