"""
Validation System - Sprint 713

Comprehensive data validation framework.

Features:
- Schema validation
- Type coercion
- Custom validators
- Nested validation
- Error aggregation
"""

import re
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Union, Pattern, Type, get_type_hints
)
from enum import Enum
from abc import ABC, abstractmethod
from datetime import datetime, date


T = TypeVar("T")


class ValidationSeverity(str, Enum):
    """Validation error severity."""
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


@dataclass
class ValidationError:
    """Single validation error."""
    field: str
    message: str
    code: str
    severity: ValidationSeverity = ValidationSeverity.ERROR
    value: Any = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "field": self.field,
            "message": self.message,
            "code": self.code,
            "severity": self.severity.value,
        }


@dataclass
class ValidationResult:
    """Validation result."""
    valid: bool
    errors: List[ValidationError] = field(default_factory=list)
    warnings: List[ValidationError] = field(default_factory=list)
    data: Optional[Any] = None

    def add_error(self, error: ValidationError) -> None:
        """Add validation error."""
        if error.severity == ValidationSeverity.ERROR:
            self.errors.append(error)
            self.valid = False
        elif error.severity == ValidationSeverity.WARNING:
            self.warnings.append(error)

    def merge(self, other: "ValidationResult", prefix: str = "") -> None:
        """Merge another result into this one."""
        for error in other.errors:
            self.errors.append(ValidationError(
                field=f"{prefix}.{error.field}" if prefix else error.field,
                message=error.message,
                code=error.code,
                severity=error.severity,
                value=error.value,
            ))
        for warning in other.warnings:
            self.warnings.append(ValidationError(
                field=f"{prefix}.{warning.field}" if prefix else warning.field,
                message=warning.message,
                code=warning.code,
                severity=warning.severity,
                value=warning.value,
            ))
        if not other.valid:
            self.valid = False

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "valid": self.valid,
            "errors": [e.to_dict() for e in self.errors],
            "warnings": [w.to_dict() for w in self.warnings],
        }


class Validator(ABC):
    """Base validator."""

    @abstractmethod
    def validate(self, value: Any, field: str) -> ValidationResult:
        """Validate a value."""
        pass


class StringValidator(Validator):
    """String validation."""

    def __init__(
        self,
        min_length: Optional[int] = None,
        max_length: Optional[int] = None,
        pattern: Optional[Union[str, Pattern]] = None,
        allowed_values: Optional[List[str]] = None,
        strip: bool = True,
        lowercase: bool = False,
        uppercase: bool = False,
    ):
        """Initialize string validator."""
        self.min_length = min_length
        self.max_length = max_length
        self.pattern = re.compile(pattern) if isinstance(pattern, str) else pattern
        self.allowed_values = allowed_values
        self.strip = strip
        self.lowercase = lowercase
        self.uppercase = uppercase

    def validate(self, value: Any, field: str) -> ValidationResult:
        """Validate string."""
        result = ValidationResult(valid=True)

        if value is None:
            result.data = None
            return result

        # Coerce to string
        try:
            s = str(value)
        except Exception:
            result.add_error(ValidationError(
                field=field,
                message="Cannot convert to string",
                code="string.invalid",
                value=value,
            ))
            return result

        # Transform
        if self.strip:
            s = s.strip()
        if self.lowercase:
            s = s.lower()
        if self.uppercase:
            s = s.upper()

        result.data = s

        # Min length
        if self.min_length is not None and len(s) < self.min_length:
            result.add_error(ValidationError(
                field=field,
                message=f"Must be at least {self.min_length} characters",
                code="string.min_length",
                value=s,
            ))

        # Max length
        if self.max_length is not None and len(s) > self.max_length:
            result.add_error(ValidationError(
                field=field,
                message=f"Must be at most {self.max_length} characters",
                code="string.max_length",
                value=s,
            ))

        # Pattern
        if self.pattern and not self.pattern.match(s):
            result.add_error(ValidationError(
                field=field,
                message="Does not match required pattern",
                code="string.pattern",
                value=s,
            ))

        # Allowed values
        if self.allowed_values and s not in self.allowed_values:
            result.add_error(ValidationError(
                field=field,
                message=f"Must be one of: {', '.join(self.allowed_values)}",
                code="string.allowed",
                value=s,
            ))

        return result


