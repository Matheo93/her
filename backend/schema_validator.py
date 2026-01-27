"""
Schema Validator - Sprint 791

JSON Schema validation and data validation utilities.

Features:
- JSON Schema validation
- Custom validators
- Schema builder
- Error formatting
- Coercion support
- Nested validation
"""

import re
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union,
    Type, Pattern, Set
)
from enum import Enum
from abc import ABC, abstractmethod
import logging
from datetime import datetime, date
from decimal import Decimal
import json

logger = logging.getLogger(__name__)


T = TypeVar("T")


class ValidationErrorCode(str, Enum):
    """Validation error codes."""
    REQUIRED = "required"
    TYPE_ERROR = "type_error"
    MIN_LENGTH = "min_length"
    MAX_LENGTH = "max_length"
    MIN_VALUE = "min_value"
    MAX_VALUE = "max_value"
    PATTERN = "pattern"
    ENUM = "enum"
    FORMAT = "format"
    CUSTOM = "custom"
    UNKNOWN_FIELD = "unknown_field"
    INVALID_ITEM = "invalid_item"


@dataclass
class ValidationError:
    """Single validation error."""
    path: str
    code: ValidationErrorCode
    message: str
    value: Any = None
    constraint: Any = None

    def to_dict(self) -> dict:
        result = {
            "path": self.path,
            "code": self.code.value,
            "message": self.message,
        }
        if self.value is not None:
            result["value"] = str(self.value)[:100]
        if self.constraint is not None:
            result["constraint"] = self.constraint
        return result


@dataclass
class ValidationResult:
    """Validation result with errors."""
    valid: bool
    errors: List[ValidationError] = field(default_factory=list)
    coerced_data: Any = None

    def to_dict(self) -> dict:
        return {
            "valid": self.valid,
            "errors": [e.to_dict() for e in self.errors],
        }

    def add_error(
        self,
        path: str,
        code: ValidationErrorCode,
        message: str,
        value: Any = None,
        constraint: Any = None,
    ) -> None:
        self.valid = False
        self.errors.append(ValidationError(
            path=path,
            code=code,
            message=message,
            value=value,
            constraint=constraint,
        ))

    @property
    def error_messages(self) -> List[str]:
        return [e.message for e in self.errors]

    @property
    def errors_by_path(self) -> Dict[str, List[ValidationError]]:
        result: Dict[str, List[ValidationError]] = {}
        for error in self.errors:
            if error.path not in result:
                result[error.path] = []
            result[error.path].append(error)
        return result


class Validator(ABC):
    """Abstract validator."""

    @abstractmethod
    def validate(self, value: Any, path: str = "") -> ValidationResult:
        """Validate a value."""
        pass

    def __and__(self, other: "Validator") -> "CompositeValidator":
        """Combine validators with AND."""
        return CompositeValidator([self, other], mode="and")

    def __or__(self, other: "Validator") -> "CompositeValidator":
        """Combine validators with OR."""
        return CompositeValidator([self, other], mode="or")


class CompositeValidator(Validator):
    """Combine multiple validators."""

    def __init__(self, validators: List[Validator], mode: str = "and"):
        self.validators = validators
        self.mode = mode  # "and" or "or"

    def validate(self, value: Any, path: str = "") -> ValidationResult:
        if self.mode == "and":
            result = ValidationResult(valid=True)
            for validator in self.validators:
                sub_result = validator.validate(value, path)
                if not sub_result.valid:
                    result.valid = False
                    result.errors.extend(sub_result.errors)
            return result
        else:  # or
            all_errors: List[ValidationError] = []
            for validator in self.validators:
                sub_result = validator.validate(value, path)
                if sub_result.valid:
                    return ValidationResult(valid=True)
                all_errors.extend(sub_result.errors)
            result = ValidationResult(valid=False)
            result.errors = all_errors
            return result


