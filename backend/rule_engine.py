"""
Rule Engine - Business rules evaluation system.

Provides a flexible rule engine for defining and evaluating
business rules, conditions, and actions.
"""

from __future__ import annotations

import re
import operator
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Generic, TypeVar
from threading import RLock


T = TypeVar("T")


class RuleOperator(Enum):
    """Available operators for rule conditions."""

    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    GREATER_THAN = "greater_than"
    GREATER_EQUAL = "greater_equal"
    LESS_THAN = "less_than"
    LESS_EQUAL = "less_equal"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    MATCHES = "matches"
    IN = "in"
    NOT_IN = "not_in"
    IS_NULL = "is_null"
    IS_NOT_NULL = "is_not_null"
    BETWEEN = "between"


class LogicalOperator(Enum):
    """Logical operators for combining conditions."""

    AND = "and"
    OR = "or"
    NOT = "not"
    XOR = "xor"


class RulePriority(Enum):
    """Rule priority levels."""

    CRITICAL = 0
    HIGH = 1
    MEDIUM = 2
    LOW = 3
    DEFAULT = 4


@dataclass
class RuleContext:
    """Context for rule evaluation containing facts and metadata."""

    facts: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)

    def get_fact(self, path: str, default: Any = None) -> Any:
        """Get a fact value by dot-notation path."""
        parts = path.split(".")
        value = self.facts

        for part in parts:
            if isinstance(value, dict) and part in value:
                value = value[part]
            elif hasattr(value, part):
                value = getattr(value, part)
            else:
                return default

        return value

    def set_fact(self, path: str, value: Any) -> None:
        """Set a fact value by dot-notation path."""
        parts = path.split(".")
        target = self.facts

        for part in parts[:-1]:
            if part not in target:
                target[part] = {}
            target = target[part]

        target[parts[-1]] = value

    def has_fact(self, path: str) -> bool:
        """Check if a fact exists."""
        return self.get_fact(path) is not None


@dataclass
class RuleResult:
    """Result of rule evaluation."""

    rule_id: str
    rule_name: str
    matched: bool
    actions_executed: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    execution_time_ms: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class EvaluationResult:
    """Result of evaluating multiple rules."""

    results: list[RuleResult] = field(default_factory=list)
    total_rules: int = 0
    matched_rules: int = 0
    failed_rules: int = 0
    total_time_ms: float = 0.0

    def get_matched(self) -> list[RuleResult]:
        """Get all matched rules."""
        return [r for r in self.results if r.matched]

    def get_failed(self) -> list[RuleResult]:
        """Get all failed rules."""
        return [r for r in self.results if r.errors]

    def any_matched(self) -> bool:
        """Check if any rule matched."""
        return self.matched_rules > 0

    def all_matched(self) -> bool:
        """Check if all rules matched."""
        return self.matched_rules == self.total_rules


class Condition(ABC):
    """Base class for rule conditions."""

    @abstractmethod
    def evaluate(self, context: RuleContext) -> bool:
        """Evaluate the condition against the context."""
        pass

    def __and__(self, other: Condition) -> CompositeCondition:
        """Combine conditions with AND."""
        return CompositeCondition(LogicalOperator.AND, [self, other])

    def __or__(self, other: Condition) -> CompositeCondition:
        """Combine conditions with OR."""
        return CompositeCondition(LogicalOperator.OR, [self, other])

    def __invert__(self) -> CompositeCondition:
        """Negate the condition."""
        return CompositeCondition(LogicalOperator.NOT, [self])


