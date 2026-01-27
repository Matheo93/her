"""
Dependency Graph - Sprint 793

Dependency resolution and topological sorting.

Features:
- Directed acyclic graph (DAG)
- Topological sorting
- Cycle detection
- Dependency resolution
- Parallel execution planning
- Visualization
"""

from dataclasses import dataclass, field
from typing import (
    Dict, List, Set, Any, Optional, Callable, TypeVar, Generic,
    Iterator, Tuple
)
from enum import Enum
from collections import deque
import logging
import threading

logger = logging.getLogger(__name__)


T = TypeVar("T")


class CycleError(Exception):
    """Raised when a cycle is detected in the graph."""
    def __init__(self, cycle: List[str]):
        self.cycle = cycle
        path = " -> ".join(cycle)
        super().__init__("Cycle detected: " + path)


class NodeNotFoundError(Exception):
    """Raised when a node is not found."""
    pass


class DependencyError(Exception):
    """Raised for dependency resolution errors."""
    pass


@dataclass
class Node(Generic[T]):
    """Graph node with data and metadata."""
    id: str
    data: Optional[T] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __hash__(self) -> int:
        return hash(self.id)

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Node):
            return self.id == other.id
        return False


@dataclass
class Edge:
    """Directed edge between nodes."""
    source: str
    target: str
    weight: float = 1.0
    metadata: Dict[str, Any] = field(default_factory=dict)


