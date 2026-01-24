"""
EVA Voice Emotion Detection
Prosodic analysis to detect emotions from voice audio
Uses librosa for feature extraction + rules/ML for classification

Optimizations:
- Pre-computed emotion profile means for O(1) lookup
- Module-level constants for default returns
- Deque for history with maxlen for O(1) removal
"""

import numpy as np
from typing import Dict, Any, Optional, Tuple, List
from dataclasses import dataclass
from collections import deque
import io
import time

# Audio processing
try:
    import librosa
    import soundfile as sf
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False
    print("⚠️ librosa not available - voice emotion detection disabled")

try:
    import torch
    import torchaudio
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False


@dataclass
class VoiceEmotion:
    """Detected emotion from voice"""
    emotion: str
    confidence: float
    intensity: float
    valence: float  # -1 (negative) to 1 (positive)
    arousal: float  # 0 (calm) to 1 (excited)
    features: Dict[str, float]


# Pre-computed default VoiceEmotion for neutral/error returns (module-level for performance)
_DEFAULT_NEUTRAL_EMOTION = VoiceEmotion(
    emotion="neutral",
    confidence=0.3,
    intensity=0.5,
    valence=0.0,
    arousal=0.3,
    features={}
)


@dataclass
class ProsodicFeatures:
    """Raw prosodic features extracted from audio"""
    pitch_mean: float
    pitch_std: float
    pitch_range: float
    energy_mean: float
    energy_std: float
    speech_rate: float  # syllables/sec estimate
    pause_ratio: float  # ratio of silence
    spectral_centroid: float
    spectral_rolloff: float
    zero_crossing_rate: float
    mfcc_mean: np.ndarray


