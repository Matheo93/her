"""
Conversation Export - Sprint 583

Export conversation history in multiple formats (JSON, TXT, HTML, Markdown).
Supports full and partial exports with metadata.

Features:
- JSON export with full metadata
- Plain text export for readability
- HTML export for web viewing
- Markdown export for documentation
- Filter by date range
- Anonymization option
"""

import json
import time
from datetime import datetime
from dataclasses import dataclass, asdict
from typing import Optional, List, Dict, Any
from enum import Enum


class ExportFormat(str, Enum):
    """Supported export formats."""
    JSON = "json"
    TXT = "txt"
    HTML = "html"
    MARKDOWN = "md"


@dataclass
class Message:
    """Single message in conversation."""
    role: str  # "user" or "assistant"
    content: str
    timestamp: float
    emotion: Optional[str] = None
    voice_used: Optional[str] = None
    latency_ms: Optional[float] = None


@dataclass
class ConversationExport:
    """Full conversation export with metadata."""
    session_id: str
    user_id: Optional[str]
    messages: List[Message]
    started_at: float
    ended_at: float
    total_messages: int
    user_messages: int
    assistant_messages: int
    avg_latency_ms: Optional[float] = None
    emotions_detected: Optional[Dict[str, int]] = None
    export_format: str = "json"
    exported_at: float = 0.0

    def __post_init__(self):
        if self.exported_at == 0.0:
            self.exported_at = time.time()


