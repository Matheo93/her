"""
Service Mesh - Sprint 717

Service discovery and communication.

Features:
- Service registration
- Health checking
- Load balancing
- Service routing
- Circuit integration
"""

import time
import asyncio
import uuid
import random
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar,
    Awaitable, Set
)
from enum import Enum
import threading
from abc import ABC, abstractmethod


class ServiceStatus(str, Enum):
    """Service status."""
    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"
    DRAINING = "draining"
    STARTING = "starting"
    STOPPED = "stopped"


class LoadBalanceStrategy(str, Enum):
    """Load balancing strategies."""
    ROUND_ROBIN = "round_robin"
    RANDOM = "random"
    LEAST_CONNECTIONS = "least_connections"
    WEIGHTED = "weighted"


@dataclass
class ServiceInstance:
    """Single service instance."""
    id: str
    service_name: str
    host: str
    port: int
    status: ServiceStatus = ServiceStatus.STARTING
    weight: int = 1
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: Set[str] = field(default_factory=set)
    registered_at: float = field(default_factory=time.time)
    last_heartbeat: float = field(default_factory=time.time)
    active_connections: int = 0
    total_requests: int = 0
    error_count: int = 0

    @property
    def address(self) -> str:
        """Get full address."""
        return f"{self.host}:{self.port}"

    @property
    def error_rate(self) -> float:
        """Calculate error rate."""
        if self.total_requests == 0:
            return 0.0
        return self.error_count / self.total_requests

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "service_name": self.service_name,
            "host": self.host,
            "port": self.port,
            "status": self.status.value,
            "weight": self.weight,
            "address": self.address,
            "tags": list(self.tags),
            "active_connections": self.active_connections,
            "error_rate": round(self.error_rate, 4),
        }


@dataclass
class ServiceDefinition:
    """Service definition."""
    name: str
    instances: List[ServiceInstance] = field(default_factory=list)
    load_balance: LoadBalanceStrategy = LoadBalanceStrategy.ROUND_ROBIN
    health_check_interval: float = 10.0
    health_check_timeout: float = 5.0
    retry_count: int = 3
    timeout: float = 30.0

    def healthy_instances(self) -> List[ServiceInstance]:
        """Get healthy instances."""
        return [i for i in self.instances if i.status == ServiceStatus.HEALTHY]


class HealthChecker(ABC):
    """Abstract health checker."""

    @abstractmethod
    async def check(self, instance: ServiceInstance) -> bool:
        """Check instance health."""
        pass


class HTTPHealthChecker(HealthChecker):
    """HTTP health check."""

    def __init__(self, path: str = "/health", expected_status: int = 200):
        """Initialize checker."""
        self.path = path
        self.expected_status = expected_status

    async def check(self, instance: ServiceInstance) -> bool:
        """Check via HTTP GET."""
        # Simulated - in production would use aiohttp
        try:
            # Simulate HTTP check
            await asyncio.sleep(0.1)
            # For demo, assume healthy
            return True
        except Exception:
            return False


class TCPHealthChecker(HealthChecker):
    """TCP connection health check."""

    async def check(self, instance: ServiceInstance) -> bool:
        """Check TCP connection."""
        try:
            # Try to open connection
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(instance.host, instance.port),
                timeout=5.0
            )
            writer.close()
            await writer.wait_closed()
            return True
        except Exception:
            return False


