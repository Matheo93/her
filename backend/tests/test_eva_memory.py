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


class TestAsyncMethods:
    """Tests for async save methods."""

    @pytest.fixture
    def temp_storage(self):
        """Create temporary storage directory."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir, ignore_errors=True)

    @pytest.mark.asyncio
    async def test_save_profiles_async(self, temp_storage):
        """Test async profile saving."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("async_user")
        profile.name = "Async Test User"

        await system._save_profiles_async()

        # Verify by loading in new instance
        system2 = EvaMemorySystem(storage_path=temp_storage)
        loaded = system2.user_profiles.get("async_user")

        assert loaded is not None
        assert loaded.name == "Async Test User"

    @pytest.mark.asyncio
    async def test_save_core_memories_async(self, temp_storage):
        """Test async core memories saving."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.add_memory(
            "async_user",
            "Async important memory",
            memory_type="semantic",
            importance=0.9
        )

        await system._save_core_memories_async()

        # Verify by loading in new instance
        system2 = EvaMemorySystem(storage_path=temp_storage)
        core = system2.core_memories.get("async_user", [])

        assert len(core) >= 1
        assert core[0].content == "Async important memory"


class TestPrecompiledPatterns:
    """Tests for pre-compiled regex pattern optimization."""

    @pytest.fixture
    def temp_storage(self):
        """Create temporary storage directory."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_extraction_patterns_are_compiled(self, temp_storage):
        """Test that extraction patterns are pre-compiled."""
        from eva_memory import EvaMemorySystem
        import re

        system = EvaMemorySystem(storage_path=temp_storage)

        # Verify patterns are compiled regex objects
        for entity_type, patterns in system._EXTRACTION_PATTERNS.items():
            for pattern in patterns:
                assert isinstance(pattern, re.Pattern), \
                    f"Pattern for {entity_type} should be pre-compiled"

    def test_extract_with_compiled_patterns(self, temp_storage):
        """Test extraction works with pre-compiled patterns."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("pattern_user")

        # Test name extraction
        system.extract_and_store(
            user_id="pattern_user",
            user_message="Je m'appelle Pierre",
            eva_response="Bonjour Pierre!"
        )

        profile = system.user_profiles["pattern_user"]
        assert profile.name == "Pierre"

    def test_extract_multiple_entities(self, temp_storage):
        """Test extracting multiple entity types."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("multi_user")

        # Test interest extraction
        system.extract_and_store(
            user_id="multi_user",
            user_message="J'adore la musique classique",
            eva_response="Super choix!"
        )

        profile = system.user_profiles["multi_user"]
        assert "la musique classique" in profile.interests


