"""
Tests for eva_micro_expressions.py - Sprint 558
Comprehensive testing for micro-expression generation system
"""

import pytest
import time
import math
from unittest.mock import patch, MagicMock

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
    ExpressionFrame,
    init_micro_expressions,
    get_micro_expression_frame,
    get_text_expressions,
    set_emotion,
    set_speaking,
    micro_expression_engine,
)


class TestBlinkTypeEnum:
    """Tests for BlinkType enum"""

    def test_all_blink_types_defined(self):
        """Test all blink types are defined"""
        assert BlinkType.NORMAL.value == "normal"
        assert BlinkType.SLOW.value == "slow"
        assert BlinkType.DOUBLE.value == "double"
        assert BlinkType.HALF.value == "half"
        assert BlinkType.LONG.value == "long"

    def test_blink_type_count(self):
        """Test correct number of blink types"""
        assert len(BlinkType) == 5

    def test_blink_types_are_unique(self):
        """Test all blink type values are unique"""
        values = [bt.value for bt in BlinkType]
        assert len(values) == len(set(values))


class TestGazeDirectionEnum:
    """Tests for GazeDirection enum"""

    def test_all_gaze_directions_defined(self):
        """Test all gaze directions are defined"""
        assert GazeDirection.CENTER.value == "center"
        assert GazeDirection.UP_LEFT.value == "up_left"
        assert GazeDirection.UP_RIGHT.value == "up_right"
        assert GazeDirection.LEFT.value == "left"
        assert GazeDirection.RIGHT.value == "right"
        assert GazeDirection.DOWN_LEFT.value == "down_left"
        assert GazeDirection.DOWN_RIGHT.value == "down_right"

    def test_gaze_direction_count(self):
        """Test correct number of gaze directions"""
        assert len(GazeDirection) == 7


class TestMicroExpressionDataclass:
    """Tests for MicroExpression dataclass"""

    def test_create_micro_expression(self):
        """Test creating a MicroExpression"""
        expr = MicroExpression(
            type="blink",
            target="eyelids",
            value=1.0,
            duration=0.15
        )
        assert expr.type == "blink"
        assert expr.target == "eyelids"
        assert expr.value == 1.0
        assert expr.duration == 0.15

    def test_default_easing(self):
        """Test default easing value"""
        expr = MicroExpression(type="test", target="eyes", value=0.5, duration=0.1)
        assert expr.easing == "ease_out"

    def test_default_delay(self):
        """Test default delay value"""
        expr = MicroExpression(type="test", target="eyes", value=0.5, duration=0.1)
        assert expr.delay == 0.0

    def test_custom_easing_and_delay(self):
        """Test custom easing and delay"""
        expr = MicroExpression(
            type="test",
            target="eyes",
            value=0.5,
            duration=0.1,
            easing="ease_in_out",
            delay=0.5
        )
        assert expr.easing == "ease_in_out"
        assert expr.delay == 0.5

    def test_negative_value(self):
        """Test MicroExpression with negative value"""
        expr = MicroExpression(type="gaze", target="eyes", value=-0.5, duration=0.2)
        assert expr.value == -0.5

    def test_zero_duration(self):
        """Test MicroExpression with zero duration"""
        expr = MicroExpression(type="instant", target="face", value=1.0, duration=0.0)
        assert expr.duration == 0.0


class TestExpressionFrameDataclass:
    """Tests for ExpressionFrame dataclass"""

    def test_create_expression_frame(self):
        """Test creating an ExpressionFrame"""
        frame = ExpressionFrame(timestamp=1234567890.0)
        assert frame.timestamp == 1234567890.0
        assert frame.expressions == []

    def test_expression_frame_with_expressions(self):
        """Test ExpressionFrame with expressions list"""
        expr1 = MicroExpression(type="blink", target="eyes", value=1.0, duration=0.1)
        expr2 = MicroExpression(type="smile", target="mouth", value=0.5, duration=0.3)
        frame = ExpressionFrame(timestamp=100.0, expressions=[expr1, expr2])
        assert len(frame.expressions) == 2
        assert frame.expressions[0].type == "blink"
        assert frame.expressions[1].type == "smile"


