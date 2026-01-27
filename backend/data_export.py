"""
Data Export - Multi-format data export system.

Provides tools for exporting data to various formats
including CSV, JSON, Excel, PDF, and more.
"""

from __future__ import annotations

import csv
import json
import io
import base64
import zipfile
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, date
from decimal import Decimal
from enum import Enum
from typing import Any, Callable, Generator, TypeVar, Generic
from threading import RLock


T = TypeVar("T")


class ExportFormat(Enum):
    """Supported export formats."""

    CSV = "csv"
    JSON = "json"
    JSONL = "jsonl"
    XML = "xml"
    HTML = "html"
    MARKDOWN = "markdown"
    YAML = "yaml"


class CompressionType(Enum):
    """Compression types for export."""

    NONE = "none"
    ZIP = "zip"
    GZIP = "gzip"


@dataclass
class ExportColumn:
    """Definition of an export column."""

    key: str
    header: str
    formatter: Callable[[Any], str] | None = None
    width: int = 20
    align: str = "left"
    visible: bool = True

    def format_value(self, value: Any) -> str:
        """Format a value using the column formatter."""
        if self.formatter:
            return self.formatter(value)
        return self._default_format(value)

    def _default_format(self, value: Any) -> str:
        """Default value formatter."""
        if value is None:
            return ""
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, date):
            return value.isoformat()
        if isinstance(value, Decimal):
            return str(value)
        if isinstance(value, bool):
            return "Yes" if value else "No"
        if isinstance(value, (list, dict)):
            return json.dumps(value)
        return str(value)


@dataclass
class ExportOptions:
    """Options for data export."""

    format: ExportFormat = ExportFormat.CSV
    compression: CompressionType = CompressionType.NONE
    filename: str = "export"
    include_headers: bool = True
    delimiter: str = ","
    quote_char: str = '"'
    encoding: str = "utf-8"
    indent: int = 2
    pretty_print: bool = True
    date_format: str = "%Y-%m-%d"
    datetime_format: str = "%Y-%m-%d %H:%M:%S"
    null_value: str = ""
    include_metadata: bool = False
    chunk_size: int = 1000


@dataclass
class ExportResult:
    """Result of an export operation."""

    success: bool
    filename: str
    format: ExportFormat
    size_bytes: int
    row_count: int
    duration_ms: float
    data: bytes | None = None
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_base64(self) -> str | None:
        """Convert data to base64 string."""
        if self.data:
            return base64.b64encode(self.data).decode("utf-8")
        return None


class Exporter(ABC):
    """Base class for data exporters."""

    @abstractmethod
    def export(
        self,
        data: list[dict[str, Any]],
        columns: list[ExportColumn],
        options: ExportOptions
    ) -> bytes:
        """Export data to bytes."""
        pass

    @abstractmethod
    def get_content_type(self) -> str:
        """Get the MIME content type."""
        pass

    @abstractmethod
    def get_file_extension(self) -> str:
        """Get the file extension."""
        pass


class CSVExporter(Exporter):
    """CSV format exporter."""

    def export(
        self,
        data: list[dict[str, Any]],
        columns: list[ExportColumn],
        options: ExportOptions
    ) -> bytes:
        """Export data to CSV."""
        output = io.StringIO()
        visible_columns = [c for c in columns if c.visible]

        writer = csv.writer(
            output,
            delimiter=options.delimiter,
            quotechar=options.quote_char,
            quoting=csv.QUOTE_MINIMAL
        )

        if options.include_headers:
            writer.writerow([c.header for c in visible_columns])

        for row in data:
            writer.writerow([
                c.format_value(row.get(c.key))
                for c in visible_columns
            ])

        return output.getvalue().encode(options.encoding)

    def get_content_type(self) -> str:
        return "text/csv"

    def get_file_extension(self) -> str:
        return "csv"


