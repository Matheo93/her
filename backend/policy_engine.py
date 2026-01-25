"""
Policy Engine - Sprint 703

Authorization and access control.

Features:
- Policy definitions
- Rule evaluation
- RBAC/ABAC support
- Policy caching
- Audit logging
"""

import time
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Set, Union
)
from enum import Enum
import threading
from abc import ABC, abstractmethod


class Effect(str, Enum):
    """Policy effect."""
    ALLOW = "allow"
    DENY = "deny"


class Operator(str, Enum):
    """Condition operators."""
    EQUALS = "eq"
    NOT_EQUALS = "ne"
    GREATER_THAN = "gt"
    GREATER_THAN_OR_EQUAL = "gte"
    LESS_THAN = "lt"
    LESS_THAN_OR_EQUAL = "lte"
    IN = "in"
    NOT_IN = "not_in"
    CONTAINS = "contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    EXISTS = "exists"
    MATCHES = "matches"


@dataclass
class Condition:
    """Policy condition."""
    attribute: str
    operator: Operator
    value: Any

    def evaluate(self, context: Dict[str, Any]) -> bool:
        """Evaluate condition against context."""
        # Get attribute value using dot notation
        attr_value = self._get_nested_value(context, self.attribute)

        if self.operator == Operator.EXISTS:
            return attr_value is not None

        if attr_value is None:
            return False

        if self.operator == Operator.EQUALS:
            return attr_value == self.value
        elif self.operator == Operator.NOT_EQUALS:
            return attr_value != self.value
        elif self.operator == Operator.GREATER_THAN:
            return attr_value > self.value
        elif self.operator == Operator.GREATER_THAN_OR_EQUAL:
            return attr_value >= self.value
        elif self.operator == Operator.LESS_THAN:
            return attr_value < self.value
        elif self.operator == Operator.LESS_THAN_OR_EQUAL:
            return attr_value <= self.value
        elif self.operator == Operator.IN:
            return attr_value in self.value
        elif self.operator == Operator.NOT_IN:
            return attr_value not in self.value
        elif self.operator == Operator.CONTAINS:
            return self.value in attr_value
        elif self.operator == Operator.STARTS_WITH:
            return str(attr_value).startswith(str(self.value))
        elif self.operator == Operator.ENDS_WITH:
            return str(attr_value).endswith(str(self.value))
        elif self.operator == Operator.MATCHES:
            import re
            return bool(re.match(self.value, str(attr_value)))

        return False

    def _get_nested_value(self, data: Dict, path: str) -> Any:
        """Get nested dictionary value using dot notation."""
        keys = path.split(".")
        value = data
        for key in keys:
            if isinstance(value, dict):
                value = value.get(key)
            else:
                return None
        return value


@dataclass
class Rule:
    """Policy rule."""
    id: str
    effect: Effect
    actions: Set[str]
    resources: Set[str]
    conditions: List[Condition] = field(default_factory=list)
    priority: int = 0
    description: str = ""

    def matches(
        self,
        action: str,
        resource: str,
        context: Dict[str, Any],
    ) -> bool:
        """Check if rule matches request."""
        # Check action
        if "*" not in self.actions and action not in self.actions:
            return False

        # Check resource
        if not self._matches_resource(resource):
            return False

        # Check conditions
        for condition in self.conditions:
            if not condition.evaluate(context):
                return False

        return True

    def _matches_resource(self, resource: str) -> bool:
        """Check if resource matches patterns."""
        for pattern in self.resources:
            if pattern == "*":
                return True
            if pattern == resource:
                return True
            if pattern.endswith("/*") and resource.startswith(pattern[:-1]):
                return True
        return False


@dataclass
class Policy:
    """Policy definition."""
    id: str
    name: str
    description: str = ""
    rules: List[Rule] = field(default_factory=list)
    version: str = "1.0"
    enabled: bool = True
    priority: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def evaluate(
        self,
        action: str,
        resource: str,
        context: Dict[str, Any],
    ) -> Optional[Effect]:
        """Evaluate policy against request."""
        if not self.enabled:
            return None

        matching_rules = [
            rule for rule in self.rules
            if rule.matches(action, resource, context)
        ]

        if not matching_rules:
            return None

        # Sort by priority (higher first)
        matching_rules.sort(key=lambda r: r.priority, reverse=True)

        # Return effect of highest priority matching rule
        return matching_rules[0].effect


