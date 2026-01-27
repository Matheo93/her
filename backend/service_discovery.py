"""
Service Discovery - Sprint 779

Service registry and discovery system.

Features:
- Service registration
- Health checking
- Load balancing
- Service lookup
- Instance management
- TTL-based expiration
"""

import asyncio
import time
import random
import hashlib
import threading
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Set,
    Awaitable
)
from enum import Enum
from abc import ABC, abstractmethod
import logging

logger = logging.getLogger(__name__)


T = TypeVar("T")


class ServiceStatus(str, Enum):
    """Service instance status."""
    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"
    STARTING = "starting"
    STOPPING = "stopping"
    UNKNOWN = "unknown"


class LoadBalanceStrategy(str, Enum):
    """Load balancing strategy."""
    ROUND_ROBIN = "round_robin"
    RANDOM = "random"
    LEAST_CONNECTIONS = "least_connections"
    WEIGHTED = "weighted"
    CONSISTENT_HASH = "consistent_hash"


@dataclass
class ServiceInstance:
    """Service instance information."""
    id: str
    name: str
    host: str
    port: int
    status: ServiceStatus = ServiceStatus.UNKNOWN
    weight: int = 1
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: Set[str] = field(default_factory=set)
    registered_at: float = field(default_factory=time.time)
    last_heartbeat: float = field(default_factory=time.time)
    health_check_url: Optional[str] = None
    connections: int = 0

    @property
    def address(self) -> str:
        return self.host + ":" + str(self.port)

    @property
    def is_healthy(self) -> bool:
        return self.status == ServiceStatus.HEALTHY

    @property
    def age_seconds(self) -> float:
        return time.time() - self.registered_at

    @property
    def time_since_heartbeat(self) -> float:
        return time.time() - self.last_heartbeat

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "host": self.host,
            "port": self.port,
            "address": self.address,
            "status": self.status.value,
            "weight": self.weight,
            "metadata": self.metadata,
            "tags": list(self.tags),
            "registered_at": self.registered_at,
            "last_heartbeat": self.last_heartbeat,
            "connections": self.connections,
        }


class HealthChecker(ABC):
    """Abstract health checker."""

    @abstractmethod
    async def check(self, instance: ServiceInstance) -> ServiceStatus:
        """Check instance health."""
        pass


class HttpHealthChecker(HealthChecker):
    """HTTP health check."""

    def __init__(self, timeout: float = 5.0):
        self.timeout = timeout

    async def check(self, instance: ServiceInstance) -> ServiceStatus:
        """Perform HTTP health check."""
        # Simulate HTTP check
        url = instance.health_check_url or "http://" + instance.address + "/health"
        try:
            # In production, use aiohttp or httpx
            await asyncio.sleep(0.01)  # Simulate network call
            return ServiceStatus.HEALTHY
        except Exception as e:
            logger.warning("Health check failed for " + instance.address + ": " + str(e))
            return ServiceStatus.UNHEALTHY


class TcpHealthChecker(HealthChecker):
    """TCP connection health check."""

    def __init__(self, timeout: float = 3.0):
        self.timeout = timeout

    async def check(self, instance: ServiceInstance) -> ServiceStatus:
        """Check TCP connectivity."""
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(instance.host, instance.port),
                timeout=self.timeout,
            )
            writer.close()
            await writer.wait_closed()
            return ServiceStatus.HEALTHY
        except asyncio.TimeoutError:
            return ServiceStatus.UNHEALTHY
        except Exception:
            return ServiceStatus.UNHEALTHY


class LoadBalancer(ABC):
    """Abstract load balancer."""

    @abstractmethod
    def select(
        self,
        instances: List[ServiceInstance],
        key: Optional[str] = None,
    ) -> Optional[ServiceInstance]:
        """Select an instance."""
        pass


class RoundRobinBalancer(LoadBalancer):
    """Round-robin load balancer."""

    def __init__(self):
        self._counters: Dict[str, int] = {}
        self._lock = threading.Lock()

    def select(
        self,
        instances: List[ServiceInstance],
        key: Optional[str] = None,
    ) -> Optional[ServiceInstance]:
        if not instances:
            return None

        healthy = [i for i in instances if i.is_healthy]
        if not healthy:
            return None

        service_name = healthy[0].name

        with self._lock:
            counter = self._counters.get(service_name, 0)
            self._counters[service_name] = (counter + 1) % len(healthy)
            return healthy[counter % len(healthy)]