class StringValidator(Validator):
    """String validation."""

    def __init__(
        self,
        min_length: Optional[int] = None,
        max_length: Optional[int] = None,
        pattern: Optional[Union[str, Pattern]] = None,
        enum: Optional[List[str]] = None,
        format: Optional[str] = None,
        strip: bool = False,
        lowercase: bool = False,
        uppercase: bool = False,
    ):
        self.min_length = min_length
        self.max_length = max_length
        self.pattern = re.compile(pattern) if isinstance(pattern, str) else pattern
        self.enum = set(enum) if enum else None
        self.format = format
        self.strip = strip
        self.lowercase = lowercase
        self.uppercase = uppercase

        # Common format patterns
        self._formats: Dict[str, Pattern] = {
            "email": re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"),
            "url": re.compile(r"^https?://[^\s/$.?#].[^\s]*$"),
            "uuid": re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I),
            "date": re.compile(r"^\d{4}-\d{2}-\d{2}$"),
            "datetime": re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}"),
            "phone": re.compile(r"^\+?[\d\s\-\(\)]{7,}$"),
            "slug": re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$"),
            "alphanumeric": re.compile(r"^[a-zA-Z0-9]+$"),
        }

    def validate(self, value: Any, path: str = "") -> ValidationResult:
        result = ValidationResult(valid=True)

        if not isinstance(value, str):
            result.add_error(
                path, ValidationErrorCode.TYPE_ERROR,
                "Expected string, got " + type(value).__name__,
                value=value,
            )
            return result

        # Apply transformations
        coerced = value
        if self.strip:
            coerced = coerced.strip()
        if self.lowercase:
            coerced = coerced.lower()
        if self.uppercase:
            coerced = coerced.upper()

        result.coerced_data = coerced

        # Length checks
        if self.min_length is not None and len(coerced) < self.min_length:
            result.add_error(
                path, ValidationErrorCode.MIN_LENGTH,
                "String must be at least " + str(self.min_length) + " characters",
                value=coerced, constraint=self.min_length,
            )

        if self.max_length is not None and len(coerced) > self.max_length:
            result.add_error(
                path, ValidationErrorCode.MAX_LENGTH,
                "String must be at most " + str(self.max_length) + " characters",
                value=coerced, constraint=self.max_length,
            )

        # Pattern check
        if self.pattern and not self.pattern.match(coerced):
            result.add_error(
                path, ValidationErrorCode.PATTERN,
                "String does not match pattern",
                value=coerced, constraint=self.pattern.pattern,
            )

        # Enum check
        if self.enum and coerced not in self.enum:
            result.add_error(
                path, ValidationErrorCode.ENUM,
                "Value must be one of: " + ", ".join(sorted(self.enum)),
                value=coerced, constraint=list(self.enum),
            )

        # Format check
        if self.format:
            format_pattern = self._formats.get(self.format)
            if format_pattern and not format_pattern.match(coerced):
                result.add_error(
                    path, ValidationErrorCode.FORMAT,
                    "Invalid " + self.format + " format",
                    value=coerced, constraint=self.format,
                )

        return result


