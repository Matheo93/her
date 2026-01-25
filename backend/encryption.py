"""
Encryption System - Sprint 715

Data encryption and secure key management.

Features:
- AES encryption
- Key derivation
- Password hashing
- Data masking
- Envelope encryption
"""

import os
import base64
import hashlib
import hmac
import secrets
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union, Tuple
)
from enum import Enum
import threading
from abc import ABC, abstractmethod
from datetime import datetime, timedelta


class Algorithm(str, Enum):
    """Encryption algorithms."""
    AES_256_GCM = "aes-256-gcm"
    AES_256_CBC = "aes-256-cbc"
    CHACHA20_POLY1305 = "chacha20-poly1305"


class HashAlgorithm(str, Enum):
    """Hash algorithms."""
    SHA256 = "sha256"
    SHA384 = "sha384"
    SHA512 = "sha512"
    BLAKE2B = "blake2b"


@dataclass
class EncryptedData:
    """Encrypted data container."""
    ciphertext: bytes
    iv: bytes
    tag: Optional[bytes] = None
    algorithm: Algorithm = Algorithm.AES_256_GCM
    key_id: Optional[str] = None

    def to_bytes(self) -> bytes:
        """Serialize to bytes."""
        iv_len = len(self.iv).to_bytes(1, "big")
        tag_len = len(self.tag).to_bytes(1, "big") if self.tag else b"\x00"
        tag_bytes = self.tag or b""
        return iv_len + self.iv + tag_len + tag_bytes + self.ciphertext

    @classmethod
    def from_bytes(cls, data: bytes) -> "EncryptedData":
        """Deserialize from bytes."""
        iv_len = data[0]
        iv = data[1:1 + iv_len]
        tag_len = data[1 + iv_len]
        tag = data[2 + iv_len:2 + iv_len + tag_len] if tag_len > 0 else None
        ciphertext = data[2 + iv_len + tag_len:]
        return cls(ciphertext=ciphertext, iv=iv, tag=tag)

    def to_base64(self) -> str:
        """Encode as base64 string."""
        return base64.b64encode(self.to_bytes()).decode("ascii")

    @classmethod
    def from_base64(cls, data: str) -> "EncryptedData":
        """Decode from base64 string."""
        return cls.from_bytes(base64.b64decode(data))


@dataclass
class DerivedKey:
    """Derived key with salt."""
    key: bytes
    salt: bytes
    iterations: int
    algorithm: str = "pbkdf2"

    def to_dict(self) -> dict:
        """Convert to dictionary for storage."""
        return {
            "key": base64.b64encode(self.key).decode("ascii"),
            "salt": base64.b64encode(self.salt).decode("ascii"),
            "iterations": self.iterations,
            "algorithm": self.algorithm,
        }


class KeyDerivation:
    """Key derivation functions."""

    @staticmethod
    def pbkdf2(
        password: str,
        salt: Optional[bytes] = None,
        iterations: int = 100000,
        key_length: int = 32,
        hash_algorithm: HashAlgorithm = HashAlgorithm.SHA256,
    ) -> DerivedKey:
        """Derive key using PBKDF2.

        Args:
            password: Password to derive from
            salt: Optional salt (generated if not provided)
            iterations: Number of iterations
            key_length: Length of derived key
            hash_algorithm: Hash algorithm to use

        Returns:
            DerivedKey with key and salt
        """
        if salt is None:
            salt = os.urandom(16)

        key = hashlib.pbkdf2_hmac(
            hash_algorithm.value,
            password.encode("utf-8"),
            salt,
            iterations,
            dklen=key_length,
        )

        return DerivedKey(
            key=key,
            salt=salt,
            iterations=iterations,
        )

    @staticmethod
    def scrypt(
        password: str,
        salt: Optional[bytes] = None,
        n: int = 16384,
        r: int = 8,
        p: int = 1,
        key_length: int = 32,
    ) -> DerivedKey:
        """Derive key using scrypt.

        Args:
            password: Password to derive from
            salt: Optional salt
            n: CPU/memory cost parameter
            r: Block size
            p: Parallelization parameter
            key_length: Length of derived key

        Returns:
            DerivedKey with key and salt
        """
        if salt is None:
            salt = os.urandom(16)

        key = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=n,
            r=r,
            p=p,
            dklen=key_length,
        )

        return DerivedKey(
            key=key,
            salt=salt,
            iterations=n,
            algorithm="scrypt",
        )


