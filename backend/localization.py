"""
Localization System - Sprint 729

Internationalization and localization.

Features:
- Multiple language support
- Translation management
- Pluralization
- Date/number formatting
- Locale detection
"""

import re
import time
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, Union
)
from datetime import datetime, date
import threading
from enum import Enum


class PluralForm(str, Enum):
    """Plural form categories."""
    ZERO = "zero"
    ONE = "one"
    TWO = "two"
    FEW = "few"
    MANY = "many"
    OTHER = "other"


@dataclass
class Locale:
    """Locale definition."""
    code: str
    name: str
    native_name: str
    direction: str = "ltr"  # ltr or rtl
    date_format: str = "%Y-%m-%d"
    time_format: str = "%H:%M:%S"
    datetime_format: str = "%Y-%m-%d %H:%M:%S"
    decimal_separator: str = "."
    thousands_separator: str = ","
    currency_symbol: str = "$"
    currency_position: str = "before"  # before or after


# Predefined locales
LOCALES: Dict[str, Locale] = {
    "en": Locale(
        code="en",
        name="English",
        native_name="English",
        date_format="%m/%d/%Y",
        time_format="%I:%M %p",
    ),
    "en-GB": Locale(
        code="en-GB",
        name="English (UK)",
        native_name="English (UK)",
        date_format="%d/%m/%Y",
        currency_symbol="£",
    ),
    "fr": Locale(
        code="fr",
        name="French",
        native_name="Français",
        date_format="%d/%m/%Y",
        time_format="%H:%M",
        decimal_separator=",",
        thousands_separator=" ",
        currency_symbol="€",
        currency_position="after",
    ),
    "de": Locale(
        code="de",
        name="German",
        native_name="Deutsch",
        date_format="%d.%m.%Y",
        decimal_separator=",",
        thousands_separator=".",
        currency_symbol="€",
        currency_position="after",
    ),
    "es": Locale(
        code="es",
        name="Spanish",
        native_name="Español",
        date_format="%d/%m/%Y",
        decimal_separator=",",
        thousands_separator=".",
        currency_symbol="€",
        currency_position="after",
    ),
    "ja": Locale(
        code="ja",
        name="Japanese",
        native_name="日本語",
        date_format="%Y年%m月%d日",
        currency_symbol="¥",
    ),
    "zh": Locale(
        code="zh",
        name="Chinese",
        native_name="中文",
        date_format="%Y年%m月%d日",
        currency_symbol="¥",
    ),
    "ar": Locale(
        code="ar",
        name="Arabic",
        native_name="العربية",
        direction="rtl",
        date_format="%d/%m/%Y",
    ),
    "he": Locale(
        code="he",
        name="Hebrew",
        native_name="עברית",
        direction="rtl",
        date_format="%d/%m/%Y",
    ),
    "pt": Locale(
        code="pt",
        name="Portuguese",
        native_name="Português",
        date_format="%d/%m/%Y",
        decimal_separator=",",
        thousands_separator=".",
        currency_symbol="R$",
    ),
}


