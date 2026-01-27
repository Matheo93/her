"""
Validator - Sprint 771

Data validation system with rules.

Features:
- Rule-based validation
- Chained validators
- Custom rules
- Async validation
- Error messages
- Nested validation
"""

import re
import json
from datetime import datetime
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Type, Generic,
    Union, Tuple, Awaitable, Pattern
)
from enum import Enum
from abc import ABC, abstractmethod


T = TypeVar("T")


@dataclass
class ValidationResult:
    """Validation result."""
    valid: bool
    errors: List[str] = field(default_factory=list)
    field: Optional[str] = None

    def __bool__(self) -> bool:
        return self.valid

    def add_error(self, error: str) -> "ValidationResult":
        """Add an error."""
        self.errors.append(error)
        self.valid = False
        return self

    def merge(self, other: "ValidationResult") -> "ValidationResult":
        """Merge with another result."""
        if not other.valid:
            self.valid = False
            self.errors.extend(other.errors)
        return self


@dataclass
class ValidationErrors:
    """Collection of validation errors."""
    errors: Dict[str, List[str]] = field(default_factory=dict)

    def add(self, field: str, message: str) -> None:
        """Add an error for a field."""
        if field not in self.errors:
            self.errors[field] = []
        self.errors[field].append(message)

    def has_errors(self) -> bool:
        """Check if there are errors."""
        return len(self.errors) > 0

    def get(self, field: str) -> List[str]:
        """Get errors for a field."""
        return self.errors.get(field, [])

    def to_dict(self) -> Dict[str, List[str]]:
        """Convert to dictionary."""
        return self.errors.copy()

    def first_error(self) -> Optional[str]:
        """Get first error message."""
        for errors in self.errors.values():
            if errors:
                return errors[0]
        return None


class Rule(ABC):
    """Base validation rule."""

    def __init__(self, message: Optional[str] = None):
        self._message = message

    @abstractmethod
    def validate(self, value: Any) -> bool:
        """Validate value."""
        pass

    @property
    def message(self) -> str:
        """Error message."""
        return self._message or "Validation failed"

    def __call__(self, value: Any) -> ValidationResult:
        if self.validate(value):
            return ValidationResult(valid=True)
        return ValidationResult(valid=False, errors=[self.message])


# Built-in rules

class Required(Rule):
    """Value is required."""

    def __init__(self, message: str = "This field is required"):
        super().__init__(message)

    def validate(self, value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str) and not value.strip():
            return False
        if isinstance(value, (list, dict)) and len(value) == 0:
            return False
        return True


class TypeOf(Rule):
    """Value must be of type."""

    def __init__(self, expected: Type, message: Optional[str] = None):
        self.expected = expected
        super().__init__(message or "Must be of type " + expected.__name__)

    def validate(self, value: Any) -> bool:
        if value is None:
            return True
        return isinstance(value, self.expected)


class MinLength(Rule):
    """Minimum length."""

    def __init__(self, length: int, message: Optional[str] = None):
        self.length = length
        super().__init__(message or "Must be at least " + str(length) + " characters")

    def validate(self, value: Any) -> bool:
        if value is None:
            return True
        return len(value) >= self.length


class MaxLength(Rule):
    """Maximum length."""

    def __init__(self, length: int, message: Optional[str] = None):
        self.length = length
        super().__init__(message or "Must be at most " + str(length) + " characters")

    def validate(self, value: Any) -> bool:
        if value is None:
            return True
        return len(value) <= self.length


class Length(Rule):
    """Exact length."""

    def __init__(self, length: int, message: Optional[str] = None):
        self.length = length
        super().__init__(message or "Must be exactly " + str(length) + " characters")

    def validate(self, value: Any) -> bool:
        if value is None:
            return True
        return len(value) == self.length


class Min(Rule):
    """Minimum value."""

    def __init__(self, minimum: float, message: Optional[str] = None):
        self.minimum = minimum
        super().__init__(message or "Must be at least " + str(minimum))

    def validate(self, value: Any) -> bool:
        if value is None:
            return True
        return value >= self.minimum


class Max(Rule):
    """Maximum value."""

    def __init__(self, maximum: float, message: Optional[str] = None):
        self.maximum = maximum
        super().__init__(message or "Must be at most " + str(maximum))

    def validate(self, value: Any) -> bool:
        if value is None:
            return True
        return value <= self.maximum


class Range(Rule):
    """Value in range."""

    def __init__(
        self, minimum: float, maximum: float, message: Optional[str] = None
    ):
        self.minimum = minimum
        self.maximum = maximum
        super().__init__(
            message or "Must be between " + str(minimum) + " and " + str(maximum)
        )

    def validate(self, value: Any) -> bool:
        if value is None:
            return True
        return self.minimum <= value <= self.maximum


class Regex(Rule):
    """Match regex pattern."""

    def __init__(self, pattern: str, message: str = "Invalid format"):
        self.pattern = re.compile(pattern)
        super().__init__(message)

    def validate(self, value: Any) -> bool:
        if value is None:
            return True
        if not isinstance(value, str):
            return False
        return bool(self.pattern.match(value))


