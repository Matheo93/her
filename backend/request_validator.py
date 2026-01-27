"""
Request Validator - Sprint 813

HTTP request validation utilities.

Features:
- Input sanitization
- Schema validation
- File upload validation
- Rate limit validation
- Request signing
- CORS validation
"""

import hashlib
import hmac
import re
import time
import unicodedata
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import (
    Any, Callable, Dict, Generic, List, Optional, Pattern, Set, Tuple, Type, TypeVar, Union
)

T = TypeVar("T")


class ValidationError(Exception):
    """Validation error with field information."""

    def __init__(
        self,
        message: str,
        field: Optional[str] = None,
        code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.message = message
        self.field = field
        self.code = code or "validation_error"
        self.details = details or {}

    def to_dict(self) -> dict:
        return {
            "message": self.message,
            "field": self.field,
            "code": self.code,
            "details": self.details,
        }


@dataclass
class ValidationResult:
    """Result of validation."""
    valid: bool
    errors: List[ValidationError] = field(default_factory=list)
    sanitized_data: Optional[Dict[str, Any]] = None

    def to_dict(self) -> dict:
        return {
            "valid": self.valid,
            "errors": [e.to_dict() for e in self.errors],
        }

    @property
    def first_error(self) -> Optional[ValidationError]:
        return self.errors[0] if self.errors else None


class InputSanitizer:
    """Sanitize user input.

    Usage:
        sanitizer = InputSanitizer()
        clean = sanitizer.sanitize_string("  Hello<script>  ")
        # Returns: "Hello"
    """

    # HTML tag pattern
    HTML_TAG_PATTERN = re.compile(r"<[^>]+>")

    # Script pattern
    SCRIPT_PATTERN = re.compile(
        r"<script[^>]*>.*?</script>|javascript:|on\w+\s*=",
        re.IGNORECASE | re.DOTALL,
    )

    # SQL injection patterns
    SQL_PATTERNS = [
        re.compile(r"(\b(union|select|insert|update|delete|drop|create|alter|truncate)\b)", re.IGNORECASE),
        re.compile(r"(--|;|/\*|\*/|@@|@)", re.IGNORECASE),
        re.compile(r"(\bor\b|\band\b)\s+[\'\"\d]", re.IGNORECASE),
    ]

    # Control characters
    CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

    def sanitize_string(
        self,
        value: str,
        strip: bool = True,
        remove_html: bool = True,
        remove_scripts: bool = True,
        remove_control: bool = True,
        max_length: Optional[int] = None,
        normalize_unicode: bool = True,
    ) -> str:
        """Sanitize a string value."""
        if not isinstance(value, str):
            value = str(value)

        # Normalize Unicode
        if normalize_unicode:
            value = unicodedata.normalize("NFKC", value)

        # Remove control characters
        if remove_control:
            value = self.CONTROL_CHARS.sub("", value)

        # Remove scripts first (more aggressive)
        if remove_scripts:
            value = self.SCRIPT_PATTERN.sub("", value)

        # Remove HTML tags
        if remove_html:
            value = self.HTML_TAG_PATTERN.sub("", value)

        # Strip whitespace
        if strip:
            value = value.strip()

        # Truncate
        if max_length and len(value) > max_length:
            value = value[:max_length]

        return value

    def sanitize_email(self, email: str) -> str:
        """Sanitize email address."""
        email = self.sanitize_string(email, remove_html=False).lower()
        # Remove any characters that aren't valid in emails
        email = re.sub(r"[^\w.@+-]", "", email)
        return email

    def sanitize_filename(self, filename: str) -> str:
        """Sanitize filename."""
        # Remove path separators
        filename = re.sub(r"[/\\]", "", filename)
        # Remove dangerous characters
        filename = re.sub(r"[<>:\"|?*\x00-\x1f]", "", filename)
        # Remove leading/trailing dots and spaces
        filename = filename.strip(". ")
        # Limit length
        if len(filename) > 255:
            name, ext = filename.rsplit(".", 1) if "." in filename else (filename, "")
            filename = name[:250] + ("." + ext if ext else "")
        return filename

    def sanitize_url(self, url: str) -> str:
        """Sanitize URL."""
        # Check dangerous protocols FIRST before any sanitization
        if re.match(r"^\s*(javascript|data|vbscript):", url, re.IGNORECASE):
            return ""
        # Then sanitize (but don't remove scripts since we already handled dangerous protocols)
        url = self.sanitize_string(url, remove_html=False, remove_scripts=False)
        return url

    def check_sql_injection(self, value: str) -> bool:
        """Check for potential SQL injection. Returns True if suspicious."""
        for pattern in self.SQL_PATTERNS:
            if pattern.search(value):
                return True
        return False

    def sanitize_dict(
        self,
        data: Dict[str, Any],
        string_fields: Optional[List[str]] = None,
        max_lengths: Optional[Dict[str, int]] = None,
    ) -> Dict[str, Any]:
        """Sanitize dictionary of values."""
        result = {}
        string_fields = string_fields or list(data.keys())
        max_lengths = max_lengths or {}

        for key, value in data.items():
            if key in string_fields and isinstance(value, str):
                max_len = max_lengths.get(key)
                result[key] = self.sanitize_string(value, max_length=max_len)
            else:
                result[key] = value

        return result


class FieldValidator(ABC):
    """Abstract field validator."""

    @abstractmethod
    def validate(self, value: Any, field_name: str) -> Optional[ValidationError]:
        """Validate a value. Returns error if invalid."""
        pass


class RequiredValidator(FieldValidator):
    """Validate required field."""

    def __init__(self, message: str = "This field is required"):
        self.message = message

    def validate(self, value: Any, field_name: str) -> Optional[ValidationError]:
        if value is None or (isinstance(value, str) and not value.strip()):
            return ValidationError(self.message, field_name, "required")
        return None


class TypeValidator(FieldValidator):
    """Validate field type."""

    def __init__(self, expected_type: Type, message: Optional[str] = None):
        self.expected_type = expected_type
        self.message = message or "Expected type: " + expected_type.__name__

    def validate(self, value: Any, field_name: str) -> Optional[ValidationError]:
        if value is not None and not isinstance(value, self.expected_type):
            return ValidationError(self.message, field_name, "type_error")
        return None


class StringValidator(FieldValidator):
    """Validate string field."""

    def __init__(
        self,
        min_length: Optional[int] = None,
        max_length: Optional[int] = None,
        pattern: Optional[str] = None,
        message: Optional[str] = None,
    ):
        self.min_length = min_length
        self.max_length = max_length
        self.pattern = re.compile(pattern) if pattern else None
        self.message = message

    def validate(self, value: Any, field_name: str) -> Optional[ValidationError]:
        if value is None:
            return None

        if not isinstance(value, str):
            return ValidationError("Must be a string", field_name, "type_error")

        if self.min_length and len(value) < self.min_length:
            msg = self.message or "Minimum length: " + str(self.min_length)
            return ValidationError(msg, field_name, "min_length")

        if self.max_length and len(value) > self.max_length:
            msg = self.message or "Maximum length: " + str(self.max_length)
            return ValidationError(msg, field_name, "max_length")

        if self.pattern and not self.pattern.match(value):
            msg = self.message or "Invalid format"
            return ValidationError(msg, field_name, "pattern")

        return None


class EmailValidator(FieldValidator):
    """Validate email address."""

    EMAIL_PATTERN = re.compile(
        r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    )

    def __init__(self, message: str = "Invalid email address"):
        self.message = message

    def validate(self, value: Any, field_name: str) -> Optional[ValidationError]:
        if value is None:
            return None

        if not isinstance(value, str) or not self.EMAIL_PATTERN.match(value):
            return ValidationError(self.message, field_name, "email")
        return None


class NumberValidator(FieldValidator):
    """Validate numeric field."""

    def __init__(
        self,
        min_value: Optional[float] = None,
        max_value: Optional[float] = None,
        integer_only: bool = False,
        message: Optional[str] = None,
    ):
        self.min_value = min_value
        self.max_value = max_value
        self.integer_only = integer_only
        self.message = message

    def validate(self, value: Any, field_name: str) -> Optional[ValidationError]:
        if value is None:
            return None

        if self.integer_only and not isinstance(value, int):
            return ValidationError("Must be an integer", field_name, "type_error")

        if not isinstance(value, (int, float)):
            return ValidationError("Must be a number", field_name, "type_error")

        if self.min_value is not None and value < self.min_value:
            msg = self.message or "Minimum value: " + str(self.min_value)
            return ValidationError(msg, field_name, "min_value")

        if self.max_value is not None and value > self.max_value:
            msg = self.message or "Maximum value: " + str(self.max_value)
            return ValidationError(msg, field_name, "max_value")

        return None


class EnumValidator(FieldValidator):
    """Validate enum field."""

    def __init__(self, allowed_values: List[Any], message: Optional[str] = None):
        self.allowed_values = set(allowed_values)
        self.message = message or "Must be one of: " + ", ".join(str(v) for v in allowed_values)

    def validate(self, value: Any, field_name: str) -> Optional[ValidationError]:
        if value is None:
            return None

        if value not in self.allowed_values:
            return ValidationError(self.message, field_name, "enum")
        return None


class URLValidator(FieldValidator):
    """Validate URL."""

    URL_PATTERN = re.compile(
        r"^https?://"
        r"(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|"
        r"localhost|"
        r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"
        r"(?::\d+)?"
        r"(?:/?|[/?]\S+)$",
        re.IGNORECASE,
    )

    def __init__(
        self,
        require_https: bool = False,
        allowed_domains: Optional[List[str]] = None,
        message: str = "Invalid URL",
    ):
        self.require_https = require_https
        self.allowed_domains = set(allowed_domains) if allowed_domains else None
        self.message = message

    def validate(self, value: Any, field_name: str) -> Optional[ValidationError]:
        if value is None:
            return None

        if not isinstance(value, str) or not self.URL_PATTERN.match(value):
            return ValidationError(self.message, field_name, "url")

        if self.require_https and not value.lower().startswith("https://"):
            return ValidationError("URL must use HTTPS", field_name, "url_https")

        if self.allowed_domains:
            from urllib.parse import urlparse
            parsed = urlparse(value)
            if parsed.netloc not in self.allowed_domains:
                return ValidationError("Domain not allowed", field_name, "url_domain")

        return None


@dataclass
class FieldSchema:
    """Schema for a single field."""
    validators: List[FieldValidator] = field(default_factory=list)
    required: bool = False
    default: Any = None
    sanitize: bool = True


class RequestValidator:
    """Validate HTTP request data.

    Usage:
        validator = RequestValidator()
        validator.add_field("email", required=True, validators=[EmailValidator()])
        validator.add_field("age", validators=[NumberValidator(min_value=0, max_value=150)])

        result = validator.validate({"email": "test@example.com", "age": 25})
        if result.valid:
            data = result.sanitized_data
    """

    def __init__(self):
        self._schema: Dict[str, FieldSchema] = {}
        self._sanitizer = InputSanitizer()

    def add_field(
        self,
        name: str,
        required: bool = False,
        validators: Optional[List[FieldValidator]] = None,
        default: Any = None,
        sanitize: bool = True,
    ) -> "RequestValidator":
        """Add a field to the schema."""
        field_validators = validators or []
        if required:
            field_validators.insert(0, RequiredValidator())

        self._schema[name] = FieldSchema(
            validators=field_validators,
            required=required,
            default=default,
            sanitize=sanitize,
        )
        return self

    def validate(self, data: Dict[str, Any]) -> ValidationResult:
        """Validate request data."""
        errors: List[ValidationError] = []
        sanitized: Dict[str, Any] = {}

        # Check each field in schema
        for field_name, schema in self._schema.items():
            value = data.get(field_name)

            # Use default if not provided
            if value is None and schema.default is not None:
                value = schema.default

            # Sanitize string values
            if schema.sanitize and isinstance(value, str):
                value = self._sanitizer.sanitize_string(value)

            # Run validators
            for validator in schema.validators:
                error = validator.validate(value, field_name)
                if error:
                    errors.append(error)
                    break  # Stop at first error for field

            sanitized[field_name] = value

        # Include extra fields not in schema
        for key, value in data.items():
            if key not in self._schema:
                if isinstance(value, str):
                    value = self._sanitizer.sanitize_string(value)
                sanitized[key] = value

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            sanitized_data=sanitized if len(errors) == 0 else None,
        )


