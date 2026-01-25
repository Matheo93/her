"""
Permission System - Sprint 725

Role-based access control implementation.

Features:
- Roles and permissions
- Resource-based access
- Permission inheritance
- Dynamic permissions
- Audit logging
"""

import time
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Set, Union
)
from enum import Enum, auto
import threading
from functools import wraps


class Action(str, Enum):
    """Standard permission actions."""
    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    LIST = "list"
    EXECUTE = "execute"
    ADMIN = "admin"


@dataclass
class Permission:
    """Permission definition."""
    resource: str
    action: str
    conditions: Optional[Dict[str, Any]] = None

    def __hash__(self):
        return hash((self.resource, self.action))

    def __eq__(self, other):
        if not isinstance(other, Permission):
            return False
        return self.resource == other.resource and self.action == other.action

    def matches(self, resource: str, action: str, context: Optional[Dict] = None) -> bool:
        """Check if permission matches request."""
        # Wildcard matching
        if self.resource != "*" and self.resource != resource:
            # Check pattern matching
            if not self._matches_pattern(self.resource, resource):
                return False

        if self.action != "*" and self.action != action:
            return False

        # Check conditions
        if self.conditions and context:
            return self._check_conditions(context)

        return True

    def _matches_pattern(self, pattern: str, resource: str) -> bool:
        """Check if pattern matches resource."""
        if pattern.endswith("*"):
            prefix = pattern[:-1]
            return resource.startswith(prefix)
        return pattern == resource

    def _check_conditions(self, context: Dict) -> bool:
        """Check conditional permissions."""
        for key, expected in self.conditions.items():
            actual = context.get(key)
            if actual != expected:
                return False
        return True

    def to_string(self) -> str:
        """Convert to string representation."""
        return f"{self.resource}:{self.action}"


@dataclass
class Role:
    """Role definition."""
    name: str
    permissions: Set[Permission] = field(default_factory=set)
    parent: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def add_permission(self, resource: str, action: str, conditions: Optional[Dict] = None) -> None:
        """Add a permission to the role."""
        self.permissions.add(Permission(resource, action, conditions))

    def remove_permission(self, resource: str, action: str) -> None:
        """Remove a permission from the role."""
        self.permissions.discard(Permission(resource, action))

    def has_permission(
        self,
        resource: str,
        action: str,
        context: Optional[Dict] = None,
    ) -> bool:
        """Check if role has permission."""
        for perm in self.permissions:
            if perm.matches(resource, action, context):
                return True
        return False


@dataclass
class User:
    """User with roles and permissions."""
    id: str
    roles: Set[str] = field(default_factory=set)
    direct_permissions: Set[Permission] = field(default_factory=set)
    denied_permissions: Set[Permission] = field(default_factory=set)
    attributes: Dict[str, Any] = field(default_factory=dict)

    def add_role(self, role_name: str) -> None:
        """Add a role to the user."""
        self.roles.add(role_name)

    def remove_role(self, role_name: str) -> None:
        """Remove a role from the user."""
        self.roles.discard(role_name)

    def add_permission(self, resource: str, action: str) -> None:
        """Add direct permission."""
        self.direct_permissions.add(Permission(resource, action))

    def deny_permission(self, resource: str, action: str) -> None:
        """Deny a permission (overrides role permissions)."""
        self.denied_permissions.add(Permission(resource, action))


@dataclass
class AuditEntry:
    """Audit log entry."""
    user_id: str
    resource: str
    action: str
    allowed: bool
    timestamp: float = field(default_factory=time.time)
    context: Dict[str, Any] = field(default_factory=dict)
    reason: str = ""