class LoadBalancer:
    """Load balancer implementation."""

    def __init__(self, strategy: LoadBalanceStrategy = LoadBalanceStrategy.ROUND_ROBIN):
        """Initialize load balancer."""
        self._strategy = strategy
        self._counters: Dict[str, int] = {}
        self._lock = threading.Lock()

    def select(self, instances: List[ServiceInstance]) -> Optional[ServiceInstance]:
        """Select an instance based on strategy.

        Args:
            instances: Available instances

        Returns:
            Selected instance or None
        """
        if not instances:
            return None

        healthy = [i for i in instances if i.status == ServiceStatus.HEALTHY]
        if not healthy:
            return None

        if self._strategy == LoadBalanceStrategy.ROUND_ROBIN:
            return self._round_robin(healthy)
        elif self._strategy == LoadBalanceStrategy.RANDOM:
            return self._random(healthy)
        elif self._strategy == LoadBalanceStrategy.LEAST_CONNECTIONS:
            return self._least_connections(healthy)
        elif self._strategy == LoadBalanceStrategy.WEIGHTED:
            return self._weighted(healthy)

        return healthy[0]

    def _round_robin(self, instances: List[ServiceInstance]) -> ServiceInstance:
        """Round-robin selection."""
        service_name = instances[0].service_name

        with self._lock:
            counter = self._counters.get(service_name, 0)
            selected = instances[counter % len(instances)]
            self._counters[service_name] = counter + 1

        return selected

    def _random(self, instances: List[ServiceInstance]) -> ServiceInstance:
        """Random selection."""
        return random.choice(instances)

    def _least_connections(self, instances: List[ServiceInstance]) -> ServiceInstance:
        """Select instance with least active connections."""
        return min(instances, key=lambda i: i.active_connections)

    def _weighted(self, instances: List[ServiceInstance]) -> ServiceInstance:
        """Weighted random selection."""
        total_weight = sum(i.weight for i in instances)
        r = random.uniform(0, total_weight)
        current = 0

        for instance in instances:
            current += instance.weight
            if r <= current:
                return instance

        return instances[-1]