@dataclass
class SimpleCondition(Condition):
    """A simple condition comparing a fact to a value."""

    fact_path: str
    op: RuleOperator
    value: Any = None

    def evaluate(self, context: RuleContext) -> bool:
        """Evaluate the simple condition."""
        fact_value = context.get_fact(self.fact_path)

        operators_map: dict[RuleOperator, Callable[[Any, Any], bool]] = {
            RuleOperator.EQUALS: operator.eq,
            RuleOperator.NOT_EQUALS: operator.ne,
            RuleOperator.GREATER_THAN: operator.gt,
            RuleOperator.GREATER_EQUAL: operator.ge,
            RuleOperator.LESS_THAN: operator.lt,
            RuleOperator.LESS_EQUAL: operator.le,
        }

        if self.op in operators_map:
            if fact_value is None:
                return False
            return operators_map[self.op](fact_value, self.value)

        if self.op == RuleOperator.CONTAINS:
            if fact_value is None:
                return False
            return self.value in fact_value

        if self.op == RuleOperator.NOT_CONTAINS:
            if fact_value is None:
                return True
            return self.value not in fact_value

        if self.op == RuleOperator.STARTS_WITH:
            if not isinstance(fact_value, str):
                return False
            return fact_value.startswith(str(self.value))

        if self.op == RuleOperator.ENDS_WITH:
            if not isinstance(fact_value, str):
                return False
            return fact_value.endswith(str(self.value))

        if self.op == RuleOperator.MATCHES:
            if not isinstance(fact_value, str):
                return False
            return bool(re.match(str(self.value), fact_value))

        if self.op == RuleOperator.IN:
            return fact_value in self.value

        if self.op == RuleOperator.NOT_IN:
            return fact_value not in self.value

        if self.op == RuleOperator.IS_NULL:
            return fact_value is None

        if self.op == RuleOperator.IS_NOT_NULL:
            return fact_value is not None

        if self.op == RuleOperator.BETWEEN:
            if fact_value is None or not isinstance(self.value, (list, tuple)):
                return False
            return self.value[0] <= fact_value <= self.value[1]

        return False


@dataclass
class CompositeCondition(Condition):
    """A composite condition combining multiple conditions."""

    logical_op: LogicalOperator
    conditions: list[Condition] = field(default_factory=list)

    def evaluate(self, context: RuleContext) -> bool:
        """Evaluate the composite condition."""
        if not self.conditions:
            return True

        if self.logical_op == LogicalOperator.AND:
            return all(c.evaluate(context) for c in self.conditions)

        if self.logical_op == LogicalOperator.OR:
            return any(c.evaluate(context) for c in self.conditions)

        if self.logical_op == LogicalOperator.NOT:
            return not self.conditions[0].evaluate(context)

        if self.logical_op == LogicalOperator.XOR:
            results = [c.evaluate(context) for c in self.conditions]
            return sum(results) == 1

        return False

    def add_condition(self, condition: Condition) -> CompositeCondition:
        """Add a condition to the composite."""
        return CompositeCondition(
            self.logical_op,
            [*self.conditions, condition]
        )


class FunctionCondition(Condition):
    """A condition using a custom function."""

    def __init__(self, func: Callable[[RuleContext], bool], name: str = ""):
        self.func = func
        self.name = name or func.__name__

    def evaluate(self, context: RuleContext) -> bool:
        """Evaluate using the custom function."""
        return self.func(context)


class Action(ABC):
    """Base class for rule actions."""

    @abstractmethod
    def execute(self, context: RuleContext) -> str:
        """Execute the action and return a description."""
        pass


class SetFactAction(Action):
    """Action that sets a fact value."""

    def __init__(self, fact_path: str, value: Any):
        self.fact_path = fact_path
        self.value = value

    def execute(self, context: RuleContext) -> str:
        """Set the fact value."""
        context.set_fact(self.fact_path, self.value)
        return f"Set {self.fact_path} = {self.value}"


class FunctionAction(Action):
    """Action that executes a custom function."""

    def __init__(self, func: Callable[[RuleContext], Any], name: str = ""):
        self.func = func
        self.name = name or func.__name__

    def execute(self, context: RuleContext) -> str:
        """Execute the custom function."""
        result = self.func(context)
        return f"Executed {self.name}: {result}"


class CompositeAction(Action):
    """Action that executes multiple actions."""

    def __init__(self, actions: list[Action]):
        self.actions = actions

    def execute(self, context: RuleContext) -> str:
        """Execute all actions."""
        results = [action.execute(context) for action in self.actions]
        return "; ".join(results)