class RandomBalancer(LoadBalancer):
    """Random load balancer."""

    def select(
        self,
        instances: List[ServiceInstance],
        key: Optional[str] = None,
    ) -> Optional[ServiceInstance]:
        healthy = [i for i in instances if i.is_healthy]
        if not healthy:
            return None
        return random.choice(healthy)


class LeastConnectionsBalancer(LoadBalancer):
    """Least connections load balancer."""

    def select(
        self,
        instances: List[ServiceInstance],
        key: Optional[str] = None,
    ) -> Optional[ServiceInstance]:
        healthy = [i for i in instances if i.is_healthy]
        if not healthy:
            return None
        return min(healthy, key=lambda i: i.connections)


class WeightedBalancer(LoadBalancer):
    """Weighted random load balancer."""

    def select(
        self,
        instances: List[ServiceInstance],
        key: Optional[str] = None,
    ) -> Optional[ServiceInstance]:
        healthy = [i for i in instances if i.is_healthy]
        if not healthy:
            return None

        total_weight = sum(i.weight for i in healthy)
        if total_weight == 0:
            return random.choice(healthy)

        r = random.uniform(0, total_weight)
        cumulative = 0.0

        for instance in healthy:
            cumulative += instance.weight
            if r <= cumulative:
                return instance

        return healthy[-1]


class ConsistentHashBalancer(LoadBalancer):
    """Consistent hashing load balancer."""

    def __init__(self, replicas: int = 100):
        self.replicas = replicas
        self._ring: Dict[int, str] = {}
        self._sorted_keys: List[int] = []

    def _hash(self, key: str) -> int:
        return int(hashlib.md5(key.encode()).hexdigest(), 16)

    def _rebuild_ring(self, instances: List[ServiceInstance]) -> None:
        self._ring.clear()
        for instance in instances:
            if instance.is_healthy:
                for i in range(self.replicas):
                    hash_key = self._hash(instance.id + ":" + str(i))
                    self._ring[hash_key] = instance.id
        self._sorted_keys = sorted(self._ring.keys())

    def select(
        self,
        instances: List[ServiceInstance],
        key: Optional[str] = None,
    ) -> Optional[ServiceInstance]:
        healthy = [i for i in instances if i.is_healthy]
        if not healthy:
            return None

        if not key:
            return random.choice(healthy)

        self._rebuild_ring(healthy)

        if not self._sorted_keys:
            return None

        hash_val = self._hash(key)

        # Binary search for the first node
        idx = 0
        for i, k in enumerate(self._sorted_keys):
            if k >= hash_val:
                idx = i
                break
        else:
            idx = 0

        target_id = self._ring[self._sorted_keys[idx]]
        return next((i for i in healthy if i.id == target_id), None)


