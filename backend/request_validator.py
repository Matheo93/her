"""
Request Validator - Sprint 653

Input validation and sanitization system.

Features:
- Schema validation
- Type coercion
- Custom validators
- Error formatting
- Sanitization
"""

import re
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Callable, TypeVar, Generic, Union
from enum import Enum


T = TypeVar("T")


class ValidationErrorType(str, Enum):
    """Types of validation errors."""
    REQUIRED = "required"
    TYPE = "type"
    MIN_LENGTH = "min_length"
    MAX_LENGTH = "max_length"
    MIN_VALUE = "min_value"
    MAX_VALUE = "max_value"
    PATTERN = "pattern"
    ENUM = "enum"
    CUSTOM = "custom"


@dataclass
class ValidationError:
    """Single validation error."""
    field: str
    message: str
    error_type: ValidationErrorType
    value: Any = None

    def to_dict(self) -> dict:
        return {
            "field": self.field,
            "message": self.message,
            "type": self.error_type.value,
        }


@dataclass
class ValidationResult:
    """Result of validation."""
    valid: bool
    errors: List[ValidationError] = field(default_factory=list)
    data: Optional[Dict[str, Any]] = None

    def to_dict(self) -> dict:
        return {
            "valid": self.valid,
            "errors": [e.to_dict() for e in self.errors],
            "error_count": len(self.errors),
        }


class FieldValidator:
    """Validator for a single field."""

    def __init__(
        self,
        field_type: type = str,
        required: bool = True,
        default: Any = None,
        min_length: Optional[int] = None,
        max_length: Optional[int] = None,
        min_value: Optional[Union[int, float]] = None,
        max_value: Optional[Union[int, float]] = None,
        pattern: Optional[str] = None,
        enum: Optional[List[Any]] = None,
        custom: Optional[Callable[[Any], bool]] = None,
        custom_message: str = "Invalid value",
        transform: Optional[Callable[[Any], Any]] = None,
        sanitize: bool = False,
    ):
        """Initialize field validator.

        Args:
            field_type: Expected type
            required: Is field required
            default: Default value if missing
            min_length: Minimum string/list length
            max_length: Maximum string/list length
            min_value: Minimum numeric value
            max_value: Maximum numeric value
            pattern: Regex pattern for strings
            enum: List of allowed values
            custom: Custom validation function
            custom_message: Error message for custom validator
            transform: Transform function after validation
            sanitize: Whether to sanitize string input
        """
        self.field_type = field_type
        self.required = required
        self.default = default
        self.min_length = min_length
        self.max_length = max_length
        self.min_value = min_value
        self.max_value = max_value
        self.pattern = re.compile(pattern) if pattern else None
        self.enum = enum
        self.custom = custom
        self.custom_message = custom_message
        self.transform = transform
        self.sanitize = sanitize

    def validate(self, value: Any, field_name: str) -> tuple[Any, List[ValidationError]]:
        """Validate a field value.

        Args:
            value: Value to validate
            field_name: Field name for errors

        Returns:
            (validated_value, errors)
        """
        errors = []

        # Handle missing values
        if value is None or value == "":
            if self.required:
                errors.append(ValidationError(
                    field=field_name,
                    message=f"{field_name} is required",
                    error_type=ValidationErrorType.REQUIRED,
                ))
                return self.default, errors
            return self.default, errors

        # Type coercion
        try:
            if self.field_type == bool:
                if isinstance(value, str):
                    value = value.lower() in ("true", "1", "yes")
                else:
                    value = bool(value)
            elif self.field_type == int:
                value = int(value)
            elif self.field_type == float:
                value = float(value)
            elif self.field_type == str:
                value = str(value)
            elif self.field_type == list and not isinstance(value, list):
                value = [value]
        except (ValueError, TypeError):
            errors.append(ValidationError(
                field=field_name,
                message=f"{field_name} must be of type {self.field_type.__name__}",
                error_type=ValidationErrorType.TYPE,
                value=value,
            ))
            return self.default, errors

        # Sanitize strings
        if self.sanitize and isinstance(value, str):
            value = self._sanitize_string(value)

        # Length validation
        if self.min_length is not None and hasattr(value, "__len__"):
            if len(value) < self.min_length:
                errors.append(ValidationError(
                    field=field_name,
                    message=f"{field_name} must be at least {self.min_length} characters",
                    error_type=ValidationErrorType.MIN_LENGTH,
                    value=value,
                ))

        if self.max_length is not None and hasattr(value, "__len__"):
            if len(value) > self.max_length:
                errors.append(ValidationError(
                    field=field_name,
                    message=f"{field_name} must be at most {self.max_length} characters",
                    error_type=ValidationErrorType.MAX_LENGTH,
                    value=value,
                ))

        # Numeric validation
        if self.min_value is not None and isinstance(value, (int, float)):
            if value < self.min_value:
                errors.append(ValidationError(
                    field=field_name,
                    message=f"{field_name} must be at least {self.min_value}",
                    error_type=ValidationErrorType.MIN_VALUE,
                    value=value,
                ))

        if self.max_value is not None and isinstance(value, (int, float)):
            if value > self.max_value:
                errors.append(ValidationError(
                    field=field_name,
                    message=f"{field_name} must be at most {self.max_value}",
                    error_type=ValidationErrorType.MAX_VALUE,
                    value=value,
                ))

        # Pattern validation
        if self.pattern and isinstance(value, str):
            if not self.pattern.match(value):
                errors.append(ValidationError(
                    field=field_name,
                    message=f"{field_name} has invalid format",
                    error_type=ValidationErrorType.PATTERN,
                    value=value,
                ))

        # Enum validation
        if self.enum is not None:
            if value not in self.enum:
                errors.append(ValidationError(
                    field=field_name,
                    message=f"{field_name} must be one of: {', '.join(str(e) for e in self.enum)}",
                    error_type=ValidationErrorType.ENUM,
                    value=value,
                ))

        # Custom validation
        if self.custom is not None:
            try:
                if not self.custom(value):
                    errors.append(ValidationError(
                        field=field_name,
                        message=self.custom_message,
                        error_type=ValidationErrorType.CUSTOM,
                        value=value,
                    ))
            except Exception:
                errors.append(ValidationError(
                    field=field_name,
                    message=self.custom_message,
                    error_type=ValidationErrorType.CUSTOM,
                    value=value,
                ))

        # Transform if no errors
        if not errors and self.transform:
            try:
                value = self.transform(value)
            except Exception:
                pass

        return value, errors

    def _sanitize_string(self, value: str) -> str:
        """Sanitize string input."""
        # Remove null bytes
        value = value.replace("\x00", "")
        # Remove control characters except newlines/tabs
        value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)
        # Trim whitespace
        value = value.strip()
        return value


