"""
Email Sender - Sprint 751

Email sending system with templates.

Features:
- SMTP support
- Template rendering
- Attachments
- Async sending
- Queue support
"""

import smtplib
import asyncio
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union, Awaitable
)
from enum import Enum
from abc import ABC, abstractmethod
from pathlib import Path
import time
import re
import html


T = TypeVar("T")


class EmailPriority(str, Enum):
    """Email priority levels."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"


@dataclass
class EmailAddress:
    """Email address with optional name."""
    email: str
    name: str = ""

    def __str__(self) -> str:
        if self.name:
            return f'"{self.name}" <{self.email}>'
        return self.email


@dataclass
class Attachment:
    """Email attachment."""
    filename: str
    content: bytes
    mime_type: str = "application/octet-stream"


@dataclass
class EmailMessage:
    """Email message."""
    to: List[EmailAddress]
    subject: str
    body: str
    html_body: Optional[str] = None
    from_addr: Optional[EmailAddress] = None
    cc: List[EmailAddress] = field(default_factory=list)
    bcc: List[EmailAddress] = field(default_factory=list)
    reply_to: Optional[EmailAddress] = None
    attachments: List[Attachment] = field(default_factory=list)
    headers: Dict[str, str] = field(default_factory=dict)
    priority: EmailPriority = EmailPriority.NORMAL
    created_at: float = field(default_factory=time.time)

    def add_attachment(
        self,
        filename: str,
        content: bytes,
        mime_type: str = "application/octet-stream",
    ) -> None:
        """Add attachment to email."""
        self.attachments.append(Attachment(filename, content, mime_type))

    def add_attachment_from_file(self, filepath: str) -> None:
        """Add attachment from file path."""
        path = Path(filepath)
        with open(path, "rb") as f:
            content = f.read()
        self.attachments.append(Attachment(path.name, content))


@dataclass
class SendResult:
    """Email send result."""
    success: bool
    message_id: Optional[str] = None
    error: Optional[str] = None
    timestamp: float = field(default_factory=time.time)


class EmailTemplate:
    """Email template with variable substitution.

    Usage:
        template = EmailTemplate(
            subject="Welcome, {{name}}!",
            body="Hello {{name}}, thank you for joining.",
            html_body="<h1>Welcome {{name}}!</h1>"
        )

        email = template.render(name="John")
    """

    def __init__(
        self,
        subject: str,
        body: str,
        html_body: Optional[str] = None,
        default_values: Optional[Dict[str, Any]] = None,
    ):
        self.subject = subject
        self.body = body
        self.html_body = html_body
        self.default_values = default_values or {}

    def render(
        self,
        to: Union[str, EmailAddress, List[Union[str, EmailAddress]]],
        **kwargs: Any,
    ) -> EmailMessage:
        """Render template with variables."""
        values = {**self.default_values, **kwargs}

        # Render subject
        subject = self._interpolate(self.subject, values)

        # Render body
        body = self._interpolate(self.body, values)

        # Render HTML body
        html_body = None
        if self.html_body:
            html_body = self._interpolate(self.html_body, values, escape_html=True)

        # Normalize recipients
        recipients = to if isinstance(to, list) else [to]
        to_addrs = [
            EmailAddress(r) if isinstance(r, str) else r
            for r in recipients
        ]

        return EmailMessage(
            to=to_addrs,
            subject=subject,
            body=body,
            html_body=html_body,
        )

    def _interpolate(
        self,
        text: str,
        values: Dict[str, Any],
        escape_html: bool = False,
    ) -> str:
        """Interpolate variables in text."""
        def replace(match: re.Match) -> str:
            key = match.group(1)
            value = values.get(key, match.group(0))
            if escape_html:
                return html.escape(str(value))
            return str(value)

        return re.sub(r"\{\{(\w+)\}\}", replace, text)


class EmailSender(ABC):
    """Base email sender."""

    @abstractmethod
    async def send(self, message: EmailMessage) -> SendResult:
        """Send email message."""
        pass


class SMTPSender(EmailSender):
    """SMTP email sender.

    Usage:
        sender = SMTPSender(
            host="smtp.gmail.com",
            port=587,
            username="user@gmail.com",
            password="app-password",
            use_tls=True,
        )

        result = await sender.send(email)
    """

    def __init__(
        self,
        host: str,
        port: int = 587,
        username: Optional[str] = None,
        password: Optional[str] = None,
        use_tls: bool = True,
        use_ssl: bool = False,
        timeout: float = 30.0,
        default_from: Optional[EmailAddress] = None,
    ):
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._use_tls = use_tls
        self._use_ssl = use_ssl
        self._timeout = timeout
        self._default_from = default_from

    def _build_mime(self, message: EmailMessage) -> MIMEMultipart:
        """Build MIME message."""
        mime = MIMEMultipart("alternative" if message.html_body else "mixed")

        # Headers
        from_addr = message.from_addr or self._default_from
        if from_addr:
            mime["From"] = str(from_addr)
        mime["To"] = ", ".join(str(addr) for addr in message.to)
        mime["Subject"] = message.subject

        if message.cc:
            mime["Cc"] = ", ".join(str(addr) for addr in message.cc)

        if message.reply_to:
            mime["Reply-To"] = str(message.reply_to)

        # Priority
        if message.priority == EmailPriority.HIGH:
            mime["X-Priority"] = "1"
            mime["Importance"] = "high"
        elif message.priority == EmailPriority.LOW:
            mime["X-Priority"] = "5"
            mime["Importance"] = "low"

        # Custom headers
        for key, value in message.headers.items():
            mime[key] = value

        # Body
        mime.attach(MIMEText(message.body, "plain"))

        if message.html_body:
            mime.attach(MIMEText(message.html_body, "html"))

        # Attachments
        for attachment in message.attachments:
            part = MIMEBase(*attachment.mime_type.split("/", 1))
            part.set_payload(attachment.content)
            encoders.encode_base64(part)
            part.add_header(
                "Content-Disposition",
                f'attachment; filename="{attachment.filename}"',
            )
            mime.attach(part)

        return mime

    async def send(self, message: EmailMessage) -> SendResult:
        """Send email via SMTP."""
        try:
            mime = self._build_mime(message)

            # Get all recipients
            recipients = [addr.email for addr in message.to]
            recipients.extend(addr.email for addr in message.cc)
            recipients.extend(addr.email for addr in message.bcc)

            # Run in thread pool
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                self._send_sync,
                mime,
                recipients,
            )

            return SendResult(
                success=True,
                message_id=mime.get("Message-ID"),
            )

        except Exception as e:
            return SendResult(
                success=False,
                error=str(e),
            )

    def _send_sync(self, mime: MIMEMultipart, recipients: List[str]) -> None:
        """Synchronous send."""
        if self._use_ssl:
            server = smtplib.SMTP_SSL(self._host, self._port, timeout=self._timeout)
        else:
            server = smtplib.SMTP(self._host, self._port, timeout=self._timeout)

        try:
            if self._use_tls and not self._use_ssl:
                server.starttls()

            if self._username and self._password:
                server.login(self._username, self._password)

            from_addr = mime["From"] or self._username
            server.sendmail(from_addr, recipients, mime.as_string())

        finally:
            server.quit()


class MockSender(EmailSender):
    """Mock sender for testing."""

    def __init__(self):
        self.sent: List[EmailMessage] = []

    async def send(self, message: EmailMessage) -> SendResult:
        self.sent.append(message)
        return SendResult(success=True, message_id="mock-id")

    def clear(self) -> None:
        self.sent.clear()


class EmailQueue:
    """Email queue for background sending.

    Usage:
        queue = EmailQueue(sender)
        queue.start()

        queue.enqueue(email1)
        queue.enqueue(email2)

        queue.stop()
    """

    def __init__(
        self,
        sender: EmailSender,
        max_retries: int = 3,
        retry_delay: float = 60.0,
    ):
        self._sender = sender
        self._max_retries = max_retries
        self._retry_delay = retry_delay
        self._queue: List[tuple] = []
        self._lock = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._results: Dict[int, SendResult] = {}

    def enqueue(
        self,
        message: EmailMessage,
        priority: EmailPriority = EmailPriority.NORMAL,
    ) -> int:
        """Add email to queue."""
        with self._lock:
            message_id = id(message)
            self._queue.append((message_id, message, priority, 0))
            # Sort by priority
            self._queue.sort(key=lambda x: x[2].value)
            return message_id

    def get_result(self, message_id: int) -> Optional[SendResult]:
        """Get send result for message."""
        return self._results.get(message_id)

    def _worker(self) -> None:
        """Queue worker."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        while self._running:
            message_id = None
            message = None
            retries = 0

            with self._lock:
                if self._queue:
                    message_id, message, _, retries = self._queue.pop(0)

            if message:
                result = loop.run_until_complete(self._sender.send(message))
                self._results[message_id] = result

                if not result.success and retries < self._max_retries:
                    with self._lock:
                        self._queue.append((
                            message_id,
                            message,
                            message.priority,
                            retries + 1,
                        ))
                    time.sleep(self._retry_delay)
            else:
                time.sleep(0.1)

        loop.close()

    def start(self) -> None:
        """Start queue processing."""
        if self._running:
            return

        self._running = True
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """Stop queue processing."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5.0)

    @property
    def pending_count(self) -> int:
        """Get pending email count."""
        return len(self._queue)


# Singleton instances
_sender: Optional[EmailSender] = None


def configure_sender(
    host: str,
    port: int = 587,
    username: Optional[str] = None,
    password: Optional[str] = None,
    use_tls: bool = True,
    default_from: Optional[EmailAddress] = None,
) -> None:
    """Configure global email sender."""
    global _sender
    _sender = SMTPSender(
        host=host,
        port=port,
        username=username,
        password=password,
        use_tls=use_tls,
        default_from=default_from,
    )


async def send_email(
    to: Union[str, EmailAddress, List[Union[str, EmailAddress]]],
    subject: str,
    body: str,
    html_body: Optional[str] = None,
    attachments: Optional[List[Attachment]] = None,
) -> SendResult:
    """Send email using global sender."""
    if not _sender:
        return SendResult(success=False, error="Email sender not configured")

    recipients = to if isinstance(to, list) else [to]
    to_addrs = [
        EmailAddress(r) if isinstance(r, str) else r
        for r in recipients
    ]

    message = EmailMessage(
        to=to_addrs,
        subject=subject,
        body=body,
        html_body=html_body,
        attachments=attachments or [],
    )

    return await _sender.send(message)