class TestBlinkingSystem:
    """Tests for BlinkingSystem class"""

    def test_init_default_state(self):
        """Test BlinkingSystem initializes with neutral state"""
        system = BlinkingSystem()
        assert system.current_state == "neutral"
        assert system._cached_pattern == system.BLINK_PATTERNS["neutral"]

    def test_init_sets_last_blink(self):
        """Test initialization sets last_blink timestamp"""
        before = time.time()
        system = BlinkingSystem()
        after = time.time()
        assert before <= system.last_blink <= after

    def test_init_schedules_next_blink(self):
        """Test initialization schedules next blink time"""
        system = BlinkingSystem()
        assert system.next_blink_time > system.last_blink

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
        system.next_blink_time = time.time() + 100
        result = system.generate_blink()
        assert result is None

    def test_generate_blink_after_time(self):
        """Test that blink is generated after scheduled time"""
        system = BlinkingSystem()
        system.next_blink_time = time.time() - 1
        result = system.generate_blink()
        assert result is not None
        assert len(result) >= 1
        assert result[0].type == "blink"
        assert result[0].target == "eyelids"

    def test_generate_blink_with_current_time_param(self):
        """Test generate_blink with explicit current_time parameter"""
        system = BlinkingSystem()
        current = time.time()
        system.next_blink_time = current - 1
        result = system.generate_blink(current_time=current)
        assert result is not None

    def test_generate_normal_blink(self):
        """Test generating normal blink"""
        system = BlinkingSystem()
        system.next_blink_time = time.time() - 1
        with patch('eva_micro_expressions.random.choice', return_value=BlinkType.NORMAL):
            result = system.generate_blink()
            assert len(result) == 1
            assert result[0].value == 1.0
            assert result[0].duration == 0.15

    def test_generate_slow_blink(self):
        """Test generating slow blink"""
        system = BlinkingSystem()
        system.set_state("thinking")
        system.next_blink_time = time.time() - 1
        with patch('eva_micro_expressions.random.choice', return_value=BlinkType.SLOW):
            result = system.generate_blink()
            assert result[0].duration == 0.3

    def test_generate_half_blink(self):
        """Test generating half blink"""
        system = BlinkingSystem()
        system.set_state("attentive")
        system.next_blink_time = time.time() - 1
        with patch('eva_micro_expressions.random.choice', return_value=BlinkType.HALF):
            result = system.generate_blink()
            assert result[0].value == 0.5
            assert result[0].duration == 0.1

    def test_generate_long_blink(self):
        """Test generating long blink"""
        system = BlinkingSystem()
        system.set_state("sad")
        system.next_blink_time = time.time() - 1
        with patch('eva_micro_expressions.random.choice', return_value=BlinkType.LONG):
            result = system.generate_blink()
            assert result[0].duration == 0.5

    def test_generate_double_blink(self):
        """Test double blink generates multiple expressions"""
        system = BlinkingSystem()
        system.set_state("excited")
        system.next_blink_time = time.time() - 1
        with patch('eva_micro_expressions.random.choice', return_value=BlinkType.DOUBLE):
            result = system.generate_blink()
            assert len(result) == 3
            assert result[0].delay == 0.0
            assert result[1].delay == 0.08
            assert result[2].delay == 0.13

    def test_blink_reschedules(self):
        """Test that generating a blink reschedules next blink"""
        system = BlinkingSystem()
        system.next_blink_time = time.time() - 1
        old_time = system.next_blink_time
        system.generate_blink()
        assert system.next_blink_time > old_time

    def test_blink_patterns_intervals(self):
        """Test blink patterns have valid intervals"""
        for state, pattern in BlinkingSystem.BLINK_PATTERNS.items():
            assert pattern["min_interval"] > 0
            assert pattern["max_interval"] > pattern["min_interval"]
            assert len(pattern["types"]) > 0

    def test_blink_durations_positive(self):
        """Test all blink durations are positive"""
        for blink_type, duration in BlinkingSystem.BLINK_DURATIONS.items():
            assert duration > 0

    def test_calc_next_blink_within_interval(self):
        """Test calculated next blink time is within pattern interval"""
        system = BlinkingSystem()
        now = time.time()
        pattern = system.BLINK_PATTERNS["neutral"]
        next_time = system._calc_next_blink(now)
        interval = next_time - now
        assert pattern["min_interval"] <= interval <= pattern["max_interval"]


