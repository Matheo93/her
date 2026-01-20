"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { VideoCall } from "@/components/video-call";

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

type Emotion = "joy" | "sadness" | "anger" | "fear" | "surprise" | "love" | "neutral";
type Mood = "default" | "playful" | "calm" | "curious" | "intimate";

const EMOTION_COLORS: Record<Emotion, string> = {
  joy: "from-yellow-400 to-orange-400",
  sadness: "from-blue-400 to-indigo-400",
  anger: "from-red-500 to-rose-500",
  fear: "from-purple-400 to-violet-400",
  surprise: "from-cyan-400 to-teal-400",
  love: "from-pink-400 to-rose-400",
  neutral: "from-zinc-400 to-slate-400",
};

const EMOTION_EMOJIS: Record<Emotion, string> = {
  joy: "😊",
  sadness: "😢",
  anger: "😠",
  fear: "😰",
  surprise: "😮",
  love: "🥰",
  neutral: "😐",
};

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

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioQueueRef = useRef<Blob[]>([]);
  const isPlayingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const currentEmotionRef = useRef<Emotion>("neutral");
  const playNextAudioRef = useRef<() => void>(() => {});

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

  // WebSocket connection - use new /ws/stream endpoint
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws/stream`);

      ws.onopen = () => {
        setIsConnected(true);
        console.log("⚡ Connected to Eva (streaming mode)");
        // Configure voice
        ws.send(JSON.stringify({
          type: "config",
          voice: selectedVoice,
          auto_mood: true,
        }));
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log("Disconnected, reconnecting...");
        setTimeout(connect, 3000);
      };

      ws.onmessage = async (event) => {
        // Handle binary audio data
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
                  // Prevent duplicate messages
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
            // STT result from mic - prevent duplicates
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

          case "audio_start":
            // Audio chunk coming
            break;

          case "audio_end":
            // All audio sent
            break;

          case "config_ok":
            console.log("Config OK:", data);
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
  }, [selectedVoice, voiceEnabled, playNextAudio]); // Remove currentEmotion - it causes reconnects

  // Send message
  const sendMessage = useCallback(() => {
    if (!input.trim() || !wsRef.current || isLoading) return;

    const userMessage = input.trim();
    setMessages((msgs) => [...msgs, { role: "user", content: userMessage }]);
    setInput("");
    setIsLoading(true);
    setCurrentResponse("");
    audioQueueRef.current = []; // Clear audio queue for new message

    wsRef.current.send(JSON.stringify({
      type: "message",
      content: userMessage,
    }));
  }, [input, isLoading]);

  // Voice recording - Push to talk
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

        // Send audio directly to WebSocket for processing
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          setIsLoading(true);
          audioQueueRef.current = []; // Clear audio queue
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

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);
  }, []);

  // Get gradient based on current emotion
  const emotionGradient = EMOTION_COLORS[currentEmotion] || EMOTION_COLORS.neutral;

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 to-orange-50 dark:from-zinc-950 dark:to-zinc-900">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-rose-100 dark:border-zinc-800">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Connection indicator */}
            <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-emerald-400" : "bg-zinc-300"} ${isConnected ? "animate-pulse" : ""}`} />

            {/* Eva name + emotion */}
            <h1 className="text-xl font-light tracking-wide text-zinc-800 dark:text-zinc-100">Eva</h1>

            {/* Emotion indicator */}
            {currentEmotion !== "neutral" && (
              <span className="text-lg" title={`Émotion détectée: ${currentEmotion}`}>
                {EMOTION_EMOJIS[currentEmotion]}
              </span>
            )}

            {/* Speaking indicator */}
            {isSpeaking && (
              <div className="flex items-center gap-1 ml-2">
                <span className="w-1 h-3 bg-rose-400 rounded-full animate-pulse" />
                <span className="w-1 h-4 bg-rose-400 rounded-full animate-pulse" style={{ animationDelay: "100ms" }} />
                <span className="w-1 h-2 bg-rose-400 rounded-full animate-pulse" style={{ animationDelay: "200ms" }} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Mood indicator */}
            {currentMood !== "default" && (
              <span className="text-xs px-2 py-1 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400">
                {currentMood}
              </span>
            )}

            {/* Real-time VAD Call button */}
            <a
              href="/call"
              className="p-2 rounded-full transition-all bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
              title="Appel temps reel avec VAD"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </a>

            {/* Interruptible Voice button */}
            <a
              href="/interruptible"
              className="p-2 rounded-full transition-all bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50"
              title="Mode conversation interruptible"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </a>

            {/* FaceTime button */}
            <a
              href="/facetime"
              className="p-2 rounded-full transition-all bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/50"
              title="FaceTime avec analyse d'emotions"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </a>

            {/* Voice toggle */}
            <button
              onClick={() => {
                if (isSpeaking) stopSpeaking();
                setVoiceEnabled(!voiceEnabled);
              }}
              className={`p-2 rounded-full transition-all ${
                voiceEnabled
                  ? "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
              }`}
              title={voiceEnabled ? "Désactiver la voix" : "Activer la voix"}
            >
              {voiceEnabled ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              )}
            </button>

            {/* Voice selector */}
            <div className="relative">
              <button
                onClick={() => setShowVoiceMenu(!showVoiceMenu)}
                className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                title="Choisir la voix"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
              {showVoiceMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden z-20">
                  <div className="p-2">
                    <p className="text-xs text-zinc-500 px-2 mb-2">Voix d&apos;Eva</p>
                    {voices.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setSelectedVoice(v.id);
                          setShowVoiceMenu(false);
                          // Update WebSocket config
                          if (wsRef.current?.readyState === WebSocket.OPEN) {
                            wsRef.current.send(JSON.stringify({
                              type: "config",
                              voice: v.id,
                            }));
                          }
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                          selectedVoice === v.id
                            ? "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
                            : "hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {v.id === "eva" && "🎀 Ariane (Suisse)"}
                        {v.id === "eva-warm" && "💝 Eloise (Chaleureuse)"}
                        {v.id === "eva-young" && "✨ Coralie (Jeune)"}
                        {v.id === "eva-soft" && "🌸 Vivienne (Intime)"}
                        {v.id === "eva-sensual" && "🌹 Brigitte (Sensuelle)"}
                        {v.id === "male" && "👤 Henri"}
                        {v.id === "male-warm" && "💫 Rémy (Chaleureux)"}
                        {v.id === "male-deep" && "🎭 Alain (Profond)"}
                        {v.id === "eva-en" && "🇬🇧 Jenny (English)"}
                        {v.id === "eva-en-warm" && "🇺🇸 Aria (US English)"}
                        {!["eva", "eva-warm", "eva-young", "eva-soft", "eva-sensual", "male", "male-warm", "male-deep", "eva-en", "eva-en-warm"].includes(v.id) && v.id}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="max-w-2xl mx-auto px-6 pt-24 pb-32">
        {messages.length === 0 && !currentResponse && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            {/* Animated avatar with emotion gradient */}
            <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${emotionGradient} mb-8 ${isSpeaking ? "animate-pulse scale-110" : ""} transition-all duration-500 shadow-lg`} />
            <h2 className="text-2xl font-light text-zinc-700 dark:text-zinc-200 mb-2">
              Salut, je suis Eva
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-sm">
              Je suis là pour discuter avec toi. Parle-moi de ta journée, de tes pensées...
            </p>
            <p className="text-zinc-400 dark:text-zinc-500 text-sm mt-4">
              🎤 Maintiens le micro appuyé pour parler
            </p>
            <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-2">
              Je détecte tes émotions et j&apos;adapte ma voix 💫
            </p>
          </div>
        )}

        <div className="space-y-6">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-5 py-3 rounded-2xl ${
                  msg.role === "user"
                    ? "bg-zinc-800 dark:bg-zinc-700 text-white"
                    : "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 shadow-sm border border-rose-100 dark:border-zinc-700"
                }`}
              >
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {/* Current streaming response */}
          {currentResponse && (
            <div className="flex justify-start">
              <div className="max-w-[80%] px-5 py-3 rounded-2xl bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 shadow-sm border border-rose-100 dark:border-zinc-700">
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{currentResponse}</p>
                <span className="inline-block w-2 h-4 bg-rose-400 animate-pulse ml-1" />
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && !currentResponse && (
            <div className="flex justify-start">
              <div className="px-5 py-3 rounded-2xl bg-white dark:bg-zinc-800 shadow-sm border border-rose-100 dark:border-zinc-700">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-rose-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-rose-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-t border-rose-100 dark:border-zinc-800">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            {/* Mic button - Push to talk */}
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              disabled={!isConnected}
              className={`p-4 rounded-full transition-all ${
                isListening
                  ? `bg-gradient-to-r ${emotionGradient} text-white scale-110 shadow-lg`
                  : isConnected
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>

            {/* Text input */}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Ou écris-moi quelque chose..."
              disabled={!isConnected}
              className="flex-1 px-5 py-3 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-300 dark:focus:ring-rose-500 disabled:opacity-50"
            />

            {/* Send button */}
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading || !isConnected}
              className={`p-3 rounded-full bg-gradient-to-r ${emotionGradient} text-white disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-all`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>

          {/* Recording indicator */}
          {isListening && (
            <div className="flex items-center justify-center gap-2 mt-3 text-rose-500">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-sm font-medium">Écoute en cours... Relâche pour envoyer</span>
            </div>
          )}
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
