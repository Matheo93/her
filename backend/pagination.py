"""
Pagination - Sprint 755

Pagination utilities for APIs.

Features:
- Offset pagination
- Cursor pagination
- Page-based pagination
- Metadata generation
- FastAPI integration
"""

import base64
import json
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic, Union, Sequence
)
from enum import Enum
from abc import ABC, abstractmethod
import math


T = TypeVar("T")


class PaginationType(str, Enum):
    """Pagination type."""
    OFFSET = "offset"
    CURSOR = "cursor"
    PAGE = "page"


@dataclass
class PageInfo:
    """Pagination metadata."""
    total: int
    page: int = 1
    page_size: int = 20
    total_pages: int = 0
    has_next: bool = False
    has_prev: bool = False
    next_cursor: Optional[str] = None
    prev_cursor: Optional[str] = None

    def __post_init__(self):
        if self.total_pages == 0 and self.page_size > 0:
            self.total_pages = max(1, math.ceil(self.total / self.page_size))
        self.has_next = self.page < self.total_pages
        self.has_prev = self.page > 1

    def to_dict(self) -> dict:
        return {
            "total": self.total,
            "page": self.page,
            "page_size": self.page_size,
            "total_pages": self.total_pages,
            "has_next": self.has_next,
            "has_prev": self.has_prev,
            "next_cursor": self.next_cursor,
            "prev_cursor": self.prev_cursor,
        }


@dataclass
class PaginatedResult(Generic[T]):
    """Paginated result container."""
    items: List[T]
    page_info: PageInfo

    def to_dict(self, item_serializer: Optional[Callable[[T], dict]] = None) -> dict:
        items = [
            item_serializer(item) if item_serializer else item
            for item in self.items
        ]
        return {
            "items": items,
            "page_info": self.page_info.to_dict(),
        }


class Paginator(ABC, Generic[T]):
    """Base paginator."""

    @abstractmethod
    def paginate(
        self,
        items: Sequence[T],
        **kwargs: Any,
    ) -> PaginatedResult[T]:
        """Paginate items."""
        pass


