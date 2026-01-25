"""
Multi-Tenancy Manager - Sprint 701

Tenant isolation and management.

Features:
- Tenant contexts
- Data isolation
- Tenant-specific config
- Cross-tenant operations
- Tenant lifecycle
"""

import time
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Awaitable, Set, ContextManager
)
from enum import Enum
import threading
from contextvars import ContextVar
from abc import ABC, abstractmethod


class TenantStatus(str, Enum):
    """Tenant status."""
    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING = "pending"
    DELETED = "deleted"


class TenantTier(str, Enum):
    """Tenant subscription tier."""
    FREE = "free"
    BASIC = "basic"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


@dataclass
class TenantLimits:
    """Tenant resource limits."""
    max_users: int = 5
    max_storage_gb: float = 1.0
    max_api_calls_per_day: int = 1000
    max_concurrent_requests: int = 10
    features: Set[str] = field(default_factory=set)

    @classmethod
    def for_tier(cls, tier: TenantTier) -> "TenantLimits":
        """Get limits for tier."""
        tiers = {
            TenantTier.FREE: cls(5, 1.0, 1000, 10, {"basic"}),
            TenantTier.BASIC: cls(25, 10.0, 10000, 50, {"basic", "analytics"}),
            TenantTier.PROFESSIONAL: cls(100, 100.0, 100000, 200, {"basic", "analytics", "api", "integrations"}),
            TenantTier.ENTERPRISE: cls(9999, 1000.0, 1000000, 1000, {"basic", "analytics", "api", "integrations", "sso", "audit"}),
        }
        return tiers.get(tier, cls())


@dataclass
class Tenant:
    """Tenant definition."""
    id: str
    name: str
    slug: str
    status: TenantStatus = TenantStatus.ACTIVE
    tier: TenantTier = TenantTier.FREE
    limits: TenantLimits = field(default_factory=TenantLimits)
    config: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: Optional[float] = None
    owner_id: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "status": self.status.value,
            "tier": self.tier.value,
            "created_at": self.created_at,
        }

    def has_feature(self, feature: str) -> bool:
        """Check if tenant has feature."""
        return feature in self.limits.features

    def is_active(self) -> bool:
        """Check if tenant is active."""
        return self.status == TenantStatus.ACTIVE


# Context variable for current tenant
_current_tenant: ContextVar[Optional[Tenant]] = ContextVar("current_tenant", default=None)


def get_current_tenant() -> Optional[Tenant]:
    """Get current tenant from context."""
    return _current_tenant.get()


def set_current_tenant(tenant: Optional[Tenant]) -> None:
    """Set current tenant in context."""
    _current_tenant.set(tenant)


