"""
API Versioning - Sprint 809

API versioning utilities with routing and deprecation.

Features:
- URL-based versioning
- Header-based versioning
- Query param versioning
- Version negotiation
- Deprecation warnings
- Version routing
"""

import functools
import re
import warnings
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import (
    Any, Callable, Dict, Generic, List, Optional, Set, Tuple, Type, TypeVar, Union
)

T = TypeVar("T")


class VersionFormat(str, Enum):
    """Version format types."""
    SEMVER = "semver"  # v1.2.3
    MAJOR = "major"    # v1
    DATE = "date"      # 2024-01-15


@dataclass(frozen=True, order=True)
class Version:
    """API version representation.

    Usage:
        v1 = Version(1, 0, 0)
        v2 = Version(2, 0, 0)
        assert v2 > v1

        v = Version.parse("v1.2.3")
        assert v.major == 1
    """
    major: int
    minor: int = 0
    patch: int = 0

    def __str__(self) -> str:
        if self.minor == 0 and self.patch == 0:
            return "v" + str(self.major)
        if self.patch == 0:
            return "v" + str(self.major) + "." + str(self.minor)
        return "v" + str(self.major) + "." + str(self.minor) + "." + str(self.patch)

    @classmethod
    def parse(cls, version_str: str) -> "Version":
        """Parse version from string."""
        if not version_str:
            raise ValueError("Empty version string")

        # Remove 'v' prefix if present
        clean = version_str.lower().strip()
        if clean.startswith("v"):
            clean = clean[1:]

        parts = clean.split(".")

        try:
            major = int(parts[0])
            minor = int(parts[1]) if len(parts) > 1 else 0
            patch = int(parts[2]) if len(parts) > 2 else 0
            return cls(major, minor, patch)
        except (ValueError, IndexError) as e:
            raise ValueError("Invalid version format: " + version_str) from e

    def is_compatible_with(self, other: "Version") -> bool:
        """Check if versions are compatible (same major version)."""
        return self.major == other.major

    def to_tuple(self) -> Tuple[int, int, int]:
        """Convert to tuple."""
        return (self.major, self.minor, self.patch)


@dataclass
class DeprecationInfo:
    """Deprecation information for an endpoint."""
    deprecated_at: datetime
    sunset_at: Optional[datetime] = None
    replacement: Optional[str] = None
    message: Optional[str] = None

    @property
    def is_sunset(self) -> bool:
        """Check if the endpoint is past sunset date."""
        if self.sunset_at:
            return datetime.now() >= self.sunset_at
        return False

    @property
    def days_until_sunset(self) -> Optional[int]:
        """Days until sunset, or None if no sunset date."""
        if self.sunset_at:
            delta = self.sunset_at - datetime.now()
            return max(0, delta.days)
        return None


@dataclass
class VersionedEndpoint:
    """Endpoint with version information."""
    path: str
    method: str
    handler: Callable
    version: Version
    deprecated: Optional[DeprecationInfo] = None
    description: str = ""
    tags: List[str] = field(default_factory=list)

    @property
    def is_deprecated(self) -> bool:
        return self.deprecated is not None

    def get_deprecation_headers(self) -> Dict[str, str]:
        """Get HTTP headers for deprecation."""
        headers = {}
        if self.deprecated:
            headers["Deprecation"] = self.deprecated.deprecated_at.isoformat()
            if self.deprecated.sunset_at:
                headers["Sunset"] = self.deprecated.sunset_at.isoformat()
            if self.deprecated.replacement:
                headers["Link"] = '<' + self.deprecated.replacement + '>; rel="successor-version"'
        return headers


class VersionExtractor(ABC):
    """Abstract version extractor."""

    @abstractmethod
    def extract(self, request: Any) -> Optional[Version]:
        """Extract version from request."""
        pass


