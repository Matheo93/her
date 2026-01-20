"""
Tests for eva_memory.py - Long-term Memory System.

Tests the Mem0-inspired memory architecture:
- MemoryEntry dataclass
- UserProfile dataclass
- EvaMemorySystem class
- Memory consolidation
- Semantic search
"""

import pytest
import sys
import os
import time
import tempfile
import shutil
from unittest.mock import MagicMock, patch

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestMemoryEntry:
    """Tests for MemoryEntry dataclass."""

    def test_memory_entry_creation(self):
        """Test MemoryEntry creation with required fields."""
        from eva_memory import MemoryEntry

        entry = MemoryEntry(
            id="test123",
            content="Test memory content",
            memory_type="episodic",
            timestamp=time.time()
        )

        assert entry.id == "test123"
        assert entry.content == "Test memory content"
        assert entry.memory_type == "episodic"
        assert entry.emotion == "neutral"  # default
        assert entry.importance == 0.5  # default

    def test_memory_entry_with_emotion(self):
        """Test MemoryEntry with emotional tagging."""
        from eva_memory import MemoryEntry

        entry = MemoryEntry(
            id="test456",
            content="Happy memory",
            memory_type="emotional",
            timestamp=time.time(),
            emotion="joy",
            emotion_intensity=0.8
        )

        assert entry.emotion == "joy"
        assert entry.emotion_intensity == 0.8

    def test_memory_entry_to_dict(self):
        """Test to_dict serialization."""
        from eva_memory import MemoryEntry

        entry = MemoryEntry(
            id="test789",
            content="Test",
            memory_type="semantic",
            timestamp=12345.0,
            importance=0.9
        )

        d = entry.to_dict()

        assert d["id"] == "test789"
        assert d["content"] == "Test"
        assert d["memory_type"] == "semantic"
        assert d["timestamp"] == 12345.0
        assert d["importance"] == 0.9

    def test_memory_entry_from_dict(self):
        """Test from_dict deserialization."""
        from eva_memory import MemoryEntry

        data = {
            "id": "abc123",
            "content": "Restored memory",
            "memory_type": "episodic",
            "timestamp": 99999.0,
            "emotion": "sadness",
            "emotion_intensity": 0.6,
            "importance": 0.7,
            "access_count": 5,
            "last_accessed": 88888.0,
            "related_memories": ["other1"],
            "metadata": {"key": "value"}
        }

        entry = MemoryEntry.from_dict(data)

        assert entry.id == "abc123"
        assert entry.content == "Restored memory"
        assert entry.emotion == "sadness"
        assert entry.related_memories == ["other1"]
        assert entry.metadata == {"key": "value"}

    def test_memory_entry_defaults(self):
        """Test default values are applied."""
        from eva_memory import MemoryEntry

        entry = MemoryEntry(
            id="x",
            content="x",
            memory_type="x",
            timestamp=0
        )

        assert entry.emotion == "neutral"
        assert entry.emotion_intensity == 0.5
        assert entry.importance == 0.5
        assert entry.access_count == 0
        assert entry.last_accessed == 0
        assert entry.related_memories == []
        assert entry.metadata == {}


class TestUserProfile:
    """Tests for UserProfile dataclass."""

    def test_user_profile_creation(self):
        """Test UserProfile creation."""
        from eva_memory import UserProfile

        profile = UserProfile(user_id="user123")

        assert profile.user_id == "user123"
        assert profile.name is None
        assert profile.relationship_stage == "new"
        assert profile.trust_level == 0.3

    def test_user_profile_with_data(self):
        """Test UserProfile with full data."""
        from eva_memory import UserProfile

        profile = UserProfile(
            user_id="user456",
            name="Alice",
            interests=["python", "music"],
            communication_style="formal",
            relationship_stage="friend",
            trust_level=0.7
        )

        assert profile.name == "Alice"
        assert "python" in profile.interests
        assert profile.communication_style == "formal"
        assert profile.relationship_stage == "friend"

    def test_user_profile_to_dict(self):
        """Test to_dict serialization."""
        from eva_memory import UserProfile

        profile = UserProfile(
            user_id="user789",
            name="Bob",
            interests=["coding"]
        )

        d = profile.to_dict()

        assert d["user_id"] == "user789"
        assert d["name"] == "Bob"
        assert d["interests"] == ["coding"]

    def test_user_profile_defaults(self):
        """Test default values."""
        from eva_memory import UserProfile

        profile = UserProfile(user_id="test")

        assert profile.interests == []
        assert profile.preferences == {}
        assert profile.communication_style == "casual"
        assert profile.emotional_patterns == {}
        assert profile.interaction_count == 0
        assert profile.favorite_topics == []
        assert profile.avoid_topics == []


