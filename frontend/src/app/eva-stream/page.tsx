"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const STREAM_WS_URL = "wss://soldiers-sales-stood-wish.trycloudflare.com/ws/lipsync";
const EVA_IMAGE = "/avatars/eva_clean.png";

export default function EvaStreamPage() {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState("Connecting...");
  const [isConnected, setIsConnected] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const frameQueueRef = useRef<string[]>([]);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    setMessages([{
      role: "assistant",
      content: "Salut ! Je suis Eva en streaming temps réel. Parle-moi !"
    }]);
    connectWebSocket();
    return () => {
      wsRef.current?.close();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const connectWebSocket = () => {
    try {
      const ws = new WebSocket(STREAM_WS_URL);

      ws.onopen = () => {
        setIsConnected(true);
        setStatus("Connected - Ready");
        ws.send(JSON.stringify({ type: "select_avatar", avatar: "eva" }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "frame") {
          frameQueueRef.current.push(data.frame);
          if (!animationRef.current) {
            renderFrames();
          }
        } else if (data.type === "stream_start") {
          setIsSpeaking(true);
          setStatus("Eva parle...");
        } else if (data.type === "stream_end") {
          setIsSpeaking(false);
          setStatus("Ready");
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatus("Disconnected - Reconnecting...");
        setTimeout(connectWebSocket, 2000);
      };

      ws.onerror = () => {
        setStatus("Connection error");
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("WebSocket error:", error);
      setStatus("Connection failed");
    }
  };

  const renderFrames = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderLoop = () => {
      if (frameQueueRef.current.length > 0) {
        const frameData = frameQueueRef.current.shift();
        if (frameData) {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          img.src = `data:image/jpeg;base64,${frameData}`;
        }
        animationRef.current = requestAnimationFrame(renderLoop);
      } else {
        animationRef.current = null;
      }
    };

    renderLoop();
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !isConnected) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);
    setStatus("Eva réfléchit...");

    try {
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

      const ttsResponse = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: responseText }),
      });

      if (ttsResponse.ok && wsRef.current?.readyState === WebSocket.OPEN) {
        const audioBlob = await ttsResponse.blob();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const base64Audio = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );

        wsRef.current.send(JSON.stringify({
          type: "audio",
          audio: base64Audio,
          format: "wav"
        }));

        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.start();
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-rose-900 to-gray-900 text-white flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-2xl font-bold text-center bg-gradient-to-r from-rose-400 to-orange-400 bg-clip-text text-transparent">
          Eva - Real-Time Stream
        </h1>
        <p className="text-center text-sm text-gray-400">{status}</p>
        <div className="text-center mt-1">
          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className="text-xs text-gray-500">{isConnected ? 'WebSocket Connected' : 'Disconnected'}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="md:w-1/3 p-4 flex items-center justify-center bg-gray-900/50">
          <div className="w-full max-w-sm aspect-square rounded-xl overflow-hidden bg-gray-800 relative">
            <img
              src={EVA_IMAGE}
              alt="Eva"
              className={`w-full h-full object-cover absolute inset-0 ${isSpeaking ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
            />
            <canvas
              ref={canvasRef}
              width={512}
              height={512}
              className={`w-full h-full object-cover absolute inset-0 ${isSpeaking ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}
            />
            {isLoading && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div>
              </div>
            )}
          </div>
        </div>

        <div className="md:w-2/3 flex flex-col border-l border-gray-700">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-2xl ${
                    msg.role === "user"
                      ? "bg-rose-600 text-white rounded-br-sm"
                      : "bg-gray-700 text-white rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-gray-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Écris ton message..."
                disabled={isLoading || !isConnected}
                className="flex-1 bg-gray-800 text-white rounded-full px-4 py-3 outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !isConnected || !input.trim()}
                className="bg-rose-600 hover:bg-rose-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-full font-medium transition-all"
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