class NumberValidator(Validator):
    """Number validation (int or float)."""

    def __init__(
        self,
        min_value: Optional[Union[int, float]] = None,
        max_value: Optional[Union[int, float]] = None,
        exclusive_min: bool = False,
        exclusive_max: bool = False,
        multiple_of: Optional[Union[int, float]] = None,
        integer: bool = False,
        allow_string: bool = False,
    ):
        self.min_value = min_value
        self.max_value = max_value
        self.exclusive_min = exclusive_min
        self.exclusive_max = exclusive_max
        self.multiple_of = multiple_of
        self.integer = integer
        self.allow_string = allow_string

    def validate(self, value: Any, path: str = "") -> ValidationResult:
        result = ValidationResult(valid=True)

        # Coerce string to number if allowed
        coerced = value
        if self.allow_string and isinstance(value, str):
            try:
                coerced = int(value) if self.integer else float(value)
            except ValueError:
                result.add_error(
                    path, ValidationErrorCode.TYPE_ERROR,
                    "Cannot convert string to number",
                    value=value,
                )
                return result

        # Type check
        if self.integer:
            if not isinstance(coerced, int) or isinstance(coerced, bool):
                result.add_error(
                    path, ValidationErrorCode.TYPE_ERROR,
                    "Expected integer, got " + type(coerced).__name__,
                    value=coerced,
                )
                return result
        else:
            if not isinstance(coerced, (int, float)) or isinstance(coerced, bool):
                result.add_error(
                    path, ValidationErrorCode.TYPE_ERROR,
                    "Expected number, got " + type(coerced).__name__,
                    value=coerced,
                )
                return result

        result.coerced_data = coerced

        # Range checks
        if self.min_value is not None:
            if self.exclusive_min:
                if coerced <= self.min_value:
                    result.add_error(
                        path, ValidationErrorCode.MIN_VALUE,
                        "Value must be greater than " + str(self.min_value),
                        value=coerced, constraint=self.min_value,
                    )
            else:
                if coerced < self.min_value:
                    result.add_error(
                        path, ValidationErrorCode.MIN_VALUE,
                        "Value must be at least " + str(self.min_value),
                        value=coerced, constraint=self.min_value,
                    )

        if self.max_value is not None:
            if self.exclusive_max:
                if coerced >= self.max_value:
                    result.add_error(
                        path, ValidationErrorCode.MAX_VALUE,
                        "Value must be less than " + str(self.max_value),
                        value=coerced, constraint=self.max_value,
                    )
            else:
                if coerced > self.max_value:
                    result.add_error(
                        path, ValidationErrorCode.MAX_VALUE,
                        "Value must be at most " + str(self.max_value),
                        value=coerced, constraint=self.max_value,
                    )

        # Multiple check
        if self.multiple_of is not None:
            if coerced % self.multiple_of != 0:
                result.add_error(
                    path, ValidationErrorCode.CUSTOM,
                    "Value must be a multiple of " + str(self.multiple_of),
                    value=coerced, constraint=self.multiple_of,
                )

        return result


class BooleanValidator(Validator):
    """Boolean validation."""

    def __init__(self, allow_string: bool = False):
        self.allow_string = allow_string
        self._truthy = {"true", "1", "yes", "on"}
        self._falsy = {"false", "0", "no", "off"}

    def validate(self, value: Any, path: str = "") -> ValidationResult:
        result = ValidationResult(valid=True)

        coerced = value
        if self.allow_string and isinstance(value, str):
            lower = value.lower()
            if lower in self._truthy:
                coerced = True
            elif lower in self._falsy:
                coerced = False
            else:
                result.add_error(
                    path, ValidationErrorCode.TYPE_ERROR,
                    "Cannot convert string to boolean",
                    value=value,
                )
                return result

        if not isinstance(coerced, bool):
            result.add_error(
                path, ValidationErrorCode.TYPE_ERROR,
                "Expected boolean, got " + type(coerced).__name__,
                value=coerced,
            )
            return result

        result.coerced_data = coerced
        return result


class ArrayValidator(Validator):
    """Array/list validation."""

    def __init__(
        self,
        items: Optional[Validator] = None,
        min_items: Optional[int] = None,
        max_items: Optional[int] = None,
        unique: bool = False,
    ):
        self.items = items
        self.min_items = min_items
        self.max_items = max_items
        self.unique = unique

    def validate(self, value: Any, path: str = "") -> ValidationResult:
        result = ValidationResult(valid=True)

        if not isinstance(value, (list, tuple)):
            result.add_error(
                path, ValidationErrorCode.TYPE_ERROR,
                "Expected array, got " + type(value).__name__,
                value=value,
            )
            return result

        # Length checks
        if self.min_items is not None and len(value) < self.min_items:
            result.add_error(
                path, ValidationErrorCode.MIN_LENGTH,
                "Array must have at least " + str(self.min_items) + " items",
                constraint=self.min_items,
            )

        if self.max_items is not None and len(value) > self.max_items:
            result.add_error(
                path, ValidationErrorCode.MAX_LENGTH,
                "Array must have at most " + str(self.max_items) + " items",
                constraint=self.max_items,
            )

        # Uniqueness check
        if self.unique:
            try:
                seen: Set[Any] = set()
                for i, item in enumerate(value):
                    hashable = json.dumps(item, sort_keys=True) if isinstance(item, (dict, list)) else item
                    if hashable in seen:
                        result.add_error(
                            path + "[" + str(i) + "]",
                            ValidationErrorCode.CUSTOM,
                            "Duplicate value in array",
                            value=item,
                        )
                    seen.add(hashable)
            except (TypeError, ValueError):
                pass  # Skip uniqueness check if items not hashable

        # Validate items
        coerced_items = []
        if self.items:
            for i, item in enumerate(value):
                item_path = path + "[" + str(i) + "]" if path else "[" + str(i) + "]"
                item_result = self.items.validate(item, item_path)
                if not item_result.valid:
                    result.valid = False
                    result.errors.extend(item_result.errors)
                coerced_items.append(
                    item_result.coerced_data if item_result.coerced_data is not None else item
                )

        result.coerced_data = coerced_items if self.items else list(value)
        return result