class JSONExporter(Exporter):
    """JSON format exporter."""

    def export(
        self,
        data: list[dict[str, Any]],
        columns: list[ExportColumn],
        options: ExportOptions
    ) -> bytes:
        """Export data to JSON."""
        visible_columns = [c for c in columns if c.visible]
        column_keys = {c.key for c in visible_columns}

        export_data = []
        for row in data:
            export_row = {}
            for col in visible_columns:
                value = row.get(col.key)
                export_row[col.key] = self._serialize_value(value)
            export_data.append(export_row)

        if options.pretty_print:
            result = json.dumps(export_data, indent=options.indent, ensure_ascii=False)
        else:
            result = json.dumps(export_data, ensure_ascii=False)

        return result.encode(options.encoding)

    def _serialize_value(self, value: Any) -> Any:
        """Serialize a value for JSON."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, date):
            return value.isoformat()
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, bytes):
            return base64.b64encode(value).decode("utf-8")
        return value

    def get_content_type(self) -> str:
        return "application/json"

    def get_file_extension(self) -> str:
        return "json"


class JSONLExporter(Exporter):
    """JSON Lines format exporter."""

    def export(
        self,
        data: list[dict[str, Any]],
        columns: list[ExportColumn],
        options: ExportOptions
    ) -> bytes:
        """Export data to JSON Lines."""
        visible_columns = [c for c in columns if c.visible]
        lines = []

        for row in data:
            export_row = {}
            for col in visible_columns:
                value = row.get(col.key)
                export_row[col.key] = self._serialize_value(value)
            lines.append(json.dumps(export_row, ensure_ascii=False))

        return "\n".join(lines).encode(options.encoding)

    def _serialize_value(self, value: Any) -> Any:
        """Serialize a value for JSON."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, date):
            return value.isoformat()
        if isinstance(value, Decimal):
            return float(value)
        return value

    def get_content_type(self) -> str:
        return "application/x-ndjson"

    def get_file_extension(self) -> str:
        return "jsonl"


class XMLExporter(Exporter):
    """XML format exporter."""

    def export(
        self,
        data: list[dict[str, Any]],
        columns: list[ExportColumn],
        options: ExportOptions
    ) -> bytes:
        """Export data to XML."""
        visible_columns = [c for c in columns if c.visible]
        lines = ['<?xml version="1.0" encoding="UTF-8"?>', "<records>"]

        for row in data:
            lines.append("  <record>")
            for col in visible_columns:
                value = col.format_value(row.get(col.key))
                escaped = self._escape_xml(value)
                lines.append(f"    <{col.key}>{escaped}</{col.key}>")
            lines.append("  </record>")

        lines.append("</records>")

        if options.pretty_print:
            result = "\n".join(lines)
        else:
            result = "".join(lines)

        return result.encode(options.encoding)

    def _escape_xml(self, text: str) -> str:
        """Escape XML special characters."""
        return (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;")
        )

    def get_content_type(self) -> str:
        return "application/xml"

    def get_file_extension(self) -> str:
        return "xml"


class HTMLExporter(Exporter):
    """HTML table format exporter."""

    def export(
        self,
        data: list[dict[str, Any]],
        columns: list[ExportColumn],
        options: ExportOptions
    ) -> bytes:
        """Export data to HTML table."""
        visible_columns = [c for c in columns if c.visible]

        html = ['<!DOCTYPE html>', '<html>', '<head>',
                '<meta charset="UTF-8">',
                '<style>',
                'table { border-collapse: collapse; width: 100%; }',
                'th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }',
                'th { background-color: #4a5568; color: white; }',
                'tr:nth-child(even) { background-color: #f3f4f6; }',
                'tr:hover { background-color: #e5e7eb; }',
                '</style>',
                '</head>', '<body>', '<table>']

        if options.include_headers:
            html.append('<thead><tr>')
            for col in visible_columns:
                html.append(f'<th>{self._escape_html(col.header)}</th>')
            html.append('</tr></thead>')

        html.append('<tbody>')
        for row in data:
            html.append('<tr>')
            for col in visible_columns:
                value = col.format_value(row.get(col.key))
                html.append(f'<td>{self._escape_html(value)}</td>')
            html.append('</tr>')
        html.append('</tbody>')

        html.extend(['</table>', '</body>', '</html>'])

        if options.pretty_print:
            result = "\n".join(html)
        else:
            result = "".join(html)

        return result.encode(options.encoding)

    def _escape_html(self, text: str) -> str:
        """Escape HTML special characters."""
        return (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    def get_content_type(self) -> str:
        return "text/html"

    def get_file_extension(self) -> str:
        return "html"


class MarkdownExporter(Exporter):
    """Markdown table format exporter."""

    def export(
        self,
        data: list[dict[str, Any]],
        columns: list[ExportColumn],
        options: ExportOptions
    ) -> bytes:
        """Export data to Markdown table."""
        visible_columns = [c for c in columns if c.visible]
        lines = []

        if options.include_headers:
            headers = " | ".join(col.header for col in visible_columns)
            lines.append(f"| {headers} |")

            separators = []
            for col in visible_columns:
                if col.align == "center":
                    separators.append(":---:")
                elif col.align == "right":
                    separators.append("---:")
                else:
                    separators.append("---")
            lines.append(f"| {' | '.join(separators)} |")

        for row in data:
            values = []
            for col in visible_columns:
                value = col.format_value(row.get(col.key))
                value = value.replace("|", "\\|")
                values.append(value)
            lines.append(f"| {' | '.join(values)} |")

        return "\n".join(lines).encode(options.encoding)

    def get_content_type(self) -> str:
        return "text/markdown"

    def get_file_extension(self) -> str:
        return "md"


class YAMLExporter(Exporter):
    """YAML format exporter."""

    def export(
        self,
        data: list[dict[str, Any]],
        columns: list[ExportColumn],
        options: ExportOptions
    ) -> bytes:
        """Export data to YAML."""
        visible_columns = [c for c in columns if c.visible]
        lines = ["records:"]

        for row in data:
            lines.append("  -")
            for col in visible_columns:
                value = row.get(col.key)
                yaml_value = self._to_yaml_value(value)
                lines.append(f"    {col.key}: {yaml_value}")

        return "\n".join(lines).encode(options.encoding)

    def _to_yaml_value(self, value: Any) -> str:
        """Convert a value to YAML format."""
        if value is None:
            return "null"
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, (int, float)):
            return str(value)
        if isinstance(value, datetime):
            return f'"{value.isoformat()}"'
        if isinstance(value, date):
            return f'"{value.isoformat()}"'
        if isinstance(value, str):
            if any(c in value for c in ":#{}[]|>&*!?,'\""):
                return f'"{value}"'
            return value
        return f'"{value}"'

    def get_content_type(self) -> str:
        return "application/x-yaml"

    def get_file_extension(self) -> str:
        return "yaml"


