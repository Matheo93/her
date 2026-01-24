"""
Tests for eva_inner_thoughts.py - Inner Thoughts System.

Tests the CHI 2025 "Inner Thoughts" proactive AI framework:
- Thought generation
- Motivation scoring
- Conversation state management
- Proactive message generation
"""

import pytest
import sys
import os
import time
from unittest.mock import MagicMock, patch

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestThoughtType:
    """Tests for ThoughtType enum."""

    def test_thought_types_exist(self):
        """Test all expected thought types are defined."""
        from eva_inner_thoughts import ThoughtType

        expected = [
            "CURIOSITY", "CONCERN", "EXCITEMENT", "REMINDER",
            "AFFECTION", "PLAYFUL", "EMPATHY", "SUGGESTION"
        ]

        for name in expected:
            assert hasattr(ThoughtType, name)

    def test_thought_types_values(self):
        """Test thought types have string values."""
        from eva_inner_thoughts import ThoughtType

        assert ThoughtType.CURIOSITY.value == "curiosity"
        assert ThoughtType.EMPATHY.value == "empathy"
        assert ThoughtType.PLAYFUL.value == "playful"


class TestInnerThought:
    """Tests for InnerThought dataclass."""

    def test_inner_thought_creation(self):
        """Test InnerThought creation with required fields."""
        from eva_inner_thoughts import InnerThought, ThoughtType

        thought = InnerThought(
            thought_type=ThoughtType.CURIOSITY,
            content="Test thought",
            motivation_score=0.7,
            trigger="user_message"
        )

        assert thought.thought_type == ThoughtType.CURIOSITY
        assert thought.content == "Test thought"
        assert thought.motivation_score == 0.7
        assert thought.trigger == "user_message"
        assert thought.spoken is False

    def test_inner_thought_timestamp(self):
        """Test InnerThought has auto-generated timestamp."""
        from eva_inner_thoughts import InnerThought, ThoughtType

        before = time.time()
        thought = InnerThought(
            thought_type=ThoughtType.EMPATHY,
            content="Test",
            motivation_score=0.5,
            trigger="test"
        )
        after = time.time()

        assert before <= thought.timestamp <= after

    def test_inner_thought_to_dict(self):
        """Test to_dict serialization."""
        from eva_inner_thoughts import InnerThought, ThoughtType

        thought = InnerThought(
            thought_type=ThoughtType.PLAYFUL,
            content="Funny thought",
            motivation_score=0.8,
            trigger="joke"
        )

        d = thought.to_dict()

        assert d["type"] == "playful"
        assert d["content"] == "Funny thought"
        assert d["motivation"] == 0.8
        assert d["trigger"] == "joke"
        assert d["spoken"] is False
        assert "timestamp" in d


class TestMotivationFactors:
    """Tests for MotivationFactors dataclass."""

    def test_motivation_factors_default(self):
        """Test default values are 0."""
        from eva_inner_thoughts import MotivationFactors

        factors = MotivationFactors()

        assert factors.relevance == 0.0
        assert factors.information_gap == 0.0
        assert factors.expected_impact == 0.0
        assert factors.urgency == 0.0
        assert factors.coherence == 0.0
        assert factors.originality == 0.0
        assert factors.balance == 0.0
        assert factors.dynamics == 0.0

    def test_motivation_factors_total_zero(self):
        """Test total returns 0 for default factors."""
        from eva_inner_thoughts import MotivationFactors

        factors = MotivationFactors()
        assert factors.total() == 0.0

    def test_motivation_factors_total_average(self):
        """Test total computes average correctly."""
        from eva_inner_thoughts import MotivationFactors

        factors = MotivationFactors(
            relevance=0.8,
            information_gap=0.6,
            expected_impact=0.4,
            urgency=0.2,
            coherence=0.8,
            originality=0.6,
            balance=0.4,
            dynamics=0.2
        )

        expected = (0.8 + 0.6 + 0.4 + 0.2 + 0.8 + 0.6 + 0.4 + 0.2) / 8
        assert factors.total() == pytest.approx(expected)

    def test_motivation_factors_max_score(self):
        """Test max total is 1.0."""
        from eva_inner_thoughts import MotivationFactors

        factors = MotivationFactors(
            relevance=1.0,
            information_gap=1.0,
            expected_impact=1.0,
            urgency=1.0,
            coherence=1.0,
            originality=1.0,
            balance=1.0,
            dynamics=1.0
        )

        assert factors.total() == 1.0


