"use client";

import { useState, useRef, useEffect, useCallback } from "react";

function getBackendUrl(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("backend")) return params.get("backend")!;
    if (window.location.hostname.includes("trycloudflare.com")) {
      return "https://safari-launches-decor-reader.trycloudflare.com";
    }
  }
  return "http://localhost:8000";
}

const EMOTIONS: Record<string, { glow: string; color: string; label: string }> = {
  joy: { glow: "rgba(251,191,36,0.4)", color: "#fbbf24", label: "Heureuse" },
  sadness: { glow: "rgba(96,165,250,0.4)", color: "#60a5fa", label: "Triste" },
  anger: { glow: "rgba(239,68,68,0.4)", color: "#ef4444", label: "En colère" },
  fear: { glow: "rgba(167,139,250,0.4)", color: "#a78bfa", label: "Inquiète" },
  surprise: { glow: "rgba(244,114,182,0.4)", color: "#f472b6", label: "Surprise" },
  tenderness: { glow: "rgba(253,164,175,0.4)", color: "#fda4af", label: "Tendre" },
  excitement: { glow: "rgba(251,146,60,0.4)", color: "#fb923c", label: "Excitée" },
  neutral: { glow: "rgba(255,255,255,0.1)", color: "#ffffff", label: "Sereine" },
};

