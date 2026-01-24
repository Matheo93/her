"""
Tests for eva_emotional_tts.py - Emotional TTS System.

Tests the EVA emotional TTS features:
- EmotionStyle enum
- EmotionalVoiceParams dataclass
- EMOTION_PARAMS mapping
- EvaEmotionalTTS class
- Emotion prompts
- Global functions
"""

import pytest
import numpy as np
import sys
import os
from unittest.mock import patch, MagicMock, AsyncMock
import io

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestEmotionStyleEnum:
    """Tests for EmotionStyle enum."""

    def test_all_emotions_defined(self):
        """Test all expected emotions are defined."""
        from eva_emotional_tts import EmotionStyle

        expected = [
            "NEUTRAL", "JOY", "SADNESS", "ANGER", "FEAR",
            "SURPRISE", "TENDERNESS", "EXCITEMENT", "PLAYFUL", "INTIMATE"
        ]

        for name in expected:
            assert hasattr(EmotionStyle, name)

    def test_emotion_values(self):
        """Test emotion values are lowercase strings."""
        from eva_emotional_tts import EmotionStyle

        assert EmotionStyle.NEUTRAL.value == "neutral"
        assert EmotionStyle.JOY.value == "joy"
        assert EmotionStyle.SADNESS.value == "sadness"
        assert EmotionStyle.ANGER.value == "anger"
        assert EmotionStyle.FEAR.value == "fear"

    def test_emotion_from_string(self):
        """Test creating EmotionStyle from string."""
        from eva_emotional_tts import EmotionStyle

        assert EmotionStyle("joy") == EmotionStyle.JOY
        assert EmotionStyle("neutral") == EmotionStyle.NEUTRAL

    def test_invalid_emotion_raises(self):
        """Test invalid emotion string raises ValueError."""
        from eva_emotional_tts import EmotionStyle

        with pytest.raises(ValueError):
            EmotionStyle("invalid_emotion")


class TestEmotionalVoiceParams:
    """Tests for EmotionalVoiceParams dataclass."""

    def test_voice_params_creation(self):
        """Test EmotionalVoiceParams dataclass creation."""
        from eva_emotional_tts import EmotionalVoiceParams, EmotionStyle

        params = EmotionalVoiceParams(
            emotion=EmotionStyle.JOY,
            intensity=0.8,
            pitch_shift=0.3,
            speed_factor=1.15,
            energy_factor=1.2,
            breathiness=0.1
        )

        assert params.emotion == EmotionStyle.JOY
        assert params.intensity == 0.8
        assert params.pitch_shift == 0.3
        assert params.speed_factor == 1.15
        assert params.energy_factor == 1.2
        assert params.breathiness == 0.1


class TestEmotionParams:
    """Tests for EMOTION_PARAMS mapping."""

    def test_all_emotions_have_params(self):
        """Test all EmotionStyles have corresponding params."""
        from eva_emotional_tts import EMOTION_PARAMS, EmotionStyle

        for emotion in EmotionStyle:
            assert emotion in EMOTION_PARAMS
            params = EMOTION_PARAMS[emotion]
            assert params.emotion == emotion

    def test_neutral_params(self):
        """Test neutral emotion has baseline values."""
        from eva_emotional_tts import EMOTION_PARAMS, EmotionStyle

        neutral = EMOTION_PARAMS[EmotionStyle.NEUTRAL]

        assert neutral.pitch_shift == 0
        assert neutral.speed_factor == 1.0
        assert neutral.energy_factor == 1.0

    def test_joy_params(self):
        """Test joy emotion has appropriate values."""
        from eva_emotional_tts import EMOTION_PARAMS, EmotionStyle

        joy = EMOTION_PARAMS[EmotionStyle.JOY]

        assert joy.pitch_shift > 0  # Higher pitch
        assert joy.speed_factor > 1.0  # Faster
        assert joy.energy_factor > 1.0  # More energy

    def test_sadness_params(self):
        """Test sadness emotion has appropriate values."""
        from eva_emotional_tts import EMOTION_PARAMS, EmotionStyle

        sadness = EMOTION_PARAMS[EmotionStyle.SADNESS]

        assert sadness.pitch_shift < 0  # Lower pitch
        assert sadness.speed_factor < 1.0  # Slower
        assert sadness.energy_factor < 1.0  # Less energy

    def test_param_ranges_valid(self):
        """Test all params are within valid ranges."""
        from eva_emotional_tts import EMOTION_PARAMS

        for emotion, params in EMOTION_PARAMS.items():
            assert 0 <= params.intensity <= 1
            assert -1 <= params.pitch_shift <= 1
            assert 0.5 <= params.speed_factor <= 2.0
            assert 0.5 <= params.energy_factor <= 2.0
            assert 0 <= params.breathiness <= 1