class URLVersionExtractor(VersionExtractor):
    """Extract version from URL path.

    Usage:
        extractor = URLVersionExtractor()
        version = extractor.extract_from_path("/api/v1/users")
        assert version == Version(1, 0, 0)
    """

    def __init__(self, pattern: str = r"/v(\d+(?:\.\d+(?:\.\d+)?)?)"):
        self.pattern = re.compile(pattern)

    def extract(self, request: Any) -> Optional[Version]:
        """Extract version from request path."""
        path = getattr(request, "path", "") or getattr(request, "url", {}).get("path", "")
        return self.extract_from_path(path)

    def extract_from_path(self, path: str) -> Optional[Version]:
        """Extract version from path string."""
        match = self.pattern.search(path)
        if match:
            return Version.parse(match.group(1))
        return None


class HeaderVersionExtractor(VersionExtractor):
    """Extract version from HTTP header.

    Usage:
        extractor = HeaderVersionExtractor("X-API-Version")
        # Extracts from X-API-Version: v1.2.3
    """

    def __init__(self, header_name: str = "X-API-Version"):
        self.header_name = header_name

    def extract(self, request: Any) -> Optional[Version]:
        """Extract version from request headers."""
        headers = getattr(request, "headers", {})
        version_str = headers.get(self.header_name)
        if version_str:
            try:
                return Version.parse(version_str)
            except ValueError:
                return None
        return None


class AcceptHeaderVersionExtractor(VersionExtractor):
    """Extract version from Accept header.

    Usage:
        extractor = AcceptHeaderVersionExtractor()
        # Extracts from Accept: application/vnd.api.v1+json
    """

    def __init__(self, vendor: str = "api", pattern: Optional[str] = None):
        self.vendor = vendor
        self.pattern = re.compile(
            pattern or r"application/vnd\." + vendor + r"\.v(\d+(?:\.\d+(?:\.\d+)?)?)\+\w+"
        )

    def extract(self, request: Any) -> Optional[Version]:
        """Extract version from Accept header."""
        headers = getattr(request, "headers", {})
        accept = headers.get("Accept", "")
        match = self.pattern.search(accept)
        if match:
            return Version.parse(match.group(1))
        return None


class QueryParamVersionExtractor(VersionExtractor):
    """Extract version from query parameter.

    Usage:
        extractor = QueryParamVersionExtractor("version")
        # Extracts from ?version=1.2.3
    """

    def __init__(self, param_name: str = "version"):
        self.param_name = param_name

    def extract(self, request: Any) -> Optional[Version]:
        """Extract version from query params."""
        params = getattr(request, "query_params", {})
        if not params:
            params = getattr(request, "args", {})

        version_str = params.get(self.param_name)
        if version_str:
            try:
                return Version.parse(version_str)
            except ValueError:
                return None
        return None


class VersionNegotiator:
    """Negotiate API version from request.

    Usage:
        negotiator = VersionNegotiator(
            extractors=[
                HeaderVersionExtractor(),
                URLVersionExtractor(),
                QueryParamVersionExtractor(),
            ],
            default_version=Version(1, 0, 0),
            supported_versions=[Version(1, 0, 0), Version(2, 0, 0)]
        )
        version = negotiator.negotiate(request)
    """

    def __init__(
        self,
        extractors: List[VersionExtractor],
        default_version: Version,
        supported_versions: List[Version],
    ):
        self.extractors = extractors
        self.default_version = default_version
        self.supported_versions = set(supported_versions)

    def negotiate(self, request: Any) -> Version:
        """Negotiate version from request."""
        for extractor in self.extractors:
            version = extractor.extract(request)
            if version:
                # Find best matching supported version
                best_match = self._find_best_match(version)
                if best_match:
                    return best_match

        return self.default_version

    def _find_best_match(self, requested: Version) -> Optional[Version]:
        """Find best matching supported version."""
        # Exact match
        if requested in self.supported_versions:
            return requested

        # Find compatible versions (same major)
        compatible = [v for v in self.supported_versions if v.major == requested.major]
        if compatible:
            # Return highest compatible version
            return max(compatible)

        return None

    def is_supported(self, version: Version) -> bool:
        """Check if version is supported."""
        return version in self.supported_versions


