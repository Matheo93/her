"""
Response Builder - Sprint 789

Standardized API response builder.

Features:
- Consistent response format
- Error responses
- Pagination support
- HATEOAS links
- Response metadata
- Envelope pattern
"""

import time
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union,
    Generic
)
from enum import Enum
import logging
import json

logger = logging.getLogger(__name__)


T = TypeVar("T")


class ResponseStatus(str, Enum):
    """Response status."""
    SUCCESS = "success"
    ERROR = "error"
    FAIL = "fail"


@dataclass
class Link:
    """HATEOAS link."""
    rel: str
    href: str
    method: str = "GET"
    title: Optional[str] = None

    def to_dict(self) -> dict:
        result = {
            "rel": self.rel,
            "href": self.href,
            "method": self.method,
        }
        if self.title:
            result["title"] = self.title
        return result


@dataclass
class PaginationMeta:
    """Pagination metadata."""
    page: int
    per_page: int
    total: int
    total_pages: int

    @property
    def has_next(self) -> bool:
        return self.page < self.total_pages

    @property
    def has_prev(self) -> bool:
        return self.page > 1

    def to_dict(self) -> dict:
        return {
            "page": self.page,
            "per_page": self.per_page,
            "total": self.total,
            "total_pages": self.total_pages,
            "has_next": self.has_next,
            "has_prev": self.has_prev,
        }


@dataclass
class ErrorDetail:
    """Error detail."""
    code: str
    message: str
    field: Optional[str] = None
    detail: Optional[str] = None

    def to_dict(self) -> dict:
        result = {
            "code": self.code,
            "message": self.message,
        }
        if self.field:
            result["field"] = self.field
        if self.detail:
            result["detail"] = self.detail
        return result


@dataclass
class ApiResponse(Generic[T]):
    """Standardized API response."""
    status: ResponseStatus
    data: Optional[T] = None
    message: Optional[str] = None
    errors: List[ErrorDetail] = field(default_factory=list)
    meta: Dict[str, Any] = field(default_factory=dict)
    links: List[Link] = field(default_factory=list)
    pagination: Optional[PaginationMeta] = None
    timestamp: float = field(default_factory=time.time)
    request_id: Optional[str] = None

    def to_dict(self) -> dict:
        result: Dict[str, Any] = {
            "status": self.status.value,
            "timestamp": self.timestamp,
        }

        if self.data is not None:
            if hasattr(self.data, "to_dict"):
                result["data"] = self.data.to_dict()
            elif isinstance(self.data, list):
                result["data"] = [
                    item.to_dict() if hasattr(item, "to_dict") else item
                    for item in self.data
                ]
            else:
                result["data"] = self.data

        if self.message:
            result["message"] = self.message

        if self.errors:
            result["errors"] = [e.to_dict() for e in self.errors]

        if self.meta:
            result["meta"] = self.meta

        if self.links:
            result["links"] = [l.to_dict() for l in self.links]

        if self.pagination:
            result["pagination"] = self.pagination.to_dict()

        if self.request_id:
            result["request_id"] = self.request_id

        return result

    def to_json(self, **kwargs: Any) -> str:
        return json.dumps(self.to_dict(), **kwargs)