@dataclass
class Rule:
    """A business rule with conditions and actions."""

    id: str
    name: str
    condition: Condition
    actions: list[Action] = field(default_factory=list)
    priority: RulePriority = RulePriority.DEFAULT
    enabled: bool = True
    description: str = ""
    tags: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def evaluate(self, context: RuleContext) -> RuleResult:
        """Evaluate the rule against the context."""
        import time
        start = time.perf_counter()

        result = RuleResult(
            rule_id=self.id,
            rule_name=self.name,
            matched=False
        )

        if not self.enabled:
            result.metadata["skipped"] = "disabled"
            result.execution_time_ms = (time.perf_counter() - start) * 1000
            return result

        try:
            matched = self.condition.evaluate(context)
            result.matched = matched

            if matched:
                for action in self.actions:
                    try:
                        action_result = action.execute(context)
                        result.actions_executed.append(action_result)
                    except Exception as e:
                        result.errors.append(f"Action error: {e}")

        except Exception as e:
            result.errors.append(f"Condition error: {e}")

        result.execution_time_ms = (time.perf_counter() - start) * 1000
        return result


class RuleBuilder:
    """Fluent builder for creating rules."""

    def __init__(self, rule_id: str):
        self._id = rule_id
        self._name = rule_id
        self._condition: Condition | None = None
        self._actions: list[Action] = []
        self._priority = RulePriority.DEFAULT
        self._enabled = True
        self._description = ""
        self._tags: list[str] = []
        self._metadata: dict[str, Any] = {}

    def name(self, name: str) -> RuleBuilder:
        """Set the rule name."""
        self._name = name
        return self

    def when(self, condition: Condition) -> RuleBuilder:
        """Set the rule condition."""
        self._condition = condition
        return self

    def when_fact(self, fact_path: str, op: RuleOperator, value: Any = None) -> RuleBuilder:
        """Add a simple condition."""
        condition = SimpleCondition(fact_path, op, value)
        if self._condition is None:
            self._condition = condition
        else:
            self._condition = self._condition & condition
        return self

    def then_set(self, fact_path: str, value: Any) -> RuleBuilder:
        """Add a set fact action."""
        self._actions.append(SetFactAction(fact_path, value))
        return self

    def then_call(self, func: Callable[[RuleContext], Any], name: str = "") -> RuleBuilder:
        """Add a function action."""
        self._actions.append(FunctionAction(func, name))
        return self

    def priority(self, priority: RulePriority) -> RuleBuilder:
        """Set the rule priority."""
        self._priority = priority
        return self

    def description(self, description: str) -> RuleBuilder:
        """Set the rule description."""
        self._description = description
        return self

    def tags(self, *tags: str) -> RuleBuilder:
        """Add tags to the rule."""
        self._tags.extend(tags)
        return self

    def metadata(self, key: str, value: Any) -> RuleBuilder:
        """Add metadata to the rule."""
        self._metadata[key] = value
        return self

    def enabled(self, enabled: bool = True) -> RuleBuilder:
        """Set enabled status."""
        self._enabled = enabled
        return self

    def disabled(self) -> RuleBuilder:
        """Disable the rule."""
        self._enabled = False
        return self

    def build(self) -> Rule:
        """Build the rule."""
        if self._condition is None:
            self._condition = FunctionCondition(lambda _: True, "always_true")

        return Rule(
            id=self._id,
            name=self._name,
            condition=self._condition,
            actions=self._actions,
            priority=self._priority,
            enabled=self._enabled,
            description=self._description,
            tags=self._tags,
            metadata=self._metadata
        )