class ObjectValidator(Validator):
    """Object/dict validation."""

    def __init__(
        self,
        properties: Optional[Dict[str, Validator]] = None,
        required: Optional[List[str]] = None,
        additional_properties: Union[bool, Validator] = True,
        min_properties: Optional[int] = None,
        max_properties: Optional[int] = None,
    ):
        self.properties = properties or {}
        self.required = set(required) if required else set()
        self.additional_properties = additional_properties
        self.min_properties = min_properties
        self.max_properties = max_properties

    def validate(self, value: Any, path: str = "") -> ValidationResult:
        result = ValidationResult(valid=True)

        if not isinstance(value, dict):
            result.add_error(
                path, ValidationErrorCode.TYPE_ERROR,
                "Expected object, got " + type(value).__name__,
                value=value,
            )
            return result

        # Check required fields
        for field in self.required:
            if field not in value:
                field_path = path + "." + field if path else field
                result.add_error(
                    field_path, ValidationErrorCode.REQUIRED,
                    "Field '" + field + "' is required",
                )

        # Property count checks
        if self.min_properties is not None and len(value) < self.min_properties:
            result.add_error(
                path, ValidationErrorCode.MIN_LENGTH,
                "Object must have at least " + str(self.min_properties) + " properties",
                constraint=self.min_properties,
            )

        if self.max_properties is not None and len(value) > self.max_properties:
            result.add_error(
                path, ValidationErrorCode.MAX_LENGTH,
                "Object must have at most " + str(self.max_properties) + " properties",
                constraint=self.max_properties,
            )

        # Validate properties
        coerced_data = {}
        for key, val in value.items():
            field_path = path + "." + key if path else key

            if key in self.properties:
                field_result = self.properties[key].validate(val, field_path)
                if not field_result.valid:
                    result.valid = False
                    result.errors.extend(field_result.errors)
                coerced_data[key] = (
                    field_result.coerced_data if field_result.coerced_data is not None else val
                )
            elif self.additional_properties is False:
                result.add_error(
                    field_path, ValidationErrorCode.UNKNOWN_FIELD,
                    "Unknown field '" + key + "'",
                )
            elif isinstance(self.additional_properties, Validator):
                field_result = self.additional_properties.validate(val, field_path)
                if not field_result.valid:
                    result.valid = False
                    result.errors.extend(field_result.errors)
                coerced_data[key] = (
                    field_result.coerced_data if field_result.coerced_data is not None else val
                )
            else:
                coerced_data[key] = val

        result.coerced_data = coerced_data
        return result


class NullableValidator(Validator):
    """Allow null/None values."""

    def __init__(self, validator: Validator):
        self.validator = validator

    def validate(self, value: Any, path: str = "") -> ValidationResult:
        if value is None:
            return ValidationResult(valid=True, coerced_data=None)
        return self.validator.validate(value, path)


class AnyOfValidator(Validator):
    """Match any of the validators."""

    def __init__(self, validators: List[Validator]):
        self.validators = validators

    def validate(self, value: Any, path: str = "") -> ValidationResult:
        all_errors: List[ValidationError] = []
        for validator in self.validators:
            sub_result = validator.validate(value, path)
            if sub_result.valid:
                return sub_result
            all_errors.extend(sub_result.errors)

        result = ValidationResult(valid=False)
        result.add_error(
            path, ValidationErrorCode.TYPE_ERROR,
            "Value does not match any of the expected types",
            value=value,
        )
        return result