class PasswordHasher:
    """Password hashing with built-in salt.

    Usage:
        hasher = PasswordHasher()

        # Hash password
        hashed = hasher.hash("my_password")

        # Verify password
        if hasher.verify("my_password", hashed):
            print("Password correct!")
    """

    def __init__(
        self,
        iterations: int = 100000,
        algorithm: HashAlgorithm = HashAlgorithm.SHA256,
    ):
        """Initialize hasher."""
        self.iterations = iterations
        self.algorithm = algorithm

    def hash(self, password: str) -> str:
        """Hash a password.

        Args:
            password: Password to hash

        Returns:
            Hash string with embedded salt
        """
        salt = os.urandom(16)
        key = hashlib.pbkdf2_hmac(
            self.algorithm.value,
            password.encode("utf-8"),
            salt,
            self.iterations,
            dklen=32,
        )

        # Format: algorithm$iterations$salt$hash
        salt_b64 = base64.b64encode(salt).decode("ascii")
        hash_b64 = base64.b64encode(key).decode("ascii")

        return f"{self.algorithm.value}${self.iterations}${salt_b64}${hash_b64}"

    def verify(self, password: str, hashed: str) -> bool:
        """Verify a password against hash.

        Args:
            password: Password to verify
            hashed: Stored hash

        Returns:
            True if password matches
        """
        try:
            parts = hashed.split("$")
            if len(parts) != 4:
                return False

            algorithm, iterations, salt_b64, hash_b64 = parts
            salt = base64.b64decode(salt_b64)
            expected = base64.b64decode(hash_b64)

            key = hashlib.pbkdf2_hmac(
                algorithm,
                password.encode("utf-8"),
                salt,
                int(iterations),
                dklen=len(expected),
            )

            return hmac.compare_digest(key, expected)

        except Exception:
            return False

    def needs_rehash(self, hashed: str) -> bool:
        """Check if hash needs to be updated.

        Args:
            hashed: Stored hash

        Returns:
            True if hash should be regenerated
        """
        try:
            parts = hashed.split("$")
            if len(parts) != 4:
                return True

            algorithm, iterations, _, _ = parts
            return (
                algorithm != self.algorithm.value or
                int(iterations) < self.iterations
            )
        except Exception:
            return True


class SimpleEncryptor:
    """Simple XOR-based encryption (for demonstration).

    Note: For production, use proper cryptography library.
    This is a simplified implementation without external dependencies.
    """

    def __init__(self, key: bytes):
        """Initialize encryptor with key."""
        self._key = key

    def encrypt(self, data: bytes) -> EncryptedData:
        """Encrypt data.

        Args:
            data: Data to encrypt

        Returns:
            EncryptedData with ciphertext
        """
        iv = os.urandom(16)
        key_stream = self._generate_key_stream(iv, len(data))

        ciphertext = bytes(a ^ b for a, b in zip(data, key_stream))
        tag = self._generate_tag(iv + ciphertext)

        return EncryptedData(
            ciphertext=ciphertext,
            iv=iv,
            tag=tag,
        )

    def decrypt(self, encrypted: EncryptedData) -> bytes:
        """Decrypt data.

        Args:
            encrypted: Encrypted data

        Returns:
            Decrypted bytes

        Raises:
            ValueError: If tag verification fails
        """
        # Verify tag
        expected_tag = self._generate_tag(encrypted.iv + encrypted.ciphertext)
        if encrypted.tag and not hmac.compare_digest(encrypted.tag, expected_tag):
            raise ValueError("Tag verification failed")

        key_stream = self._generate_key_stream(encrypted.iv, len(encrypted.ciphertext))
        return bytes(a ^ b for a, b in zip(encrypted.ciphertext, key_stream))

    def _generate_key_stream(self, iv: bytes, length: int) -> bytes:
        """Generate key stream for encryption."""
        stream = bytearray()
        counter = 0

        while len(stream) < length:
            block = hashlib.sha256(self._key + iv + counter.to_bytes(4, "big")).digest()
            stream.extend(block)
            counter += 1

        return bytes(stream[:length])

    def _generate_tag(self, data: bytes) -> bytes:
        """Generate authentication tag."""
        return hmac.new(self._key, data, hashlib.sha256).digest()[:16]