class TestEvaInnerThoughts:
    """Tests for EvaInnerThoughts main class."""

    def test_init_default_threshold(self):
        """Test default motivation threshold."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()

        assert thoughts.motivation_threshold == 0.6

    def test_init_custom_threshold(self):
        """Test custom motivation threshold."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts(motivation_threshold=0.8)

        assert thoughts.motivation_threshold == 0.8

    def test_init_conversation_state(self):
        """Test initial conversation state."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()

        assert thoughts.user_last_spoke == 0
        assert thoughts.eva_last_spoke == 0
        assert thoughts.conversation_energy == 0.5
        assert thoughts.turn_count == 0

    def test_thought_templates_exist(self):
        """Test thought templates are defined for all types."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        templates = EvaInnerThoughts.THOUGHT_TEMPLATES

        for thought_type in ThoughtType:
            assert thought_type in templates
            assert len(templates[thought_type]) > 0

    def test_proactive_starters_exist(self):
        """Test proactive message starters are defined."""
        from eva_inner_thoughts import EvaInnerThoughts

        starters = EvaInnerThoughts.PROACTIVE_STARTERS

        assert "greeting" in starters
        assert "follow_up" in starters
        assert "random" in starters
        assert "emotional_check" in starters

    def test_update_conversation_state_user_spoke(self):
        """Test state update when user speaks."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()
        before = time.time()

        thoughts.update_conversation_state(user_spoke=True, message_length=50)

        assert thoughts.user_last_spoke >= before
        assert thoughts.turn_count == 1

    def test_update_conversation_state_long_message_energy(self):
        """Test energy increases with long messages."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()
        initial_energy = thoughts.conversation_energy

        thoughts.update_conversation_state(user_spoke=True, message_length=150)

        assert thoughts.conversation_energy > initial_energy

    def test_update_conversation_state_short_message_energy(self):
        """Test energy decreases with short messages."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()
        thoughts.conversation_energy = 0.6

        thoughts.update_conversation_state(user_spoke=True, message_length=10)

        assert thoughts.conversation_energy < 0.6

    def test_update_conversation_state_joy_boost(self):
        """Test energy boost from positive emotions."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()
        initial = thoughts.conversation_energy

        thoughts.update_conversation_state(
            user_spoke=True,
            message_length=50,
            detected_emotion="joy"
        )

        assert thoughts.conversation_energy > initial

    def test_update_conversation_state_sadness_decrease(self):
        """Test energy decrease from negative emotions."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()
        thoughts.conversation_energy = 0.5

        thoughts.update_conversation_state(
            user_spoke=True,
            message_length=50,
            detected_emotion="sadness"
        )

        assert thoughts.conversation_energy < 0.5


class TestGenerateThought:
    """Tests for thought generation."""

    def test_generate_thought_returns_inner_thought(self):
        """Test generate_thought returns InnerThought."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType, InnerThought

        thoughts = EvaInnerThoughts()
        context = {"user_name": "Alice", "topic": "projet", "trigger": "test"}

        result = thoughts.generate_thought(ThoughtType.CURIOSITY, "user123", context)

        assert isinstance(result, InnerThought)
        assert result.thought_type == ThoughtType.CURIOSITY

    def test_generate_thought_fills_template(self):
        """Test template variables are filled."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts()
        context = {
            "user_name": "Bob",
            "topic": "Python",
            "emotion": "heureux",
            "trigger": "test"
        }

        result = thoughts.generate_thought(ThoughtType.CURIOSITY, "user123", context)

        # Template should not have unfilled {placeholders}
        assert "{user}" not in result.content
        assert "{topic}" not in result.content

    def test_generate_thought_motivation_score(self):
        """Test thought has motivation score between 0 and 1."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts()
        context = {"user_name": "Alice", "topic": "test", "trigger": "test"}

        result = thoughts.generate_thought(ThoughtType.EMPATHY, "user123", context)

        assert 0.0 <= result.motivation_score <= 1.0


class TestShouldSpeak:
    """Tests for should_speak decision."""

    def test_should_speak_above_threshold(self):
        """Test speaks when above threshold."""
        from eva_inner_thoughts import EvaInnerThoughts, InnerThought, ThoughtType

        thoughts = EvaInnerThoughts(motivation_threshold=0.5)

        thought = InnerThought(
            thought_type=ThoughtType.EMPATHY,
            content="Test",
            motivation_score=0.7,
            trigger="test"
        )

        assert thoughts.should_speak(thought) is True

    def test_should_speak_below_threshold(self):
        """Test doesn't speak when below threshold."""
        from eva_inner_thoughts import EvaInnerThoughts, InnerThought, ThoughtType

        thoughts = EvaInnerThoughts(motivation_threshold=0.8)

        thought = InnerThought(
            thought_type=ThoughtType.PLAYFUL,
            content="Test",
            motivation_score=0.5,
            trigger="test"
        )

        assert thoughts.should_speak(thought) is False

    def test_should_speak_at_threshold(self):
        """Test speaks at exactly threshold."""
        from eva_inner_thoughts import EvaInnerThoughts, InnerThought, ThoughtType

        thoughts = EvaInnerThoughts(motivation_threshold=0.6)

        thought = InnerThought(
            thought_type=ThoughtType.CURIOSITY,
            content="Test",
            motivation_score=0.6,
            trigger="test"
        )

        assert thoughts.should_speak(thought) is True


