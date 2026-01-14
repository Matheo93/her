"use client";

import { useState, useRef, useEffect } from "react";

const DITTO_API = "/api/ditto";
const EVA_IMAGE = "/avatars/eva.png";
const TTS_API = "/api/tts";

export default function EvaDittoPage() {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("Initializing...");
  const [isPrepared, setIsPrepared] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    prepareSource();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const prepareSource = async () => {
    try {
      setStatus("Preparing Eva...");
      const response = await fetch(EVA_IMAGE);
      const blob = await response.blob();

      const formData = new FormData();
      formData.append("source_image", blob, "eva.png");

      const result = await fetch(`${DITTO_API}/prepare_source`, {
        method: "POST",
        body: formData,
      });

      if (result.ok) {
        setIsPrepared(true);
        setStatus("Ready");
        setMessages([{
          role: "assistant",
          content: "Salut ! Je suis Eva. Comment puis-je t'aider aujourd'hui ?"
        }]);
      } else {
        setStatus("Error preparing Eva");
      }
    } catch {
      setStatus("Service not available");
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);
    setStatus("Eva is thinking...");

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
      setStatus("Generating voice...");

      // Generate TTS audio
      const ttsResponse = await fetch(TTS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: responseText }),
      });

      if (ttsResponse.ok) {
        const audioBlob = await ttsResponse.blob();
        setStatus("Generating lip-sync video...");

        // Generate lip-sync video
        const formData = new FormData();
        formData.append("audio", audioBlob, "speech.wav");

        const videoResponse = await fetch(`${DITTO_API}/generate`, {
          method: "POST",
          body: formData,
        });

        if (videoResponse.ok) {
          const videoBlob = await videoResponse.blob();
          const url = URL.createObjectURL(videoBlob);
          setVideoUrl(url);
          if (videoRef.current) {
            videoRef.current.src = url;
            videoRef.current.play();
          }
        }
      }
      setStatus("Ready");
    } catch (error) {
      console.error(error);
      setStatus("Error");
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
          Eva - Ditto Chat
        </h1>
        <p className="text-center text-sm text-gray-400">{status}</p>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Video panel */}
        <div className="md:w-1/3 p-4 flex items-center justify-center bg-gray-900/50">
          <div className="w-full max-w-sm aspect-square rounded-xl overflow-hidden bg-gray-800 relative">
            {videoUrl ? (
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                loop
                playsInline
              />
            ) : (
              <img
                src={EVA_IMAGE}
                alt="Eva"
                className="w-full h-full object-cover"
              />
            )}
            {isLoading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
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
                disabled={!isPrepared || isLoading}
                className="flex-1 bg-gray-800 text-white rounded-full px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!isPrepared || isLoading || !input.trim()}
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
