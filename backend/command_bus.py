"""
Command Bus - Sprint 685

CQRS command handling pattern.

Features:
- Command registration
- Handler resolution
- Middleware support
- Async handlers
- Command validation
"""

import time
import asyncio
from dataclasses import dataclass, field
from typing import (
    Dict, Any, Optional, Callable, TypeVar, Type, Generic,
    List, Awaitable, Union
)
from abc import ABC, abstractmethod
import threading
from functools import wraps


# Type variables
TCommand = TypeVar("TCommand", bound="Command")
TResult = TypeVar("TResult")


@dataclass
class Command(ABC):
    """Base command class.

    All commands should inherit from this.

    Usage:
        @dataclass
        class CreateUserCommand(Command):
            email: str
            name: str
    """
    pass


@dataclass
class CommandResult(Generic[TResult]):
    """Command execution result."""
    success: bool
    data: Optional[TResult] = None
    error: Optional[str] = None
    execution_time: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


class CommandHandler(ABC, Generic[TCommand, TResult]):
    """Base command handler.

    Usage:
        class CreateUserHandler(CommandHandler[CreateUserCommand, User]):
            async def handle(self, command: CreateUserCommand) -> User:
                return await create_user(command.email, command.name)
    """

    @abstractmethod
    async def handle(self, command: TCommand) -> TResult:
        """Handle the command."""
        pass


class CommandMiddleware(ABC):
    """Command middleware base class."""

    @abstractmethod
    async def execute(
        self,
        command: Command,
        next_handler: Callable[[Command], Awaitable[Any]],
    ) -> Any:
        """Execute middleware."""
        pass


class CommandBus:
    """Command bus for CQRS pattern.

    Usage:
        bus = CommandBus()

        # Register handler class
        bus.register(CreateUserCommand, CreateUserHandler)

        # Register handler function
        @bus.handler(DeleteUserCommand)
        async def delete_user(command: DeleteUserCommand):
            await user_service.delete(command.user_id)

        # Add middleware
        bus.use(LoggingMiddleware())
        bus.use(ValidationMiddleware())

        # Execute command
        result = await bus.execute(CreateUserCommand(email="test@example.com", name="John"))
    """

    def __init__(self):
        """Initialize command bus."""
        self._handlers: Dict[Type[Command], Callable] = {}
        self._middlewares: List[CommandMiddleware] = []
        self._lock = threading.Lock()
        self._stats = {
            "total_commands": 0,
            "successful": 0,
            "failed": 0,
        }

    def register(
        self,
        command_type: Type[TCommand],
        handler: Union[Type[CommandHandler], Callable],
    ) -> "CommandBus":
        """Register command handler.

        Args:
            command_type: Command class
            handler: Handler class or function

        Returns:
            Self for chaining
        """
        if isinstance(handler, type) and issubclass(handler, CommandHandler):
            # Handler class - instantiate it
            handler_instance = handler()
            handler_func = handler_instance.handle
        else:
            handler_func = handler

        with self._lock:
            self._handlers[command_type] = handler_func

        return self

    def handler(
        self,
        command_type: Type[TCommand],
    ) -> Callable:
        """Decorator for registering handler function.

        Usage:
            @bus.handler(MyCommand)
            async def handle_my_command(command: MyCommand):
                pass
        """
        def decorator(func: Callable) -> Callable:
            self.register(command_type, func)
            return func
        return decorator

    def use(self, middleware: CommandMiddleware) -> "CommandBus":
        """Add middleware.

        Args:
            middleware: Middleware instance

        Returns:
            Self for chaining
        """
        self._middlewares.append(middleware)
        return self

    async def execute(
        self,
        command: TCommand,
    ) -> CommandResult:
        """Execute command.

        Args:
            command: Command to execute

        Returns:
            Command result
        """
        start_time = time.time()
        self._stats["total_commands"] += 1

        command_type = type(command)
        handler = self._handlers.get(command_type)

        if not handler:
            self._stats["failed"] += 1
            return CommandResult(
                success=False,
                error=f"No handler registered for {command_type.__name__}",
                execution_time=time.time() - start_time,
            )

        try:
            # Build middleware chain
            async def final_handler(cmd: Command) -> Any:
                if asyncio.iscoroutinefunction(handler):
                    return await handler(cmd)
                return handler(cmd)

            chain = final_handler
            for middleware in reversed(self._middlewares):
                chain = self._wrap_middleware(middleware, chain)

            # Execute
            result = await chain(command)

            self._stats["successful"] += 1
            return CommandResult(
                success=True,
                data=result,
                execution_time=time.time() - start_time,
            )

        except Exception as e:
            self._stats["failed"] += 1
            return CommandResult(
                success=False,
                error=str(e),
                execution_time=time.time() - start_time,
            )

    def _wrap_middleware(
        self,
        middleware: CommandMiddleware,
        next_handler: Callable,
    ) -> Callable:
        """Wrap middleware around handler."""
        async def wrapper(command: Command) -> Any:
            return await middleware.execute(command, next_handler)
        return wrapper

    def execute_sync(self, command: TCommand) -> CommandResult:
        """Synchronous execute."""
        return asyncio.run(self.execute(command))

    def get_handler(self, command_type: Type[Command]) -> Optional[Callable]:
        """Get handler for command type."""
        return self._handlers.get(command_type)

    def has_handler(self, command_type: Type[Command]) -> bool:
        """Check if handler exists."""
        return command_type in self._handlers

    def get_stats(self) -> dict:
        """Get execution statistics."""
        return {
            **self._stats,
            "registered_handlers": len(self._handlers),
            "middlewares": len(self._middlewares),
        }

    def list_commands(self) -> List[str]:
        """List registered command types."""
        return [cmd.__name__ for cmd in self._handlers.keys()]


