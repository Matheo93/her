"""
API Key Manager - Sprint 673

API key generation and validation.

Features:
- Key generation
- Key validation
- Scopes/permissions
- Rate limits per key
- Usage tracking
"""

import time
import secrets
import hashlib
from dataclasses import dataclass, field
from typing import Dict, List, Set, Optional, Any
from enum import Enum
import threading


class KeyStatus(str, Enum):
    """API key status."""
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"


@dataclass
class APIKey:
    """API key definition."""
    id: str
    key_hash: str
    name: str
    owner_id: Optional[str] = None
    scopes: Set[str] = field(default_factory=set)
    status: KeyStatus = KeyStatus.ACTIVE
    created_at: float = field(default_factory=time.time)
    expires_at: Optional[float] = None
    last_used_at: Optional[float] = None
    rate_limit: int = 1000  # requests per hour
    requests_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class KeyValidation:
    """Key validation result."""
    valid: bool
    key: Optional[APIKey] = None
    error: Optional[str] = None


class APIKeyManager:
    """API key management system.

    Usage:
        manager = APIKeyManager()

        # Create key
        key, raw_key = manager.create(
            name="My App Key",
            scopes={"read", "write"},
            owner_id="user_123",
        )
        # Store raw_key securely - it won't be shown again!

        # Validate key
        result = manager.validate(raw_key)
        if result.valid:
            print(f"Key belongs to {result.key.owner_id}")
            if manager.has_scope(raw_key, "write"):
                allow_write()

        # Revoke key
        manager.revoke(key.id)
    """

    def __init__(self, prefix: str = "eva"):
        """Initialize API key manager.

        Args:
            prefix: Prefix for generated keys
        """
        self._prefix = prefix
        self._keys: Dict[str, APIKey] = {}
        self._hash_to_id: Dict[str, str] = {}
        self._lock = threading.Lock()
        self._stats = {
            "total_keys": 0,
            "active_keys": 0,
            "revoked_keys": 0,
            "total_validations": 0,
            "failed_validations": 0,
        }

    def create(
        self,
        name: str,
        scopes: Optional[Set[str]] = None,
        owner_id: Optional[str] = None,
        expires_in_days: Optional[int] = None,
        rate_limit: int = 1000,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> tuple[APIKey, str]:
        """Create new API key.

        Args:
            name: Key name/description
            scopes: Allowed scopes
            owner_id: Owner identifier
            expires_in_days: Expiration in days
            rate_limit: Requests per hour
            metadata: Additional data

        Returns:
            (APIKey, raw_key) - Store raw_key securely!
        """
        # Generate key
        key_id = secrets.token_hex(4)
        raw_secret = secrets.token_urlsafe(32)
        raw_key = f"{self._prefix}_{key_id}_{raw_secret}"

        # Hash for storage
        key_hash = self._hash_key(raw_key)

        # Calculate expiry
        expires_at = None
        if expires_in_days:
            expires_at = time.time() + (expires_in_days * 86400)

        api_key = APIKey(
            id=key_id,
            key_hash=key_hash,
            name=name,
            owner_id=owner_id,
            scopes=scopes or set(),
            expires_at=expires_at,
            rate_limit=rate_limit,
            metadata=metadata or {},
        )

        with self._lock:
            self._keys[key_id] = api_key
            self._hash_to_id[key_hash] = key_id
            self._stats["total_keys"] += 1
            self._stats["active_keys"] += 1

        return api_key, raw_key

    def validate(self, raw_key: str) -> KeyValidation:
        """Validate API key.

        Args:
            raw_key: Raw API key string

        Returns:
            Validation result
        """
        with self._lock:
            self._stats["total_validations"] += 1

        # Check format
        if not raw_key or not raw_key.startswith(f"{self._prefix}_"):
            self._stats["failed_validations"] += 1
            return KeyValidation(valid=False, error="Invalid key format")

        # Find key by hash
        key_hash = self._hash_key(raw_key)
        key_id = self._hash_to_id.get(key_hash)

        if not key_id:
            self._stats["failed_validations"] += 1
            return KeyValidation(valid=False, error="Key not found")

        api_key = self._keys.get(key_id)
        if not api_key:
            self._stats["failed_validations"] += 1
            return KeyValidation(valid=False, error="Key not found")

        # Check status
        if api_key.status == KeyStatus.REVOKED:
            self._stats["failed_validations"] += 1
            return KeyValidation(valid=False, error="Key revoked")

        # Check expiry
        if api_key.expires_at and time.time() > api_key.expires_at:
            api_key.status = KeyStatus.EXPIRED
            self._stats["failed_validations"] += 1
            return KeyValidation(valid=False, error="Key expired")

        # Check rate limit
        if not self._check_rate_limit(api_key):
            self._stats["failed_validations"] += 1
            return KeyValidation(valid=False, error="Rate limit exceeded")

        # Update usage
        api_key.last_used_at = time.time()
        api_key.requests_count += 1

        return KeyValidation(valid=True, key=api_key)

    def has_scope(self, raw_key: str, scope: str) -> bool:
        """Check if key has scope.

        Args:
            raw_key: Raw API key
            scope: Required scope

        Returns:
            True if scope allowed
        """
        result = self.validate(raw_key)
        if not result.valid or not result.key:
            return False

        # Wildcard scope
        if "*" in result.key.scopes:
            return True

        return scope in result.key.scopes

    def has_any_scope(self, raw_key: str, scopes: Set[str]) -> bool:
        """Check if key has any of the scopes."""
        result = self.validate(raw_key)
        if not result.valid or not result.key:
            return False

        if "*" in result.key.scopes:
            return True

        return bool(result.key.scopes & scopes)

    def revoke(self, key_id: str) -> bool:
        """Revoke API key.

        Args:
            key_id: Key ID

        Returns:
            True if revoked
        """
        api_key = self._keys.get(key_id)
        if not api_key:
            return False

        with self._lock:
            api_key.status = KeyStatus.REVOKED
            self._stats["active_keys"] -= 1
            self._stats["revoked_keys"] += 1

        return True

    def revoke_all(self, owner_id: str) -> int:
        """Revoke all keys for owner.

        Args:
            owner_id: Owner ID

        Returns:
            Number of keys revoked
        """
        count = 0
        with self._lock:
            for api_key in self._keys.values():
                if api_key.owner_id == owner_id and api_key.status == KeyStatus.ACTIVE:
                    api_key.status = KeyStatus.REVOKED
                    self._stats["active_keys"] -= 1
                    self._stats["revoked_keys"] += 1
                    count += 1
        return count

    def get(self, key_id: str) -> Optional[APIKey]:
        """Get key by ID."""
        return self._keys.get(key_id)

    def list_keys(
        self,
        owner_id: Optional[str] = None,
        status: Optional[KeyStatus] = None,
    ) -> List[APIKey]:
        """List API keys."""
        keys = list(self._keys.values())

        if owner_id:
            keys = [k for k in keys if k.owner_id == owner_id]
        if status:
            keys = [k for k in keys if k.status == status]

        return keys

    def add_scope(self, key_id: str, scope: str) -> bool:
        """Add scope to key."""
        api_key = self._keys.get(key_id)
        if api_key:
            api_key.scopes.add(scope)
            return True
        return False

    def remove_scope(self, key_id: str, scope: str) -> bool:
        """Remove scope from key."""
        api_key = self._keys.get(key_id)
        if api_key:
            api_key.scopes.discard(scope)
            return True
        return False

    def set_rate_limit(self, key_id: str, rate_limit: int) -> bool:
        """Update rate limit."""
        api_key = self._keys.get(key_id)
        if api_key:
            api_key.rate_limit = rate_limit
            return True
        return False

    def _hash_key(self, raw_key: str) -> str:
        """Hash key for storage."""
        return hashlib.sha256(raw_key.encode()).hexdigest()

    def _check_rate_limit(self, api_key: APIKey) -> bool:
        """Check if under rate limit."""
        # Simple hourly reset
        current_hour = int(time.time() // 3600)
        key_hour = int((api_key.last_used_at or 0) // 3600)

        if current_hour != key_hour:
            api_key.requests_count = 0
            return True

        return api_key.requests_count < api_key.rate_limit

    def get_stats(self) -> dict:
        """Get manager statistics."""
        return {
            **self._stats,
            "expired_keys": sum(1 for k in self._keys.values() if k.status == KeyStatus.EXPIRED),
        }

    def cleanup_expired(self) -> int:
        """Remove expired keys from memory."""
        count = 0
        with self._lock:
            expired_ids = [
                kid for kid, key in self._keys.items()
                if key.expires_at and time.time() > key.expires_at
            ]
            for kid in expired_ids:
                key = self._keys.pop(kid)
                self._hash_to_id.pop(key.key_hash, None)
                count += 1
        return count


# Singleton instance
api_key_manager = APIKeyManager()