class PermissionManager:
    """Permission management system.

    Usage:
        pm = PermissionManager()

        # Define roles
        pm.create_role("admin")
        pm.create_role("editor", parent="viewer")
        pm.create_role("viewer")

        # Assign permissions to roles
        pm.grant_role_permission("admin", "*", "*")
        pm.grant_role_permission("editor", "posts", "create")
        pm.grant_role_permission("editor", "posts", "update")
        pm.grant_role_permission("viewer", "posts", "read")

        # Create user
        user = pm.create_user("user123")
        pm.assign_role(user.id, "editor")

        # Check permissions
        if pm.check(user.id, "posts", "create"):
            print("User can create posts!")
    """

    def __init__(self, enable_audit: bool = True):
        """Initialize permission manager."""
        self._roles: Dict[str, Role] = {}
        self._users: Dict[str, User] = {}
        self._audit_log: List[AuditEntry] = []
        self._enable_audit = enable_audit
        self._lock = threading.Lock()
        self._permission_callbacks: List[Callable] = []

    def create_role(
        self,
        name: str,
        parent: Optional[str] = None,
        **metadata,
    ) -> Role:
        """Create a new role.

        Args:
            name: Role name
            parent: Parent role for inheritance
            **metadata: Additional metadata

        Returns:
            Created Role
        """
        with self._lock:
            if name in self._roles:
                return self._roles[name]

            role = Role(name=name, parent=parent, metadata=metadata)
            self._roles[name] = role
            return role

    def get_role(self, name: str) -> Optional[Role]:
        """Get a role by name."""
        return self._roles.get(name)

    def delete_role(self, name: str) -> bool:
        """Delete a role."""
        with self._lock:
            if name in self._roles:
                # Remove role from all users
                for user in self._users.values():
                    user.roles.discard(name)
                del self._roles[name]
                return True
            return False

    def grant_role_permission(
        self,
        role_name: str,
        resource: str,
        action: str,
        conditions: Optional[Dict] = None,
    ) -> bool:
        """Grant permission to a role.

        Args:
            role_name: Role name
            resource: Resource name (or * for all)
            action: Action name (or * for all)
            conditions: Optional conditions

        Returns:
            True if granted
        """
        role = self._roles.get(role_name)
        if not role:
            return False

        role.add_permission(resource, action, conditions)
        return True

    def revoke_role_permission(
        self,
        role_name: str,
        resource: str,
        action: str,
    ) -> bool:
        """Revoke permission from a role."""
        role = self._roles.get(role_name)
        if not role:
            return False

        role.remove_permission(resource, action)
        return True

    def create_user(
        self,
        user_id: str,
        roles: Optional[List[str]] = None,
        **attributes,
    ) -> User:
        """Create a new user.

        Args:
            user_id: User ID
            roles: Initial roles
            **attributes: User attributes

        Returns:
            Created User
        """
        with self._lock:
            if user_id in self._users:
                return self._users[user_id]

            user = User(
                id=user_id,
                roles=set(roles or []),
                attributes=attributes,
            )
            self._users[user_id] = user
            return user

    def get_user(self, user_id: str) -> Optional[User]:
        """Get a user by ID."""
        return self._users.get(user_id)

    def delete_user(self, user_id: str) -> bool:
        """Delete a user."""
        with self._lock:
            if user_id in self._users:
                del self._users[user_id]
                return True
            return False

    def assign_role(self, user_id: str, role_name: str) -> bool:
        """Assign a role to a user.

        Args:
            user_id: User ID
            role_name: Role to assign

        Returns:
            True if assigned
        """
        user = self._users.get(user_id)
        if not user or role_name not in self._roles:
            return False

        user.add_role(role_name)
        return True

    def unassign_role(self, user_id: str, role_name: str) -> bool:
        """Remove a role from a user."""
        user = self._users.get(user_id)
        if not user:
            return False

        user.remove_role(role_name)
        return True

    def grant_user_permission(
        self,
        user_id: str,
        resource: str,
        action: str,
    ) -> bool:
        """Grant direct permission to user."""
        user = self._users.get(user_id)
        if not user:
            return False

        user.add_permission(resource, action)
        return True

    def deny_user_permission(
        self,
        user_id: str,
        resource: str,
        action: str,
    ) -> bool:
        """Deny permission for user."""
        user = self._users.get(user_id)
        if not user:
            return False

        user.deny_permission(resource, action)
        return True

    def check(
        self,
        user_id: str,
        resource: str,
        action: str,
        context: Optional[Dict] = None,
    ) -> bool:
        """Check if user has permission.

        Args:
            user_id: User ID
            resource: Resource to access
            action: Action to perform
            context: Optional context for conditions

        Returns:
            True if allowed
        """
        user = self._users.get(user_id)
        if not user:
            self._log_access(user_id, resource, action, False, "User not found")
            return False

        # Check denied permissions first
        for denied in user.denied_permissions:
            if denied.matches(resource, action, context):
                self._log_access(user_id, resource, action, False, "Explicitly denied")
                return False

        # Check direct permissions
        for perm in user.direct_permissions:
            if perm.matches(resource, action, context):
                self._log_access(user_id, resource, action, True, "Direct permission")
                return True

        # Check role permissions (including inherited)
        for role_name in user.roles:
            if self._check_role_permission(role_name, resource, action, context):
                self._log_access(user_id, resource, action, True, f"Role: {role_name}")
                return True

        self._log_access(user_id, resource, action, False, "No matching permission")
        return False

    def _check_role_permission(
        self,
        role_name: str,
        resource: str,
        action: str,
        context: Optional[Dict],
    ) -> bool:
        """Check role permission including inheritance."""
        role = self._roles.get(role_name)
        if not role:
            return False

        # Check role permissions
        if role.has_permission(resource, action, context):
            return True

        # Check parent role
        if role.parent:
            return self._check_role_permission(role.parent, resource, action, context)

        return False

    def _log_access(
        self,
        user_id: str,
        resource: str,
        action: str,
        allowed: bool,
        reason: str,
    ) -> None:
        """Log access attempt."""
        if not self._enable_audit:
            return

        entry = AuditEntry(
            user_id=user_id,
            resource=resource,
            action=action,
            allowed=allowed,
            reason=reason,
        )

        with self._lock:
            self._audit_log.append(entry)

        # Notify callbacks
        for callback in self._permission_callbacks:
            callback(entry)

    def on_permission_check(self, callback: Callable[[AuditEntry], None]) -> None:
        """Register permission check callback."""
        self._permission_callbacks.append(callback)

    def get_user_permissions(self, user_id: str) -> List[str]:
        """Get all effective permissions for a user."""
        user = self._users.get(user_id)
        if not user:
            return []

        permissions = set()

        # Direct permissions
        for perm in user.direct_permissions:
            permissions.add(perm.to_string())

        # Role permissions
        for role_name in user.roles:
            role_perms = self._get_role_permissions(role_name)
            permissions.update(role_perms)

        # Remove denied
        for denied in user.denied_permissions:
            permissions.discard(denied.to_string())

        return sorted(list(permissions))

    def _get_role_permissions(self, role_name: str) -> Set[str]:
        """Get all permissions for a role including inherited."""
        role = self._roles.get(role_name)
        if not role:
            return set()

        permissions = {p.to_string() for p in role.permissions}

        if role.parent:
            permissions.update(self._get_role_permissions(role.parent))

        return permissions

    def get_audit_log(
        self,
        user_id: Optional[str] = None,
        resource: Optional[str] = None,
        limit: int = 100,
    ) -> List[AuditEntry]:
        """Get audit log entries.

        Args:
            user_id: Filter by user
            resource: Filter by resource
            limit: Max entries

        Returns:
            List of audit entries
        """
        entries = self._audit_log.copy()

        if user_id:
            entries = [e for e in entries if e.user_id == user_id]

        if resource:
            entries = [e for e in entries if e.resource == resource]

        return entries[-limit:]

    def clear_audit_log(self) -> None:
        """Clear the audit log."""
        with self._lock:
            self._audit_log.clear()