class RuleSet:
    """A collection of rules with evaluation strategies."""

    def __init__(self, name: str = "default"):
        self.name = name
        self._rules: list[Rule] = []
        self._lock = RLock()

    def add_rule(self, rule: Rule) -> None:
        """Add a rule to the set."""
        with self._lock:
            self._rules.append(rule)
            self._rules.sort(key=lambda r: r.priority.value)

    def remove_rule(self, rule_id: str) -> bool:
        """Remove a rule by ID."""
        with self._lock:
            for i, rule in enumerate(self._rules):
                if rule.id == rule_id:
                    del self._rules[i]
                    return True
            return False

    def get_rule(self, rule_id: str) -> Rule | None:
        """Get a rule by ID."""
        with self._lock:
            for rule in self._rules:
                if rule.id == rule_id:
                    return rule
            return None

    def get_rules_by_tag(self, tag: str) -> list[Rule]:
        """Get all rules with a specific tag."""
        with self._lock:
            return [r for r in self._rules if tag in r.tags]

    @property
    def rules(self) -> list[Rule]:
        """Get all rules."""
        with self._lock:
            return list(self._rules)

    def evaluate_all(self, context: RuleContext) -> EvaluationResult:
        """Evaluate all rules."""
        import time
        start = time.perf_counter()

        result = EvaluationResult()
        result.total_rules = len(self._rules)

        with self._lock:
            for rule in self._rules:
                rule_result = rule.evaluate(context)
                result.results.append(rule_result)

                if rule_result.matched:
                    result.matched_rules += 1
                if rule_result.errors:
                    result.failed_rules += 1

        result.total_time_ms = (time.perf_counter() - start) * 1000
        return result

    def evaluate_first_match(self, context: RuleContext) -> EvaluationResult:
        """Evaluate until first matching rule."""
        import time
        start = time.perf_counter()

        result = EvaluationResult()

        with self._lock:
            result.total_rules = len(self._rules)

            for rule in self._rules:
                rule_result = rule.evaluate(context)
                result.results.append(rule_result)

                if rule_result.errors:
                    result.failed_rules += 1

                if rule_result.matched:
                    result.matched_rules = 1
                    break

        result.total_time_ms = (time.perf_counter() - start) * 1000
        return result


class DecisionTable:
    """A decision table for tabular rule evaluation."""

    def __init__(self, name: str, input_columns: list[str], output_columns: list[str]):
        self.name = name
        self.input_columns = input_columns
        self.output_columns = output_columns
        self._rows: list[tuple[dict[str, Any], dict[str, Any]]] = []
        self._lock = RLock()

    def add_row(self, inputs: dict[str, Any], outputs: dict[str, Any]) -> None:
        """Add a row to the decision table."""
        with self._lock:
            self._rows.append((inputs, outputs))

    def evaluate(self, context: RuleContext) -> dict[str, Any] | None:
        """Evaluate the decision table and return outputs for first match."""
        with self._lock:
            for inputs, outputs in self._rows:
                if self._match_row(inputs, context):
                    return dict(outputs)
            return None

    def evaluate_all(self, context: RuleContext) -> list[dict[str, Any]]:
        """Evaluate and return all matching outputs."""
        results = []
        with self._lock:
            for inputs, outputs in self._rows:
                if self._match_row(inputs, context):
                    results.append(dict(outputs))
        return results

    def _match_row(self, inputs: dict[str, Any], context: RuleContext) -> bool:
        """Check if a row matches the context."""
        for col, expected in inputs.items():
            actual = context.get_fact(col)

            if expected == "*":
                continue

            if isinstance(expected, str) and expected.startswith(">="):
                threshold = float(expected[2:])
                if actual is None or float(actual) < threshold:
                    return False
            elif isinstance(expected, str) and expected.startswith("<="):
                threshold = float(expected[2:])
                if actual is None or float(actual) > threshold:
                    return False
            elif isinstance(expected, str) and expected.startswith(">"):
                threshold = float(expected[1:])
                if actual is None or float(actual) <= threshold:
                    return False
            elif isinstance(expected, str) and expected.startswith("<"):
                threshold = float(expected[1:])
                if actual is None or float(actual) >= threshold:
                    return False
            elif actual != expected:
                return False

        return True

    @property
    def row_count(self) -> int:
        """Get the number of rows."""
        with self._lock:
            return len(self._rows)