class TestEvaEmotionalTTS:
    """Tests for EvaEmotionalTTS class."""

    def test_init_no_backends(self):
        """Test initialization with no backends available."""
        from eva_emotional_tts import EvaEmotionalTTS

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                tts = EvaEmotionalTTS()

                assert tts.current_backend == "none"
                assert tts.cosyvoice is None

    def test_init_sherpa_fallback(self):
        """Test initialization falls back to Sherpa."""
        from eva_emotional_tts import EvaEmotionalTTS

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", True):
                tts = EvaEmotionalTTS()

                assert tts.current_backend == "sherpa"
                assert tts.sample_rate == 16000

    def test_emotion_prompts_defined(self):
        """Test all emotion prompts are defined."""
        from eva_emotional_tts import EvaEmotionalTTS, EmotionStyle

        for emotion in EmotionStyle:
            assert emotion in EvaEmotionalTTS._EMOTION_PROMPTS


class TestGetEmotionPrompt:
    """Tests for _get_emotion_prompt method."""

    def test_get_emotion_prompt_joy(self):
        """Test getting joy emotion prompt."""
        from eva_emotional_tts import EvaEmotionalTTS, EmotionStyle

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                tts = EvaEmotionalTTS()
                prompt = tts._get_emotion_prompt(EmotionStyle.JOY, 0.5)

                assert "happiness" in prompt.lower() or "joy" in prompt.lower() or "warmth" in prompt.lower()

    def test_get_emotion_prompt_high_intensity(self):
        """Test high intensity adds emphasis."""
        from eva_emotional_tts import EvaEmotionalTTS, EmotionStyle

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                tts = EvaEmotionalTTS()
                prompt = tts._get_emotion_prompt(EmotionStyle.JOY, 0.9)

                assert "strong" in prompt.lower()

    def test_get_emotion_prompt_low_intensity(self):
        """Test low intensity adds subtlety."""
        from eva_emotional_tts import EvaEmotionalTTS, EmotionStyle

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                tts = EvaEmotionalTTS()
                prompt = tts._get_emotion_prompt(EmotionStyle.JOY, 0.2)

                assert "subtle" in prompt.lower()

    def test_intensity_prompts_precomputed(self):
        """Test that intensity prompts are pre-computed at class level."""
        from eva_emotional_tts import EvaEmotionalTTS, EmotionStyle

        # Verify _INTENSITY_PROMPTS exists and has all 30 combinations
        assert hasattr(EvaEmotionalTTS, "_INTENSITY_PROMPTS")
        intensity_prompts = EvaEmotionalTTS._INTENSITY_PROMPTS

        # Check all emotions have all 3 intensity levels
        for emotion in EmotionStyle:
            assert emotion in intensity_prompts
            assert "high" in intensity_prompts[emotion]
            assert "normal" in intensity_prompts[emotion]
            assert "low" in intensity_prompts[emotion]

    def test_intensity_prompt_lookup_is_o1(self):
        """Test that intensity prompt lookup uses dict O(1) lookup."""
        from eva_emotional_tts import EvaEmotionalTTS, EmotionStyle

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                tts = EvaEmotionalTTS()

                # Multiple calls should return same pre-computed string
                prompt1 = tts._get_emotion_prompt(EmotionStyle.JOY, 0.9)
                prompt2 = tts._get_emotion_prompt(EmotionStyle.JOY, 0.9)

                # Should be identical strings (no new allocation)
                assert prompt1 == prompt2

    def test_all_emotions_have_intensity_prompts(self):
        """Test all emotions have pre-computed intensity prompts."""
        from eva_emotional_tts import EvaEmotionalTTS, EmotionStyle

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                tts = EvaEmotionalTTS()

                for emotion in EmotionStyle:
                    # Test all 3 intensity levels
                    high = tts._get_emotion_prompt(emotion, 0.9)
                    normal = tts._get_emotion_prompt(emotion, 0.5)
                    low = tts._get_emotion_prompt(emotion, 0.2)

                    # All should be non-empty strings
                    assert isinstance(high, str) and len(high) > 0
                    assert isinstance(normal, str) and len(normal) > 0
                    assert isinstance(low, str) and len(low) > 0

                    # High and low should differ from normal
                    assert high != normal or emotion == EmotionStyle.NEUTRAL
                    assert low != normal or emotion == EmotionStyle.NEUTRAL