class ResponseBuilder:
    """Fluent API response builder.

    Usage:
        # Success response
        response = (
            ResponseBuilder()
            .success()
            .data({"user": user})
            .message("User retrieved successfully")
            .build()
        )

        # Error response
        response = (
            ResponseBuilder()
            .error()
            .message("Validation failed")
            .add_error("INVALID_EMAIL", "Invalid email format", field="email")
            .build()
        )

        # Paginated response
        response = (
            ResponseBuilder()
            .success()
            .data(users)
            .paginate(page=1, per_page=20, total=100)
            .build()
        )
    """

    def __init__(self):
        self._status: ResponseStatus = ResponseStatus.SUCCESS
        self._data: Any = None
        self._message: Optional[str] = None
        self._errors: List[ErrorDetail] = []
        self._meta: Dict[str, Any] = {}
        self._links: List[Link] = []
        self._pagination: Optional[PaginationMeta] = None
        self._request_id: Optional[str] = None

    def success(self) -> "ResponseBuilder":
        """Set success status."""
        self._status = ResponseStatus.SUCCESS
        return self

    def error(self) -> "ResponseBuilder":
        """Set error status."""
        self._status = ResponseStatus.ERROR
        return self

    def fail(self) -> "ResponseBuilder":
        """Set fail status (client error)."""
        self._status = ResponseStatus.FAIL
        return self

    def data(self, data: Any) -> "ResponseBuilder":
        """Set response data."""
        self._data = data
        return self

    def message(self, message: str) -> "ResponseBuilder":
        """Set response message."""
        self._message = message
        return self

    def add_error(
        self,
        code: str,
        message: str,
        field: Optional[str] = None,
        detail: Optional[str] = None,
    ) -> "ResponseBuilder":
        """Add an error detail."""
        self._errors.append(ErrorDetail(
            code=code,
            message=message,
            field=field,
            detail=detail,
        ))
        return self

    def errors(self, errors: List[ErrorDetail]) -> "ResponseBuilder":
        """Set all errors."""
        self._errors = errors
        return self

    def meta(self, key: str, value: Any) -> "ResponseBuilder":
        """Add metadata."""
        self._meta[key] = value
        return self

    def add_link(
        self,
        rel: str,
        href: str,
        method: str = "GET",
        title: Optional[str] = None,
    ) -> "ResponseBuilder":
        """Add HATEOAS link."""
        self._links.append(Link(rel=rel, href=href, method=method, title=title))
        return self

    def self_link(self, href: str) -> "ResponseBuilder":
        """Add self link."""
        return self.add_link("self", href)

    def paginate(
        self,
        page: int,
        per_page: int,
        total: int,
        base_url: Optional[str] = None,
    ) -> "ResponseBuilder":
        """Add pagination."""
        total_pages = (total + per_page - 1) // per_page
        self._pagination = PaginationMeta(
            page=page,
            per_page=per_page,
            total=total,
            total_pages=total_pages,
        )

        # Add pagination links
        if base_url:
            self.add_link("self", base_url + "?page=" + str(page) + "&per_page=" + str(per_page))
            self.add_link("first", base_url + "?page=1&per_page=" + str(per_page))
            self.add_link("last", base_url + "?page=" + str(total_pages) + "&per_page=" + str(per_page))

            if page > 1:
                self.add_link("prev", base_url + "?page=" + str(page - 1) + "&per_page=" + str(per_page))
            if page < total_pages:
                self.add_link("next", base_url + "?page=" + str(page + 1) + "&per_page=" + str(per_page))

        return self

    def request_id(self, request_id: str) -> "ResponseBuilder":
        """Set request ID."""
        self._request_id = request_id
        return self

    def build(self) -> ApiResponse:
        """Build the response."""
        return ApiResponse(
            status=self._status,
            data=self._data,
            message=self._message,
            errors=self._errors,
            meta=self._meta,
            links=self._links,
            pagination=self._pagination,
            request_id=self._request_id,
        )

    def build_dict(self) -> dict:
        """Build and return as dict."""
        return self.build().to_dict()

    def build_json(self, **kwargs: Any) -> str:
        """Build and return as JSON string."""
        return self.build().to_json(**kwargs)


# Convenience functions
def success_response(
    data: Any = None,
    message: Optional[str] = None,
    **meta: Any,
) -> ApiResponse:
    """Create a success response."""
    builder = ResponseBuilder().success()
    if data is not None:
        builder.data(data)
    if message:
        builder.message(message)
    for key, value in meta.items():
        builder.meta(key, value)
    return builder.build()