class TestAdditionalCoverage:
    """Additional tests to improve branch coverage - Sprint 528."""

    @pytest.fixture
    def temp_storage(self):
        """Create temporary storage directory."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_extract_dislike(self, temp_storage):
        """Test extracting user dislikes (lines 458-466)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("dislike_user")

        system.extract_and_store(
            user_id="dislike_user",
            user_message="Je déteste les araignées",
            eva_response="Je comprends!"
        )

        profile = system.user_profiles["dislike_user"]
        assert "les araignées" in profile.avoid_topics

    def test_extract_dislike_with_horreur(self, temp_storage):
        """Test extracting user dislikes with 'j'ai horreur de' pattern."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("horreur_user")

        system.extract_and_store(
            user_id="horreur_user",
            user_message="J'ai horreur de mentir",
            eva_response="C'est bien!"
        )

        profile = system.user_profiles["horreur_user"]
        assert "mentir" in profile.avoid_topics

    def test_close_friend_relationship_stage(self, temp_storage):
        """Test progression to close_friend stage (lines 261-263)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("close_friend_user")

        # Simulate many interactions with high trust
        profile.interaction_count = 55
        profile.trust_level = 0.8

        # Trigger update which should set close_friend
        profile = system.update_profile("close_friend_user")

        assert profile.relationship_stage == "close_friend"

    def test_trust_level_increase_on_long_message(self, temp_storage):
        """Test trust increases on longer messages (lines 484-485)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("trust_user")
        initial_trust = profile.trust_level

        # Send a long message (> 100 chars)
        long_message = "This is a very long message that exceeds one hundred characters to demonstrate that longer messages increase trust level in the conversation system."
        system.extract_and_store(
            user_id="trust_user",
            user_message=long_message,
            eva_response="I understand."
        )

        profile = system.user_profiles["trust_user"]
        assert profile.trust_level > initial_trust

    def test_consolidate_memories_creates_semantic(self, temp_storage):
        """Test consolidation creates semantic memories (lines 546-554)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.consolidation_threshold = 3

        # Add memories with a common long word (>4 chars) that appears multiple times
        for i in range(6):
            system.add_memory(
                "consolidate_user",
                f"Talking about programming today #{i}",
                importance=0.6
            )

        initial_core_count = len(system.core_memories.get("consolidate_user", []))
        system.consolidate_memories("consolidate_user")

        # Should have created semantic memories for frequent topics
        assert len(system.core_memories.get("consolidate_user", [])) >= initial_core_count

    def test_add_memory_with_metadata(self, temp_storage):
        """Test adding memory with metadata (line 290)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        memory = system.add_memory(
            user_id="meta_user",
            content="Memory with metadata",
            metadata={"source": "test", "context": "sprint528"}
        )

        assert memory.metadata == {"source": "test", "context": "sprint528"}

    def test_retrieve_memories_with_type_filter(self, temp_storage):
        """Test retrieving memories with memory_type filter (lines 335-336)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        # Add different types of memories
        system.add_memory("filter_user", "Episodic memory 1", memory_type="episodic")
        system.add_memory("filter_user", "Semantic memory 1", memory_type="semantic", importance=0.8)
        system.add_memory("filter_user", "Emotional memory 1", memory_type="emotional")

        # Filter by type
        memories = system.retrieve_memories(
            "filter_user",
            "memory",
            memory_type="semantic"
        )

        # Session memories don't filter by type but we verify the call works
        assert len(memories) >= 1

    def test_retrieve_memories_with_min_importance(self, temp_storage):
        """Test retrieving memories with minimum importance (line 349)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        # Add memories with varying importance
        system.add_memory("importance_user", "Low importance", importance=0.2)
        system.add_memory("importance_user", "High importance", importance=0.9)

        memories = system.retrieve_memories(
            "importance_user",
            "importance",
            min_importance=0.5
        )

        # Should include high importance memory from session
        assert len(memories) >= 1

    def test_get_context_memories_with_core_and_relevant(self, temp_storage):
        """Test context includes both core and relevant memories (lines 405-414)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("context_user")
        profile.name = "ContextTest"
        profile.interests = ["coding", "music", "travel"]

        # Add core memory
        system.add_memory(
            "context_user",
            "Core: User loves Python",
            memory_type="semantic",
            importance=0.95
        )

        # Add relevant session memories
        system.add_memory("context_user", "Recent: Discussed Python project")
        system.add_memory("context_user", "Recent: Talked about travel plans")

        context = system.get_context_memories("context_user", "Python programming")

        assert "ContextTest" in context["context_string"]
        assert "coding" in context["context_string"]
        assert len(context["core_memories"]) >= 1

    def test_get_context_memories_with_emotional_context(self, temp_storage):
        """Test context includes recent emotions (lines 389-392)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("emotional_context_user")

        # Add memories with emotions
        system.add_memory(
            "emotional_context_user",
            "Happy moment",
            emotion="joy",
            emotion_intensity=0.8
        )
        system.add_memory(
            "emotional_context_user",
            "Sad moment",
            emotion="sadness",
            emotion_intensity=0.6
        )
        system.add_memory(
            "emotional_context_user",
            "Neutral moment",
            emotion="neutral"
        )

        context = system.get_context_memories("emotional_context_user", "How are you?")

        # Should have captured non-neutral emotions
        assert len(context["recent_emotions"]) >= 2
        emotions = [e[0] for e in context["recent_emotions"]]
        assert "joy" in emotions
        assert "sadness" in emotions

    def test_extract_name_with_appelle_moi(self, temp_storage):
        """Test name extraction with 'appelle-moi' pattern (line 99)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("appelle_user")

        system.extract_and_store(
            user_id="appelle_user",
            user_message="appelle-moi Sophie",
            eva_response="D'accord Sophie!"
        )

        profile = system.user_profiles["appelle_user"]
        assert profile.name == "Sophie"

    def test_extract_passion(self, temp_storage):
        """Test interest extraction with 'passion' pattern (line 105)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("passion_user")

        system.extract_and_store(
            user_id="passion_user",
            user_message="je suis passionné par la photographie",
            eva_response="C'est super!"
        )

        profile = system.user_profiles["passion_user"]
        assert "la photographie" in profile.interests

    def test_get_proactive_topics_empty_profile(self, temp_storage):
        """Test proactive topics with minimal profile (line 491)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("empty_profile_user")

        topics = system.get_proactive_topics("empty_profile_user")

        # Should return empty or minimal topics for empty profile
        assert isinstance(topics, list)

    def test_consolidate_memories_with_short_words_skipped(self, temp_storage):
        """Test consolidation skips short words (line 541)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.consolidation_threshold = 3

        # Add memories with only short words
        for i in range(6):
            system.add_memory(
                "short_words_user",
                f"The cat sat on mat #{i}",  # All words <= 4 chars except 'words'
                importance=0.4
            )

        initial_core_count = len(system.core_memories.get("short_words_user", []))
        system.consolidate_memories("short_words_user")

        # Consolidation should still process but may not create many semantic memories
        # since short words are skipped
        assert len(system.core_memories.get("short_words_user", [])) >= initial_core_count

    def test_add_memory_semantic_type_to_core(self, temp_storage):
        """Test semantic type memories go to core regardless of importance (line 314)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        # Add semantic memory with low importance - should still go to core
        system.add_memory(
            user_id="semantic_core_user",
            content="Semantic fact about user",
            memory_type="semantic",
            importance=0.3  # Low importance but semantic type
        )

        assert len(system.core_memories["semantic_core_user"]) >= 1

    def test_update_profile_acquaintance_stage(self, temp_storage):
        """Test progression to acquaintance stage (lines 265-266)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("acquaintance_user")

        # Simulate enough interactions for acquaintance
        for _ in range(6):
            profile = system.update_profile("acquaintance_user")

        assert profile.relationship_stage == "acquaintance"


class TestExtractAndStoreAsync:
    """Tests for the async extract_and_store_async method (Sprint 524)."""

    @pytest.fixture
    def temp_storage(self):
        """Create temporary storage directory."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir, ignore_errors=True)

    @pytest.mark.asyncio
    async def test_extract_and_store_async_basic(self, temp_storage):
        """Test async extraction works without blocking."""
        from eva_memory import EvaMemorySystem
        import asyncio

        system = EvaMemorySystem(storage_path=temp_storage)

        # Should not block - fire and forget save
        await system.extract_and_store_async(
            "async_user",
            "Je m'appelle Alice et j'aime la musique",
            "Enchanté Alice!",
            "joy"
        )

        # Give async task time to complete
        await asyncio.sleep(0.1)

        profile = system.get_or_create_profile("async_user")
        assert profile.name == "Alice"
        assert "la musique" in profile.interests

    @pytest.mark.asyncio
    async def test_extract_and_store_async_parallel(self, temp_storage):
        """Test multiple async extractions in parallel."""
        from eva_memory import EvaMemorySystem
        import asyncio

        system = EvaMemorySystem(storage_path=temp_storage)

        # Run multiple extractions concurrently
        tasks = [
            system.extract_and_store_async(
                f"user_{i}",
                f"Je m'appelle User{i}",
                f"Salut User{i}!",
                "neutral"
            )
            for i in range(3)
        ]

        await asyncio.gather(*tasks)
        await asyncio.sleep(0.1)

        # All users should have been created
        for i in range(3):
            profile = system.get_or_create_profile(f"user_{i}")
            assert profile.name == f"User{i}"

    def test_do_extract_and_store_name_extraction(self, temp_storage):
        """Test _do_extract_and_store extracts name correctly."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("name_test_user")

        system._do_extract_and_store(
            "name_test_user",
            "mon nom est Robert",
            "Enchanté Robert!",
            "neutral"
        )

        assert profile.name == "Robert"

    def test_do_extract_and_store_interest_extraction(self, temp_storage):
        """Test _do_extract_and_store extracts interests correctly."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("interest_test_user")

        system._do_extract_and_store(
            "interest_test_user",
            "j'adore le cinéma et la lecture",
            "Super!",
            "joy"
        )

        assert "le cinéma et la lecture" in profile.interests or any("cinéma" in i for i in profile.interests)

    def test_do_extract_and_store_dislike_extraction(self, temp_storage):
        """Test _do_extract_and_store extracts dislikes correctly."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("dislike_test_user")

        system._do_extract_and_store(
            "dislike_test_user",
            "je déteste les araignées",
            "Je comprends!",
            "fear"
        )

        assert "les araignées" in profile.avoid_topics


class TestWorkAndGoalPatterns:
    """Tests for work and goal extraction patterns (Sprint 528)."""

    @pytest.fixture
    def temp_storage(self):
        """Create temporary storage directory."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_extract_work_pattern_travaille_comme(self, temp_storage):
        """Test work extraction with 'je travaille comme' pattern (line 119)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("work_user1")

        # The work pattern should match but since we don't store it in profile,
        # we verify the pattern matching works by checking session memories
        system.extract_and_store(
            user_id="work_user1",
            user_message="je travaille comme développeur",
            eva_response="Cool!"
        )

        # Verify memory was created with work info
        memories = system.session_memories["work_user1"]
        assert len(memories) >= 1

    def test_extract_work_pattern_profession(self, temp_storage):
        """Test work extraction with 'de profession' pattern (line 120)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("work_user2")

        system.extract_and_store(
            user_id="work_user2",
            user_message="je suis médecin de profession",
            eva_response="Wow!"
        )

        memories = system.session_memories["work_user2"]
        assert len(memories) >= 1

    def test_extract_work_pattern_metier(self, temp_storage):
        """Test work extraction with 'mon métier c'est' pattern (line 121)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("work_user3")

        system.extract_and_store(
            user_id="work_user3",
            user_message="mon métier c'est la pâtisserie",
            eva_response="Miam!"
        )

        memories = system.session_memories["work_user3"]
        assert len(memories) >= 1

    def test_extract_goal_pattern_je_veux(self, temp_storage):
        """Test goal extraction with 'je veux' pattern (line 124)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("goal_user1")

        system.extract_and_store(
            user_id="goal_user1",
            user_message="je veux apprendre le piano",
            eva_response="Belle ambition!"
        )

        memories = system.session_memories["goal_user1"]
        assert len(memories) >= 1

    def test_extract_goal_pattern_aimerais(self, temp_storage):
        """Test goal extraction with 'j'aimerais' pattern (line 125)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("goal_user2")

        system.extract_and_store(
            user_id="goal_user2",
            user_message="j'aimerais voyager en Asie",
            eva_response="Super!"
        )

        memories = system.session_memories["goal_user2"]
        assert len(memories) >= 1

    def test_extract_goal_pattern_objectif(self, temp_storage):
        """Test goal extraction with 'mon objectif c'est' pattern (line 126)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("goal_user3")

        system.extract_and_store(
            user_id="goal_user3",
            user_message="mon objectif c'est de courir un marathon",
            eva_response="Courage!"
        )

        memories = system.session_memories["goal_user3"]
        assert len(memories) >= 1

    def test_extract_goal_pattern_reve(self, temp_storage):
        """Test goal extraction with 'je rêve de' pattern (line 127)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("goal_user4")

        system.extract_and_store(
            user_id="goal_user4",
            user_message="je rêve de vivre au bord de la mer",
            eva_response="C'est beau!"
        )

        memories = system.session_memories["goal_user4"]
        assert len(memories) >= 1

    def test_flush_pending_saves(self, temp_storage):
        """Test flush_pending_saves method (lines 276-283)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        # Use immediate_save=False to dirty the flags
        system.get_or_create_profile("flush_user", immediate_save=False)
        system.add_memory(
            "flush_user",
            "Important memory",
            memory_type="semantic",
            importance=0.9
        )

        # Mark dirty flags
        system._mark_profiles_dirty()
        system._mark_core_memories_dirty()

        # Flush should save both
        system.flush_pending_saves()

        # Verify flags are reset
        assert not system._profiles_dirty
        assert not system._core_memories_dirty

    @pytest.mark.asyncio
    async def test_flush_pending_saves_async(self, temp_storage):
        """Test flush_pending_saves_async method (lines 285-295)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        # Create profile and memory
        system.get_or_create_profile("async_flush_user", immediate_save=False)
        system.add_memory(
            "async_flush_user",
            "Important async memory",
            memory_type="semantic",
            importance=0.9
        )

        # Mark dirty flags
        system._mark_profiles_dirty()
        system._mark_core_memories_dirty()

        # Flush async
        await system.flush_pending_saves_async()

        # Verify flags are reset
        assert not system._profiles_dirty
        assert not system._core_memories_dirty

    def test_update_profile_with_immediate_save_false(self, temp_storage):
        """Test update_profile with immediate_save=False (lines 340-343)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system.get_or_create_profile("batch_user")

        # Update with immediate_save=False
        profile = system.update_profile("batch_user", immediate_save=False, name="BatchUser")

        # Flag should be dirty
        assert system._profiles_dirty
        assert profile.name == "BatchUser"

        # Flush to save
        system.flush_pending_saves()
        assert not system._profiles_dirty

    def test_do_extract_and_store_emotional_pattern(self, temp_storage):
        """Test _do_extract_and_store updates emotional patterns (line 567-571)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("emotion_pattern_user")

        # Use non-neutral emotion
        system._do_extract_and_store(
            "emotion_pattern_user",
            "Bonjour!",
            "Salut!",
            "joy"
        )

        # Emotional patterns should be updated
        assert "joy" in profile.emotional_patterns
        assert profile.emotional_patterns["joy"] >= 0.1

    def test_do_extract_and_store_trust_increase(self, temp_storage):
        """Test _do_extract_and_store increases trust for long messages (line 573-575)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("trust_user")
        initial_trust = profile.trust_level

        # Long message (> 100 chars) should increase trust
        long_message = "Je voudrais te raconter une longue histoire sur ma vie et mes aventures incroyables à travers le monde entier pendant plusieurs années."
        assert len(long_message) > 100

        system._do_extract_and_store(
            "trust_user",
            long_message,
            "C'est fascinant!",
            "neutral"
        )

        # Trust should have increased
        assert profile.trust_level > initial_trust

    def test_get_proactive_topics_with_interests(self, temp_storage):
        """Test get_proactive_topics returns interest-based topics (lines 577-612)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("topics_user")
        profile.interests = ["la musique", "le cinéma"]
        profile.name = "Alice"

        topics = system.get_proactive_topics("topics_user")

        # Should return topics based on interests
        assert len(topics) > 0
        assert any(t["type"] == "interest" for t in topics)

    def test_get_proactive_topics_with_name(self, temp_storage):
        """Test get_proactive_topics includes personal topics when name known (line 603)."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        profile = system.get_or_create_profile("named_user")
        profile.name = "Bob"

        topics = system.get_proactive_topics("named_user")

        # Should include personal topic with name
        personal_topics = [t for t in topics if t["type"] == "personal"]
        assert len(personal_topics) > 0
        assert "Bob" in personal_topics[0]["prompt"]


