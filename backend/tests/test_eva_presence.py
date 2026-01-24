"""
Tests for eva_presence.py - Presence System.

Tests the EVA presence features:
- Backchanneling
- Silence analysis
- Breathing patterns
- Turn-taking
- Interrupt detection
"""

import pytest
import sys
import os
import time
import numpy as np
from unittest.mock import MagicMock, patch

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestPresenceState:
    """Tests for PresenceState enum."""

    def test_presence_states_exist(self):
        """Test all expected presence states are defined."""
        from eva_presence import PresenceState

        expected = ["IDLE", "LISTENING", "THINKING", "SPEAKING", "EMPATHIC_SILENCE"]

        for name in expected:
            assert hasattr(PresenceState, name)

    def test_presence_state_values(self):
        """Test presence states have string values."""
        from eva_presence import PresenceState

        assert PresenceState.IDLE.value == "idle"
        assert PresenceState.LISTENING.value == "listening"
        assert PresenceState.THINKING.value == "thinking"
        assert PresenceState.SPEAKING.value == "speaking"
        assert PresenceState.EMPATHIC_SILENCE.value == "empathic_silence"


class TestBackchannelType:
    """Tests for BackchannelType enum."""

    def test_backchannel_types_exist(self):
        """Test all expected backchannel types are defined."""
        from eva_presence import BackchannelType

        expected = [
            "ACKNOWLEDGMENT", "ENCOURAGEMENT", "SURPRISE",
            "EMPATHY", "AGREEMENT", "THINKING"
        ]

        for name in expected:
            assert hasattr(BackchannelType, name)


class TestBackchannelConfig:
    """Tests for BackchannelConfig dataclass."""

    def test_backchannel_config_creation(self):
        """Test BackchannelConfig creation with defaults."""
        from eva_presence import BackchannelConfig

        config = BackchannelConfig(sounds=["mmhmm", "yeah"])

        assert config.sounds == ["mmhmm", "yeah"]
        assert config.probability == 0.3
        assert config.min_interval == 2.0
        assert config.audio_files == []

    def test_backchannel_config_with_emotion_boost(self):
        """Test BackchannelConfig with emotion boost."""
        from eva_presence import BackchannelConfig

        config = BackchannelConfig(
            sounds=["oh!"],
            emotion_boost={"surprise": 0.5}
        )

        assert config.emotion_boost == {"surprise": 0.5}


class TestSilenceContext:
    """Tests for SilenceContext dataclass."""

    def test_silence_context_creation(self):
        """Test SilenceContext creation."""
        from eva_presence import SilenceContext

        context = SilenceContext(
            duration=1.5,
            after_emotion="neutral",
            user_finished=True,
            is_comfortable=True,
            recommended_action="wait"
        )

        assert context.duration == 1.5
        assert context.after_emotion == "neutral"
        assert context.user_finished is True
        assert context.is_comfortable is True
        assert context.recommended_action == "wait"