class ServiceRegistry:
    """Service registry for discovery.

    Usage:
        registry = ServiceRegistry()

        # Register service
        instance = registry.register(
            "user-service",
            host="localhost",
            port=8001
        )

        # Discover service
        instances = registry.discover("user-service")

        # Get instance for request
        instance = registry.get_instance("user-service")
    """

    def __init__(
        self,
        heartbeat_interval: float = 10.0,
        unhealthy_threshold: int = 3,
    ):
        """Initialize registry."""
        self._services: Dict[str, ServiceDefinition] = {}
        self._load_balancers: Dict[str, LoadBalancer] = {}
        self._health_checkers: Dict[str, HealthChecker] = {}
        self._lock = threading.Lock()
        self._heartbeat_interval = heartbeat_interval
        self._unhealthy_threshold = unhealthy_threshold
        self._running = False

    def register(
        self,
        service_name: str,
        host: str,
        port: int,
        weight: int = 1,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[Set[str]] = None,
    ) -> ServiceInstance:
        """Register a service instance.

        Args:
            service_name: Name of the service
            host: Instance host
            port: Instance port
            weight: Load balance weight
            metadata: Optional metadata
            tags: Optional tags

        Returns:
            Registered ServiceInstance
        """
        instance = ServiceInstance(
            id=str(uuid.uuid4()),
            service_name=service_name,
            host=host,
            port=port,
            weight=weight,
            metadata=metadata or {},
            tags=tags or set(),
            status=ServiceStatus.HEALTHY,
        )

        with self._lock:
            if service_name not in self._services:
                self._services[service_name] = ServiceDefinition(name=service_name)
                self._load_balancers[service_name] = LoadBalancer()

            self._services[service_name].instances.append(instance)

        return instance

    def deregister(self, instance_id: str) -> bool:
        """Deregister a service instance.

        Args:
            instance_id: Instance ID to remove

        Returns:
            True if removed
        """
        with self._lock:
            for service in self._services.values():
                for i, inst in enumerate(service.instances):
                    if inst.id == instance_id:
                        service.instances.pop(i)
                        return True
        return False

    def discover(self, service_name: str) -> List[ServiceInstance]:
        """Discover all instances of a service.

        Args:
            service_name: Service to discover

        Returns:
            List of instances
        """
        service = self._services.get(service_name)
        if not service:
            return []
        return service.healthy_instances()

    def get_instance(self, service_name: str) -> Optional[ServiceInstance]:
        """Get a single instance using load balancing.

        Args:
            service_name: Service name

        Returns:
            Selected instance or None
        """
        service = self._services.get(service_name)
        if not service:
            return None

        balancer = self._load_balancers.get(service_name)
        if not balancer:
            return None

        return balancer.select(service.instances)

    def set_health_checker(
        self,
        service_name: str,
        checker: HealthChecker,
    ) -> None:
        """Set health checker for service."""
        self._health_checkers[service_name] = checker

    def set_load_balance_strategy(
        self,
        service_name: str,
        strategy: LoadBalanceStrategy,
    ) -> None:
        """Set load balance strategy for service."""
        self._load_balancers[service_name] = LoadBalancer(strategy)

    def heartbeat(self, instance_id: str) -> bool:
        """Update instance heartbeat.

        Args:
            instance_id: Instance ID

        Returns:
            True if found and updated
        """
        with self._lock:
            for service in self._services.values():
                for inst in service.instances:
                    if inst.id == instance_id:
                        inst.last_heartbeat = time.time()
                        if inst.status == ServiceStatus.UNHEALTHY:
                            inst.status = ServiceStatus.HEALTHY
                        return True
        return False

    def update_status(
        self,
        instance_id: str,
        status: ServiceStatus,
    ) -> bool:
        """Update instance status."""
        with self._lock:
            for service in self._services.values():
                for inst in service.instances:
                    if inst.id == instance_id:
                        inst.status = status
                        return True
        return False

    def record_request(
        self,
        instance_id: str,
        success: bool = True,
    ) -> None:
        """Record a request to an instance."""
        with self._lock:
            for service in self._services.values():
                for inst in service.instances:
                    if inst.id == instance_id:
                        inst.total_requests += 1
                        if not success:
                            inst.error_count += 1
                        return

    def increment_connections(self, instance_id: str) -> None:
        """Increment active connections."""
        for service in self._services.values():
            for inst in service.instances:
                if inst.id == instance_id:
                    inst.active_connections += 1
                    return

    def decrement_connections(self, instance_id: str) -> None:
        """Decrement active connections."""
        for service in self._services.values():
            for inst in service.instances:
                if inst.id == instance_id:
                    inst.active_connections = max(0, inst.active_connections - 1)
                    return

    async def start_health_checks(self) -> None:
        """Start background health checking."""
        self._running = True
        asyncio.create_task(self._health_check_loop())

    async def stop_health_checks(self) -> None:
        """Stop health checking."""
        self._running = False

    async def _health_check_loop(self) -> None:
        """Background health check loop."""
        while self._running:
            await asyncio.sleep(self._heartbeat_interval)

            for service_name, service in list(self._services.items()):
                checker = self._health_checkers.get(service_name)

                for instance in service.instances:
                    # Check heartbeat timeout
                    if time.time() - instance.last_heartbeat > self._heartbeat_interval * self._unhealthy_threshold:
                        instance.status = ServiceStatus.UNHEALTHY
                        continue

                    # Run health check if configured
                    if checker:
                        try:
                            healthy = await checker.check(instance)
                            instance.status = ServiceStatus.HEALTHY if healthy else ServiceStatus.UNHEALTHY
                        except Exception:
                            instance.status = ServiceStatus.UNHEALTHY

    def get_all_services(self) -> Dict[str, dict]:
        """Get all registered services."""
        return {
            name: {
                "name": svc.name,
                "instance_count": len(svc.instances),
                "healthy_count": len(svc.healthy_instances()),
                "load_balance": svc.load_balance.value,
                "instances": [i.to_dict() for i in svc.instances],
            }
            for name, svc in self._services.items()
        }

    def get_stats(self) -> dict:
        """Get registry statistics."""
        total_instances = sum(len(s.instances) for s in self._services.values())
        healthy_instances = sum(len(s.healthy_instances()) for s in self._services.values())

        return {
            "total_services": len(self._services),
            "total_instances": total_instances,
            "healthy_instances": healthy_instances,
            "services": list(self._services.keys()),
        }


