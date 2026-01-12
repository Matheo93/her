"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

type Emotion = "happy" | "sad" | "angry" | "fearful" | "disgusted" | "surprised" | "neutral";

interface EmotionResult {
  emotion: Emotion;
  probability: number;
}

const EMOTION_EMOJIS: Record<Emotion, string> = {
  happy: "😊",
  sad: "😢",
  angry: "😠",
  fearful: "😰",
  disgusted: "🤢",
  surprised: "😮",
  neutral: "😐",
};

const EMOTION_COLORS: Record<Emotion, string> = {
  happy: "bg-yellow-500",
  sad: "bg-blue-500",
  angry: "bg-red-500",
  fearful: "bg-purple-500",
  disgusted: "bg-green-500",
  surprised: "bg-cyan-500",
  neutral: "bg-zinc-500",
};

export default function FacetimePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceApiRef = useRef<typeof import("@vladmandic/face-api") | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<Emotion>("neutral");
  const [emotionConfidence, setEmotionConfidence] = useState(0);
  const [allEmotions, setAllEmotions] = useState<EmotionResult[]>([]);
  const [faceDetected, setFaceDetected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadModels = async () => {
      try {
        setIsLoading(true);
        const faceapi = await import("@vladmandic/face-api");
        faceApiRef.current = faceapi;
        const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (err) {
        console.error("Error loading face-api models:", err);
        setError("Erreur chargement modeles");
      } finally {
        setIsLoading(false);
      }
    };
    loadModels();
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err) {
      console.error("Camera error:", err);
      setError("Camera inaccessible");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setFaceDetected(false);
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
  }, []);

  const detectEmotions = useCallback(async () => {
    const faceapi = faceApiRef.current;
    const video = videoRef.current;
    if (!faceapi || !video || video.paused || video.ended || !modelsLoaded) return;

    try {
      const detections = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceExpressions();

      if (detections) {
        setFaceDetected(true);
        const expressions = detections.expressions;
        const emotionEntries = Object.entries(expressions) as [Emotion, number][];
        const sortedEmotions = emotionEntries
          .map(([emotion, probability]) => ({ emotion, probability }))
          .sort((a, b) => b.probability - a.probability);
        setAllEmotions(sortedEmotions);
        const dominant = sortedEmotions[0];
        if (dominant && dominant.probability > 0.3) {
          setCurrentEmotion(dominant.emotion);
          setEmotionConfidence(dominant.probability);
        }

        const canvas = canvasRef.current;
        if (canvas && video && containerRef.current) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const container = containerRef.current;
            const videoRatio = video.videoWidth / video.videoHeight;
            const containerRatio = container.clientWidth / container.clientHeight;

            let displayWidth, displayHeight, offsetX, offsetY;

            if (videoRatio > containerRatio) {
              displayHeight = container.clientHeight;
              displayWidth = displayHeight * videoRatio;
              offsetX = (container.clientWidth - displayWidth) / 2;
              offsetY = 0;
            } else {
              displayWidth = container.clientWidth;
              displayHeight = displayWidth / videoRatio;
              offsetX = 0;
              offsetY = (container.clientHeight - displayHeight) / 2;
            }

            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const scaleX = displayWidth / video.videoWidth;
            const scaleY = displayHeight / video.videoHeight;
            const box = detections.detection.box;

            ctx.strokeStyle = "#10b981";
            ctx.lineWidth = 3;
            ctx.strokeRect(
              offsetX + box.x * scaleX,
              offsetY + box.y * scaleY,
              box.width * scaleX,
              box.height * scaleY
            );
          }
        }
      } else {
        setFaceDetected(false);
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    } catch (err) {
      console.error("Detection error:", err);
    }
  }, [modelsLoaded]);

  useEffect(() => {
    if (cameraActive && modelsLoaded) {
      detectionIntervalRef.current = setInterval(detectEmotions, 200);
      return () => {
        if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
      };
    }
  }, [cameraActive, modelsLoaded, detectEmotions]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Video container */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-900 z-10">
            {isLoading ? (
              <>
                <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-zinc-400 text-sm">Chargement IA...</p>
              </>
            ) : error ? (
              <p className="text-red-400">{error}</p>
            ) : (
              <button
                onClick={startCamera}
                disabled={!modelsLoaded}
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium"
              >
                Activer Camera
              </button>
            )}
          </div>
        )}

        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain"
          playsInline
          muted
          style={{ transform: "scaleX(-1)" }}
        />
        <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ transform: "scaleX(-1)" }} />

        {/* Back button */}
        <button
          onClick={() => router.push("/")}
          className="absolute top-4 left-4 z-20 p-2 bg-black/50 rounded-full text-white"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>

        {/* Face status */}
        {cameraActive && (
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded-full">
            <div className={`w-2 h-2 rounded-full ${faceDetected ? "bg-emerald-400" : "bg-red-400"}`} />
            <span className="text-white text-xs">{faceDetected ? "Visage OK" : "Pas de visage"}</span>
          </div>
        )}

        {/* Current emotion overlay */}
        {cameraActive && faceDetected && (
          <div className="absolute bottom-20 left-4 z-20 flex items-center gap-2 bg-black/70 px-4 py-2 rounded-xl">
            <span className="text-4xl">{EMOTION_EMOJIS[currentEmotion]}</span>
            <div>
              <p className="text-white font-bold">{currentEmotion}</p>
              <p className="text-zinc-400 text-sm">{Math.round(emotionConfidence * 100)}%</p>
            </div>
          </div>
        )}

        {/* Stop button */}
        {cameraActive && (
          <button
            onClick={stopCamera}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 p-4 bg-red-500 rounded-full text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Emotion result */}
      {cameraActive && faceDetected && (
        <div className="h-14 shrink-0 bg-zinc-900/90 backdrop-blur flex items-center justify-center gap-3">
          <span className="text-3xl">{EMOTION_EMOJIS[currentEmotion]}</span>
          <span className="text-white font-medium">{currentEmotion}</span>
          <span className="text-zinc-500">{Math.round(emotionConfidence * 100)}%</span>
        </div>
      )}
    </div>
  );
}