export default function EvaPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("Connexion...");
  const [evaEmotion, setEvaEmotion] = useState("neutral");
  const [currentText, setCurrentText] = useState("");
  const [inputText, setInputText] = useState("");
  const [mouthOpen, setMouthOpen] = useState(0);

  // Animation states - more visible
  const [headTilt, setHeadTilt] = useState({ x: 0, y: 0, rotate: 0 });
  const [eyePosition, setEyePosition] = useState({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);
  const [breathPhase, setBreathPhase] = useState(0);
  const [smileAmount, setSmileAmount] = useState(0);
  const [browPosition, setBrowPosition] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);

  const emotion = EMOTIONS[evaEmotion] || EMOTIONS.neutral;

  // Natural blinking - every 2-5 seconds with double blinks
  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 2000 + Math.random() * 3000;
      return setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => {
          setIsBlinking(false);
          // 30% chance of double blink
          if (Math.random() < 0.3) {
            setTimeout(() => {
              setIsBlinking(true);
              setTimeout(() => setIsBlinking(false), 100);
            }, 150);
          }
        }, 120);
        blinkTimeout = scheduleBlink();
      }, delay);
    };
    let blinkTimeout = scheduleBlink();
    return () => clearTimeout(blinkTimeout);
  }, []);

  // Head micro-movements - more visible
  useEffect(() => {
    const moveHead = () => {
      if (!isSpeaking) {
        // Subtle idle head movement
        setHeadTilt({
          x: (Math.random() - 0.5) * 8,
          y: (Math.random() - 0.5) * 6,
          rotate: (Math.random() - 0.5) * 3
        });
      }
    };
    const interval = setInterval(moveHead, 2500 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, [isSpeaking]);

  // Eye movement - looking around naturally
  useEffect(() => {
    const moveEyes = () => {
      if (Math.random() < 0.6) {
        setEyePosition({
          x: (Math.random() - 0.5) * 12,
          y: (Math.random() - 0.5) * 8
        });
        // Return to center
        setTimeout(() => {
          setEyePosition({ x: 0, y: 0 });
        }, 600 + Math.random() * 800);
      }
    };
    const interval = setInterval(moveEyes, 2000 + Math.random() * 1500);
    return () => clearInterval(interval);
  }, []);

  // Breathing animation - more visible
  useEffect(() => {
    let frame = 0;
    const animate = () => {
      frame++;
      setBreathPhase(frame);
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animationFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, []);

  // Smile based on emotion
  useEffect(() => {
    const smiles: Record<string, number> = {
      joy: 0.8,
      tenderness: 0.5,
      excitement: 0.6,
      surprise: 0.3,
      neutral: 0.15,
      sadness: -0.2,
      anger: -0.3,
      fear: -0.1
    };
    setSmileAmount(smiles[evaEmotion] || 0.1);

    // Eyebrow position
    const brows: Record<string, number> = {
      surprise: 0.4,
      fear: 0.3,
      sadness: -0.2,
      anger: -0.4,
      joy: 0.1,
      neutral: 0
    };
    setBrowPosition(brows[evaEmotion] || 0);
  }, [evaEmotion]);

  // Connect WebSocket
  useEffect(() => {
    const connect = () => {
      const backendUrl = getBackendUrl();
      const wsUrl = backendUrl.replace("https://", "wss://").replace("http://", "ws://");
      const ws = new WebSocket(`${wsUrl}/ws/her`);

      ws.onopen = () => {
        setIsConnected(true);
        setStatus("Connectée");
        ws.send(JSON.stringify({
          type: "config",
          user_id: "eva_user",
          voice: "french"
        }));
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatus("Reconnexion...");
        setTimeout(connect, 2000);
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "config_ok":
            setStatus("Prête");
            break;

          case "her_context":
            setEvaEmotion(data.response_emotion || "neutral");
            if (data.thought_prefix) {
              setCurrentText(data.thought_prefix + " ");
            }
            break;

          case "speaking_start":
            setIsSpeaking(true);
            setIsProcessing(false);
            break;

          case "token":
            setCurrentText(prev => prev + data.content);
            break;

          case "speech":
            if (data.audio_base64) {
              const audio = base64ToArrayBuffer(data.audio_base64);
              // Play immediately - no waiting!
              playAudioImmediate(audio);
            }
            break;

          case "speaking_end":
            // Don't immediately stop - wait for audio to finish
            break;
        }
      };

      wsRef.current = ws;
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  // INSTANT audio playback with mouth animation
  const playAudioImmediate = useCallback(async (audioData: ArrayBuffer) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;

      // Decode and play immediately
      const buffer = await ctx.decodeAudioData(audioData.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      // Create analyser for mouth sync
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      source.connect(analyser);
      analyser.connect(ctx.destination);

      setIsSpeaking(true);

      // Animate mouth based on audio amplitude
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const animateMouth = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Get average amplitude
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;

        // Map to mouth opening (0-1)
        setMouthOpen(Math.min(1, avg / 128));

        if (isSpeaking) {
          requestAnimationFrame(animateMouth);
        }
      };

      source.onended = () => {
        setMouthOpen(0);
        // Check if more audio in queue
        if (audioQueueRef.current.length === 0) {
          setIsSpeaking(false);
          setCurrentText("");
          setStatus("Prête");
        }
      };

      source.start(0);
      animateMouth();

    } catch (e) {
      console.error("Audio error:", e);
    }
  }, [isSpeaking]);

  // Voice recording
  const startListening = useCallback(async () => {
    if (isListening || !wsRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        setIsListening(false);
        setIsProcessing(true);
        setStatus("Traitement...");

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "audio", data: base64 }));
          }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start();
      setIsListening(true);
      setStatus("Parle...");
    } catch (err) {
      setStatus("Erreur micro");
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const sendMessage = () => {
    if (!inputText.trim() || !wsRef.current) return;
    setIsProcessing(true);
    setCurrentText("");
    wsRef.current.send(JSON.stringify({
      type: "message",
      content: inputText,
      user_id: "eva_user"
    }));
    setInputText("");
    setStatus("Eva réfléchit...");
  };

  const interrupt = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "interrupt" }));
      audioQueueRef.current = [];
      audioContextRef.current?.close();
      audioContextRef.current = null;
      setIsSpeaking(false);
      setMouthOpen(0);
    }
  };

  // Calculate animations
  const breathScale = 1 + Math.sin(breathPhase * 0.03) * 0.015;
  const breathY = Math.sin(breathPhase * 0.03) * 2;

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 flex flex-col items-center justify-center p-4 overflow-hidden">

      {/* Ambient glow based on emotion */}
      <div
        className="fixed inset-0 pointer-events-none transition-all duration-700"
        style={{
          background: `radial-gradient(ellipse at 50% 30%, ${emotion.glow} 0%, transparent 60%)`
        }}
      />

      {/* Status bar */}
      <div className="fixed top-4 z-50">
        <div className="flex items-center gap-3 px-5 py-2 rounded-full bg-black/60 backdrop-blur-lg border border-white/10">
          <div className={`w-2.5 h-2.5 rounded-full transition-colors ${
            isConnected
              ? (isSpeaking ? "bg-rose-400 animate-pulse" : "bg-emerald-400")
              : "bg-red-400"
          }`} />
          <span className="text-white/80 text-sm font-medium">{status}</span>
          {isProcessing && (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* Avatar Container */}
      <div className="relative mb-24">

        {/* Outer glow ring */}
        <div
          className="absolute -inset-8 rounded-full transition-all duration-500"
          style={{
            boxShadow: isSpeaking
              ? `0 0 80px 30px ${emotion.glow}, 0 0 120px 60px ${emotion.glow}`
              : `0 0 30px 10px rgba(255,255,255,0.03)`
          }}
        />

        {/* Main face container */}
        <div
          className="relative w-80 h-80 md:w-96 md:h-96 rounded-full overflow-hidden"
          style={{
            transform: `
              scale(${breathScale})
              translateY(${breathY + headTilt.y}px)
              translateX(${headTilt.x}px)
              rotate(${headTilt.rotate}deg)
            `,
            transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: `
              inset 0 0 60px rgba(0,0,0,0.5),
              0 0 0 1px rgba(255,255,255,0.1)
            `
          }}
        >
          {/* Base face image */}
          <img
            src="/avatars/eva.jpg"
            alt="Eva"
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              transform: `translate(${eyePosition.x * 0.3}px, ${eyePosition.y * 0.3}px)`,
              transition: "transform 0.3s ease-out"
            }}
          />

          {/* Eye area - for blink effect */}
          <div
            className="absolute top-[28%] left-[15%] right-[15%] h-[15%] pointer-events-none"
            style={{
              background: isBlinking
                ? "linear-gradient(to bottom, transparent 0%, rgba(200,180,170,0.95) 30%, rgba(200,180,170,0.95) 70%, transparent 100%)"
                : "transparent",
              transition: isBlinking ? "background 0.05s" : "background 0.08s",
              transform: `translateY(${browPosition * -8}px)`
            }}
          />

          {/* Mouth animation overlay */}
          <div
            className="absolute bottom-[28%] left-1/2 -translate-x-1/2 pointer-events-none"
            style={{ opacity: isSpeaking ? 1 : 0, transition: "opacity 0.1s" }}
          >
            {/* Animated mouth shape */}
            <div
              className="relative"
              style={{
                width: `${28 + mouthOpen * 12}px`,
                height: `${4 + mouthOpen * 16}px`,
                background: `linear-gradient(to bottom,
                  rgba(180,100,100,${0.6 + mouthOpen * 0.3}) 0%,
                  rgba(120,60,60,${0.8 + mouthOpen * 0.2}) 50%,
                  rgba(80,40,40,0.9) 100%
                )`,
                borderRadius: `${40 + mouthOpen * 10}% / ${50 + mouthOpen * 30}%`,
                boxShadow: `
                  inset 0 ${2 + mouthOpen * 3}px ${4 + mouthOpen * 4}px rgba(0,0,0,0.5),
                  0 1px 2px rgba(0,0,0,0.3)
                `,
                transition: "all 0.05s ease-out"
              }}
            />
          </div>

          {/* Smile curve overlay - for idle expressions */}
          {!isSpeaking && smileAmount !== 0 && (
            <div
              className="absolute bottom-[30%] left-1/2 -translate-x-1/2 pointer-events-none"
              style={{
                width: "36px",
                height: smileAmount > 0 ? "8px" : "6px",
                borderRadius: smileAmount > 0 ? "0 0 50% 50%" : "50% 50% 0 0",
                border: `2px solid rgba(180,120,120,${Math.abs(smileAmount) * 0.4})`,
                borderTop: smileAmount > 0 ? "none" : undefined,
                borderBottom: smileAmount < 0 ? "none" : undefined,
                transform: `scaleX(${0.8 + Math.abs(smileAmount) * 0.4})`,
                opacity: 0.6
              }}
            />
          )}

          {/* Subtle vignette for depth */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(circle at 50% 40%, transparent 50%, rgba(0,0,0,0.3) 100%)"
            }}
          />
        </div>

        {/* Speaking indicator rings */}
        {isSpeaking && (
          <>
            <div
              className="absolute -inset-4 rounded-full border-2 animate-ping"
              style={{ borderColor: emotion.color, opacity: 0.4 }}
            />
            <div
              className="absolute -inset-8 rounded-full border animate-ping"
              style={{ borderColor: emotion.color, opacity: 0.2, animationDelay: "0.15s" }}
            />
          </>
        )}

        {/* Name and emotion */}
        <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
          <h2 className="text-white text-2xl font-light tracking-wide">Eva</h2>
          <p
            className="text-sm mt-1 transition-colors duration-300"
            style={{ color: isSpeaking ? emotion.color : "rgba(255,255,255,0.5)" }}
          >
            {isSpeaking ? emotion.label : isListening ? "T'écoute..." : isProcessing ? "Réfléchit..." : "En ligne"}
          </p>
        </div>
      </div>

      {/* Response text bubble */}
      {currentText && (
        <div className="max-w-lg mx-auto mb-8 px-6 py-4 rounded-2xl bg-white/5 backdrop-blur border border-white/10">
          <p className="text-white/90 text-center leading-relaxed">{currentText}</p>
        </div>
      )}

      {/* Controls */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/95 to-transparent">
        <div className="max-w-lg mx-auto space-y-4">

          {/* Text input */}
          <div className="flex gap-3">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Écris à Eva..."
              className="flex-1 px-5 py-3 rounded-full bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-rose-400/50 focus:bg-white/15 transition-all"
            />
            <button
              onClick={sendMessage}
              disabled={!inputText.trim() || !isConnected}
              className="px-6 py-3 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 disabled:from-white/10 disabled:to-white/10 text-white font-medium transition-all disabled:opacity-50"
            >
              Envoyer
            </button>
          </div>

          {/* Voice controls */}
          <div className="flex justify-center items-center gap-4">
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              disabled={!isConnected || isSpeaking}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
                isListening
                  ? "bg-emerald-500 scale-110 shadow-lg shadow-emerald-500/50"
                  : "bg-white/10 hover:bg-white/20 hover:scale-105"
              } text-white disabled:opacity-40 disabled:hover:scale-100`}
            >
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            {isSpeaking && (
              <button
                onClick={interrupt}
                className="px-5 py-2.5 rounded-full bg-red-500/80 hover:bg-red-500 text-white text-sm font-medium transition-colors"
              >
                Interrompre
              </button>
            )}
          </div>

          {isListening && (
            <p className="text-center text-emerald-400 text-sm animate-pulse font-medium">
              🎤 Je t'écoute...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