class PolicyBuilder:
    """Builder for creating policies.

    Usage:
        policy = (
            PolicyBuilder("admin-policy", "Admin access")
            .allow(["*"], ["*"])
            .build()
        )

        policy = (
            PolicyBuilder("user-policy", "Regular user access")
            .allow(["read"], ["documents/*"])
            .allow(["write"], ["documents/*"], when=Condition("user.verified", Operator.EQUALS, True))
            .deny(["delete"], ["documents/*"])
            .build()
        )
    """

    def __init__(self, name: str, description: str = ""):
        """Initialize builder."""
        self._name = name
        self._description = description
        self._rules: List[Rule] = []
        self._priority = 0

    def allow(
        self,
        actions: List[str],
        resources: List[str],
        when: Optional[Union[Condition, List[Condition]]] = None,
        priority: int = 0,
    ) -> "PolicyBuilder":
        """Add allow rule."""
        conditions = []
        if when:
            conditions = [when] if isinstance(when, Condition) else when

        rule = Rule(
            id=str(uuid.uuid4()),
            effect=Effect.ALLOW,
            actions=set(actions),
            resources=set(resources),
            conditions=conditions,
            priority=priority,
        )
        self._rules.append(rule)
        return self

    def deny(
        self,
        actions: List[str],
        resources: List[str],
        when: Optional[Union[Condition, List[Condition]]] = None,
        priority: int = 0,
    ) -> "PolicyBuilder":
        """Add deny rule."""
        conditions = []
        if when:
            conditions = [when] if isinstance(when, Condition) else when

        rule = Rule(
            id=str(uuid.uuid4()),
            effect=Effect.DENY,
            actions=set(actions),
            resources=set(resources),
            conditions=conditions,
            priority=priority,
        )
        self._rules.append(rule)
        return self

    def with_priority(self, priority: int) -> "PolicyBuilder":
        """Set policy priority."""
        self._priority = priority
        return self

    def build(self) -> Policy:
        """Build the policy."""
        return Policy(
            id=str(uuid.uuid4()),
            name=self._name,
            description=self._description,
            rules=self._rules,
            priority=self._priority,
        )


@dataclass
class AccessRequest:
    """Access request to evaluate."""
    principal: str
    action: str
    resource: str
    context: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AccessDecision:
    """Access decision result."""
    allowed: bool
    effect: Effect
    matched_policy: Optional[str] = None
    matched_rule: Optional[str] = None
    evaluation_time_ms: float = 0
    reason: str = ""