class Email(Regex):
    """Valid email address."""

    def __init__(self, message: str = "Invalid email address"):
        super().__init__(
            r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$",
            message
        )


class URL(Regex):
    """Valid URL."""

    def __init__(self, message: str = "Invalid URL"):
        super().__init__(
            r"^https?://[^\s/$.?#].[^\s]*$",
            message
        )


class UUID(Regex):
    """Valid UUID."""

    def __init__(self, message: str = "Invalid UUID"):
        super().__init__(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            message
        )


class Phone(Regex):
    """Valid phone number."""

    def __init__(self, message: str = "Invalid phone number"):
        super().__init__(
            r"^\+?[0-9]{10,15}$",
            message
        )


class Alpha(Regex):
    """Only alphabetic characters."""

    def __init__(self, message: str = "Only letters allowed"):
        super().__init__(r"^[a-zA-Z]+$", message)


class Numeric(Regex):
    """Only numeric characters."""

    def __init__(self, message: str = "Only numbers allowed"):
        super().__init__(r"^[0-9]+$", message)


class Alphanumeric(Regex):
    """Only alphanumeric characters."""

    def __init__(self, message: str = "Only letters and numbers allowed"):
        super().__init__(r"^[a-zA-Z0-9]+$", message)


class In(Rule):
    """Value in list."""

    def __init__(self, choices: List[Any], message: Optional[str] = None):
        self.choices = choices
        super().__init__(
            message or "Must be one of: " + ", ".join(map(str, choices))
        )

    def validate(self, value: Any) -> bool:
        if value is None:
            return True
        return value in self.choices


class NotIn(Rule):
    """Value not in list."""

    def __init__(self, choices: List[Any], message: Optional[str] = None):
        self.choices = choices
        super().__init__(
            message or "Must not be one of: " + ", ".join(map(str, choices))
        )

    def validate(self, value: Any) -> bool:
        if value is None:
            return True
        return value not in self.choices


class Equals(Rule):
    """Value equals expected."""

    def __init__(self, expected: Any, message: Optional[str] = None):
        self.expected = expected
        super().__init__(message or "Must equal " + str(expected))

    def validate(self, value: Any) -> bool:
        return value == self.expected


class NotEquals(Rule):
    """Value not equals expected."""

    def __init__(self, expected: Any, message: Optional[str] = None):
        self.expected = expected
        super().__init__(message or "Must not equal " + str(expected))

    def validate(self, value: Any) -> bool:
        return value != self.expected


class Custom(Rule):
    """Custom validation function."""

    def __init__(
        self,
        func: Callable[[Any], bool],
        message: str = "Validation failed"
    ):
        self.func = func
        super().__init__(message)

    def validate(self, value: Any) -> bool:
        return self.func(value)


class Each(Rule):
    """Apply rules to each item in list."""

    def __init__(self, rules: List[Rule], message: Optional[str] = None):
        self.rules = rules
        super().__init__(message or "Invalid list item")

    def validate(self, value: Any) -> bool:
        if value is None:
            return True
        if not isinstance(value, list):
            return False

        for item in value:
            for rule in self.rules:
                if not rule.validate(item):
                    return False
        return True

    def __call__(self, value: Any) -> ValidationResult:
        if value is None:
            return ValidationResult(valid=True)
        if not isinstance(value, list):
            return ValidationResult(valid=False, errors=["Must be a list"])

        result = ValidationResult(valid=True)
        for i, item in enumerate(value):
            for rule in self.rules:
                if not rule.validate(item):
                    result.add_error("[" + str(i) + "]: " + rule.message)

        return result


class Validator:
    """Field validator.

    Usage:
        validator = Validator({
            "name": [Required(), MinLength(2), MaxLength(50)],
            "email": [Required(), Email()],
            "age": [Required(), TypeOf(int), Range(0, 150)],
        })

        errors = validator.validate({
            "name": "John",
            "email": "invalid",
            "age": -5
        })

        if errors.has_errors():
            print(errors.to_dict())
    """

    def __init__(self, schema: Dict[str, List[Rule]]):
        self._schema = schema

    def validate(self, data: Dict[str, Any]) -> ValidationErrors:
        """Validate data against schema."""
        errors = ValidationErrors()

        for field, rules in self._schema.items():
            value = data.get(field)

            for rule in rules:
                result = rule(value)
                if not result.valid:
                    for error in result.errors:
                        errors.add(field, error)
                    break

        return errors

    def is_valid(self, data: Dict[str, Any]) -> bool:
        """Check if data is valid."""
        return not self.validate(data).has_errors()

    def validate_field(
        self, field: str, value: Any
    ) -> List[str]:
        """Validate single field."""
        rules = self._schema.get(field, [])
        errors = []

        for rule in rules:
            result = rule(value)
            if not result.valid:
                errors.extend(result.errors)
                break

        return errors