def error_response(
    message: str,
    errors: Optional[List[Dict[str, str]]] = None,
    code: Optional[str] = None,
) -> ApiResponse:
    """Create an error response."""
    builder = ResponseBuilder().error().message(message)
    if errors:
        for err in errors:
            builder.add_error(
                code=err.get("code", "ERROR"),
                message=err.get("message", ""),
                field=err.get("field"),
                detail=err.get("detail"),
            )
    elif code:
        builder.add_error(code=code, message=message)
    return builder.build()


def fail_response(
    message: str,
    field: Optional[str] = None,
    code: str = "VALIDATION_ERROR",
) -> ApiResponse:
    """Create a fail response (client error)."""
    return (
        ResponseBuilder()
        .fail()
        .message(message)
        .add_error(code=code, message=message, field=field)
        .build()
    )


def paginated_response(
    data: List[Any],
    page: int,
    per_page: int,
    total: int,
    base_url: Optional[str] = None,
    message: Optional[str] = None,
) -> ApiResponse:
    """Create a paginated response."""
    builder = (
        ResponseBuilder()
        .success()
        .data(data)
        .paginate(page, per_page, total, base_url)
    )
    if message:
        builder.message(message)
    return builder.build()


def created_response(
    data: Any,
    location: Optional[str] = None,
    message: str = "Resource created successfully",
) -> ApiResponse:
    """Create a 201 Created response."""
    builder = (
        ResponseBuilder()
        .success()
        .data(data)
        .message(message)
    )
    if location:
        builder.add_link("self", location)
    return builder.build()


def not_found_response(
    resource: str = "Resource",
    message: Optional[str] = None,
) -> ApiResponse:
    """Create a 404 Not Found response."""
    return (
        ResponseBuilder()
        .fail()
        .message(message or resource + " not found")
        .add_error(
            code="NOT_FOUND",
            message=resource + " not found",
        )
        .build()
    )


def validation_error_response(
    errors: List[Dict[str, str]],
    message: str = "Validation failed",
) -> ApiResponse:
    """Create a validation error response."""
    builder = ResponseBuilder().fail().message(message)
    for err in errors:
        builder.add_error(
            code=err.get("code", "VALIDATION_ERROR"),
            message=err.get("message", "Invalid value"),
            field=err.get("field"),
            detail=err.get("detail"),
        )
    return builder.build()


def unauthorized_response(
    message: str = "Authentication required",
) -> ApiResponse:
    """Create a 401 Unauthorized response."""
    return (
        ResponseBuilder()
        .error()
        .message(message)
        .add_error(code="UNAUTHORIZED", message=message)
        .build()
    )


def forbidden_response(
    message: str = "Access denied",
) -> ApiResponse:
    """Create a 403 Forbidden response."""
    return (
        ResponseBuilder()
        .error()
        .message(message)
        .add_error(code="FORBIDDEN", message=message)
        .build()
    )


def server_error_response(
    message: str = "Internal server error",
    request_id: Optional[str] = None,
) -> ApiResponse:
    """Create a 500 Server Error response."""
    builder = (
        ResponseBuilder()
        .error()
        .message(message)
        .add_error(code="SERVER_ERROR", message=message)
    )
    if request_id:
        builder.request_id(request_id)
    return builder.build()


class ResponseWrapper:
    """Wrap existing response objects."""

    @staticmethod
    def wrap(data: Any, status: ResponseStatus = ResponseStatus.SUCCESS) -> dict:
        """Wrap data in standard envelope."""
        return {
            "status": status.value,
            "data": data,
            "timestamp": time.time(),
        }

    @staticmethod
    def wrap_list(
        items: List[Any],
        total: Optional[int] = None,
    ) -> dict:
        """Wrap list data."""
        result = {
            "status": ResponseStatus.SUCCESS.value,
            "data": items,
            "timestamp": time.time(),
        }
        if total is not None:
            result["meta"] = {"total": total}
        return result

    @staticmethod
    def wrap_error(message: str, code: str = "ERROR") -> dict:
        """Wrap error."""
        return {
            "status": ResponseStatus.ERROR.value,
            "message": message,
            "errors": [{"code": code, "message": message}],
            "timestamp": time.time(),
        }