class PolicyEngine:
    """Main policy evaluation engine.

    Usage:
        engine = PolicyEngine()

        # Attach policies
        engine.attach(admin_policy, principals=["admin:*"])
        engine.attach(user_policy, principals=["user:*"])

        # Evaluate access
        decision = engine.evaluate(
            principal="user:123",
            action="read",
            resource="documents/file.pdf",
            context={"user": {"verified": True}}
        )

        if decision.allowed:
            # Proceed
            pass
    """

    def __init__(self, default_effect: Effect = Effect.DENY):
        """Initialize engine."""
        self._policies: Dict[str, Policy] = {}
        self._attachments: Dict[str, List[str]] = {}  # principal pattern -> policy IDs
        self._default_effect = default_effect
        self._lock = threading.Lock()
        self._cache: Dict[str, AccessDecision] = {}
        self._cache_ttl = 300  # 5 minutes
        self._cache_times: Dict[str, float] = {}
        self._stats = {
            "evaluations": 0,
            "cache_hits": 0,
            "allowed": 0,
            "denied": 0,
        }

    def add_policy(self, policy: Policy) -> "PolicyEngine":
        """Add policy to engine."""
        with self._lock:
            self._policies[policy.id] = policy
        return self

    def remove_policy(self, policy_id: str) -> bool:
        """Remove policy from engine."""
        with self._lock:
            if policy_id in self._policies:
                del self._policies[policy_id]
                return True
        return False

    def attach(
        self,
        policy: Policy,
        principals: List[str],
    ) -> "PolicyEngine":
        """Attach policy to principals."""
        self.add_policy(policy)

        with self._lock:
            for principal in principals:
                if principal not in self._attachments:
                    self._attachments[principal] = []
                if policy.id not in self._attachments[principal]:
                    self._attachments[principal].append(policy.id)

        return self

    def detach(self, policy_id: str, principal: str) -> bool:
        """Detach policy from principal."""
        with self._lock:
            if principal in self._attachments:
                if policy_id in self._attachments[principal]:
                    self._attachments[principal].remove(policy_id)
                    return True
        return False

    def evaluate(
        self,
        principal: str,
        action: str,
        resource: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> AccessDecision:
        """Evaluate access request."""
        start_time = time.time()
        self._stats["evaluations"] += 1

        context = context or {}
        context["principal"] = principal
        context["action"] = action
        context["resource"] = resource

        # Check cache
        cache_key = f"{principal}:{action}:{resource}"
        if cache_key in self._cache:
            if time.time() - self._cache_times[cache_key] < self._cache_ttl:
                self._stats["cache_hits"] += 1
                return self._cache[cache_key]

        # Find applicable policies
        applicable_policies = self._get_applicable_policies(principal)

        # Sort by priority
        applicable_policies.sort(key=lambda p: p.priority, reverse=True)

        # Evaluate policies (deny takes precedence)
        decision = AccessDecision(
            allowed=self._default_effect == Effect.ALLOW,
            effect=self._default_effect,
            reason="Default policy",
        )

        for policy in applicable_policies:
            effect = policy.evaluate(action, resource, context)

            if effect == Effect.DENY:
                decision = AccessDecision(
                    allowed=False,
                    effect=Effect.DENY,
                    matched_policy=policy.id,
                    reason=f"Denied by policy: {policy.name}",
                )
                break

            if effect == Effect.ALLOW:
                decision = AccessDecision(
                    allowed=True,
                    effect=Effect.ALLOW,
                    matched_policy=policy.id,
                    reason=f"Allowed by policy: {policy.name}",
                )

        decision.evaluation_time_ms = (time.time() - start_time) * 1000

        # Update stats
        if decision.allowed:
            self._stats["allowed"] += 1
        else:
            self._stats["denied"] += 1

        # Cache result
        self._cache[cache_key] = decision
        self._cache_times[cache_key] = time.time()

        return decision

    def _get_applicable_policies(self, principal: str) -> List[Policy]:
        """Get policies applicable to principal."""
        policy_ids: Set[str] = set()

        for pattern, pids in self._attachments.items():
            if self._matches_principal(principal, pattern):
                policy_ids.update(pids)

        return [
            self._policies[pid]
            for pid in policy_ids
            if pid in self._policies
        ]

    def _matches_principal(self, principal: str, pattern: str) -> bool:
        """Check if principal matches pattern."""
        if pattern == "*":
            return True
        if pattern == principal:
            return True
        if pattern.endswith(":*"):
            prefix = pattern[:-1]
            return principal.startswith(prefix)
        return False

    def clear_cache(self) -> None:
        """Clear decision cache."""
        self._cache.clear()
        self._cache_times.clear()

    def get_stats(self) -> dict:
        """Get engine statistics."""
        return {
            **self._stats,
            "cache_hit_rate": (
                self._stats["cache_hits"] / self._stats["evaluations"] * 100
                if self._stats["evaluations"] > 0
                else 0
            ),
            "total_policies": len(self._policies),
            "total_attachments": sum(len(v) for v in self._attachments.values()),
        }


# RBAC convenience
class Role:
    """RBAC role definition."""

    def __init__(self, name: str, permissions: List[str]):
        """Initialize role."""
        self.name = name
        self.permissions = set(permissions)

    def has_permission(self, permission: str) -> bool:
        """Check if role has permission."""
        if "*" in self.permissions:
            return True
        return permission in self.permissions


class RBACEngine:
    """Role-based access control.

    Usage:
        rbac = RBACEngine()

        # Define roles
        rbac.add_role("admin", ["*"])
        rbac.add_role("editor", ["read", "write", "publish"])
        rbac.add_role("viewer", ["read"])

        # Assign roles
        rbac.assign_role("user:123", "editor")

        # Check access
        if rbac.can("user:123", "write"):
            # Allowed
            pass
    """

    def __init__(self):
        """Initialize RBAC."""
        self._roles: Dict[str, Role] = {}
        self._assignments: Dict[str, Set[str]] = {}
        self._lock = threading.Lock()

    def add_role(
        self,
        name: str,
        permissions: List[str],
    ) -> "RBACEngine":
        """Add role."""
        self._roles[name] = Role(name, permissions)
        return self

    def assign_role(self, principal: str, role_name: str) -> bool:
        """Assign role to principal."""
        if role_name not in self._roles:
            return False

        with self._lock:
            if principal not in self._assignments:
                self._assignments[principal] = set()
            self._assignments[principal].add(role_name)

        return True

    def unassign_role(self, principal: str, role_name: str) -> bool:
        """Unassign role from principal."""
        with self._lock:
            if principal in self._assignments:
                self._assignments[principal].discard(role_name)
                return True
        return False

    def get_roles(self, principal: str) -> Set[str]:
        """Get roles for principal."""
        return self._assignments.get(principal, set()).copy()

    def can(self, principal: str, permission: str) -> bool:
        """Check if principal has permission."""
        role_names = self._assignments.get(principal, set())

        for role_name in role_names:
            role = self._roles.get(role_name)
            if role and role.has_permission(permission):
                return True

        return False

    def get_permissions(self, principal: str) -> Set[str]:
        """Get all permissions for principal."""
        permissions: Set[str] = set()
        role_names = self._assignments.get(principal, set())

        for role_name in role_names:
            role = self._roles.get(role_name)
            if role:
                permissions.update(role.permissions)

        return permissions


# Singleton instances
policy_engine = PolicyEngine()
rbac_engine = RBACEngine()


# Convenience functions
def allow(
    principal: str,
    action: str,
    resource: str,
    context: Optional[Dict[str, Any]] = None,
) -> bool:
    """Check if access is allowed."""
    decision = policy_engine.evaluate(principal, action, resource, context)
    return decision.allowed


def can(principal: str, permission: str) -> bool:
    """Check RBAC permission."""
    return rbac_engine.can(principal, permission)