class TenantContext:
    """Context manager for tenant scope.

    Usage:
        with TenantContext(tenant):
            # All operations here are scoped to tenant
            data = await repository.find_all()
    """

    def __init__(self, tenant: Tenant):
        """Initialize context."""
        self._tenant = tenant
        self._token = None

    def __enter__(self) -> Tenant:
        """Enter context."""
        self._token = _current_tenant.set(self._tenant)
        return self._tenant

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """Exit context."""
        _current_tenant.reset(self._token)

    async def __aenter__(self) -> Tenant:
        """Async enter context."""
        self._token = _current_tenant.set(self._tenant)
        return self._tenant

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Async exit context."""
        _current_tenant.reset(self._token)


class TenantStore:
    """In-memory tenant store (replace with DB in production)."""

    def __init__(self):
        """Initialize store."""
        self._tenants: Dict[str, Tenant] = {}
        self._by_slug: Dict[str, str] = {}
        self._lock = threading.Lock()

    def create(
        self,
        name: str,
        slug: str,
        tier: TenantTier = TenantTier.FREE,
        owner_id: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Tenant:
        """Create new tenant."""
        with self._lock:
            if slug in self._by_slug:
                raise TenantAlreadyExistsError(f"Tenant with slug '{slug}' already exists")

            tenant = Tenant(
                id=str(uuid.uuid4()),
                name=name,
                slug=slug,
                tier=tier,
                limits=TenantLimits.for_tier(tier),
                owner_id=owner_id,
                config=config or {},
            )

            self._tenants[tenant.id] = tenant
            self._by_slug[slug] = tenant.id

        return tenant

    def get(self, tenant_id: str) -> Optional[Tenant]:
        """Get tenant by ID."""
        return self._tenants.get(tenant_id)

    def get_by_slug(self, slug: str) -> Optional[Tenant]:
        """Get tenant by slug."""
        tenant_id = self._by_slug.get(slug)
        return self._tenants.get(tenant_id) if tenant_id else None

    def update(self, tenant_id: str, **updates) -> Optional[Tenant]:
        """Update tenant."""
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            return None

        with self._lock:
            for key, value in updates.items():
                if hasattr(tenant, key):
                    setattr(tenant, key, value)
            tenant.updated_at = time.time()

        return tenant

    def delete(self, tenant_id: str) -> bool:
        """Delete tenant."""
        tenant = self._tenants.get(tenant_id)
        if not tenant:
            return False

        with self._lock:
            tenant.status = TenantStatus.DELETED
            del self._by_slug[tenant.slug]

        return True

    def list_all(
        self,
        status: Optional[TenantStatus] = None,
        tier: Optional[TenantTier] = None,
        limit: int = 100,
    ) -> List[Tenant]:
        """List tenants with filters."""
        tenants = list(self._tenants.values())

        if status:
            tenants = [t for t in tenants if t.status == status]
        if tier:
            tenants = [t for t in tenants if t.tier == tier]

        tenants.sort(key=lambda t: t.created_at, reverse=True)
        return tenants[:limit]


class TenantIsolatedData(Generic[TypeVar("T")]):
    """Tenant-isolated data storage.

    Usage:
        cache = TenantIsolatedData()

        with TenantContext(tenant_a):
            cache.set("key", "value_a")

        with TenantContext(tenant_b):
            cache.set("key", "value_b")
            print(cache.get("key"))  # "value_b"
    """

    def __init__(self):
        """Initialize storage."""
        self._data: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

    def _get_tenant_id(self) -> str:
        """Get current tenant ID."""
        tenant = get_current_tenant()
        if not tenant:
            raise NoTenantContextError("No tenant context set")
        return tenant.id

    def set(self, key: str, value: Any) -> None:
        """Set value for current tenant."""
        tenant_id = self._get_tenant_id()
        with self._lock:
            if tenant_id not in self._data:
                self._data[tenant_id] = {}
            self._data[tenant_id][key] = value

    def get(self, key: str, default: Any = None) -> Any:
        """Get value for current tenant."""
        tenant_id = self._get_tenant_id()
        return self._data.get(tenant_id, {}).get(key, default)

    def delete(self, key: str) -> bool:
        """Delete value for current tenant."""
        tenant_id = self._get_tenant_id()
        with self._lock:
            if tenant_id in self._data and key in self._data[tenant_id]:
                del self._data[tenant_id][key]
                return True
        return False

    def clear(self) -> None:
        """Clear all data for current tenant."""
        tenant_id = self._get_tenant_id()
        with self._lock:
            if tenant_id in self._data:
                self._data[tenant_id] = {}

    def all_keys(self) -> List[str]:
        """Get all keys for current tenant."""
        tenant_id = self._get_tenant_id()
        return list(self._data.get(tenant_id, {}).keys())


class TenantManager:
    """Central tenant management.

    Usage:
        manager = TenantManager()

        # Create tenant
        tenant = manager.create("Acme Corp", "acme")

        # Work in tenant context
        async with manager.context(tenant.id):
            await do_work()

        # Check limits
        if manager.check_limit(tenant.id, "api_calls"):
            manager.increment_usage(tenant.id, "api_calls")
    """

    def __init__(self):
        """Initialize manager."""
        self._store = TenantStore()
        self._usage: Dict[str, Dict[str, int]] = {}
        self._lock = threading.Lock()

    def create(
        self,
        name: str,
        slug: str,
        tier: TenantTier = TenantTier.FREE,
        owner_id: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Tenant:
        """Create new tenant."""
        return self._store.create(name, slug, tier, owner_id, config)

    def get(self, tenant_id: str) -> Optional[Tenant]:
        """Get tenant by ID."""
        return self._store.get(tenant_id)

    def get_by_slug(self, slug: str) -> Optional[Tenant]:
        """Get tenant by slug."""
        return self._store.get_by_slug(slug)

    def update(self, tenant_id: str, **updates) -> Optional[Tenant]:
        """Update tenant."""
        return self._store.update(tenant_id, **updates)

    def suspend(self, tenant_id: str) -> bool:
        """Suspend tenant."""
        tenant = self._store.update(tenant_id, status=TenantStatus.SUSPENDED)
        return tenant is not None

    def activate(self, tenant_id: str) -> bool:
        """Activate tenant."""
        tenant = self._store.update(tenant_id, status=TenantStatus.ACTIVE)
        return tenant is not None

    def delete(self, tenant_id: str) -> bool:
        """Delete tenant."""
        return self._store.delete(tenant_id)

    def list_all(
        self,
        status: Optional[TenantStatus] = None,
        tier: Optional[TenantTier] = None,
        limit: int = 100,
    ) -> List[Tenant]:
        """List tenants."""
        return self._store.list_all(status, tier, limit)

    def context(self, tenant_id: str) -> TenantContext:
        """Get tenant context."""
        tenant = self._store.get(tenant_id)
        if not tenant:
            raise TenantNotFoundError(f"Tenant not found: {tenant_id}")
        return TenantContext(tenant)

    def context_by_slug(self, slug: str) -> TenantContext:
        """Get tenant context by slug."""
        tenant = self._store.get_by_slug(slug)
        if not tenant:
            raise TenantNotFoundError(f"Tenant not found: {slug}")
        return TenantContext(tenant)

    def upgrade_tier(self, tenant_id: str, new_tier: TenantTier) -> Optional[Tenant]:
        """Upgrade tenant tier."""
        tenant = self._store.get(tenant_id)
        if not tenant:
            return None

        tenant.tier = new_tier
        tenant.limits = TenantLimits.for_tier(new_tier)
        tenant.updated_at = time.time()
        return tenant

    def check_limit(self, tenant_id: str, limit_type: str) -> bool:
        """Check if tenant is within limits."""
        tenant = self._store.get(tenant_id)
        if not tenant:
            return False

        usage = self._usage.get(tenant_id, {}).get(limit_type, 0)

        limits = {
            "users": tenant.limits.max_users,
            "storage": tenant.limits.max_storage_gb,
            "api_calls": tenant.limits.max_api_calls_per_day,
            "concurrent": tenant.limits.max_concurrent_requests,
        }

        max_limit = limits.get(limit_type)
        if max_limit is None:
            return True

        return usage < max_limit

    def increment_usage(self, tenant_id: str, usage_type: str, amount: int = 1) -> int:
        """Increment usage counter."""
        with self._lock:
            if tenant_id not in self._usage:
                self._usage[tenant_id] = {}
            if usage_type not in self._usage[tenant_id]:
                self._usage[tenant_id][usage_type] = 0
            self._usage[tenant_id][usage_type] += amount
            return self._usage[tenant_id][usage_type]

    def get_usage(self, tenant_id: str) -> Dict[str, int]:
        """Get tenant usage."""
        return self._usage.get(tenant_id, {}).copy()

    def reset_usage(self, tenant_id: str, usage_type: Optional[str] = None) -> None:
        """Reset usage counters."""
        with self._lock:
            if tenant_id in self._usage:
                if usage_type:
                    self._usage[tenant_id][usage_type] = 0
                else:
                    self._usage[tenant_id] = {}

    def get_stats(self) -> dict:
        """Get manager statistics."""
        tenants = self._store.list_all()
        by_status = {}
        by_tier = {}

        for t in tenants:
            by_status[t.status.value] = by_status.get(t.status.value, 0) + 1
            by_tier[t.tier.value] = by_tier.get(t.tier.value, 0) + 1

        return {
            "total_tenants": len(tenants),
            "by_status": by_status,
            "by_tier": by_tier,
        }


# Custom exceptions
class TenantError(Exception):
    """Base tenant error."""
    pass


class TenantNotFoundError(TenantError):
    """Tenant not found."""
    pass


class TenantAlreadyExistsError(TenantError):
    """Tenant already exists."""
    pass


class NoTenantContextError(TenantError):
    """No tenant context set."""
    pass


class TenantLimitExceededError(TenantError):
    """Tenant limit exceeded."""
    pass


# Singleton instance
tenant_manager = TenantManager()


# Convenience functions
def create_tenant(
    name: str,
    slug: str,
    tier: TenantTier = TenantTier.FREE,
) -> Tenant:
    """Create tenant using global manager."""
    return tenant_manager.create(name, slug, tier)


def with_tenant(tenant_id: str) -> TenantContext:
    """Get tenant context from global manager."""
    return tenant_manager.context(tenant_id)


def require_tenant() -> Tenant:
    """Get current tenant or raise error."""
    tenant = get_current_tenant()
    if not tenant:
        raise NoTenantContextError("Tenant context required")
    return tenant


def require_feature(feature: str) -> None:
    """Require tenant has feature."""
    tenant = require_tenant()
    if not tenant.has_feature(feature):
        raise TenantLimitExceededError(f"Feature not available: {feature}")