class DependencyGraph(Generic[T]):
    """Directed acyclic graph for dependency management.

    Usage:
        graph = DependencyGraph[Task]()

        # Add nodes
        graph.add_node("task_a", task_a_data)
        graph.add_node("task_b", task_b_data)
        graph.add_node("task_c", task_c_data)

        # Add dependencies (task_b depends on task_a)
        graph.add_dependency("task_b", "task_a")
        graph.add_dependency("task_c", "task_a")
        graph.add_dependency("task_c", "task_b")

        # Get execution order
        order = graph.topological_sort()  # ["task_a", "task_b", "task_c"]

        # Get parallel execution groups
        groups = graph.parallel_groups()  # [["task_a"], ["task_b"], ["task_c"]]

        # Get all dependencies of a node
        deps = graph.get_all_dependencies("task_c")  # {"task_a", "task_b"}
    """

    def __init__(self):
        self._nodes: Dict[str, Node[T]] = {}
        self._edges: Dict[str, Set[str]] = {}  # node_id -> set of dependencies
        self._reverse_edges: Dict[str, Set[str]] = {}  # node_id -> set of dependents
        self._lock = threading.RLock()

    def add_node(
        self,
        node_id: str,
        data: Optional[T] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Node[T]:
        """Add a node to the graph."""
        with self._lock:
            if node_id in self._nodes:
                # Update existing node
                node = self._nodes[node_id]
                if data is not None:
                    node.data = data
                if metadata:
                    node.metadata.update(metadata)
                return node

            node = Node(id=node_id, data=data, metadata=metadata or {})
            self._nodes[node_id] = node
            self._edges[node_id] = set()
            self._reverse_edges[node_id] = set()
            return node

    def remove_node(self, node_id: str) -> bool:
        """Remove a node and all its edges."""
        with self._lock:
            if node_id not in self._nodes:
                return False

            # Remove all edges involving this node
            for dep in list(self._edges.get(node_id, [])):
                self._reverse_edges[dep].discard(node_id)

            for dependent in list(self._reverse_edges.get(node_id, [])):
                self._edges[dependent].discard(node_id)

            del self._nodes[node_id]
            del self._edges[node_id]
            del self._reverse_edges[node_id]
            return True

    def add_dependency(self, node_id: str, depends_on: str) -> None:
        """Add a dependency (node_id depends on depends_on)."""
        with self._lock:
            # Auto-create nodes if they don't exist
            if node_id not in self._nodes:
                self.add_node(node_id)
            if depends_on not in self._nodes:
                self.add_node(depends_on)

            # Check for self-dependency
            if node_id == depends_on:
                raise CycleError([node_id, depends_on])

            # Add edge
            self._edges[node_id].add(depends_on)
            self._reverse_edges[depends_on].add(node_id)

            # Check for cycles
            if self._has_cycle_from(node_id):
                # Remove the edge we just added
                self._edges[node_id].discard(depends_on)
                self._reverse_edges[depends_on].discard(node_id)
                cycle = self._find_cycle(node_id, depends_on)
                raise CycleError(cycle)

    def remove_dependency(self, node_id: str, depends_on: str) -> bool:
        """Remove a dependency."""
        with self._lock:
            if node_id not in self._edges:
                return False
            if depends_on not in self._edges[node_id]:
                return False

            self._edges[node_id].discard(depends_on)
            self._reverse_edges[depends_on].discard(node_id)
            return True

    def _has_cycle_from(self, start: str) -> bool:
        """Check if there's a cycle reachable from start using DFS."""
        visited: Set[str] = set()
        rec_stack: Set[str] = set()

        def dfs(node: str) -> bool:
            visited.add(node)
            rec_stack.add(node)

            for dep in self._edges.get(node, []):
                if dep not in visited:
                    if dfs(dep):
                        return True
                elif dep in rec_stack:
                    return True

            rec_stack.discard(node)
            return False

        return dfs(start)

    def _find_cycle(self, from_node: str, to_node: str) -> List[str]:
        """Find the cycle path."""
        path = [from_node]
        visited: Set[str] = {from_node}
        queue: deque = deque([(to_node, [to_node])])

        while queue:
            current, current_path = queue.popleft()
            if current == from_node:
                return path + current_path

            for dep in self._edges.get(current, []):
                if dep not in visited:
                    visited.add(dep)
                    queue.append((dep, current_path + [dep]))

        return path + [to_node, from_node]

    def has_cycle(self) -> bool:
        """Check if the graph has any cycle."""
        visited: Set[str] = set()
        rec_stack: Set[str] = set()

        def dfs(node: str) -> bool:
            visited.add(node)
            rec_stack.add(node)

            for dep in self._edges.get(node, []):
                if dep not in visited:
                    if dfs(dep):
                        return True
                elif dep in rec_stack:
                    return True

            rec_stack.discard(node)
            return False

        with self._lock:
            for node in self._nodes:
                if node not in visited:
                    if dfs(node):
                        return True
            return False

    def get_node(self, node_id: str) -> Optional[Node[T]]:
        """Get a node by ID."""
        return self._nodes.get(node_id)

    def get_dependencies(self, node_id: str) -> Set[str]:
        """Get direct dependencies of a node."""
        with self._lock:
            return set(self._edges.get(node_id, set()))

    def get_dependents(self, node_id: str) -> Set[str]:
        """Get direct dependents of a node."""
        with self._lock:
            return set(self._reverse_edges.get(node_id, set()))

    def get_all_dependencies(self, node_id: str) -> Set[str]:
        """Get all transitive dependencies of a node."""
        with self._lock:
            result: Set[str] = set()
            queue: deque = deque([node_id])
            visited: Set[str] = {node_id}

            while queue:
                current = queue.popleft()
                for dep in self._edges.get(current, []):
                    if dep not in visited:
                        visited.add(dep)
                        result.add(dep)
                        queue.append(dep)

            return result

    def get_all_dependents(self, node_id: str) -> Set[str]:
        """Get all transitive dependents of a node."""
        with self._lock:
            result: Set[str] = set()
            queue: deque = deque([node_id])
            visited: Set[str] = {node_id}

            while queue:
                current = queue.popleft()
                for dep in self._reverse_edges.get(current, []):
                    if dep not in visited:
                        visited.add(dep)
                        result.add(dep)
                        queue.append(dep)

            return result

    def topological_sort(self) -> List[str]:
        """Get topological ordering of nodes (Kahn's algorithm)."""
        with self._lock:
            # Calculate in-degrees
            in_degree: Dict[str, int] = {node: 0 for node in self._nodes}
            for node in self._nodes:
                for dep in self._edges[node]:
                    pass  # dep is a dependency, not dependent
                for dependent in self._reverse_edges[node]:
                    in_degree[dependent] = in_degree.get(dependent, 0) + 1

            # Recalculate properly
            in_degree = {node: len(self._edges[node]) for node in self._nodes}

            # Queue nodes with no dependencies
            queue: deque = deque()
            for node, degree in in_degree.items():
                if degree == 0:
                    queue.append(node)

            result: List[str] = []
            while queue:
                node = queue.popleft()
                result.append(node)

                for dependent in self._reverse_edges[node]:
                    in_degree[dependent] -= 1
                    if in_degree[dependent] == 0:
                        queue.append(dependent)

            if len(result) != len(self._nodes):
                raise CycleError(["Graph contains a cycle"])

            return result

    def parallel_groups(self) -> List[List[str]]:
        """Get parallel execution groups (nodes in same group can run in parallel)."""
        with self._lock:
            result: List[List[str]] = []
            remaining = set(self._nodes.keys())
            completed: Set[str] = set()

            while remaining:
                # Find nodes whose dependencies are all completed
                ready: List[str] = []
                for node in remaining:
                    deps = self._edges[node]
                    if deps.issubset(completed):
                        ready.append(node)

                if not ready:
                    if remaining:
                        raise CycleError(["Graph contains unreachable nodes"])
                    break

                result.append(sorted(ready))
                for node in ready:
                    remaining.discard(node)
                    completed.add(node)

            return result

    def depth(self, node_id: str) -> int:
        """Get the depth of a node (longest path to any leaf)."""
        with self._lock:
            if node_id not in self._nodes:
                raise NodeNotFoundError("Node not found: " + node_id)

            deps = self._edges[node_id]
            if not deps:
                return 0
            return 1 + max(self.depth(dep) for dep in deps)

    def roots(self) -> List[str]:
        """Get root nodes (nodes with no dependents)."""
        with self._lock:
            return [
                node for node, dependents in self._reverse_edges.items()
                if not dependents
            ]

    def leaves(self) -> List[str]:
        """Get leaf nodes (nodes with no dependencies)."""
        with self._lock:
            return [
                node for node, deps in self._edges.items()
                if not deps
            ]

    def subgraph(self, node_ids: Set[str]) -> "DependencyGraph[T]":
        """Create a subgraph with only specified nodes."""
        with self._lock:
            sub = DependencyGraph[T]()

            for node_id in node_ids:
                if node_id in self._nodes:
                    node = self._nodes[node_id]
                    sub.add_node(node_id, node.data, dict(node.metadata))

            for node_id in node_ids:
                if node_id in self._edges:
                    for dep in self._edges[node_id]:
                        if dep in node_ids:
                            sub.add_dependency(node_id, dep)

            return sub

    def reverse(self) -> "DependencyGraph[T]":
        """Create a reversed graph (flip all edges)."""
        with self._lock:
            rev = DependencyGraph[T]()

            for node_id, node in self._nodes.items():
                rev.add_node(node_id, node.data, dict(node.metadata))

            for node_id, deps in self._edges.items():
                for dep in deps:
                    rev.add_dependency(dep, node_id)

            return rev

    def to_dict(self) -> Dict[str, Any]:
        """Export graph as dictionary."""
        with self._lock:
            return {
                "nodes": [
                    {"id": n.id, "data": n.data, "metadata": n.metadata}
                    for n in self._nodes.values()
                ],
                "edges": [
                    {"source": node, "target": dep}
                    for node, deps in self._edges.items()
                    for dep in deps
                ],
            }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DependencyGraph[Any]":
        """Import graph from dictionary."""
        graph: DependencyGraph[Any] = cls()

        for node in data.get("nodes", []):
            graph.add_node(node["id"], node.get("data"), node.get("metadata", {}))

        for edge in data.get("edges", []):
            graph.add_dependency(edge["source"], edge["target"])

        return graph

    def to_dot(self, name: str = "G") -> str:
        """Export as DOT format for Graphviz."""
        with self._lock:
            lines = ["digraph " + name + " {"]
            lines.append("  rankdir=TB;")

            for node_id in self._nodes:
                label = node_id.replace('"', '\\"')
                lines.append('  "' + label + '";')

            for node_id, deps in self._edges.items():
                for dep in deps:
                    src = node_id.replace('"', '\\"')
                    tgt = dep.replace('"', '\\"')
                    lines.append('  "' + src + '" -> "' + tgt + '";')

            lines.append("}")
            return "\n".join(lines)

    def __len__(self) -> int:
        return len(self._nodes)

    def __contains__(self, node_id: str) -> bool:
        return node_id in self._nodes

    def __iter__(self) -> Iterator[str]:
        return iter(self._nodes)

    @property
    def nodes(self) -> List[str]:
        """Get all node IDs."""
        return list(self._nodes.keys())

    @property
    def edge_count(self) -> int:
        """Get total number of edges."""
        return sum(len(deps) for deps in self._edges.values())


class DependencyResolver(Generic[T]):
    """Resolve dependencies and execute in order.

    Usage:
        resolver = DependencyResolver[Task]()

        # Register tasks with dependencies
        resolver.register("compile", compile_task, dependencies=[])
        resolver.register("test", test_task, dependencies=["compile"])
        resolver.register("package", package_task, dependencies=["compile", "test"])

        # Execute all in order
        await resolver.execute_all(executor)

        # Or get execution plan
        plan = resolver.get_execution_plan()
    """

    def __init__(self):
        self._graph: DependencyGraph[T] = DependencyGraph()
        self._executors: Dict[str, Callable[[T], Any]] = {}

    def register(
        self,
        name: str,
        task: T,
        dependencies: Optional[List[str]] = None,
        executor: Optional[Callable[[T], Any]] = None,
    ) -> None:
        """Register a task with dependencies."""
        self._graph.add_node(name, task)
        if executor:
            self._executors[name] = executor

        for dep in dependencies or []:
            self._graph.add_dependency(name, dep)

    def unregister(self, name: str) -> bool:
        """Unregister a task."""
        self._executors.pop(name, None)
        return self._graph.remove_node(name)

    def get_execution_plan(self) -> List[List[str]]:
        """Get parallel execution plan."""
        return self._graph.parallel_groups()

    def get_order(self) -> List[str]:
        """Get sequential execution order."""
        return self._graph.topological_sort()

    def can_execute(self, name: str, completed: Set[str]) -> bool:
        """Check if a task can be executed given completed tasks."""
        deps = self._graph.get_dependencies(name)
        return deps.issubset(completed)

    async def execute_sequential(
        self,
        default_executor: Callable[[str, T], Any],
    ) -> Dict[str, Any]:
        """Execute all tasks sequentially."""
        results: Dict[str, Any] = {}
        order = self.get_order()

        for name in order:
            node = self._graph.get_node(name)
            if node and node.data:
                executor = self._executors.get(name)
                if executor:
                    results[name] = await executor(node.data)
                else:
                    results[name] = await default_executor(name, node.data)

        return results

    async def execute_parallel(
        self,
        default_executor: Callable[[str, T], Any],
        max_concurrency: int = 10,
    ) -> Dict[str, Any]:
        """Execute tasks with maximum parallelism."""
        import asyncio

        results: Dict[str, Any] = {}
        groups = self.get_execution_plan()

        for group in groups:
            tasks = []
            for name in group:
                node = self._graph.get_node(name)
                if node and node.data:
                    executor = self._executors.get(name)
                    if executor:
                        tasks.append((name, executor(node.data)))
                    else:
                        tasks.append((name, default_executor(name, node.data)))

            # Execute group in parallel with semaphore
            semaphore = asyncio.Semaphore(max_concurrency)

            async def run_with_semaphore(name: str, coro: Any) -> Tuple[str, Any]:
                async with semaphore:
                    result = await coro
                    return name, result

            group_results = await asyncio.gather(
                *[run_with_semaphore(name, coro) for name, coro in tasks]
            )

            for name, result in group_results:
                results[name] = result

        return results

    @property
    def graph(self) -> DependencyGraph[T]:
        """Get underlying graph."""
        return self._graph


class BuildDependencyGraph(DependencyGraph[str]):
    """Specialized graph for build dependencies."""

    def add_target(
        self,
        target: str,
        sources: Optional[List[str]] = None,
        command: Optional[str] = None,
    ) -> None:
        """Add a build target."""
        self.add_node(target, command, {"sources": sources or []})
        for source in sources or []:
            self.add_dependency(target, source)

    def get_build_order(self, target: str) -> List[str]:
        """Get build order for a specific target."""
        deps = self.get_all_dependencies(target)
        deps.add(target)
        sub = self.subgraph(deps)
        return sub.topological_sort()

    def needs_rebuild(
        self,
        target: str,
        get_mtime: Callable[[str], float],
    ) -> bool:
        """Check if target needs rebuild based on modification times."""
        node = self.get_node(target)
        if not node:
            return True

        try:
            target_mtime = get_mtime(target)
        except Exception:
            return True  # Target doesn't exist

        deps = self.get_dependencies(target)
        for dep in deps:
            try:
                dep_mtime = get_mtime(dep)
                if dep_mtime > target_mtime:
                    return True
            except Exception:
                continue  # Dependency doesn't exist

        return False
