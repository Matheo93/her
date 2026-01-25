"""
Service Registry - Sprint 651

Service discovery and registration system.

Features:
- Service registration
- Health checks
- Load balancing
- Service discovery
- Instance management
"""

import time
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Callable, Awaitable
from enum import Enum
from threading import Lock
import random


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


@dataclass
class ServiceInstance:
    """Individual service instance."""
    id: str
    service_name: str
    host: str
    port: int
    status: ServiceStatus = ServiceStatus.STARTING
    weight: int = 1
    connections: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    registered_at: float = field(default_factory=time.time)
    last_heartbeat: float = field(default_factory=time.time)
    health_check_url: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "service_name": self.service_name,
            "host": self.host,
            "port": self.port,
            "address": f"{self.host}:{self.port}",
            "status": self.status.value,
            "weight": self.weight,
            "connections": self.connections,
            "metadata": self.metadata,
            "registered_at": self.registered_at,
            "last_heartbeat": self.last_heartbeat,
        }


@dataclass
class ServiceConfig:
    """Service configuration."""
    name: str
    load_balance: LoadBalanceStrategy = LoadBalanceStrategy.ROUND_ROBIN
    health_check_interval: float = 30.0
    health_check_timeout: float = 5.0
    deregister_after: float = 90.0
    metadata: Dict[str, Any] = field(default_factory=dict)