class VersionRouter:
    """Route requests to versioned handlers.

    Usage:
        router = VersionRouter()

        @router.route("/users", method="GET", version=Version(1))
        def get_users_v1():
            return {"users": [...]}

        @router.route("/users", method="GET", version=Version(2))
        def get_users_v2():
            return {"data": {"users": [...]}, "meta": {...}}

        handler = router.resolve("/users", "GET", Version(2))
    """

    def __init__(self, default_version: Optional[Version] = None):
        self.default_version = default_version or Version(1, 0, 0)
        self._routes: Dict[str, Dict[str, Dict[Version, VersionedEndpoint]]] = {}
        self._deprecations: Dict[Tuple[str, str, Version], DeprecationInfo] = {}

    def route(
        self,
        path: str,
        method: str = "GET",
        version: Optional[Version] = None,
        deprecated: Optional[DeprecationInfo] = None,
        description: str = "",
        tags: Optional[List[str]] = None,
    ) -> Callable:
        """Decorator to register a versioned route."""
        def decorator(func: Callable) -> Callable:
            v = version or self.default_version
            self.add_route(
                path=path,
                method=method.upper(),
                handler=func,
                version=v,
                deprecated=deprecated,
                description=description,
                tags=tags or [],
            )
            return func
        return decorator

    def add_route(
        self,
        path: str,
        method: str,
        handler: Callable,
        version: Version,
        deprecated: Optional[DeprecationInfo] = None,
        description: str = "",
        tags: Optional[List[str]] = None,
    ) -> None:
        """Add a versioned route."""
        if path not in self._routes:
            self._routes[path] = {}
        if method not in self._routes[path]:
            self._routes[path][method] = {}

        endpoint = VersionedEndpoint(
            path=path,
            method=method,
            handler=handler,
            version=version,
            deprecated=deprecated,
            description=description,
            tags=tags or [],
        )

        self._routes[path][method][version] = endpoint

        if deprecated:
            self._deprecations[(path, method, version)] = deprecated

    def resolve(
        self,
        path: str,
        method: str,
        version: Optional[Version] = None,
    ) -> Optional[VersionedEndpoint]:
        """Resolve handler for path, method, and version."""
        method = method.upper()
        v = version or self.default_version

        if path not in self._routes:
            return None
        if method not in self._routes[path]:
            return None

        versions = self._routes[path][method]

        # Exact match
        if v in versions:
            return versions[v]

        # Find closest compatible version
        compatible = [ver for ver in versions.keys() if ver.major == v.major and ver <= v]
        if compatible:
            return versions[max(compatible)]

        return None

    def get_all_versions(self, path: str, method: str) -> List[Version]:
        """Get all versions for a path/method."""
        method = method.upper()
        if path in self._routes and method in self._routes[path]:
            return sorted(self._routes[path][method].keys())
        return []

    def deprecate(
        self,
        path: str,
        method: str,
        version: Version,
        sunset_days: int = 90,
        replacement: Optional[str] = None,
        message: Optional[str] = None,
    ) -> None:
        """Mark a version as deprecated."""
        method = method.upper()
        if path in self._routes and method in self._routes[path] and version in self._routes[path][method]:
            deprecation = DeprecationInfo(
                deprecated_at=datetime.now(),
                sunset_at=datetime.now() + timedelta(days=sunset_days),
                replacement=replacement,
                message=message,
            )
            self._routes[path][method][version].deprecated = deprecation
            self._deprecations[(path, method, version)] = deprecation

    def get_deprecations(self) -> List[Tuple[str, str, Version, DeprecationInfo]]:
        """Get all deprecated endpoints."""
        result = []
        for (path, method, version), info in self._deprecations.items():
            result.append((path, method, version, info))
        return result