class RuleEngine:
    """Main rule engine for managing and evaluating rules."""

    def __init__(self):
        self._rule_sets: dict[str, RuleSet] = {}
        self._decision_tables: dict[str, DecisionTable] = {}
        self._global_facts: dict[str, Any] = {}
        self._lock = RLock()
        self._hooks: dict[str, list[Callable[[RuleContext, RuleResult], None]]] = {
            "before_evaluate": [],
            "after_evaluate": [],
            "on_match": [],
            "on_error": [],
        }

    def create_rule_set(self, name: str) -> RuleSet:
        """Create a new rule set."""
        with self._lock:
            if name in self._rule_sets:
                raise ValueError(f"Rule set {name} already exists")
            rule_set = RuleSet(name)
            self._rule_sets[name] = rule_set
            return rule_set

    def get_rule_set(self, name: str) -> RuleSet | None:
        """Get a rule set by name."""
        with self._lock:
            return self._rule_sets.get(name)

    def delete_rule_set(self, name: str) -> bool:
        """Delete a rule set."""
        with self._lock:
            if name in self._rule_sets:
                del self._rule_sets[name]
                return True
            return False

    def add_decision_table(self, table: DecisionTable) -> None:
        """Add a decision table."""
        with self._lock:
            self._decision_tables[table.name] = table

    def get_decision_table(self, name: str) -> DecisionTable | None:
        """Get a decision table by name."""
        with self._lock:
            return self._decision_tables.get(name)

    def set_global_fact(self, key: str, value: Any) -> None:
        """Set a global fact available to all evaluations."""
        with self._lock:
            self._global_facts[key] = value

    def get_global_fact(self, key: str, default: Any = None) -> Any:
        """Get a global fact."""
        with self._lock:
            return self._global_facts.get(key, default)

    def add_hook(self, event: str, callback: Callable[[RuleContext, RuleResult], None]) -> None:
        """Add an event hook."""
        if event in self._hooks:
            self._hooks[event].append(callback)

    def _trigger_hooks(self, event: str, context: RuleContext, result: RuleResult | None = None) -> None:
        """Trigger event hooks."""
        dummy_result = result or RuleResult(rule_id="", rule_name="", matched=False)
        for callback in self._hooks.get(event, []):
            try:
                callback(context, dummy_result)
            except Exception:
                pass

    def create_context(self, facts: dict[str, Any] | None = None) -> RuleContext:
        """Create a new rule context with global facts."""
        merged_facts = dict(self._global_facts)
        if facts:
            merged_facts.update(facts)
        return RuleContext(facts=merged_facts)

    def evaluate(
        self,
        rule_set_name: str,
        context: RuleContext,
        strategy: str = "all"
    ) -> EvaluationResult:
        """Evaluate a rule set with the given strategy."""
        rule_set = self.get_rule_set(rule_set_name)
        if rule_set is None:
            return EvaluationResult()

        self._trigger_hooks("before_evaluate", context)

        if strategy == "first_match":
            result = rule_set.evaluate_first_match(context)
        else:
            result = rule_set.evaluate_all(context)

        for rule_result in result.results:
            if rule_result.matched:
                self._trigger_hooks("on_match", context, rule_result)
            if rule_result.errors:
                self._trigger_hooks("on_error", context, rule_result)

        self._trigger_hooks("after_evaluate", context)
        return result

    def evaluate_decision(
        self,
        table_name: str,
        context: RuleContext,
        all_matches: bool = False
    ) -> dict[str, Any] | list[dict[str, Any]] | None:
        """Evaluate a decision table."""
        table = self.get_decision_table(table_name)
        if table is None:
            return [] if all_matches else None

        if all_matches:
            return table.evaluate_all(context)
        return table.evaluate(context)


class RuleSerializer:
    """Serialize and deserialize rules to/from dictionaries."""

    @staticmethod
    def rule_to_dict(rule: Rule) -> dict[str, Any]:
        """Convert a rule to a dictionary."""
        return {
            "id": rule.id,
            "name": rule.name,
            "priority": rule.priority.name,
            "enabled": rule.enabled,
            "description": rule.description,
            "tags": rule.tags,
            "metadata": rule.metadata,
        }

    @staticmethod
    def rule_set_to_dict(rule_set: RuleSet) -> dict[str, Any]:
        """Convert a rule set to a dictionary."""
        return {
            "name": rule_set.name,
            "rules": [RuleSerializer.rule_to_dict(r) for r in rule_set.rules],
            "rule_count": len(rule_set.rules),
        }

    @staticmethod
    def evaluation_result_to_dict(result: EvaluationResult) -> dict[str, Any]:
        """Convert evaluation result to a dictionary."""
        return {
            "total_rules": result.total_rules,
            "matched_rules": result.matched_rules,
            "failed_rules": result.failed_rules,
            "total_time_ms": result.total_time_ms,
            "results": [
                {
                    "rule_id": r.rule_id,
                    "rule_name": r.rule_name,
                    "matched": r.matched,
                    "actions_executed": r.actions_executed,
                    "errors": r.errors,
                    "execution_time_ms": r.execution_time_ms,
                }
                for r in result.results
            ],
        }