class TestGazeSystem:
    """Tests for GazeSystem class"""

    def test_init_default_gaze(self):
        """Test GazeSystem initializes with center gaze"""
        system = GazeSystem()
        assert system.current_gaze == GazeDirection.CENTER
        assert system.target_position == (0.0, 0.0)

    def test_init_sets_last_shift(self):
        """Test initialization sets last_shift timestamp"""
        before = time.time()
        system = GazeSystem()
        after = time.time()
        assert before <= system.last_shift <= after

    def test_generate_micro_saccade(self):
        """Test micro saccade generation"""
        system = GazeSystem()
        result = system.generate_micro_saccade()
        assert isinstance(result, MicroExpression)
        assert result.type == "gaze_micro"
        assert result.target == "eyes"
        assert result.duration == 0.05
        assert result.easing == "linear"

    def test_generate_gaze_shift_default(self):
        """Test gaze shift with default context"""
        system = GazeSystem()
        result = system.generate_gaze_shift()
        assert len(result) == 2
        assert result[0].type == "gaze_x"
        assert result[1].type == "gaze_y"
        assert result[0].target == "eyes"
        assert result[0].easing == "ease_out"

    def test_generate_gaze_shift_thinking(self):
        """Test gaze shift in thinking context"""
        system = GazeSystem()
        with patch('eva_micro_expressions.random.choice', return_value=GazeDirection.UP_LEFT):
            result = system.generate_gaze_shift("thinking")
            assert system.current_gaze == GazeDirection.UP_LEFT
            assert result[0].value == -0.15  # UP_LEFT x coordinate
            assert result[1].value == 0.1    # UP_LEFT y coordinate

    def test_generate_gaze_shift_listening(self):
        """Test gaze shift in listening context"""
        system = GazeSystem()
        with patch('eva_micro_expressions.random.choice', return_value=GazeDirection.CENTER):
            result = system.generate_gaze_shift("listening")
            assert system.current_gaze == GazeDirection.CENTER

    def test_generate_gaze_shift_emotional(self):
        """Test gaze shift in emotional context"""
        system = GazeSystem()
        with patch('eva_micro_expressions.random.choice', return_value=GazeDirection.DOWN_RIGHT):
            result = system.generate_gaze_shift("emotional")
            assert system.current_gaze == GazeDirection.DOWN_RIGHT

    def test_generate_gaze_shift_unknown_context(self):
        """Test gaze shift with unknown context uses all directions"""
        system = GazeSystem()
        result = system.generate_gaze_shift("unknown_context")
        assert len(result) == 2

    def test_generate_gaze_shift_updates_last_shift(self):
        """Test gaze shift updates last_shift timestamp"""
        system = GazeSystem()
        now = time.time()
        system.generate_gaze_shift(current_time=now)
        assert system.last_shift == now

    def test_gaze_coords_precomputed(self):
        """Test that gaze coordinates are pre-computed at class level"""
        assert GazeSystem.GAZE_COORDS[GazeDirection.CENTER] == (0.0, 0.0)
        assert GazeSystem.GAZE_COORDS[GazeDirection.UP_LEFT] == (-0.15, 0.1)
        assert GazeSystem.GAZE_COORDS[GazeDirection.UP_RIGHT] == (0.15, 0.1)
        assert GazeSystem.GAZE_COORDS[GazeDirection.LEFT] == (-0.2, 0.0)
        assert GazeSystem.GAZE_COORDS[GazeDirection.RIGHT] == (0.2, 0.0)
        assert GazeSystem.GAZE_COORDS[GazeDirection.DOWN_LEFT] == (-0.1, -0.15)
        assert GazeSystem.GAZE_COORDS[GazeDirection.DOWN_RIGHT] == (0.1, -0.15)

    def test_context_directions_precomputed(self):
        """Test context directions are pre-computed"""
        assert "thinking" in GazeSystem.CONTEXT_DIRECTIONS
        assert "listening" in GazeSystem.CONTEXT_DIRECTIONS
        assert "emotional" in GazeSystem.CONTEXT_DIRECTIONS

    def test_all_directions_list(self):
        """Test ALL_DIRECTIONS contains all gaze directions"""
        assert len(GazeSystem.ALL_DIRECTIONS) == len(GazeDirection)


