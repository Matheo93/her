"""
EVA Long-Term Memory System
Based on Mem0 architecture + ChromaDB for local storage
Implements: Episodic → Semantic consolidation, Emotional tagging, Relationship building
"""

import os
import json
import time
import hashlib
import re
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field, asdict
from collections import defaultdict
from functools import lru_cache
import asyncio

# Optional async file I/O
try:
    import aiofiles
    AIOFILES_AVAILABLE = True
except ImportError:
    AIOFILES_AVAILABLE = False

# Vector database for semantic search
try:
    import chromadb
    from chromadb.config import Settings
    CHROMA_AVAILABLE = True
except ImportError:
    CHROMA_AVAILABLE = False
    print("⚠️ ChromaDB not available - memory will be session-only")

# Mem0 for memory management
try:
    from mem0 import Memory
    MEM0_AVAILABLE = True
except ImportError:
    MEM0_AVAILABLE = False
    print("⚠️ Mem0 not available - using custom memory system")


@dataclass
class MemoryEntry:
    """Single memory entry with emotional tagging"""
    id: str
    content: str
    memory_type: str  # episodic, semantic, emotional
    timestamp: float
    emotion: str = "neutral"
    emotion_intensity: float = 0.5
    importance: float = 0.5  # 0-1 scale
    access_count: int = 0
    last_accessed: float = 0
    related_memories: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> 'MemoryEntry':
        return cls(**data)


@dataclass
class UserProfile:
    """User profile built from memories"""
    user_id: str
    name: Optional[str] = None
    interests: List[str] = field(default_factory=list)
    preferences: Dict[str, Any] = field(default_factory=dict)
    communication_style: str = "casual"
    emotional_patterns: Dict[str, float] = field(default_factory=dict)
    relationship_stage: str = "new"  # new, acquaintance, friend, close_friend
    trust_level: float = 0.3
    interaction_count: int = 0
    first_interaction: Optional[float] = None
    last_interaction: Optional[float] = None
    favorite_topics: List[str] = field(default_factory=list)
    avoid_topics: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


