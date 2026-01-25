"""
Dependency Injection Container - Sprint 731

Dependency injection for clean architecture.

Features:
- Service registration
- Lifecycle management
- Scoped dependencies
- Lazy loading
- Circular dependency detection
"""

import inspect
import threading
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Type, Generic,
    get_type_hints, Union
)
from enum import Enum
from abc import ABC, abstractmethod
import weakref


T = TypeVar("T")


class Lifecycle(str, Enum):
    """Service lifecycle types."""
    TRANSIENT = "transient"  # New instance every time
    SINGLETON = "singleton"  # Single instance
    SCOPED = "scoped"        # Per-scope instance


@dataclass
class ServiceDescriptor:
    """Service registration descriptor."""
    service_type: Type
    implementation: Optional[Type] = None
    factory: Optional[Callable[..., Any]] = None
    instance: Optional[Any] = None
    lifecycle: Lifecycle = Lifecycle.TRANSIENT
    dependencies: List[Type] = field(default_factory=list)


class ServiceScope:
    """Scoped service container.

    Usage:
        with container.create_scope() as scope:
            service = scope.resolve(MyService)
            # Service instance is cached within this scope
    """

    def __init__(self, container: "Container"):
        """Initialize scope."""
        self._container = container
        self._instances: Dict[Type, Any] = {}
        self._lock = threading.Lock()

    def resolve(self, service_type: Type[T]) -> T:
        """Resolve service within scope."""
        with self._lock:
            if service_type in self._instances:
                return self._instances[service_type]

            instance = self._container._create_instance(service_type, self)
            descriptor = self._container._services.get(service_type)

            if descriptor and descriptor.lifecycle == Lifecycle.SCOPED:
                self._instances[service_type] = instance

            return instance

    def __enter__(self) -> "ServiceScope":
        """Enter scope context."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Exit scope context."""
        self._instances.clear()