class NumberValidator(Validator):
    """Number validation."""

    def __init__(
        self,
        min_value: Optional[float] = None,
        max_value: Optional[float] = None,
        integer: bool = False,
        positive: bool = False,
        negative: bool = False,
        allow_nan: bool = False,
    ):
        """Initialize number validator."""
        self.min_value = min_value
        self.max_value = max_value
        self.integer = integer
        self.positive = positive
        self.negative = negative
        self.allow_nan = allow_nan

    def validate(self, value: Any, field: str) -> ValidationResult:
        """Validate number."""
        result = ValidationResult(valid=True)

        if value is None:
            result.data = None
            return result

        # Coerce to number
        try:
            if self.integer:
                n = int(value)
            else:
                n = float(value)
        except (ValueError, TypeError):
            result.add_error(ValidationError(
                field=field,
                message="Must be a valid number",
                code="number.invalid",
                value=value,
            ))
            return result

        result.data = n

        # NaN check
        if not self.allow_nan and n != n:  # NaN != NaN
            result.add_error(ValidationError(
                field=field,
                message="NaN is not allowed",
                code="number.nan",
                value=n,
            ))

        # Min value
        if self.min_value is not None and n < self.min_value:
            result.add_error(ValidationError(
                field=field,
                message=f"Must be at least {self.min_value}",
                code="number.min",
                value=n,
            ))

        # Max value
        if self.max_value is not None and n > self.max_value:
            result.add_error(ValidationError(
                field=field,
                message=f"Must be at most {self.max_value}",
                code="number.max",
                value=n,
            ))

        # Positive
        if self.positive and n <= 0:
            result.add_error(ValidationError(
                field=field,
                message="Must be positive",
                code="number.positive",
                value=n,
            ))

        # Negative
        if self.negative and n >= 0:
            result.add_error(ValidationError(
                field=field,
                message="Must be negative",
                code="number.negative",
                value=n,
            ))

        return result


class BoolValidator(Validator):
    """Boolean validation."""

    TRUE_VALUES = {"true", "1", "yes", "on"}
    FALSE_VALUES = {"false", "0", "no", "off"}

    def validate(self, value: Any, field: str) -> ValidationResult:
        """Validate boolean."""
        result = ValidationResult(valid=True)

        if value is None:
            result.data = None
            return result

        if isinstance(value, bool):
            result.data = value
            return result

        if isinstance(value, str):
            lower = value.lower()
            if lower in self.TRUE_VALUES:
                result.data = True
                return result
            if lower in self.FALSE_VALUES:
                result.data = False
                return result

        if isinstance(value, (int, float)):
            result.data = bool(value)
            return result

        result.add_error(ValidationError(
            field=field,
            message="Must be a boolean",
            code="bool.invalid",
            value=value,
        ))
        return result


class EmailValidator(Validator):
    """Email validation."""

    EMAIL_PATTERN = re.compile(
        r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    )

    def __init__(self, allowed_domains: Optional[List[str]] = None):
        """Initialize email validator."""
        self.allowed_domains = allowed_domains

    def validate(self, value: Any, field: str) -> ValidationResult:
        """Validate email."""
        result = ValidationResult(valid=True)

        if value is None:
            result.data = None
            return result

        s = str(value).strip().lower()
        result.data = s

        if not self.EMAIL_PATTERN.match(s):
            result.add_error(ValidationError(
                field=field,
                message="Invalid email format",
                code="email.invalid",
                value=s,
            ))
            return result

        if self.allowed_domains:
            domain = s.split("@")[1]
            if domain not in self.allowed_domains:
                result.add_error(ValidationError(
                    field=field,
                    message=f"Domain must be one of: {', '.join(self.allowed_domains)}",
                    code="email.domain",
                    value=s,
                ))

        return result


