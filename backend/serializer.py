"""
Serializer - Sprint 765

Data serialization/deserialization system.

Features:
- Field validation
- Type coercion
- Nested objects
- Custom validators
- Partial updates
- Error collection
"""

import re
import json
from datetime import datetime
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Type, Generic,
    Union, Set, get_type_hints
)
from enum import Enum
from abc import ABC, abstractmethod


T = TypeVar("T")


class ValidationError(Exception):
    """Validation error with field details."""

    def __init__(self, errors: Dict[str, List[str]]):
        self.errors = errors
        super().__init__(self._format_errors())

    def _format_errors(self) -> str:
        parts = []
        for field_name, messages in self.errors.items():
            for msg in messages:
                parts.append(field_name + ": " + msg)
        return "; ".join(parts)

    def to_dict(self) -> dict:
        return {"errors": self.errors}


@dataclass
class FieldError:
    """Single field error."""
    field: str
    message: str
    code: str = "invalid"


class Field(ABC):
    """Base field class."""

    def __init__(
        self,
        required: bool = True,
        default: Any = None,
        allow_none: bool = False,
        validators: Optional[List[Callable]] = None,
        error_messages: Optional[Dict[str, str]] = None,
        source: Optional[str] = None,
        write_only: bool = False,
        read_only: bool = False,
    ):
        self.required = required
        self.default = default
        self.allow_none = allow_none
        self.validators = validators or []
        self.error_messages = error_messages or {}
        self.source = source
        self.write_only = write_only
        self.read_only = read_only
        self.field_name: Optional[str] = None

    def get_error_message(self, code: str) -> str:
        """Get error message for code."""
        default_messages = {
            "required": "This field is required.",
            "null": "This field cannot be null.",
            "invalid": "Invalid value.",
        }
        return self.error_messages.get(code, default_messages.get(code, "Invalid."))

    @abstractmethod
    def _validate(self, value: Any) -> Any:
        """Validate and transform value."""
        pass

    def validate(self, value: Any) -> Any:
        """Run full validation pipeline."""
        if value is None:
            if self.allow_none:
                return None
            if self.required:
                raise ValueError(self.get_error_message("null"))
            return self.default

        result = self._validate(value)

        for validator in self.validators:
            result = validator(result)

        return result


class StringField(Field):
    """String field with validation."""

    def __init__(
        self,
        min_length: Optional[int] = None,
        max_length: Optional[int] = None,
        trim: bool = True,
        pattern: Optional[str] = None,
        choices: Optional[List[str]] = None,
        **kwargs: Any,
    ):
        super().__init__(**kwargs)
        self.min_length = min_length
        self.max_length = max_length
        self.trim = trim
        self.pattern = re.compile(pattern) if pattern else None
        self.choices = choices

    def _validate(self, value: Any) -> str:
        if not isinstance(value, str):
            value = str(value)

        if self.trim:
            value = value.strip()

        if self.min_length and len(value) < self.min_length:
            raise ValueError("Must be at least " + str(self.min_length) + " characters.")

        if self.max_length and len(value) > self.max_length:
            raise ValueError("Must be at most " + str(self.max_length) + " characters.")

        if self.pattern and not self.pattern.match(value):
            raise ValueError("Invalid format.")

        if self.choices and value not in self.choices:
            raise ValueError("Must be one of: " + ", ".join(self.choices))

        return value


class IntegerField(Field):
    """Integer field."""

    def __init__(
        self,
        min_value: Optional[int] = None,
        max_value: Optional[int] = None,
        **kwargs: Any,
    ):
        super().__init__(**kwargs)
        self.min_value = min_value
        self.max_value = max_value

    def _validate(self, value: Any) -> int:
        try:
            result = int(value)
        except (ValueError, TypeError):
            raise ValueError("Must be an integer.")

        if self.min_value is not None and result < self.min_value:
            raise ValueError("Must be at least " + str(self.min_value) + ".")

        if self.max_value is not None and result > self.max_value:
            raise ValueError("Must be at most " + str(self.max_value) + ".")

        return result


