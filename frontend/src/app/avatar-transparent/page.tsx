'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Avatar Transparent Page - REAL Lip Sync with SadTalker
 * Uses AI to generate realistic lip movements from audio
 */

const SADTALKER_API = 'http://localhost:8003';
const TTS_API = 'http://localhost:8000';

// Beautiful gradient backgrounds
const BACKGROUNDS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  '#0a0a0a',
  '#ffffff',
];

interface Avatar {
  id: string;
  name: string;
}

export default function AvatarTransparentPage() {
  const [backgroundIndex, setBackgroundIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [testText, setTestText] = useState("Bonjour, je suis Eva. Comment puis-je t'aider aujourd'hui?");
  const [selectedAvatar, setSelectedAvatar] = useState('eva');
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<'checking' | 'ready' | 'offline'>('checking');
  const [progress, setProgress] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);

  // Check API status
  useEffect(() => {
    const checkApi = async () => {
      try {
        const res = await fetch(`${SADTALKER_API}/health`);
        const data = await res.json();
        if (data.status === 'healthy') {
          setApiStatus('ready');
          // Fetch avatars
          const avatarsRes = await fetch(`${SADTALKER_API}/avatars`);
          const avatarsData = await avatarsRes.json();
          setAvatars(avatarsData.avatars || []);
        } else {
          setApiStatus('offline');
        }
      } catch {
        setApiStatus('offline');
      }
    };
    checkApi();
  }, []);

  // Generate lip-synced video
  const generateVideo = async () => {
    if (!testText.trim()) return;

    setIsGenerating(true);
    setError(null);
    setProgress('Generating TTS audio...');

    try {
      // Step 1: Get TTS audio
      const ttsRes = await fetch(`${TTS_API}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText, voice: 'eva' }),
      });

      if (!ttsRes.ok) throw new Error('TTS generation failed');

      const audioBlob = await ttsRes.blob();
      setProgress('Generating lip sync animation...');

      // Step 2: Send to SadTalker
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.mp3');
      formData.append('avatar', selectedAvatar);
      formData.append('pose_style', '0');
      formData.append('expression_scale', '1.0');

      const videoRes = await fetch(`${SADTALKER_API}/generate`, {
        method: 'POST',
        body: formData,
      });

      if (!videoRes.ok) {
        const errorText = await videoRes.text();
        throw new Error(`Lip sync failed: ${errorText}`);
      }

      // Get video blob and create URL
      const videoBlob = await videoRes.blob();
      const url = URL.createObjectURL(videoBlob);

      // Clean up old video URL
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }

      setVideoUrl(url);
      setProgress('');

      // Auto-play
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.play();
          setIsPlaying(true);
        }
      }, 100);

    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Generation failed');
      setProgress('');
    } finally {
      setIsGenerating(false);
    }
  };

  const cycleBackground = () => {
    setBackgroundIndex((prev) => (prev + 1) % BACKGROUNDS.length);
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
  };

  const replayVideo = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center transition-all duration-500 relative overflow-hidden"
      style={{ background: BACKGROUNDS[backgroundIndex] }}
    >
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
        <h1 className="text-white text-2xl font-bold drop-shadow-lg">
          Eva - Real Lip Sync (SadTalker)
        </h1>
        <div className="flex gap-2 items-center">
          <span className={`px-3 py-1 rounded-full text-sm text-white ${
            apiStatus === 'ready' ? 'bg-green-500' :
            apiStatus === 'checking' ? 'bg-yellow-500' : 'bg-red-500'
          }`}>
            {apiStatus === 'ready' ? 'API Ready' :
             apiStatus === 'checking' ? 'Checking...' : 'API Offline'}
          </span>
        </div>
      </div>

      {/* Offline Message - Hidden during setup */}
      {/* {apiStatus === 'offline' && (
        <div className="absolute top-20 bg-red-500/90 text-white px-6 py-3 rounded-lg max-w-lg text-center z-10">
          <p className="font-bold mb-2">SadTalker API non disponible</p>
          <p className="text-sm">Lance l&apos;API avec:</p>
          <code className="block mt-2 bg-black/30 px-3 py-2 rounded text-xs">
            cd sadtalker && source venv/bin/activate && python api.py
          </code>
        </div>
      )} */}

      {/* Avatar Container */}
      <div className="relative flex items-center justify-center">
        {/* Show video when available, otherwise show static image */}
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-[400px] h-[400px] object-contain rounded-2xl"
            style={{
              filter: 'drop-shadow(0 25px 50px rgba(0,0,0,0.3))',
            }}
            onEnded={handleVideoEnd}
            playsInline
          />
        ) : (
          <img
            src="/avatars/eva_nobg.png"
            alt="Eva"
            className="w-[400px] h-auto object-contain"
            style={{
              filter: 'drop-shadow(0 25px 50px rgba(0,0,0,0.3))',
            }}
          />
        )}

        {/* Generation overlay */}
        {isGenerating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded-2xl">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4" />
            <p className="text-white font-medium">{progress}</p>
            <p className="text-white/60 text-sm mt-1">Cela peut prendre 10-30s...</p>
          </div>
        )}

        {/* Play indicator */}
        {isPlaying && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-green-500/80 backdrop-blur px-3 py-1 rounded-full">
            <span className="text-white text-sm flex items-center gap-2">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              Playing...
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-8 flex flex-col gap-4 items-center z-10 w-full max-w-lg px-4">
        {/* Avatar selector */}
        {avatars.length > 0 && (
          <div className="flex gap-2 flex-wrap justify-center">
            {avatars.map((avatar) => (
              <button
                key={avatar.id}
                onClick={() => setSelectedAvatar(avatar.id)}
                className={`px-4 py-2 rounded-lg transition-all ${
                  selectedAvatar === avatar.id
                    ? 'bg-white text-black shadow-lg scale-105'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {avatar.name}
              </button>
            ))}
          </div>
        )}

        {/* Text input */}
        <textarea
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          placeholder="Texte a dire..."
          className="w-full px-4 py-3 rounded-xl bg-white/20 backdrop-blur text-white placeholder-white/50 border border-white/30 focus:border-white/60 focus:outline-none resize-none"
          rows={2}
          disabled={isGenerating}
        />

        {/* Error message */}
        {error && (
          <div className="w-full bg-red-500/80 text-white px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={generateVideo}
            disabled={isGenerating || apiStatus !== 'ready' || !testText.trim()}
            className="px-6 py-3 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>🎬 Generate Lip Sync</>
            )}
          </button>

          {videoUrl && !isGenerating && (
            <button
              onClick={replayVideo}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-all"
            >
              🔄 Replay
            </button>
          )}

          <button
            onClick={cycleBackground}
            className="px-6 py-3 bg-white/20 text-white rounded-lg font-semibold hover:bg-white/30 transition-all backdrop-blur"
          >
            🎨 Fond
          </button>
        </div>

        {/* Info */}
        <div className="flex gap-2 mt-2 flex-wrap justify-center">
          <span className="px-2 py-1 bg-white/10 rounded text-white/80 text-xs">
            SadTalker AI
          </span>
          <span className="px-2 py-1 bg-white/10 rounded text-white/80 text-xs">
            Real Lip Sync
          </span>
          <span className="px-2 py-1 bg-white/10 rounded text-white/80 text-xs">
            100% Local
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="absolute bottom-4 text-white/60 text-sm text-center">
        <p>Animation lip sync realiste avec SadTalker AI</p>
        <p className="text-xs mt-1">Generation: ~10-30s selon la longueur du texte</p>
      </div>
    </div>
  );
}