class UUIDValidator(Validator):
    """UUID validation."""

    def __init__(self, version: Optional[int] = None):
        """Initialize UUID validator."""
        self.version = version

    def validate(self, value: Any, field: str) -> ValidationResult:
        """Validate UUID."""
        result = ValidationResult(valid=True)

        if value is None:
            result.data = None
            return result

        try:
            if isinstance(value, uuid.UUID):
                u = value
            else:
                u = uuid.UUID(str(value))
            result.data = u
        except (ValueError, TypeError):
            result.add_error(ValidationError(
                field=field,
                message="Invalid UUID format",
                code="uuid.invalid",
                value=value,
            ))
            return result

        if self.version and u.version != self.version:
            result.add_error(ValidationError(
                field=field,
                message=f"Must be UUID version {self.version}",
                code="uuid.version",
                value=str(u),
            ))

        return result


class DateTimeValidator(Validator):
    """DateTime validation."""

    def __init__(
        self,
        min_date: Optional[datetime] = None,
        max_date: Optional[datetime] = None,
        formats: Optional[List[str]] = None,
    ):
        """Initialize datetime validator."""
        self.min_date = min_date
        self.max_date = max_date
        self.formats = formats or [
            "%Y-%m-%d",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S.%fZ",
        ]

    def validate(self, value: Any, field: str) -> ValidationResult:
        """Validate datetime."""
        result = ValidationResult(valid=True)

        if value is None:
            result.data = None
            return result

        if isinstance(value, datetime):
            dt = value
        elif isinstance(value, date):
            dt = datetime.combine(value, datetime.min.time())
        elif isinstance(value, str):
            dt = None
            for fmt in self.formats:
                try:
                    dt = datetime.strptime(value, fmt)
                    break
                except ValueError:
                    continue

            if dt is None:
                result.add_error(ValidationError(
                    field=field,
                    message="Invalid datetime format",
                    code="datetime.invalid",
                    value=value,
                ))
                return result
        else:
            result.add_error(ValidationError(
                field=field,
                message="Must be a datetime",
                code="datetime.type",
                value=value,
            ))
            return result

        result.data = dt

        if self.min_date and dt < self.min_date:
            result.add_error(ValidationError(
                field=field,
                message=f"Must be after {self.min_date.isoformat()}",
                code="datetime.min",
                value=dt.isoformat(),
            ))

        if self.max_date and dt > self.max_date:
            result.add_error(ValidationError(
                field=field,
                message=f"Must be before {self.max_date.isoformat()}",
                code="datetime.max",
                value=dt.isoformat(),
            ))

        return result


class ListValidator(Validator):
    """List validation."""

    def __init__(
        self,
        item_validator: Optional[Validator] = None,
        min_length: Optional[int] = None,
        max_length: Optional[int] = None,
        unique: bool = False,
    ):
        """Initialize list validator."""
        self.item_validator = item_validator
        self.min_length = min_length
        self.max_length = max_length
        self.unique = unique

    def validate(self, value: Any, field: str) -> ValidationResult:
        """Validate list."""
        result = ValidationResult(valid=True)

        if value is None:
            result.data = None
            return result

        if not isinstance(value, (list, tuple)):
            result.add_error(ValidationError(
                field=field,
                message="Must be a list",
                code="list.type",
                value=value,
            ))
            return result

        items = list(value)
        validated_items = []

        # Min length
        if self.min_length is not None and len(items) < self.min_length:
            result.add_error(ValidationError(
                field=field,
                message=f"Must have at least {self.min_length} items",
                code="list.min_length",
                value=items,
            ))

        # Max length
        if self.max_length is not None and len(items) > self.max_length:
            result.add_error(ValidationError(
                field=field,
                message=f"Must have at most {self.max_length} items",
                code="list.max_length",
                value=items,
            ))

        # Validate items
        if self.item_validator:
            for i, item in enumerate(items):
                item_result = self.item_validator.validate(item, f"{field}[{i}]")
                if not item_result.valid:
                    result.merge(item_result)
                validated_items.append(item_result.data)
        else:
            validated_items = items

        # Unique check
        if self.unique:
            seen = set()
            for i, item in enumerate(validated_items):
                key = str(item)
                if key in seen:
                    result.add_error(ValidationError(
                        field=f"{field}[{i}]",
                        message="Duplicate value",
                        code="list.unique",
                        value=item,
                    ))
                seen.add(key)

        result.data = validated_items
        return result