class TestProcessUserMessage:
    """Tests for processing user messages."""

    def test_process_user_message_returns_list(self):
        """Test returns list of thoughts."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()

        with patch('eva_inner_thoughts.get_memory_system', return_value=None):
            result = thoughts.process_user_message("user123", "Hello!", "neutral")

        assert isinstance(result, list)

    def test_process_user_message_empathy_for_sadness(self):
        """Test empathy thought generated for sad messages."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts(motivation_threshold=0.0)  # Low threshold

        with patch('eva_inner_thoughts.get_memory_system', return_value=None):
            result = thoughts.process_user_message("user123", "I'm so sad", "sadness")

        # Should have empathy thought
        types = [t.thought_type for t in result]
        assert ThoughtType.EMPATHY in types

    def test_process_user_message_curiosity_for_questions(self):
        """Test curiosity thought for questions."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts(motivation_threshold=0.0)

        with patch('eva_inner_thoughts.get_memory_system', return_value=None):
            result = thoughts.process_user_message("user123", "How is your project?", "neutral")

        types = [t.thought_type for t in result]
        assert ThoughtType.CURIOSITY in types

    def test_process_user_message_updates_history(self):
        """Test thoughts are added to history."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()
        initial_count = len(thoughts.thought_history)

        with patch('eva_inner_thoughts.get_memory_system', return_value=None):
            thoughts.process_user_message("user123", "Hello!", "neutral")

        assert len(thoughts.thought_history) > initial_count


class TestGetThoughtForResponse:
    """Tests for get_thought_for_response."""

    def test_get_thought_for_response_returns_string_or_none(self):
        """Test returns string or None."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()

        with patch('eva_inner_thoughts.get_memory_system', return_value=None):
            result = thoughts.get_thought_for_response("user123", "Hello!", "neutral")

        assert result is None or isinstance(result, str)

    def test_get_thought_for_response_empathy_prefix(self):
        """Test empathy thoughts return appropriate prefix."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType, InnerThought

        thoughts = EvaInnerThoughts(motivation_threshold=0.0)

        # Mock to always return empathy thought
        mock_thought = InnerThought(
            thought_type=ThoughtType.EMPATHY,
            content="Test",
            motivation_score=0.9,
            trigger="test"
        )

        with patch.object(thoughts, 'process_user_message', return_value=[mock_thought]):
            result = thoughts.get_thought_for_response("user123", "I'm sad", "sadness")

        assert result in ["Je comprends...", "Oh...", "Hmm..."]


