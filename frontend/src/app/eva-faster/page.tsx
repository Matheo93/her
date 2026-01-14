"use client";

import { useState, useRef, useEffect } from "react";

const FLP_API = "http://localhost:8006";
const EVA_IMAGE = "/avatars/eva.png";

export default function EvaFasterPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [isPrepared, setIsPrepared] = useState(false);
  const [joyvaaReady, setJoyvasaReady] = useState(false);
  const [mode, setMode] = useState<"audio" | "video">("audio");

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    checkHealth();
    prepareSource();
  }, []);

  const checkHealth = async () => {
    try {
      const response = await fetch(`${FLP_API}/health`);
      const data = await response.json();
      setJoyvasaReady(data.joyvasa_ready);
    } catch {
      setError("Service not available");
    }
  };

  const prepareSource = async () => {
    try {
      setStatus("Preparing Eva source image...");

      // Fetch Eva image
      const response = await fetch(EVA_IMAGE);
      const blob = await response.blob();

      const formData = new FormData();
      formData.append("source_image", blob, "eva.png");

      const result = await fetch(`${FLP_API}/prepare_source`, {
        method: "POST",
        body: formData,
      });

      if (result.ok) {
        setIsPrepared(true);
        setStatus("Ready - Eva source prepared");
      } else {
        const data = await result.json();
        setError(data.error || "Failed to prepare source");
        setStatus("Error preparing source");
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Connection error: ${errorMessage}`);
      setStatus("Service not available");
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        await generateFromAudio(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatus("Recording...");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Microphone error: ${errorMessage}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatus("Processing audio...");
    }
  };

  const generateFromAudio = async (audioBlob: Blob) => {
    if (!joyvaaReady) {
      setError("JoyVASA models not available. Please download JoyVASA models first.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setVideoUrl(null);

    try {
      setStatus("Generating animation with JoyVASA + LivePortrait...");

      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.wav");

      const response = await fetch(`${FLP_API}/animate_with_audio`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Generation failed");
      }

      const videoBlob = await response.blob();
      const url = URL.createObjectURL(videoBlob);
      setVideoUrl(url);
      setStatus("Video generated!");

      if (videoRef.current) {
        videoRef.current.src = url;
        videoRef.current.play();
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Generation error: ${errorMessage}`);
      setStatus("Generation failed");
    } finally {
      setIsLoading(false);
    }
  };

  const generateFromVideo = async (videoBlob: Blob) => {
    setIsLoading(true);
    setError(null);
    setVideoUrl(null);

    try {
      setStatus("Generating animation from driving video...");

      const formData = new FormData();
      formData.append("driving_video", videoBlob, "driving.mp4");

      const response = await fetch(`${FLP_API}/animate_with_video`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Generation failed");
      }

      const resultBlob = await response.blob();
      const url = URL.createObjectURL(resultBlob);
      setVideoUrl(url);
      setStatus("Video generated!");

      if (videoRef.current) {
        videoRef.current.src = url;
        videoRef.current.play();
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Generation error: ${errorMessage}`);
      setStatus("Generation failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await generateFromAudio(file);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await generateFromVideo(file);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
          Eva - FasterLivePortrait
        </h1>
        <p className="text-center text-gray-400 mb-8">
          High-performance portrait animation with TensorRT optimization
        </p>

        {/* Status */}
        <div className="text-center mb-6 flex justify-center gap-3">
          <span className={`px-4 py-2 rounded-full text-sm ${
            isPrepared ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
          }`}>
            {status}
          </span>
          <span className={`px-4 py-2 rounded-full text-sm ${
            joyvaaReady ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
          }`}>
            {joyvaaReady ? "JoyVASA Ready" : "JoyVASA Not Available"}
          </span>
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-400 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Mode selector */}
        <div className="flex justify-center gap-4 mb-8">
          <button
            onClick={() => setMode("audio")}
            className={`px-6 py-2 rounded-lg transition-all ${
              mode === "audio"
                ? "bg-blue-500 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Audio Mode
          </button>
          <button
            onClick={() => setMode("video")}
            className={`px-6 py-2 rounded-lg transition-all ${
              mode === "video"
                ? "bg-blue-500 text-white"
                : "bg-gray-700 text-gray-300 hover:bg-gray-600"
            }`}
          >
            Video Mode
          </button>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Source image */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Source Image</h2>
            <div className="aspect-square bg-gray-900 rounded-lg overflow-hidden">
              <img
                src={EVA_IMAGE}
                alt="Eva"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Output video */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Generated Video</h2>
            <div className="aspect-square bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center">
              {isLoading ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-gray-400">Generating video...</p>
                </div>
              ) : videoUrl ? (
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  controls
                  loop
                />
              ) : (
                <p className="text-gray-500">
                  {mode === "audio"
                    ? "Record or upload audio to generate"
                    : "Upload driving video to generate"
                  }
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {mode === "audio" ? (
            <>
              {/* Record button */}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!isPrepared || isLoading || !joyvaaReady}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-600 animate-pulse"
                    : isPrepared && !isLoading && joyvaaReady
                    ? "bg-blue-500 hover:bg-blue-600"
                    : "bg-gray-600 cursor-not-allowed"
                }`}
              >
                {isRecording ? "Stop Recording" : "Record Audio"}
              </button>

              {/* Upload audio */}
              <label className={`px-6 py-3 rounded-lg font-medium cursor-pointer transition-all ${
                isPrepared && !isLoading && joyvaaReady
                  ? "bg-cyan-500 hover:bg-cyan-600"
                  : "bg-gray-600 cursor-not-allowed"
              }`}>
                Upload Audio
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  disabled={!isPrepared || isLoading || !joyvaaReady}
                  className="hidden"
                />
              </label>
            </>
          ) : (
            /* Upload video */
            <label className={`px-6 py-3 rounded-lg font-medium cursor-pointer transition-all ${
              isPrepared && !isLoading
                ? "bg-blue-500 hover:bg-blue-600"
                : "bg-gray-600 cursor-not-allowed"
            }`}>
              Upload Driving Video
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoUpload}
                disabled={!isPrepared || isLoading}
                className="hidden"
              />
            </label>
          )}

          {/* Download button */}
          {videoUrl && (
            <a
              href={videoUrl}
              download="eva-faster.mp4"
              className="px-6 py-3 bg-green-500 hover:bg-green-600 rounded-lg font-medium transition-all"
            >
              Download Video
            </a>
          )}
        </div>

        {/* Info */}
        <div className="mt-12 bg-gray-800/30 rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-3">About FasterLivePortrait</h3>
          <p className="text-gray-400 text-sm mb-4">
            FasterLivePortrait is a TensorRT-optimized version of LivePortrait that achieves
            30+ FPS real-time portrait animation. Combined with JoyVASA, it can generate
            natural expressions and lip movements from audio input.
          </p>
          <div className="flex gap-4 text-sm">
            <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full">
              ONNX Runtime
            </span>
            <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full">
              JoyVASA
            </span>
            <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full">
              30+ FPS
            </span>
          </div>
        </div>

        {/* JoyVASA not ready warning */}
        {!joyvaaReady && (
          <div className="mt-6 bg-yellow-500/20 border border-yellow-500 text-yellow-400 p-4 rounded-lg">
            <h4 className="font-semibold mb-2">JoyVASA Models Not Available</h4>
            <p className="text-sm">
              Audio mode requires JoyVASA models. To enable:
            </p>
            <code className="block mt-2 bg-gray-900 p-2 rounded text-xs">
              cd /workspace/FasterLivePortrait && huggingface-cli download jdh-algo/JoyVASA --local-dir checkpoints/JoyVASA
            </code>
            <p className="text-sm mt-2">
              Video mode (using a driving video with expressions) works without JoyVASA.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