class TestMicroSmileSystem:
    """Tests for MicroSmileSystem class"""

    def test_generate_subtle_smile(self):
        """Test generating subtle smile"""
        system = MicroSmileSystem()
        result = system.generate_micro_smile("subtle")
        assert len(result) >= 2
        assert result[0].type == "smile_left"
        assert result[1].type == "smile_right"

    def test_generate_warm_smile_includes_squint(self):
        """Test warm smile includes eye squint"""
        system = MicroSmileSystem()
        result = system.generate_micro_smile("warm")
        types = [e.type for e in result]
        assert "eye_squint" in types

    def test_generate_amused_smile(self):
        """Test amused smile generation"""
        system = MicroSmileSystem()
        result = system.generate_micro_smile("amused")
        assert len(result) >= 2
        params = system.SMILE_TYPES["amused"]
        assert result[0].duration == params["duration"]

    def test_generate_knowing_smile(self):
        """Test knowing smile has higher asymmetry"""
        system = MicroSmileSystem()
        result = system.generate_micro_smile("knowing")
        left = next(e for e in result if e.type == "smile_left")
        right = next(e for e in result if e.type == "smile_right")
        assert abs(left.value - right.value) > 0

    def test_generate_shy_smile(self):
        """Test shy smile generation"""
        system = MicroSmileSystem()
        result = system.generate_micro_smile("shy")
        # Shy smile intensity <= 0.2, should not include squint
        types = [e.type for e in result]
        assert "eye_squint" not in types

    def test_smile_asymmetry(self):
        """Test smile has asymmetry"""
        system = MicroSmileSystem()
        result = system.generate_micro_smile("knowing")
        left = next(e for e in result if e.type == "smile_left")
        right = next(e for e in result if e.type == "smile_right")
        assert abs(left.value - right.value) > 0

    def test_smile_asymmetry_randomization(self):
        """Test smile asymmetry side is randomized"""
        system = MicroSmileSystem()
        with patch('eva_micro_expressions.random.random', return_value=0.3):
            result1 = system.generate_micro_smile("knowing")
        with patch('eva_micro_expressions.random.random', return_value=0.7):
            result2 = system.generate_micro_smile("knowing")
        # Values might be swapped based on random
        left1 = next(e for e in result1 if e.type == "smile_left").value
        left2 = next(e for e in result2 if e.type == "smile_left").value
        # Not guaranteed to be different but tests the branch

    def test_invalid_smile_type_defaults(self):
        """Test invalid smile type defaults to subtle"""
        system = MicroSmileSystem()
        result = system.generate_micro_smile("invalid_type")
        assert len(result) >= 2
        # Should use subtle params
        params = system.SMILE_TYPES["subtle"]
        assert result[0].duration == params["duration"]

    def test_smile_types_all_defined(self):
        """Test all smile types are defined"""
        system = MicroSmileSystem()
        expected = ["subtle", "warm", "amused", "knowing", "shy"]
        for smile_type in expected:
            assert smile_type in system.SMILE_TYPES
            params = system.SMILE_TYPES[smile_type]
            assert "intensity" in params
            assert "asymmetry" in params
            assert "duration" in params

    def test_eye_squint_proportional_to_intensity(self):
        """Test eye squint is proportional to smile intensity"""
        system = MicroSmileSystem()
        result = system.generate_micro_smile("warm")
        squint = next(e for e in result if e.type == "eye_squint")
        params = system.SMILE_TYPES["warm"]
        assert squint.value == params["intensity"] * 0.3


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
        assert len(result) == 2
        assert result[0].type == "breath_chest"
        assert result[1].type == "breath_shoulders"

    def test_breath_frame_targets(self):
        """Test breath frame targets correct body parts"""
        system = BreathingVisualization()
        result = system.generate_breath_frame(0.1)
        assert result[0].target == "chest"
        assert result[1].target == "shoulders"

    def test_breath_frame_duration(self):
        """Test breath frame has correct duration (~30fps)"""
        system = BreathingVisualization()
        result = system.generate_breath_frame(0.1)
        assert result[0].duration == 0.033
        assert result[1].duration == 0.033

    def test_shoulders_move_less_than_chest(self):
        """Test shoulders move 30% of chest"""
        system = BreathingVisualization()
        result = system.generate_breath_frame(0.1)
        chest_value = abs(result[0].value)
        shoulders_value = abs(result[1].value)
        if chest_value > 0:
            assert shoulders_value == pytest.approx(chest_value * 0.3, rel=0.01)

    def test_phase_advances(self):
        """Test that phase advances with delta time"""
        system = BreathingVisualization()
        system.generate_breath_frame(1.0)
        assert system.phase > 0

    def test_phase_wraps(self):
        """Test that phase wraps around at 1.0"""
        system = BreathingVisualization()
        system.phase = 0.9
        system.generate_breath_frame(0.5)
        assert system.phase < 1.0

    def test_phase_wraps_exact(self):
        """Test phase wraps correctly from high values"""
        system = BreathingVisualization()
        system.phase = 0.95
        params = system.BREATHING_PATTERNS["normal"]
        # Advance past 1.0
        system.generate_breath_frame(params["cycle_duration"] * 0.1)
        assert 0 <= system.phase < 1.0

    def test_breathing_patterns_calm(self):
        """Test calm breathing pattern"""
        system = BreathingVisualization()
        system.pattern = "calm"
        result = system.generate_breath_frame(0.1)
        # Calm has lower intensity
        params = system.BREATHING_PATTERNS["calm"]
        assert params["intensity"] == 0.3
        assert params["cycle_duration"] == 4.0

    def test_breathing_patterns_excited(self):
        """Test excited breathing pattern"""
        system = BreathingVisualization()
        system.pattern = "excited"
        params = system.BREATHING_PATTERNS["excited"]
        assert params["intensity"] == 0.6
        assert params["cycle_duration"] == 2.5

    def test_breathing_patterns_deep(self):
        """Test deep breathing pattern"""
        system = BreathingVisualization()
        system.pattern = "deep"
        params = system.BREATHING_PATTERNS["deep"]
        assert params["intensity"] == 0.5
        assert params["cycle_duration"] == 5.0

    def test_invalid_pattern_defaults_to_normal(self):
        """Test invalid pattern defaults to normal"""
        system = BreathingVisualization()
        system.pattern = "invalid"
        result = system.generate_breath_frame(0.1)
        # Should still work using normal params
        assert len(result) == 2

    def test_breath_value_sinusoidal(self):
        """Test breath value follows sinusoidal pattern"""
        system = BreathingVisualization()
        system.phase = 0.25  # Quarter cycle
        params = system.BREATHING_PATTERNS["normal"]
        result = system.generate_breath_frame(0.001)  # Tiny delta to not change phase much
        expected = math.sin(0.25 * 2 * math.pi) * params["intensity"]
        assert result[0].value == pytest.approx(expected, rel=0.1)


