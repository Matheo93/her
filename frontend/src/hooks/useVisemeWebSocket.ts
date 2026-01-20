"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { VisemeWeights } from "@/components/RealisticAvatar3D";

interface UseVisemeWebSocketOptions {
  backendUrl: string;
  enabled?: boolean;
}

interface UseVisemeWebSocketReturn {
  visemeWeights: VisemeWeights;
  isConnected: boolean;
  sendAudio: (audioData: ArrayBuffer) => void;
  sendAudioBase64: (base64Data: string) => void;
}

export function useVisemeWebSocket({
  backendUrl,
  enabled = true,
}: UseVisemeWebSocketOptions): UseVisemeWebSocketReturn {
  const [visemeWeights, setVisemeWeights] = useState<VisemeWeights>({ sil: 1 });
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Connect to viseme WebSocket
  useEffect(() => {
    if (!enabled) return;

    const connect = () => {
      const wsUrl = `${backendUrl.replace("http", "ws")}/ws/viseme`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          // Send ping to keep alive
          const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 10000);

          ws.addEventListener("close", () => clearInterval(pingInterval));
        };

        ws.onclose = () => {
          setIsConnected(false);
          setVisemeWeights({ sil: 1 });

          // Reconnect after delay
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          ws.close();
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "viseme" && data.weights) {
              setVisemeWeights(data.weights);
            }
          } catch {
            // Ignore parse errors
          }
        };
      } catch {
        // Connection failed, retry
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [backendUrl, enabled]);

  // Send raw audio data (Float32Array as ArrayBuffer)
  const sendAudio = useCallback((audioData: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Convert to base64
      const bytes = new Uint8Array(audioData);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      wsRef.current.send(
        JSON.stringify({
          type: "audio",
          data: base64,
        })
      );
    }
  }, []);

  // Send audio already as base64
  const sendAudioBase64 = useCallback((base64Data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "audio_wav",
          data: base64Data,
        })
      );
    }
  }, []);

  return {
    visemeWeights,
    isConnected,
    sendAudio,
    sendAudioBase64,
  };
}

export default useVisemeWebSocket;
