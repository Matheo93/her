"""
Service Locator - Sprint 683

Service discovery and dependency resolution.

Features:
- Service registration
- Lazy initialization
- Scoped services
- Factory pattern
- Lifecycle management
"""

import time
import asyncio
from dataclasses import dataclass, field
from typing import (
    Dict, Any, Optional, Callable, TypeVar, Type, Generic,
    Union, Awaitable
)
from enum import Enum
import threading
from functools import wraps
from contextlib import contextmanager


class ServiceLifetime(str, Enum):
    """Service lifetime scope."""
    SINGLETON = "singleton"  # One instance for all
    TRANSIENT = "transient"  # New instance each time
    SCOPED = "scoped"  # One per scope


T = TypeVar("T")


@dataclass
class ServiceDescriptor(Generic[T]):
    """Service registration descriptor."""
    service_type: Type[T]
    implementation: Optional[Type[T]] = None
    factory: Optional[Callable[[], T]] = None
    instance: Optional[T] = None
    lifetime: ServiceLifetime = ServiceLifetime.SINGLETON
    name: Optional[str] = None
    created_at: Optional[float] = None


class ServiceLocator:
    """Service discovery and dependency resolution.

    Usage:
        locator = ServiceLocator()

        # Register singleton
        locator.register(DatabaseService)

        # Register with interface
        locator.register(ICache, implementation=RedisCache)

        # Register factory
        locator.register(Logger, factory=lambda: Logger(level="INFO"))

        # Resolve
        db = locator.resolve(DatabaseService)
        cache = locator.resolve(ICache)

        # Named services
        locator.register(Database, name="primary")
        locator.register(Database, name="replica", factory=replica_factory)
        primary = locator.resolve(Database, name="primary")

        # Scoped services
        with locator.scope() as scope:
            service = scope.resolve(RequestService)
    """

    def __init__(self):
        """Initialize service locator."""
        self._services: Dict[tuple, ServiceDescriptor] = {}
        self._lock = threading.Lock()
        self._stats = {
            "registrations": 0,
            "resolutions": 0,
            "cache_hits": 0,
            "created_instances": 0,
        }

    def register(
        self,
        service_type: Type[T],
        implementation: Optional[Type[T]] = None,
        factory: Optional[Callable[[], T]] = None,
        instance: Optional[T] = None,
        lifetime: ServiceLifetime = ServiceLifetime.SINGLETON,
        name: Optional[str] = None,
    ) -> "ServiceLocator":
        """Register service.

        Args:
            service_type: Service type/interface
            implementation: Implementation class
            factory: Factory function
            instance: Pre-created instance
            lifetime: Service lifetime
            name: Optional name for named services

        Returns:
            Self for chaining
        """
        key = (service_type, name)

        descriptor = ServiceDescriptor(
            service_type=service_type,
            implementation=implementation or (service_type if not factory and not instance else None),
            factory=factory,
            instance=instance,
            lifetime=lifetime,
            name=name,
            created_at=time.time() if instance else None,
        )

        with self._lock:
            self._services[key] = descriptor
            self._stats["registrations"] += 1

        return self

    def register_singleton(
        self,
        service_type: Type[T],
        implementation: Optional[Type[T]] = None,
        factory: Optional[Callable[[], T]] = None,
        name: Optional[str] = None,
    ) -> "ServiceLocator":
        """Register singleton service."""
        return self.register(
            service_type, implementation, factory,
            lifetime=ServiceLifetime.SINGLETON, name=name
        )

    def register_transient(
        self,
        service_type: Type[T],
        implementation: Optional[Type[T]] = None,
        factory: Optional[Callable[[], T]] = None,
        name: Optional[str] = None,
    ) -> "ServiceLocator":
        """Register transient service."""
        return self.register(
            service_type, implementation, factory,
            lifetime=ServiceLifetime.TRANSIENT, name=name
        )

    def register_scoped(
        self,
        service_type: Type[T],
        implementation: Optional[Type[T]] = None,
        factory: Optional[Callable[[], T]] = None,
        name: Optional[str] = None,
    ) -> "ServiceLocator":
        """Register scoped service."""
        return self.register(
            service_type, implementation, factory,
            lifetime=ServiceLifetime.SCOPED, name=name
        )

    def register_instance(
        self,
        service_type: Type[T],
        instance: T,
        name: Optional[str] = None,
    ) -> "ServiceLocator":
        """Register pre-created instance."""
        return self.register(
            service_type, instance=instance,
            lifetime=ServiceLifetime.SINGLETON, name=name
        )

    def resolve(
        self,
        service_type: Type[T],
        name: Optional[str] = None,
    ) -> T:
        """Resolve service.

        Args:
            service_type: Service type to resolve
            name: Optional service name

        Returns:
            Service instance

        Raises:
            ServiceNotFoundError: If service not registered
        """
        key = (service_type, name)

        with self._lock:
            self._stats["resolutions"] += 1

            descriptor = self._services.get(key)
            if not descriptor:
                raise ServiceNotFoundError(
                    f"Service not found: {service_type.__name__}"
                    + (f" (name={name})" if name else "")
                )

            return self._get_instance(descriptor)

    def _get_instance(self, descriptor: ServiceDescriptor[T]) -> T:
        """Get or create instance."""
        # Return existing singleton
        if descriptor.lifetime == ServiceLifetime.SINGLETON and descriptor.instance:
            self._stats["cache_hits"] += 1
            return descriptor.instance

        # Create new instance
        instance = self._create_instance(descriptor)

        # Cache singleton
        if descriptor.lifetime == ServiceLifetime.SINGLETON:
            descriptor.instance = instance
            descriptor.created_at = time.time()

        return instance

    def _create_instance(self, descriptor: ServiceDescriptor[T]) -> T:
        """Create new instance."""
        self._stats["created_instances"] += 1

        if descriptor.instance:
            return descriptor.instance

        if descriptor.factory:
            return descriptor.factory()

        if descriptor.implementation:
            return descriptor.implementation()

        raise ServiceCreationError(
            f"Cannot create instance for {descriptor.service_type.__name__}: "
            "no factory, implementation, or instance provided"
        )

    def try_resolve(
        self,
        service_type: Type[T],
        name: Optional[str] = None,
        default: Optional[T] = None,
    ) -> Optional[T]:
        """Try to resolve service, return default if not found."""
        try:
            return self.resolve(service_type, name)
        except ServiceNotFoundError:
            return default

    def is_registered(
        self,
        service_type: Type[T],
        name: Optional[str] = None,
    ) -> bool:
        """Check if service is registered."""
        return (service_type, name) in self._services

    def unregister(
        self,
        service_type: Type[T],
        name: Optional[str] = None,
    ) -> bool:
        """Unregister service."""
        key = (service_type, name)
        with self._lock:
            return self._services.pop(key, None) is not None

    @contextmanager
    def scope(self):
        """Create scoped context for scoped services."""
        scope = ServiceScope(self)
        try:
            yield scope
        finally:
            scope.dispose()

    def get_services(self, service_type: Type[T]) -> list:
        """Get all services of type (including named)."""
        return [
            (desc.name, self._get_instance(desc))
            for key, desc in self._services.items()
            if key[0] == service_type
        ]

    def get_stats(self) -> dict:
        """Get locator statistics."""
        return {
            **self._stats,
            "registered_services": len(self._services),
            "singletons": sum(
                1 for d in self._services.values()
                if d.lifetime == ServiceLifetime.SINGLETON
            ),
            "cached_instances": sum(
                1 for d in self._services.values()
                if d.instance is not None
            ),
        }

    def list_services(self) -> list:
        """List all registered services."""
        return [
            {
                "type": desc.service_type.__name__,
                "name": desc.name,
                "lifetime": desc.lifetime.value,
                "has_instance": desc.instance is not None,
            }
            for desc in self._services.values()
        ]

    def clear(self):
        """Clear all registrations."""
        with self._lock:
            self._services.clear()