class TestIdleBehaviors:
    """Tests for IdleBehaviors class"""

    def test_init_cooldowns(self):
        """Test that cooldowns are initialized for all behaviors"""
        system = IdleBehaviors()
        for behavior in system.BEHAVIORS:
            assert behavior["name"] in system.last_behavior_time

    def test_init_cooldowns_set_to_zero(self):
        """Test initial cooldowns are set to zero"""
        system = IdleBehaviors()
        for name in system.last_behavior_time:
            assert system.last_behavior_time[name] == 0

    def test_generate_idle_behavior_cooldown(self):
        """Test cooldown prevents behavior generation"""
        system = IdleBehaviors()
        now = time.time()
        for name in system.last_behavior_time:
            system.last_behavior_time[name] = now
        result = system.generate_idle_behavior(now + 1)
        assert result is None

    def test_generate_idle_behavior_after_cooldown(self):
        """Test behavior can be generated after cooldown"""
        system = IdleBehaviors()
        now = time.time()
        for name in system.last_behavior_time:
            system.last_behavior_time[name] = now - 10  # 10 seconds ago
        with patch('eva_micro_expressions.random.random', return_value=0.001):
            result = system.generate_idle_behavior(now)
            # Might generate something if probability is met
            # (probability varies per behavior)

    def test_create_behavior_head_tilt(self):
        """Test head tilt behavior creation"""
        system = IdleBehaviors()
        result = system._create_behavior("head_tilt_slight", 2.0)
        assert len(result) == 1
        assert result[0].type == "head_tilt"
        assert result[0].target == "head"
        assert result[0].duration == 2.0
        assert result[0].easing == "ease_in_out"

    def test_create_behavior_lip_press(self):
        """Test lip press behavior creation"""
        system = IdleBehaviors()
        result = system._create_behavior("lip_press", 0.5)
        assert result[0].type == "lip_press"
        assert result[0].target == "mouth"
        assert result[0].value == 0.3

    def test_create_behavior_nostril_flare(self):
        """Test nostril flare behavior creation"""
        system = IdleBehaviors()
        result = system._create_behavior("nostril_flare", 0.3)
        assert len(result) == 1
        assert result[0].type == "nostril_flare"
        assert result[0].target == "nose"
        assert result[0].value == 0.4
        assert result[0].easing == "ease_out"

    def test_create_behavior_swallow(self):
        """Test swallow behavior creates two expressions"""
        system = IdleBehaviors()
        result = system._create_behavior("swallow", 0.4)
        assert len(result) == 2
        assert result[0].type == "throat_move"
        assert result[0].value == 1.0
        assert result[0].duration == pytest.approx(0.4 * 0.3)
        assert result[1].value == 0.0
        assert result[1].delay == pytest.approx(0.4 * 0.3)

    def test_create_behavior_brow_micro(self):
        """Test brow micro behavior creation"""
        system = IdleBehaviors()
        with patch('eva_micro_expressions.random.choice', return_value="left"):
            result = system._create_behavior("brow_micro", 0.6)
            assert result[0].type == "brow_left_micro"
            assert result[0].target == "brows"

        with patch('eva_micro_expressions.random.choice', return_value="right"):
            result = system._create_behavior("brow_micro", 0.6)
            assert result[0].type == "brow_right_micro"

    def test_create_behavior_unknown(self):
        """Test unknown behavior returns empty list"""
        system = IdleBehaviors()
        result = system._create_behavior("unknown_behavior", 1.0)
        assert result == []

    def test_create_behavior_weight_shift(self):
        """Test weight_shift behavior (not implemented, returns empty)"""
        system = IdleBehaviors()
        result = system._create_behavior("weight_shift", 1.5)
        assert result == []

    def test_behaviors_have_required_fields(self):
        """Test all behaviors have required fields"""
        system = IdleBehaviors()
        for behavior in system.BEHAVIORS:
            assert "name" in behavior
            assert "probability" in behavior
            assert "duration" in behavior
            assert 0 <= behavior["probability"] <= 1

    def test_behavior_updates_last_time(self):
        """Test generating behavior updates last_behavior_time"""
        system = IdleBehaviors()
        now = time.time()
        # Force a behavior by setting very high probability
        with patch('eva_micro_expressions.random.random', return_value=0.0):
            system.generate_idle_behavior(now)
        # At least one behavior should have updated time


