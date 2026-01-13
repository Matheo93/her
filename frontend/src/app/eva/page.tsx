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

export default function EvaPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("Connexion...");
  const [currentText, setCurrentText] = useState("");
  const [inputText, setInputText] = useState("");
  const [mouthSize, setMouthSize] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // WebSocket connection
  useEffect(() => {
    const connect = () => {
      const backendUrl = getBackendUrl();
      const wsUrl = backendUrl.replace("https://", "wss://").replace("http://", "ws://");
      const ws = new WebSocket(`${wsUrl}/ws/her`);

      ws.onopen = () => {
        setIsConnected(true);
        setStatus("Connectee");
        ws.send(JSON.stringify({ type: "config", user_id: "eva_user", voice: "french" }));
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatus("Reconnexion...");
        setTimeout(connect, 2000);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "config_ok") {
          setStatus("Prete");
        } else if (data.type === "speaking_start") {
          setIsSpeaking(true);
        } else if (data.type === "token") {
          setCurrentText(prev => prev + data.content);
        } else if (data.type === "speech" && data.audio_base64) {
          const audioData = Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0)).buffer;
          audioQueueRef.current.push(audioData);
          playNextAudio();
        } else if (data.type === "speaking_end") {
          // handled by audio queue
        }
      };

      wsRef.current = ws;
    };
    connect();
    return () => wsRef.current?.close();
  }, []);

  // Audio playback - sequential
  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const audioData = audioQueueRef.current.shift()!;

    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;

      const buffer = await ctx.decodeAudioData(audioData.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      sourceRef.current = source;

      // Analyser for mouth
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      let rafId: number;

      const updateMouth = () => {
        analyser.getByteFrequencyData(freqData);
        const avg = freqData.reduce((a, b) => a + b, 0) / freqData.length;
        setMouthSize(avg / 80); // 0 to ~3
        rafId = requestAnimationFrame(updateMouth);
      };

      source.onended = () => {
        cancelAnimationFrame(rafId);
        setMouthSize(0);
        isPlayingRef.current = false;
        sourceRef.current = null;
        if (audioQueueRef.current.length > 0) {
          playNextAudio();
        } else {
          setIsSpeaking(false);
          setCurrentText("");
          setStatus("Prete");
        }
      };

      source.start();
      updateMouth();
    } catch (e) {
      isPlayingRef.current = false;
      playNextAudio();
    }
  }, []);

  // Voice input
  const startListening = async () => {
    if (isListening) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setIsListening(false);
        setStatus("Traitement...");
        const blob = new Blob(chunks, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const b64 = (reader.result as string).split(",")[1];
          wsRef.current?.send(JSON.stringify({ type: "audio", data: b64 }));
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsListening(true);
      setStatus("Parle...");
    } catch (e) {
      setStatus("Erreur micro");
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const sendMessage = () => {
    if (!inputText.trim() || !wsRef.current) return;
    // Stop current audio
    if (sourceRef.current) try { sourceRef.current.stop(); } catch {}
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setCurrentText("");
    setStatus("Reflexion...");
    wsRef.current.send(JSON.stringify({ type: "message", content: inputText, user_id: "eva_user" }));
    setInputText("");
  };

  const interrupt = () => {
    wsRef.current?.send(JSON.stringify({ type: "interrupt" }));
    if (sourceRef.current) try { sourceRef.current.stop(); } catch {}
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsSpeaking(false);
    setMouthSize(0);
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body { background: #000; }

        .container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, sans-serif;
          color: white;
          padding: 20px;
        }

        .status-bar {
          position: fixed;
          top: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 20px;
          background: rgba(0,0,0,0.8);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 30px;
        }

        .status-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .avatar-container {
          position: relative;
          margin-bottom: 120px;
        }

        /* HEAD MOVEMENT - on outer wrapper */
        @keyframes headMove {
          0% { transform: translate(0, 0) rotate(0deg); }
          20% { transform: translate(8px, -5px) rotate(2deg); }
          40% { transform: translate(-6px, 3px) rotate(-1.5deg); }
          60% { transform: translate(4px, 6px) rotate(1deg); }
          80% { transform: translate(-8px, -3px) rotate(-2deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }

        /* BREATHING - on inner wrapper */
        @keyframes breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }

        .avatar-wrapper {
          position: relative;
          width: 300px;
          height: 300px;
          animation: headMove 8s ease-in-out infinite;
        }

        .avatar-inner {
          width: 100%;
          height: 100%;
          animation: breathe 4s ease-in-out infinite;
        }

        .avatar-circle {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          overflow: hidden;
          border: 3px solid rgba(255,255,255,0.2);
          box-shadow: 0 0 60px rgba(255,255,255,0.1);
        }

        .avatar-circle.speaking {
          border-color: #f43f5e;
          box-shadow: 0 0 80px rgba(244,63,94,0.4);
        }

        .avatar-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        /* Mouth that actually shows */
        .mouth {
          position: absolute;
          bottom: 27%;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(to bottom, #6b3030, #3d1515);
          border-radius: 50%;
          box-shadow: inset 0 4px 10px rgba(0,0,0,0.8);
        }

        .name-label {
          position: absolute;
          bottom: -80px;
          left: 50%;
          transform: translateX(-50%);
          text-align: center;
        }

        .name-label h2 {
          font-size: 28px;
          font-weight: 300;
        }

        .name-label p {
          font-size: 14px;
          opacity: 0.6;
          margin-top: 5px;
        }

        .text-bubble {
          max-width: 500px;
          padding: 15px 25px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          margin-bottom: 30px;
          text-align: center;
        }

        .controls {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 30px;
          background: linear-gradient(transparent, black 30%);
        }

        .controls-inner {
          max-width: 500px;
          margin: 0 auto;
        }

        .input-row {
          display: flex;
          gap: 10px;
          margin-bottom: 15px;
        }

        .input-row input {
          flex: 1;
          padding: 15px 20px;
          border-radius: 30px;
          border: 1px solid rgba(255,255,255,0.2);
          background: rgba(255,255,255,0.1);
          color: white;
          font-size: 16px;
          outline: none;
        }

        .input-row button {
          padding: 15px 25px;
          border-radius: 30px;
          border: none;
          background: #f43f5e;
          color: white;
          font-size: 16px;
          cursor: pointer;
        }

        .input-row button:disabled {
          background: rgba(255,255,255,0.1);
          cursor: default;
        }

        .voice-row {
          display: flex;
          justify-content: center;
          gap: 15px;
        }

        .mic-btn {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          border: none;
          background: rgba(255,255,255,0.1);
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .mic-btn.listening {
          background: #22c55e;
          transform: scale(1.1);
        }

        .stop-btn {
          padding: 12px 24px;
          border-radius: 30px;
          border: none;
          background: #ef4444;
          color: white;
          cursor: pointer;
        }

        .listening-text {
          text-align: center;
          color: #22c55e;
          margin-top: 10px;
        }
      `}</style>

      <div className="container">
        <div className="status-bar">
          <div
            className="status-dot"
            style={{
              background: isConnected ? (isSpeaking ? "#f43f5e" : "#22c55e") : "#ef4444"
            }}
          />
          <span>{status}</span>
        </div>

        <div className="avatar-container">
          <div className="avatar-wrapper">
            <div className={`avatar-circle ${isSpeaking ? "speaking" : ""}`}>
              <img src="/avatars/eva.jpg" alt="Eva" className="avatar-img" />

              {/* Mouth - visible when speaking */}
              {isSpeaking && (
                <div
                  className="mouth"
                  style={{
                    width: `${20 + mouthSize * 15}px`,
                    height: `${6 + mouthSize * 20}px`
                  }}
                />
              )}
            </div>
          </div>

          <div className="name-label">
            <h2>Eva</h2>
            <p>{isSpeaking ? "Parle..." : isListening ? "Ecoute..." : "En ligne"}</p>
          </div>
        </div>

        {currentText && (
          <div className="text-bubble">
            <p>{currentText}</p>
          </div>
        )}

        <div className="controls">
          <div className="controls-inner">
            <div className="input-row">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder="Ecris a Eva..."
              />
              <button onClick={sendMessage} disabled={!inputText.trim() || !isConnected}>
                Envoyer
              </button>
            </div>

            <div className="voice-row">
              <button
                className={`mic-btn ${isListening ? "listening" : ""}`}
                onMouseDown={startListening}
                onMouseUp={stopListening}
                onMouseLeave={stopListening}
                onTouchStart={startListening}
                onTouchEnd={stopListening}
                disabled={!isConnected || isSpeaking}
              >
                <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>

              {isSpeaking && (
                <button className="stop-btn" onClick={interrupt}>
                  Stop
                </button>
              )}
            </div>

            {isListening && <p className="listening-text">Je t'ecoute...</p>}
          </div>
        </div>
      </div>
    </>
  );
}
