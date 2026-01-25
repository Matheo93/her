"""
Query Builder - Sprint 737

SQL-like query builder for data filtering.

Features:
- Fluent API
- Conditions and operators
- Joins and relations
- Ordering and pagination
- Type-safe queries
"""

from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic, Union, Tuple
)
from enum import Enum
from abc import ABC, abstractmethod


T = TypeVar("T")


class Operator(str, Enum):
    """Comparison operators."""
    EQ = "="
    NE = "!="
    GT = ">"
    GTE = ">="
    LT = "<"
    LTE = "<="
    LIKE = "LIKE"
    IN = "IN"
    NOT_IN = "NOT IN"
    IS_NULL = "IS NULL"
    IS_NOT_NULL = "IS NOT NULL"
    BETWEEN = "BETWEEN"


class SortOrder(str, Enum):
    """Sort directions."""
    ASC = "ASC"
    DESC = "DESC"


class JoinType(str, Enum):
    """Join types."""
    INNER = "INNER"
    LEFT = "LEFT"
    RIGHT = "RIGHT"
    FULL = "FULL"


@dataclass
class Condition:
    """Query condition."""
    field: str
    operator: Operator
    value: Any = None
    value2: Any = None  # For BETWEEN

    def to_sql(self, param_index: int = 0) -> Tuple[str, List[Any]]:
        """Convert to SQL clause."""
        params = []

        if self.operator == Operator.IS_NULL:
            return f"{self.field} IS NULL", []
        elif self.operator == Operator.IS_NOT_NULL:
            return f"{self.field} IS NOT NULL", []
        elif self.operator == Operator.IN:
            placeholders = ", ".join([f"${i + param_index + 1}" for i in range(len(self.value))])
            return f"{self.field} IN ({placeholders})", list(self.value)
        elif self.operator == Operator.NOT_IN:
            placeholders = ", ".join([f"${i + param_index + 1}" for i in range(len(self.value))])
            return f"{self.field} NOT IN ({placeholders})", list(self.value)
        elif self.operator == Operator.BETWEEN:
            return f"{self.field} BETWEEN ${param_index + 1} AND ${param_index + 2}", [self.value, self.value2]
        elif self.operator == Operator.LIKE:
            return f"{self.field} LIKE ${param_index + 1}", [self.value]
        else:
            return f"{self.field} {self.operator.value} ${param_index + 1}", [self.value]

    def matches(self, record: Dict[str, Any]) -> bool:
        """Check if record matches condition."""
        field_value = record.get(self.field)

        if self.operator == Operator.EQ:
            return field_value == self.value
        elif self.operator == Operator.NE:
            return field_value != self.value
        elif self.operator == Operator.GT:
            return field_value is not None and field_value > self.value
        elif self.operator == Operator.GTE:
            return field_value is not None and field_value >= self.value
        elif self.operator == Operator.LT:
            return field_value is not None and field_value < self.value
        elif self.operator == Operator.LTE:
            return field_value is not None and field_value <= self.value
        elif self.operator == Operator.LIKE:
            if field_value is None:
                return False
            pattern = self.value.replace("%", ".*").replace("_", ".")
            import re
            return bool(re.match(f"^{pattern}$", str(field_value), re.IGNORECASE))
        elif self.operator == Operator.IN:
            return field_value in self.value
        elif self.operator == Operator.NOT_IN:
            return field_value not in self.value
        elif self.operator == Operator.IS_NULL:
            return field_value is None
        elif self.operator == Operator.IS_NOT_NULL:
            return field_value is not None
        elif self.operator == Operator.BETWEEN:
            return self.value <= field_value <= self.value2 if field_value else False

        return False


@dataclass
class ConditionGroup:
    """Group of conditions with AND/OR logic."""
    conditions: List[Union[Condition, "ConditionGroup"]] = field(default_factory=list)
    logic: str = "AND"  # AND or OR

    def add(self, condition: Union[Condition, "ConditionGroup"]) -> "ConditionGroup":
        """Add condition to group."""
        self.conditions.append(condition)
        return self

    def to_sql(self, param_index: int = 0) -> Tuple[str, List[Any]]:
        """Convert to SQL clause."""
        if not self.conditions:
            return "1=1", []

        parts = []
        params = []
        current_index = param_index

        for cond in self.conditions:
            sql, cond_params = cond.to_sql(current_index)
            parts.append(f"({sql})")
            params.extend(cond_params)
            current_index += len(cond_params)

        return f" {self.logic} ".join(parts), params

    def matches(self, record: Dict[str, Any]) -> bool:
        """Check if record matches all/any conditions."""
        if not self.conditions:
            return True

        results = [c.matches(record) for c in self.conditions]

        if self.logic == "AND":
            return all(results)
        else:  # OR
            return any(results)


@dataclass
class Join:
    """Join definition."""
    table: str
    on_field: str
    foreign_field: str
    join_type: JoinType = JoinType.INNER
    alias: Optional[str] = None

    def to_sql(self) -> str:
        """Convert to SQL clause."""
        alias_str = f" AS {self.alias}" if self.alias else ""
        return f"{self.join_type.value} JOIN {self.table}{alias_str} ON {self.on_field} = {self.foreign_field}"