class Container:
    """Dependency injection container.

    Usage:
        container = Container()

        # Register services
        container.register_singleton(ILogger, ConsoleLogger)
        container.register_transient(IRepository, SqlRepository)
        container.register_factory(Config, lambda: Config.load())

        # Resolve
        logger = container.resolve(ILogger)

        # With scope
        with container.create_scope() as scope:
            service = scope.resolve(MyScopedService)
    """

    def __init__(self):
        """Initialize container."""
        self._services: Dict[Type, ServiceDescriptor] = {}
        self._singletons: Dict[Type, Any] = {}
        self._lock = threading.Lock()
        self._resolving: set = set()  # For circular dependency detection

    def register(
        self,
        service_type: Type,
        implementation: Optional[Type] = None,
        lifecycle: Lifecycle = Lifecycle.TRANSIENT,
    ) -> "Container":
        """Register a service.

        Args:
            service_type: Service interface/type
            implementation: Implementation class
            lifecycle: Service lifecycle

        Returns:
            Self for chaining
        """
        impl = implementation or service_type
        dependencies = self._extract_dependencies(impl)

        descriptor = ServiceDescriptor(
            service_type=service_type,
            implementation=impl,
            lifecycle=lifecycle,
            dependencies=dependencies,
        )

        with self._lock:
            self._services[service_type] = descriptor

        return self

    def register_singleton(
        self,
        service_type: Type,
        implementation: Optional[Type] = None,
    ) -> "Container":
        """Register as singleton."""
        return self.register(service_type, implementation, Lifecycle.SINGLETON)

    def register_transient(
        self,
        service_type: Type,
        implementation: Optional[Type] = None,
    ) -> "Container":
        """Register as transient."""
        return self.register(service_type, implementation, Lifecycle.TRANSIENT)

    def register_scoped(
        self,
        service_type: Type,
        implementation: Optional[Type] = None,
    ) -> "Container":
        """Register as scoped."""
        return self.register(service_type, implementation, Lifecycle.SCOPED)

    def register_instance(
        self,
        service_type: Type,
        instance: Any,
    ) -> "Container":
        """Register an existing instance.

        Args:
            service_type: Service type
            instance: Pre-created instance

        Returns:
            Self for chaining
        """
        descriptor = ServiceDescriptor(
            service_type=service_type,
            instance=instance,
            lifecycle=Lifecycle.SINGLETON,
        )

        with self._lock:
            self._services[service_type] = descriptor
            self._singletons[service_type] = instance

        return self

    def register_factory(
        self,
        service_type: Type,
        factory: Callable[..., Any],
        lifecycle: Lifecycle = Lifecycle.TRANSIENT,
    ) -> "Container":
        """Register with factory function.

        Args:
            service_type: Service type
            factory: Factory function
            lifecycle: Service lifecycle

        Returns:
            Self for chaining
        """
        # Extract dependencies from factory signature
        sig = inspect.signature(factory)
        dependencies = []
        for param in sig.parameters.values():
            if param.annotation != inspect.Parameter.empty:
                dependencies.append(param.annotation)

        descriptor = ServiceDescriptor(
            service_type=service_type,
            factory=factory,
            lifecycle=lifecycle,
            dependencies=dependencies,
        )

        with self._lock:
            self._services[service_type] = descriptor

        return self

    def resolve(self, service_type: Type[T]) -> T:
        """Resolve a service.

        Args:
            service_type: Service type to resolve

        Returns:
            Service instance

        Raises:
            KeyError: Service not registered
            ValueError: Circular dependency detected
        """
        return self._create_instance(service_type, None)

    def _create_instance(
        self,
        service_type: Type[T],
        scope: Optional[ServiceScope],
    ) -> T:
        """Create service instance."""
        # Check for circular dependency
        if service_type in self._resolving:
            raise ValueError(f"Circular dependency detected for {service_type}")

        descriptor = self._services.get(service_type)
        if not descriptor:
            raise KeyError(f"Service {service_type} not registered")

        # Return existing instance if applicable
        if descriptor.instance is not None:
            return descriptor.instance

        if descriptor.lifecycle == Lifecycle.SINGLETON:
            if service_type in self._singletons:
                return self._singletons[service_type]

        # Mark as resolving
        self._resolving.add(service_type)

        try:
            # Create instance
            if descriptor.factory:
                instance = self._call_factory(descriptor.factory, scope)
            else:
                instance = self._construct(descriptor.implementation, scope)

            # Store singleton
            if descriptor.lifecycle == Lifecycle.SINGLETON:
                with self._lock:
                    self._singletons[service_type] = instance

            return instance
        finally:
            self._resolving.discard(service_type)

    def _construct(
        self,
        cls: Type,
        scope: Optional[ServiceScope],
    ) -> Any:
        """Construct class with dependencies."""
        # Get constructor signature
        try:
            hints = get_type_hints(cls.__init__)
        except Exception:
            hints = {}

        sig = inspect.signature(cls.__init__)
        kwargs = {}

        for name, param in sig.parameters.items():
            if name == "self":
                continue

            # Get type from hints or annotation
            param_type = hints.get(name, param.annotation)
            if param_type == inspect.Parameter.empty:
                continue

            # Resolve dependency
            if param_type in self._services:
                if scope:
                    kwargs[name] = scope.resolve(param_type)
                else:
                    kwargs[name] = self.resolve(param_type)

        return cls(**kwargs)

    def _call_factory(
        self,
        factory: Callable,
        scope: Optional[ServiceScope],
    ) -> Any:
        """Call factory with resolved dependencies."""
        try:
            hints = get_type_hints(factory)
        except Exception:
            hints = {}

        sig = inspect.signature(factory)
        kwargs = {}

        for name, param in sig.parameters.items():
            param_type = hints.get(name, param.annotation)
            if param_type == inspect.Parameter.empty:
                continue

            if param_type in self._services:
                if scope:
                    kwargs[name] = scope.resolve(param_type)
                else:
                    kwargs[name] = self.resolve(param_type)

        return factory(**kwargs)

    def _extract_dependencies(self, cls: Type) -> List[Type]:
        """Extract dependencies from constructor."""
        if not hasattr(cls, "__init__"):
            return []

        try:
            hints = get_type_hints(cls.__init__)
            return [t for t in hints.values() if t in self._services or isinstance(t, type)]
        except Exception:
            return []

    def create_scope(self) -> ServiceScope:
        """Create a new service scope."""
        return ServiceScope(self)

    def is_registered(self, service_type: Type) -> bool:
        """Check if service is registered."""
        return service_type in self._services

    def get_services(self) -> List[Type]:
        """Get all registered service types."""
        return list(self._services.keys())

    def clear(self) -> None:
        """Clear all registrations."""
        with self._lock:
            self._services.clear()
            self._singletons.clear()