class ServiceRegistry:
    """Service registry for discovery.

    Usage:
        registry = ServiceRegistry()

        # Register service
        instance = registry.register(
            name="user-service",
            host="localhost",
            port=8080,
            tags={"api", "v1"},
        )

        # Discover services
        instances = registry.get_instances("user-service")

        # Get single instance with load balancing
        instance = registry.get_instance("user-service")

        # Deregister
        registry.deregister(instance.id)
    """

    def __init__(
        self,
        health_checker: Optional[HealthChecker] = None,
        load_balancer: Optional[LoadBalancer] = None,
        health_check_interval: float = 10.0,
        instance_ttl: float = 30.0,
    ):
        self._instances: Dict[str, ServiceInstance] = {}
        self._services: Dict[str, Set[str]] = {}  # name -> instance_ids
        self._health_checker = health_checker or HttpHealthChecker()
        self._load_balancer = load_balancer or RoundRobinBalancer()
        self._health_check_interval = health_check_interval
        self._instance_ttl = instance_ttl
        self._lock = threading.RLock()
        self._health_check_task: Optional[asyncio.Task] = None
        self._watchers: Dict[str, List[Callable[[str, ServiceInstance], Awaitable[None]]]] = {}

    def register(
        self,
        name: str,
        host: str,
        port: int,
        instance_id: Optional[str] = None,
        weight: int = 1,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[Set[str]] = None,
        health_check_url: Optional[str] = None,
    ) -> ServiceInstance:
        """Register a service instance."""
        if not instance_id:
            instance_id = name + "-" + host + "-" + str(port) + "-" + str(int(time.time() * 1000))

        instance = ServiceInstance(
            id=instance_id,
            name=name,
            host=host,
            port=port,
            status=ServiceStatus.STARTING,
            weight=weight,
            metadata=metadata or {},
            tags=tags or set(),
            health_check_url=health_check_url,
        )

        with self._lock:
            self._instances[instance.id] = instance
            if name not in self._services:
                self._services[name] = set()
            self._services[name].add(instance.id)

        logger.info("Registered service: " + name + " at " + instance.address)

        # Notify watchers (fire and forget, handle no event loop)
        self._schedule_notification(name, "register", instance)

        return instance

    def deregister(self, instance_id: str) -> bool:
        """Deregister a service instance."""
        with self._lock:
            instance = self._instances.pop(instance_id, None)
            if not instance:
                return False

            if instance.name in self._services:
                self._services[instance.name].discard(instance_id)

        logger.info("Deregistered service: " + instance.name + " (" + instance_id + ")")

        # Notify watchers (fire and forget)
        self._schedule_notification(instance.name, "deregister", instance)

        return True

    def heartbeat(self, instance_id: str) -> bool:
        """Update instance heartbeat."""
        with self._lock:
            instance = self._instances.get(instance_id)
            if not instance:
                return False

            instance.last_heartbeat = time.time()
            if instance.status == ServiceStatus.STARTING:
                instance.status = ServiceStatus.HEALTHY

        return True

    def update_status(
        self,
        instance_id: str,
        status: ServiceStatus,
    ) -> bool:
        """Update instance status."""
        with self._lock:
            instance = self._instances.get(instance_id)
            if not instance:
                return False

            old_status = instance.status
            instance.status = status

            if old_status != status:
                self._schedule_notification(instance.name, "status_change", instance)

        return True

    def get_instance(
        self,
        name: str,
        tags: Optional[Set[str]] = None,
        key: Optional[str] = None,
    ) -> Optional[ServiceInstance]:
        """Get a single instance using load balancer."""
        instances = self.get_instances(name, tags)
        return self._load_balancer.select(instances, key)

    def get_instances(
        self,
        name: str,
        tags: Optional[Set[str]] = None,
        healthy_only: bool = True,
    ) -> List[ServiceInstance]:
        """Get all instances of a service."""
        with self._lock:
            instance_ids = self._services.get(name, set())
            instances = [
                self._instances[id]
                for id in instance_ids
                if id in self._instances
            ]

        if tags:
            instances = [i for i in instances if tags.issubset(i.tags)]

        if healthy_only:
            instances = [i for i in instances if i.is_healthy]

        return instances

    def get_all_services(self) -> List[str]:
        """Get all registered service names."""
        with self._lock:
            return list(self._services.keys())

    def get_all_instances(self) -> List[ServiceInstance]:
        """Get all registered instances."""
        with self._lock:
            return list(self._instances.values())

    def watch(
        self,
        service_name: str,
        callback: Callable[[str, ServiceInstance], Awaitable[None]],
    ) -> Callable[[], None]:
        """Watch a service for changes."""
        if service_name not in self._watchers:
            self._watchers[service_name] = []

        self._watchers[service_name].append(callback)

        def unwatch():
            if service_name in self._watchers:
                self._watchers[service_name].remove(callback)

        return unwatch

    def _schedule_notification(
        self,
        service_name: str,
        event: str,
        instance: ServiceInstance,
    ) -> None:
        """Schedule notification, handling no event loop gracefully."""
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self._notify_watchers(service_name, event, instance))
        except RuntimeError:
            # No running event loop, skip notification
            pass

    async def _notify_watchers(
        self,
        service_name: str,
        event: str,
        instance: ServiceInstance,
    ) -> None:
        """Notify watchers of changes."""
        callbacks = self._watchers.get(service_name, [])
        for callback in callbacks:
            try:
                await callback(event, instance)
            except Exception as e:
                logger.error("Watcher callback error: " + str(e))

    async def _health_check_loop(self) -> None:
        """Periodic health check loop."""
        while True:
            try:
                await asyncio.sleep(self._health_check_interval)
                await self._run_health_checks()
                self._cleanup_expired()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Health check error: " + str(e))

    async def _run_health_checks(self) -> None:
        """Run health checks on all instances."""
        with self._lock:
            instances = list(self._instances.values())

        tasks = []
        for instance in instances:
            tasks.append(self._check_instance_health(instance))

        await asyncio.gather(*tasks, return_exceptions=True)

    async def _check_instance_health(self, instance: ServiceInstance) -> None:
        """Check health of single instance."""
        try:
            status = await self._health_checker.check(instance)
            self.update_status(instance.id, status)
        except Exception as e:
            logger.warning("Health check failed for " + instance.address + ": " + str(e))
            self.update_status(instance.id, ServiceStatus.UNHEALTHY)

    def _cleanup_expired(self) -> None:
        """Remove expired instances."""
        now = time.time()
        expired = []

        with self._lock:
            for instance_id, instance in self._instances.items():
                if instance.time_since_heartbeat > self._instance_ttl:
                    expired.append(instance_id)

        for instance_id in expired:
            logger.info("Removing expired instance: " + instance_id)
            self.deregister(instance_id)

    async def start(self) -> None:
        """Start background tasks."""
        self._health_check_task = asyncio.create_task(self._health_check_loop())

    async def stop(self) -> None:
        """Stop background tasks."""
        if self._health_check_task:
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass

    def stats(self) -> dict:
        """Get registry statistics."""
        with self._lock:
            total = len(self._instances)
            healthy = sum(1 for i in self._instances.values() if i.is_healthy)
            by_service = {
                name: len(ids) for name, ids in self._services.items()
            }

        return {
            "total_instances": total,
            "healthy_instances": healthy,
            "unhealthy_instances": total - healthy,
            "services": list(self._services.keys()),
            "instances_by_service": by_service,
        }