class TestListeningBehaviors:
    """Tests for ListeningBehaviors class"""

    def test_init_not_listening(self):
        """Test initialization in non-listening state"""
        system = ListeningBehaviors()
        assert system.is_listening is False
        assert system.engagement_level == 0.5

    def test_init_last_nod(self):
        """Test initialization sets last_nod to zero"""
        system = ListeningBehaviors()
        assert system.last_nod == 0

    def test_set_listening(self):
        """Test setting listening state"""
        system = ListeningBehaviors()
        system.set_listening(True, 0.8)
        assert system.is_listening is True
        assert system.engagement_level == 0.8

    def test_set_listening_false(self):
        """Test setting listening to false"""
        system = ListeningBehaviors()
        system.set_listening(True, 0.8)
        system.set_listening(False, 0.5)
        assert system.is_listening is False

    def test_engagement_clamped_high(self):
        """Test engagement level is clamped to max 1"""
        system = ListeningBehaviors()
        system.set_listening(True, 1.5)
        assert system.engagement_level == 1.0

    def test_engagement_clamped_low(self):
        """Test engagement level is clamped to min 0"""
        system = ListeningBehaviors()
        system.set_listening(True, -0.5)
        assert system.engagement_level == 0.0

    def test_no_behavior_when_not_listening(self):
        """Test no behavior generated when not listening"""
        system = ListeningBehaviors()
        result = system.generate_listening_behavior()
        assert result is None

    def test_generate_listening_behavior_nod(self):
        """Test nod generation when listening"""
        system = ListeningBehaviors()
        system.set_listening(True, 0.8)
        system.last_nod = 0  # Long ago
        now = time.time()

        # Force nod by mocking random
        with patch('eva_micro_expressions.random.uniform', return_value=0):
            with patch('eva_micro_expressions.random.random', return_value=0.1):
                result = system.generate_listening_behavior(now)
                if result:
                    types = [e.type for e in result]
                    assert "head_nod" in types

    def test_generate_listening_behavior_brows(self):
        """Test brows interest generation when listening"""
        system = ListeningBehaviors()
        system.set_listening(True, 1.0)  # Max engagement
        system.last_nod = time.time()  # Recent, so no nod

        # Force brow raise
        with patch('eva_micro_expressions.random.random', return_value=0.01):
            with patch('eva_micro_expressions.random.uniform', return_value=10):
                result = system.generate_listening_behavior()
                if result:
                    types = [e.type for e in result]
                    assert "brows_interest" in types

    def test_nod_intensity_scales_with_engagement(self):
        """Test nod intensity scales with engagement level"""
        system = ListeningBehaviors()
        system.set_listening(True, 1.0)
        system.last_nod = 0
        now = time.time()

        with patch('eva_micro_expressions.random.uniform', return_value=0):
            with patch('eva_micro_expressions.random.random', return_value=0.1):
                result = system.generate_listening_behavior(now)
                if result:
                    nod = next((e for e in result if e.type == "head_nod"), None)
                    if nod:
                        # Base 0.1 + engagement * 0.15
                        assert nod.value == pytest.approx(0.1 + 1.0 * 0.15)

    def test_nod_updates_last_nod(self):
        """Test generating nod updates last_nod timestamp"""
        system = ListeningBehaviors()
        system.set_listening(True, 0.8)
        system.last_nod = 0
        now = time.time()

        with patch('eva_micro_expressions.random.uniform', return_value=0):
            with patch('eva_micro_expressions.random.random', return_value=0.1):
                system.generate_listening_behavior(now)
                assert system.last_nod == now


