"""
Content Negotiation - Sprint 787

HTTP content negotiation for APIs.

Features:
- Media type parsing
- Accept header handling
- Content type selection
- Serialization formats
- Quality values
- Charset negotiation
"""

import json
import re
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union, Tuple
)
from enum import Enum
from abc import ABC, abstractmethod
import logging

logger = logging.getLogger(__name__)


T = TypeVar("T")


@dataclass
class MediaType:
    """Parsed media type."""
    type: str
    subtype: str
    suffix: Optional[str] = None
    parameters: Dict[str, str] = field(default_factory=dict)
    quality: float = 1.0

    @property
    def full_type(self) -> str:
        """Get full type/subtype string."""
        base = self.type + "/" + self.subtype
        if self.suffix:
            base += "+" + self.suffix
        return base

    @property
    def essence(self) -> str:
        """Get type without parameters."""
        return self.full_type

    def matches(self, other: "MediaType") -> bool:
        """Check if this media type matches another."""
        # Wildcard matching
        if self.type == "*" or other.type == "*":
            return True

        if self.type != other.type:
            return False

        if self.subtype == "*" or other.subtype == "*":
            return True

        if self.subtype != other.subtype:
            return False

        # Check suffix
        if self.suffix and other.suffix and self.suffix != other.suffix:
            return False

        return True

    def specificity(self) -> int:
        """Get specificity score for sorting."""
        score = 0
        if self.type != "*":
            score += 100
        if self.subtype != "*":
            score += 10
        if self.suffix:
            score += 1
        return score

    def to_string(self) -> str:
        """Convert to string representation."""
        parts = [self.full_type]
        for key, value in self.parameters.items():
            if " " in value or ";" in value:
                parts.append(key + '="' + value + '"')
            else:
                parts.append(key + "=" + value)
        return "; ".join(parts)

    @classmethod
    def parse(cls, value: str) -> "MediaType":
        """Parse a media type string."""
        # Remove leading/trailing whitespace
        value = value.strip()

        # Split into type and parameters
        parts = value.split(";")
        type_part = parts[0].strip()
        param_parts = parts[1:] if len(parts) > 1 else []

        # Parse type/subtype
        if "/" in type_part:
            type_str, subtype_str = type_part.split("/", 1)
        else:
            type_str = type_part
            subtype_str = "*"

        # Check for suffix (e.g., application/vnd.api+json)
        suffix = None
        if "+" in subtype_str:
            subtype_str, suffix = subtype_str.rsplit("+", 1)

        # Parse parameters
        parameters = {}
        quality = 1.0

        for param in param_parts:
            param = param.strip()
            if "=" in param:
                key, val = param.split("=", 1)
                key = key.strip().lower()
                val = val.strip().strip('"')

                if key == "q":
                    try:
                        quality = float(val)
                    except ValueError:
                        quality = 1.0
                else:
                    parameters[key] = val

        return cls(
            type=type_str.lower().strip(),
            subtype=subtype_str.lower().strip(),
            suffix=suffix.lower() if suffix else None,
            parameters=parameters,
            quality=quality,
        )


def parse_accept_header(header: str) -> List[MediaType]:
    """Parse Accept header into sorted list of media types."""
    if not header:
        return [MediaType.parse("*/*")]

    media_types = []
    for part in header.split(","):
        part = part.strip()
        if part:
            try:
                media_types.append(MediaType.parse(part))
            except Exception as e:
                logger.warning("Failed to parse media type: " + part + " - " + str(e))

    # Sort by quality (descending), then specificity (descending)
    media_types.sort(
        key=lambda m: (-m.quality, -m.specificity()),
    )

    return media_types


class Serializer(ABC):
    """Abstract content serializer."""

    media_type: str
    charset: str = "utf-8"

    @abstractmethod
    def serialize(self, data: Any) -> bytes:
        """Serialize data to bytes."""
        pass

    @abstractmethod
    def deserialize(self, data: bytes) -> Any:
        """Deserialize bytes to data."""
        pass


class JsonSerializer(Serializer):
    """JSON serializer."""

    media_type = "application/json"

    def __init__(
        self,
        indent: Optional[int] = None,
        ensure_ascii: bool = False,
        default: Optional[Callable] = None,
    ):
        self.indent = indent
        self.ensure_ascii = ensure_ascii
        self.default = default or self._default_encoder

    def _default_encoder(self, obj: Any) -> Any:
        if hasattr(obj, "to_dict"):
            return obj.to_dict()
        if hasattr(obj, "__dict__"):
            return obj.__dict__
        raise TypeError("Object not serializable: " + str(type(obj)))

    def serialize(self, data: Any) -> bytes:
        return json.dumps(
            data,
            indent=self.indent,
            ensure_ascii=self.ensure_ascii,
            default=self.default,
        ).encode(self.charset)

    def deserialize(self, data: bytes) -> Any:
        return json.loads(data.decode(self.charset))