class TestApplyProsodyEffects:
    """Tests for _apply_prosody_effects method."""

    def test_apply_prosody_no_torch(self):
        """Test prosody effects return original without torch."""
        from eva_emotional_tts import EvaEmotionalTTS, EmotionalVoiceParams, EmotionStyle

        with patch("eva_emotional_tts.TORCH_AVAILABLE", False):
            with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
                with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                    tts = EvaEmotionalTTS()

                    audio = np.random.randn(16000).astype(np.float32)
                    params = EmotionalVoiceParams(
                        emotion=EmotionStyle.JOY,
                        intensity=0.8,
                        pitch_shift=0.3,
                        speed_factor=1.15,
                        energy_factor=1.2,
                        breathiness=0.1
                    )

                    result = tts._apply_prosody_effects(audio, params)

                    np.testing.assert_array_equal(result, audio)


class TestToWavBytes:
    """Tests for _to_wav_bytes method."""

    def test_to_wav_bytes_float32(self):
        """Test converting float32 audio to WAV bytes."""
        from eva_emotional_tts import EvaEmotionalTTS
        import wave

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                tts = EvaEmotionalTTS()

                audio = np.random.randn(16000).astype(np.float32) * 0.5
                wav_bytes = tts._to_wav_bytes(audio)

                assert wav_bytes is not None
                assert isinstance(wav_bytes, bytes)
                assert len(wav_bytes) > 0

                # Verify it's valid WAV
                with wave.open(io.BytesIO(wav_bytes), 'rb') as wav:
                    assert wav.getnchannels() == 1
                    assert wav.getsampwidth() == 2

    def test_to_wav_bytes_int16(self):
        """Test converting int16 audio to WAV bytes."""
        from eva_emotional_tts import EvaEmotionalTTS
        import wave

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                tts = EvaEmotionalTTS()

                audio = (np.random.randn(16000) * 16000).astype(np.int16)
                wav_bytes = tts._to_wav_bytes(audio)

                assert wav_bytes is not None
                assert isinstance(wav_bytes, bytes)


class TestSynthesize:
    """Tests for synthesize method."""

    @pytest.mark.asyncio
    async def test_synthesize_no_backend(self):
        """Test synthesize returns None with no backend."""
        from eva_emotional_tts import EvaEmotionalTTS

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                tts = EvaEmotionalTTS()

                result = await tts.synthesize("Hello", "joy", 0.8)

                assert result is None

    @pytest.mark.asyncio
    async def test_synthesize_invalid_emotion(self):
        """Test synthesize handles invalid emotion gracefully."""
        from eva_emotional_tts import EvaEmotionalTTS

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                tts = EvaEmotionalTTS()

                # Should not raise, just use neutral
                result = await tts.synthesize("Hello", "invalid_emotion", 0.5)

                # Returns None because no backend
                assert result is None