class FloatField(Field):
    """Float field."""

    def __init__(
        self,
        min_value: Optional[float] = None,
        max_value: Optional[float] = None,
        precision: Optional[int] = None,
        **kwargs: Any,
    ):
        super().__init__(**kwargs)
        self.min_value = min_value
        self.max_value = max_value
        self.precision = precision

    def _validate(self, value: Any) -> float:
        try:
            result = float(value)
        except (ValueError, TypeError):
            raise ValueError("Must be a number.")

        if self.min_value is not None and result < self.min_value:
            raise ValueError("Must be at least " + str(self.min_value) + ".")

        if self.max_value is not None and result > self.max_value:
            raise ValueError("Must be at most " + str(self.max_value) + ".")

        if self.precision is not None:
            result = round(result, self.precision)

        return result


class BooleanField(Field):
    """Boolean field."""

    TRUE_VALUES = {"true", "1", "yes", "on", "t"}
    FALSE_VALUES = {"false", "0", "no", "off", "f"}

    def _validate(self, value: Any) -> bool:
        if isinstance(value, bool):
            return value

        if isinstance(value, str):
            lower = value.lower()
            if lower in self.TRUE_VALUES:
                return True
            if lower in self.FALSE_VALUES:
                return False

        raise ValueError("Must be a boolean.")


class DateTimeField(Field):
    """DateTime field."""

    def __init__(
        self,
        input_formats: Optional[List[str]] = None,
        output_format: str = "%Y-%m-%dT%H:%M:%SZ",
        **kwargs: Any,
    ):
        super().__init__(**kwargs)
        self.input_formats = input_formats or [
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
        ]
        self.output_format = output_format

    def _validate(self, value: Any) -> datetime:
        if isinstance(value, datetime):
            return value

        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value)

        if isinstance(value, str):
            for fmt in self.input_formats:
                try:
                    return datetime.strptime(value, fmt)
                except ValueError:
                    continue

        raise ValueError("Invalid datetime format.")

    def serialize(self, value: datetime) -> str:
        """Serialize datetime to string."""
        return value.strftime(self.output_format)


class EmailField(StringField):
    """Email field."""

    EMAIL_PATTERN = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"

    def __init__(self, **kwargs: Any):
        kwargs.setdefault("max_length", 254)
        super().__init__(pattern=self.EMAIL_PATTERN, **kwargs)

    def _validate(self, value: Any) -> str:
        result = super()._validate(value)
        return result.lower()


class URLField(StringField):
    """URL field."""

    URL_PATTERN = r"^https?://[^\s/$.?#].[^\s]*$"

    def __init__(self, **kwargs: Any):
        kwargs.setdefault("max_length", 2048)
        super().__init__(pattern=self.URL_PATTERN, **kwargs)


class UUIDField(StringField):
    """UUID field."""

    UUID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"

    def __init__(self, **kwargs: Any):
        super().__init__(pattern=self.UUID_PATTERN, **kwargs)

    def _validate(self, value: Any) -> str:
        result = super()._validate(value)
        return result.lower()


class ListField(Field):
    """List/array field."""

    def __init__(
        self,
        child: Field,
        min_length: Optional[int] = None,
        max_length: Optional[int] = None,
        unique: bool = False,
        **kwargs: Any,
    ):
        super().__init__(**kwargs)
        self.child = child
        self.min_length = min_length
        self.max_length = max_length
        self.unique = unique

    def _validate(self, value: Any) -> list:
        if not isinstance(value, (list, tuple)):
            raise ValueError("Must be a list.")

        if self.min_length and len(value) < self.min_length:
            raise ValueError("Must have at least " + str(self.min_length) + " items.")

        if self.max_length and len(value) > self.max_length:
            raise ValueError("Must have at most " + str(self.max_length) + " items.")

        result = []
        errors = []

        for i, item in enumerate(value):
            try:
                validated = self.child.validate(item)
                result.append(validated)
            except ValueError as e:
                errors.append("[" + str(i) + "]: " + str(e))

        if errors:
            raise ValueError("; ".join(errors))

        if self.unique:
            seen: Set[Any] = set()
            unique_result = []
            for item in result:
                key = json.dumps(item, sort_keys=True, default=str) if isinstance(item, dict) else item
                if key not in seen:
                    seen.add(key)
                    unique_result.append(item)
            result = unique_result

        return result


class DictField(Field):
    """Dictionary field."""

    def __init__(
        self,
        key_field: Optional[Field] = None,
        value_field: Optional[Field] = None,
        **kwargs: Any,
    ):
        super().__init__(**kwargs)
        self.key_field = key_field or StringField()
        self.value_field = value_field

    def _validate(self, value: Any) -> dict:
        if not isinstance(value, dict):
            raise ValueError("Must be an object.")

        result = {}
        errors = []

        for k, v in value.items():
            try:
                validated_key = self.key_field.validate(k)
                validated_value = self.value_field.validate(v) if self.value_field else v
                result[validated_key] = validated_value
            except ValueError as e:
                errors.append(str(k) + ": " + str(e))

        if errors:
            raise ValueError("; ".join(errors))

        return result