class ServiceScope:
    """Scoped service container."""

    def __init__(self, parent: ServiceLocator):
        """Initialize scope."""
        self._parent = parent
        self._instances: Dict[tuple, Any] = {}
        self._disposed = False

    def resolve(self, service_type: Type[T], name: Optional[str] = None) -> T:
        """Resolve service in scope."""
        if self._disposed:
            raise ScopeDisposedError("Scope has been disposed")

        key = (service_type, name)

        # Check scoped cache
        if key in self._instances:
            return self._instances[key]

        # Get descriptor from parent
        parent_key = (service_type, name)
        descriptor = self._parent._services.get(parent_key)

        if not descriptor:
            raise ServiceNotFoundError(f"Service not found: {service_type.__name__}")

        # Handle based on lifetime
        if descriptor.lifetime == ServiceLifetime.SCOPED:
            instance = self._parent._create_instance(descriptor)
            self._instances[key] = instance
            return instance

        # Delegate to parent for singleton/transient
        return self._parent.resolve(service_type, name)

    def dispose(self):
        """Dispose scope and its instances."""
        self._disposed = True

        # Call dispose on disposable instances
        for instance in self._instances.values():
            if hasattr(instance, "dispose"):
                try:
                    instance.dispose()
                except Exception:
                    pass
            elif hasattr(instance, "close"):
                try:
                    instance.close()
                except Exception:
                    pass

        self._instances.clear()


class ServiceNotFoundError(Exception):
    """Raised when service not found."""
    pass


class ServiceCreationError(Exception):
    """Raised when service creation fails."""
    pass


class ScopeDisposedError(Exception):
    """Raised when using disposed scope."""
    pass


def inject(*services: Type) -> Callable:
    """Decorator for dependency injection.

    Usage:
        @inject(DatabaseService, CacheService)
        def handler(db: DatabaseService, cache: CacheService):
            pass

        # Call without arguments
        handler()  # Services auto-injected
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Resolve services
            resolved = [locator.resolve(svc) for svc in services]
            return func(*resolved, *args, **kwargs)
        return wrapper
    return decorator


def injectable(
    lifetime: ServiceLifetime = ServiceLifetime.SINGLETON,
    name: Optional[str] = None,
) -> Callable[[Type[T]], Type[T]]:
    """Decorator to register class as injectable service.

    Usage:
        @injectable()
        class MyService:
            pass

        @injectable(lifetime=ServiceLifetime.TRANSIENT)
        class RequestHandler:
            pass
    """
    def decorator(cls: Type[T]) -> Type[T]:
        locator.register(cls, lifetime=lifetime, name=name)
        return cls
    return decorator


# Global locator instance
locator = ServiceLocator()


# Convenience functions
def register(
    service_type: Type[T],
    implementation: Optional[Type[T]] = None,
    factory: Optional[Callable[[], T]] = None,
    lifetime: ServiceLifetime = ServiceLifetime.SINGLETON,
    name: Optional[str] = None,
) -> ServiceLocator:
    """Register service in global locator."""
    return locator.register(service_type, implementation, factory, lifetime=lifetime, name=name)


def resolve(service_type: Type[T], name: Optional[str] = None) -> T:
    """Resolve service from global locator."""
    return locator.resolve(service_type, name)