class TestEvaPresenceSystem:
    """Tests for EvaPresenceSystem main class."""

    def test_init(self):
        """Test EvaPresenceSystem initialization."""
        from eva_presence import EvaPresenceSystem, PresenceState

        system = EvaPresenceSystem()

        assert system.sample_rate == 16000
        assert system.state == PresenceState.IDLE
        assert system.user_speaking is False
        assert system.user_emotion == "neutral"

    def test_init_custom_sample_rate(self):
        """Test EvaPresenceSystem with custom sample rate."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem(sample_rate=22050)

        assert system.sample_rate == 22050

    def test_set_state(self):
        """Test setting presence state."""
        from eva_presence import EvaPresenceSystem, PresenceState

        system = EvaPresenceSystem()
        system.set_state(PresenceState.LISTENING)

        assert system.state == PresenceState.LISTENING

    def test_user_started_speaking(self):
        """Test user started speaking."""
        from eva_presence import EvaPresenceSystem, PresenceState

        system = EvaPresenceSystem()
        system.user_started_speaking()

        assert system.user_speaking is True
        assert system.state == PresenceState.LISTENING
        assert system.user_speech_duration == 0

    def test_user_stopped_speaking(self):
        """Test user stopped speaking."""
        from eva_presence import EvaPresenceSystem, PresenceState

        system = EvaPresenceSystem()
        system.user_started_speaking()
        system.user_stopped_speaking(duration=5.0)

        assert system.user_speaking is False
        assert system.state == PresenceState.THINKING
        assert system.user_speech_duration == 5.0

    def test_eva_started_speaking(self):
        """Test Eva started speaking."""
        from eva_presence import EvaPresenceSystem, PresenceState

        system = EvaPresenceSystem()
        system.eva_started_speaking()

        assert system.state == PresenceState.SPEAKING

    def test_eva_stopped_speaking(self):
        """Test Eva stopped speaking."""
        from eva_presence import EvaPresenceSystem, PresenceState

        system = EvaPresenceSystem()
        system.eva_started_speaking()
        system.eva_stopped_speaking()

        assert system.state == PresenceState.IDLE


class TestBackchanneling:
    """Tests for backchannel functionality."""

    def test_should_backchannel_not_speaking(self):
        """Test no backchannel when user not speaking."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem()
        result = system.should_backchannel("neutral")

        assert result is None

    def test_should_backchannel_short_speech(self):
        """Test no backchannel for short speech."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem()
        system.user_started_speaking()
        system.user_speech_duration = 1.0  # Less than 2.0

        result = system.should_backchannel("neutral")

        assert result is None

    def test_should_backchannel_cooldown(self):
        """Test backchannel cooldown."""
        from eva_presence import EvaPresenceSystem
        import time

        system = EvaPresenceSystem()
        system.user_started_speaking()
        system.user_speech_duration = 5.0
        system.last_backchannel_time = time.time()  # Just happened

        result = system.should_backchannel("neutral")

        assert result is None

    def test_backchannel_configs_exist(self):
        """Test all backchannel configs are defined."""
        from eva_presence import EvaPresenceSystem, BackchannelType

        for bc_type in BackchannelType:
            assert bc_type in EvaPresenceSystem.BACKCHANNELS
            config = EvaPresenceSystem.BACKCHANNELS[bc_type]
            assert len(config.sounds) > 0


class TestSilenceAnalysis:
    """Tests for silence analysis."""

    def test_analyze_silence_neutral(self):
        """Test silence analysis with neutral emotion."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem()
        system.current_silence_start = time.time() - 0.5

        context = system.analyze_silence("neutral")

        assert context.after_emotion == "neutral"
        assert context.duration >= 0.5

    def test_analyze_silence_sad(self):
        """Test silence analysis with sadness."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem()
        system.current_silence_start = time.time() - 1.0

        context = system.analyze_silence("sadness")

        assert context.after_emotion == "sad"
        assert context.is_comfortable is True  # Less than 3.0s threshold

    def test_analyze_silence_long(self):
        """Test silence analysis for long silence."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem()
        system.current_silence_start = time.time() - 5.0

        context = system.analyze_silence("neutral")

        assert context.recommended_action == "speak"
        assert context.is_comfortable is False

    def test_analyze_silence_very_short(self):
        """Test silence analysis for very short silence."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem()
        system.current_silence_start = time.time() - 0.3

        context = system.analyze_silence("neutral")

        assert context.recommended_action == "wait"


class TestPresenceSound:
    """Tests for presence sounds."""

    def test_get_presence_sound_empathic_silence(self):
        """Test presence sound during empathic silence."""
        from eva_presence import EvaPresenceSystem, PresenceState

        system = EvaPresenceSystem()
        system.set_state(PresenceState.EMPATHIC_SILENCE)

        sound = system.get_presence_sound()

        assert sound is not None
        assert sound["type"] == "presence"
        assert sound["audible"] is True

    def test_get_presence_sound_listening(self):
        """Test presence sound during listening."""
        from eva_presence import EvaPresenceSystem, PresenceState

        system = EvaPresenceSystem()
        system.set_state(PresenceState.LISTENING)

        sound = system.get_presence_sound()

        assert sound is not None
        assert sound["type"] == "breathing"
        assert "rate" in sound

    def test_get_presence_sound_speaking(self):
        """Test no audible presence sound during speaking."""
        from eva_presence import EvaPresenceSystem, PresenceState

        system = EvaPresenceSystem()
        system.set_state(PresenceState.SPEAKING)

        sound = system.get_presence_sound()

        # Speaking has audible=False, so no sound
        assert sound is None


class TestShouldStaySilent:
    """Tests for should_stay_silent function."""

    def test_should_stay_silent_grief(self):
        """Test stay silent during grief."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem()
        should_stay, reason = system.should_stay_silent("grief")

        assert should_stay is True
        assert reason == "emotional_support"

    def test_should_stay_silent_crying(self):
        """Test stay silent during crying."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem()
        should_stay, reason = system.should_stay_silent("crying")

        assert should_stay is True
        assert reason == "emotional_support"

    def test_should_not_stay_silent_neutral(self):
        """Test not staying silent for neutral emotion with long silence."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem()
        system.current_silence_start = time.time() - 2.0

        should_stay, reason = system.should_stay_silent("neutral")

        assert should_stay is False
        assert reason == "ready_to_speak"