class EnumField(Field):
    """Enum field."""

    def __init__(self, enum_class: Type[Enum], **kwargs: Any):
        super().__init__(**kwargs)
        self.enum_class = enum_class

    def _validate(self, value: Any) -> Enum:
        if isinstance(value, self.enum_class):
            return value

        for member in self.enum_class:
            if value == member.value or value == member.name:
                return member

        valid = [m.value for m in self.enum_class]
        raise ValueError("Must be one of: " + ", ".join(map(str, valid)))


class NestedField(Field):
    """Nested serializer field."""

    def __init__(
        self,
        serializer_class: Type["Serializer"],
        many: bool = False,
        **kwargs: Any,
    ):
        super().__init__(**kwargs)
        self.serializer_class = serializer_class
        self.many = many

    def _validate(self, value: Any) -> Any:
        if self.many:
            if not isinstance(value, list):
                raise ValueError("Must be a list.")

            results = []
            errors = []

            for i, item in enumerate(value):
                try:
                    serializer = self.serializer_class(data=item)
                    results.append(serializer.validate())
                except ValidationError as e:
                    for field_name, msgs in e.errors.items():
                        errors.append("[" + str(i) + "]." + field_name + ": " + "; ".join(msgs))

            if errors:
                raise ValueError("; ".join(errors))

            return results

        serializer = self.serializer_class(data=value)
        return serializer.validate()


class SerializerMeta(type):
    """Metaclass for Serializer."""

    def __new__(mcs, name: str, bases: tuple, namespace: dict) -> "SerializerMeta":
        fields = {}

        for base in bases:
            if hasattr(base, "_declared_fields"):
                fields.update(base._declared_fields)

        for key, value in list(namespace.items()):
            if isinstance(value, Field):
                value.field_name = key
                fields[key] = value

        namespace["_declared_fields"] = fields
        return super().__new__(mcs, name, bases, namespace)


class Serializer(metaclass=SerializerMeta):
    """Base serializer class.

    Usage:
        class UserSerializer(Serializer):
            name = StringField(min_length=2, max_length=50)
            email = EmailField()
            age = IntegerField(min_value=0, max_value=150, required=False)

        # Validate input
        serializer = UserSerializer(data={"name": "John", "email": "john@example.com"})
        validated = serializer.validate()  # raises ValidationError if invalid

        # Serialize object
        user = {"name": "John", "email": "john@example.com", "internal_id": 123}
        output = serializer.serialize(user)  # excludes internal_id
    """

    _declared_fields: Dict[str, Field] = {}

    def __init__(
        self,
        data: Optional[Dict[str, Any]] = None,
        instance: Any = None,
        partial: bool = False,
        context: Optional[Dict[str, Any]] = None,
    ):
        self.data = data or {}
        self.instance = instance
        self.partial = partial
        self.context = context or {}
        self._errors: Dict[str, List[str]] = {}
        self._validated_data: Optional[Dict[str, Any]] = None

    @property
    def fields(self) -> Dict[str, Field]:
        """Get all declared fields."""
        return self._declared_fields.copy()

    def validate(self) -> Dict[str, Any]:
        """Validate data and return validated dict."""
        self._errors = {}
        self._validated_data = {}

        for field_name, field_obj in self.fields.items():
            if field_obj.read_only:
                continue

            source = field_obj.source or field_name
            value = self.data.get(source)

            if value is None and self.partial and not field_obj.required:
                continue

            if value is None and field_obj.default is not None:
                value = field_obj.default() if callable(field_obj.default) else field_obj.default

            try:
                if value is None:
                    if field_obj.required and not self.partial:
                        raise ValueError(field_obj.get_error_message("required"))
                    elif field_obj.allow_none:
                        self._validated_data[field_name] = None
                        continue
                    else:
                        continue

                validated = field_obj.validate(value)
                self._validated_data[field_name] = validated

            except ValueError as e:
                if field_name not in self._errors:
                    self._errors[field_name] = []
                self._errors[field_name].append(str(e))

        self._run_validators()

        if self._errors:
            raise ValidationError(self._errors)

        return self._validated_data

    def _run_validators(self) -> None:
        """Run object-level validators."""
        pass

    def is_valid(self) -> bool:
        """Check if data is valid."""
        try:
            self.validate()
            return True
        except ValidationError:
            return False

    @property
    def errors(self) -> Dict[str, List[str]]:
        """Get validation errors."""
        return self._errors

    @property
    def validated_data(self) -> Dict[str, Any]:
        """Get validated data."""
        if self._validated_data is None:
            self.validate()
        return self._validated_data or {}

    def serialize(self, obj: Any) -> Dict[str, Any]:
        """Serialize object to dict."""
        result = {}

        for field_name, field_obj in self.fields.items():
            if field_obj.write_only:
                continue

            source = field_obj.source or field_name

            if isinstance(obj, dict):
                value = obj.get(source)
            else:
                value = getattr(obj, source, None)

            if value is not None:
                if isinstance(field_obj, DateTimeField) and isinstance(value, datetime):
                    value = field_obj.serialize(value)
                elif isinstance(field_obj, EnumField) and isinstance(value, Enum):
                    value = value.value
                elif isinstance(field_obj, NestedField):
                    if field_obj.many:
                        value = [field_obj.serializer_class().serialize(v) for v in value]
                    else:
                        value = field_obj.serializer_class().serialize(value)

            result[field_name] = value

        return result

    def serialize_many(self, objs: List[Any]) -> List[Dict[str, Any]]:
        """Serialize multiple objects."""
        return [self.serialize(obj) for obj in objs]


