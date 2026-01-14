"use client";

import { useState, useRef, useEffect } from "react";

const DITTO_API = "http://localhost:8005";
const EVA_IMAGE = "/avatars/eva.png";

export default function EvaDittoPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [isPrepared, setIsPrepared] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    prepareSource();
  }, []);

  const prepareSource = async () => {
    try {
      setStatus("Preparing Eva source image...");

      // Fetch Eva image
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
        await generateVideo(audioBlob);
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

  const generateVideo = async (audioBlob: Blob) => {
    setIsLoading(true);
    setError(null);
    setVideoUrl(null);

    try {
      setStatus("Generating lip-synced video with Ditto...");

      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.wav");

      const response = await fetch(`${DITTO_API}/generate`, {
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

      // Auto-play
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
      await generateVideo(file);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Eva - Ditto Talking Head
        </h1>
        <p className="text-center text-gray-400 mb-8">
          Real-time audio-driven lip-sync using Ditto by Ant Group
        </p>

        {/* Status */}
        <div className="text-center mb-6">
          <span className={`px-4 py-2 rounded-full text-sm ${
            isPrepared ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
          }`}>
            {status}
          </span>
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-400 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

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
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
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
                <p className="text-gray-500">Record or upload audio to generate</p>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {/* Record button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!isPrepared || isLoading}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              isRecording
                ? "bg-red-500 hover:bg-red-600 animate-pulse"
                : isPrepared && !isLoading
                ? "bg-purple-500 hover:bg-purple-600"
                : "bg-gray-600 cursor-not-allowed"
            }`}
          >
            {isRecording ? "Stop Recording" : "Record Audio"}
          </button>

          {/* Upload audio */}
          <label className={`px-6 py-3 rounded-lg font-medium cursor-pointer transition-all ${
            isPrepared && !isLoading
              ? "bg-blue-500 hover:bg-blue-600"
              : "bg-gray-600 cursor-not-allowed"
          }`}>
            Upload Audio
            <input
              type="file"
              accept="audio/*"
              onChange={handleAudioUpload}
              disabled={!isPrepared || isLoading}
              className="hidden"
            />
          </label>

          {/* Download button */}
          {videoUrl && (
            <a
              href={videoUrl}
              download="eva-ditto.mp4"
              className="px-6 py-3 bg-green-500 hover:bg-green-600 rounded-lg font-medium transition-all"
            >
              Download Video
            </a>
          )}
        </div>

        {/* Info */}
        <div className="mt-12 bg-gray-800/30 rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold mb-3">About Ditto</h3>
          <p className="text-gray-400 text-sm">
            Ditto is a motion-space diffusion model for controllable realtime talking head synthesis
            developed by Ant Group. It generates natural lip movements and facial expressions
            synchronized with audio input.
          </p>
          <div className="mt-4 flex gap-4 text-sm">
            <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full">
              PyTorch
            </span>
            <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full">
              Diffusion Model
            </span>
            <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full">
              25 FPS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