class FileValidator:
    """Validate file uploads.

    Usage:
        validator = FileValidator(
            max_size=10 * 1024 * 1024,  # 10MB
            allowed_types=["image/jpeg", "image/png"],
            allowed_extensions=[".jpg", ".jpeg", ".png"]
        )

        result = validator.validate(file_content, filename, content_type)
    """

    # Magic bytes for common file types
    MAGIC_BYTES = {
        "image/jpeg": [b"\xff\xd8\xff"],
        "image/png": [b"\x89PNG\r\n\x1a\n"],
        "image/gif": [b"GIF87a", b"GIF89a"],
        "application/pdf": [b"%PDF"],
        "application/zip": [b"PK\x03\x04", b"PK\x05\x06"],
    }

    def __init__(
        self,
        max_size: int = 10 * 1024 * 1024,
        allowed_types: Optional[List[str]] = None,
        allowed_extensions: Optional[List[str]] = None,
        check_magic: bool = True,
    ):
        self.max_size = max_size
        self.allowed_types = set(allowed_types) if allowed_types else None
        self.allowed_extensions = set(
            ext.lower() for ext in (allowed_extensions or [])
        )
        self.check_magic = check_magic

    def validate(
        self,
        content: bytes,
        filename: str,
        content_type: Optional[str] = None,
    ) -> ValidationResult:
        """Validate file upload."""
        errors: List[ValidationError] = []
        sanitizer = InputSanitizer()
        clean_filename = sanitizer.sanitize_filename(filename)

        # Check size
        if len(content) > self.max_size:
            errors.append(ValidationError(
                "File too large. Max size: " + str(self.max_size // (1024 * 1024)) + "MB",
                "file",
                "file_size",
            ))

        # Check extension
        if self.allowed_extensions:
            ext = ""
            if "." in clean_filename:
                ext = "." + clean_filename.rsplit(".", 1)[1].lower()
            if ext not in self.allowed_extensions:
                errors.append(ValidationError(
                    "File type not allowed",
                    "file",
                    "file_extension",
                    {"allowed": list(self.allowed_extensions)},
                ))

        # Check content type
        if self.allowed_types and content_type:
            if content_type not in self.allowed_types:
                errors.append(ValidationError(
                    "Content type not allowed",
                    "file",
                    "content_type",
                    {"allowed": list(self.allowed_types)},
                ))

        # Check magic bytes
        if self.check_magic and content_type and content_type in self.MAGIC_BYTES:
            magic_list = self.MAGIC_BYTES[content_type]
            if not any(content.startswith(magic) for magic in magic_list):
                errors.append(ValidationError(
                    "File content doesn't match declared type",
                    "file",
                    "file_magic",
                ))

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            sanitized_data={"filename": clean_filename} if len(errors) == 0 else None,
        )


