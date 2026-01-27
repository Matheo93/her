"use client"

/**
 * Media Player Components - Sprint 814
 *
 * Audio and video player components with controls.
 *
 * Features:
 * - Audio player with waveform
 * - Video player with overlay controls
 * - Playlist support
 * - Progress and seek controls
 * - Volume controls
 * - Playback speed controls
 */

import React, {
  memo,
  useState,
  useRef,
  useEffect,
  useCallback,
  createContext,
  useContext,
} from "react"
import { motion, AnimatePresence } from "framer-motion"

// ============================================================================
// Types
// ============================================================================

interface Track {
  id: string
  title: string
  artist?: string
  src: string
  duration?: number
  cover?: string
}

interface PlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  playbackRate: number
  buffered: number
}

interface AudioPlayerProps {
  src: string
  title?: string
  artist?: string
  cover?: string
  autoPlay?: boolean
  onTimeUpdate?: (time: number) => void
  onEnded?: () => void
  className?: string
}

interface VideoPlayerProps {
  src: string
  poster?: string
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  width?: number | string
  height?: number | string
  onTimeUpdate?: (time: number) => void
  onEnded?: () => void
  className?: string
}

interface PlaylistPlayerProps {
  tracks: Track[]
  initialTrack?: number
  shuffle?: boolean
  repeat?: "none" | "one" | "all"
  onTrackChange?: (index: number, track: Track) => void
  className?: string
}

// ============================================================================
// Utilities
// ============================================================================

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

// ============================================================================
// Icons
// ============================================================================

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
)

const VolumeIcon = ({ muted, level }: { muted: boolean; level: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
    {muted || level === 0 ? (
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    ) : level < 0.5 ? (
      <path d="M7 9v6h4l5 5V4l-5 5H7z" />
    ) : (
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    )}
  </svg>
)

const SkipPrevIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
  </svg>
)

const SkipNextIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
  </svg>
)

const ShuffleIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    width="20"
    height="20"
    style={{ opacity: active ? 1 : 0.5 }}
  >
    <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
  </svg>
)

const RepeatIcon = ({
  mode,
}: {
  mode: "none" | "one" | "all"
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    width="20"
    height="20"
    style={{ opacity: mode === "none" ? 0.5 : 1 }}
  >
    {mode === "one" ? (
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z" />
    ) : (
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
    )}
  </svg>
)

const FullscreenIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
  </svg>
)

// ============================================================================
// Progress Bar
// ============================================================================

interface ProgressBarProps {
  value: number
  max: number
  buffered?: number
  onChange?: (value: number) => void
  className?: string
}

const ProgressBar = memo(function ProgressBar({
  value,
  max,
  buffered = 0,
  onChange,
  className = "",
}: ProgressBarProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!barRef.current || !onChange) return
      const rect = barRef.current.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      onChange(ratio * max)
    },
    [max, onChange]
  )

  const progress = max > 0 ? (value / max) * 100 : 0
  const bufferedProgress = max > 0 ? (buffered / max) * 100 : 0

  return (
    <div
      ref={barRef}
      className={`relative h-1 bg-gray-700 rounded cursor-pointer group ${className}`}
      onClick={handleClick}
    >
      {/* Buffered */}
      <div
        className="absolute h-full bg-gray-500 rounded"
        style={{ width: `${bufferedProgress}%` }}
      />
      {/* Progress */}
      <div
        className="absolute h-full bg-white rounded transition-all"
        style={{ width: `${progress}%` }}
      />
      {/* Thumb */}
      <div
        className="absolute w-3 h-3 bg-white rounded-full -top-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ left: `calc(${progress}% - 6px)` }}
      />
    </div>
  )
})

// ============================================================================
// Volume Slider
// ============================================================================

interface VolumeSliderProps {
  volume: number
  muted: boolean
  onVolumeChange: (volume: number) => void
  onMuteToggle: () => void
}

const VolumeSlider = memo(function VolumeSlider({
  volume,
  muted,
  onVolumeChange,
  onMuteToggle,
}: VolumeSliderProps) {
  return (
    <div className="flex items-center gap-2 group">
      <button
        onClick={onMuteToggle}
        className="p-1 hover:bg-white/10 rounded"
      >
        <VolumeIcon muted={muted} level={volume} />
      </button>
      <div className="w-0 group-hover:w-20 overflow-hidden transition-all">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="w-full h-1 appearance-none bg-gray-700 rounded cursor-pointer"
        />
      </div>
    </div>
  )
})

