"""
Tests for eva_micro_expressions.py - Sprint 532
Testing micro-expression generation for avatar UX latency
"""

import pytest
import time
from unittest.mock import patch

from eva_micro_expressions import (
    BlinkingSystem,
    GazeSystem,
    MicroSmileSystem,
    BreathingVisualization,
    IdleBehaviors,
    ListeningBehaviors,
    EvaMicroExpressionEngine,
    BlinkType,
    GazeDirection,
    MicroExpression,
    init_micro_expressions,
    get_micro_expression_frame,
    get_text_expressions,
    set_emotion,
    set_speaking,
)


class TestBlinkingSystem:
    """Tests for BlinkingSystem class"""

    def test_init_default_state(self):
        """Test BlinkingSystem initializes with neutral state"""
        system = BlinkingSystem()
        assert system.current_state == "neutral"
        assert system._cached_pattern == system.BLINK_PATTERNS["neutral"]

    def test_set_state_valid(self):
        """Test setting valid blink states"""
        system = BlinkingSystem()

        for state in ["neutral", "attentive", "thinking", "excited", "sad", "surprised"]:
            system.set_state(state)
            assert system.current_state == state
            assert system._cached_pattern == system.BLINK_PATTERNS[state]

    def test_set_state_invalid(self):
        """Test setting invalid state keeps current state"""
        system = BlinkingSystem()
        system.set_state("invalid_state")
        assert system.current_state == "neutral"

    def test_generate_blink_before_time(self):
        """Test that blink is not generated before scheduled time"""
        system = BlinkingSystem()
        # Set next blink far in future
        system.next_blink_time = time.time() + 100
        result = system.generate_blink()
        assert result is None

    def test_generate_blink_after_time(self):
        """Test that blink is generated after scheduled time"""
        system = BlinkingSystem()
        # Set next blink in past
        system.next_blink_time = time.time() - 1
        result = system.generate_blink()
        assert result is not None
        assert len(result) >= 1
        assert result[0].type == "blink"
        assert result[0].target == "eyelids"

    def test_generate_double_blink(self):
        """Test double blink generates multiple expressions"""
        system = BlinkingSystem()
        system.set_state("excited")  # State that can produce double blinks
        system.next_blink_time = time.time() - 1

        # Mock random to force double blink
        with patch('eva_micro_expressions.random.choice', return_value=BlinkType.DOUBLE):
            result = system.generate_blink()
            assert result is not None
            assert len(result) == 3  # Two blinks + pause

    def test_blink_reschedules(self):
        """Test that generating a blink reschedules next blink"""
        system = BlinkingSystem()
        system.next_blink_time = time.time() - 1
        old_time = system.next_blink_time
        system.generate_blink()
        assert system.next_blink_time > old_time


class TestGazeSystem:
    """Tests for GazeSystem class"""

    def test_init_default_gaze(self):
        """Test GazeSystem initializes with center gaze"""
        system = GazeSystem()
        assert system.current_gaze == GazeDirection.CENTER
        assert system.target_position == (0.0, 0.0)

    def test_generate_micro_saccade(self):
        """Test micro saccade generation"""
        system = GazeSystem()
        result = system.generate_micro_saccade()
        assert isinstance(result, MicroExpression)
        assert result.type == "gaze_micro"
        assert result.target == "eyes"
        assert result.duration == 0.05

    def test_generate_gaze_shift_default(self):
        """Test gaze shift with default context"""
        system = GazeSystem()
        result = system.generate_gaze_shift()
        assert len(result) == 2  # x and y
        assert result[0].type == "gaze_x"
        assert result[1].type == "gaze_y"

    def test_generate_gaze_shift_thinking(self):
        """Test gaze shift in thinking context"""
        system = GazeSystem()
        with patch('eva_micro_expressions.random.choice', return_value=GazeDirection.UP_LEFT):
            result = system.generate_gaze_shift("thinking")
            assert system.current_gaze == GazeDirection.UP_LEFT

    def test_generate_gaze_shift_listening(self):
        """Test gaze shift in listening context"""
        system = GazeSystem()
        with patch('eva_micro_expressions.random.choice', return_value=GazeDirection.CENTER):
            result = system.generate_gaze_shift("listening")
            assert system.current_gaze == GazeDirection.CENTER

    def test_gaze_coords_precomputed(self):
        """Test that gaze coordinates are pre-computed at class level"""
        assert GazeSystem.GAZE_COORDS[GazeDirection.CENTER] == (0.0, 0.0)
        assert GazeSystem.GAZE_COORDS[GazeDirection.UP_LEFT] == (-0.15, 0.1)