def inject(*dependencies: Type) -> Callable:
    """Decorator to inject dependencies.

    Usage:
        @inject(ILogger, IRepository)
        def my_function(logger, repo):
            logger.log("Hello")
    """
    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            resolved = []
            for dep in dependencies:
                if container.is_registered(dep):
                    resolved.append(container.resolve(dep))
                else:
                    raise KeyError(f"Dependency {dep} not registered")
            return func(*resolved, *args, **kwargs)
        return wrapper
    return decorator


class Injectable:
    """Marker base class for injectable services.

    Usage:
        class MyService(Injectable):
            def __init__(self, logger: ILogger):
                self.logger = logger

        container.auto_register(MyService)
    """
    pass


class ContainerBuilder:
    """Fluent builder for container configuration.

    Usage:
        container = (ContainerBuilder()
            .add_singleton(ILogger, ConsoleLogger)
            .add_transient(IService, ServiceImpl)
            .add_scoped(IRepository, SqlRepository)
            .build())
    """

    def __init__(self):
        """Initialize builder."""
        self._registrations: List[tuple] = []

    def add_singleton(
        self,
        service_type: Type,
        implementation: Optional[Type] = None,
    ) -> "ContainerBuilder":
        """Add singleton registration."""
        self._registrations.append(
            ("singleton", service_type, implementation)
        )
        return self

    def add_transient(
        self,
        service_type: Type,
        implementation: Optional[Type] = None,
    ) -> "ContainerBuilder":
        """Add transient registration."""
        self._registrations.append(
            ("transient", service_type, implementation)
        )
        return self

    def add_scoped(
        self,
        service_type: Type,
        implementation: Optional[Type] = None,
    ) -> "ContainerBuilder":
        """Add scoped registration."""
        self._registrations.append(
            ("scoped", service_type, implementation)
        )
        return self

    def add_instance(
        self,
        service_type: Type,
        instance: Any,
    ) -> "ContainerBuilder":
        """Add instance registration."""
        self._registrations.append(
            ("instance", service_type, instance)
        )
        return self

    def add_factory(
        self,
        service_type: Type,
        factory: Callable,
        lifecycle: Lifecycle = Lifecycle.TRANSIENT,
    ) -> "ContainerBuilder":
        """Add factory registration."""
        self._registrations.append(
            ("factory", service_type, factory, lifecycle)
        )
        return self

    def build(self) -> Container:
        """Build the container."""
        c = Container()

        for reg in self._registrations:
            reg_type = reg[0]

            if reg_type == "singleton":
                c.register_singleton(reg[1], reg[2])
            elif reg_type == "transient":
                c.register_transient(reg[1], reg[2])
            elif reg_type == "scoped":
                c.register_scoped(reg[1], reg[2])
            elif reg_type == "instance":
                c.register_instance(reg[1], reg[2])
            elif reg_type == "factory":
                c.register_factory(reg[1], reg[2], reg[3])

        return c


# Singleton global container
container = Container()


# Convenience functions
def register_singleton(service_type: Type, implementation: Optional[Type] = None) -> None:
    """Register singleton in global container."""
    container.register_singleton(service_type, implementation)


def register_transient(service_type: Type, implementation: Optional[Type] = None) -> None:
    """Register transient in global container."""
    container.register_transient(service_type, implementation)


def register_scoped(service_type: Type, implementation: Optional[Type] = None) -> None:
    """Register scoped in global container."""
    container.register_scoped(service_type, implementation)


def resolve(service_type: Type[T]) -> T:
    """Resolve from global container."""
    return container.resolve(service_type)


def create_scope() -> ServiceScope:
    """Create scope from global container."""
    return container.create_scope()