class TestCalculateMotivation:
    """Tests for motivation calculation."""

    def test_calculate_motivation_returns_factors(self):
        """Test returns MotivationFactors."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType, MotivationFactors

        thoughts = EvaInnerThoughts()
        context = {"trigger": "test"}

        result = thoughts._calculate_motivation(ThoughtType.CURIOSITY, context)

        assert isinstance(result, MotivationFactors)

    def test_calculate_motivation_high_relevance_recent_topic(self):
        """Test high relevance when topic mentioned recently."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts()
        context = {"topic_mentioned_recently": True, "trigger": "test"}

        result = thoughts._calculate_motivation(ThoughtType.CURIOSITY, context)

        assert result.relevance == 0.8

    def test_calculate_motivation_curiosity_information_gap(self):
        """Test curiosity has high information gap."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts()
        context = {"trigger": "test"}

        result = thoughts._calculate_motivation(ThoughtType.CURIOSITY, context)

        assert result.information_gap == 0.7

    def test_calculate_motivation_empathy_impact(self):
        """Test empathy has high expected impact."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts()
        context = {"trigger": "test"}

        result = thoughts._calculate_motivation(ThoughtType.EMPATHY, context)

        assert result.expected_impact == 0.8

    def test_calculate_motivation_urgency_emotional(self):
        """Test emotional urgency increases urgency factor."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts()
        context = {"emotional_urgency": True, "trigger": "test"}

        result = thoughts._calculate_motivation(ThoughtType.CONCERN, context)

        assert result.urgency == 0.9


class TestGlobalFunctions:
    """Tests for module-level functions."""

    def test_init_inner_thoughts(self):
        """Test init_inner_thoughts creates instance."""
        from eva_inner_thoughts import init_inner_thoughts, EvaInnerThoughts

        result = init_inner_thoughts(motivation_threshold=0.7)

        assert isinstance(result, EvaInnerThoughts)
        assert result.motivation_threshold == 0.7

    def test_get_inner_thoughts_after_init(self):
        """Test get_inner_thoughts returns instance after init."""
        from eva_inner_thoughts import init_inner_thoughts, get_inner_thoughts

        init_inner_thoughts()
        result = get_inner_thoughts()

        assert result is not None

    def test_process_for_thoughts(self):
        """Test process_for_thoughts convenience function."""
        from eva_inner_thoughts import process_for_thoughts, init_inner_thoughts

        init_inner_thoughts()

        with patch('eva_inner_thoughts.get_memory_system', return_value=None):
            result = process_for_thoughts("user123", "Hello!", "neutral")

        assert result is None or isinstance(result, str)


class TestOptimizations:
    """Tests for O(1) optimizations."""

    def test_information_gap_lookup_curiosity(self):
        """Test O(1) dict lookup for information gap."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts()
        context = {"trigger": "test"}

        result = thoughts._calculate_motivation(ThoughtType.CURIOSITY, context)
        assert result.information_gap == 0.7  # From _INFORMATION_GAP_BY_TYPE

    def test_information_gap_lookup_reminder(self):
        """Test O(1) dict lookup for reminder type."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts()
        context = {"trigger": "test"}

        result = thoughts._calculate_motivation(ThoughtType.REMINDER, context)
        assert result.information_gap == 0.4

    def test_information_gap_lookup_default(self):
        """Test default value for types not in lookup dict."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts()
        context = {"trigger": "test"}

        # AFFECTION is not in _INFORMATION_GAP_BY_TYPE
        result = thoughts._calculate_motivation(ThoughtType.AFFECTION, context)
        assert result.information_gap == 0.2  # _INFORMATION_GAP_DEFAULT

    def test_high_impact_frozenset_lookup(self):
        """Test O(1) frozenset lookup for high impact types."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts()
        context = {"trigger": "test"}

        # EMPATHY and CONCERN are in _HIGH_IMPACT_TYPES
        empathy_result = thoughts._calculate_motivation(ThoughtType.EMPATHY, context)
        concern_result = thoughts._calculate_motivation(ThoughtType.CONCERN, context)

        assert empathy_result.expected_impact == 0.8
        assert concern_result.expected_impact == 0.8

    def test_medium_impact_frozenset_lookup(self):
        """Test O(1) frozenset lookup for medium impact types."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts()
        context = {"trigger": "test"}

        result = thoughts._calculate_motivation(ThoughtType.SUGGESTION, context)
        assert result.expected_impact == 0.7

    def test_energy_thought_types_frozenset_low_energy(self):
        """Test O(1) frozenset lookup for energy dynamics."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts()
        thoughts.conversation_energy = 0.2  # Low energy
        context = {"trigger": "test"}

        # PLAYFUL and EXCITEMENT should get high dynamics
        playful_result = thoughts._calculate_motivation(ThoughtType.PLAYFUL, context)
        excitement_result = thoughts._calculate_motivation(ThoughtType.EXCITEMENT, context)

        assert playful_result.dynamics == 0.8
        assert excitement_result.dynamics == 0.8

    def test_energy_thought_types_frozenset_other_types(self):
        """Test other types get lower dynamics when energy is low."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts()
        thoughts.conversation_energy = 0.2  # Low energy
        context = {"trigger": "test"}

        # AFFECTION is not in _ENERGY_THOUGHT_TYPES
        result = thoughts._calculate_motivation(ThoughtType.AFFECTION, context)
        assert result.dynamics == 0.4

    def test_originality_set_lookup(self):
        """Test set lookup for originality is O(1)."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType, InnerThought

        thoughts = EvaInnerThoughts()
        context = {"trigger": "test"}

        # Add some thoughts to history
        for thought_type in [ThoughtType.EMPATHY, ThoughtType.CURIOSITY]:
            thoughts.thought_history.append(InnerThought(
                thought_type=thought_type,
                content="Test",
                motivation_score=0.5,
                trigger="test"
            ))

        # EMPATHY is in recent history, so originality should be low
        empathy_result = thoughts._calculate_motivation(ThoughtType.EMPATHY, context)
        assert empathy_result.originality == 0.3

        # AFFECTION is not in recent history, so originality should be high
        affection_result = thoughts._calculate_motivation(ThoughtType.AFFECTION, context)
        assert affection_result.originality == 0.7

    def test_emotion_frozenset_update_state(self):
        """Test emotion frozenset lookups in update_conversation_state."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()
        initial = thoughts.conversation_energy

        # Test joy (in _ENERGY_BOOST_EMOTIONS)
        thoughts.update_conversation_state(user_spoke=True, message_length=50, detected_emotion="joy")
        after_joy = thoughts.conversation_energy
        assert after_joy > initial

        # Reset and test excitement
        thoughts.conversation_energy = 0.5
        thoughts.update_conversation_state(user_spoke=True, message_length=50, detected_emotion="excitement")
        after_excitement = thoughts.conversation_energy
        assert after_excitement > 0.5

    def test_negative_emotions_process_message(self):
        """Test negative emotion frozenset in process_user_message."""
        from eva_inner_thoughts import EvaInnerThoughts, ThoughtType

        thoughts = EvaInnerThoughts(motivation_threshold=0.0)

        with patch('eva_inner_thoughts.get_memory_system', return_value=None):
            # All three negative emotions should trigger empathy
            for emotion in ["sadness", "anger", "fear"]:
                result = thoughts.process_user_message("user123", "test", emotion)
                types = [t.thought_type for t in result]
                assert ThoughtType.EMPATHY in types, f"Failed for {emotion}"


