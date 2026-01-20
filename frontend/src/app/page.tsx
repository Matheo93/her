"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { VideoCall } from "@/components/video-call";
import { HER_COLORS, HER_SPRINGS, EMOTION_PRESENCE } from "@/styles/her-theme";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

interface Message {
  role: "user" | "assistant";
  content: string;
  emotion?: string;
}

interface Voice {
  id: string;
  name: string;
  default: boolean;
}

type Emotion = "joy" | "sadness" | "anger" | "fear" | "surprise" | "love" | "neutral" | "tenderness" | "excitement";
type Mood = "default" | "playful" | "calm" | "curious" | "intimate";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState("eva");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);

  // Emotion & Mood states
  const [currentEmotion, setCurrentEmotion] = useState<Emotion>("neutral");
  const [currentMood, setCurrentMood] = useState<Mood>("default");
  const [, setEmotionConfidence] = useState(0);

  // Video call state
  const [showVideoCall, setShowVideoCall] = useState(false);

  // Breathing animation state
  const [breathPhase, setBreathPhase] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioQueueRef = useRef<Blob[]>([]);
  const isPlayingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const currentEmotionRef = useRef<Emotion>("neutral");
  const playNextAudioRef = useRef<() => void>(() => {});

  // Breathing animation
  useEffect(() => {
    const interval = setInterval(() => {
      setBreathPhase((prev) => (prev + 1) % 100);
    }, 40);
    return () => clearInterval(interval);
  }, []);

  // Load available voices
  useEffect(() => {
    fetch(`${BACKEND_URL}/voices`)
      .then((res) => res.json())
      .then((data) => {
        if (data.voices) {
          setVoices(data.voices);
          const defaultVoice = data.voices.find((v: Voice) => v.default);
          if (defaultVoice) setSelectedVoice(defaultVoice.id);
        }
      })
      .catch(console.error);
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentResponse]);

  // Audio queue player
  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const blob = audioQueueRef.current.shift()!;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    audio.onended = () => {
      URL.revokeObjectURL(url);
      isPlayingRef.current = false;
      if (audioQueueRef.current.length > 0) {
        playNextAudioRef.current();
      } else {
        setIsSpeaking(false);
      }
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      isPlayingRef.current = false;
      setIsSpeaking(false);
    };

    try {
      await audio.play();
    } catch (e) {
      console.error("Audio play error:", e);
      isPlayingRef.current = false;
      setIsSpeaking(false);
    }
  }, []);

  // Keep ref updated
  useEffect(() => {
    playNextAudioRef.current = playNextAudio;
  }, [playNextAudio]);

  // WebSocket connection
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws/stream`);

      ws.onopen = () => {
        setIsConnected(true);
        ws.send(JSON.stringify({
          type: "config",
          voice: selectedVoice,
          auto_mood: true,
        }));
      };

      ws.onclose = () => {
        setIsConnected(false);
        setTimeout(connect, 3000);
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          if (voiceEnabled) {
            audioQueueRef.current.push(event.data);
            playNextAudio();
          }
          return;
        }

        const data = JSON.parse(event.data);

        switch (data.type) {
          case "token":
            setCurrentResponse((prev) => prev + data.content);
            break;

          case "emotion":
            setCurrentEmotion(data.emotion as Emotion);
            currentEmotionRef.current = data.emotion as Emotion;
            setEmotionConfidence(data.confidence);
            break;

          case "mood":
            setCurrentMood(data.mood as Mood);
            break;

          case "response_end":
            setCurrentResponse((prev) => {
              if (prev) {
                setMessages((msgs) => {
                  const lastMsg = msgs[msgs.length - 1];
                  if (lastMsg?.role === "assistant" && lastMsg?.content === prev) {
                    return msgs;
                  }
                  return [
                    ...msgs,
                    { role: "assistant", content: prev, emotion: currentEmotionRef.current },
                  ];
                });
              }
              return "";
            });
            setIsLoading(false);
            break;

          case "transcript":
            setMessages((msgs) => {
              const lastMsg = msgs[msgs.length - 1];
              if (lastMsg?.role === "user" && lastMsg?.content === data.text) {
                return msgs;
              }
              return [...msgs, { role: "user", content: data.text }];
            });
            setIsLoading(true);
            setCurrentResponse("");
            break;

          case "config_ok":
            break;

          case "error":
            console.error("WebSocket error:", data.message);
            setIsLoading(false);
            break;
        }
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, [selectedVoice, voiceEnabled, playNextAudio]);

  // Send message
  const sendMessage = useCallback(() => {
    if (!input.trim() || !wsRef.current || isLoading) return;

    const userMessage = input.trim();
    setMessages((msgs) => [...msgs, { role: "user", content: userMessage }]);
    setInput("");
    setIsLoading(true);
    setCurrentResponse("");
    audioQueueRef.current = [];

    wsRef.current.send(JSON.stringify({
      type: "message",
      content: userMessage,
    }));
  }, [input, isLoading]);

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
        stream.getTracks().forEach((t) => t.stop());
        setIsListening(false);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          setIsLoading(true);
          audioQueueRef.current = [];
          wsRef.current.send(blob);
        }
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      console.error("Mic error:", err);
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);
  }, []);

  // Get glow based on emotion
  const emotionGlow = EMOTION_PRESENCE[currentEmotion]?.glow || EMOTION_PRESENCE.neutral.glow;
  const breathScale = 1 + Math.sin(breathPhase * Math.PI / 50) * 0.02;

  return (
    <div
      className="min-h-screen"
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${HER_COLORS.cream} 0%, ${HER_COLORS.warmWhite} 70%)`,
      }}
    >
      {/* Header - Minimal, invisible */}
      <header
        className="fixed top-0 left-0 right-0 z-10 backdrop-blur-sm"
        style={{
          backgroundColor: `${HER_COLORS.warmWhite}E6`,
          borderBottom: `1px solid ${HER_COLORS.cream}`,
        }}
      >
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Connection - subtle warm glow instead of dot */}
            <motion.div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: isConnected ? HER_COLORS.success : HER_COLORS.softShadow,
              }}
              animate={{
                scale: isConnected ? [1, 1.1, 1] : 1,
                opacity: isConnected ? 1 : 0.5,
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* Eva name - warm typography */}
            <h1
              className="text-xl font-light tracking-wide"
              style={{ color: HER_COLORS.earth }}
            >
              Eva
            </h1>

            {/* Speaking indicator - warm wave */}
            <AnimatePresence>
              {isSpeaking && (
                <motion.div
                  className="flex items-center gap-0.5 ml-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-0.5 rounded-full"
                      style={{ backgroundColor: HER_COLORS.coral }}
                      animate={{
                        height: [8, 16, 8],
                      }}
                      transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        delay: i * 0.1,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-3">
            {/* Mood - subtle text only */}
            {currentMood !== "default" && (
              <span
                className="text-xs px-2 py-1 rounded-full"
                style={{
                  backgroundColor: HER_COLORS.cream,
                  color: HER_COLORS.earth,
                }}
              >
                {currentMood}
              </span>
            )}

            {/* Navigation buttons - warm style */}
            <a
              href="/call"
              className="p-2 rounded-full transition-all duration-300"
              style={{
                backgroundColor: HER_COLORS.cream,
                color: HER_COLORS.earth,
              }}
              title="Appel temps réel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </a>

            <a
              href="/interruptible"
              className="p-2 rounded-full transition-all duration-300"
              style={{
                backgroundColor: HER_COLORS.cream,
                color: HER_COLORS.earth,
              }}
              title="Mode interruptible"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </a>

            <a
              href="/facetime"
              className="p-2 rounded-full transition-all duration-300"
              style={{
                backgroundColor: HER_COLORS.cream,
                color: HER_COLORS.earth,
              }}
              title="FaceTime"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </a>

            {/* Voice toggle */}
            <button
              onClick={() => {
                if (isSpeaking) stopSpeaking();
                setVoiceEnabled(!voiceEnabled);
              }}
              className="p-2 rounded-full transition-all duration-300"
              style={{
                backgroundColor: voiceEnabled ? HER_COLORS.blush : HER_COLORS.cream,
                color: HER_COLORS.earth,
              }}
              title={voiceEnabled ? "Désactiver la voix" : "Activer la voix"}
            >
              {voiceEnabled ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              )}
            </button>

            {/* Voice selector */}
            <div className="relative">
              <button
                onClick={() => setShowVoiceMenu(!showVoiceMenu)}
                className="p-2 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: HER_COLORS.cream,
                  color: HER_COLORS.earth,
                }}
                title="Choisir la voix"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
              <AnimatePresence>
                {showVoiceMenu && (
                  <motion.div
                    className="absolute right-0 top-full mt-2 w-56 rounded-xl shadow-lg overflow-hidden z-20"
                    style={{
                      backgroundColor: HER_COLORS.warmWhite,
                      border: `1px solid ${HER_COLORS.cream}`,
                    }}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={HER_SPRINGS.gentle}
                  >
                    <div className="p-2">
                      <p className="text-xs px-2 mb-2" style={{ color: HER_COLORS.textSecondary }}>
                        Voix d&apos;Eva
                      </p>
                      {voices.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => {
                            setSelectedVoice(v.id);
                            setShowVoiceMenu(false);
                            if (wsRef.current?.readyState === WebSocket.OPEN) {
                              wsRef.current.send(JSON.stringify({
                                type: "config",
                                voice: v.id,
                              }));
                            }
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200"
                          style={{
                            backgroundColor: selectedVoice === v.id ? HER_COLORS.blush : "transparent",
                            color: HER_COLORS.earth,
                          }}
                        >
                          {v.id === "eva" && "Ariane (Suisse)"}
                          {v.id === "eva-warm" && "Eloise (Chaleureuse)"}
                          {v.id === "eva-young" && "Coralie (Jeune)"}
                          {v.id === "eva-soft" && "Vivienne (Intime)"}
                          {v.id === "eva-sensual" && "Brigitte (Sensuelle)"}
                          {v.id === "male" && "Henri"}
                          {v.id === "male-warm" && "Rémy (Chaleureux)"}
                          {v.id === "male-deep" && "Alain (Profond)"}
                          {v.id === "eva-en" && "Jenny (English)"}
                          {v.id === "eva-en-warm" && "Aria (US English)"}
                          {!["eva", "eva-warm", "eva-young", "eva-soft", "eva-sensual", "male", "male-warm", "male-deep", "eva-en", "eva-en-warm"].includes(v.id) && v.id}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="max-w-2xl mx-auto px-6 pt-24 pb-32">
        {messages.length === 0 && !currentResponse && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            {/* Breathing presence orb - no face, just warm glow */}
            <motion.div
              className="w-24 h-24 rounded-full mb-8"
              style={{
                background: `radial-gradient(circle, ${HER_COLORS.coral} 0%, ${HER_COLORS.blush} 50%, ${HER_COLORS.cream} 100%)`,
                boxShadow: `0 0 60px ${emotionGlow}`,
                transform: `scale(${breathScale})`,
              }}
              animate={isSpeaking ? {
                scale: [1, 1.1, 1],
              } : {}}
              transition={isSpeaking ? {
                duration: 0.5,
                repeat: Infinity,
              } : {}}
            />
            <h2
              className="text-2xl font-light mb-2"
              style={{ color: HER_COLORS.earth }}
            >
              Salut, je suis Eva
            </h2>
            <p
              className="max-w-sm"
              style={{ color: HER_COLORS.textSecondary }}
            >
              Je suis là pour discuter avec toi. Parle-moi de ta journée, de tes pensées...
            </p>
            <p
              className="text-sm mt-4"
              style={{ color: HER_COLORS.textMuted }}
            >
              Maintiens le micro appuyé pour parler
            </p>
          </div>
        )}

        <div className="space-y-6">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={HER_SPRINGS.gentle}
            >
              <div
                className="max-w-[80%] px-5 py-3 rounded-2xl"
                style={msg.role === "user"
                  ? {
                      backgroundColor: HER_COLORS.earth,
                      color: HER_COLORS.warmWhite,
                    }
                  : {
                      backgroundColor: HER_COLORS.warmWhite,
                      color: HER_COLORS.earth,
                      boxShadow: `0 2px 12px ${HER_COLORS.softShadow}40`,
                      border: `1px solid ${HER_COLORS.cream}`,
                    }
                }
              >
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </motion.div>
          ))}

          {/* Current streaming response */}
          {currentResponse && (
            <motion.div
              className="flex justify-start"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div
                className="max-w-[80%] px-5 py-3 rounded-2xl"
                style={{
                  backgroundColor: HER_COLORS.warmWhite,
                  color: HER_COLORS.earth,
                  boxShadow: `0 2px 12px ${HER_COLORS.softShadow}40`,
                  border: `1px solid ${HER_COLORS.cream}`,
                }}
              >
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{currentResponse}</p>
                <motion.span
                  className="inline-block w-0.5 h-4 ml-1 rounded"
                  style={{ backgroundColor: HER_COLORS.coral }}
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
              </div>
            </motion.div>
          )}

          {/* Loading indicator - gentle breathing dots */}
          {isLoading && !currentResponse && (
            <motion.div
              className="flex justify-start"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div
                className="px-5 py-3 rounded-2xl"
                style={{
                  backgroundColor: HER_COLORS.warmWhite,
                  boxShadow: `0 2px 12px ${HER_COLORS.softShadow}40`,
                  border: `1px solid ${HER_COLORS.cream}`,
                }}
              >
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: HER_COLORS.blush }}
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.5, 1, 0.5],
                      }}
                      transition={{
                        duration: 1.2,
                        repeat: Infinity,
                        delay: i * 0.2,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <footer
        className="fixed bottom-0 left-0 right-0 backdrop-blur-sm"
        style={{
          backgroundColor: `${HER_COLORS.warmWhite}E6`,
          borderTop: `1px solid ${HER_COLORS.cream}`,
        }}
      >
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            {/* Mic button */}
            <motion.button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              disabled={!isConnected}
              className="p-4 rounded-full transition-all duration-300"
              style={{
                backgroundColor: isListening
                  ? HER_COLORS.coral
                  : isConnected
                    ? HER_COLORS.cream
                    : HER_COLORS.softShadow,
                color: isListening ? HER_COLORS.warmWhite : HER_COLORS.earth,
                cursor: isConnected ? "pointer" : "not-allowed",
                opacity: isConnected ? 1 : 0.5,
              }}
              animate={isListening ? { scale: 1.1 } : { scale: 1 }}
              whileTap={isConnected ? { scale: 0.95 } : {}}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </motion.button>

            {/* Text input */}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Ou écris-moi quelque chose..."
              disabled={!isConnected}
              className="flex-1 px-5 py-3 rounded-full focus:outline-none transition-all duration-300"
              style={{
                backgroundColor: HER_COLORS.cream,
                color: HER_COLORS.earth,
                opacity: isConnected ? 1 : 0.5,
              }}
            />

            {/* Send button */}
            <motion.button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading || !isConnected}
              className="p-3 rounded-full transition-all duration-300"
              style={{
                backgroundColor: HER_COLORS.coral,
                color: HER_COLORS.warmWhite,
                opacity: (!input.trim() || isLoading || !isConnected) ? 0.5 : 1,
                cursor: (!input.trim() || isLoading || !isConnected) ? "not-allowed" : "pointer",
              }}
              whileHover={input.trim() && !isLoading && isConnected ? { scale: 1.05 } : {}}
              whileTap={input.trim() && !isLoading && isConnected ? { scale: 0.95 } : {}}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </motion.button>
          </div>

          {/* Recording indicator */}
          <AnimatePresence>
            {isListening && (
              <motion.div
                className="flex items-center justify-center gap-2 mt-3"
                style={{ color: HER_COLORS.coral }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
              >
                <motion.span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: HER_COLORS.coral }}
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span className="text-sm font-light">Écoute en cours... Relâche pour envoyer</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </footer>

      {/* Video Call Modal */}
      {showVideoCall && (
        <VideoCall
          onClose={() => setShowVideoCall(false)}
          backendUrl={BACKEND_URL}
          selectedVoice={selectedVoice}
          messages={messages}
          onNewMessage={(msg) => setMessages((prev) => [...prev, msg])}
        />
      )}
    </div>
  );
}