class RequestSigner:
    """Sign and verify request signatures.

    Usage:
        signer = RequestSigner(secret_key="my-secret")

        # Sign request
        signature = signer.sign({"user_id": 123, "action": "create"})

        # Verify
        is_valid = signer.verify(data, signature)
    """

    def __init__(
        self,
        secret_key: str,
        algorithm: str = "sha256",
        timestamp_tolerance: int = 300,
    ):
        self.secret_key = secret_key.encode()
        self.algorithm = algorithm
        self.timestamp_tolerance = timestamp_tolerance

    def sign(
        self,
        data: Dict[str, Any],
        include_timestamp: bool = True,
    ) -> str:
        """Sign request data."""
        payload = dict(data)
        if include_timestamp:
            payload["_timestamp"] = int(time.time())

        # Create deterministic string
        sorted_keys = sorted(payload.keys())
        message = "&".join(
            str(k) + "=" + str(payload[k])
            for k in sorted_keys
        )

        # Create HMAC signature
        signature = hmac.new(
            self.secret_key,
            message.encode(),
            self.algorithm,
        ).hexdigest()

        return signature

    def verify(
        self,
        data: Dict[str, Any],
        signature: str,
        check_timestamp: bool = True,
    ) -> bool:
        """Verify request signature."""
        # Check timestamp
        if check_timestamp and "_timestamp" in data:
            timestamp = data.get("_timestamp", 0)
            now = int(time.time())
            if abs(now - timestamp) > self.timestamp_tolerance:
                return False

        # Recreate signature
        expected = self.sign(data, include_timestamp=False)

        # Constant-time comparison
        return hmac.compare_digest(signature, expected)