class ServiceClient:
    """Client for calling services through mesh.

    Usage:
        client = ServiceClient(registry)

        # Call service
        result = await client.call(
            "user-service",
            "/api/users/123",
            method="GET"
        )
    """

    def __init__(
        self,
        registry: ServiceRegistry,
        default_timeout: float = 30.0,
        retry_count: int = 3,
    ):
        """Initialize client."""
        self._registry = registry
        self._default_timeout = default_timeout
        self._retry_count = retry_count

    async def call(
        self,
        service_name: str,
        path: str,
        method: str = "GET",
        data: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        timeout: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Call a service.

        Args:
            service_name: Target service
            path: Request path
            method: HTTP method
            data: Request body
            headers: Request headers
            timeout: Request timeout

        Returns:
            Response data

        Raises:
            ServiceUnavailableError: If no healthy instance
        """
        timeout = timeout or self._default_timeout
        last_error = None

        for attempt in range(self._retry_count):
            instance = self._registry.get_instance(service_name)

            if not instance:
                raise ServiceUnavailableError(f"No healthy instance for {service_name}")

            try:
                self._registry.increment_connections(instance.id)

                # Simulated HTTP call
                result = await self._do_request(
                    instance, path, method, data, headers, timeout
                )

                self._registry.record_request(instance.id, success=True)
                return result

            except Exception as e:
                self._registry.record_request(instance.id, success=False)
                last_error = e

                if attempt < self._retry_count - 1:
                    await asyncio.sleep(0.5 * (attempt + 1))

            finally:
                self._registry.decrement_connections(instance.id)

        raise ServiceCallError(f"Failed to call {service_name}: {last_error}")

    async def _do_request(
        self,
        instance: ServiceInstance,
        path: str,
        method: str,
        data: Optional[Dict[str, Any]],
        headers: Optional[Dict[str, str]],
        timeout: float,
    ) -> Dict[str, Any]:
        """Execute HTTP request."""
        # Simulated - in production would use aiohttp
        url = f"http://{instance.address}{path}"
        await asyncio.sleep(0.01)  # Simulate network latency
        return {"status": "ok", "url": url, "method": method}


class ServiceUnavailableError(Exception):
    """Raised when no healthy service instance."""
    pass


class ServiceCallError(Exception):
    """Raised when service call fails."""
    pass


class ServiceMesh:
    """Complete service mesh facade.

    Usage:
        mesh = ServiceMesh()

        # Register local service
        mesh.register("my-service", port=8000)

        # Call other service
        result = await mesh.call("other-service", "/api/data")
    """

    def __init__(self):
        """Initialize mesh."""
        self._registry = ServiceRegistry()
        self._client = ServiceClient(self._registry)
        self._local_instances: List[ServiceInstance] = []

    @property
    def registry(self) -> ServiceRegistry:
        """Get registry."""
        return self._registry

    def register(
        self,
        service_name: str,
        host: str = "localhost",
        port: int = 8000,
        **kwargs,
    ) -> ServiceInstance:
        """Register local service."""
        instance = self._registry.register(
            service_name, host, port, **kwargs
        )
        self._local_instances.append(instance)
        return instance

    def deregister_local(self) -> None:
        """Deregister all local instances."""
        for instance in self._local_instances:
            self._registry.deregister(instance.id)
        self._local_instances.clear()

    def discover(self, service_name: str) -> List[ServiceInstance]:
        """Discover service instances."""
        return self._registry.discover(service_name)

    async def call(
        self,
        service_name: str,
        path: str,
        **kwargs,
    ) -> Dict[str, Any]:
        """Call a service."""
        return await self._client.call(service_name, path, **kwargs)

    async def start(self) -> None:
        """Start mesh (health checks)."""
        await self._registry.start_health_checks()

    async def stop(self) -> None:
        """Stop mesh and deregister."""
        await self._registry.stop_health_checks()
        self.deregister_local()

    def get_stats(self) -> dict:
        """Get mesh statistics."""
        return self._registry.get_stats()


# Singleton instance
service_mesh = ServiceMesh()


# Convenience functions
def register_service(
    name: str,
    host: str = "localhost",
    port: int = 8000,
    **kwargs,
) -> ServiceInstance:
    """Register service with global mesh."""
    return service_mesh.register(name, host, port, **kwargs)


def discover_service(name: str) -> List[ServiceInstance]:
    """Discover service using global mesh."""
    return service_mesh.discover(name)


async def call_service(
    service_name: str,
    path: str,
    **kwargs,
) -> Dict[str, Any]:
    """Call service using global mesh."""
    return await service_mesh.call(service_name, path, **kwargs)