class TestEvaMemorySystem:
    """Tests for EvaMemorySystem class."""

    @pytest.fixture
    def temp_storage(self):
        """Create temporary storage directory."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_init_creates_storage(self, temp_storage):
        """Test initialization creates storage directory."""
        from eva_memory import EvaMemorySystem

        storage_path = os.path.join(temp_storage, "eva_memory")
        system = EvaMemorySystem(storage_path=storage_path)

        assert os.path.exists(storage_path)

    def test_generate_id_unique(self, temp_storage):
        """Test ID generation is unique."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        id1 = system._generate_id("test content")
        time.sleep(0.001)  # Ensure different timestamp
        id2 = system._generate_id("test content")

        assert id1 != id2
        assert len(id1) == 16
        assert len(id2) == 16

    def test_get_or_create_profile_new(self, temp_storage):
        """Test creating new profile."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("new_user")

        assert profile.user_id == "new_user"
        assert profile.first_interaction is not None

    def test_get_or_create_profile_existing(self, temp_storage):
        """Test retrieving existing profile."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        # Create profile
        profile1 = system.get_or_create_profile("user123")
        profile1.name = "Test User"

        # Retrieve same profile
        profile2 = system.get_or_create_profile("user123")

        assert profile2.name == "Test User"

    def test_update_profile(self, temp_storage):
        """Test updating profile fields."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("user123")

        profile = system.update_profile("user123", name="Updated Name")

        assert profile.name == "Updated Name"
        assert profile.interaction_count == 1

    def test_update_profile_relationship_progression(self, temp_storage):
        """Test relationship stage progression."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("user123")

        # Simulate many interactions
        for _ in range(25):
            profile = system.update_profile("user123")
        profile.trust_level = 0.6
        profile = system.update_profile("user123")

        assert profile.relationship_stage in ["friend", "acquaintance"]

    def test_add_memory_episodic(self, temp_storage):
        """Test adding episodic memory."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        memory = system.add_memory(
            user_id="user123",
            content="User told me about their day",
            memory_type="episodic"
        )

        assert memory.content == "User told me about their day"
        assert memory.memory_type == "episodic"
        assert memory.id is not None

    def test_add_memory_to_session(self, temp_storage):
        """Test memory is added to session memories."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        system.add_memory(
            user_id="user123",
            content="Test memory"
        )

        assert len(system.session_memories["user123"]) == 1

    def test_add_memory_high_importance_to_core(self, temp_storage):
        """Test high importance memories go to core."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        system.add_memory(
            user_id="user123",
            content="Very important memory",
            importance=0.9
        )

        assert len(system.core_memories["user123"]) == 1

    def test_add_memory_with_emotion(self, temp_storage):
        """Test adding memory with emotion."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        memory = system.add_memory(
            user_id="user123",
            content="Sad memory",
            emotion="sadness",
            emotion_intensity=0.7
        )

        assert memory.emotion == "sadness"
        assert memory.emotion_intensity == 0.7

    def test_retrieve_memories_empty(self, temp_storage):
        """Test retrieving when no memories exist."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        memories = system.retrieve_memories("unknown_user", "query")

        assert memories == []

    def test_retrieve_memories_from_session(self, temp_storage):
        """Test retrieving from session memories."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        # Add some memories
        system.add_memory("user123", "First memory")
        system.add_memory("user123", "Second memory about cats")
        system.add_memory("user123", "Third memory about dogs")

        memories = system.retrieve_memories("user123", "pets", n_results=3)

        assert len(memories) >= 1

    def test_get_context_memories(self, temp_storage):
        """Test getting formatted context."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        # Setup user
        profile = system.get_or_create_profile("user123")
        profile.name = "Alice"
        profile.interests = ["coding", "music"]

        context = system.get_context_memories("user123", "Hello!")

        assert "profile" in context
        assert "context_string" in context
        assert "relationship_stage" in context
        assert context["profile"]["name"] == "Alice"

    def test_get_context_memories_includes_core(self, temp_storage):
        """Test context includes core memories."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        # Add core memory
        system.add_memory(
            "user123",
            "User's name is Bob",
            memory_type="semantic",
            importance=0.9
        )

        context = system.get_context_memories("user123", "Hi")

        assert len(context["core_memories"]) >= 1

    def test_extract_and_store_name(self, temp_storage):
        """Test extracting user's name."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("user123")

        system.extract_and_store(
            user_id="user123",
            user_message="Je m'appelle Marie",
            eva_response="Enchanté Marie!"
        )

        profile = system.user_profiles["user123"]
        assert profile.name == "Marie"

    def test_extract_and_store_interest(self, temp_storage):
        """Test extracting user's interest."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("user123")

        system.extract_and_store(
            user_id="user123",
            user_message="J'aime bien la programmation",
            eva_response="Cool!"
        )

        profile = system.user_profiles["user123"]
        assert "la programmation" in profile.interests

    def test_extract_and_store_emotional_patterns(self, temp_storage):
        """Test updating emotional patterns."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("user123")

        system.extract_and_store(
            user_id="user123",
            user_message="Test message",
            eva_response="Response",
            detected_emotion="joy"
        )

        profile = system.user_profiles["user123"]
        assert "joy" in profile.emotional_patterns

    def test_get_proactive_topics(self, temp_storage):
        """Test getting proactive topics."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("user123")
        profile.interests = ["coding", "music"]
        profile.name = "Alice"

        topics = system.get_proactive_topics("user123")

        assert len(topics) > 0
        assert all("topic" in t for t in topics)
        assert all("priority" in t for t in topics)

    def test_get_proactive_topics_sorted_by_priority(self, temp_storage):
        """Test topics are sorted by priority."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("user123")
        profile.interests = ["a", "b", "c"]
        profile.name = "Bob"

        topics = system.get_proactive_topics("user123")

        # Should be sorted descending by priority
        priorities = [t["priority"] for t in topics]
        assert priorities == sorted(priorities, reverse=True)

    def test_consolidate_memories_threshold(self, temp_storage):
        """Test consolidation requires threshold memories."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.consolidation_threshold = 5

        # Add fewer than threshold
        for i in range(3):
            system.add_memory("user123", f"Memory {i}")

        initial_count = len(system.core_memories.get("user123", []))
        system.consolidate_memories("user123")

        # No consolidation should happen
        assert len(system.core_memories.get("user123", [])) == initial_count


