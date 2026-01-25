"use client";

/**
 * Audio Player Components - Sprint 730
 *
 * Audio playback controls:
 * - Full audio player
 * - Mini player
 * - Progress bar
 * - Volume control
 * - Playlist support
 * - HER-themed styling
 */

import React, { memo, useState, useRef, useCallback, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface Track {
  id: string;
  title: string;
  artist?: string;
  src: string;
  cover?: string;
  duration?: number;
}

interface AudioPlayerProps {
  track?: Track;
  tracks?: Track[];
  autoPlay?: boolean;
  loop?: boolean;
  shuffle?: boolean;
  showPlaylist?: boolean;
  onTrackChange?: (track: Track) => void;
  onEnd?: () => void;
  className?: string;
}

/**
 * Full Audio Player
 */
export const AudioPlayer = memo(function AudioPlayer({
  track,
  tracks = [],
  autoPlay = false,
  loop = false,
  shuffle = false,
  showPlaylist = false,
  onTrackChange,
  onEnd,
  className = "",
}: AudioPlayerProps) {
  const { colors } = useTheme();
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | undefined>(track);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLooping, setIsLooping] = useState(loop);
  const [isShuffling, setIsShuffling] = useState(shuffle);

  // Initialize with track or first track from playlist
  useEffect(() => {
    if (track) {
      setCurrentTrack(track);
    } else if (tracks.length > 0) {
      setCurrentTrack(tracks[0]);
    }
  }, [track, tracks]);

  // Update audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      if (isLooping) {
        audio.currentTime = 0;
        audio.play();
      } else if (tracks.length > 1) {
        playNext();
      } else {
        setIsPlaying(false);
        onEnd?.();
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [isLooping, tracks.length, onEnd]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const changeVolume = useCallback((value: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = value;
      setVolume(value);
      setIsMuted(value === 0);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      if (isMuted) {
        audio.volume = volume || 1;
        setIsMuted(false);
      } else {
        audio.volume = 0;
        setIsMuted(true);
      }
    }
  }, [isMuted, volume]);

  const playTrack = useCallback((t: Track, index: number) => {
    setCurrentTrack(t);
    setCurrentIndex(index);
    onTrackChange?.(t);
    setTimeout(() => {
      audioRef.current?.play();
      setIsPlaying(true);
    }, 0);
  }, [onTrackChange]);

  const playNext = useCallback(() => {
    if (tracks.length === 0) return;

    let nextIndex: number;
    if (isShuffling) {
      nextIndex = Math.floor(Math.random() * tracks.length);
    } else {
      nextIndex = (currentIndex + 1) % tracks.length;
    }

    playTrack(tracks[nextIndex], nextIndex);
  }, [tracks, currentIndex, isShuffling, playTrack]);

  const playPrevious = useCallback(() => {
    if (tracks.length === 0) return;

    const prevIndex = currentIndex === 0 ? tracks.length - 1 : currentIndex - 1;
    playTrack(tracks[prevIndex], prevIndex);
  }, [tracks, currentIndex, playTrack]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`rounded-xl p-4 ${className}`}
      style={{ backgroundColor: colors.warmWhite }}
    >
      <audio
        ref={audioRef}
        src={currentTrack?.src}
        autoPlay={autoPlay}
        preload="metadata"
      />

      {/* Track Info */}
      {currentTrack && (
        <div className="flex items-center gap-4 mb-4">
          {currentTrack.cover ? (
            <img
              src={currentTrack.cover}
              alt={currentTrack.title}
              className="w-16 h-16 rounded-lg object-cover"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: colors.cream }}
            >
              <MusicIcon color={colors.coral} />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p
              className="font-semibold truncate"
              style={{ color: colors.textPrimary }}
            >
              {currentTrack.title}
            </p>
            {currentTrack.artist && (
              <p className="text-sm truncate" style={{ color: colors.textMuted }}>
                {currentTrack.artist}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="mb-4">
        <ProgressBar
          current={currentTime}
          total={duration}
          onChange={seek}
        />
        <div className="flex justify-between mt-1">
          <span className="text-xs" style={{ color: colors.textMuted }}>
            {formatTime(currentTime)}
          </span>
          <span className="text-xs" style={{ color: colors.textMuted }}>
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        {tracks.length > 1 && (
          <IconButton onClick={() => setIsShuffling(!isShuffling)} active={isShuffling}>
            <ShuffleIcon />
          </IconButton>
        )}

        <IconButton onClick={playPrevious} disabled={tracks.length <= 1}>
          <SkipBackIcon />
        </IconButton>

        <motion.button
          onClick={togglePlay}
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ backgroundColor: colors.coral, color: colors.warmWhite }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </motion.button>

        <IconButton onClick={playNext} disabled={tracks.length <= 1}>
          <SkipForwardIcon />
        </IconButton>

        <IconButton onClick={() => setIsLooping(!isLooping)} active={isLooping}>
          <RepeatIcon />
        </IconButton>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-3 mt-4">
        <IconButton onClick={toggleMute}>
          {isMuted ? <VolumeOffIcon /> : <VolumeIcon />}
        </IconButton>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={isMuted ? 0 : volume}
          onChange={(e) => changeVolume(parseFloat(e.target.value))}
          className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
          style={{ backgroundColor: colors.cream }}
        />
      </div>

      {/* Playlist */}
      {showPlaylist && tracks.length > 0 && (
        <div
          className="mt-4 pt-4 border-t max-h-48 overflow-y-auto"
          style={{ borderColor: colors.cream }}
        >
          {tracks.map((t, index) => (
            <button
              key={t.id}
              onClick={() => playTrack(t, index)}
              className="w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors"
              style={{
                backgroundColor: currentIndex === index ? colors.cream : "transparent",
              }}
            >
              <span
                className="w-6 text-center text-sm"
                style={{ color: currentIndex === index ? colors.coral : colors.textMuted }}
              >
                {currentIndex === index && isPlaying ? "▶" : index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm truncate"
                  style={{ color: currentIndex === index ? colors.coral : colors.textPrimary }}
                >
                  {t.title}
                </p>
                {t.artist && (
                  <p className="text-xs truncate" style={{ color: colors.textMuted }}>
                    {t.artist}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

interface MiniPlayerProps {
  track: Track;
  isPlaying?: boolean;
  currentTime?: number;
  onPlayPause?: () => void;
  onClose?: () => void;
  className?: string;
}

/**
 * Mini Audio Player
 */
export const MiniPlayer = memo(function MiniPlayer({
  track,
  isPlaying = false,
  currentTime = 0,
  onPlayPause,
  onClose,
  className = "",
}: MiniPlayerProps) {
  const { colors } = useTheme();
  const progress = track.duration ? (currentTime / track.duration) * 100 : 0;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className={`fixed bottom-4 left-4 right-4 rounded-xl p-3 shadow-lg ${className}`}
      style={{ backgroundColor: colors.warmWhite }}
    >
      <div
        className="absolute bottom-0 left-0 h-1 rounded-b-xl transition-all"
        style={{ width: `${progress}%`, backgroundColor: colors.coral }}
      />

      <div className="flex items-center gap-3">
        {track.cover ? (
          <img
            src={track.cover}
            alt={track.title}
            className="w-10 h-10 rounded-lg object-cover"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: colors.cream }}
          >
            <MusicIcon color={colors.coral} size={20} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: colors.textPrimary }}>
            {track.title}
          </p>
          {track.artist && (
            <p className="text-xs truncate" style={{ color: colors.textMuted }}>
              {track.artist}
            </p>
          )}
        </div>

        <motion.button
          onClick={onPlayPause}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: colors.coral, color: colors.warmWhite }}
          whileTap={{ scale: 0.95 }}
        >
          {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </motion.button>

        {onClose && (
          <button
            onClick={onClose}
            className="p-2"
            style={{ color: colors.textMuted }}
          >
            <CloseIcon size={18} />
          </button>
        )}
      </div>
    </motion.div>
  );
});

interface ProgressBarProps {
  current: number;
  total: number;
  onChange?: (value: number) => void;
  className?: string;
}

/**
 * Progress Bar
 */
export const ProgressBar = memo(function ProgressBar({
  current,
  total,
  onChange,
  className = "",
}: ProgressBarProps) {
  const { colors } = useTheme();
  const [isDragging, setIsDragging] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const percentage = total > 0 ? (current / total) * 100 : 0;

  const handleClick = (e: React.MouseEvent) => {
    if (!barRef.current || !onChange) return;

    const rect = barRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    onChange(percent * total);
  };

  return (
    <div
      ref={barRef}
      className={`relative h-2 rounded-full cursor-pointer ${className}`}
      style={{ backgroundColor: colors.cream }}
      onClick={handleClick}
    >
      <motion.div
        className="absolute top-0 left-0 h-full rounded-full"
        style={{ backgroundColor: colors.coral }}
        animate={{ width: `${percentage}%` }}
        transition={{ duration: isDragging ? 0 : 0.1 }}
      />
      <motion.div
        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-md"
        style={{
          left: `calc(${percentage}% - 8px)`,
          backgroundColor: colors.warmWhite,
          border: `2px solid ${colors.coral}`,
        }}
        whileHover={{ scale: 1.2 }}
      />
    </div>
  );
});

interface VolumeSliderProps {
  value: number;
  onChange?: (value: number) => void;
  muted?: boolean;
  onMuteToggle?: () => void;
  className?: string;
}

/**
 * Volume Slider
 */
export const VolumeSlider = memo(function VolumeSlider({
  value,
  onChange,
  muted = false,
  onMuteToggle,
  className = "",
}: VolumeSliderProps) {
  const { colors } = useTheme();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button onClick={onMuteToggle} style={{ color: colors.textMuted }}>
        {muted || value === 0 ? <VolumeOffIcon /> : <VolumeIcon />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : value}
        onChange={(e) => onChange?.(parseFloat(e.target.value))}
        className="w-24 h-1 rounded-full appearance-none cursor-pointer"
        style={{ backgroundColor: colors.cream }}
      />
    </div>
  );
});

// Helper Components
interface IconButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}

const IconButton = memo(function IconButton({
  children,
  onClick,
  disabled,
  active,
}: IconButtonProps) {
  const { colors } = useTheme();

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className="p-2 rounded-lg transition-colors"
      style={{
        color: active ? colors.coral : disabled ? colors.textMuted : colors.textPrimary,
        opacity: disabled ? 0.5 : 1,
      }}
      whileHover={{ scale: disabled ? 1 : 1.1 }}
      whileTap={{ scale: disabled ? 1 : 0.95 }}
    >
      {children}
    </motion.button>
  );
});

// Icons
const PlayIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const PauseIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

const SkipBackIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <polygon points="19 20 9 12 19 4 19 20" />
    <line x1="5" y1="19" x2="5" y2="5" />
  </svg>
);

const SkipForwardIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <polygon points="5 4 15 12 5 20 5 4" />
    <line x1="19" y1="5" x2="19" y2="19" />
  </svg>
);

const ShuffleIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <polyline points="16 3 21 3 21 8" />
    <line x1="4" y1="20" x2="21" y2="3" />
    <polyline points="21 16 21 21 16 21" />
    <line x1="15" y1="15" x2="21" y2="21" />
    <line x1="4" y1="4" x2="9" y2="9" />
  </svg>
);

const RepeatIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const VolumeIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);

const VolumeOffIcon = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

const MusicIcon = ({ color, size = 24 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const CloseIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export default AudioPlayer;