class XmlSerializer(Serializer):
    """Simple XML serializer."""

    media_type = "application/xml"

    def __init__(self, root_name: str = "root"):
        self.root_name = root_name

    def _to_xml(self, data: Any, parent: str = "") -> str:
        if isinstance(data, dict):
            items = []
            for key, value in data.items():
                items.append("<" + key + ">" + self._to_xml(value, key) + "</" + key + ">")
            return "".join(items)
        elif isinstance(data, (list, tuple)):
            item_name = parent.rstrip("s") if parent.endswith("s") else "item"
            items = []
            for item in data:
                items.append("<" + item_name + ">" + self._to_xml(item, item_name) + "</" + item_name + ">")
            return "".join(items)
        elif data is None:
            return ""
        else:
            return str(data)

    def serialize(self, data: Any) -> bytes:
        xml = '<?xml version="1.0" encoding="' + self.charset + '"?>'
        xml += "<" + self.root_name + ">" + self._to_xml(data) + "</" + self.root_name + ">"
        return xml.encode(self.charset)

    def deserialize(self, data: bytes) -> Any:
        # Basic XML parsing (for demo - use proper parser in production)
        raise NotImplementedError("XML deserialization not implemented")


class PlainTextSerializer(Serializer):
    """Plain text serializer."""

    media_type = "text/plain"

    def serialize(self, data: Any) -> bytes:
        if isinstance(data, str):
            return data.encode(self.charset)
        return str(data).encode(self.charset)

    def deserialize(self, data: bytes) -> Any:
        return data.decode(self.charset)


class HtmlSerializer(Serializer):
    """HTML serializer."""

    media_type = "text/html"

    def __init__(self, template: Optional[str] = None):
        self.template = template or "<!DOCTYPE html><html><body>{content}</body></html>"

    def _to_html(self, data: Any) -> str:
        if isinstance(data, dict):
            items = []
            for key, value in data.items():
                items.append("<dt>" + key + "</dt><dd>" + self._to_html(value) + "</dd>")
            return "<dl>" + "".join(items) + "</dl>"
        elif isinstance(data, (list, tuple)):
            items = ["<li>" + self._to_html(item) + "</li>" for item in data]
            return "<ul>" + "".join(items) + "</ul>"
        elif data is None:
            return "<em>null</em>"
        else:
            return str(data)

    def serialize(self, data: Any) -> bytes:
        content = self._to_html(data)
        html = self.template.replace("{content}", content)
        return html.encode(self.charset)

    def deserialize(self, data: bytes) -> Any:
        raise NotImplementedError("HTML deserialization not implemented")