class DataExportService:
    """Main service for exporting data."""

    def __init__(self):
        self._exporters: dict[ExportFormat, Exporter] = {
            ExportFormat.CSV: CSVExporter(),
            ExportFormat.JSON: JSONExporter(),
            ExportFormat.JSONL: JSONLExporter(),
            ExportFormat.XML: XMLExporter(),
            ExportFormat.HTML: HTMLExporter(),
            ExportFormat.MARKDOWN: MarkdownExporter(),
            ExportFormat.YAML: YAMLExporter(),
        }
        self._lock = RLock()

    def register_exporter(self, format: ExportFormat, exporter: Exporter) -> None:
        """Register a custom exporter."""
        with self._lock:
            self._exporters[format] = exporter

    def export(
        self,
        data: list[dict[str, Any]],
        columns: list[ExportColumn] | None = None,
        options: ExportOptions | None = None
    ) -> ExportResult:
        """Export data to the specified format."""
        import time
        start = time.perf_counter()

        options = options or ExportOptions()

        if columns is None:
            columns = self._infer_columns(data)

        exporter = self._exporters.get(options.format)
        if not exporter:
            return ExportResult(
                success=False,
                filename="",
                format=options.format,
                size_bytes=0,
                row_count=0,
                duration_ms=0,
                error=f"Unsupported format: {options.format}"
            )

        try:
            exported_data = exporter.export(data, columns, options)

            if options.compression == CompressionType.ZIP:
                exported_data = self._compress_zip(
                    exported_data,
                    f"{options.filename}.{exporter.get_file_extension()}"
                )
                ext = "zip"
            elif options.compression == CompressionType.GZIP:
                import gzip
                exported_data = gzip.compress(exported_data)
                ext = f"{exporter.get_file_extension()}.gz"
            else:
                ext = exporter.get_file_extension()

            filename = f"{options.filename}.{ext}"

            duration = (time.perf_counter() - start) * 1000

            return ExportResult(
                success=True,
                filename=filename,
                format=options.format,
                size_bytes=len(exported_data),
                row_count=len(data),
                duration_ms=duration,
                data=exported_data,
                metadata={
                    "content_type": exporter.get_content_type(),
                    "compression": options.compression.value,
                    "columns": len(columns),
                }
            )

        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            return ExportResult(
                success=False,
                filename="",
                format=options.format,
                size_bytes=0,
                row_count=0,
                duration_ms=duration,
                error=str(e)
            )

    def _infer_columns(self, data: list[dict[str, Any]]) -> list[ExportColumn]:
        """Infer columns from data."""
        if not data:
            return []

        keys: set[str] = set()
        for row in data:
            keys.update(row.keys())

        return [
            ExportColumn(
                key=key,
                header=key.replace("_", " ").title()
            )
            for key in sorted(keys)
        ]

    def _compress_zip(self, data: bytes, filename: str) -> bytes:
        """Compress data to ZIP format."""
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(filename, data)
        return buffer.getvalue()

    def export_chunked(
        self,
        data_generator: Generator[dict[str, Any], None, None],
        columns: list[ExportColumn],
        options: ExportOptions
    ) -> Generator[bytes, None, None]:
        """Export data in chunks for streaming."""
        exporter = self._exporters.get(options.format)
        if not exporter:
            return

        chunk = []
        first_chunk = True

        for row in data_generator:
            chunk.append(row)

            if len(chunk) >= options.chunk_size:
                if first_chunk and options.include_headers:
                    yield exporter.export(chunk, columns, options)
                    first_chunk = False
                else:
                    no_header_options = ExportOptions(
                        **{**vars(options), "include_headers": False}
                    )
                    yield exporter.export(chunk, columns, no_header_options)
                chunk = []

        if chunk:
            if first_chunk:
                yield exporter.export(chunk, columns, options)
            else:
                no_header_options = ExportOptions(
                    **{**vars(options), "include_headers": False}
                )
                yield exporter.export(chunk, columns, no_header_options)


