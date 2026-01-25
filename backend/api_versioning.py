"""
API Versioning - Sprint 627

API versioning system for backwards compatibility.

Features:
- Version detection (header/path/query)
- Version deprecation
- Migration helpers
- Version routing
- Changelog tracking
"""

import time
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Callable
from enum import Enum
from functools import wraps
from fastapi import Request, HTTPException
from threading import Lock


class VersionStatus(str, Enum):
    """API version status."""
    CURRENT = "current"
    SUPPORTED = "supported"
    DEPRECATED = "deprecated"
    SUNSET = "sunset"


class VersionSource(str, Enum):
    """Where to extract version from."""
    HEADER = "header"
    PATH = "path"
    QUERY = "query"


@dataclass
class APIVersion:
    """An API version definition."""
    version: str
    status: VersionStatus = VersionStatus.CURRENT
    release_date: Optional[str] = None
    deprecation_date: Optional[str] = None
    sunset_date: Optional[str] = None
    changelog: List[str] = field(default_factory=list)
    breaking_changes: List[str] = field(default_factory=list)
    migrations: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "status": self.status.value,
            "release_date": self.release_date,
            "deprecation_date": self.deprecation_date,
            "sunset_date": self.sunset_date,
            "changelog": self.changelog,
            "breaking_changes": self.breaking_changes,
        }


@dataclass
class VersionedResponse:
    """Response wrapper with version info."""
    data: Any
    version: str
    deprecated: bool = False
    sunset_date: Optional[str] = None
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        result = {
            "data": self.data,
            "_meta": {
                "api_version": self.version,
            }
        }

        if self.deprecated:
            result["_meta"]["deprecated"] = True
        if self.sunset_date:
            result["_meta"]["sunset_date"] = self.sunset_date
        if self.warnings:
            result["_meta"]["warnings"] = self.warnings

        return result