class NestedValidator:
    """Validator for nested objects.

    Usage:
        address_schema = {
            "street": [Required(), MaxLength(100)],
            "city": [Required()],
        }

        user_schema = {
            "name": [Required()],
            "address": NestedValidator(address_schema),
        }
    """

    def __init__(self, schema: Dict[str, List[Rule]]):
        self._validator = Validator(schema)

    def __call__(self, value: Any) -> ValidationResult:
        if value is None:
            return ValidationResult(valid=True)

        if not isinstance(value, dict):
            return ValidationResult(valid=False, errors=["Must be an object"])

        errors = self._validator.validate(value)
        if errors.has_errors():
            result = ValidationResult(valid=False)
            for field, msgs in errors.to_dict().items():
                for msg in msgs:
                    result.add_error(field + ": " + msg)
            return result

        return ValidationResult(valid=True)


class AsyncValidator:
    """Async validator for database checks etc.

    Usage:
        async def email_unique(email):
            exists = await db.check_email(email)
            return not exists

        validator = AsyncValidator({
            "email": [
                AsyncRule(email_unique, "Email already taken")
            ]
        })

        errors = await validator.validate(data)
    """

    def __init__(
        self,
        schema: Dict[str, List[Union[Rule, "AsyncRule"]]]
    ):
        self._schema = schema

    async def validate(self, data: Dict[str, Any]) -> ValidationErrors:
        """Validate data asynchronously."""
        errors = ValidationErrors()

        for field, rules in self._schema.items():
            value = data.get(field)

            for rule in rules:
                if isinstance(rule, AsyncRule):
                    result = await rule.validate_async(value)
                else:
                    result = rule(value)

                if not result.valid:
                    for error in result.errors:
                        errors.add(field, error)
                    break

        return errors


class AsyncRule:
    """Async validation rule."""

    def __init__(
        self,
        func: Callable[[Any], Awaitable[bool]],
        message: str = "Validation failed"
    ):
        self._func = func
        self._message = message

    async def validate_async(self, value: Any) -> ValidationResult:
        """Validate asynchronously."""
        try:
            valid = await self._func(value)
            if valid:
                return ValidationResult(valid=True)
            return ValidationResult(valid=False, errors=[self._message])
        except Exception as e:
            return ValidationResult(valid=False, errors=[str(e)])


# Chain builder for fluent API
class RuleChain:
    """Fluent rule builder.

    Usage:
        rules = RuleChain().required().min_length(2).max_length(50).build()
    """

    def __init__(self):
        self._rules: List[Rule] = []

    def required(self, message: Optional[str] = None) -> "RuleChain":
        self._rules.append(Required(message or "This field is required"))
        return self

    def type_of(self, t: Type, message: Optional[str] = None) -> "RuleChain":
        self._rules.append(TypeOf(t, message))
        return self

    def min_length(self, length: int, message: Optional[str] = None) -> "RuleChain":
        self._rules.append(MinLength(length, message))
        return self

    def max_length(self, length: int, message: Optional[str] = None) -> "RuleChain":
        self._rules.append(MaxLength(length, message))
        return self

    def min(self, value: float, message: Optional[str] = None) -> "RuleChain":
        self._rules.append(Min(value, message))
        return self

    def max(self, value: float, message: Optional[str] = None) -> "RuleChain":
        self._rules.append(Max(value, message))
        return self

    def range(
        self, minimum: float, maximum: float, message: Optional[str] = None
    ) -> "RuleChain":
        self._rules.append(Range(minimum, maximum, message))
        return self

    def regex(self, pattern: str, message: Optional[str] = None) -> "RuleChain":
        self._rules.append(Regex(pattern, message or "Invalid format"))
        return self

    def email(self, message: Optional[str] = None) -> "RuleChain":
        self._rules.append(Email(message or "Invalid email"))
        return self

    def url(self, message: Optional[str] = None) -> "RuleChain":
        self._rules.append(URL(message or "Invalid URL"))
        return self

    def uuid(self, message: Optional[str] = None) -> "RuleChain":
        self._rules.append(UUID(message or "Invalid UUID"))
        return self

    def one_of(self, choices: List[Any], message: Optional[str] = None) -> "RuleChain":
        self._rules.append(In(choices, message))
        return self

    def custom(
        self, func: Callable[[Any], bool], message: str = "Invalid"
    ) -> "RuleChain":
        self._rules.append(Custom(func, message))
        return self

    def build(self) -> List[Rule]:
        """Build rules list."""
        return self._rules


def chain() -> RuleChain:
    """Start a rule chain."""
    return RuleChain()


# Convenience functions
def validate(
    data: Dict[str, Any],
    schema: Dict[str, List[Rule]]
) -> ValidationErrors:
    """Validate data against schema."""
    return Validator(schema).validate(data)


def is_valid(
    data: Dict[str, Any],
    schema: Dict[str, List[Rule]]
) -> bool:
    """Check if data is valid."""
    return Validator(schema).is_valid(data)