class ServiceRegistry:
    """Service discovery and registration system.

    Usage:
        registry = ServiceRegistry()

        # Register service instance
        instance_id = registry.register(
            service_name="api",
            host="localhost",
            port=8000,
        )

        # Discover service
        instances = registry.discover("api")

        # Get instance for load balancing
        instance = registry.get_instance("api")

        # Heartbeat
        registry.heartbeat(instance_id)

        # Deregister
        registry.deregister(instance_id)
    """

    def __init__(self):
        """Initialize service registry."""
        self._services: Dict[str, ServiceConfig] = {}
        self._instances: Dict[str, ServiceInstance] = {}
        self._service_instances: Dict[str, List[str]] = {}
        self._lock = Lock()
        self._round_robin_index: Dict[str, int] = {}

    def register_service(
        self,
        name: str,
        load_balance: LoadBalanceStrategy = LoadBalanceStrategy.ROUND_ROBIN,
        health_check_interval: float = 30.0,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Register a service type.

        Args:
            name: Service name
            load_balance: Load balancing strategy
            health_check_interval: Health check interval
            metadata: Service metadata
        """
        config = ServiceConfig(
            name=name,
            load_balance=load_balance,
            health_check_interval=health_check_interval,
            metadata=metadata or {},
        )

        with self._lock:
            self._services[name] = config
            if name not in self._service_instances:
                self._service_instances[name] = []

    def register(
        self,
        service_name: str,
        host: str,
        port: int,
        weight: int = 1,
        metadata: Optional[Dict[str, Any]] = None,
        health_check_url: Optional[str] = None,
    ) -> str:
        """Register a service instance.

        Args:
            service_name: Name of service
            host: Instance host
            port: Instance port
            weight: Load balancing weight
            metadata: Instance metadata
            health_check_url: Health check endpoint

        Returns:
            Instance ID
        """
        instance_id = str(uuid.uuid4())[:8]

        instance = ServiceInstance(
            id=instance_id,
            service_name=service_name,
            host=host,
            port=port,
            weight=weight,
            metadata=metadata or {},
            health_check_url=health_check_url,
        )

        with self._lock:
            self._instances[instance_id] = instance

            if service_name not in self._service_instances:
                self._service_instances[service_name] = []
            self._service_instances[service_name].append(instance_id)

            # Auto-register service if not exists
            if service_name not in self._services:
                self._services[service_name] = ServiceConfig(name=service_name)

        return instance_id

    def deregister(self, instance_id: str) -> bool:
        """Deregister a service instance.

        Args:
            instance_id: Instance ID

        Returns:
            True if deregistered
        """
        with self._lock:
            instance = self._instances.get(instance_id)
            if not instance:
                return False

            del self._instances[instance_id]

            service_instances = self._service_instances.get(instance.service_name, [])
            if instance_id in service_instances:
                service_instances.remove(instance_id)

            return True

    def heartbeat(self, instance_id: str) -> bool:
        """Update instance heartbeat.

        Args:
            instance_id: Instance ID

        Returns:
            True if updated
        """
        with self._lock:
            instance = self._instances.get(instance_id)
            if not instance:
                return False

            instance.last_heartbeat = time.time()
            if instance.status == ServiceStatus.STARTING:
                instance.status = ServiceStatus.HEALTHY

            return True

    def set_status(self, instance_id: str, status: ServiceStatus) -> bool:
        """Set instance status.

        Args:
            instance_id: Instance ID
            status: New status

        Returns:
            True if updated
        """
        with self._lock:
            instance = self._instances.get(instance_id)
            if not instance:
                return False

            instance.status = status
            return True

    def discover(
        self,
        service_name: str,
        healthy_only: bool = True,
    ) -> List[dict]:
        """Discover service instances.

        Args:
            service_name: Service to discover
            healthy_only: Only return healthy instances

        Returns:
            List of instances
        """
        with self._lock:
            instance_ids = self._service_instances.get(service_name, [])
            instances = [
                self._instances[id] for id in instance_ids
                if id in self._instances
            ]

            if healthy_only:
                instances = [
                    i for i in instances
                    if i.status == ServiceStatus.HEALTHY
                ]

            return [i.to_dict() for i in instances]

    def get_instance(
        self,
        service_name: str,
        strategy: Optional[LoadBalanceStrategy] = None,
    ) -> Optional[dict]:
        """Get a service instance for load balancing.

        Args:
            service_name: Service name
            strategy: Override load balance strategy

        Returns:
            Instance dict or None
        """
        with self._lock:
            config = self._services.get(service_name)
            lb_strategy = strategy or (config.load_balance if config else LoadBalanceStrategy.ROUND_ROBIN)

            instance_ids = self._service_instances.get(service_name, [])
            instances = [
                self._instances[id] for id in instance_ids
                if id in self._instances and self._instances[id].status == ServiceStatus.HEALTHY
            ]

            if not instances:
                return None

            if lb_strategy == LoadBalanceStrategy.RANDOM:
                selected = random.choice(instances)

            elif lb_strategy == LoadBalanceStrategy.LEAST_CONNECTIONS:
                selected = min(instances, key=lambda i: i.connections)

            elif lb_strategy == LoadBalanceStrategy.WEIGHTED:
                total_weight = sum(i.weight for i in instances)
                r = random.uniform(0, total_weight)
                cumulative = 0
                selected = instances[0]
                for instance in instances:
                    cumulative += instance.weight
                    if r <= cumulative:
                        selected = instance
                        break

            else:  # ROUND_ROBIN
                if service_name not in self._round_robin_index:
                    self._round_robin_index[service_name] = 0

                index = self._round_robin_index[service_name] % len(instances)
                selected = instances[index]
                self._round_robin_index[service_name] = index + 1

            selected.connections += 1
            return selected.to_dict()

    def release_connection(self, instance_id: str):
        """Release a connection from instance.

        Args:
            instance_id: Instance ID
        """
        with self._lock:
            instance = self._instances.get(instance_id)
            if instance and instance.connections > 0:
                instance.connections -= 1

    def cleanup_stale(self, timeout: float = 90.0) -> int:
        """Remove stale instances.

        Args:
            timeout: Seconds since last heartbeat

        Returns:
            Number of instances removed
        """
        now = time.time()
        stale = []

        with self._lock:
            for instance_id, instance in self._instances.items():
                if now - instance.last_heartbeat > timeout:
                    stale.append(instance_id)

        for instance_id in stale:
            self.deregister(instance_id)

        return len(stale)

    def list_services(self) -> List[dict]:
        """List all registered services.

        Returns:
            List of service configs
        """
        with self._lock:
            result = []
            for name, config in self._services.items():
                instance_ids = self._service_instances.get(name, [])
                healthy_count = sum(
                    1 for id in instance_ids
                    if id in self._instances and
                    self._instances[id].status == ServiceStatus.HEALTHY
                )

                result.append({
                    "name": name,
                    "load_balance": config.load_balance.value,
                    "total_instances": len(instance_ids),
                    "healthy_instances": healthy_count,
                    "metadata": config.metadata,
                })

            return result

    def get_stats(self) -> Dict[str, Any]:
        """Get registry statistics.

        Returns:
            Statistics dict
        """
        with self._lock:
            total_instances = len(self._instances)
            healthy = sum(
                1 for i in self._instances.values()
                if i.status == ServiceStatus.HEALTHY
            )
            total_connections = sum(
                i.connections for i in self._instances.values()
            )

            by_status = {}
            for instance in self._instances.values():
                status = instance.status.value
                by_status[status] = by_status.get(status, 0) + 1

            return {
                "total_services": len(self._services),
                "total_instances": total_instances,
                "healthy_instances": healthy,
                "unhealthy_instances": total_instances - healthy,
                "total_connections": total_connections,
                "instances_by_status": by_status,
            }


# Singleton instance
service_registry = ServiceRegistry()

# Pre-register common services
service_registry.register_service("api", LoadBalanceStrategy.ROUND_ROBIN)
service_registry.register_service("tts", LoadBalanceStrategy.LEAST_CONNECTIONS)
service_registry.register_service("websocket", LoadBalanceStrategy.LEAST_CONNECTIONS)