@dataclass
class OrderBy:
    """Order by clause."""
    field: str
    direction: SortOrder = SortOrder.ASC

    def to_sql(self) -> str:
        """Convert to SQL clause."""
        return f"{self.field} {self.direction.value}"


class QueryBuilder(Generic[T]):
    """Fluent query builder.

    Usage:
        query = (QueryBuilder("users")
            .select("id", "name", "email")
            .where("active", True)
            .where_gt("age", 18)
            .where_like("name", "John%")
            .order_by("created_at", "DESC")
            .limit(10)
            .offset(20))

        # Get SQL
        sql, params = query.to_sql()

        # Or filter in-memory data
        results = query.execute(data)
    """

    def __init__(self, table: str):
        """Initialize query builder."""
        self._table = table
        self._select_fields: List[str] = ["*"]
        self._conditions = ConditionGroup()
        self._or_conditions: List[ConditionGroup] = []
        self._joins: List[Join] = []
        self._order_by: List[OrderBy] = []
        self._group_by: List[str] = []
        self._having: Optional[ConditionGroup] = None
        self._limit: Optional[int] = None
        self._offset: Optional[int] = None
        self._distinct: bool = False

    def select(self, *fields: str) -> "QueryBuilder[T]":
        """Set select fields."""
        self._select_fields = list(fields) if fields else ["*"]
        return self

    def distinct(self) -> "QueryBuilder[T]":
        """Add DISTINCT."""
        self._distinct = True
        return self

    def where(self, field: str, value: Any, operator: Operator = Operator.EQ) -> "QueryBuilder[T]":
        """Add WHERE condition."""
        self._conditions.add(Condition(field, operator, value))
        return self

    def where_eq(self, field: str, value: Any) -> "QueryBuilder[T]":
        """Add equals condition."""
        return self.where(field, value, Operator.EQ)

    def where_ne(self, field: str, value: Any) -> "QueryBuilder[T]":
        """Add not equals condition."""
        return self.where(field, value, Operator.NE)

    def where_gt(self, field: str, value: Any) -> "QueryBuilder[T]":
        """Add greater than condition."""
        return self.where(field, value, Operator.GT)

    def where_gte(self, field: str, value: Any) -> "QueryBuilder[T]":
        """Add greater than or equal condition."""
        return self.where(field, value, Operator.GTE)

    def where_lt(self, field: str, value: Any) -> "QueryBuilder[T]":
        """Add less than condition."""
        return self.where(field, value, Operator.LT)

    def where_lte(self, field: str, value: Any) -> "QueryBuilder[T]":
        """Add less than or equal condition."""
        return self.where(field, value, Operator.LTE)

    def where_like(self, field: str, pattern: str) -> "QueryBuilder[T]":
        """Add LIKE condition."""
        return self.where(field, pattern, Operator.LIKE)

    def where_in(self, field: str, values: List[Any]) -> "QueryBuilder[T]":
        """Add IN condition."""
        return self.where(field, values, Operator.IN)

    def where_not_in(self, field: str, values: List[Any]) -> "QueryBuilder[T]":
        """Add NOT IN condition."""
        return self.where(field, values, Operator.NOT_IN)

    def where_null(self, field: str) -> "QueryBuilder[T]":
        """Add IS NULL condition."""
        self._conditions.add(Condition(field, Operator.IS_NULL))
        return self

    def where_not_null(self, field: str) -> "QueryBuilder[T]":
        """Add IS NOT NULL condition."""
        self._conditions.add(Condition(field, Operator.IS_NOT_NULL))
        return self

    def where_between(self, field: str, low: Any, high: Any) -> "QueryBuilder[T]":
        """Add BETWEEN condition."""
        self._conditions.add(Condition(field, Operator.BETWEEN, low, high))
        return self

    def or_where(self, field: str, value: Any, operator: Operator = Operator.EQ) -> "QueryBuilder[T]":
        """Add OR WHERE condition."""
        or_group = ConditionGroup(logic="OR")
        or_group.add(Condition(field, operator, value))
        self._or_conditions.append(or_group)
        return self

    def and_where(
        self,
        callback: Callable[["QueryBuilder"], "QueryBuilder"],
    ) -> "QueryBuilder[T]":
        """Add nested AND conditions."""
        nested = QueryBuilder(self._table)
        callback(nested)
        self._conditions.add(nested._conditions)
        return self

    def join(
        self,
        table: str,
        on_field: str,
        foreign_field: str,
        join_type: JoinType = JoinType.INNER,
        alias: Optional[str] = None,
    ) -> "QueryBuilder[T]":
        """Add JOIN clause."""
        self._joins.append(Join(table, on_field, foreign_field, join_type, alias))
        return self

    def left_join(
        self,
        table: str,
        on_field: str,
        foreign_field: str,
        alias: Optional[str] = None,
    ) -> "QueryBuilder[T]":
        """Add LEFT JOIN."""
        return self.join(table, on_field, foreign_field, JoinType.LEFT, alias)

    def right_join(
        self,
        table: str,
        on_field: str,
        foreign_field: str,
        alias: Optional[str] = None,
    ) -> "QueryBuilder[T]":
        """Add RIGHT JOIN."""
        return self.join(table, on_field, foreign_field, JoinType.RIGHT, alias)

    def order_by(self, field: str, direction: Union[str, SortOrder] = SortOrder.ASC) -> "QueryBuilder[T]":
        """Add ORDER BY clause."""
        if isinstance(direction, str):
            direction = SortOrder(direction.upper())
        self._order_by.append(OrderBy(field, direction))
        return self

    def order_by_asc(self, field: str) -> "QueryBuilder[T]":
        """Order ascending."""
        return self.order_by(field, SortOrder.ASC)

    def order_by_desc(self, field: str) -> "QueryBuilder[T]":
        """Order descending."""
        return self.order_by(field, SortOrder.DESC)

    def group_by(self, *fields: str) -> "QueryBuilder[T]":
        """Add GROUP BY clause."""
        self._group_by.extend(fields)
        return self

    def having(self, field: str, value: Any, operator: Operator = Operator.EQ) -> "QueryBuilder[T]":
        """Add HAVING clause."""
        if self._having is None:
            self._having = ConditionGroup()
        self._having.add(Condition(field, operator, value))
        return self

    def limit(self, count: int) -> "QueryBuilder[T]":
        """Set LIMIT."""
        self._limit = count
        return self

    def offset(self, count: int) -> "QueryBuilder[T]":
        """Set OFFSET."""
        self._offset = count
        return self

    def to_sql(self) -> Tuple[str, List[Any]]:
        """Generate SQL query.

        Returns:
            Tuple of (sql_string, parameters)
        """
        params = []
        param_index = 0

        # SELECT
        distinct = "DISTINCT " if self._distinct else ""
        fields = ", ".join(self._select_fields)
        sql = f"SELECT {distinct}{fields} FROM {self._table}"

        # JOINS
        for join in self._joins:
            sql += f" {join.to_sql()}"

        # WHERE
        if self._conditions.conditions or self._or_conditions:
            where_sql, where_params = self._conditions.to_sql(param_index)
            param_index += len(where_params)
            params.extend(where_params)

            for or_group in self._or_conditions:
                or_sql, or_params = or_group.to_sql(param_index)
                where_sql = f"({where_sql}) OR ({or_sql})"
                param_index += len(or_params)
                params.extend(or_params)

            sql += f" WHERE {where_sql}"

        # GROUP BY
        if self._group_by:
            sql += f" GROUP BY {', '.join(self._group_by)}"

        # HAVING
        if self._having:
            having_sql, having_params = self._having.to_sql(param_index)
            param_index += len(having_params)
            params.extend(having_params)
            sql += f" HAVING {having_sql}"

        # ORDER BY
        if self._order_by:
            order_clauses = [o.to_sql() for o in self._order_by]
            sql += f" ORDER BY {', '.join(order_clauses)}"

        # LIMIT/OFFSET
        if self._limit is not None:
            sql += f" LIMIT {self._limit}"
        if self._offset is not None:
            sql += f" OFFSET {self._offset}"

        return sql, params

    def execute(self, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Execute query on in-memory data.

        Args:
            data: List of records

        Returns:
            Filtered and sorted records
        """
        results = data

        # Filter
        if self._conditions.conditions:
            results = [r for r in results if self._conditions.matches(r)]

        # Apply OR conditions
        if self._or_conditions:
            or_results = []
            for or_group in self._or_conditions:
                or_results.extend([r for r in data if or_group.matches(r)])
            results = list({id(r): r for r in results + or_results}.values())

        # Sort
        if self._order_by:
            for order in reversed(self._order_by):
                reverse = order.direction == SortOrder.DESC
                results = sorted(
                    results,
                    key=lambda x: (x.get(order.field) is None, x.get(order.field)),
                    reverse=reverse,
                )

        # Offset
        if self._offset:
            results = results[self._offset:]

        # Limit
        if self._limit:
            results = results[: self._limit]

        # Select fields
        if self._select_fields != ["*"]:
            results = [{k: r.get(k) for k in self._select_fields} for r in results]

        return results

    def first(self, data: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Get first result."""
        results = self.limit(1).execute(data)
        return results[0] if results else None

    def count(self, data: List[Dict[str, Any]]) -> int:
        """Count matching records."""
        return len(self.execute(data))

    def exists(self, data: List[Dict[str, Any]]) -> bool:
        """Check if any records match."""
        return self.first(data) is not None


# Convenience functions
def query(table: str) -> QueryBuilder:
    """Create a query builder."""
    return QueryBuilder(table)


def select(*fields: str) -> QueryBuilder:
    """Create a query with select fields."""
    return QueryBuilder("_").select(*fields)