class TestMicroSmileSystem:
    """Tests for MicroSmileSystem class"""

    def test_generate_subtle_smile(self):
        """Test generating subtle smile"""
        system = MicroSmileSystem()
        result = system.generate_micro_smile("subtle")
        assert len(result) >= 2  # left and right smile
        assert result[0].type == "smile_left"
        assert result[1].type == "smile_right"

    def test_generate_warm_smile_includes_squint(self):
        """Test warm smile includes eye squint"""
        system = MicroSmileSystem()
        result = system.generate_micro_smile("warm")
        # Warm smile intensity > 0.2, should include squint
        types = [e.type for e in result]
        assert "eye_squint" in types

    def test_smile_asymmetry(self):
        """Test smile has asymmetry"""
        system = MicroSmileSystem()
        result = system.generate_micro_smile("knowing")
        left = next(e for e in result if e.type == "smile_left")
        right = next(e for e in result if e.type == "smile_right")
        # Intensities should be different due to asymmetry
        assert abs(left.value - right.value) > 0

    def test_invalid_smile_type_defaults(self):
        """Test invalid smile type defaults to subtle"""
        system = MicroSmileSystem()
        result = system.generate_micro_smile("invalid_type")
        assert len(result) >= 2


class TestBreathingVisualization:
    """Tests for BreathingVisualization class"""

    def test_init_default_pattern(self):
        """Test initialization with default pattern"""
        system = BreathingVisualization()
        assert system.pattern == "normal"
        assert system.phase == 0.0

    def test_generate_breath_frame(self):
        """Test breath frame generation"""
        system = BreathingVisualization()
        result = system.generate_breath_frame(0.1)
        assert len(result) == 2  # chest and shoulders
        assert result[0].type == "breath_chest"
        assert result[1].type == "breath_shoulders"

    def test_phase_advances(self):
        """Test that phase advances with delta time"""
        system = BreathingVisualization()
        system.generate_breath_frame(1.0)
        assert system.phase > 0

    def test_phase_wraps(self):
        """Test that phase wraps around at 1.0"""
        system = BreathingVisualization()
        system.phase = 0.9
        system.generate_breath_frame(0.5)  # Should push past 1.0
        assert system.phase < 1.0


class TestIdleBehaviors:
    """Tests for IdleBehaviors class"""

    def test_init_cooldowns(self):
        """Test that cooldowns are initialized for all behaviors"""
        system = IdleBehaviors()
        for behavior in system.BEHAVIORS:
            assert behavior["name"] in system.last_behavior_time

    def test_generate_idle_behavior_cooldown(self):
        """Test cooldown prevents behavior generation"""
        system = IdleBehaviors()
        now = time.time()
        # Set all cooldowns to now
        for name in system.last_behavior_time:
            system.last_behavior_time[name] = now
        result = system.generate_idle_behavior(now + 1)  # Only 1 second later
        assert result is None  # All on cooldown

    def test_create_behavior_head_tilt(self):
        """Test head tilt behavior creation"""
        system = IdleBehaviors()
        result = system._create_behavior("head_tilt_slight", 2.0)
        assert len(result) == 1
        assert result[0].type == "head_tilt"
        assert result[0].target == "head"

    def test_create_behavior_lip_press(self):
        """Test lip press behavior creation"""
        system = IdleBehaviors()
        result = system._create_behavior("lip_press", 0.5)
        assert result[0].type == "lip_press"

    def test_create_behavior_swallow(self):
        """Test swallow behavior creates two expressions"""
        system = IdleBehaviors()
        result = system._create_behavior("swallow", 0.4)
        assert len(result) == 2


