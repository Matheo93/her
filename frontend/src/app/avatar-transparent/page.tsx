'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Avatar Transparent Page - REAL NATURAL ANIMATION
 * Shows Eva with transparent background and natural movements
 * 100% LOCAL - No external APIs
 */

const AVATAR_API = 'http://localhost:8002';

// Beautiful gradient backgrounds
const BACKGROUNDS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  'linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)',
  'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)',
  '#0a0a0a', // Dark mode
  '#ffffff', // Light mode
];

export default function AvatarTransparentPage() {
  const [avatars, setAvatars] = useState<{ id: string; name: string; has_alpha: boolean }[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState('eva');
  const [isConnected, setIsConnected] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backgroundIndex, setBackgroundIndex] = useState(0);
  const [fps, setFps] = useState(0);

  const imgRef = useRef<HTMLImageElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(Date.now());

  // Fetch available avatars
  useEffect(() => {
    fetch(`${AVATAR_API}/avatars`)
      .then(res => res.json())
      .then(data => {
        setAvatars(data.avatars || []);
        setIsConnected(true);
        setError(null);
      })
      .catch(() => {
        setError('API non connectée. Lance: cd liveportrait && source venv/bin/activate && python api.py');
        setIsConnected(false);
      });
  }, []);

  // WebSocket connection for real-time animation
  useEffect(() => {
    if (!isConnected) return;

    const connectWs = () => {
      const ws = new WebSocket(`${AVATAR_API.replace('http', 'ws')}/ws/animate`);

      ws.onopen = () => {
        console.log('WebSocket connected');
        // Configure avatar
        ws.send(JSON.stringify({ type: 'config', source_id: selectedAvatar, fps: 25 }));
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          // Received animated frame
          const url = URL.createObjectURL(event.data);
          if (imgRef.current) {
            const oldSrc = imgRef.current.src;
            imgRef.current.src = url;
            // Clean up old blob URL
            if (oldSrc.startsWith('blob:')) {
              URL.revokeObjectURL(oldSrc);
            }
          }

          // Calculate FPS
          frameCountRef.current++;
          const now = Date.now();
          if (now - lastFpsUpdateRef.current >= 1000) {
            setFps(frameCountRef.current);
            frameCountRef.current = 0;
            lastFpsUpdateRef.current = now;
          }
        } else {
          const msg = JSON.parse(event.data);
          console.log('WS message:', msg);
          if (msg.type === 'config_ok') {
            console.log('Config accepted:', msg);
          } else if (msg.type === 'started') {
            setIsAnimating(true);
          } else if (msg.type === 'stopped') {
            setIsAnimating(false);
          }
        }
      };

      ws.onerror = (e) => {
        console.error('WebSocket error:', e);
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setIsAnimating(false);
      };

      wsRef.current = ws;
    };

    connectWs();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [isConnected, selectedAvatar]);

  const startAnimation = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'start' }));
    }
  }, []);

  const stopAnimation = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  }, []);

  const cycleBackground = () => {
    setBackgroundIndex((prev) => (prev + 1) % BACKGROUNDS.length);
  };

  const selectAvatar = (avatarId: string) => {
    setSelectedAvatar(avatarId);
    // Reconnect with new avatar
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center transition-all duration-500 relative"
      style={{ background: BACKGROUNDS[backgroundIndex] }}
    >
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
        <h1 className="text-white text-2xl font-bold drop-shadow-lg">
          Eva Avatar - Animation Naturelle
        </h1>
        <div className="flex gap-2 items-center">
          {isAnimating && (
            <span className="px-3 py-1 rounded-full text-sm bg-blue-500 text-white">
              {fps} FPS
            </span>
          )}
          <span className={`px-3 py-1 rounded-full text-sm ${isConnected ? 'bg-green-500' : 'bg-red-500'} text-white`}>
            {isConnected ? '100% LOCAL' : 'Déconnecté'}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="absolute top-20 bg-red-500/90 text-white px-4 py-2 rounded-lg max-w-lg text-center z-10">
          {error}
        </div>
      )}

      {/* Avatar Container */}
      <div className="relative">
        {/* Avatar with transparent background */}
        <img
          ref={imgRef}
          src={`${AVATAR_API}/avatar/${selectedAvatar}`}
          alt={selectedAvatar}
          className="w-[500px] h-[500px] object-contain"
          style={{
            filter: 'drop-shadow(0 25px 50px rgba(0,0,0,0.3))',
          }}
        />

        {/* Animation status */}
        {isAnimating && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-green-500/80 backdrop-blur px-3 py-1 rounded-full">
            <span className="text-white text-sm flex items-center gap-2">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              Animation en cours
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-8 flex flex-col gap-4 items-center z-10">
        {/* Avatar selector */}
        <div className="flex gap-2">
          {avatars.map((avatar) => (
            <button
              key={avatar.id}
              onClick={() => selectAvatar(avatar.id)}
              className={`px-4 py-2 rounded-lg transition-all ${
                selectedAvatar === avatar.id
                  ? 'bg-white text-black shadow-lg scale-105'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              {avatar.name}
              {avatar.has_alpha && <span className="ml-1 text-xs opacity-60">✓</span>}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {!isAnimating ? (
            <button
              onClick={startAnimation}
              disabled={!isConnected}
              className="px-6 py-3 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              ▶ Démarrer Animation
            </button>
          ) : (
            <button
              onClick={stopAnimation}
              className="px-6 py-3 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-all"
            >
              ⏹ Arrêter
            </button>
          )}

          <button
            onClick={cycleBackground}
            className="px-6 py-3 bg-white/20 text-white rounded-lg font-semibold hover:bg-white/30 transition-all backdrop-blur"
          >
            🎨 Changer Fond
          </button>
        </div>

        {/* Features info */}
        <div className="flex gap-2 mt-2">
          <span className="px-2 py-1 bg-white/10 rounded text-white/80 text-xs">Respiration</span>
          <span className="px-2 py-1 bg-white/10 rounded text-white/80 text-xs">Mouvements tête</span>
          <span className="px-2 py-1 bg-white/10 rounded text-white/80 text-xs">Clignements</span>
          <span className="px-2 py-1 bg-white/10 rounded text-white/80 text-xs">Micro-expressions</span>
        </div>
      </div>

      {/* Info */}
      <div className="absolute bottom-4 text-white/60 text-sm text-center">
        <p>Animation naturelle 100% locale - Comme Simli mais sans API externe</p>
        <p className="text-xs mt-1">OpenCV + NumPy - Mouvements naturels en temps réel</p>
      </div>
    </div>
  );
}