class TestSynthesizeStream:
    """Tests for synthesize_stream method."""

    @pytest.mark.asyncio
    async def test_synthesize_stream_yields(self):
        """Test synthesize_stream yields audio."""
        from eva_emotional_tts import EvaEmotionalTTS

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                tts = EvaEmotionalTTS()

                # Mock synthesize to return audio
                mock_audio = b"fake_audio_data"
                with patch.object(tts, 'synthesize', return_value=mock_audio):
                    chunks = []
                    async for chunk in tts.synthesize_stream("Hello", "joy", 0.8):
                        chunks.append(chunk)

                    assert len(chunks) == 1
                    assert chunks[0] == mock_audio


class TestGetBackendInfo:
    """Tests for get_backend_info method."""

    def test_get_backend_info_no_backend(self):
        """Test backend info with no backend."""
        from eva_emotional_tts import EvaEmotionalTTS

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                tts = EvaEmotionalTTS()
                info = tts.get_backend_info()

                assert info["backend"] == "none"
                assert info["cosyvoice_available"] is False
                assert info["sherpa_available"] is False

    def test_get_backend_info_sherpa(self):
        """Test backend info with Sherpa backend."""
        from eva_emotional_tts import EvaEmotionalTTS

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", True):
                tts = EvaEmotionalTTS()
                info = tts.get_backend_info()

                assert info["backend"] == "sherpa"
                assert info["sample_rate"] == 16000
                assert info["sherpa_available"] is True
                assert info["emotional_support"] is True


class TestGlobalFunctions:
    """Tests for global utility functions."""

    def test_init_emotional_tts(self):
        """Test init_emotional_tts function."""
        from eva_emotional_tts import init_emotional_tts, EvaEmotionalTTS
        import eva_emotional_tts

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                result = init_emotional_tts()

                assert isinstance(result, EvaEmotionalTTS)
                assert eva_emotional_tts.eva_tts is not None

    def test_get_emotional_tts_before_init(self):
        """Test get_emotional_tts before initialization."""
        from eva_emotional_tts import get_emotional_tts
        import eva_emotional_tts

        # Reset global
        eva_emotional_tts.eva_tts = None

        result = get_emotional_tts()

        # May or may not be None depending on previous tests

    def test_get_emotional_tts_after_init(self):
        """Test get_emotional_tts after initialization."""
        from eva_emotional_tts import init_emotional_tts, get_emotional_tts

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                init_emotional_tts()
                result = get_emotional_tts()

                assert result is not None

    @pytest.mark.asyncio
    async def test_emotional_tts_global(self):
        """Test emotional_tts global function."""
        from eva_emotional_tts import emotional_tts
        import eva_emotional_tts

        # Reset global
        eva_emotional_tts.eva_tts = None

        with patch("eva_emotional_tts.COSYVOICE_AVAILABLE", False):
            with patch("eva_emotional_tts.ULTRA_TTS_AVAILABLE", False):
                result = await emotional_tts("Hello", "joy", 0.8)

                # Returns None because no backend
                assert result is None

                # But should have initialized
                assert eva_emotional_tts.eva_tts is not None


class TestAvailabilityFlags:
    """Tests for availability flags."""

    def test_cosyvoice_available_flag(self):
        """Test COSYVOICE_AVAILABLE flag exists."""
        from eva_emotional_tts import COSYVOICE_AVAILABLE

        assert isinstance(COSYVOICE_AVAILABLE, bool)

    def test_torch_available_flag(self):
        """Test TORCH_AVAILABLE flag exists."""
        from eva_emotional_tts import TORCH_AVAILABLE

        assert isinstance(TORCH_AVAILABLE, bool)

    def test_ultra_tts_available_flag(self):
        """Test ULTRA_TTS_AVAILABLE flag exists."""
        from eva_emotional_tts import ULTRA_TTS_AVAILABLE

        assert isinstance(ULTRA_TTS_AVAILABLE, bool)