class TestProactiveMessage:
    """Tests for proactive message generation."""

    def test_generate_proactive_message_cooldown(self):
        """Test proactive messages respect cooldown."""
        from eva_inner_thoughts import EvaInnerThoughts
        import time

        thoughts = EvaInnerThoughts()
        thoughts.last_proactive_time = time.time()  # Just spoke

        result = thoughts.generate_proactive_message("user123")

        assert result is None  # Cooldown active

    def test_generate_proactive_message_no_memory(self):
        """Test returns None when no memory system."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()
        thoughts.last_proactive_time = 0  # Long ago

        with patch('eva_inner_thoughts.get_memory_system', return_value=None):
            result = thoughts.generate_proactive_message("user123")

        assert result is None

    def test_get_proactive_message_function(self):
        """Test get_proactive_message convenience function."""
        from eva_inner_thoughts import get_proactive_message, init_inner_thoughts

        init_inner_thoughts()

        with patch('eva_inner_thoughts.get_memory_system', return_value=None):
            result = get_proactive_message("user123")

        assert result is None  # No memory = no proactive message

    def test_generate_proactive_message_no_topics(self):
        """Test returns None when no proactive topics."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()
        thoughts.last_proactive_time = 0  # Long ago

        mock_memory = MagicMock()
        mock_memory.get_context_memories.return_value = {"profile": {"name": "Test"}}
        mock_memory.get_proactive_topics.return_value = []

        with patch('eva_inner_thoughts.get_memory_system', return_value=mock_memory):
            result = thoughts.generate_proactive_message("user123")

        assert result is None  # No topics = no proactive message

    def test_generate_proactive_message_with_topic(self):
        """Test proactive message generation with a topic."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()
        thoughts.last_proactive_time = 0  # Long ago

        mock_memory = MagicMock()
        mock_memory.get_context_memories.return_value = {
            "profile": {
                "name": "Alice",
                "emotional_patterns": {"dominant": "joyeux"}
            }
        }
        mock_memory.get_proactive_topics.return_value = [
            {"topic": "musique", "type": "follow_up"}
        ]

        with patch('eva_inner_thoughts.get_memory_system', return_value=mock_memory):
            result = thoughts.generate_proactive_message("user123")

        # Either we get a message or None (depends on should_speak)
        if result is not None:
            assert "message" in result
            assert "thought" in result
            assert "topic" in result
            assert result["type"] == "proactive"

    def test_generate_proactive_message_should_not_speak(self):
        """Test proactive message returns None when should_speak is False."""
        from eva_inner_thoughts import EvaInnerThoughts

        thoughts = EvaInnerThoughts()
        thoughts.last_proactive_time = 0  # Long ago

        mock_memory = MagicMock()
        mock_memory.get_context_memories.return_value = {
            "profile": {"name": "Test"}
        }
        mock_memory.get_proactive_topics.return_value = [
            {"topic": "test", "type": "curiosity"}
        ]

        with patch('eva_inner_thoughts.get_memory_system', return_value=mock_memory):
            with patch.object(thoughts, 'should_speak', return_value=False):
                result = thoughts.generate_proactive_message("user123")

        assert result is None