class ConversationExporter:
    """Export conversations in various formats."""

    def __init__(self):
        self.exports_count = 0

    def export_json(
        self,
        export: ConversationExport,
        pretty: bool = True
    ) -> str:
        """Export conversation as JSON.

        Args:
            export: Conversation export data
            pretty: If True, format with indentation

        Returns:
            JSON string
        """
        data = {
            "session_id": export.session_id,
            "user_id": export.user_id,
            "started_at": export.started_at,
            "started_at_iso": datetime.fromtimestamp(export.started_at).isoformat(),
            "ended_at": export.ended_at,
            "ended_at_iso": datetime.fromtimestamp(export.ended_at).isoformat(),
            "total_messages": export.total_messages,
            "user_messages": export.user_messages,
            "assistant_messages": export.assistant_messages,
            "avg_latency_ms": export.avg_latency_ms,
            "emotions_detected": export.emotions_detected,
            "exported_at": export.exported_at,
            "exported_at_iso": datetime.fromtimestamp(export.exported_at).isoformat(),
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "timestamp": m.timestamp,
                    "timestamp_iso": datetime.fromtimestamp(m.timestamp).isoformat(),
                    "emotion": m.emotion,
                    "voice_used": m.voice_used,
                    "latency_ms": m.latency_ms,
                }
                for m in export.messages
            ]
        }

        self.exports_count += 1
        return json.dumps(data, indent=2 if pretty else None, ensure_ascii=False)

    def export_txt(
        self,
        export: ConversationExport,
        include_metadata: bool = True,
        anonymize: bool = False
    ) -> str:
        """Export conversation as plain text.

        Args:
            export: Conversation export data
            include_metadata: If True, include header with metadata
            anonymize: If True, replace user_id with "User"

        Returns:
            Plain text string
        """
        lines = []

        if include_metadata:
            lines.append("=" * 60)
            lines.append("CONVERSATION EXPORT - EVA")
            lines.append("=" * 60)
            lines.append("")
            lines.append(f"Session: {export.session_id}")
            if not anonymize and export.user_id:
                lines.append(f"User: {export.user_id}")
            lines.append(f"Started: {datetime.fromtimestamp(export.started_at).strftime('%Y-%m-%d %H:%M:%S')}")
            lines.append(f"Ended: {datetime.fromtimestamp(export.ended_at).strftime('%Y-%m-%d %H:%M:%S')}")
            lines.append(f"Messages: {export.total_messages} ({export.user_messages} user, {export.assistant_messages} EVA)")
            if export.avg_latency_ms:
                lines.append(f"Avg. Latency: {export.avg_latency_ms:.0f}ms")
            lines.append("")
            lines.append("-" * 60)
            lines.append("")

        for msg in export.messages:
            timestamp = datetime.fromtimestamp(msg.timestamp).strftime('%H:%M:%S')
            role = "Vous" if msg.role == "user" else "EVA"
            if anonymize and msg.role == "user":
                role = "User"

            emotion_tag = f" [{msg.emotion}]" if msg.emotion and msg.emotion != "neutral" else ""
            lines.append(f"[{timestamp}] {role}{emotion_tag}:")
            lines.append(msg.content)
            lines.append("")

        self.exports_count += 1
        return "\n".join(lines)

    def export_html(
        self,
        export: ConversationExport,
        dark_mode: bool = False
    ) -> str:
        """Export conversation as HTML.

        Args:
            export: Conversation export data
            dark_mode: If True, use dark theme

        Returns:
            HTML string
        """
        bg_color = "#1a1a1a" if dark_mode else "#fff9f0"
        text_color = "#f5f0e8" if dark_mode else "#4a3728"
        eva_bg = "#2d4a5e" if dark_mode else "#f0e6d8"
        user_bg = "#5e4a2d" if dark_mode else "#e8dcd0"
        coral = "#d4886a"

        html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conversation avec EVA</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: {bg_color};
            color: {text_color};
            line-height: 1.6;
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
        }}
        .header {{
            text-align: center;
            padding: 30px 0;
            border-bottom: 1px solid {coral};
            margin-bottom: 30px;
        }}
        .header h1 {{
            color: {coral};
            font-weight: 300;
            font-size: 24px;
        }}
        .meta {{
            font-size: 14px;
            opacity: 0.8;
            margin-top: 10px;
        }}
        .messages {{ display: flex; flex-direction: column; gap: 15px; }}
        .message {{
            padding: 15px 20px;
            border-radius: 20px;
            max-width: 80%;
        }}
        .user {{
            background: {user_bg};
            margin-left: auto;
            border-bottom-right-radius: 5px;
        }}
        .assistant {{
            background: {eva_bg};
            margin-right: auto;
            border-bottom-left-radius: 5px;
        }}
        .role {{
            font-size: 12px;
            font-weight: 600;
            color: {coral};
            margin-bottom: 5px;
        }}
        .time {{
            font-size: 11px;
            opacity: 0.6;
            margin-top: 8px;
        }}
        .emotion {{
            display: inline-block;
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 10px;
            background: {coral}40;
            margin-left: 5px;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>Conversation avec EVA</h1>
        <div class="meta">
            {datetime.fromtimestamp(export.started_at).strftime('%d/%m/%Y %H:%M')} -
            {export.total_messages} messages
        </div>
    </div>
    <div class="messages">
"""

        for msg in export.messages:
            role_class = msg.role
            role_name = "Vous" if msg.role == "user" else "EVA"
            timestamp = datetime.fromtimestamp(msg.timestamp).strftime('%H:%M')
            emotion_html = f'<span class="emotion">{msg.emotion}</span>' if msg.emotion and msg.emotion != "neutral" else ""

            # Escape HTML in content
            content = msg.content.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br>")

            html += f"""        <div class="message {role_class}">
            <div class="role">{role_name}{emotion_html}</div>
            <div class="content">{content}</div>
            <div class="time">{timestamp}</div>
        </div>
"""

        html += """    </div>
</body>
</html>"""

        self.exports_count += 1
        return html

    def export_markdown(
        self,
        export: ConversationExport,
        include_metadata: bool = True
    ) -> str:
        """Export conversation as Markdown.

        Args:
            export: Conversation export data
            include_metadata: If True, include header with metadata

        Returns:
            Markdown string
        """
        lines = []

        if include_metadata:
            lines.append("# Conversation avec EVA")
            lines.append("")
            lines.append(f"**Session:** `{export.session_id}`  ")
            lines.append(f"**Date:** {datetime.fromtimestamp(export.started_at).strftime('%Y-%m-%d %H:%M')}  ")
            lines.append(f"**Messages:** {export.total_messages}")
            if export.avg_latency_ms:
                lines.append(f"  \n**Latence moyenne:** {export.avg_latency_ms:.0f}ms")
            lines.append("")
            lines.append("---")
            lines.append("")

        for msg in export.messages:
            timestamp = datetime.fromtimestamp(msg.timestamp).strftime('%H:%M')
            role = "**Vous**" if msg.role == "user" else "**EVA**"
            emotion = f" *({msg.emotion})*" if msg.emotion and msg.emotion != "neutral" else ""

            lines.append(f"### {role}{emotion}")
            lines.append(f"*{timestamp}*")
            lines.append("")
            lines.append(msg.content)
            lines.append("")

        self.exports_count += 1
        return "\n".join(lines)

    def export(
        self,
        messages: List[Dict[str, Any]],
        session_id: str,
        user_id: Optional[str] = None,
        format: ExportFormat = ExportFormat.JSON,
        **kwargs
    ) -> str:
        """Export conversation in specified format.

        Args:
            messages: List of message dictionaries
            session_id: Session identifier
            user_id: Optional user identifier
            format: Export format
            **kwargs: Format-specific options

        Returns:
            Exported string in specified format
        """
        # Convert messages to Message objects
        msg_objects = []
        for m in messages:
            msg_objects.append(Message(
                role=m.get("role", "user"),
                content=m.get("content", ""),
                timestamp=m.get("timestamp", time.time()),
                emotion=m.get("emotion"),
                voice_used=m.get("voice_used"),
                latency_ms=m.get("latency_ms"),
            ))

        # Calculate statistics
        user_msgs = [m for m in msg_objects if m.role == "user"]
        assistant_msgs = [m for m in msg_objects if m.role == "assistant"]
        latencies = [m.latency_ms for m in assistant_msgs if m.latency_ms]
        emotions: Dict[str, int] = {}
        for m in msg_objects:
            if m.emotion:
                emotions[m.emotion] = emotions.get(m.emotion, 0) + 1

        export = ConversationExport(
            session_id=session_id,
            user_id=user_id,
            messages=msg_objects,
            started_at=msg_objects[0].timestamp if msg_objects else time.time(),
            ended_at=msg_objects[-1].timestamp if msg_objects else time.time(),
            total_messages=len(msg_objects),
            user_messages=len(user_msgs),
            assistant_messages=len(assistant_msgs),
            avg_latency_ms=sum(latencies) / len(latencies) if latencies else None,
            emotions_detected=emotions if emotions else None,
            export_format=format.value,
        )

        if format == ExportFormat.JSON:
            return self.export_json(export, **kwargs)
        elif format == ExportFormat.TXT:
            return self.export_txt(export, **kwargs)
        elif format == ExportFormat.HTML:
            return self.export_html(export, **kwargs)
        elif format == ExportFormat.MARKDOWN:
            return self.export_markdown(export, **kwargs)
        else:
            return self.export_json(export)

    def get_stats(self) -> Dict[str, Any]:
        """Get exporter statistics."""
        return {
            "total_exports": self.exports_count,
        }


# Singleton instance
conversation_exporter = ConversationExporter()
