"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

export default function AvatarDemo() {
  const [selectedAvatar, setSelectedAvatar] = useState("eva");
  const [availableAvatars, setAvailableAvatars] = useState<string[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [status, setStatus] = useState("checking...");
  const [fps, setFps] = useState(0);

  const imgRef = useRef<HTMLImageElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameCounterRef = useRef(0);

  // Check API on mount
  useEffect(() => {
    const checkApi = async () => {
      try {
        const res = await fetch("http://localhost:8002/health");
        const data = await res.json();
        if (data.status === "healthy") {
          setAvailableAvatars(data.avatars || []);
          setStatus("ready");
        }
      } catch {
        setStatus("API not available");
      }
    };
    checkApi();
  }, []);

  // FPS counter
  useEffect(() => {
    const interval = setInterval(() => {
      setFps(frameCounterRef.current);
      frameCounterRef.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Start animation for specific avatar
  const startAnimation = useCallback((avatar: string) => {
    const ws = new WebSocket(`ws://localhost:8002/ws/${avatar}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("streaming");
      setIsAnimating(true);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        const url = URL.createObjectURL(event.data);
        if (imgRef.current) {
          const oldUrl = imgRef.current.src;
          imgRef.current.src = url;
          if (oldUrl.startsWith("blob:")) {
            URL.revokeObjectURL(oldUrl);
          }
        }
        frameCounterRef.current++;
      }
    };

    ws.onclose = () => {
      setIsAnimating(false);
      setStatus("disconnected");
    };

    ws.onerror = () => {
      setStatus("error");
    };
  }, []);

  // Start/Stop animation
  const toggleAnimation = useCallback(() => {
    if (isAnimating) {
      // Stop
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsAnimating(false);
      setStatus("stopped");
      // Reset to static image
      if (imgRef.current) {
        imgRef.current.src = `http://localhost:8002/static/${selectedAvatar}`;
      }
      return;
    }

    // Start animation
    startAnimation(selectedAvatar);
  }, [isAnimating, selectedAvatar, startAnimation]);

  // Change avatar - restart animation if already running
  const changeAvatar = useCallback((avatar: string) => {
    const wasAnimating = isAnimating;

    // Stop current WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsAnimating(false);
    setSelectedAvatar(avatar);

    // Update static image
    if (imgRef.current) {
      imgRef.current.src = `http://localhost:8002/static/${avatar}`;
    }

    // Restart animation with new avatar if was animating
    if (wasAnimating) {
      setTimeout(() => startAnimation(avatar), 150);
    }
  }, [isAnimating, startAnimation]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center p-8">
      {/* Background gradient animation */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <h1 className="text-3xl font-bold text-white mb-2">Avatar Animation</h1>
        <p className="text-white/60 text-sm mb-6">
          Mouvements subtils et naturels - 100% LOCAL
        </p>

        {/* Status */}
        <div className="flex gap-3 mb-6 text-sm">
          <span
            className={`px-4 py-2 rounded-full ${
              status === "ready" || status === "streaming"
                ? "bg-green-500/20 text-green-400"
                : "bg-yellow-500/20 text-yellow-400"
            }`}
          >
            {status}
          </span>
          {isAnimating && (
            <span className="px-4 py-2 rounded-full bg-blue-500/20 text-blue-400">
              {fps} FPS
            </span>
          )}
        </div>

        {/* Avatar Display */}
        <div className="relative mb-8">
          {/* Glow effect */}
          <div
            className={`absolute -inset-4 rounded-full transition-all duration-500 ${
              isAnimating
                ? "bg-purple-500/30 blur-2xl animate-pulse"
                : "bg-white/5 blur-xl"
            }`}
          />

          {/* Avatar container with gradient background */}
          <div className="relative w-80 h-80 md:w-96 md:h-96 rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 shadow-2xl">
            <img
              ref={imgRef}
              src={`http://localhost:8002/static/${selectedAvatar}`}
              alt={selectedAvatar}
              className="w-full h-full object-contain"
              style={{ imageRendering: "auto" }}
            />
          </div>

          {/* Ring effect when animating */}
          {isAnimating && (
            <div className="absolute -inset-2 rounded-2xl border-2 border-purple-400/50 animate-pulse" />
          )}
        </div>

        {/* Avatar selector */}
        <div className="flex gap-3 mb-6 flex-wrap justify-center">
          {availableAvatars.map((avatar) => (
            <button
              key={avatar}
              onClick={() => changeAvatar(avatar)}
              className={`px-5 py-2 rounded-full capitalize transition-all ${
                selectedAvatar === avatar
                  ? "bg-purple-500 text-white shadow-lg shadow-purple-500/50"
                  : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              {avatar}
            </button>
          ))}
        </div>

        {/* Animation control */}
        <button
          onClick={toggleAnimation}
          disabled={status === "API not available"}
          className={`px-8 py-4 rounded-xl font-bold text-lg transition-all ${
            isAnimating
              ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30"
              : status === "API not available"
              ? "bg-gray-600 text-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/30"
          }`}
        >
          {isAnimating ? "⏹ Arrêter" : "▶ Animer"}
        </button>

        {/* Info */}
        <div className="mt-8 p-4 bg-black/30 rounded-xl max-w-md text-center">
          <p className="text-white/50 text-xs">
            Animation subtile: micro-mouvements de tête, clignement des yeux,
            respiration douce. Fond transparent préservé.
          </p>
        </div>

        {/* Back link */}
        <Link
          href="/"
          className="mt-6 text-white/40 hover:text-white/60 text-sm transition-colors"
        >
          ← Retour
        </Link>
      </div>
    </div>
  );
}