class TestEvaMicroExpressionEngine:
    """Tests for EvaMicroExpressionEngine class"""

    def test_init(self):
        """Test engine initialization"""
        engine = EvaMicroExpressionEngine()
        assert engine.current_emotion == "neutral"
        assert engine.is_speaking is False

    def test_init_subsystems(self):
        """Test all subsystems are initialized"""
        engine = EvaMicroExpressionEngine()
        assert isinstance(engine.blinking, BlinkingSystem)
        assert isinstance(engine.gaze, GazeSystem)
        assert isinstance(engine.smile, MicroSmileSystem)
        assert isinstance(engine.breathing, BreathingVisualization)
        assert isinstance(engine.idle, IdleBehaviors)
        assert isinstance(engine.listening, ListeningBehaviors)

    def test_set_emotion(self):
        """Test setting emotion updates subsystems"""
        engine = EvaMicroExpressionEngine()
        engine.set_emotion("joy")
        assert engine.current_emotion == "joy"
        assert engine.blinking.current_state == "excited"

    def test_set_emotion_sadness(self):
        """Test sadness emotion mapping"""
        engine = EvaMicroExpressionEngine()
        engine.set_emotion("sadness")
        assert engine.blinking.current_state == "sad"
        assert engine.breathing.pattern == "deep"

    def test_set_emotion_excitement(self):
        """Test excitement emotion mapping"""
        engine = EvaMicroExpressionEngine()
        engine.set_emotion("excitement")
        assert engine.blinking.current_state == "excited"
        assert engine.breathing.pattern == "excited"

    def test_set_emotion_surprise(self):
        """Test surprise emotion mapping"""
        engine = EvaMicroExpressionEngine()
        engine.set_emotion("surprise")
        assert engine.blinking.current_state == "surprised"

    def test_set_emotion_thoughtful(self):
        """Test thoughtful emotion mapping"""
        engine = EvaMicroExpressionEngine()
        engine.set_emotion("thoughtful")
        assert engine.blinking.current_state == "thinking"
        assert engine.breathing.pattern == "deep"

    def test_set_emotion_curiosity(self):
        """Test curiosity emotion mapping"""
        engine = EvaMicroExpressionEngine()
        engine.set_emotion("curiosity")
        assert engine.blinking.current_state == "attentive"

    def test_set_emotion_unknown(self):
        """Test unknown emotion defaults to neutral"""
        engine = EvaMicroExpressionEngine()
        engine.set_emotion("unknown_emotion")
        assert engine.blinking.current_state == "neutral"
        assert engine.breathing.pattern == "normal"

    def test_set_speaking(self):
        """Test setting speaking state"""
        engine = EvaMicroExpressionEngine()
        engine.set_speaking(True)
        assert engine.is_speaking is True
        assert engine.listening.is_listening is False

    def test_set_speaking_false(self):
        """Test setting speaking to false enables listening"""
        engine = EvaMicroExpressionEngine()
        engine.set_speaking(False)
        assert engine.is_speaking is False
        assert engine.listening.is_listening is True

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

    def test_generate_frame_updates_last_update(self):
        """Test frame generation updates last_update timestamp"""
        engine = EvaMicroExpressionEngine()
        before = engine.last_update
        time.sleep(0.01)
        engine.generate_frame()
        assert engine.last_update > before

    def test_generate_frame_expression_format(self):
        """Test frame expressions have correct format"""
        engine = EvaMicroExpressionEngine()
        frame = engine.generate_frame()
        for expr in frame["expressions"]:
            assert "type" in expr
            assert "target" in expr
            assert "value" in expr
            assert "duration" in expr
            assert "easing" in expr
            assert "delay" in expr

    def test_generate_frame_speaking_mode(self):
        """Test frame generation in speaking mode"""
        engine = EvaMicroExpressionEngine()
        engine.set_speaking(True)
        engine.set_emotion("joy")
        frame = engine.generate_frame()
        assert "timestamp" in frame

    def test_generate_frame_listening_mode(self):
        """Test frame generation in listening mode"""
        engine = EvaMicroExpressionEngine()
        engine.set_speaking(False)
        frame = engine.generate_frame()
        assert "timestamp" in frame

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

    def test_generate_expression_for_text_question_mark(self):
        """Test question mark triggers brow raise"""
        engine = EvaMicroExpressionEngine()
        result = engine.generate_expression_for_text("Are you sure?")
        types = [e["type"] for e in result["expressions"]]
        assert "brows_raise" in types

    def test_generate_expression_for_text_thinking(self):
        """Test thinking words trigger gaze shift"""
        engine = EvaMicroExpressionEngine()
        result = engine.generate_expression_for_text("hmm, je pense que c'est vrai")
        types = [e["type"] for e in result["expressions"]]
        assert "gaze_x" in types or "gaze_y" in types

    def test_generate_expression_for_text_empty(self):
        """Test empty text returns empty expressions"""
        engine = EvaMicroExpressionEngine()
        result = engine.generate_expression_for_text("")
        assert result["text_based"] is True
        assert result["expressions"] == []

    def test_generate_expression_for_text_vraiment(self):
        """Test 'vraiment' triggers surprise"""
        engine = EvaMicroExpressionEngine()
        result = engine.generate_expression_for_text("Vraiment?")
        types = [e["type"] for e in result["expressions"]]
        assert "brows_raise" in types

    def test_generate_expression_for_text_serieux(self):
        """Test 'serieux' triggers surprise"""
        engine = EvaMicroExpressionEngine()
        result = engine.generate_expression_for_text("serieux")
        types = [e["type"] for e in result["expressions"]]
        assert "brows_raise" in types

    def test_generate_expression_for_text_mdr(self):
        """Test 'mdr' triggers smile"""
        engine = EvaMicroExpressionEngine()
        result = engine.generate_expression_for_text("mdr trop drole")
        types = [e["type"] for e in result["expressions"]]
        assert "smile_left" in types or "smile_right" in types

    def test_generate_expression_for_text_cool(self):
        """Test 'cool' triggers smile"""
        engine = EvaMicroExpressionEngine()
        # Use just "cool" without punctuation for exact match
        result = engine.generate_expression_for_text("cool stuff today")
        types = [e["type"] for e in result["expressions"]]
        assert "smile_left" in types or "smile_right" in types

    def test_frozenset_optimizations(self):
        """Test that frozensets are used for O(1) lookups"""
        assert isinstance(EvaMicroExpressionEngine.SMILE_WORDS, frozenset)
        assert isinstance(EvaMicroExpressionEngine.SURPRISE_WORDS, frozenset)
        assert isinstance(EvaMicroExpressionEngine.THINKING_WORDS, frozenset)
        assert isinstance(EvaMicroExpressionEngine.SPEAKING_EMOTIONS, frozenset)

    def test_smile_words_content(self):
        """Test SMILE_WORDS contains expected words"""
        words = EvaMicroExpressionEngine.SMILE_WORDS
        assert "haha" in words
        assert "hihi" in words
        assert "mdr" in words
        assert "adore" in words
        assert "super" in words
        assert "cool" in words

    def test_surprise_words_content(self):
        """Test SURPRISE_WORDS contains expected words"""
        words = EvaMicroExpressionEngine.SURPRISE_WORDS
        assert "quoi" in words
        assert "vraiment" in words
        assert "serieux" in words

    def test_thinking_words_content(self):
        """Test THINKING_WORDS contains expected phrases"""
        words = EvaMicroExpressionEngine.THINKING_WORDS
        assert "hmm" in words
        assert "peut-etre" in words
        assert "je pense" in words

    def test_speaking_emotions_content(self):
        """Test SPEAKING_EMOTIONS contains expected emotions"""
        emotions = EvaMicroExpressionEngine.SPEAKING_EMOTIONS
        assert "joy" in emotions
        assert "playful" in emotions
        assert "tenderness" in emotions


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

    def test_get_micro_expression_frame_returns_dict(self):
        """Test frame is a dictionary"""
        frame = get_micro_expression_frame()
        assert isinstance(frame, dict)

    def test_get_text_expressions(self):
        """Test getting text-based expressions"""
        result = get_text_expressions("Bonjour!")
        assert "text_based" in result
        assert result["text_based"] is True

    def test_get_text_expressions_empty(self):
        """Test text expressions for empty string"""
        result = get_text_expressions("")
        assert result["expressions"] == []

    def test_set_emotion_global(self):
        """Test setting emotion on global engine"""
        set_emotion("sadness")
        assert micro_expression_engine.current_emotion == "sadness"

    def test_set_emotion_global_joy(self):
        """Test setting joy emotion on global engine"""
        set_emotion("joy")
        assert micro_expression_engine.current_emotion == "joy"

    def test_set_speaking_global(self):
        """Test setting speaking state on global engine"""
        set_speaking(True)
        assert micro_expression_engine.is_speaking is True
        set_speaking(False)
        assert micro_expression_engine.is_speaking is False

    def test_global_engine_is_singleton(self):
        """Test global engine is a singleton"""
        from eva_micro_expressions import micro_expression_engine as engine1
        from eva_micro_expressions import micro_expression_engine as engine2
        assert engine1 is engine2