class TestResponseDelay:
    """Tests for response delay calculation."""

    def test_response_delay_neutral(self):
        """Test response delay for neutral emotion."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem()
        delay = system.get_response_delay("neutral")

        assert delay >= 0.3
        assert delay <= 2.0

    def test_response_delay_sadness(self):
        """Test response delay for sadness (longer pause)."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem()
        delay = system.get_response_delay("sadness")

        assert delay >= 1.1  # 0.3 + 0.8

    def test_response_delay_joy(self):
        """Test response delay for joy (quicker response)."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem()
        delay = system.get_response_delay("joy")

        assert delay >= 0.5  # 0.3 + 0.2

    def test_response_delay_long_speech(self):
        """Test response delay for long user speech."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem()
        system.user_speech_duration = 15.0
        delay = system.get_response_delay("neutral")

        assert delay >= 0.8  # 0.3 + 0.5 for long speech

    def test_response_delay_capped(self):
        """Test response delay is capped at 2 seconds."""
        from eva_presence import EvaPresenceSystem

        system = EvaPresenceSystem()
        system.user_speech_duration = 20.0
        delay = system.get_response_delay("sadness")

        assert delay <= 2.0


class TestTurnTakingCue:
    """Tests for turn-taking cue."""

    def test_get_turn_taking_cue(self):
        """Test getting turn-taking cue."""
        from eva_presence import EvaPresenceSystem, PresenceState

        system = EvaPresenceSystem()
        system.set_state(PresenceState.LISTENING)
        system.user_speaking = True

        cue = system.get_turn_taking_cue()

        assert cue["state"] == "listening"
        assert cue["user_speaking"] is True
        assert cue["attention_level"] == 0.9

    def test_get_turn_taking_cue_idle(self):
        """Test turn-taking cue in idle state."""
        from eva_presence import EvaPresenceSystem, PresenceState

        system = EvaPresenceSystem()
        system.set_state(PresenceState.IDLE)

        cue = system.get_turn_taking_cue()

        assert cue["state"] == "idle"
        assert cue["attention_level"] == 0.5


