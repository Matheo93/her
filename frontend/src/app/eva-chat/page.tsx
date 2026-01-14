"use client";

import { useState, useRef, useEffect } from "react";

const EVA_IMAGE = "/avatars/eva_clean.png";
const EVA_IDLE = "/avatars/eva_idle.mp4";

export default function EvaChatPage() {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState("Ready");

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([{
      role: "assistant",
      content: "Salut ! Je suis Eva. Comment puis-je t'aider aujourd'hui ?"
    }]);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Sync video with audio
  useEffect(() => {
    if (videoRef.current) {
      if (isSpeaking) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isSpeaking]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);
    setStatus("Eva réfléchit...");

    try {
      // Get AI response
      const aiResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });

      let responseText = "Je suis désolée, je n'ai pas pu répondre.";
      if (aiResponse.ok) {
        const data = await aiResponse.json();
        responseText = data.response || responseText;
      }

      setMessages(prev => [...prev, { role: "assistant", content: responseText }]);
      setStatus("Génération de la voix...");

      // Generate TTS audio
      const ttsResponse = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: responseText }),
      });

      if (ttsResponse.ok) {
        const audioBlob = await ttsResponse.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.onplay = () => {
            setIsSpeaking(true);
            setStatus("Eva parle...");
          };
          audioRef.current.onended = () => {
            setIsSpeaking(false);
            setStatus("Ready");
            URL.revokeObjectURL(audioUrl);
          };
          audioRef.current.play();
        }
      } else {
        setStatus("Ready");
      }
    } catch (error) {
      console.error(error);
      setStatus("Erreur");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-2xl font-bold text-center bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Eva Chat
        </h1>
        <p className="text-center text-sm text-gray-400">{status}</p>
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} className="hidden" />

      {/* Main content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Video panel */}
        <div className="md:w-1/3 p-4 flex items-center justify-center bg-gray-900/50">
          <div className="w-full max-w-sm aspect-square rounded-xl overflow-hidden bg-gray-800 relative">
            {/* Static image when not speaking */}
            <img
              src={EVA_IMAGE}
              alt="Eva"
              className={`w-full h-full object-cover absolute inset-0 transition-opacity duration-300 ${isSpeaking ? 'opacity-0' : 'opacity-100'}`}
            />
            {/* Video when speaking */}
            <video
              ref={videoRef}
              src={EVA_IDLE}
              className={`w-full h-full object-cover absolute inset-0 transition-opacity duration-300 ${isSpeaking ? 'opacity-100' : 'opacity-0'}`}
              loop
              muted
              playsInline
            />
            {isLoading && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
              </div>
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="md:w-2/3 flex flex-col border-l border-gray-700">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-2xl ${
                    msg.role === "user"
                      ? "bg-purple-600 text-white rounded-br-sm"
                      : "bg-gray-700 text-white rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Écris ton message..."
                disabled={isLoading || isSpeaking}
                className="flex-1 bg-gray-800 text-white rounded-full px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || isSpeaking || !input.trim()}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-full font-medium transition-all"
              >
                {isLoading ? "..." : "Envoyer"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