class VoiceEmotionDetector:
    """
    Detect emotions from voice using prosodic features

    Emotion mapping based on research:
    - Sadness: Low pitch, slow rate, low energy, long pauses
    - Anger: High pitch variance, fast rate, high energy, short pauses
    - Joy: High pitch, fast rate, high energy, varied intonation
    - Fear: High pitch, fast rate, trembling (pitch variance)
    - Neutral: Moderate values across all features
    """

    # Emotion profiles based on prosodic research
    EMOTION_PROFILES = {
        "joy": {
            "pitch_mean": (1.1, 1.3),  # relative to neutral
            "pitch_std": (1.2, 1.5),
            "energy_mean": (1.1, 1.3),
            "speech_rate": (1.1, 1.3),
            "valence": 0.8,
            "arousal": 0.7
        },
        "sadness": {
            "pitch_mean": (0.7, 0.9),
            "pitch_std": (0.5, 0.8),
            "energy_mean": (0.6, 0.8),
            "speech_rate": (0.6, 0.85),
            "valence": -0.7,
            "arousal": 0.2
        },
        "anger": {
            "pitch_mean": (1.0, 1.2),
            "pitch_std": (1.3, 1.8),
            "energy_mean": (1.3, 1.6),
            "speech_rate": (1.1, 1.4),
            "valence": -0.6,
            "arousal": 0.9
        },
        "fear": {
            "pitch_mean": (1.2, 1.4),
            "pitch_std": (1.4, 2.0),
            "energy_mean": (0.9, 1.1),
            "speech_rate": (1.2, 1.5),
            "valence": -0.5,
            "arousal": 0.8
        },
        "surprise": {
            "pitch_mean": (1.3, 1.5),
            "pitch_std": (1.5, 2.0),
            "energy_mean": (1.1, 1.3),
            "speech_rate": (0.9, 1.1),
            "valence": 0.3,
            "arousal": 0.8
        },
        "neutral": {
            "pitch_mean": (0.95, 1.05),
            "pitch_std": (0.9, 1.1),
            "energy_mean": (0.95, 1.05),
            "speech_rate": (0.95, 1.05),
            "valence": 0.0,
            "arousal": 0.3
        }
    }

    # Pre-computed profile means for O(1) lookup in detect_emotion (class-level for performance)
    _PROFILE_MEANS: Dict[str, Dict[str, float]] = {}

    @classmethod
    def _compute_profile_means(cls) -> None:
        """Pre-compute mean values for each emotion profile."""
        if cls._PROFILE_MEANS:
            return  # Already computed
        for emotion, profile in cls.EMOTION_PROFILES.items():
            cls._PROFILE_MEANS[emotion] = {
                "pitch_mean": (profile["pitch_mean"][0] + profile["pitch_mean"][1]) / 2,
                "pitch_std": (profile["pitch_std"][0] + profile["pitch_std"][1]) / 2,
                "energy_mean": (profile["energy_mean"][0] + profile["energy_mean"][1]) / 2,
                "speech_rate": (profile["speech_rate"][0] + profile["speech_rate"][1]) / 2,
            }

    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.baseline_features: Optional[ProsodicFeatures] = None
        self._calibration_samples = []

        # Running averages for baseline (user-specific calibration)
        # Use deque with maxlen for O(1) removal instead of list slicing
        self._pitch_history: deque = deque(maxlen=20)
        self._energy_history: deque = deque(maxlen=20)

        # Pre-compute profile means once at class level
        self._compute_profile_means()

        if not LIBROSA_AVAILABLE:
            print("⚠️ VoiceEmotionDetector: librosa not available")

    def extract_features(self, audio_data: np.ndarray, sr: int = None) -> Optional[ProsodicFeatures]:
        """Extract prosodic features from audio"""
        if not LIBROSA_AVAILABLE:
            return None

        sr = sr or self.sample_rate

        try:
            # Ensure float32 and mono
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32)
            if len(audio_data.shape) > 1:
                audio_data = np.mean(audio_data, axis=1)

            # Normalize
            if np.max(np.abs(audio_data)) > 0:
                audio_data = audio_data / np.max(np.abs(audio_data))

            # Skip if too short
            if len(audio_data) < sr * 0.5:  # Less than 0.5 seconds
                return None

            # 1. Pitch analysis (F0)
            pitches, magnitudes = librosa.piptrack(y=audio_data, sr=sr, fmin=50, fmax=500)
            pitch_values = []
            for t in range(pitches.shape[1]):
                index = magnitudes[:, t].argmax()
                pitch = pitches[index, t]
                if pitch > 0:
                    pitch_values.append(pitch)

            if len(pitch_values) > 0:
                pitch_mean = np.mean(pitch_values)
                pitch_std = np.std(pitch_values)
                pitch_range = np.max(pitch_values) - np.min(pitch_values)
            else:
                pitch_mean = 150.0  # Default
                pitch_std = 30.0
                pitch_range = 100.0

            # 2. Energy (RMS)
            rms = librosa.feature.rms(y=audio_data)[0]
            energy_mean = np.mean(rms)
            energy_std = np.std(rms)

            # 3. Speech rate estimate (based on onset detection)
            onset_frames = librosa.onset.onset_detect(y=audio_data, sr=sr)
            duration = len(audio_data) / sr
            speech_rate = len(onset_frames) / duration if duration > 0 else 3.0

            # 4. Pause ratio (silence detection)
            silence_threshold = 0.02
            is_silence = rms < silence_threshold
            pause_ratio = np.sum(is_silence) / len(rms) if len(rms) > 0 else 0.3

            # 5. Spectral features
            spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=audio_data, sr=sr))
            spectral_rolloff = np.mean(librosa.feature.spectral_rolloff(y=audio_data, sr=sr))
            zcr = np.mean(librosa.feature.zero_crossing_rate(audio_data))

            # 6. MFCCs
            mfccs = librosa.feature.mfcc(y=audio_data, sr=sr, n_mfcc=13)
            mfcc_mean = np.mean(mfccs, axis=1)

            return ProsodicFeatures(
                pitch_mean=pitch_mean,
                pitch_std=pitch_std,
                pitch_range=pitch_range,
                energy_mean=energy_mean,
                energy_std=energy_std,
                speech_rate=speech_rate,
                pause_ratio=pause_ratio,
                spectral_centroid=spectral_centroid,
                spectral_rolloff=spectral_rolloff,
                zero_crossing_rate=zcr,
                mfcc_mean=mfcc_mean
            )

        except Exception as e:
            print(f"⚠️ Feature extraction error: {e}")
            return None

    def update_baseline(self, features: ProsodicFeatures):
        """Update baseline with new sample (for calibration).

        Uses deque with maxlen=20 for O(1) removal instead of list slicing.
        """
        self._pitch_history.append(features.pitch_mean)
        self._energy_history.append(features.energy_mean)
        # Note: deque with maxlen automatically removes oldest items, no manual slicing needed

        # Update baseline as running average
        if len(self._pitch_history) >= 3:
            self.baseline_features = ProsodicFeatures(
                pitch_mean=np.mean(self._pitch_history),
                pitch_std=features.pitch_std,
                pitch_range=features.pitch_range,
                energy_mean=np.mean(self._energy_history),
                energy_std=features.energy_std,
                speech_rate=features.speech_rate,
                pause_ratio=features.pause_ratio,
                spectral_centroid=features.spectral_centroid,
                spectral_rolloff=features.spectral_rolloff,
                zero_crossing_rate=features.zero_crossing_rate,
                mfcc_mean=features.mfcc_mean
            )

    def detect_emotion(self, audio_data: np.ndarray, sr: int = None) -> VoiceEmotion:
        """Detect emotion from audio.

        Optimized: Uses pre-computed profile means for O(1) lookup.
        """
        features = self.extract_features(audio_data, sr)

        if features is None:
            return _DEFAULT_NEUTRAL_EMOTION

        # Update baseline
        self.update_baseline(features)

        # Calculate relative features (compared to baseline)
        baseline = self.baseline_features or features
        rel_pitch = features.pitch_mean / baseline.pitch_mean if baseline.pitch_mean > 0 else 1.0
        rel_pitch_std = features.pitch_std / baseline.pitch_std if baseline.pitch_std > 0 else 1.0
        rel_energy = features.energy_mean / baseline.energy_mean if baseline.energy_mean > 0 else 1.0
        rel_speech_rate = features.speech_rate / 4.0  # Normalize to ~4 syllables/sec

        # Match against emotion profiles (using pre-computed means for O(1) lookup)
        scores = {}
        for emotion, profile in self.EMOTION_PROFILES.items():
            score = 0.0
            checks = 0
            means = self._PROFILE_MEANS[emotion]

            # Pitch mean (using pre-computed mean)
            if profile["pitch_mean"][0] <= rel_pitch <= profile["pitch_mean"][1]:
                score += 1.0
            else:
                score += 1.0 - min(1.0, abs(rel_pitch - means["pitch_mean"]))
            checks += 1

            # Pitch variation (using pre-computed mean)
            if profile["pitch_std"][0] <= rel_pitch_std <= profile["pitch_std"][1]:
                score += 1.0
            else:
                score += 1.0 - min(1.0, abs(rel_pitch_std - means["pitch_std"]))
            checks += 1

            # Energy (using pre-computed mean)
            if profile["energy_mean"][0] <= rel_energy <= profile["energy_mean"][1]:
                score += 1.0
            else:
                score += 1.0 - min(1.0, abs(rel_energy - means["energy_mean"]))
            checks += 1

            # Speech rate (using pre-computed mean)
            if profile["speech_rate"][0] <= rel_speech_rate <= profile["speech_rate"][1]:
                score += 1.0
            else:
                score += 1.0 - min(1.0, abs(rel_speech_rate - means["speech_rate"]))
            checks += 1

            scores[emotion] = score / checks

        # Find best match
        best_emotion = max(scores, key=scores.get)
        confidence = scores[best_emotion]

        # Calculate intensity based on deviation from neutral
        intensity = min(1.0, abs(rel_energy - 1.0) + abs(rel_pitch - 1.0))

        # Get valence and arousal from profile
        profile = self.EMOTION_PROFILES[best_emotion]
        valence = profile["valence"]
        arousal = profile["arousal"]

        # Adjust confidence based on feature clarity
        if confidence < 0.5:
            best_emotion = "neutral"
            valence = 0.0
            arousal = 0.3

        return VoiceEmotion(
            emotion=best_emotion,
            confidence=confidence,
            intensity=intensity,
            valence=valence,
            arousal=arousal,
            features={
                "pitch_mean": features.pitch_mean,
                "pitch_std": features.pitch_std,
                "energy_mean": features.energy_mean,
                "speech_rate": features.speech_rate,
                "pause_ratio": features.pause_ratio,
                "rel_pitch": rel_pitch,
                "rel_energy": rel_energy
            }
        )

    def detect_from_bytes(self, audio_bytes: bytes) -> VoiceEmotion:
        """Detect emotion from audio bytes (WAV format)."""
        try:
            # Load audio from bytes
            audio_io = io.BytesIO(audio_bytes)
            audio_data, sr = sf.read(audio_io)
            return self.detect_emotion(audio_data, sr)
        except Exception as e:
            print(f"⚠️ Error processing audio bytes: {e}")
            return _DEFAULT_NEUTRAL_EMOTION

    def is_user_about_to_speak(self, audio_data: np.ndarray, sr: int = None) -> Tuple[bool, float]:
        """Detect if user is about to speak (breathing/preparation sounds)"""
        sr = sr or self.sample_rate

        try:
            # Look for characteristic pre-speech patterns
            rms = librosa.feature.rms(y=audio_data)[0]

            # Pre-speech typically has low-level sound followed by onset
            if len(rms) < 10:
                return False, 0.0

            # Check for rising energy pattern
            recent = rms[-10:]
            if len(recent) >= 5:
                rising = np.mean(recent[-3:]) > np.mean(recent[:3]) * 1.5
                low_initial = np.mean(recent[:3]) < 0.1
                if rising and low_initial:
                    return True, 0.7

            return False, 0.0

        except Exception:
            return False, 0.0


# Global instance
voice_emotion_detector: Optional[VoiceEmotionDetector] = None


def init_voice_emotion(sample_rate: int = 16000) -> VoiceEmotionDetector:
    """Initialize the voice emotion detector"""
    global voice_emotion_detector
    voice_emotion_detector = VoiceEmotionDetector(sample_rate)
    print("✅ Voice emotion detector initialized")
    return voice_emotion_detector


def detect_voice_emotion(audio_data: np.ndarray, sr: int = 16000) -> VoiceEmotion:
    """Detect emotion from audio"""
    global voice_emotion_detector
    if voice_emotion_detector is None:
        init_voice_emotion(sr)
    return voice_emotion_detector.detect_emotion(audio_data, sr)


def detect_voice_emotion_bytes(audio_bytes: bytes) -> VoiceEmotion:
    """Detect emotion from audio bytes"""
    global voice_emotion_detector
    if voice_emotion_detector is None:
        init_voice_emotion()
    return voice_emotion_detector.detect_from_bytes(audio_bytes)