class APIVersionManager:
    """API versioning manager.

    Usage:
        versioning = APIVersionManager()

        # Define versions
        versioning.add_version(
            "v1",
            status=VersionStatus.DEPRECATED,
            deprecation_date="2024-01-01",
            sunset_date="2024-07-01"
        )

        versioning.add_version(
            "v2",
            status=VersionStatus.CURRENT,
            release_date="2024-01-01",
            changelog=["New endpoints", "Better performance"]
        )

        # Get version from request
        version = versioning.get_version(request)

        # Check if version is valid
        if not versioning.is_valid(version):
            raise HTTPException(status_code=400, detail="Invalid API version")
    """

    def __init__(
        self,
        default_version: str = "v1",
        header_name: str = "X-API-Version",
        query_param: str = "api_version",
        version_source: VersionSource = VersionSource.HEADER
    ):
        """Initialize version manager.

        Args:
            default_version: Default version if not specified
            header_name: Header name for version
            query_param: Query parameter for version
            version_source: Where to look for version
        """
        self._versions: Dict[str, APIVersion] = {}
        self._default_version = default_version
        self._header_name = header_name
        self._query_param = query_param
        self._version_source = version_source
        self._lock = Lock()
        self._transformers: Dict[str, Dict[str, Callable]] = {}

    def add_version(
        self,
        version: str,
        status: VersionStatus = VersionStatus.CURRENT,
        release_date: Optional[str] = None,
        deprecation_date: Optional[str] = None,
        sunset_date: Optional[str] = None,
        changelog: Optional[List[str]] = None,
        breaking_changes: Optional[List[str]] = None
    ) -> APIVersion:
        """Add a new API version.

        Args:
            version: Version string (e.g., "v1", "v2")
            status: Version status
            release_date: Release date
            deprecation_date: Deprecation date
            sunset_date: Sunset date
            changelog: List of changes
            breaking_changes: List of breaking changes

        Returns:
            Created version
        """
        api_version = APIVersion(
            version=version,
            status=status,
            release_date=release_date,
            deprecation_date=deprecation_date,
            sunset_date=sunset_date,
            changelog=changelog or [],
            breaking_changes=breaking_changes or [],
        )

        with self._lock:
            self._versions[version] = api_version

        return api_version

    def get_version_info(self, version: str) -> Optional[Dict[str, Any]]:
        """Get version information.

        Args:
            version: Version string

        Returns:
            Version info or None
        """
        with self._lock:
            v = self._versions.get(version)
            return v.to_dict() if v else None

    def get_version(self, request: Request) -> str:
        """Extract version from request.

        Args:
            request: FastAPI request

        Returns:
            Version string
        """
        version = None

        # Try header first
        if self._version_source == VersionSource.HEADER:
            version = request.headers.get(self._header_name)

        # Try query parameter
        elif self._version_source == VersionSource.QUERY:
            version = request.query_params.get(self._query_param)

        # Try path (e.g., /v1/users)
        elif self._version_source == VersionSource.PATH:
            path = request.url.path
            parts = path.split("/")
            for part in parts:
                if part.startswith("v") and part[1:].isdigit():
                    version = part
                    break

        return version or self._default_version

    def is_valid(self, version: str) -> bool:
        """Check if version is valid (exists and not sunset).

        Args:
            version: Version string

        Returns:
            True if valid
        """
        with self._lock:
            v = self._versions.get(version)
            if not v:
                return False
            return v.status != VersionStatus.SUNSET

    def is_deprecated(self, version: str) -> bool:
        """Check if version is deprecated.

        Args:
            version: Version string

        Returns:
            True if deprecated
        """
        with self._lock:
            v = self._versions.get(version)
            return v.status == VersionStatus.DEPRECATED if v else False

    def is_current(self, version: str) -> bool:
        """Check if version is current.

        Args:
            version: Version string

        Returns:
            True if current
        """
        with self._lock:
            v = self._versions.get(version)
            return v.status == VersionStatus.CURRENT if v else False

    def get_current_version(self) -> Optional[str]:
        """Get current version.

        Returns:
            Current version string
        """
        with self._lock:
            for version, v in self._versions.items():
                if v.status == VersionStatus.CURRENT:
                    return version
        return None

    def list_versions(
        self,
        include_sunset: bool = False
    ) -> List[Dict[str, Any]]:
        """List all versions.

        Args:
            include_sunset: Include sunset versions

        Returns:
            List of version info
        """
        with self._lock:
            versions = list(self._versions.values())

        if not include_sunset:
            versions = [v for v in versions if v.status != VersionStatus.SUNSET]

        return [v.to_dict() for v in versions]

    def deprecate_version(
        self,
        version: str,
        deprecation_date: str,
        sunset_date: Optional[str] = None
    ) -> bool:
        """Mark a version as deprecated.

        Args:
            version: Version to deprecate
            deprecation_date: Deprecation date
            sunset_date: Optional sunset date

        Returns:
            True if deprecated
        """
        with self._lock:
            v = self._versions.get(version)
            if not v:
                return False

            v.status = VersionStatus.DEPRECATED
            v.deprecation_date = deprecation_date
            if sunset_date:
                v.sunset_date = sunset_date
            return True

    def sunset_version(self, version: str) -> bool:
        """Mark a version as sunset (no longer available).

        Args:
            version: Version to sunset

        Returns:
            True if sunset
        """
        with self._lock:
            v = self._versions.get(version)
            if not v:
                return False

            v.status = VersionStatus.SUNSET
            return True

    def register_transformer(
        self,
        endpoint: str,
        from_version: str,
        to_version: str,
        transformer: Callable[[Dict[str, Any]], Dict[str, Any]]
    ):
        """Register a response transformer for version migration.

        Args:
            endpoint: Endpoint pattern
            from_version: Source version
            to_version: Target version
            transformer: Transformation function
        """
        key = f"{endpoint}:{from_version}->{to_version}"
        with self._lock:
            self._transformers[key] = transformer

    def transform_response(
        self,
        endpoint: str,
        from_version: str,
        to_version: str,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Transform response between versions.

        Args:
            endpoint: Endpoint
            from_version: Source version
            to_version: Target version
            data: Response data

        Returns:
            Transformed data
        """
        key = f"{endpoint}:{from_version}->{to_version}"
        with self._lock:
            transformer = self._transformers.get(key)

        if transformer:
            return transformer(data)
        return data

    def wrap_response(
        self,
        data: Any,
        version: str
    ) -> Dict[str, Any]:
        """Wrap response with version metadata.

        Args:
            data: Response data
            version: API version

        Returns:
            Wrapped response
        """
        with self._lock:
            v = self._versions.get(version)

        response = VersionedResponse(
            data=data,
            version=version,
            deprecated=v.status == VersionStatus.DEPRECATED if v else False,
            sunset_date=v.sunset_date if v else None,
        )

        if v and v.status == VersionStatus.DEPRECATED:
            response.warnings.append(
                f"API version {version} is deprecated. "
                f"Please migrate to the current version."
            )

        return response.to_dict()

    def get_deprecation_headers(self, version: str) -> Dict[str, str]:
        """Get deprecation headers for response.

        Args:
            version: API version

        Returns:
            Headers dict
        """
        headers = {}

        with self._lock:
            v = self._versions.get(version)

        if v and v.status == VersionStatus.DEPRECATED:
            headers["Deprecation"] = v.deprecation_date or "true"
            if v.sunset_date:
                headers["Sunset"] = v.sunset_date
            current = self.get_current_version()
            if current:
                headers["Link"] = f'</api/{current}>; rel="successor-version"'

        return headers


def version_required(
    manager: APIVersionManager,
    min_version: Optional[str] = None,
    max_version: Optional[str] = None
):
    """Decorator to enforce version requirements.

    Args:
        manager: Version manager
        min_version: Minimum required version
        max_version: Maximum supported version
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, request: Request = None, **kwargs):
            if request is None:
                # Try to find request in args
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if request:
                version = manager.get_version(request)

                if not manager.is_valid(version):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid API version: {version}"
                    )

                # Version comparison (simple string comparison)
                if min_version and version < min_version:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Minimum API version required: {min_version}"
                    )

                if max_version and version > max_version:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Maximum API version supported: {max_version}"
                    )

            return await func(*args, request=request, **kwargs)
        return wrapper
    return decorator


# Singleton instance
api_versioning = APIVersionManager()

# Define default versions
api_versioning.add_version(
    "v1",
    status=VersionStatus.SUPPORTED,
    release_date="2024-01-01",
    changelog=["Initial API release", "Core endpoints"],
)

api_versioning.add_version(
    "v2",
    status=VersionStatus.CURRENT,
    release_date="2024-06-01",
    changelog=[
        "Improved response format",
        "Better error handling",
        "New streaming endpoints",
    ],
    breaking_changes=[
        "Response envelope format changed",
        "Authentication token format updated",
    ],
)