def versioned(
    version: Union[Version, str],
    deprecated: bool = False,
    sunset_days: int = 90,
    replacement: Optional[str] = None,
) -> Callable:
    """Decorator to mark a function with version info.

    Usage:
        @versioned("v1")
        def get_users():
            ...

        @versioned("v2", deprecated=True, replacement="/api/v3/users")
        def get_users_v2():
            ...
    """
    def decorator(func: Callable) -> Callable:
        v = Version.parse(version) if isinstance(version, str) else version

        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            if deprecated:
                warnings.warn(
                    "This endpoint is deprecated" +
                    (". Use " + replacement + " instead" if replacement else ""),
                    DeprecationWarning,
                    stacklevel=2,
                )
            return func(*args, **kwargs)

        # Attach version metadata
        wrapper._api_version = v
        wrapper._deprecated = deprecated
        wrapper._replacement = replacement
        wrapper._sunset_days = sunset_days

        return wrapper
    return decorator


class VersionedAPI:
    """API with version management.

    Usage:
        api = VersionedAPI(
            name="MyAPI",
            current_version=Version(2, 0, 0),
            supported_versions=[Version(1), Version(2)],
        )

        api.deprecate_version(Version(1), sunset_days=30)

        @api.endpoint("/users", methods=["GET"])
        def get_users(version: Version):
            if version.major == 1:
                return v1_response()
            return v2_response()
    """

    def __init__(
        self,
        name: str,
        current_version: Version,
        supported_versions: List[Version],
        default_version: Optional[Version] = None,
    ):
        self.name = name
        self.current_version = current_version
        self.supported_versions = set(supported_versions)
        self.default_version = default_version or min(supported_versions)
        self.router = VersionRouter(self.default_version)
        self._version_deprecations: Dict[Version, DeprecationInfo] = {}

    def deprecate_version(
        self,
        version: Version,
        sunset_days: int = 90,
        message: Optional[str] = None,
    ) -> None:
        """Deprecate an entire API version."""
        self._version_deprecations[version] = DeprecationInfo(
            deprecated_at=datetime.now(),
            sunset_at=datetime.now() + timedelta(days=sunset_days),
            message=message,
        )

    def is_version_deprecated(self, version: Version) -> bool:
        """Check if a version is deprecated."""
        return version in self._version_deprecations

    def get_version_info(self, version: Version) -> Dict[str, Any]:
        """Get information about a version."""
        deprecated_info = self._version_deprecations.get(version)
        return {
            "version": str(version),
            "supported": version in self.supported_versions,
            "current": version == self.current_version,
            "deprecated": deprecated_info is not None,
            "deprecation_info": {
                "deprecated_at": deprecated_info.deprecated_at.isoformat(),
                "sunset_at": deprecated_info.sunset_at.isoformat() if deprecated_info.sunset_at else None,
                "message": deprecated_info.message,
            } if deprecated_info else None,
        }

    def endpoint(
        self,
        path: str,
        methods: List[str] = None,
        versions: Optional[List[Version]] = None,
    ) -> Callable:
        """Decorator to register an endpoint for multiple versions."""
        methods = methods or ["GET"]
        versions = versions or list(self.supported_versions)

        def decorator(func: Callable) -> Callable:
            for method in methods:
                for version in versions:
                    deprecated = self._version_deprecations.get(version)
                    self.router.add_route(
                        path=path,
                        method=method,
                        handler=func,
                        version=version,
                        deprecated=deprecated,
                    )
            return func
        return decorator

    def get_supported_versions(self) -> List[Version]:
        """Get list of supported versions."""
        return sorted(self.supported_versions)

    def get_deprecated_versions(self) -> List[Tuple[Version, DeprecationInfo]]:
        """Get list of deprecated versions with info."""
        return [(v, info) for v, info in self._version_deprecations.items()]


# Convenience functions
def parse_version(version_str: str) -> Version:
    """Parse version string."""
    return Version.parse(version_str)


def v(major: int, minor: int = 0, patch: int = 0) -> Version:
    """Create version shorthand."""
    return Version(major, minor, patch)