@dataclass
class Translation:
    """Translation entry."""
    key: str
    value: str
    locale: str
    plural_forms: Optional[Dict[str, str]] = None
    context: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class TranslationManager:
    """Translation management system.

    Usage:
        t = TranslationManager(default_locale="en")

        # Add translations
        t.add_translation("en", "hello", "Hello")
        t.add_translation("fr", "hello", "Bonjour")
        t.add_translation("es", "hello", "Hola")

        # With plurals
        t.add_translation("en", "items", "{count} item", plurals={
            "one": "{count} item",
            "other": "{count} items"
        })

        # Get translation
        print(t.t("hello"))  # "Hello"
        t.set_locale("fr")
        print(t.t("hello"))  # "Bonjour"

        # With variables
        print(t.t("items", count=5))  # "5 items"
    """

    def __init__(
        self,
        default_locale: str = "en",
        fallback_locale: Optional[str] = None,
    ):
        """Initialize translation manager."""
        self._translations: Dict[str, Dict[str, Translation]] = {}
        self._default_locale = default_locale
        self._fallback_locale = fallback_locale or default_locale
        self._current_locale = default_locale
        self._lock = threading.Lock()
        self._missing_handler: Optional[Callable[[str, str], str]] = None

    def add_translation(
        self,
        locale: str,
        key: str,
        value: str,
        plurals: Optional[Dict[str, str]] = None,
        context: Optional[str] = None,
        **metadata,
    ) -> None:
        """Add a translation.

        Args:
            locale: Locale code
            key: Translation key
            value: Translation value
            plurals: Plural forms
            context: Translation context
            **metadata: Additional metadata
        """
        with self._lock:
            if locale not in self._translations:
                self._translations[locale] = {}

            translation = Translation(
                key=key,
                value=value,
                locale=locale,
                plural_forms=plurals,
                context=context,
                metadata=metadata,
            )

            self._translations[locale][key] = translation

    def add_translations(self, locale: str, translations: Dict[str, str]) -> None:
        """Add multiple translations at once."""
        for key, value in translations.items():
            self.add_translation(locale, key, value)

    def load_translations(self, locale: str, data: Dict[str, Any]) -> None:
        """Load translations from dictionary (supports nested keys)."""
        flat = self._flatten_dict(data)
        for key, value in flat.items():
            if isinstance(value, dict) and any(k in value for k in ["one", "other", "zero", "few", "many"]):
                # Has plural forms
                base_value = value.get("other", value.get("one", ""))
                self.add_translation(locale, key, base_value, plurals=value)
            else:
                self.add_translation(locale, key, str(value))

    def _flatten_dict(
        self,
        d: Dict[str, Any],
        parent_key: str = "",
        sep: str = ".",
    ) -> Dict[str, Any]:
        """Flatten nested dictionary."""
        items: List[tuple] = []
        for k, v in d.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            if isinstance(v, dict) and not any(pk in v for pk in ["one", "other", "zero"]):
                items.extend(self._flatten_dict(v, new_key, sep).items())
            else:
                items.append((new_key, v))
        return dict(items)

    def t(
        self,
        key: str,
        locale: Optional[str] = None,
        count: Optional[int] = None,
        **kwargs,
    ) -> str:
        """Translate a key.

        Args:
            key: Translation key
            locale: Override locale
            count: Count for pluralization
            **kwargs: Variables for interpolation

        Returns:
            Translated string
        """
        target_locale = locale or self._current_locale
        translation = self._get_translation(key, target_locale)

        if translation is None:
            return self._handle_missing(key, target_locale)

        # Get appropriate plural form
        if count is not None and translation.plural_forms:
            plural_form = self._get_plural_form(count, target_locale)
            value = translation.plural_forms.get(plural_form, translation.value)
        else:
            value = translation.value

        # Interpolate variables
        interpolation_vars = {"count": count, **kwargs}
        if any(v is not None for v in interpolation_vars.values()):
            value = self._interpolate(value, interpolation_vars)

        return value

    def _get_translation(
        self,
        key: str,
        locale: str,
    ) -> Optional[Translation]:
        """Get translation for key and locale."""
        # Try exact locale
        if locale in self._translations and key in self._translations[locale]:
            return self._translations[locale][key]

        # Try base locale (e.g., "en" for "en-US")
        base_locale = locale.split("-")[0]
        if base_locale != locale:
            if base_locale in self._translations and key in self._translations[base_locale]:
                return self._translations[base_locale][key]

        # Try fallback
        if self._fallback_locale and self._fallback_locale != locale:
            if self._fallback_locale in self._translations:
                return self._translations[self._fallback_locale].get(key)

        return None

    def _get_plural_form(self, count: int, locale: str) -> str:
        """Get plural form for count and locale."""
        # Simplified plural rules (real implementation would use CLDR)
        base = locale.split("-")[0]

        if base in ["ja", "zh", "ko", "vi"]:
            # No plural forms
            return "other"
        elif base == "ar":
            # Arabic has complex plural rules
            if count == 0:
                return "zero"
            elif count == 1:
                return "one"
            elif count == 2:
                return "two"
            elif 3 <= count <= 10:
                return "few"
            elif 11 <= count <= 99:
                return "many"
            return "other"
        else:
            # Default: English-like
            if count == 0:
                return "zero"
            elif count == 1:
                return "one"
            return "other"

    def _interpolate(self, value: str, variables: Dict[str, Any]) -> str:
        """Interpolate variables in string."""
        def replace(match: re.Match) -> str:
            var_name = match.group(1)
            if var_name in variables and variables[var_name] is not None:
                return str(variables[var_name])
            return match.group(0)

        return re.sub(r"\{(\w+)\}", replace, value)

    def _handle_missing(self, key: str, locale: str) -> str:
        """Handle missing translation."""
        if self._missing_handler:
            return self._missing_handler(key, locale)
        return key

    def on_missing(self, handler: Callable[[str, str], str]) -> None:
        """Set missing translation handler."""
        self._missing_handler = handler

    def set_locale(self, locale: str) -> None:
        """Set current locale."""
        self._current_locale = locale

    def get_locale(self) -> str:
        """Get current locale."""
        return self._current_locale

    def get_available_locales(self) -> List[str]:
        """Get list of available locales."""
        return list(self._translations.keys())

    def has_translation(self, key: str, locale: Optional[str] = None) -> bool:
        """Check if translation exists."""
        target_locale = locale or self._current_locale
        return self._get_translation(key, target_locale) is not None


