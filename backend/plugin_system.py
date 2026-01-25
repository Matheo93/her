"""
Plugin System - Sprint 629

Extensible plugin architecture.

Features:
- Plugin discovery
- Plugin lifecycle
- Hook system
- Plugin dependencies
- Configuration
"""

import time
import importlib
import inspect
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Callable, Type
from enum import Enum
from threading import Lock
from abc import ABC, abstractmethod


class PluginStatus(str, Enum):
    """Plugin status."""
    DISCOVERED = "discovered"
    LOADED = "loaded"
    ENABLED = "enabled"
    DISABLED = "disabled"
    ERROR = "error"


class HookPriority(int, Enum):
    """Hook execution priority."""
    FIRST = 0
    HIGH = 25
    NORMAL = 50
    LOW = 75
    LAST = 100


@dataclass
class PluginInfo:
    """Plugin metadata."""
    name: str
    version: str
    description: str = ""
    author: str = ""
    dependencies: List[str] = field(default_factory=list)
    hooks: List[str] = field(default_factory=list)
    config_schema: Dict[str, Any] = field(default_factory=dict)


@dataclass
class HookRegistration:
    """A registered hook handler."""
    plugin_name: str
    hook_name: str
    handler: Callable
    priority: HookPriority = HookPriority.NORMAL
    enabled: bool = True


class Plugin(ABC):
    """Base plugin class.

    All plugins must inherit from this class.

    Usage:
        class MyPlugin(Plugin):
            @property
            def info(self) -> PluginInfo:
                return PluginInfo(
                    name="my_plugin",
                    version="1.0.0",
                    description="My plugin"
                )

            async def on_load(self, config: dict):
                # Initialize plugin
                pass

            async def on_unload(self):
                # Cleanup
                pass
    """

    @property
    @abstractmethod
    def info(self) -> PluginInfo:
        """Return plugin metadata."""
        pass

    async def on_load(self, config: Dict[str, Any]):
        """Called when plugin is loaded."""
        pass

    async def on_unload(self):
        """Called when plugin is unloaded."""
        pass

    async def on_enable(self):
        """Called when plugin is enabled."""
        pass

    async def on_disable(self):
        """Called when plugin is disabled."""
        pass


@dataclass
class PluginInstance:
    """A loaded plugin instance."""
    info: PluginInfo
    instance: Plugin
    status: PluginStatus = PluginStatus.DISCOVERED
    config: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    loaded_at: Optional[float] = None


