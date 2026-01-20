"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { HER_COLORS, HER_SPRINGS, EMOTION_PRESENCE } from "@/styles/her-theme";

type Emotion = "joy" | "sadness" | "anger" | "fear" | "surprise" | "neutral";

interface EmotionResult {
  emotion: Emotion;
  probability: number;
}

// HER-style warm emotion labels
const EMOTION_LABELS: Record<Emotion, string> = {
  joy: "Joyeux",
  sadness: "Mélancolique",
  anger: "Intense",
  fear: "Inquiet",
  surprise: "Surpris",
  neutral: "Serein",
};

// Map face-api emotions to HER emotions
const mapFaceApiEmotion = (emotion: string): Emotion => {
  const mapping: Record<string, Emotion> = {
    happy: "joy",
    sad: "sadness",
    angry: "anger",
    fearful: "fear",
    disgusted: "anger",
    surprised: "surprise",
    neutral: "neutral",
  };
  return mapping[emotion] || "neutral";
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
  const [, setAllEmotions] = useState<EmotionResult[]>([]);
  const [faceDetected, setFaceDetected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPresence = EMOTION_PRESENCE[currentEmotion] || EMOTION_PRESENCE.neutral;

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
        setError("Erreur chargement");
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
      setError("Caméra inaccessible");
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
        const emotionEntries = Object.entries(expressions) as [string, number][];
        const sortedEmotions = emotionEntries
          .map(([emotion, probability]) => ({
            emotion: mapFaceApiEmotion(emotion),
            probability
          }))
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

            // HER-style warm coral stroke
            ctx.strokeStyle = HER_COLORS.coral;
            ctx.lineWidth = 2;
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
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
      }}
    >
      {/* Video container */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {!cameraActive && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-10"
            style={{ backgroundColor: HER_COLORS.warmWhite }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {isLoading ? (
              <>
                <motion.div
                  className="w-12 h-12 rounded-full"
                  style={{
                    border: `3px solid ${HER_COLORS.coral}`,
                    borderTopColor: "transparent",
                  }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                <p style={{ color: HER_COLORS.textSecondary }} className="text-sm">
                  Préparation...
                </p>
              </>
            ) : error ? (
              <p style={{ color: HER_COLORS.error }}>{error}</p>
            ) : (
              <motion.button
                onClick={startCamera}
                disabled={!modelsLoaded}
                className="px-8 py-4 rounded-2xl font-medium"
                style={{
                  backgroundColor: HER_COLORS.coral,
                  color: HER_COLORS.warmWhite,
                  boxShadow: `0 4px 20px ${HER_COLORS.glowCoral}`,
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Activer la caméra
              </motion.button>
            )}
          </motion.div>
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
        <motion.button
          onClick={() => router.push("/")}
          className="absolute top-4 left-4 z-20 p-2 rounded-full"
          style={{
            backgroundColor: `${HER_COLORS.cream}E6`,
            color: HER_COLORS.earth,
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </motion.button>

        {/* Face status */}
        {cameraActive && (
          <motion.div
            className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{
              backgroundColor: `${HER_COLORS.cream}E6`,
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={HER_SPRINGS.gentle}
          >
            <motion.div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: faceDetected ? HER_COLORS.success : HER_COLORS.error,
              }}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-xs" style={{ color: HER_COLORS.textSecondary }}>
              {faceDetected ? "Visage détecté" : "Recherche..."}
            </span>
          </motion.div>
        )}

        {/* Current emotion overlay */}
        {cameraActive && faceDetected && (
          <motion.div
            className="absolute bottom-20 left-4 z-20 flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{
              backgroundColor: `${HER_COLORS.cream}E6`,
              boxShadow: `0 4px 20px ${currentPresence.glow}`,
            }}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={HER_SPRINGS.gentle}
          >
            {/* Emotion orb */}
            <motion.div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{
                background: `radial-gradient(circle, ${HER_COLORS.coral} 0%, ${HER_COLORS.blush} 100%)`,
                boxShadow: `0 0 20px ${currentPresence.glow}`,
              }}
              animate={{
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <div>
              <p className="font-medium" style={{ color: HER_COLORS.earth }}>
                {EMOTION_LABELS[currentEmotion]}
              </p>
              <p className="text-sm" style={{ color: HER_COLORS.textSecondary }}>
                {Math.round(emotionConfidence * 100)}%
              </p>
            </div>
          </motion.div>
        )}

        {/* Stop button */}
        {cameraActive && (
          <motion.button
            onClick={stopCamera}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 p-4 rounded-full"
            style={{
              backgroundColor: HER_COLORS.earth,
              color: HER_COLORS.warmWhite,
              boxShadow: `0 4px 16px ${HER_COLORS.softShadow}60`,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </motion.button>
        )}
      </div>

      {/* Emotion result bar */}
      {cameraActive && faceDetected && (
        <motion.div
          className="h-16 shrink-0 flex items-center justify-center gap-4"
          style={{
            backgroundColor: `${HER_COLORS.warmWhite}F2`,
            borderTop: `1px solid ${HER_COLORS.cream}`,
          }}
          initial={{ y: 64 }}
          animate={{ y: 0 }}
          transition={HER_SPRINGS.gentle}
        >
          {/* Emotion indicator */}
          <motion.div
            className="w-8 h-8 rounded-full"
            style={{
              background: `radial-gradient(circle, ${HER_COLORS.coral} 0%, ${HER_COLORS.blush} 100%)`,
              boxShadow: `0 0 16px ${currentPresence.glow}`,
            }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className="font-medium" style={{ color: HER_COLORS.earth }}>
            {EMOTION_LABELS[currentEmotion]}
          </span>
          <span style={{ color: HER_COLORS.textMuted }}>
            {Math.round(emotionConfidence * 100)}%
          </span>
        </motion.div>
      )}
    </div>
  );
}