class RequestValidator:
    """Request validation system.

    Usage:
        validator = RequestValidator()

        # Define schema
        validator.add_field("email", str, required=True, pattern=r"^[^@]+@[^@]+\.[^@]+$")
        validator.add_field("age", int, min_value=0, max_value=150)
        validator.add_field("role", str, enum=["user", "admin"])

        # Validate
        result = validator.validate({"email": "test@example.com", "age": 25})
        if result.valid:
            print(result.data)
        else:
            print(result.errors)
    """

    def __init__(self):
        """Initialize request validator."""
        self._fields: Dict[str, FieldValidator] = {}

    def add_field(
        self,
        name: str,
        field_type: type = str,
        **kwargs,
    ) -> "RequestValidator":
        """Add a field to validate.

        Args:
            name: Field name
            field_type: Expected type
            **kwargs: Additional FieldValidator arguments

        Returns:
            Self for chaining
        """
        self._fields[name] = FieldValidator(field_type=field_type, **kwargs)
        return self

    def string(self, name: str, **kwargs) -> "RequestValidator":
        """Add string field."""
        return self.add_field(name, str, **kwargs)

    def integer(self, name: str, **kwargs) -> "RequestValidator":
        """Add integer field."""
        return self.add_field(name, int, **kwargs)

    def number(self, name: str, **kwargs) -> "RequestValidator":
        """Add float field."""
        return self.add_field(name, float, **kwargs)

    def boolean(self, name: str, **kwargs) -> "RequestValidator":
        """Add boolean field."""
        return self.add_field(name, bool, **kwargs)

    def array(self, name: str, **kwargs) -> "RequestValidator":
        """Add list field."""
        return self.add_field(name, list, **kwargs)

    def email(self, name: str, **kwargs) -> "RequestValidator":
        """Add email field."""
        return self.add_field(
            name,
            str,
            pattern=r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$",
            **kwargs,
        )

    def url(self, name: str, **kwargs) -> "RequestValidator":
        """Add URL field."""
        return self.add_field(
            name,
            str,
            pattern=r"^https?://[^\s/$.?#].[^\s]*$",
            **kwargs,
        )

    def uuid(self, name: str, **kwargs) -> "RequestValidator":
        """Add UUID field."""
        return self.add_field(
            name,
            str,
            pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            **kwargs,
        )

    def validate(
        self,
        data: Dict[str, Any],
        strict: bool = False,
    ) -> ValidationResult:
        """Validate request data.

        Args:
            data: Data to validate
            strict: Reject unknown fields

        Returns:
            Validation result
        """
        errors: List[ValidationError] = []
        validated_data: Dict[str, Any] = {}

        # Validate defined fields
        for name, validator in self._fields.items():
            value = data.get(name)
            validated_value, field_errors = validator.validate(value, name)
            errors.extend(field_errors)
            if validated_value is not None or not validator.required:
                validated_data[name] = validated_value

        # Check for unknown fields in strict mode
        if strict:
            for key in data.keys():
                if key not in self._fields:
                    errors.append(ValidationError(
                        field=key,
                        message=f"Unknown field: {key}",
                        error_type=ValidationErrorType.CUSTOM,
                    ))

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            data=validated_data if len(errors) == 0 else None,
        )

    def clone(self) -> "RequestValidator":
        """Clone this validator."""
        new_validator = RequestValidator()
        new_validator._fields = self._fields.copy()
        return new_validator


# Pre-built validators
def create_chat_validator() -> RequestValidator:
    """Create validator for chat requests."""
    return (
        RequestValidator()
        .string("message", required=True, min_length=1, max_length=10000, sanitize=True)
        .string("session_id", required=False, max_length=100)
        .string("voice", required=False, enum=["eva", "aria", "roger", "sarah", "eric"])
    )


def create_tts_validator() -> RequestValidator:
    """Create validator for TTS requests."""
    return (
        RequestValidator()
        .string("text", required=True, min_length=1, max_length=5000)
        .string("voice", required=False, default="eva")
        .number("speed", required=False, min_value=0.5, max_value=2.0, default=1.0)
    )


# Singleton instances
chat_validator = create_chat_validator()
tts_validator = create_tts_validator()