class Formatter:
    """Locale-aware formatting.

    Usage:
        fmt = Formatter("fr")

        print(fmt.number(1234.56))  # "1 234,56"
        print(fmt.currency(99.99))  # "99,99 €"
        print(fmt.date(datetime.now()))  # "25/01/2026"
    """

    def __init__(self, locale: str = "en"):
        """Initialize formatter."""
        self._locale_code = locale
        self._locale = LOCALES.get(locale, LOCALES.get("en"))

    def set_locale(self, locale: str) -> None:
        """Set formatter locale."""
        self._locale_code = locale
        self._locale = LOCALES.get(locale, LOCALES.get("en"))

    def number(
        self,
        value: Union[int, float],
        decimals: Optional[int] = None,
    ) -> str:
        """Format number."""
        if decimals is not None:
            value = round(value, decimals)

        if isinstance(value, float):
            int_part, dec_part = str(value).split(".")
        else:
            int_part, dec_part = str(value), ""

        # Add thousands separators
        formatted_int = ""
        for i, digit in enumerate(reversed(int_part)):
            if i > 0 and i % 3 == 0:
                formatted_int = self._locale.thousands_separator + formatted_int
            formatted_int = digit + formatted_int

        if dec_part:
            if decimals is not None:
                dec_part = dec_part[:decimals].ljust(decimals, "0")
            return f"{formatted_int}{self._locale.decimal_separator}{dec_part}"

        return formatted_int

    def currency(
        self,
        value: Union[int, float],
        decimals: int = 2,
        symbol: Optional[str] = None,
    ) -> str:
        """Format currency."""
        sym = symbol or self._locale.currency_symbol
        formatted = self.number(value, decimals)

        if self._locale.currency_position == "before":
            return f"{sym}{formatted}"
        return f"{formatted} {sym}"

    def percent(
        self,
        value: Union[int, float],
        decimals: int = 0,
    ) -> str:
        """Format percentage."""
        formatted = self.number(value * 100, decimals)
        return f"{formatted}%"

    def date(
        self,
        value: Union[datetime, date],
        format_str: Optional[str] = None,
    ) -> str:
        """Format date."""
        fmt = format_str or self._locale.date_format
        return value.strftime(fmt)

    def time(
        self,
        value: datetime,
        format_str: Optional[str] = None,
    ) -> str:
        """Format time."""
        fmt = format_str or self._locale.time_format
        return value.strftime(fmt)

    def datetime_format(
        self,
        value: datetime,
        format_str: Optional[str] = None,
    ) -> str:
        """Format datetime."""
        fmt = format_str or self._locale.datetime_format
        return value.strftime(fmt)

    def relative_time(self, value: datetime) -> str:
        """Format relative time (e.g., '5 minutes ago')."""
        now = datetime.now()
        diff = now - value
        seconds = diff.total_seconds()

        # Future handling
        if seconds < 0:
            seconds = abs(seconds)
            prefix, suffix = "in ", ""
        else:
            prefix, suffix = "", " ago"

        if seconds < 60:
            return f"{prefix}just now"
        elif seconds < 3600:
            mins = int(seconds / 60)
            unit = "minute" if mins == 1 else "minutes"
            return f"{prefix}{mins} {unit}{suffix}"
        elif seconds < 86400:
            hours = int(seconds / 3600)
            unit = "hour" if hours == 1 else "hours"
            return f"{prefix}{hours} {unit}{suffix}"
        elif seconds < 604800:
            days = int(seconds / 86400)
            unit = "day" if days == 1 else "days"
            return f"{prefix}{days} {unit}{suffix}"
        elif seconds < 2592000:
            weeks = int(seconds / 604800)
            unit = "week" if weeks == 1 else "weeks"
            return f"{prefix}{weeks} {unit}{suffix}"
        elif seconds < 31536000:
            months = int(seconds / 2592000)
            unit = "month" if months == 1 else "months"
            return f"{prefix}{months} {unit}{suffix}"
        else:
            years = int(seconds / 31536000)
            unit = "year" if years == 1 else "years"
            return f"{prefix}{years} {unit}{suffix}"


class LocaleDetector:
    """Locale detection utilities."""

    @staticmethod
    def from_accept_language(header: str) -> Optional[str]:
        """Parse Accept-Language header."""
        if not header:
            return None

        locales = []
        for part in header.split(","):
            part = part.strip()
            if ";q=" in part:
                locale, q = part.split(";q=")
                try:
                    quality = float(q)
                except ValueError:
                    quality = 1.0
            else:
                locale = part
                quality = 1.0
            locales.append((locale.strip(), quality))

        locales.sort(key=lambda x: x[1], reverse=True)
        return locales[0][0] if locales else None

    @staticmethod
    def normalize(locale: str) -> str:
        """Normalize locale code."""
        locale = locale.replace("_", "-")
        parts = locale.split("-")
        if len(parts) == 1:
            return parts[0].lower()
        return f"{parts[0].lower()}-{parts[1].upper()}"


# Singleton instances
translation_manager = TranslationManager()
formatter = Formatter()


# Convenience functions
def t(key: str, **kwargs) -> str:
    """Translate using global manager."""
    return translation_manager.t(key, **kwargs)


def set_locale(locale: str) -> None:
    """Set locale for global instances."""
    translation_manager.set_locale(locale)
    formatter.set_locale(locale)


def get_locale() -> str:
    """Get current locale."""
    return translation_manager.get_locale()


def format_number(value: Union[int, float], decimals: Optional[int] = None) -> str:
    """Format number using global formatter."""
    return formatter.number(value, decimals)


def format_currency(value: Union[int, float], decimals: int = 2) -> str:
    """Format currency using global formatter."""
    return formatter.currency(value, decimals)


def format_date(value: Union[datetime, date]) -> str:
    """Format date using global formatter."""
    return formatter.date(value)