class TestListeningBehaviors:
    """Tests for ListeningBehaviors class"""

    def test_init_not_listening(self):
        """Test initialization in non-listening state"""
        system = ListeningBehaviors()
        assert system.is_listening is False
        assert system.engagement_level == 0.5

    def test_set_listening(self):
        """Test setting listening state"""
        system = ListeningBehaviors()
        system.set_listening(True, 0.8)
        assert system.is_listening is True
        assert system.engagement_level == 0.8

    def test_engagement_clamped(self):
        """Test engagement level is clamped to 0-1"""
        system = ListeningBehaviors()
        system.set_listening(True, 1.5)
        assert system.engagement_level == 1.0
        system.set_listening(True, -0.5)
        assert system.engagement_level == 0.0

    def test_no_behavior_when_not_listening(self):
        """Test no behavior generated when not listening"""
        system = ListeningBehaviors()
        result = system.generate_listening_behavior()
        assert result is None


class TestEvaMicroExpressionEngine:
    """Tests for EvaMicroExpressionEngine class"""

    def test_init(self):
        """Test engine initialization"""
        engine = EvaMicroExpressionEngine()
        assert engine.current_emotion == "neutral"
        assert engine.is_speaking is False

    def test_set_emotion(self):
        """Test setting emotion updates subsystems"""
        engine = EvaMicroExpressionEngine()
        engine.set_emotion("joy")
        assert engine.current_emotion == "joy"
        assert engine.blinking.current_state == "excited"

    def test_set_speaking(self):
        """Test setting speaking state"""
        engine = EvaMicroExpressionEngine()
        engine.set_speaking(True)
        assert engine.is_speaking is True
        assert engine.listening.is_listening is False

    def test_generate_frame(self):
        """Test frame generation"""
        engine = EvaMicroExpressionEngine()
        frame = engine.generate_frame()
        assert "timestamp" in frame
        assert "expressions" in frame
        assert isinstance(frame["expressions"], list)

    def test_generate_frame_includes_breathing(self):
        """Test frame always includes breathing"""
        engine = EvaMicroExpressionEngine()
        frame = engine.generate_frame()
        types = [e["type"] for e in frame["expressions"]]
        assert "breath_chest" in types
        assert "breath_shoulders" in types

    def test_generate_expression_for_text_smile(self):
        """Test text expression for joyful content"""
        engine = EvaMicroExpressionEngine()
        result = engine.generate_expression_for_text("haha c'est super!")
        types = [e["type"] for e in result["expressions"]]
        assert "smile_left" in types or "smile_right" in types

    def test_generate_expression_for_text_surprise(self):
        """Test text expression for question"""
        engine = EvaMicroExpressionEngine()
        result = engine.generate_expression_for_text("quoi?")
        types = [e["type"] for e in result["expressions"]]
        assert "brows_raise" in types

    def test_frozenset_optimizations(self):
        """Test that frozensets are used for O(1) lookups"""
        assert isinstance(EvaMicroExpressionEngine.SMILE_WORDS, frozenset)
        assert isinstance(EvaMicroExpressionEngine.SURPRISE_WORDS, frozenset)
        assert isinstance(EvaMicroExpressionEngine.THINKING_WORDS, frozenset)


class TestModuleFunctions:
    """Tests for module-level utility functions"""

    def test_init_micro_expressions(self, capsys):
        """Test initialization function"""
        result = init_micro_expressions()
        assert result is True
        captured = capsys.readouterr()
        assert "Micro-expression engine ready" in captured.out

    def test_get_micro_expression_frame(self):
        """Test getting a frame from global engine"""
        frame = get_micro_expression_frame()
        assert "timestamp" in frame
        assert "expressions" in frame

    def test_get_text_expressions(self):
        """Test getting text-based expressions"""
        result = get_text_expressions("Bonjour!")
        assert "text_based" in result
        assert result["text_based"] is True

    def test_set_emotion_global(self):
        """Test setting emotion on global engine"""
        set_emotion("sadness")
        # Verify by generating a frame
        from eva_micro_expressions import micro_expression_engine
        assert micro_expression_engine.current_emotion == "sadness"

    def test_set_speaking_global(self):
        """Test setting speaking state on global engine"""
        set_speaking(True)
        from eva_micro_expressions import micro_expression_engine
        assert micro_expression_engine.is_speaking is True
        set_speaking(False)