class TestGlobalFunctions:
    """Tests for module-level functions."""

    @pytest.fixture
    def temp_storage(self):
        """Create temporary storage directory."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_init_memory_system(self, temp_storage):
        """Test init_memory_system creates instance."""
        from eva_memory import init_memory_system, EvaMemorySystem

        result = init_memory_system(storage_path=temp_storage)

        assert isinstance(result, EvaMemorySystem)

    def test_get_memory_system_after_init(self, temp_storage):
        """Test get_memory_system returns instance after init."""
        from eva_memory import init_memory_system, get_memory_system

        init_memory_system(storage_path=temp_storage)
        result = get_memory_system()

        assert result is not None

    def test_get_memory_system_none_before_init(self):
        """Test get_memory_system returns None before init."""
        import eva_memory

        # Reset global
        eva_memory.eva_memory = None

        result = eva_memory.get_memory_system()

        assert result is None


class TestMemoryPersistence:
    """Tests for memory persistence."""

    @pytest.fixture
    def temp_storage(self):
        """Create temporary storage directory."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_save_and_load_profiles(self, temp_storage):
        """Test profiles are persisted."""
        from eva_memory import EvaMemorySystem

        # Create and save
        system1 = EvaMemorySystem(storage_path=temp_storage)
        profile = system1.get_or_create_profile("user123")
        profile.name = "Persistent User"
        system1._save_profiles()

        # Load in new instance
        system2 = EvaMemorySystem(storage_path=temp_storage)
        loaded_profile = system2.user_profiles.get("user123")

        assert loaded_profile is not None
        assert loaded_profile.name == "Persistent User"

    def test_save_and_load_core_memories(self, temp_storage):
        """Test core memories are persisted."""
        from eva_memory import EvaMemorySystem

        # Create and save
        system1 = EvaMemorySystem(storage_path=temp_storage)
        system1.add_memory(
            "user123",
            "Important memory",
            memory_type="semantic",
            importance=0.9
        )

        # Load in new instance
        system2 = EvaMemorySystem(storage_path=temp_storage)
        core = system2.core_memories.get("user123", [])

        assert len(core) >= 1
        assert core[0].content == "Important memory"
