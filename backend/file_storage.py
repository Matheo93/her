"""
File Storage - Sprint 753

File storage abstraction layer.

Features:
- Local and cloud storage
- Streaming uploads
- URL generation
- Metadata support
- Path normalization
"""

import os
import uuid
import shutil
import hashlib
import mimetypes
from pathlib import Path
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union, BinaryIO, Iterator
)
from enum import Enum
from abc import ABC, abstractmethod
import time
import json


T = TypeVar("T")


@dataclass
class FileMetadata:
    """File metadata."""
    name: str
    path: str
    size: int
    mime_type: str
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    checksum: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "path": self.path,
            "size": self.size,
            "mime_type": self.mime_type,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "checksum": self.checksum,
            "metadata": self.metadata,
        }


@dataclass
class UploadResult:
    """Upload result."""
    success: bool
    path: str = ""
    url: str = ""
    metadata: Optional[FileMetadata] = None
    error: Optional[str] = None


class StorageDriver(ABC):
    """Base storage driver."""

    @abstractmethod
    def put(
        self,
        path: str,
        content: Union[bytes, BinaryIO],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> UploadResult:
        """Store file."""
        pass

    @abstractmethod
    def get(self, path: str) -> Optional[bytes]:
        """Get file content."""
        pass

    @abstractmethod
    def stream(self, path: str, chunk_size: int = 8192) -> Iterator[bytes]:
        """Stream file content."""
        pass

    @abstractmethod
    def delete(self, path: str) -> bool:
        """Delete file."""
        pass

    @abstractmethod
    def exists(self, path: str) -> bool:
        """Check if file exists."""
        pass

    @abstractmethod
    def url(self, path: str, expires: Optional[int] = None) -> str:
        """Get file URL."""
        pass

    @abstractmethod
    def metadata(self, path: str) -> Optional[FileMetadata]:
        """Get file metadata."""
        pass

    @abstractmethod
    def list(self, prefix: str = "", recursive: bool = True) -> List[FileMetadata]:
        """List files."""
        pass

    @abstractmethod
    def copy(self, source: str, destination: str) -> bool:
        """Copy file."""
        pass

    @abstractmethod
    def move(self, source: str, destination: str) -> bool:
        """Move file."""
        pass


class LocalStorageDriver(StorageDriver):
    """Local filesystem storage.

    Usage:
        storage = LocalStorageDriver("/var/uploads", base_url="/files")

        result = storage.put("images/photo.jpg", image_bytes)
        content = storage.get("images/photo.jpg")
        url = storage.url("images/photo.jpg")
    """

    def __init__(
        self,
        root_path: str,
        base_url: str = "",
        create_dirs: bool = True,
    ):
        self._root = Path(root_path).resolve()
        self._base_url = base_url.rstrip("/")
        self._create_dirs = create_dirs

        if create_dirs:
            self._root.mkdir(parents=True, exist_ok=True)

    def _resolve_path(self, path: str) -> Path:
        """Resolve and validate path."""
        normalized = Path(path.lstrip("/"))
        full_path = (self._root / normalized).resolve()

        # Security: ensure path is within root
        if not str(full_path).startswith(str(self._root)):
            raise ValueError("Path traversal detected")

        return full_path

    def _compute_checksum(self, content: bytes) -> str:
        """Compute MD5 checksum."""
        return hashlib.md5(content).hexdigest()

    def put(
        self,
        path: str,
        content: Union[bytes, BinaryIO],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> UploadResult:
        try:
            full_path = self._resolve_path(path)

            if self._create_dirs:
                full_path.parent.mkdir(parents=True, exist_ok=True)

            # Get content bytes
            if hasattr(content, "read"):
                data = content.read()
            else:
                data = content

            # Write file
            full_path.write_bytes(data)

            # Create metadata
            mime_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
            file_meta = FileMetadata(
                name=full_path.name,
                path=path,
                size=len(data),
                mime_type=mime_type,
                checksum=self._compute_checksum(data),
                metadata=metadata or {},
            )

            # Write metadata file
            meta_path = full_path.with_suffix(full_path.suffix + ".meta")
            meta_path.write_text(json.dumps(file_meta.to_dict()))

            return UploadResult(
                success=True,
                path=path,
                url=self.url(path),
                metadata=file_meta,
            )

        except Exception as e:
            return UploadResult(success=False, error=str(e))

    def get(self, path: str) -> Optional[bytes]:
        try:
            full_path = self._resolve_path(path)
            if full_path.exists():
                return full_path.read_bytes()
            return None
        except Exception:
            return None

    def stream(self, path: str, chunk_size: int = 8192) -> Iterator[bytes]:
        full_path = self._resolve_path(path)
        if full_path.exists():
            with open(full_path, "rb") as f:
                while chunk := f.read(chunk_size):
                    yield chunk

    def delete(self, path: str) -> bool:
        try:
            full_path = self._resolve_path(path)
            if full_path.exists():
                full_path.unlink()

                # Delete metadata
                meta_path = full_path.with_suffix(full_path.suffix + ".meta")
                if meta_path.exists():
                    meta_path.unlink()

                return True
            return False
        except Exception:
            return False

    def exists(self, path: str) -> bool:
        try:
            full_path = self._resolve_path(path)
            return full_path.exists()
        except Exception:
            return False

    def url(self, path: str, expires: Optional[int] = None) -> str:
        return f"{self._base_url}/{path.lstrip('/')}"

    def metadata(self, path: str) -> Optional[FileMetadata]:
        try:
            full_path = self._resolve_path(path)
            meta_path = full_path.with_suffix(full_path.suffix + ".meta")

            if meta_path.exists():
                data = json.loads(meta_path.read_text())
                return FileMetadata(**data)

            if full_path.exists():
                stat = full_path.stat()
                return FileMetadata(
                    name=full_path.name,
                    path=path,
                    size=stat.st_size,
                    mime_type=mimetypes.guess_type(path)[0] or "application/octet-stream",
                    created_at=stat.st_ctime,
                    updated_at=stat.st_mtime,
                )

            return None
        except Exception:
            return None

    def list(self, prefix: str = "", recursive: bool = True) -> List[FileMetadata]:
        results = []
        start_path = self._root / prefix.lstrip("/")

        if not start_path.exists():
            return results

        pattern = "**/*" if recursive else "*"
        for file_path in start_path.glob(pattern):
            if file_path.is_file() and not file_path.suffix == ".meta":
                rel_path = str(file_path.relative_to(self._root))
                meta = self.metadata(rel_path)
                if meta:
                    results.append(meta)

        return results

    def copy(self, source: str, destination: str) -> bool:
        try:
            src_path = self._resolve_path(source)
            dst_path = self._resolve_path(destination)

            if not src_path.exists():
                return False

            if self._create_dirs:
                dst_path.parent.mkdir(parents=True, exist_ok=True)

            shutil.copy2(src_path, dst_path)

            # Copy metadata
            src_meta = src_path.with_suffix(src_path.suffix + ".meta")
            if src_meta.exists():
                dst_meta = dst_path.with_suffix(dst_path.suffix + ".meta")
                shutil.copy2(src_meta, dst_meta)

            return True
        except Exception:
            return False

    def move(self, source: str, destination: str) -> bool:
        if self.copy(source, destination):
            return self.delete(source)
        return False


class MemoryStorageDriver(StorageDriver):
    """In-memory storage for testing."""

    def __init__(self, base_url: str = ""):
        self._files: Dict[str, bytes] = {}
        self._metadata: Dict[str, FileMetadata] = {}
        self._base_url = base_url

    def put(
        self,
        path: str,
        content: Union[bytes, BinaryIO],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> UploadResult:
        data = content.read() if hasattr(content, "read") else content
        self._files[path] = data

        mime_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
        file_meta = FileMetadata(
            name=Path(path).name,
            path=path,
            size=len(data),
            mime_type=mime_type,
            checksum=hashlib.md5(data).hexdigest(),
            metadata=metadata or {},
        )
        self._metadata[path] = file_meta

        return UploadResult(
            success=True,
            path=path,
            url=self.url(path),
            metadata=file_meta,
        )

    def get(self, path: str) -> Optional[bytes]:
        return self._files.get(path)

    def stream(self, path: str, chunk_size: int = 8192) -> Iterator[bytes]:
        data = self._files.get(path)
        if data:
            for i in range(0, len(data), chunk_size):
                yield data[i:i + chunk_size]

    def delete(self, path: str) -> bool:
        if path in self._files:
            del self._files[path]
            del self._metadata[path]
            return True
        return False

    def exists(self, path: str) -> bool:
        return path in self._files

    def url(self, path: str, expires: Optional[int] = None) -> str:
        return f"{self._base_url}/{path.lstrip('/')}"

    def metadata(self, path: str) -> Optional[FileMetadata]:
        return self._metadata.get(path)

    def list(self, prefix: str = "", recursive: bool = True) -> List[FileMetadata]:
        results = []
        for path, meta in self._metadata.items():
            if path.startswith(prefix):
                results.append(meta)
        return results

    def copy(self, source: str, destination: str) -> bool:
        if source in self._files:
            self._files[destination] = self._files[source]
            self._metadata[destination] = FileMetadata(
                **{**self._metadata[source].to_dict(), "path": destination}
            )
            return True
        return False

    def move(self, source: str, destination: str) -> bool:
        if self.copy(source, destination):
            return self.delete(source)
        return False


class FileStorage:
    """File storage facade.

    Usage:
        storage = FileStorage(LocalStorageDriver("/uploads"))

        # Upload
        result = storage.upload("docs/file.pdf", file_bytes)

        # Download
        content = storage.download("docs/file.pdf")

        # Stream
        for chunk in storage.stream("docs/file.pdf"):
            response.write(chunk)

        # Delete
        storage.delete("docs/file.pdf")
    """

    def __init__(self, driver: StorageDriver):
        self._driver = driver

    def upload(
        self,
        path: str,
        content: Union[bytes, BinaryIO],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> UploadResult:
        """Upload file."""
        return self._driver.put(path, content, metadata)

    def upload_unique(
        self,
        content: Union[bytes, BinaryIO],
        extension: str = "",
        folder: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> UploadResult:
        """Upload with unique filename."""
        unique_name = str(uuid.uuid4())
        if extension:
            unique_name += "." + extension.lstrip(".")
        path = f"{folder.rstrip('/')}/{unique_name}" if folder else unique_name
        return self.upload(path, content, metadata)

    def download(self, path: str) -> Optional[bytes]:
        """Download file."""
        return self._driver.get(path)

    def stream(self, path: str, chunk_size: int = 8192) -> Iterator[bytes]:
        """Stream file."""
        return self._driver.stream(path, chunk_size)

    def delete(self, path: str) -> bool:
        """Delete file."""
        return self._driver.delete(path)

    def exists(self, path: str) -> bool:
        """Check if file exists."""
        return self._driver.exists(path)

    def url(self, path: str, expires: Optional[int] = None) -> str:
        """Get file URL."""
        return self._driver.url(path, expires)

    def metadata(self, path: str) -> Optional[FileMetadata]:
        """Get file metadata."""
        return self._driver.metadata(path)

    def list(self, prefix: str = "", recursive: bool = True) -> List[FileMetadata]:
        """List files."""
        return self._driver.list(prefix, recursive)

    def copy(self, source: str, destination: str) -> bool:
        """Copy file."""
        return self._driver.copy(source, destination)

    def move(self, source: str, destination: str) -> bool:
        """Move file."""
        return self._driver.move(source, destination)


# Singleton instance
_storage: Optional[FileStorage] = None


def configure_storage(driver: StorageDriver) -> None:
    """Configure global storage."""
    global _storage
    _storage = FileStorage(driver)


def get_storage() -> FileStorage:
    """Get global storage."""
    if not _storage:
        raise RuntimeError("Storage not configured")
    return _storage