// ============================================================================
// Playback Speed
// ============================================================================

interface PlaybackSpeedProps {
  rate: number
  onChange: (rate: number) => void
}

const PlaybackSpeed = memo(function PlaybackSpeed({
  rate,
  onChange,
}: PlaybackSpeedProps) {
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2]

  return (
    <select
      value={rate}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="bg-transparent text-sm border border-gray-600 rounded px-2 py-1 cursor-pointer"
    >
      {speeds.map((s) => (
        <option key={s} value={s}>
          {s}x
        </option>
      ))}
    </select>
  )
})

// ============================================================================
// Audio Player
// ============================================================================

export const AudioPlayer = memo(function AudioPlayer({
  src,
  title,
  artist,
  cover,
  autoPlay = false,
  onTimeUpdate,
  onEnded,
  className = "",
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
    playbackRate: 1,
    buffered: 0,
  })

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setState((s) => ({ ...s, currentTime: audio.currentTime }))
      onTimeUpdate?.(audio.currentTime)
    }

    const handleLoadedMetadata = () => {
      setState((s) => ({ ...s, duration: audio.duration }))
    }

    const handleProgress = () => {
      if (audio.buffered.length > 0) {
        setState((s) => ({
          ...s,
          buffered: audio.buffered.end(audio.buffered.length - 1),
        }))
      }
    }

    const handleEnded = () => {
      setState((s) => ({ ...s, isPlaying: false }))
      onEnded?.()
    }

    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("loadedmetadata", handleLoadedMetadata)
    audio.addEventListener("progress", handleProgress)
    audio.addEventListener("ended", handleEnded)

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
      audio.removeEventListener("progress", handleProgress)
      audio.removeEventListener("ended", handleEnded)
    }
  }, [onTimeUpdate, onEnded])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (state.isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setState((s) => ({ ...s, isPlaying: !s.isPlaying }))
  }, [state.isPlaying])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = time
    setState((s) => ({ ...s, currentTime: time }))
  }, [])

  const setVolume = useCallback((volume: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    setState((s) => ({ ...s, volume, muted: false }))
  }, [])

  const toggleMute = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = !state.muted
    setState((s) => ({ ...s, muted: !s.muted }))
  }, [state.muted])

  const setPlaybackRate = useCallback((rate: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.playbackRate = rate
    setState((s) => ({ ...s, playbackRate: rate }))
  }, [])

  return (
    <div
      className={`bg-gray-900 rounded-lg p-4 text-white ${className}`}
    >
      <audio ref={audioRef} src={src} autoPlay={autoPlay} />

      {/* Track Info */}
      <div className="flex items-center gap-4 mb-4">
        {cover && (
          <img
            src={cover}
            alt={title || "Cover"}
            className="w-16 h-16 rounded object-cover"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{title || "Unknown Track"}</h3>
          {artist && <p className="text-gray-400 text-sm truncate">{artist}</p>}
        </div>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <ProgressBar
          value={state.currentTime}
          max={state.duration}
          buffered={state.buffered}
          onChange={seek}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{formatTime(state.currentTime)}</span>
          <span>{formatTime(state.duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <VolumeSlider
          volume={state.volume}
          muted={state.muted}
          onVolumeChange={setVolume}
          onMuteToggle={toggleMute}
        />

        <button
          onClick={togglePlay}
          className="w-12 h-12 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform"
        >
          {state.isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <PlaybackSpeed rate={state.playbackRate} onChange={setPlaybackRate} />
      </div>
    </div>
  )
})

// ============================================================================
// Video Player
// ============================================================================

export const VideoPlayer = memo(function VideoPlayer({
  src,
  poster,
  autoPlay = false,
  muted = false,
  loop = false,
  width = "100%",
  height = "auto",
  onTimeUpdate,
  onEnded,
  className = "",
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: muted,
    playbackRate: 1,
    buffered: 0,
  })
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const hideTimeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      setState((s) => ({ ...s, currentTime: video.currentTime }))
      onTimeUpdate?.(video.currentTime)
    }

    const handleLoadedMetadata = () => {
      setState((s) => ({ ...s, duration: video.duration }))
    }

    const handleProgress = () => {
      if (video.buffered.length > 0) {
        setState((s) => ({
          ...s,
          buffered: video.buffered.end(video.buffered.length - 1),
        }))
      }
    }

    const handleEnded = () => {
      setState((s) => ({ ...s, isPlaying: false }))
      onEnded?.()
    }

    const handlePlay = () => setState((s) => ({ ...s, isPlaying: true }))
    const handlePause = () => setState((s) => ({ ...s, isPlaying: false }))

    video.addEventListener("timeupdate", handleTimeUpdate)
    video.addEventListener("loadedmetadata", handleLoadedMetadata)
    video.addEventListener("progress", handleProgress)
    video.addEventListener("ended", handleEnded)
    video.addEventListener("play", handlePlay)
    video.addEventListener("pause", handlePause)

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate)
      video.removeEventListener("loadedmetadata", handleLoadedMetadata)
      video.removeEventListener("progress", handleProgress)
      video.removeEventListener("ended", handleEnded)
      video.removeEventListener("play", handlePlay)
      video.removeEventListener("pause", handlePause)
    }
  }, [onTimeUpdate, onEnded])

  const handleMouseMove = useCallback(() => {
    setShowControls(true)
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
    }
    if (state.isPlaying) {
      hideTimeoutRef.current = setTimeout(() => {
        setShowControls(false)
      }, 3000)
    }
  }, [state.isPlaying])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      video.play()
    } else {
      video.pause()
    }
  }, [])

  const seek = useCallback((time: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = time
  }, [])

  const setVolume = useCallback((volume: number) => {
    const video = videoRef.current
    if (!video) return
    video.volume = volume
    video.muted = false
    setState((s) => ({ ...s, volume, muted: false }))
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setState((s) => ({ ...s, muted: video.muted }))
  }, [])

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    if (!document.fullscreenElement) {
      container.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`relative bg-black rounded-lg overflow-hidden ${className}`}
      style={{ width, height }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => state.isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        muted={state.muted}
        loop={loop}
        onClick={togglePlay}
        className="w-full h-full object-contain"
      />

      {/* Play/Pause Overlay */}
      <AnimatePresence>
        {!state.isPlaying && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black/30"
            onClick={togglePlay}
          >
            <button className="w-16 h-16 flex items-center justify-center bg-white/20 backdrop-blur rounded-full hover:bg-white/30 transition-colors">
              <PlayIcon />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white"
          >
            {/* Progress */}
            <ProgressBar
              value={state.currentTime}
              max={state.duration}
              buffered={state.buffered}
              onChange={seek}
              className="mb-2"
            />

            {/* Control Bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button onClick={togglePlay} className="hover:scale-110 transition-transform">
                  {state.isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>

                <VolumeSlider
                  volume={state.volume}
                  muted={state.muted}
                  onVolumeChange={setVolume}
                  onMuteToggle={toggleMute}
                />

                <span className="text-sm">
                  {formatTime(state.currentTime)} / {formatTime(state.duration)}
                </span>
              </div>

              <button onClick={toggleFullscreen} className="hover:scale-110 transition-transform">
                <FullscreenIcon />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

// ============================================================================
// Playlist Player
// ============================================================================

export const PlaylistPlayer = memo(function PlaylistPlayer({
  tracks,
  initialTrack = 0,
  shuffle = false,
  repeat = "none",
  onTrackChange,
  className = "",
}: PlaylistPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentIndex, setCurrentIndex] = useState(initialTrack)
  const [shuffleEnabled, setShuffleEnabled] = useState(shuffle)
  const [repeatMode, setRepeatMode] = useState(repeat)
  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
    playbackRate: 1,
    buffered: 0,
  })

  const currentTrack = tracks[currentIndex]

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setState((s) => ({ ...s, currentTime: audio.currentTime }))
    }

    const handleLoadedMetadata = () => {
      setState((s) => ({ ...s, duration: audio.duration }))
    }

    const handleEnded = () => {
      handleNext()
    }

    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("loadedmetadata", handleLoadedMetadata)
    audio.addEventListener("ended", handleEnded)

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
      audio.removeEventListener("ended", handleEnded)
    }
  }, [currentIndex, repeatMode, shuffleEnabled])

  useEffect(() => {
    if (state.isPlaying) {
      audioRef.current?.play()
    }
  }, [currentIndex])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (state.isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setState((s) => ({ ...s, isPlaying: !s.isPlaying }))
  }, [state.isPlaying])

  const handlePrev = useCallback(() => {
    setCurrentIndex((i) => {
      const newIndex = i > 0 ? i - 1 : tracks.length - 1
      onTrackChange?.(newIndex, tracks[newIndex])
      return newIndex
    })
  }, [tracks, onTrackChange])

  const handleNext = useCallback(() => {
    setCurrentIndex((i) => {
      let newIndex: number

      if (repeatMode === "one") {
        audioRef.current!.currentTime = 0
        audioRef.current!.play()
        return i
      }

      if (shuffleEnabled) {
        newIndex = Math.floor(Math.random() * tracks.length)
      } else {
        newIndex = i < tracks.length - 1 ? i + 1 : 0
      }

      if (newIndex === 0 && repeatMode === "none" && !shuffleEnabled) {
        setState((s) => ({ ...s, isPlaying: false }))
        return i
      }

      onTrackChange?.(newIndex, tracks[newIndex])
      return newIndex
    })
  }, [tracks, shuffleEnabled, repeatMode, onTrackChange])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = time
    setState((s) => ({ ...s, currentTime: time }))
  }, [])

  const setVolume = useCallback((volume: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    setState((s) => ({ ...s, volume, muted: false }))
  }, [])

  const toggleMute = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = !state.muted
    setState((s) => ({ ...s, muted: !s.muted }))
  }, [state.muted])

  const toggleShuffle = useCallback(() => {
    setShuffleEnabled((s) => !s)
  }, [])

  const toggleRepeat = useCallback(() => {
    setRepeatMode((m) => {
      if (m === "none") return "all"
      if (m === "all") return "one"
      return "none"
    })
  }, [])

  const selectTrack = useCallback(
    (index: number) => {
      setCurrentIndex(index)
      onTrackChange?.(index, tracks[index])
      setState((s) => ({ ...s, isPlaying: true }))
      setTimeout(() => audioRef.current?.play(), 0)
    },
    [tracks, onTrackChange]
  )

  return (
    <div className={`bg-gray-900 rounded-lg text-white ${className}`}>
      <audio ref={audioRef} src={currentTrack?.src} />

      {/* Current Track */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center gap-4 mb-4">
          {currentTrack?.cover && (
            <img
              src={currentTrack.cover}
              alt={currentTrack.title}
              className="w-20 h-20 rounded object-cover"
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">
              {currentTrack?.title || "No track selected"}
            </h3>
            {currentTrack?.artist && (
              <p className="text-gray-400 text-sm truncate">{currentTrack.artist}</p>
            )}
          </div>
        </div>

        {/* Progress */}
        <ProgressBar
          value={state.currentTime}
          max={state.duration}
          onChange={seek}
          className="mb-2"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>{formatTime(state.currentTime)}</span>
          <span>{formatTime(state.duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <button onClick={toggleShuffle} className="p-2 hover:bg-white/10 rounded">
          <ShuffleIcon active={shuffleEnabled} />
        </button>

        <div className="flex items-center gap-4">
          <button onClick={handlePrev} className="p-2 hover:bg-white/10 rounded">
            <SkipPrevIcon />
          </button>

          <button
            onClick={togglePlay}
            className="w-12 h-12 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform"
          >
            {state.isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          <button onClick={handleNext} className="p-2 hover:bg-white/10 rounded">
            <SkipNextIcon />
          </button>
        </div>

        <button onClick={toggleRepeat} className="p-2 hover:bg-white/10 rounded">
          <RepeatIcon mode={repeatMode} />
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-4 p-4 border-b border-gray-800">
        <VolumeSlider
          volume={state.volume}
          muted={state.muted}
          onVolumeChange={setVolume}
          onMuteToggle={toggleMute}
        />
      </div>

      {/* Playlist */}
      <div className="max-h-60 overflow-y-auto">
        {tracks.map((track, index) => (
          <div
            key={track.id}
            onClick={() => selectTrack(index)}
            className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-white/10 ${
              index === currentIndex ? "bg-white/5" : ""
            }`}
          >
            {track.cover && (
              <img
                src={track.cover}
                alt={track.title}
                className="w-10 h-10 rounded object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <p
                className={`truncate ${
                  index === currentIndex ? "text-green-400" : ""
                }`}
              >
                {track.title}
              </p>
              {track.artist && (
                <p className="text-gray-400 text-xs truncate">{track.artist}</p>
              )}
            </div>
            <span className="text-gray-400 text-sm">
              {track.duration ? formatTime(track.duration) : "--:--"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
})

// ============================================================================
// Mini Player
// ============================================================================

interface MiniPlayerProps {
  src: string
  title?: string
  onExpand?: () => void
  className?: string
}

export const MiniPlayer = memo(function MiniPlayer({
  src,
  title,
  onExpand,
  className = "",
}: MiniPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => {
      setProgress((audio.currentTime / audio.duration) * 100 || 0)
    }

    audio.addEventListener("timeupdate", handleTimeUpdate)
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate)
  }, [])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying])

  return (
    <div
      className={`fixed bottom-4 right-4 bg-gray-900 rounded-lg shadow-xl text-white flex items-center gap-3 p-3 ${className}`}
    >
      <audio ref={audioRef} src={src} />

      <button
        onClick={togglePlay}
        className="w-10 h-10 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className="flex-1 min-w-0">
        <p className="text-sm truncate max-w-32">{title || "Playing"}</p>
        <div className="h-1 bg-gray-700 rounded mt-1">
          <div
            className="h-full bg-white rounded"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {onExpand && (
        <button
          onClick={onExpand}
          className="p-2 hover:bg-white/10 rounded"
        >
          <FullscreenIcon />
        </button>
      )}
    </div>
  )
})

// ============================================================================
// Audio Recorder
// ============================================================================

interface AudioRecorderProps {
  onRecordingComplete?: (blob: Blob, url: string) => void
  maxDuration?: number
  className?: string
}

export const AudioRecorder = memo(function AudioRecorder({
  onRecordingComplete,
  maxDuration = 300,
  className = "",
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const intervalRef = useRef<NodeJS.Timeout>()

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        onRecordingComplete?.(blob, url)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setDuration(0)

      intervalRef.current = setInterval(() => {
        setDuration((d) => {
          if (d >= maxDuration - 1) {
            stopRecording()
            return d
          }
          return d + 1
        })
      }, 1000)
    } catch (err) {
      console.error("Error accessing microphone:", err)
    }
  }, [maxDuration, onRecordingComplete])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isRecording])

  const clearRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }
    setDuration(0)
  }, [audioUrl])

  return (
    <div className={`bg-gray-900 rounded-lg p-4 text-white ${className}`}>
      <div className="flex items-center justify-center gap-4">
        {!isRecording && !audioUrl && (
          <button
            onClick={startRecording}
            className="w-16 h-16 flex items-center justify-center bg-red-500 rounded-full hover:bg-red-600 transition-colors"
          >
            <div className="w-6 h-6 bg-white rounded-full" />
          </button>
        )}

        {isRecording && (
          <>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-4 h-4 bg-red-500 rounded-full"
            />
            <span className="text-2xl font-mono">{formatTime(duration)}</span>
            <button
              onClick={stopRecording}
              className="w-12 h-12 flex items-center justify-center bg-gray-700 rounded-full hover:bg-gray-600 transition-colors"
            >
              <div className="w-4 h-4 bg-white rounded" />
            </button>
          </>
        )}

        {audioUrl && (
          <div className="flex items-center gap-4 w-full">
            <audio src={audioUrl} controls className="flex-1" />
            <button
              onClick={clearRecording}
              className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {isRecording && (
        <div className="mt-4">
          <div className="h-1 bg-gray-700 rounded">
            <motion.div
              className="h-full bg-red-500 rounded"
              initial={{ width: 0 }}
              animate={{ width: `${(duration / maxDuration) * 100}%` }}
            />
          </div>
          <p className="text-center text-sm text-gray-400 mt-2">
            {formatTime(maxDuration - duration)} remaining
          </p>
        </div>
      )}
    </div>
  )
})

// ============================================================================
// Exports
// ============================================================================

export {
  type Track,
  type PlayerState,
  type AudioPlayerProps,
  type VideoPlayerProps,
  type PlaylistPlayerProps,
  formatTime,
}