# Convenience functions for creating conditions
def fact(path: str) -> FactExpression:
    """Create a fact expression for fluent condition building."""
    return FactExpression(path)


class FactExpression:
    """Fluent interface for building conditions."""

    def __init__(self, path: str):
        self.path = path

    def equals(self, value: Any) -> SimpleCondition:
        """Create an equals condition."""
        return SimpleCondition(self.path, RuleOperator.EQUALS, value)

    def not_equals(self, value: Any) -> SimpleCondition:
        """Create a not equals condition."""
        return SimpleCondition(self.path, RuleOperator.NOT_EQUALS, value)

    def greater_than(self, value: Any) -> SimpleCondition:
        """Create a greater than condition."""
        return SimpleCondition(self.path, RuleOperator.GREATER_THAN, value)

    def greater_equal(self, value: Any) -> SimpleCondition:
        """Create a greater or equal condition."""
        return SimpleCondition(self.path, RuleOperator.GREATER_EQUAL, value)

    def less_than(self, value: Any) -> SimpleCondition:
        """Create a less than condition."""
        return SimpleCondition(self.path, RuleOperator.LESS_THAN, value)

    def less_equal(self, value: Any) -> SimpleCondition:
        """Create a less or equal condition."""
        return SimpleCondition(self.path, RuleOperator.LESS_EQUAL, value)

    def contains(self, value: Any) -> SimpleCondition:
        """Create a contains condition."""
        return SimpleCondition(self.path, RuleOperator.CONTAINS, value)

    def starts_with(self, value: str) -> SimpleCondition:
        """Create a starts with condition."""
        return SimpleCondition(self.path, RuleOperator.STARTS_WITH, value)

    def ends_with(self, value: str) -> SimpleCondition:
        """Create an ends with condition."""
        return SimpleCondition(self.path, RuleOperator.ENDS_WITH, value)

    def matches(self, pattern: str) -> SimpleCondition:
        """Create a regex match condition."""
        return SimpleCondition(self.path, RuleOperator.MATCHES, pattern)

    def is_in(self, values: list[Any]) -> SimpleCondition:
        """Create an in condition."""
        return SimpleCondition(self.path, RuleOperator.IN, values)

    def not_in(self, values: list[Any]) -> SimpleCondition:
        """Create a not in condition."""
        return SimpleCondition(self.path, RuleOperator.NOT_IN, values)

    def is_null(self) -> SimpleCondition:
        """Create an is null condition."""
        return SimpleCondition(self.path, RuleOperator.IS_NULL)

    def is_not_null(self) -> SimpleCondition:
        """Create an is not null condition."""
        return SimpleCondition(self.path, RuleOperator.IS_NOT_NULL)

    def between(self, low: Any, high: Any) -> SimpleCondition:
        """Create a between condition."""
        return SimpleCondition(self.path, RuleOperator.BETWEEN, [low, high])


# Export all public classes and functions
__all__ = [
    "RuleOperator",
    "LogicalOperator",
    "RulePriority",
    "RuleContext",
    "RuleResult",
    "EvaluationResult",
    "Condition",
    "SimpleCondition",
    "CompositeCondition",
    "FunctionCondition",
    "Action",
    "SetFactAction",
    "FunctionAction",
    "CompositeAction",
    "Rule",
    "RuleBuilder",
    "RuleSet",
    "DecisionTable",
    "RuleEngine",
    "RuleSerializer",
    "fact",
    "FactExpression",
]