class OffsetPaginator(Paginator[T]):
    """Offset-based pagination.

    Usage:
        paginator = OffsetPaginator(page_size=20)

        result = paginator.paginate(items, offset=40, limit=20)
        # Returns items 40-59
    """

    def __init__(
        self,
        default_limit: int = 20,
        max_limit: int = 100,
    ):
        self._default_limit = default_limit
        self._max_limit = max_limit

    def paginate(
        self,
        items: Sequence[T],
        offset: int = 0,
        limit: Optional[int] = None,
        **kwargs: Any,
    ) -> PaginatedResult[T]:
        limit = min(limit or self._default_limit, self._max_limit)
        total = len(items)

        # Get slice
        end = offset + limit
        page_items = list(items[offset:end])

        # Calculate page number
        page = (offset // limit) + 1 if limit > 0 else 1

        page_info = PageInfo(
            total=total,
            page=page,
            page_size=limit,
        )

        return PaginatedResult(items=page_items, page_info=page_info)


class PagePaginator(Paginator[T]):
    """Page-based pagination.

    Usage:
        paginator = PagePaginator(page_size=20)

        result = paginator.paginate(items, page=3)
        # Returns items for page 3
    """

    def __init__(
        self,
        page_size: int = 20,
        max_page_size: int = 100,
    ):
        self._page_size = page_size
        self._max_page_size = max_page_size

    def paginate(
        self,
        items: Sequence[T],
        page: int = 1,
        page_size: Optional[int] = None,
        **kwargs: Any,
    ) -> PaginatedResult[T]:
        size = min(page_size or self._page_size, self._max_page_size)
        page = max(1, page)
        total = len(items)

        # Calculate offset
        offset = (page - 1) * size
        end = offset + size
        page_items = list(items[offset:end])

        page_info = PageInfo(
            total=total,
            page=page,
            page_size=size,
        )

        return PaginatedResult(items=page_items, page_info=page_info)


class CursorPaginator(Paginator[T]):
    """Cursor-based pagination.

    Usage:
        paginator = CursorPaginator(
            page_size=20,
            cursor_field="id"
        )

        result = paginator.paginate(items)
        # First page

        result = paginator.paginate(
            items,
            cursor=result.page_info.next_cursor
        )
        # Next page
    """

    def __init__(
        self,
        page_size: int = 20,
        cursor_field: str = "id",
        max_page_size: int = 100,
    ):
        self._page_size = page_size
        self._cursor_field = cursor_field
        self._max_page_size = max_page_size

    def _encode_cursor(self, value: Any, direction: str = "next") -> str:
        """Encode cursor value."""
        data = {"value": value, "direction": direction}
        return base64.urlsafe_b64encode(json.dumps(data).encode()).decode()

    def _decode_cursor(self, cursor: str) -> dict:
        """Decode cursor value."""
        try:
            data = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
            return data
        except Exception:
            return {}

    def _get_field_value(self, item: T, field: str) -> Any:
        """Get field value from item."""
        if hasattr(item, field):
            return getattr(item, field)
        if isinstance(item, dict):
            return item.get(field)
        return None

    def paginate(
        self,
        items: Sequence[T],
        cursor: Optional[str] = None,
        page_size: Optional[int] = None,
        **kwargs: Any,
    ) -> PaginatedResult[T]:
        size = min(page_size or self._page_size, self._max_page_size)
        total = len(items)
        items_list = list(items)

        # Find starting position
        start_index = 0
        if cursor:
            cursor_data = self._decode_cursor(cursor)
            cursor_value = cursor_data.get("value")
            if cursor_value is not None:
                for i, item in enumerate(items_list):
                    if self._get_field_value(item, self._cursor_field) == cursor_value:
                        start_index = i + 1
                        break

        # Get page items
        end_index = start_index + size
        page_items = items_list[start_index:end_index]

        # Generate cursors
        next_cursor = None
        prev_cursor = None

        if page_items and end_index < total:
            last_item = page_items[-1]
            next_value = self._get_field_value(last_item, self._cursor_field)
            next_cursor = self._encode_cursor(next_value, "next")

        if start_index > 0 and page_items:
            first_item = page_items[0]
            prev_value = self._get_field_value(first_item, self._cursor_field)
            prev_cursor = self._encode_cursor(prev_value, "prev")

        # Calculate page number (approximate for cursor pagination)
        page = (start_index // size) + 1 if size > 0 else 1

        page_info = PageInfo(
            total=total,
            page=page,
            page_size=size,
            next_cursor=next_cursor,
            prev_cursor=prev_cursor,
        )
        page_info.has_next = next_cursor is not None
        page_info.has_prev = start_index > 0

        return PaginatedResult(items=page_items, page_info=page_info)


@dataclass
class PaginationParams:
    """Request pagination parameters."""
    page: int = 1
    page_size: int = 20
    offset: Optional[int] = None
    cursor: Optional[str] = None
    sort_by: Optional[str] = None
    sort_order: str = "asc"

    def __post_init__(self):
        self.page = max(1, self.page)
        self.page_size = max(1, min(100, self.page_size))
        if self.sort_order not in ("asc", "desc"):
            self.sort_order = "asc"


def paginate(
    items: Sequence[T],
    params: PaginationParams,
    pagination_type: PaginationType = PaginationType.PAGE,
) -> PaginatedResult[T]:
    """Convenience function to paginate items.

    Usage:
        params = PaginationParams(page=2, page_size=10)
        result = paginate(items, params)
    """
    # Sort if needed
    sorted_items = items
    if params.sort_by:
        reverse = params.sort_order == "desc"
        try:
            if hasattr(items[0], params.sort_by):
                sorted_items = sorted(
                    items,
                    key=lambda x: getattr(x, params.sort_by, None),
                    reverse=reverse,
                )
            elif isinstance(items[0], dict):
                sorted_items = sorted(
                    items,
                    key=lambda x: x.get(params.sort_by),
                    reverse=reverse,
                )
        except (IndexError, TypeError):
            pass

    # Paginate
    if pagination_type == PaginationType.OFFSET:
        paginator = OffsetPaginator(default_limit=params.page_size)
        offset = params.offset if params.offset is not None else (params.page - 1) * params.page_size
        return paginator.paginate(sorted_items, offset=offset, limit=params.page_size)

    elif pagination_type == PaginationType.CURSOR:
        paginator = CursorPaginator(page_size=params.page_size)
        return paginator.paginate(sorted_items, cursor=params.cursor, page_size=params.page_size)

    else:  # PAGE
        paginator = PagePaginator(page_size=params.page_size)
        return paginator.paginate(sorted_items, page=params.page, page_size=params.page_size)


class PaginatedQuery(Generic[T]):
    """Query builder with pagination.

    Usage:
        query = PaginatedQuery(items)
        result = (
            query
            .filter(lambda x: x.active)
            .sort("created_at", desc=True)
            .page(2)
            .limit(20)
            .execute()
        )
    """

    def __init__(self, items: Sequence[T]):
        self._items = list(items)
        self._filters: List[Callable[[T], bool]] = []
        self._sort_key: Optional[str] = None
        self._sort_reverse: bool = False
        self._page: int = 1
        self._limit: int = 20
        self._cursor: Optional[str] = None
        self._pagination_type: PaginationType = PaginationType.PAGE

    def filter(self, predicate: Callable[[T], bool]) -> "PaginatedQuery[T]":
        """Add filter."""
        self._filters.append(predicate)
        return self

    def sort(self, key: str, desc: bool = False) -> "PaginatedQuery[T]":
        """Set sort order."""
        self._sort_key = key
        self._sort_reverse = desc
        return self

    def page(self, page: int) -> "PaginatedQuery[T]":
        """Set page number."""
        self._page = max(1, page)
        self._pagination_type = PaginationType.PAGE
        return self

    def offset(self, offset: int) -> "PaginatedQuery[T]":
        """Set offset."""
        self._page = (offset // self._limit) + 1
        self._pagination_type = PaginationType.OFFSET
        return self

    def cursor(self, cursor: str) -> "PaginatedQuery[T]":
        """Set cursor."""
        self._cursor = cursor
        self._pagination_type = PaginationType.CURSOR
        return self

    def limit(self, limit: int) -> "PaginatedQuery[T]":
        """Set page size."""
        self._limit = max(1, min(100, limit))
        return self

    def execute(self) -> PaginatedResult[T]:
        """Execute query and return paginated result."""
        # Apply filters
        filtered = self._items
        for predicate in self._filters:
            filtered = [item for item in filtered if predicate(item)]

        # Apply sort
        if self._sort_key:
            try:
                if filtered and hasattr(filtered[0], self._sort_key):
                    filtered = sorted(
                        filtered,
                        key=lambda x: getattr(x, self._sort_key, None),
                        reverse=self._sort_reverse,
                    )
                elif filtered and isinstance(filtered[0], dict):
                    filtered = sorted(
                        filtered,
                        key=lambda x: x.get(self._sort_key),
                        reverse=self._sort_reverse,
                    )
            except (TypeError, AttributeError):
                pass

        # Paginate
        params = PaginationParams(
            page=self._page,
            page_size=self._limit,
            cursor=self._cursor,
        )
        return paginate(filtered, params, self._pagination_type)


def create_page_links(
    base_url: str,
    page_info: PageInfo,
    query_params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Optional[str]]:
    """Generate pagination links for API responses.

    Usage:
        links = create_page_links("/api/users", page_info)
        # {
        #   "self": "/api/users?page=2",
        #   "first": "/api/users?page=1",
        #   "prev": "/api/users?page=1",
        #   "next": "/api/users?page=3",
        #   "last": "/api/users?page=5"
        # }
    """
    params = query_params or {}

    def build_url(page: int) -> str:
        p = {**params, "page": page, "page_size": page_info.page_size}
        query = "&".join(f"{k}={v}" for k, v in p.items())
        return f"{base_url}?{query}"

    links = {
        "self": build_url(page_info.page),
        "first": build_url(1),
        "last": build_url(page_info.total_pages),
        "prev": build_url(page_info.page - 1) if page_info.has_prev else None,
        "next": build_url(page_info.page + 1) if page_info.has_next else None,
    }

    return links