class DictValidator(Validator):
    """Dictionary validation with schema."""

    def __init__(
        self,
        schema: Dict[str, Validator],
        allow_extra: bool = False,
        required: Optional[List[str]] = None,
    ):
        """Initialize dict validator."""
        self.schema = schema
        self.allow_extra = allow_extra
        self.required = required or []

    def validate(self, value: Any, field: str) -> ValidationResult:
        """Validate dictionary."""
        result = ValidationResult(valid=True)

        if value is None:
            result.data = None
            return result

        if not isinstance(value, dict):
            result.add_error(ValidationError(
                field=field,
                message="Must be an object",
                code="dict.type",
                value=value,
            ))
            return result

        validated = {}

        # Check required fields
        for req_field in self.required:
            if req_field not in value:
                result.add_error(ValidationError(
                    field=f"{field}.{req_field}" if field else req_field,
                    message="Field is required",
                    code="dict.required",
                ))

        # Validate known fields
        for key, validator in self.schema.items():
            if key in value:
                field_name = f"{field}.{key}" if field else key
                field_result = validator.validate(value[key], field_name)
                if not field_result.valid:
                    result.merge(field_result)
                validated[key] = field_result.data

        # Check extra fields
        if not self.allow_extra:
            extra_keys = set(value.keys()) - set(self.schema.keys())
            for key in extra_keys:
                result.add_error(ValidationError(
                    field=f"{field}.{key}" if field else key,
                    message="Unknown field",
                    code="dict.extra",
                    severity=ValidationSeverity.WARNING,
                ))

        result.data = validated
        return result


class CustomValidator(Validator):
    """Custom validation function."""

    def __init__(
        self,
        validator: Callable[[Any], Union[bool, str, None]],
        message: str = "Validation failed",
        code: str = "custom",
    ):
        """Initialize custom validator."""
        self.validator = validator
        self.message = message
        self.code = code

    def validate(self, value: Any, field: str) -> ValidationResult:
        """Validate with custom function."""
        result = ValidationResult(valid=True, data=value)

        if value is None:
            return result

        check = self.validator(value)

        if check is False:
            result.add_error(ValidationError(
                field=field,
                message=self.message,
                code=self.code,
                value=value,
            ))
        elif isinstance(check, str):
            result.add_error(ValidationError(
                field=field,
                message=check,
                code=self.code,
                value=value,
            ))

        return result


class Schema:
    """Schema builder for validation.

    Usage:
        schema = Schema({
            "name": String(min_length=1, max_length=100),
            "email": Email(),
            "age": Number(min_value=0, integer=True),
            "tags": List(String(), max_length=10),
        }).required("name", "email")

        result = schema.validate(data)
        if result.valid:
            print(result.data)
        else:
            print(result.errors)
    """

    def __init__(self, fields: Dict[str, Validator]):
        """Initialize schema."""
        self._fields = fields
        self._required: List[str] = []
        self._allow_extra = False

    def required(self, *fields: str) -> "Schema":
        """Mark fields as required."""
        self._required.extend(fields)
        return self

    def allow_extra(self, allow: bool = True) -> "Schema":
        """Allow extra fields."""
        self._allow_extra = allow
        return self

    def validate(self, data: Any) -> ValidationResult:
        """Validate data against schema."""
        validator = DictValidator(
            schema=self._fields,
            required=self._required,
            allow_extra=self._allow_extra,
        )
        return validator.validate(data, "")


# Convenience aliases
String = StringValidator
Number = NumberValidator
Bool = BoolValidator
Email = EmailValidator
UUID = UUIDValidator
DateTime = DateTimeValidator
List = ListValidator
Dict = DictValidator
Custom = CustomValidator


def validate(data: Any, schema: dict) -> ValidationResult:
    """Validate data against schema."""
    return Schema(schema).validate(data)