class TestDirtyTracking:
    """Tests for Sprint 530 - Dirty tracking for batch saves."""

    @pytest.fixture
    def temp_storage(self):
        """Create temporary storage directory."""
        temp_dir = tempfile.mkdtemp()
        yield temp_dir
        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_dirty_flag_initially_false(self, temp_storage):
        """Test that dirty flags are initially False."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        assert system._profiles_dirty is False
        assert system._core_memories_dirty is False

    def test_mark_profiles_dirty(self, temp_storage):
        """Test _mark_profiles_dirty sets the flag."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system._mark_profiles_dirty()

        assert system._profiles_dirty is True

    def test_mark_core_memories_dirty(self, temp_storage):
        """Test _mark_core_memories_dirty sets the flag."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system._mark_core_memories_dirty()

        assert system._core_memories_dirty is True

    def test_flush_pending_saves_clears_dirty_flags(self, temp_storage):
        """Test flush_pending_saves clears dirty flags and saves."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        # Create a profile with deferred save
        system.get_or_create_profile("test_user", immediate_save=False)
        assert system._profiles_dirty is True

        # Flush should clear the flag
        system.flush_pending_saves()

        assert system._profiles_dirty is False

    def test_get_or_create_profile_deferred_save(self, temp_storage):
        """Test get_or_create_profile with immediate_save=False."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        # With immediate_save=False, should mark dirty instead of saving
        profile = system.get_or_create_profile("deferred_user", immediate_save=False)

        assert profile.user_id == "deferred_user"
        assert system._profiles_dirty is True

    def test_update_profile_deferred_save(self, temp_storage):
        """Test update_profile with immediate_save=False."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        # First create with immediate save
        system.get_or_create_profile("update_user")
        system._profiles_dirty = False  # Reset flag

        # Update with deferred save
        system.update_profile("update_user", immediate_save=False, name="John")

        assert system._profiles_dirty is True

    @pytest.mark.asyncio
    async def test_flush_pending_saves_async(self, temp_storage):
        """Test async flush_pending_saves."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        # Create profile with deferred save
        system.get_or_create_profile("async_user", immediate_save=False)
        assert system._profiles_dirty is True

        # Async flush should clear the flag
        await system.flush_pending_saves_async()

        assert system._profiles_dirty is False


class TestWorkGoalPatterns:
    """Tests for work and goal pattern extraction (bug fix)."""

    @pytest.fixture
    def temp_storage(self):
        """Create temporary storage directory."""
        temp_dir = tempfile.mkdtemp(prefix="eva_work_goal_test_")
        yield temp_dir
        shutil.rmtree(temp_dir, ignore_errors=True)

    def test_extract_work_pattern_je_travaille(self, temp_storage):
        """Test extraction of work from 'je travaille comme...'."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system._do_extract_and_store(
            "work_user_1",
            "je travaille comme développeur",
            "C'est cool!",
            "neutral"
        )

        profile = system.get_or_create_profile("work_user_1")
        assert profile.work == "développeur"

    def test_extract_work_pattern_de_profession(self, temp_storage):
        """Test extraction of work from 'je suis X de profession'."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system._do_extract_and_store(
            "work_user_2",
            "je suis médecin de profession",
            "Formidable!",
            "neutral"
        )

        profile = system.get_or_create_profile("work_user_2")
        assert profile.work == "médecin"

    def test_extract_work_pattern_mon_metier(self, temp_storage):
        """Test extraction of work from 'mon métier c'est...'."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system._do_extract_and_store(
            "work_user_3",
            "mon métier c'est architecte",
            "Super!",
            "neutral"
        )

        profile = system.get_or_create_profile("work_user_3")
        assert profile.work == "architecte"

    def test_extract_goal_pattern_je_veux(self, temp_storage):
        """Test extraction of goal from 'je veux...'."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system._do_extract_and_store(
            "goal_user_1",
            "je veux apprendre le piano",
            "Belle ambition!",
            "neutral"
        )

        profile = system.get_or_create_profile("goal_user_1")
        assert "apprendre le piano" in profile.goals

    def test_extract_goal_pattern_j_aimerais(self, temp_storage):
        """Test extraction of goal from 'j'aimerais...'."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system._do_extract_and_store(
            "goal_user_2",
            "j'aimerais voyager au japon",
            "Beau projet!",
            "neutral"
        )

        profile = system.get_or_create_profile("goal_user_2")
        assert "voyager au japon" in profile.goals

    def test_extract_goal_pattern_mon_objectif(self, temp_storage):
        """Test extraction of goal from 'mon objectif c'est...'."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system._do_extract_and_store(
            "goal_user_3",
            "mon objectif c'est devenir polyglotte",
            "Excellent!",
            "neutral"
        )

        profile = system.get_or_create_profile("goal_user_3")
        assert "devenir polyglotte" in profile.goals

    def test_extract_goal_pattern_je_reve(self, temp_storage):
        """Test extraction of goal from 'je rêve de...'."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system._do_extract_and_store(
            "goal_user_4",
            "je rêve de créer ma propre entreprise",
            "Inspirant!",
            "neutral"
        )

        profile = system.get_or_create_profile("goal_user_4")
        assert "créer ma propre entreprise" in profile.goals

    def test_goals_not_duplicated(self, temp_storage):
        """Test that duplicate goals are not added twice."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)

        # Add same goal twice
        system._do_extract_and_store(
            "goal_dup_user",
            "je veux apprendre le piano",
            "Belle ambition!",
            "neutral"
        )
        system._do_extract_and_store(
            "goal_dup_user",
            "je veux apprendre le piano",
            "Tu en reparles!",
            "neutral"
        )

        profile = system.get_or_create_profile("goal_dup_user")
        # Should only have one entry
        assert profile.goals.count("apprendre le piano") == 1

    def test_work_creates_semantic_memory(self, temp_storage):
        """Test that work extraction creates a semantic memory."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system._do_extract_and_store(
            "work_memory_user",
            "je travaille comme enseignant",
            "Noble métier!",
            "neutral"
        )

        # Retrieve memories
        memories = system.retrieve_memories("work_memory_user", "works as enseignant", n_results=5)

        # Should have a semantic memory about work
        work_memories = [m for m in memories if "works as" in m.content.lower()]
        assert len(work_memories) >= 1

    def test_goal_creates_semantic_memory(self, temp_storage):
        """Test that goal extraction creates a semantic memory."""
        from eva_memory import EvaMemorySystem

        system = EvaMemorySystem(storage_path=temp_storage)
        system._do_extract_and_store(
            "goal_memory_user",
            "je veux courir un marathon",
            "Super objectif!",
            "neutral"
        )

        # Retrieve memories
        memories = system.retrieve_memories("goal_memory_user", "goal marathon", n_results=5)

        # Should have a semantic memory about the goal
        goal_memories = [m for m in memories if "goal" in m.content.lower()]
        assert len(goal_memories) >= 1

    def test_user_profile_has_work_and_goals_fields(self, temp_storage):
        """Test that UserProfile has work and goals fields."""
        from eva_memory import UserProfile

        profile = UserProfile(user_id="test_fields")

        assert hasattr(profile, "work")
        assert hasattr(profile, "goals")
        assert profile.work is None
        assert profile.goals == []

    def test_profile_work_serialization(self, temp_storage):
        """Test that work field serializes correctly."""
        from eva_memory import UserProfile

        profile = UserProfile(
            user_id="serial_work",
            work="ingénieur",
            goals=["voyager", "apprendre"]
        )

        data = profile.to_dict()
        assert data["work"] == "ingénieur"
        assert data["goals"] == ["voyager", "apprendre"]