class CORSValidator:
    """Validate CORS requests.

    Usage:
        validator = CORSValidator(
            allowed_origins=["https://example.com"],
            allowed_methods=["GET", "POST"],
            allowed_headers=["Content-Type", "Authorization"]
        )

        # Check origin
        is_allowed = validator.is_origin_allowed("https://example.com")
    """

    def __init__(
        self,
        allowed_origins: Optional[List[str]] = None,
        allowed_methods: Optional[List[str]] = None,
        allowed_headers: Optional[List[str]] = None,
        allow_credentials: bool = False,
        max_age: int = 86400,
    ):
        self.allowed_origins = set(allowed_origins) if allowed_origins else None
        self.allowed_methods = set(m.upper() for m in (allowed_methods or ["GET", "POST", "OPTIONS"]))
        self.allowed_headers = set(h.lower() for h in (allowed_headers or []))
        self.allow_credentials = allow_credentials
        self.max_age = max_age

    def is_origin_allowed(self, origin: str) -> bool:
        """Check if origin is allowed."""
        if self.allowed_origins is None:
            return True  # Allow all
        return origin in self.allowed_origins

    def is_method_allowed(self, method: str) -> bool:
        """Check if method is allowed."""
        return method.upper() in self.allowed_methods

    def get_cors_headers(self, origin: str) -> Dict[str, str]:
        """Get CORS headers for response."""
        headers = {}

        if self.is_origin_allowed(origin):
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Methods"] = ", ".join(self.allowed_methods)

            if self.allowed_headers:
                headers["Access-Control-Allow-Headers"] = ", ".join(self.allowed_headers)

            if self.allow_credentials:
                headers["Access-Control-Allow-Credentials"] = "true"

            headers["Access-Control-Max-Age"] = str(self.max_age)

        return headers


# Convenience factory functions
def string_field(
    min_length: Optional[int] = None,
    max_length: Optional[int] = None,
    pattern: Optional[str] = None,
    required: bool = False,
) -> Tuple[bool, List[FieldValidator]]:
    """Create string field config."""
    validators = [StringValidator(min_length, max_length, pattern)]
    return required, validators


def email_field(required: bool = False) -> Tuple[bool, List[FieldValidator]]:
    """Create email field config."""
    return required, [EmailValidator()]


def number_field(
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    integer_only: bool = False,
    required: bool = False,
) -> Tuple[bool, List[FieldValidator]]:
    """Create number field config."""
    return required, [NumberValidator(min_value, max_value, integer_only)]


def enum_field(
    allowed_values: List[Any],
    required: bool = False,
) -> Tuple[bool, List[FieldValidator]]:
    """Create enum field config."""
    return required, [EnumValidator(allowed_values)]