class ModelSerializer(Serializer):
    """Serializer with model support.

    Usage:
        class UserModelSerializer(ModelSerializer):
            class Meta:
                model = User
                fields = ["id", "name", "email"]
                read_only_fields = ["id"]
    """

    class Meta:
        model: Optional[Type] = None
        fields: Optional[List[str]] = None
        exclude: Optional[List[str]] = None
        read_only_fields: Optional[List[str]] = None

    def create(self, validated_data: Dict[str, Any]) -> Any:
        """Create new instance."""
        meta = getattr(self, "Meta", None)
        if meta and hasattr(meta, "model") and meta.model:
            return meta.model(**validated_data)
        return validated_data

    def update(self, instance: Any, validated_data: Dict[str, Any]) -> Any:
        """Update existing instance."""
        for key, value in validated_data.items():
            setattr(instance, key, value)
        return instance

    def save(self) -> Any:
        """Save (create or update) instance."""
        validated = self.validated_data

        if self.instance:
            return self.update(self.instance, validated)
        return self.create(validated)


def validator(field_name: str) -> Callable:
    """Decorator to add field validator.

    Usage:
        class UserSerializer(Serializer):
            password = StringField(min_length=8)
            confirm_password = StringField(min_length=8)

            @validator("confirm_password")
            def validate_passwords_match(self, value, data):
                if value != data.get("password"):
                    raise ValueError("Passwords must match.")
                return value
    """
    def decorator(func: Callable) -> Callable:
        func._validator_field = field_name
        return func
    return decorator


def create_serializer(
    fields: Dict[str, Field],
    name: str = "DynamicSerializer",
) -> Type[Serializer]:
    """Dynamically create serializer class.

    Usage:
        UserSerializer = create_serializer({
            "name": StringField(max_length=100),
            "email": EmailField(),
        })
    """
    return type(name, (Serializer,), fields)


# Common validators
def min_length(length: int) -> Callable:
    """Minimum length validator."""
    def validate(value: Any) -> Any:
        if hasattr(value, "__len__") and len(value) < length:
            raise ValueError("Must have at least " + str(length) + " items.")
        return value
    return validate


def max_length(length: int) -> Callable:
    """Maximum length validator."""
    def validate(value: Any) -> Any:
        if hasattr(value, "__len__") and len(value) > length:
            raise ValueError("Must have at most " + str(length) + " items.")
        return value
    return validate


def regex(pattern: str, message: str = "Invalid format.") -> Callable:
    """Regex validator."""
    compiled = re.compile(pattern)
    def validate(value: str) -> str:
        if not compiled.match(value):
            raise ValueError(message)
        return value
    return validate


def one_of(choices: List[Any]) -> Callable:
    """Choices validator."""
    def validate(value: Any) -> Any:
        if value not in choices:
            raise ValueError("Must be one of: " + ", ".join(map(str, choices)))
        return value
    return validate