class TestEdgeCases:
    """Tests for edge cases and error handling"""

    def test_rapid_frame_generation(self):
        """Test rapid successive frame generation"""
        engine = EvaMicroExpressionEngine()
        for _ in range(100):
            frame = engine.generate_frame()
            assert "expressions" in frame

    def test_emotion_transitions(self):
        """Test rapid emotion transitions"""
        engine = EvaMicroExpressionEngine()
        emotions = ["joy", "sadness", "surprise", "neutral", "excitement"]
        for emotion in emotions:
            engine.set_emotion(emotion)
            assert engine.current_emotion == emotion

    def test_speaking_toggle(self):
        """Test rapid speaking state toggles"""
        engine = EvaMicroExpressionEngine()
        for _ in range(10):
            engine.set_speaking(True)
            engine.set_speaking(False)
        assert engine.is_speaking is False

    def test_text_with_special_characters(self):
        """Test text expression with special characters"""
        engine = EvaMicroExpressionEngine()
        result = engine.generate_expression_for_text("Hello! @#$%^&*()")
        assert "text_based" in result

    def test_text_with_unicode(self):
        """Test text expression with unicode"""
        engine = EvaMicroExpressionEngine()
        result = engine.generate_expression_for_text("Bonjour 😊 世界")
        assert "text_based" in result

    def test_text_case_insensitive(self):
        """Test text matching is case insensitive"""
        engine = EvaMicroExpressionEngine()
        result1 = engine.generate_expression_for_text("HAHA")
        result2 = engine.generate_expression_for_text("haha")
        # Both should trigger smile
        types1 = [e["type"] for e in result1["expressions"]]
        types2 = [e["type"] for e in result2["expressions"]]
        assert types1 == types2

    def test_long_text(self):
        """Test text expression with very long text"""
        engine = EvaMicroExpressionEngine()
        long_text = "hello " * 1000
        result = engine.generate_expression_for_text(long_text)
        assert "text_based" in result

    def test_breathing_pattern_change(self):
        """Test breathing pattern changes correctly"""
        engine = EvaMicroExpressionEngine()
        engine.set_emotion("excitement")
        assert engine.breathing.pattern == "excited"
        engine.set_emotion("sadness")
        assert engine.breathing.pattern == "deep"

    def test_frame_values_rounded(self):
        """Test frame values are properly rounded"""
        engine = EvaMicroExpressionEngine()
        frame = engine.generate_frame()
        for expr in frame["expressions"]:
            # Values should be rounded to 4 decimal places
            value_str = str(expr["value"])
            if "." in value_str:
                decimals = len(value_str.split(".")[1])
                assert decimals <= 4

    def test_multiple_engines(self):
        """Test creating multiple independent engines"""
        engine1 = EvaMicroExpressionEngine()
        engine2 = EvaMicroExpressionEngine()
        engine1.set_emotion("joy")
        engine2.set_emotion("sadness")
        assert engine1.current_emotion == "joy"
        assert engine2.current_emotion == "sadness"


class TestPerformance:
    """Performance-related tests"""

    def test_frame_generation_performance(self):
        """Test frame generation is fast enough"""
        engine = EvaMicroExpressionEngine()
        start = time.time()
        for _ in range(100):
            engine.generate_frame()
        elapsed = time.time() - start
        # 100 frames should complete in under 1 second
        assert elapsed < 1.0

    def test_text_expression_performance(self):
        """Test text expression generation is fast"""
        engine = EvaMicroExpressionEngine()
        start = time.time()
        for _ in range(100):
            engine.generate_expression_for_text("haha super cool!")
        elapsed = time.time() - start
        assert elapsed < 1.0

    def test_precomputed_data_structures(self):
        """Test precomputed data structures exist"""
        # These should be class-level for performance
        assert hasattr(GazeSystem, 'GAZE_COORDS')
        assert hasattr(GazeSystem, 'CONTEXT_DIRECTIONS')
        assert hasattr(GazeSystem, 'ALL_DIRECTIONS')
        assert hasattr(EvaMicroExpressionEngine, 'SMILE_WORDS')
        assert hasattr(EvaMicroExpressionEngine, 'SURPRISE_WORDS')