class TestInterruptDetector:
    """Tests for InterruptDetector class."""

    def test_init(self):
        """Test InterruptDetector initialization."""
        from eva_presence import InterruptDetector

        detector = InterruptDetector()

        assert detector.energy_threshold == 0.1
        assert detector.min_duration == 0.3
        assert detector.is_interrupted is False

    def test_init_custom_threshold(self):
        """Test InterruptDetector with custom threshold."""
        from eva_presence import InterruptDetector

        detector = InterruptDetector(energy_threshold=0.2, min_duration=0.5)

        assert detector.energy_threshold == 0.2
        assert detector.min_duration == 0.5

    def test_process_audio_chunk_empty(self):
        """Test processing empty audio chunk."""
        from eva_presence import InterruptDetector

        detector = InterruptDetector()
        result = detector.process_audio_chunk(np.array([]))

        assert result is False

    def test_process_audio_chunk_quiet(self):
        """Test processing quiet audio chunk."""
        from eva_presence import InterruptDetector

        detector = InterruptDetector()
        quiet_audio = np.random.uniform(-0.01, 0.01, 1600)
        result = detector.process_audio_chunk(quiet_audio)

        assert result is False

    def test_process_audio_chunk_loud(self):
        """Test processing loud audio chunk (potential interrupt)."""
        from eva_presence import InterruptDetector

        detector = InterruptDetector(energy_threshold=0.05, min_duration=0.0)
        loud_audio = np.random.uniform(-0.5, 0.5, 1600)

        # First chunk starts the timer
        result1 = detector.process_audio_chunk(loud_audio)
        # Second chunk (if duration met) triggers interrupt
        result2 = detector.process_audio_chunk(loud_audio)

        # With min_duration=0.0, should trigger on second call
        assert result2 is True

    def test_reset(self):
        """Test resetting interrupt detector."""
        from eva_presence import InterruptDetector

        detector = InterruptDetector()
        detector.is_interrupted = True
        detector.interrupt_start = time.time()

        detector.reset()

        assert detector.is_interrupted is False
        assert detector.interrupt_start is None


class TestGlobalFunctions:
    """Tests for global helper functions."""

    def test_init_presence_system(self):
        """Test initializing presence system."""
        from eva_presence import init_presence_system, eva_presence

        system = init_presence_system()

        assert system is not None
        assert system.sample_rate == 16000

    def test_get_presence_system(self):
        """Test getting presence system."""
        from eva_presence import init_presence_system, get_presence_system

        init_presence_system()
        system = get_presence_system()

        assert system is not None

    def test_should_backchannel_global(self):
        """Test global should_backchannel function."""
        from eva_presence import should_backchannel, init_presence_system

        init_presence_system()
        result = should_backchannel("neutral")

        # User not speaking, should return None
        assert result is None

    def test_analyze_silence_global(self):
        """Test global analyze_silence function."""
        from eva_presence import analyze_silence, init_presence_system

        init_presence_system()
        result = analyze_silence("neutral")

        assert "duration" in result
        assert "after_emotion" in result
        assert "is_comfortable" in result
        assert "recommended_action" in result

    def test_get_response_delay_global(self):
        """Test global get_response_delay function."""
        from eva_presence import get_response_delay, init_presence_system

        init_presence_system()
        delay = get_response_delay("neutral")

        assert delay >= 0.3
        assert delay <= 2.0

    def test_check_interrupt_global(self):
        """Test global check_interrupt function."""
        from eva_presence import check_interrupt

        quiet_audio = np.random.uniform(-0.01, 0.01, 1600)
        result = check_interrupt(quiet_audio)

        assert result is False


class TestBreathingPatterns:
    """Tests for breathing patterns configuration."""

    def test_breathing_patterns_defined(self):
        """Test all states have breathing patterns."""
        from eva_presence import EvaPresenceSystem, PresenceState

        for state in PresenceState:
            assert state in EvaPresenceSystem.BREATHING_PATTERNS
            pattern = EvaPresenceSystem.BREATHING_PATTERNS[state]
            assert "rate" in pattern
            assert "depth" in pattern
            assert "audible" in pattern

    def test_breathing_rates_valid(self):
        """Test breathing rates are in valid range."""
        from eva_presence import EvaPresenceSystem

        for pattern in EvaPresenceSystem.BREATHING_PATTERNS.values():
            assert 0 < pattern["rate"] <= 1.0
            assert 0 < pattern["depth"] <= 1.0


class TestSilenceThresholds:
    """Tests for silence thresholds configuration."""

    def test_silence_thresholds_defined(self):
        """Test silence thresholds are defined."""
        from eva_presence import EvaPresenceSystem

        expected_keys = ["neutral", "emotional", "sad", "thinking", "question"]

        for key in expected_keys:
            assert key in EvaPresenceSystem.SILENCE_THRESHOLDS
            assert EvaPresenceSystem.SILENCE_THRESHOLDS[key] > 0