def requires_permission(
    resource: str,
    action: str,
    get_user_id: Optional[Callable] = None,
):
    """Decorator for permission checking.

    Usage:
        @requires_permission("posts", "create")
        async def create_post(request):
            ...
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get user ID from function arguments or callback
            user_id = None
            if get_user_id:
                user_id = get_user_id(*args, **kwargs)
            elif "user_id" in kwargs:
                user_id = kwargs["user_id"]
            elif args and hasattr(args[0], "user_id"):
                user_id = args[0].user_id

            if not user_id:
                raise PermissionDenied("User not authenticated")

            if not permission_manager.check(user_id, resource, action):
                raise PermissionDenied(f"Permission denied: {resource}:{action}")

            return await func(*args, **kwargs)
        return wrapper
    return decorator


class PermissionDenied(Exception):
    """Permission denied exception."""
    pass


# Singleton instance
permission_manager = PermissionManager()


# Convenience functions
def create_role(name: str, parent: Optional[str] = None) -> Role:
    """Create a role using global manager."""
    return permission_manager.create_role(name, parent)


def create_user(user_id: str, roles: Optional[List[str]] = None) -> User:
    """Create a user using global manager."""
    return permission_manager.create_user(user_id, roles)


def check_permission(user_id: str, resource: str, action: str) -> bool:
    """Check permission using global manager."""
    return permission_manager.check(user_id, resource, action)