class ContentNegotiator:
    """Content negotiation handler.

    Usage:
        negotiator = ContentNegotiator()
        negotiator.register(JsonSerializer())
        negotiator.register(XmlSerializer())

        # Select serializer based on Accept header
        serializer = negotiator.select_serializer("application/json, application/xml;q=0.9")

        # Serialize data
        content_type, body = negotiator.serialize(data, "application/json")
    """

    def __init__(self, default_media_type: str = "application/json"):
        self._serializers: Dict[str, Serializer] = {}
        self._default_media_type = default_media_type

    def register(self, serializer: Serializer) -> "ContentNegotiator":
        """Register a serializer."""
        self._serializers[serializer.media_type] = serializer
        return self

    def unregister(self, media_type: str) -> bool:
        """Unregister a serializer."""
        if media_type in self._serializers:
            del self._serializers[media_type]
            return True
        return False

    def get_serializer(self, media_type: str) -> Optional[Serializer]:
        """Get serializer for exact media type."""
        return self._serializers.get(media_type)

    def select_serializer(
        self,
        accept_header: str,
        default: Optional[str] = None,
    ) -> Optional[Serializer]:
        """Select best serializer based on Accept header."""
        accepted = parse_accept_header(accept_header)

        for media_type in accepted:
            # Try exact match first
            if media_type.full_type in self._serializers:
                return self._serializers[media_type.full_type]

            # Try wildcard matching
            for registered_type, serializer in self._serializers.items():
                registered = MediaType.parse(registered_type)
                if media_type.matches(registered):
                    return serializer

        # Use default
        default_type = default or self._default_media_type
        return self._serializers.get(default_type)

    def select_media_type(
        self,
        accept_header: str,
    ) -> Optional[str]:
        """Select best media type based on Accept header."""
        serializer = self.select_serializer(accept_header)
        return serializer.media_type if serializer else None

    def serialize(
        self,
        data: Any,
        accept_header: str = "*/*",
    ) -> Tuple[str, bytes]:
        """Serialize data based on Accept header."""
        serializer = self.select_serializer(accept_header)

        if not serializer:
            raise ValueError("No acceptable media type: " + accept_header)

        body = serializer.serialize(data)
        content_type = serializer.media_type + "; charset=" + serializer.charset

        return content_type, body

    def deserialize(
        self,
        data: bytes,
        content_type: str,
    ) -> Any:
        """Deserialize data based on Content-Type header."""
        media_type = MediaType.parse(content_type)
        serializer = self._serializers.get(media_type.full_type)

        if not serializer:
            raise ValueError("Unsupported media type: " + content_type)

        return serializer.deserialize(data)

    def supported_types(self) -> List[str]:
        """Get list of supported media types."""
        return list(self._serializers.keys())

    def supports(self, media_type: str) -> bool:
        """Check if media type is supported."""
        return media_type in self._serializers


class CharsetNegotiator:
    """Charset negotiation."""

    SUPPORTED_CHARSETS = ["utf-8", "iso-8859-1", "ascii"]

    @classmethod
    def parse_accept_charset(cls, header: str) -> List[Tuple[str, float]]:
        """Parse Accept-Charset header."""
        if not header:
            return [("utf-8", 1.0)]

        charsets = []
        for part in header.split(","):
            part = part.strip()
            if not part:
                continue

            if ";q=" in part.lower():
                charset, q = part.lower().split(";q=", 1)
                try:
                    quality = float(q)
                except ValueError:
                    quality = 1.0
            else:
                charset = part.lower()
                quality = 1.0

            charsets.append((charset.strip(), quality))

        charsets.sort(key=lambda x: -x[1])
        return charsets

    @classmethod
    def select_charset(
        cls,
        accept_charset: str,
        supported: Optional[List[str]] = None,
    ) -> str:
        """Select best charset."""
        supported = supported or cls.SUPPORTED_CHARSETS
        accepted = cls.parse_accept_charset(accept_charset)

        for charset, _ in accepted:
            if charset == "*":
                return supported[0]
            if charset in supported:
                return charset

        return supported[0]


class LanguageNegotiator:
    """Language negotiation."""

    @classmethod
    def parse_accept_language(cls, header: str) -> List[Tuple[str, float]]:
        """Parse Accept-Language header."""
        if not header:
            return [("en", 1.0)]

        languages = []
        for part in header.split(","):
            part = part.strip()
            if not part:
                continue

            if ";q=" in part.lower():
                lang, q = part.lower().split(";q=", 1)
                try:
                    quality = float(q)
                except ValueError:
                    quality = 1.0
            else:
                lang = part.lower()
                quality = 1.0

            languages.append((lang.strip(), quality))

        languages.sort(key=lambda x: -x[1])
        return languages

    @classmethod
    def select_language(
        cls,
        accept_language: str,
        supported: List[str],
        default: str = "en",
    ) -> str:
        """Select best language."""
        accepted = cls.parse_accept_language(accept_language)

        for lang, _ in accepted:
            # Exact match
            if lang in supported:
                return lang

            # Wildcard
            if lang == "*" and supported:
                return supported[0]

            # Prefix match (e.g., en-US matches en)
            prefix = lang.split("-")[0]
            for s in supported:
                if s.startswith(prefix):
                    return s

        return default


# Convenience factory
def create_negotiator() -> ContentNegotiator:
    """Create negotiator with common serializers."""
    negotiator = ContentNegotiator()
    negotiator.register(JsonSerializer())
    negotiator.register(XmlSerializer())
    negotiator.register(PlainTextSerializer())
    negotiator.register(HtmlSerializer())
    return negotiator


# Global instance
_negotiator: Optional[ContentNegotiator] = None


def get_negotiator() -> ContentNegotiator:
    """Get global content negotiator."""
    global _negotiator
    if not _negotiator:
        _negotiator = create_negotiator()
    return _negotiator