class ServiceClient:
    """Client for service discovery.

    Usage:
        client = ServiceClient(registry)

        # Get service address
        address = client.resolve("user-service")

        # Track connections
        with client.connection("user-service") as instance:
            # Use instance.address for request
            pass
    """

    def __init__(self, registry: ServiceRegistry):
        self._registry = registry

    def resolve(
        self,
        name: str,
        tags: Optional[Set[str]] = None,
        key: Optional[str] = None,
    ) -> Optional[str]:
        """Resolve service to address."""
        instance = self._registry.get_instance(name, tags, key)
        return instance.address if instance else None

    def resolve_all(
        self,
        name: str,
        tags: Optional[Set[str]] = None,
    ) -> List[str]:
        """Resolve all instances to addresses."""
        instances = self._registry.get_instances(name, tags)
        return [i.address for i in instances]

    class _ConnectionContext:
        def __init__(self, instance: Optional[ServiceInstance]):
            self.instance = instance

        def __enter__(self):
            if self.instance:
                self.instance.connections += 1
            return self.instance

        def __exit__(self, *args):
            if self.instance:
                self.instance.connections = max(0, self.instance.connections - 1)

    def connection(
        self,
        name: str,
        tags: Optional[Set[str]] = None,
        key: Optional[str] = None,
    ) -> _ConnectionContext:
        """Get connection context for tracking."""
        instance = self._registry.get_instance(name, tags, key)
        return self._ConnectionContext(instance)


# Convenience functions
_registry: Optional[ServiceRegistry] = None


def get_registry() -> ServiceRegistry:
    """Get global service registry."""
    global _registry
    if not _registry:
        _registry = ServiceRegistry()
    return _registry


def configure_registry(
    health_checker: Optional[HealthChecker] = None,
    load_balancer: Optional[LoadBalancer] = None,
    **kwargs: Any,
) -> ServiceRegistry:
    """Configure global registry."""
    global _registry
    _registry = ServiceRegistry(
        health_checker=health_checker,
        load_balancer=load_balancer,
        **kwargs,
    )
    return _registry


def register_service(
    name: str,
    host: str,
    port: int,
    **kwargs: Any,
) -> ServiceInstance:
    """Register service with global registry."""
    return get_registry().register(name, host, port, **kwargs)


def get_service(
    name: str,
    tags: Optional[Set[str]] = None,
    key: Optional[str] = None,
) -> Optional[ServiceInstance]:
    """Get service instance from global registry."""
    return get_registry().get_instance(name, tags, key)