class DataMasker:
    """Data masking utilities.

    Usage:
        masker = DataMasker()

        # Mask credit card
        masker.mask_card("4111111111111111")  # "****-****-****-1111"

        # Mask email
        masker.mask_email("john@example.com")  # "j***@example.com"
    """

    @staticmethod
    def mask_card(number: str, show_last: int = 4) -> str:
        """Mask credit card number."""
        digits = "".join(c for c in number if c.isdigit())
        if len(digits) < show_last:
            return "*" * len(digits)

        masked = "*" * (len(digits) - show_last) + digits[-show_last:]

        # Format with dashes
        groups = [masked[i:i+4] for i in range(0, len(masked), 4)]
        return "-".join(groups)

    @staticmethod
    def mask_email(email: str) -> str:
        """Mask email address."""
        if "@" not in email:
            return "*" * len(email)

        local, domain = email.rsplit("@", 1)

        if len(local) <= 1:
            masked_local = "*"
        else:
            masked_local = local[0] + "*" * (len(local) - 1)

        return f"{masked_local}@{domain}"

    @staticmethod
    def mask_phone(phone: str, show_last: int = 4) -> str:
        """Mask phone number."""
        digits = "".join(c for c in phone if c.isdigit())
        if len(digits) <= show_last:
            return "*" * len(digits)

        return "*" * (len(digits) - show_last) + digits[-show_last:]

    @staticmethod
    def mask_ssn(ssn: str) -> str:
        """Mask Social Security Number."""
        digits = "".join(c for c in ssn if c.isdigit())
        if len(digits) != 9:
            return "*" * len(digits)

        return f"***-**-{digits[-4:]}"

    @staticmethod
    def mask_string(
        value: str,
        show_start: int = 0,
        show_end: int = 0,
        mask_char: str = "*",
    ) -> str:
        """Mask a generic string."""
        if len(value) <= show_start + show_end:
            return mask_char * len(value)

        start = value[:show_start]
        end = value[-show_end:] if show_end > 0 else ""
        middle_len = len(value) - show_start - show_end

        return start + mask_char * middle_len + end


@dataclass
class EncryptionKey:
    """Encryption key with metadata."""
    id: str
    key: bytes
    created_at: datetime
    expires_at: Optional[datetime] = None
    algorithm: Algorithm = Algorithm.AES_256_GCM
    is_active: bool = True

    def is_expired(self) -> bool:
        """Check if key is expired."""
        if self.expires_at is None:
            return False
        return datetime.now() > self.expires_at