class ExportBuilder:
    """Fluent builder for creating exports."""

    def __init__(self, service: DataExportService):
        self._service = service
        self._data: list[dict[str, Any]] = []
        self._columns: list[ExportColumn] = []
        self._options = ExportOptions()

    def data(self, data: list[dict[str, Any]]) -> ExportBuilder:
        """Set the data to export."""
        self._data = data
        return self

    def column(
        self,
        key: str,
        header: str | None = None,
        formatter: Callable[[Any], str] | None = None,
        width: int = 20,
        align: str = "left"
    ) -> ExportBuilder:
        """Add a column."""
        self._columns.append(ExportColumn(
            key=key,
            header=header or key.replace("_", " ").title(),
            formatter=formatter,
            width=width,
            align=align
        ))
        return self

    def format(self, format: ExportFormat) -> ExportBuilder:
        """Set the export format."""
        self._options.format = format
        return self

    def filename(self, filename: str) -> ExportBuilder:
        """Set the filename."""
        self._options.filename = filename
        return self

    def compress(self, compression: CompressionType) -> ExportBuilder:
        """Set compression type."""
        self._options.compression = compression
        return self

    def delimiter(self, delimiter: str) -> ExportBuilder:
        """Set CSV delimiter."""
        self._options.delimiter = delimiter
        return self

    def no_headers(self) -> ExportBuilder:
        """Exclude headers from export."""
        self._options.include_headers = False
        return self

    def pretty(self, pretty: bool = True) -> ExportBuilder:
        """Enable/disable pretty printing."""
        self._options.pretty_print = pretty
        return self

    def encoding(self, encoding: str) -> ExportBuilder:
        """Set output encoding."""
        self._options.encoding = encoding
        return self

    def build(self) -> ExportResult:
        """Execute the export."""
        columns = self._columns if self._columns else None
        return self._service.export(self._data, columns, self._options)


class ColumnFormatters:
    """Common column formatters."""

    @staticmethod
    def currency(symbol: str = "$", decimals: int = 2) -> Callable[[Any], str]:
        """Format as currency."""
        def formatter(value: Any) -> str:
            if value is None:
                return ""
            return f"{symbol}{float(value):,.{decimals}f}"
        return formatter

    @staticmethod
    def percentage(decimals: int = 1) -> Callable[[Any], str]:
        """Format as percentage."""
        def formatter(value: Any) -> str:
            if value is None:
                return ""
            return f"{float(value):.{decimals}f}%"
        return formatter

    @staticmethod
    def date(format: str = "%Y-%m-%d") -> Callable[[Any], str]:
        """Format date."""
        def formatter(value: Any) -> str:
            if value is None:
                return ""
            if isinstance(value, (datetime, date)):
                return value.strftime(format)
            return str(value)
        return formatter

    @staticmethod
    def boolean(true_value: str = "Yes", false_value: str = "No") -> Callable[[Any], str]:
        """Format boolean."""
        def formatter(value: Any) -> str:
            if value is None:
                return ""
            return true_value if value else false_value
        return formatter

    @staticmethod
    def number(decimals: int = 0, thousands_sep: bool = True) -> Callable[[Any], str]:
        """Format number."""
        def formatter(value: Any) -> str:
            if value is None:
                return ""
            num = float(value)
            if thousands_sep:
                return f"{num:,.{decimals}f}"
            return f"{num:.{decimals}f}"
        return formatter

    @staticmethod
    def truncate(max_length: int = 50, suffix: str = "...") -> Callable[[Any], str]:
        """Truncate long strings."""
        def formatter(value: Any) -> str:
            if value is None:
                return ""
            text = str(value)
            if len(text) <= max_length:
                return text
            return text[:max_length - len(suffix)] + suffix
        return formatter


# Export all
__all__ = [
    "ExportFormat",
    "CompressionType",
    "ExportColumn",
    "ExportOptions",
    "ExportResult",
    "Exporter",
    "CSVExporter",
    "JSONExporter",
    "JSONLExporter",
    "XMLExporter",
    "HTMLExporter",
    "MarkdownExporter",
    "YAMLExporter",
    "DataExportService",
    "ExportBuilder",
    "ColumnFormatters",
]
