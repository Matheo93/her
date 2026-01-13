"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// WebGL Chroma Key shader for green screen removal
const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform float u_keyColor_r;
  uniform float u_keyColor_g;
  uniform float u_keyColor_b;
  uniform float u_similarity;
  uniform float u_smoothness;
  varying vec2 v_texCoord;

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);

    // Key color (green)
    vec3 keyColor = vec3(u_keyColor_r, u_keyColor_g, u_keyColor_b);

    // Calculate distance from key color in RGB space
    float diff = length(color.rgb - keyColor);

    // Create alpha based on distance from key color
    float alpha = smoothstep(u_similarity, u_similarity + u_smoothness, diff);

    // Output with calculated alpha
    gl_FragColor = vec4(color.rgb, alpha * color.a);
  }
`;

// Hook for WebGL chroma key processing
function useChromaKey(videoRef: React.RefObject<HTMLVideoElement | null>, canvasRef: React.RefObject<HTMLCanvasElement | null>, isActive: boolean) {
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const animationRef = useRef<number>(0);

  const initGL = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return false;

    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
    if (!gl) return false;
    glRef.current = gl;

    // Create shaders
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vertexShader, VERTEX_SHADER);
    gl.compileShader(vertexShader);

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fragmentShader, FRAGMENT_SHADER);
    gl.compileShader(fragmentShader);

    // Create program
    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);
    programRef.current = program;

    // Set up geometry (full screen quad)
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    const texLoc = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    // Create texture
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    textureRef.current = texture;

    // Set chroma key color (green: 0, 255, 0 normalized)
    gl.uniform1f(gl.getUniformLocation(program, 'u_keyColor_r'), 0.0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_keyColor_g'), 1.0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_keyColor_b'), 0.0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_similarity'), 0.3);
    gl.uniform1f(gl.getUniformLocation(program, 'u_smoothness'), 0.1);

    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    return true;
  }, [canvasRef, videoRef]);

  const render = useCallback(() => {
    const gl = glRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!gl || !video || !canvas || video.paused || video.ended) {
      if (isActive) {
        animationRef.current = requestAnimationFrame(render);
      }
      return;
    }

    // Update canvas size if needed
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 512;
      canvas.height = video.videoHeight || 512;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    // Clear with transparent background
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Update texture with current video frame
    gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (isActive) {
      animationRef.current = requestAnimationFrame(render);
    }
  }, [videoRef, canvasRef, isActive]);

  useEffect(() => {
    if (isActive) {
      const initialized = initGL();
      if (initialized) {
        animationRef.current = requestAnimationFrame(render);
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, initGL, render]);
}

interface Timings {
  tts?: number;
  avatar?: number;
  total?: number;
  stt?: number;
  llm?: number;
  lipsync?: number;
}

export default function AvatarGPUPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");
  const [timings, setTimings] = useState<Timings>({});
  const [error, setError] = useState<string | null>(null);
  const [useLipsync, setUseLipsync] = useState(true);

  const audioRef = useRef<HTMLAudioElement>(null);
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const speakingVideoRef = useRef<HTMLVideoElement>(null);
  const idleCanvasRef = useRef<HTMLCanvasElement>(null);
  const speakingCanvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Chroma key processing for both videos
  useChromaKey(idleVideoRef, idleCanvasRef, !isSpeaking);
  useChromaKey(speakingVideoRef, speakingCanvasRef, isSpeaking);

  // Transparent idle video (WebM with alpha channel)
  const idleVideos = [
    "/avatars/eva_idle_transparent.webm",
  ];
  const [currentIdleIndex, setCurrentIdleIndex] = useState(0);
  const [speakingVideoSrc, setSpeakingVideoSrc] = useState<string | null>(null);

  // Change idle video randomly when loop ends
  const handleIdleVideoEnd = () => {
    if (!isSpeaking) {
      const newIndex = Math.floor(Math.random() * idleVideos.length);
      setCurrentIdleIndex(newIndex);
    }
  };

  // When speaking video ends, return to idle
  const handleSpeakingVideoEnd = () => {
    setIsSpeaking(false);
    setSpeakingVideoSrc(null);
    // Resume idle video
    if (idleVideoRef.current) {
      idleVideoRef.current.play();
    }
  };

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        await processAudio(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      setError("Microphone access denied");
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Process audio through the pipeline with lip-sync
  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setTranscript("");
    setResponse("");
    setTimings({});

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");

      // Use lip-sync endpoint if enabled, otherwise regular voice endpoint
      const endpoint = useLipsync ? "/voice/lipsync" : "/voice";
      const voiceResponse = await fetch(`${BACKEND_URL}${endpoint}?voice=eva`, {
        method: "POST",
        body: formData,
      });

      if (!voiceResponse.ok) throw new Error("Voice processing failed");

      const data = await voiceResponse.json();

      setTranscript(data.user_text);
      setResponse(data.eva_response);
      setTimings({
        stt: data.latency?.stt_ms,
        llm: data.latency?.llm_ms,
        tts: data.latency?.tts_ms,
        lipsync: data.latency?.lipsync_ms,
        total: data.latency?.total_ms,
      });

      // Play lip-sync video if available
      if (data.video_base64 && speakingVideoRef.current) {
        const videoSrc = `data:video/mp4;base64,${data.video_base64}`;
        setSpeakingVideoSrc(videoSrc);
        setIsSpeaking(true);

        // Pause idle video
        if (idleVideoRef.current) {
          idleVideoRef.current.pause();
        }

        // Play speaking video
        speakingVideoRef.current.src = videoSrc;
        speakingVideoRef.current.play();
      }
      // Fallback: play audio only (no lip-sync video)
      else if (data.audio_base64 && audioRef.current) {
        const audioSrc = `data:audio/mp3;base64,${data.audio_base64}`;
        audioRef.current.src = audioSrc;
        setIsSpeaking(true);
        audioRef.current.play();
        audioRef.current.onended = () => setIsSpeaking(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setIsProcessing(false);
    }
  };

  // Send text directly with lip-sync
  const sendText = async (text: string) => {
    if (!text.trim()) return;

    setIsProcessing(true);
    setTranscript(text);
    setTimings({});

    try {
      // Use TTS + lip-sync endpoint
      const endpoint = useLipsync ? "/tts/lipsync" : "/tts";

      if (useLipsync) {
        const response = await fetch(`${BACKEND_URL}/tts/lipsync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "eva" }),
        });

        const data = await response.json();

        // Also get LLM response
        const chatResponse = await fetch(`${BACKEND_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        const chatData = await chatResponse.json();
        setResponse(chatData.response);

        // Now generate lip-sync for the response
        const llmLipsyncResponse = await fetch(`${BACKEND_URL}/tts/lipsync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chatData.response, voice: "eva" }),
        });
        const llmLipsyncData = await llmLipsyncResponse.json();

        setTimings({
          llm: chatData.latency_ms,
          tts: llmLipsyncData.latency?.tts_ms,
          lipsync: llmLipsyncData.latency?.lipsync_ms,
          total: llmLipsyncData.latency?.total_ms,
        });

        // Play lip-sync video
        if (llmLipsyncData.video_base64 && speakingVideoRef.current) {
          const videoSrc = `data:video/mp4;base64,${llmLipsyncData.video_base64}`;
          setSpeakingVideoSrc(videoSrc);
          setIsSpeaking(true);

          if (idleVideoRef.current) {
            idleVideoRef.current.pause();
          }

          speakingVideoRef.current.src = videoSrc;
          speakingVideoRef.current.play();
        } else if (llmLipsyncData.audio_base64 && audioRef.current) {
          const audioSrc = `data:audio/mp3;base64,${llmLipsyncData.audio_base64}`;
          audioRef.current.src = audioSrc;
          setIsSpeaking(true);
          audioRef.current.play();
          audioRef.current.onended = () => setIsSpeaking(false);
        }
      } else {
        // Fallback without lip-sync
        const chatResponse = await fetch(`${BACKEND_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, voice: "eva" }),
        });

        const chatData = await chatResponse.json();
        setResponse(chatData.text || chatData.response);
        setTimings({ llm: chatData.latency_ms, tts: chatData.tts_ms });

        if (chatData.audio_base64 && audioRef.current) {
          const audioSrc = `data:audio/mp3;base64,${chatData.audio_base64}`;
          audioRef.current.src = audioSrc;
          setIsSpeaking(true);
          audioRef.current.play();
          audioRef.current.onended = () => setIsSpeaking(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Styles for animations */}
      <style jsx>{`
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 30px rgba(147, 51, 234, 0.3); }
          50% { box-shadow: 0 0 50px rgba(147, 51, 234, 0.5); }
        }
        @keyframes speaking-glow {
          0%, 100% { box-shadow: 0 0 30px rgba(236, 72, 153, 0.4); }
          50% { box-shadow: 0 0 60px rgba(236, 72, 153, 0.7); }
        }
        .avatar-container {
          animation: glow 3s ease-in-out infinite;
        }
        .avatar-container.speaking {
          animation: speaking-glow 1s ease-in-out infinite;
        }
      `}</style>

      <audio ref={audioRef} hidden />

      {/* Header */}
      <header className="p-4 border-b border-purple-800/30 backdrop-blur-sm bg-slate-950/50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isSpeaking ? 'bg-pink-500 animate-pulse' : 'bg-green-500'}`} />
            <h1 className="text-xl font-light tracking-wide">EVA</h1>
            <span className="text-xs bg-purple-600/80 px-2 py-1 rounded-full">RTX 4090</span>
            {useLipsync && <span className="text-xs bg-pink-600/80 px-2 py-1 rounded-full">Lip-Sync</span>}
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={useLipsync}
                onChange={(e) => setUseLipsync(e.target.checked)}
                className="w-4 h-4 accent-pink-500"
              />
              <span className="text-slate-400">Lip-Sync</span>
            </label>
            <a href="/" className="text-purple-400 hover:text-purple-300 text-sm">
              Retour
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {/* Avatar Display */}
        <div className="flex flex-col items-center mb-8">
          <div className={`avatar-container ${isSpeaking ? 'speaking' : ''} relative w-72 h-72 rounded-full overflow-hidden bg-gradient-to-br from-purple-900/50 to-pink-900/50 border-2 ${isSpeaking ? 'border-pink-500/50' : 'border-purple-500/30'}`}>
            {/* Background glow effect */}
            <div className="absolute inset-0 bg-gradient-to-t from-purple-600/20 to-transparent" />

            {/* Hidden video sources for chroma key processing */}
            <video
              ref={idleVideoRef}
              autoPlay
              muted
              playsInline
              loop={true}
              crossOrigin="anonymous"
              className="hidden"
              src={idleVideos[currentIdleIndex]}
            />
            <video
              ref={speakingVideoRef}
              muted={false}
              playsInline
              crossOrigin="anonymous"
              onEnded={handleSpeakingVideoEnd}
              className="hidden"
            />

            {/* Chroma-keyed canvas for idle (transparent background) */}
            <canvas
              ref={idleCanvasRef}
              className={`absolute inset-0 w-full h-full object-cover object-top scale-110 transition-opacity duration-300 ${isSpeaking ? 'opacity-0' : 'opacity-100'}`}
            />

            {/* Chroma-keyed canvas for speaking (transparent background) */}
            <canvas
              ref={speakingCanvasRef}
              className={`absolute inset-0 w-full h-full object-cover object-top scale-110 transition-opacity duration-300 ${isSpeaking ? 'opacity-100' : 'opacity-0'}`}
            />
          </div>

          {/* Status */}
          <div className="mt-4 text-center">
            {isProcessing && (
              <p className="text-purple-400 animate-pulse">Je reflechis...</p>
            )}
            {isSpeaking && !isProcessing && (
              <p className="text-pink-400 animate-pulse">Je parle...</p>
            )}
            {error && <p className="text-red-400">{error}</p>}
            {!isProcessing && !isSpeaking && !error && (
              <p className="text-slate-500 text-sm">En attente...</p>
            )}
          </div>
        </div>

        {/* Timings Dashboard */}
        <div className="grid grid-cols-5 gap-3 mb-8">
          {[
            { label: "STT", value: timings.stt, target: 100, icon: "\u{1F3A4}" },
            { label: "LLM", value: timings.llm, target: 500, icon: "\u{1F9E0}" },
            { label: "TTS", value: timings.tts, target: 100, icon: "\u{1F50A}" },
            { label: "Lip", value: timings.lipsync, target: 2000, icon: "\u{1F444}" },
            { label: "Total", value: timings.total, target: 3000, icon: "\u{26A1}" },
          ].map((item) => (
            <div
              key={item.label}
              className={`p-3 rounded-xl text-center transition-all ${
                item.value
                  ? item.value <= item.target
                    ? "bg-green-900/30 border border-green-500/50"
                    : item.value <= item.target * 1.5
                    ? "bg-yellow-900/30 border border-yellow-500/50"
                    : "bg-red-900/30 border border-red-500/50"
                  : "bg-slate-800/50 border border-slate-700/50"
              }`}
            >
              <div className="text-lg mb-1">{item.icon}</div>
              <div className="text-xs text-slate-400 mb-1">{item.label}</div>
              <div className="text-lg font-mono font-bold">
                {item.value ? `${item.value}` : "-"}
              </div>
              <div className="text-xs text-slate-500">ms</div>
            </div>
          ))}
        </div>

        {/* Conversation */}
        {(transcript || response) && (
          <div className="space-y-4 mb-8">
            {transcript && (
              <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <div className="text-xs text-slate-500 mb-1">Toi:</div>
                <p className="text-slate-200">{transcript}</p>
              </div>
            )}
            {response && (
              <div className="p-4 rounded-xl bg-purple-900/30 border border-purple-500/30">
                <div className="text-xs text-purple-400 mb-1">Eva:</div>
                <p className="text-slate-200">{response}</p>
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col items-center gap-4">
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={isProcessing || isSpeaking}
            className={`p-6 rounded-full transition-all transform ${
              isRecording
                ? "bg-red-500 scale-110 shadow-lg shadow-red-500/50"
                : "bg-purple-600 hover:bg-purple-500 hover:scale-105"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </button>
          <p className="text-slate-500 text-sm">
            {isRecording ? "\u{1F534} Enregistrement..." : "Maintiens pour parler"}
          </p>
        </div>

        {/* Text input */}
        <div className="mt-6">
          <input
            type="text"
            placeholder="Ou ecris-moi..."
            className="w-full p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-slate-200 placeholder-slate-500"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isProcessing && !isSpeaking) {
                sendText((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = "";
              }
            }}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 p-3 bg-slate-950/80 backdrop-blur-sm border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto flex justify-center gap-4 text-xs text-slate-500">
          <span>Whisper large-v3</span>
          <span>*</span>
          <span>Groq LLM</span>
          <span>*</span>
          <span>Edge-TTS</span>
          <span>*</span>
          <span>MuseTalk</span>
          <span>*</span>
          <span>RTX 4090</span>
        </div>
      </footer>
    </div>
  );
}