class CustomValidator(Validator):
    """Custom validation function."""

    def __init__(
        self,
        func: Callable[[Any], Union[bool, str, None]],
        error_message: str = "Custom validation failed",
    ):
        self.func = func
        self.error_message = error_message

    def validate(self, value: Any, path: str = "") -> ValidationResult:
        result = ValidationResult(valid=True, coerced_data=value)

        try:
            validation_result = self.func(value)

            if validation_result is False:
                result.add_error(
                    path, ValidationErrorCode.CUSTOM,
                    self.error_message,
                    value=value,
                )
            elif isinstance(validation_result, str):
                result.add_error(
                    path, ValidationErrorCode.CUSTOM,
                    validation_result,
                    value=value,
                )
        except Exception as e:
            result.add_error(
                path, ValidationErrorCode.CUSTOM,
                "Validation error: " + str(e),
                value=value,
            )

        return result


# Schema builder helpers
def string(
    min_length: Optional[int] = None,
    max_length: Optional[int] = None,
    pattern: Optional[str] = None,
    enum: Optional[List[str]] = None,
    format: Optional[str] = None,
) -> StringValidator:
    """Create string validator."""
    return StringValidator(
        min_length=min_length,
        max_length=max_length,
        pattern=pattern,
        enum=enum,
        format=format,
    )


def number(
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
    integer: bool = False,
) -> NumberValidator:
    """Create number validator."""
    return NumberValidator(
        min_value=min_value,
        max_value=max_value,
        integer=integer,
    )


def integer(
    min_value: Optional[int] = None,
    max_value: Optional[int] = None,
) -> NumberValidator:
    """Create integer validator."""
    return NumberValidator(
        min_value=min_value,
        max_value=max_value,
        integer=True,
    )


def boolean() -> BooleanValidator:
    """Create boolean validator."""
    return BooleanValidator()


def array(
    items: Optional[Validator] = None,
    min_items: Optional[int] = None,
    max_items: Optional[int] = None,
    unique: bool = False,
) -> ArrayValidator:
    """Create array validator."""
    return ArrayValidator(
        items=items,
        min_items=min_items,
        max_items=max_items,
        unique=unique,
    )


def object_(
    properties: Optional[Dict[str, Validator]] = None,
    required: Optional[List[str]] = None,
    additional_properties: Union[bool, Validator] = True,
) -> ObjectValidator:
    """Create object validator."""
    return ObjectValidator(
        properties=properties,
        required=required,
        additional_properties=additional_properties,
    )


def nullable(validator: Validator) -> NullableValidator:
    """Make validator nullable."""
    return NullableValidator(validator)


def any_of(*validators: Validator) -> AnyOfValidator:
    """Match any of the validators."""
    return AnyOfValidator(list(validators))


def custom(
    func: Callable[[Any], Union[bool, str, None]],
    error_message: str = "Custom validation failed",
) -> CustomValidator:
    """Create custom validator."""
    return CustomValidator(func, error_message)


# Common validators
email = string(format="email")
url = string(format="url")
uuid = string(format="uuid")
slug = string(format="slug")
date_string = string(format="date")
datetime_string = string(format="datetime")
phone = string(format="phone")

positive_integer = integer(min_value=1)
non_negative_integer = integer(min_value=0)
percentage = number(min_value=0, max_value=100)


class SchemaValidator:
    """High-level schema validator.

    Usage:
        schema = SchemaValidator({
            "name": string(min_length=1, max_length=100),
            "email": email,
            "age": integer(min_value=0, max_value=150),
            "tags": array(items=string(), max_items=10),
        }, required=["name", "email"])

        result = schema.validate(data)
        if not result.valid:
            print(result.errors)
    """

    def __init__(
        self,
        properties: Dict[str, Validator],
        required: Optional[List[str]] = None,
        additional_properties: Union[bool, Validator] = True,
    ):
        self._validator = ObjectValidator(
            properties=properties,
            required=required,
            additional_properties=additional_properties,
        )

    def validate(self, data: Any) -> ValidationResult:
        """Validate data against schema."""
        return self._validator.validate(data)

    def is_valid(self, data: Any) -> bool:
        """Check if data is valid."""
        return self.validate(data).valid

    def validate_or_raise(self, data: Any) -> Any:
        """Validate and raise exception if invalid."""
        result = self.validate(data)
        if not result.valid:
            raise ValueError("Validation failed: " + ", ".join(result.error_messages))
        return result.coerced_data