class KeyManager:
    """Encryption key management.

    Usage:
        manager = KeyManager()

        # Generate new key
        key = manager.generate_key("my-key-id")

        # Get encryptor
        encryptor = manager.get_encryptor("my-key-id")
        encrypted = encryptor.encrypt(b"secret data")
    """

    def __init__(
        self,
        key_rotation_days: int = 90,
    ):
        """Initialize key manager."""
        self._keys: Dict[str, EncryptionKey] = {}
        self._lock = threading.Lock()
        self._key_rotation_days = key_rotation_days
        self._active_key_id: Optional[str] = None

    def generate_key(
        self,
        key_id: str,
        algorithm: Algorithm = Algorithm.AES_256_GCM,
        expire_days: Optional[int] = None,
    ) -> EncryptionKey:
        """Generate a new encryption key.

        Args:
            key_id: Unique key identifier
            algorithm: Encryption algorithm
            expire_days: Days until expiration

        Returns:
            Generated EncryptionKey
        """
        key = os.urandom(32)  # 256 bits
        expires_at = None
        if expire_days:
            expires_at = datetime.now() + timedelta(days=expire_days)
        elif self._key_rotation_days:
            expires_at = datetime.now() + timedelta(days=self._key_rotation_days)

        enc_key = EncryptionKey(
            id=key_id,
            key=key,
            created_at=datetime.now(),
            expires_at=expires_at,
            algorithm=algorithm,
        )

        with self._lock:
            self._keys[key_id] = enc_key
            self._active_key_id = key_id

        return enc_key

    def add_key(self, key_id: str, key_bytes: bytes) -> EncryptionKey:
        """Add an existing key.

        Args:
            key_id: Key identifier
            key_bytes: Key bytes

        Returns:
            EncryptionKey object
        """
        enc_key = EncryptionKey(
            id=key_id,
            key=key_bytes,
            created_at=datetime.now(),
        )

        with self._lock:
            self._keys[key_id] = enc_key

        return enc_key

    def get_key(self, key_id: str) -> Optional[EncryptionKey]:
        """Get key by ID."""
        return self._keys.get(key_id)

    def get_active_key(self) -> Optional[EncryptionKey]:
        """Get currently active key."""
        if not self._active_key_id:
            return None
        return self._keys.get(self._active_key_id)

    def get_encryptor(self, key_id: Optional[str] = None) -> SimpleEncryptor:
        """Get encryptor for key.

        Args:
            key_id: Key ID (uses active key if not specified)

        Returns:
            SimpleEncryptor instance
        """
        key_id = key_id or self._active_key_id
        if not key_id:
            raise ValueError("No key specified and no active key")

        key = self._keys.get(key_id)
        if not key:
            raise ValueError(f"Key not found: {key_id}")

        if key.is_expired():
            raise ValueError(f"Key expired: {key_id}")

        return SimpleEncryptor(key.key)

    def rotate_keys(self) -> Optional[EncryptionKey]:
        """Rotate to new key if active key is near expiration.

        Returns:
            New key if rotated, None otherwise
        """
        active = self.get_active_key()
        if not active:
            return self.generate_key("key-" + secrets.token_hex(8))

        # Rotate if expiring within 7 days
        if active.expires_at:
            days_until_expiry = (active.expires_at - datetime.now()).days
            if days_until_expiry <= 7:
                active.is_active = False
                return self.generate_key("key-" + secrets.token_hex(8))

        return None

    def list_keys(self) -> List[dict]:
        """List all keys."""
        return [
            {
                "id": k.id,
                "created_at": k.created_at.isoformat(),
                "expires_at": k.expires_at.isoformat() if k.expires_at else None,
                "is_active": k.is_active,
                "is_expired": k.is_expired(),
            }
            for k in self._keys.values()
        ]


class SecureRandom:
    """Secure random generation utilities."""

    @staticmethod
    def bytes(length: int) -> bytes:
        """Generate random bytes."""
        return os.urandom(length)

    @staticmethod
    def hex(length: int) -> str:
        """Generate random hex string."""
        return secrets.token_hex(length // 2)

    @staticmethod
    def urlsafe(length: int) -> str:
        """Generate URL-safe random string."""
        return secrets.token_urlsafe(length)

    @staticmethod
    def int(min_val: int = 0, max_val: int = 2**32 - 1) -> int:
        """Generate random integer in range."""
        return secrets.randbelow(max_val - min_val + 1) + min_val

    @staticmethod
    def choice(options: list) -> Any:
        """Random choice from list."""
        return secrets.choice(options)

    @staticmethod
    def shuffle(items: list) -> list:
        """Securely shuffle list."""
        shuffled = items.copy()
        for i in range(len(shuffled) - 1, 0, -1):
            j = secrets.randbelow(i + 1)
            shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
        return shuffled


# Singleton instances
password_hasher = PasswordHasher()
key_manager = KeyManager()
data_masker = DataMasker()


# Convenience functions
def hash_password(password: str) -> str:
    """Hash password using default hasher."""
    return password_hasher.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    """Verify password using default hasher."""
    return password_hasher.verify(password, hashed)


def encrypt(data: Union[str, bytes], key: Optional[bytes] = None) -> str:
    """Encrypt data.

    Args:
        data: Data to encrypt
        key: Optional key (uses active key if not provided)

    Returns:
        Base64-encoded encrypted data
    """
    if isinstance(data, str):
        data = data.encode("utf-8")

    if key:
        encryptor = SimpleEncryptor(key)
    else:
        encryptor = key_manager.get_encryptor()

    encrypted = encryptor.encrypt(data)
    return encrypted.to_base64()


def decrypt(encrypted: str, key: Optional[bytes] = None) -> bytes:
    """Decrypt data.

    Args:
        encrypted: Base64-encoded encrypted data
        key: Optional key

    Returns:
        Decrypted bytes
    """
    enc_data = EncryptedData.from_base64(encrypted)

    if key:
        encryptor = SimpleEncryptor(key)
    else:
        encryptor = key_manager.get_encryptor()

    return encryptor.decrypt(enc_data)