class EvaMemorySystem:
    """
    Long-term memory system for Eva

    Architecture:
    - Core Memory: Always in context (user profile, relationship state)
    - Episodic Memory: Specific events with timestamps
    - Semantic Memory: General facts consolidated from episodic
    - Emotional Memory: Emotional context and patterns
    """

    # Pre-compiled regex patterns for entity extraction (performance optimization)
    _EXTRACTION_PATTERNS: Dict[str, List[re.Pattern]] = {
        "name": [
            re.compile(r"je m'appelle (\w+)"),
            re.compile(r"mon nom est (\w+)"),
            re.compile(r"c'est (\w+)"),
            re.compile(r"appelle[- ]moi (\w+)")
        ],
        "interest": [
            re.compile(r"j'aime (?:bien )?(.+?)(?:\.|,|$)"),
            re.compile(r"j'adore (.+?)(?:\.|,|$)"),
            re.compile(r"je suis passionné par (.+?)(?:\.|,|$)"),
            re.compile(r"(?:mon|ma) passion c'est (.+?)(?:\.|,|$)")
        ],
        "dislike": [
            re.compile(r"je n'aime pas (.+?)(?:\.|,|$)"),
            re.compile(r"je déteste (.+?)(?:\.|,|$)"),
            re.compile(r"j'ai horreur de (.+?)(?:\.|,|$)")
        ],
        "work": [
            re.compile(r"je travaille (?:comme |en tant que )?(.+?)(?:\.|,|$)"),
            re.compile(r"je suis (.+?) de profession"),
            re.compile(r"mon (?:métier|travail|job) c'est (.+?)(?:\.|,|$)")
        ],
        "goal": [
            re.compile(r"je veux (.+?)(?:\.|,|$)"),
            re.compile(r"j'aimerais (.+?)(?:\.|,|$)"),
            re.compile(r"mon objectif c'est (.+?)(?:\.|,|$)"),
            re.compile(r"je rêve de (.+?)(?:\.|,|$)")
        ]
    }

    def __init__(self, storage_path: str = "./eva_memory"):
        self.storage_path = storage_path
        os.makedirs(storage_path, exist_ok=True)

        # Initialize ChromaDB for vector storage
        self.chroma_client = None
        self.collection = None
        if CHROMA_AVAILABLE:
            try:
                self.chroma_client = chromadb.PersistentClient(
                    path=os.path.join(storage_path, "chroma_db"),
                    settings=Settings(anonymized_telemetry=False)
                )
                self.collection = self.chroma_client.get_or_create_collection(
                    name="eva_memories",
                    metadata={"hnsw:space": "cosine"}
                )
                print("✅ ChromaDB initialized for long-term memory")
            except Exception as e:
                print(f"⚠️ ChromaDB init failed: {e}")

        # In-memory caches
        self.user_profiles: Dict[str, UserProfile] = {}
        self.session_memories: Dict[str, List[MemoryEntry]] = defaultdict(list)
        self.core_memories: Dict[str, List[MemoryEntry]] = defaultdict(list)

        # Memory consolidation settings
        self.consolidation_threshold = 5  # Consolidate after N similar memories
        self.decay_rate = 0.1  # Memory importance decay per day
        self.max_context_memories = 10  # Max memories to include in context

        # Load persisted data
        self._load_profiles()
        self._load_core_memories()

        print("✅ Eva Memory System initialized")

    def _generate_id(self, content: str) -> str:
        """Generate unique memory ID"""
        timestamp = str(time.time())
        return hashlib.md5(f"{content}{timestamp}".encode()).hexdigest()[:16]

    def _load_profiles(self):
        """Load user profiles from disk"""
        profiles_path = os.path.join(self.storage_path, "profiles.json")
        if os.path.exists(profiles_path):
            try:
                with open(profiles_path, 'r') as f:
                    data = json.load(f)
                    for user_id, profile_data in data.items():
                        self.user_profiles[user_id] = UserProfile(**profile_data)
                print(f"📚 Loaded {len(self.user_profiles)} user profiles")
            except Exception as e:
                print(f"⚠️ Failed to load profiles: {e}")

    def _save_profiles(self):
        """Save user profiles to disk (sync version for backwards compat)"""
        profiles_path = os.path.join(self.storage_path, "profiles.json")
        try:
            data = {uid: profile.to_dict() for uid, profile in self.user_profiles.items()}
            with open(profiles_path, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"⚠️ Failed to save profiles: {e}")

    async def _save_profiles_async(self):
        """Save user profiles to disk asynchronously for better latency"""
        profiles_path = os.path.join(self.storage_path, "profiles.json")
        try:
            data = {uid: profile.to_dict() for uid, profile in self.user_profiles.items()}
            async with aiofiles.open(profiles_path, 'w') as f:
                await f.write(json.dumps(data, indent=2))
        except Exception as e:
            print(f"⚠️ Failed to save profiles async: {e}")

    def _load_core_memories(self):
        """Load core memories from disk"""
        core_path = os.path.join(self.storage_path, "core_memories.json")
        if os.path.exists(core_path):
            try:
                with open(core_path, 'r') as f:
                    data = json.load(f)
                    for user_id, memories in data.items():
                        self.core_memories[user_id] = [
                            MemoryEntry.from_dict(m) for m in memories
                        ]
                print(f"🧠 Loaded core memories for {len(self.core_memories)} users")
            except Exception as e:
                print(f"⚠️ Failed to load core memories: {e}")

    def _save_core_memories(self):
        """Save core memories to disk (sync version for backwards compat)"""
        core_path = os.path.join(self.storage_path, "core_memories.json")
        try:
            data = {
                uid: [m.to_dict() for m in memories]
                for uid, memories in self.core_memories.items()
            }
            with open(core_path, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"⚠️ Failed to save core memories: {e}")

    async def _save_core_memories_async(self):
        """Save core memories to disk asynchronously for better latency"""
        core_path = os.path.join(self.storage_path, "core_memories.json")
        try:
            data = {
                uid: [m.to_dict() for m in memories]
                for uid, memories in self.core_memories.items()
            }
            async with aiofiles.open(core_path, 'w') as f:
                await f.write(json.dumps(data, indent=2))
        except Exception as e:
            print(f"⚠️ Failed to save core memories async: {e}")

    def get_or_create_profile(self, user_id: str) -> UserProfile:
        """Get or create user profile"""
        if user_id not in self.user_profiles:
            self.user_profiles[user_id] = UserProfile(
                user_id=user_id,
                first_interaction=time.time()
            )
            self._save_profiles()
        return self.user_profiles[user_id]

    def update_profile(self, user_id: str, **kwargs):
        """Update user profile fields"""
        profile = self.get_or_create_profile(user_id)
        for key, value in kwargs.items():
            if hasattr(profile, key):
                setattr(profile, key, value)
        profile.last_interaction = time.time()
        profile.interaction_count += 1

        # Update relationship stage based on interactions
        if profile.interaction_count > 50 and profile.trust_level > 0.7:
            profile.relationship_stage = "close_friend"
        elif profile.interaction_count > 20 and profile.trust_level > 0.5:
            profile.relationship_stage = "friend"
        elif profile.interaction_count > 5:
            profile.relationship_stage = "acquaintance"

        self._save_profiles()
        return profile

    def add_memory(
        self,
        user_id: str,
        content: str,
        memory_type: str = "episodic",
        emotion: str = "neutral",
        emotion_intensity: float = 0.5,
        importance: float = 0.5,
        metadata: Optional[Dict] = None
    ) -> MemoryEntry:
        """Add a new memory"""
        memory = MemoryEntry(
            id=self._generate_id(content),
            content=content,
            memory_type=memory_type,
            timestamp=time.time(),
            emotion=emotion,
            emotion_intensity=emotion_intensity,
            importance=importance,
            metadata=metadata or {}
        )

        # Add to session memories
        self.session_memories[user_id].append(memory)

        # Add to vector store for retrieval
        if self.collection is not None:
            try:
                self.collection.add(
                    ids=[memory.id],
                    documents=[content],
                    metadatas=[{
                        "user_id": user_id,
                        "memory_type": memory_type,
                        "emotion": emotion,
                        "importance": str(importance),
                        "timestamp": str(memory.timestamp)
                    }]
                )
            except Exception as e:
                print(f"⚠️ Failed to add to vector store: {e}")

        # Check if should consolidate to core memory
        if importance > 0.7 or memory_type == "semantic":
            self.core_memories[user_id].append(memory)
            self._save_core_memories()

        return memory

    def retrieve_memories(
        self,
        user_id: str,
        query: str,
        n_results: int = 5,
        memory_type: Optional[str] = None,
        min_importance: float = 0.0
    ) -> List[MemoryEntry]:
        """Retrieve relevant memories using semantic search"""
        memories = []

        if self.collection is not None:
            try:
                # Build filter
                where_filter = {"user_id": user_id}
                if memory_type:
                    where_filter["memory_type"] = memory_type

                results = self.collection.query(
                    query_texts=[query],
                    n_results=n_results * 2,  # Get extra for filtering
                    where=where_filter
                )

                if results and results['documents']:
                    for i, doc in enumerate(results['documents'][0]):
                        meta = results['metadatas'][0][i] if results['metadatas'] else {}
                        importance = float(meta.get('importance', 0.5))

                        if importance >= min_importance:
                            memory = MemoryEntry(
                                id=results['ids'][0][i],
                                content=doc,
                                memory_type=meta.get('memory_type', 'episodic'),
                                timestamp=float(meta.get('timestamp', time.time())),
                                emotion=meta.get('emotion', 'neutral'),
                                importance=importance
                            )
                            memories.append(memory)

                            if len(memories) >= n_results:
                                break

            except Exception as e:
                print(f"⚠️ Memory retrieval failed: {e}")

        # Also include recent session memories
        session_mems = self.session_memories.get(user_id, [])[-n_results:]
        for mem in session_mems:
            if mem not in memories:
                memories.append(mem)

        # Sort by relevance (importance * recency)
        now = time.time()
        memories.sort(key=lambda m: m.importance * (1 - (now - m.timestamp) / 86400), reverse=True)

        return memories[:n_results]

    def get_context_memories(self, user_id: str, current_message: str) -> Dict[str, Any]:
        """Get memories formatted for LLM context"""
        profile = self.get_or_create_profile(user_id)

        # Core memories (always included)
        core = self.core_memories.get(user_id, [])[-5:]

        # Relevant memories based on current message
        relevant = self.retrieve_memories(user_id, current_message, n_results=5)

        # Recent emotional context
        recent_emotions = []
        for mem in self.session_memories.get(user_id, [])[-10:]:
            if mem.emotion != "neutral":
                recent_emotions.append((mem.emotion, mem.emotion_intensity))

        # Build context string
        context_parts = []

        # User profile summary
        if profile.name:
            context_parts.append(f"User: {profile.name}")
        if profile.interests:
            context_parts.append(f"Interests: {', '.join(profile.interests[:5])}")
        context_parts.append(f"Relationship: {profile.relationship_stage}")

        # Core memories
        if core:
            context_parts.append("\nCore memories:")
            for mem in core:
                context_parts.append(f"- {mem.content}")

        # Relevant memories
        if relevant:
            context_parts.append("\nRelevant context:")
            for mem in relevant:
                context_parts.append(f"- {mem.content}")

        return {
            "profile": profile.to_dict(),
            "context_string": "\n".join(context_parts),
            "core_memories": [m.to_dict() for m in core],
            "relevant_memories": [m.to_dict() for m in relevant],
            "recent_emotions": recent_emotions,
            "relationship_stage": profile.relationship_stage,
            "trust_level": profile.trust_level
        }

    def extract_and_store(self, user_id: str, user_message: str, eva_response: str, detected_emotion: str = "neutral"):
        """Extract important information and store as memories.

        Uses pre-compiled regex patterns for optimized performance.
        """
        profile = self.get_or_create_profile(user_id)
        message_lower = user_message.lower()

        # Extract entities using pre-compiled patterns
        for entity_type, compiled_patterns in self._EXTRACTION_PATTERNS.items():
            for pattern in compiled_patterns:
                match = pattern.search(message_lower)
                if match:
                    value = match.group(1).strip()

                    if entity_type == "name" and len(value) > 1:
                        profile.name = value.capitalize()
                        self.add_memory(
                            user_id,
                            f"User's name is {value.capitalize()}",
                            memory_type="semantic",
                            importance=0.9
                        )
                    elif entity_type == "interest":
                        if value not in profile.interests:
                            profile.interests.append(value)
                        self.add_memory(
                            user_id,
                            f"User likes/loves: {value}",
                            memory_type="semantic",
                            importance=0.7
                        )
                    elif entity_type == "dislike":
                        if value not in profile.avoid_topics:
                            profile.avoid_topics.append(value)
                        self.add_memory(
                            user_id,
                            f"User dislikes: {value}",
                            memory_type="semantic",
                            importance=0.6
                        )

        # Store episodic memory of this interaction
        self.add_memory(
            user_id,
            f"User said: '{user_message[:100]}' - Eva replied about {eva_response[:50]}...",
            memory_type="episodic",
            emotion=detected_emotion,
            importance=0.4
        )

        # Update emotional patterns
        if detected_emotion != "neutral":
            emotions = profile.emotional_patterns
            emotions[detected_emotion] = emotions.get(detected_emotion, 0) + 0.1
            profile.emotional_patterns = emotions

        # Update trust based on conversation depth
        if len(user_message) > 100:  # Longer messages = more trust
            profile.trust_level = min(1.0, profile.trust_level + 0.01)

        self._save_profiles()

    def get_proactive_topics(self, user_id: str) -> List[Dict[str, Any]]:
        """Get topics Eva could proactively bring up"""
        profile = self.get_or_create_profile(user_id)
        topics = []

        # Interests not discussed recently
        for interest in profile.interests[:5]:
            topics.append({
                "type": "interest",
                "topic": interest,
                "prompt": f"Tu m'as parlé de {interest}... ça avance comment ?",
                "priority": 0.7
            })

        # Goals to follow up on
        goal_memories = self.retrieve_memories(user_id, "objectif projet rêve", n_results=3, memory_type="semantic")
        for mem in goal_memories:
            if "objectif" in mem.content.lower() or "projet" in mem.content.lower():
                topics.append({
                    "type": "goal",
                    "topic": mem.content,
                    "prompt": f"Et ton projet dont tu m'avais parlé ?",
                    "priority": 0.8
                })

        # Name callback if known
        if profile.name:
            topics.append({
                "type": "personal",
                "topic": "name",
                "prompt": f"Hey {profile.name}...",
                "priority": 0.5
            })

        topics.sort(key=lambda x: x["priority"], reverse=True)
        return topics[:3]

    def consolidate_memories(self, user_id: str):
        """Consolidate episodic memories into semantic knowledge"""
        session_mems = self.session_memories.get(user_id, [])

        if len(session_mems) < self.consolidation_threshold:
            return

        # Group by similarity (simple keyword matching for now)
        # In production, use embeddings for clustering
        topic_groups = defaultdict(list)

        for mem in session_mems:
            # Simple topic extraction
            words = mem.content.lower().split()
            for word in words:
                if len(word) > 4:  # Skip short words
                    topic_groups[word].append(mem)

        # Consolidate groups with multiple memories
        for topic, mems in topic_groups.items():
            if len(mems) >= 3:
                # Create semantic memory from multiple episodic ones
                avg_importance = sum(m.importance for m in mems) / len(mems)
                self.add_memory(
                    user_id,
                    f"User frequently discusses: {topic}",
                    memory_type="semantic",
                    importance=min(0.9, avg_importance + 0.2)
                )


# Global instance
eva_memory: Optional[EvaMemorySystem] = None


def init_memory_system(storage_path: str = "./eva_memory") -> EvaMemorySystem:
    """Initialize the memory system"""
    global eva_memory
    eva_memory = EvaMemorySystem(storage_path)
    return eva_memory


def get_memory_system() -> Optional[EvaMemorySystem]:
    """Get the memory system instance"""
    return eva_memory