class PluginManager:
    """Plugin management system.

    Usage:
        manager = PluginManager()

        # Register a plugin class
        manager.register_plugin(MyPlugin)

        # Load and enable plugin
        await manager.load_plugin("my_plugin", config={})
        await manager.enable_plugin("my_plugin")

        # Use hooks
        manager.register_hook("my_plugin", "on_message", handler)
        await manager.execute_hook("on_message", message="hello")
    """

    def __init__(self):
        """Initialize plugin manager."""
        self._plugins: Dict[str, PluginInstance] = {}
        self._plugin_classes: Dict[str, Type[Plugin]] = {}
        self._hooks: Dict[str, List[HookRegistration]] = {}
        self._lock = Lock()

    def register_plugin(self, plugin_class: Type[Plugin]):
        """Register a plugin class.

        Args:
            plugin_class: Plugin class to register
        """
        # Create temporary instance to get info
        temp = plugin_class()
        info = temp.info

        with self._lock:
            self._plugin_classes[info.name] = plugin_class
            self._plugins[info.name] = PluginInstance(
                info=info,
                instance=temp,
                status=PluginStatus.DISCOVERED,
            )

    def discover_plugins(self, module_path: str) -> List[str]:
        """Discover plugins in a module.

        Args:
            module_path: Module path to scan

        Returns:
            List of discovered plugin names
        """
        discovered = []

        try:
            module = importlib.import_module(module_path)

            for name, obj in inspect.getmembers(module):
                if (
                    inspect.isclass(obj)
                    and issubclass(obj, Plugin)
                    and obj is not Plugin
                ):
                    self.register_plugin(obj)
                    temp = obj()
                    discovered.append(temp.info.name)

        except ImportError as e:
            print(f"Failed to import module {module_path}: {e}")

        return discovered

    async def load_plugin(
        self,
        name: str,
        config: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Load a plugin.

        Args:
            name: Plugin name
            config: Plugin configuration

        Returns:
            True if loaded successfully
        """
        with self._lock:
            plugin = self._plugins.get(name)
            if not plugin:
                return False

            if plugin.status == PluginStatus.LOADED:
                return True

        # Check dependencies
        for dep in plugin.info.dependencies:
            if dep not in self._plugins:
                plugin.error = f"Missing dependency: {dep}"
                plugin.status = PluginStatus.ERROR
                return False

            dep_plugin = self._plugins[dep]
            if dep_plugin.status not in (PluginStatus.LOADED, PluginStatus.ENABLED):
                plugin.error = f"Dependency not loaded: {dep}"
                plugin.status = PluginStatus.ERROR
                return False

        try:
            plugin.config = config or {}
            await plugin.instance.on_load(plugin.config)
            plugin.status = PluginStatus.LOADED
            plugin.loaded_at = time.time()
            plugin.error = None
            return True

        except Exception as e:
            plugin.status = PluginStatus.ERROR
            plugin.error = str(e)
            return False

    async def unload_plugin(self, name: str) -> bool:
        """Unload a plugin.

        Args:
            name: Plugin name

        Returns:
            True if unloaded
        """
        with self._lock:
            plugin = self._plugins.get(name)
            if not plugin:
                return False

        if plugin.status == PluginStatus.ENABLED:
            await self.disable_plugin(name)

        try:
            await plugin.instance.on_unload()
            plugin.status = PluginStatus.DISCOVERED
            plugin.loaded_at = None

            # Remove hooks
            self._remove_plugin_hooks(name)

            return True

        except Exception as e:
            plugin.error = str(e)
            return False

    async def enable_plugin(self, name: str) -> bool:
        """Enable a plugin.

        Args:
            name: Plugin name

        Returns:
            True if enabled
        """
        with self._lock:
            plugin = self._plugins.get(name)
            if not plugin:
                return False

        if plugin.status != PluginStatus.LOADED:
            if not await self.load_plugin(name, plugin.config):
                return False

        try:
            await plugin.instance.on_enable()
            plugin.status = PluginStatus.ENABLED
            return True

        except Exception as e:
            plugin.error = str(e)
            return False

    async def disable_plugin(self, name: str) -> bool:
        """Disable a plugin.

        Args:
            name: Plugin name

        Returns:
            True if disabled
        """
        with self._lock:
            plugin = self._plugins.get(name)
            if not plugin:
                return False

        if plugin.status != PluginStatus.ENABLED:
            return True

        try:
            await plugin.instance.on_disable()
            plugin.status = PluginStatus.DISABLED
            return True

        except Exception as e:
            plugin.error = str(e)
            return False

    def register_hook(
        self,
        plugin_name: str,
        hook_name: str,
        handler: Callable,
        priority: HookPriority = HookPriority.NORMAL
    ):
        """Register a hook handler.

        Args:
            plugin_name: Plugin name
            hook_name: Hook name
            handler: Handler function
            priority: Execution priority
        """
        registration = HookRegistration(
            plugin_name=plugin_name,
            hook_name=hook_name,
            handler=handler,
            priority=priority,
        )

        with self._lock:
            if hook_name not in self._hooks:
                self._hooks[hook_name] = []
            self._hooks[hook_name].append(registration)
            self._hooks[hook_name].sort(key=lambda h: h.priority.value)

    def unregister_hook(self, plugin_name: str, hook_name: str):
        """Unregister a hook handler.

        Args:
            plugin_name: Plugin name
            hook_name: Hook name
        """
        with self._lock:
            if hook_name in self._hooks:
                self._hooks[hook_name] = [
                    h for h in self._hooks[hook_name]
                    if h.plugin_name != plugin_name
                ]

    def _remove_plugin_hooks(self, plugin_name: str):
        """Remove all hooks for a plugin.

        Args:
            plugin_name: Plugin name
        """
        with self._lock:
            for hook_name in list(self._hooks.keys()):
                self._hooks[hook_name] = [
                    h for h in self._hooks[hook_name]
                    if h.plugin_name != plugin_name
                ]

    async def execute_hook(
        self,
        hook_name: str,
        **kwargs
    ) -> List[Any]:
        """Execute all handlers for a hook.

        Args:
            hook_name: Hook name
            **kwargs: Arguments to pass to handlers

        Returns:
            List of handler results
        """
        with self._lock:
            handlers = self._hooks.get(hook_name, [])
            handlers = [h for h in handlers if h.enabled]

        results = []
        for handler in handlers:
            # Check if plugin is enabled
            plugin = self._plugins.get(handler.plugin_name)
            if not plugin or plugin.status != PluginStatus.ENABLED:
                continue

            try:
                if inspect.iscoroutinefunction(handler.handler):
                    result = await handler.handler(**kwargs)
                else:
                    result = handler.handler(**kwargs)
                results.append(result)

            except Exception as e:
                print(f"Hook {hook_name} handler error: {e}")
                results.append(None)

        return results

    async def execute_hook_filter(
        self,
        hook_name: str,
        value: Any,
        **kwargs
    ) -> Any:
        """Execute hook as a filter chain.

        Each handler receives the result of the previous handler.

        Args:
            hook_name: Hook name
            value: Initial value
            **kwargs: Additional arguments

        Returns:
            Filtered value
        """
        with self._lock:
            handlers = self._hooks.get(hook_name, [])
            handlers = [h for h in handlers if h.enabled]

        for handler in handlers:
            plugin = self._plugins.get(handler.plugin_name)
            if not plugin or plugin.status != PluginStatus.ENABLED:
                continue

            try:
                if inspect.iscoroutinefunction(handler.handler):
                    value = await handler.handler(value, **kwargs)
                else:
                    value = handler.handler(value, **kwargs)

            except Exception as e:
                print(f"Hook filter {hook_name} error: {e}")

        return value

    def get_plugin(self, name: str) -> Optional[Dict[str, Any]]:
        """Get plugin info.

        Args:
            name: Plugin name

        Returns:
            Plugin info or None
        """
        with self._lock:
            plugin = self._plugins.get(name)
            if not plugin:
                return None

            return {
                "name": plugin.info.name,
                "version": plugin.info.version,
                "description": plugin.info.description,
                "author": plugin.info.author,
                "status": plugin.status.value,
                "dependencies": plugin.info.dependencies,
                "hooks": plugin.info.hooks,
                "config": plugin.config,
                "error": plugin.error,
                "loaded_at": plugin.loaded_at,
            }

    def list_plugins(
        self,
        status: Optional[PluginStatus] = None
    ) -> List[Dict[str, Any]]:
        """List all plugins.

        Args:
            status: Filter by status

        Returns:
            List of plugin info
        """
        with self._lock:
            plugins = list(self._plugins.values())

        if status:
            plugins = [p for p in plugins if p.status == status]

        return [
            {
                "name": p.info.name,
                "version": p.info.version,
                "description": p.info.description,
                "status": p.status.value,
                "error": p.error,
            }
            for p in plugins
        ]

    def list_hooks(self) -> Dict[str, List[Dict[str, Any]]]:
        """List all registered hooks.

        Returns:
            Dict of hook name to handlers
        """
        with self._lock:
            return {
                hook_name: [
                    {
                        "plugin": h.plugin_name,
                        "priority": h.priority.name,
                        "enabled": h.enabled,
                    }
                    for h in handlers
                ]
                for hook_name, handlers in self._hooks.items()
            }

    def get_stats(self) -> Dict[str, Any]:
        """Get plugin statistics.

        Returns:
            Statistics dict
        """
        with self._lock:
            plugins = list(self._plugins.values())
            hooks = self._hooks

        by_status = {}
        for status in PluginStatus:
            by_status[status.value] = len([p for p in plugins if p.status == status])

        return {
            "total_plugins": len(plugins),
            "by_status": by_status,
            "total_hooks": sum(len(h) for h in hooks.values()),
            "hook_types": list(hooks.keys()),
        }


# Singleton instance
plugin_manager = PluginManager()


# Built-in example plugin
class ExamplePlugin(Plugin):
    """Example plugin for testing."""

    @property
    def info(self) -> PluginInfo:
        return PluginInfo(
            name="example",
            version="1.0.0",
            description="Example plugin for testing",
            author="System",
            hooks=["on_message", "on_response"],
        )

    async def on_load(self, config: Dict[str, Any]):
        print(f"Example plugin loaded with config: {config}")

    async def on_enable(self):
        # Register hooks
        plugin_manager.register_hook(
            "example",
            "on_message",
            self._on_message,
            HookPriority.NORMAL
        )

    async def on_disable(self):
        plugin_manager.unregister_hook("example", "on_message")

    def _on_message(self, message: str) -> str:
        return f"[Example] {message}"


# Register example plugin
plugin_manager.register_plugin(ExamplePlugin)