class LoggingMiddleware(CommandMiddleware):
    """Middleware for logging commands."""

    def __init__(self, logger: Optional[Callable[[str], None]] = None):
        self.logger = logger or print

    async def execute(
        self,
        command: Command,
        next_handler: Callable[[Command], Awaitable[Any]],
    ) -> Any:
        command_name = type(command).__name__
        self.logger(f"[Command] Executing: {command_name}")
        start = time.time()

        try:
            result = await next_handler(command)
            duration = time.time() - start
            self.logger(f"[Command] Completed: {command_name} ({duration:.3f}s)")
            return result
        except Exception as e:
            duration = time.time() - start
            self.logger(f"[Command] Failed: {command_name} ({duration:.3f}s) - {e}")
            raise


class ValidationMiddleware(CommandMiddleware):
    """Middleware for command validation."""

    def __init__(self, validators: Optional[Dict[Type[Command], Callable]] = None):
        self.validators = validators or {}

    def add_validator(
        self,
        command_type: Type[Command],
        validator: Callable[[Command], Optional[str]],
    ):
        """Add validator for command type."""
        self.validators[command_type] = validator

    async def execute(
        self,
        command: Command,
        next_handler: Callable[[Command], Awaitable[Any]],
    ) -> Any:
        command_type = type(command)
        validator = self.validators.get(command_type)

        if validator:
            error = validator(command)
            if error:
                raise CommandValidationError(error)

        return await next_handler(command)


class RetryMiddleware(CommandMiddleware):
    """Middleware for retrying failed commands."""

    def __init__(
        self,
        max_retries: int = 3,
        delay: float = 1.0,
        backoff: float = 2.0,
    ):
        self.max_retries = max_retries
        self.delay = delay
        self.backoff = backoff

    async def execute(
        self,
        command: Command,
        next_handler: Callable[[Command], Awaitable[Any]],
    ) -> Any:
        last_error = None
        delay = self.delay

        for attempt in range(self.max_retries + 1):
            try:
                return await next_handler(command)
            except Exception as e:
                last_error = e
                if attempt < self.max_retries:
                    await asyncio.sleep(delay)
                    delay *= self.backoff

        raise last_error


class TimeoutMiddleware(CommandMiddleware):
    """Middleware for command timeout."""

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout

    async def execute(
        self,
        command: Command,
        next_handler: Callable[[Command], Awaitable[Any]],
    ) -> Any:
        try:
            return await asyncio.wait_for(
                next_handler(command),
                timeout=self.timeout,
            )
        except asyncio.TimeoutError:
            raise CommandTimeoutError(
                f"Command {type(command).__name__} timed out after {self.timeout}s"
            )


class TransactionMiddleware(CommandMiddleware):
    """Middleware for transaction handling."""

    def __init__(
        self,
        begin: Callable[[], Awaitable[None]],
        commit: Callable[[], Awaitable[None]],
        rollback: Callable[[], Awaitable[None]],
    ):
        self.begin = begin
        self.commit = commit
        self.rollback = rollback

    async def execute(
        self,
        command: Command,
        next_handler: Callable[[Command], Awaitable[Any]],
    ) -> Any:
        await self.begin()
        try:
            result = await next_handler(command)
            await self.commit()
            return result
        except Exception:
            await self.rollback()
            raise


class CommandValidationError(Exception):
    """Raised when command validation fails."""
    pass


class CommandTimeoutError(Exception):
    """Raised when command times out."""
    pass


# Singleton instance
command_bus = CommandBus()


# Convenience decorators
def command_handler(command_type: Type[TCommand]) -> Callable:
    """Decorator to register handler on global bus.

    Usage:
        @command_handler(CreateUserCommand)
        async def create_user(command: CreateUserCommand):
            return await user_service.create(command)
    """
    return command_bus.handler(command_type)


# Helper function
async def dispatch(command: Command) -> CommandResult:
    """Dispatch command to global bus."""
    return await command_bus.execute(command)
