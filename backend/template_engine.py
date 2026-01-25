"""
Template Engine - Sprint 675

Simple template rendering engine.

Features:
- Variable substitution
- Conditionals
- Loops
- Filters
- Template inheritance
"""

import re
import html
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Callable
import threading


@dataclass
class Template:
    """Template definition."""
    name: str
    content: str
    parent: Optional[str] = None
    blocks: Dict[str, str] = field(default_factory=dict)


class TemplateEngine:
    """Simple template rendering engine.

    Usage:
        engine = TemplateEngine()

        # Register template
        engine.register("greeting", "Hello, {{ name }}!")

        # Render
        result = engine.render("greeting", {"name": "World"})
        # => "Hello, World!"

        # With conditionals
        engine.register("user", '''
            {% if is_admin %}
                Welcome, Admin {{ name }}!
            {% else %}
                Hello, {{ name }}!
            {% endif %}
        ''')

        # With loops
        engine.register("list", '''
            <ul>
            {% for item in items %}
                <li>{{ item }}</li>
            {% endfor %}
            </ul>
        ''')

        # With filters
        result = engine.render_string("{{ name | upper }}", {"name": "john"})
        # => "JOHN"
    """

    def __init__(self):
        """Initialize template engine."""
        self._templates: Dict[str, Template] = {}
        self._filters: Dict[str, Callable[[Any], Any]] = {}
        self._lock = threading.Lock()

        # Register built-in filters
        self._register_builtin_filters()

    def _register_builtin_filters(self):
        """Register default filters."""
        self._filters["upper"] = lambda x: str(x).upper()
        self._filters["lower"] = lambda x: str(x).lower()
        self._filters["capitalize"] = lambda x: str(x).capitalize()
        self._filters["title"] = lambda x: str(x).title()
        self._filters["strip"] = lambda x: str(x).strip()
        self._filters["escape"] = lambda x: html.escape(str(x))
        self._filters["length"] = lambda x: len(x) if hasattr(x, "__len__") else 0
        self._filters["default"] = lambda x, d="": x if x else d
        self._filters["join"] = lambda x, sep=", ": sep.join(str(i) for i in x) if isinstance(x, list) else str(x)
        self._filters["first"] = lambda x: x[0] if x else ""
        self._filters["last"] = lambda x: x[-1] if x else ""
        self._filters["reverse"] = lambda x: list(reversed(x)) if isinstance(x, list) else str(x)[::-1]
        self._filters["sort"] = lambda x: sorted(x) if isinstance(x, list) else x
        self._filters["truncate"] = lambda x, n=50: str(x)[:n] + "..." if len(str(x)) > n else str(x)

    def register(
        self,
        name: str,
        content: str,
        parent: Optional[str] = None,
    ) -> Template:
        """Register a template.

        Args:
            name: Template name
            content: Template content
            parent: Parent template name

        Returns:
            Template object
        """
        # Extract blocks
        blocks = {}
        block_pattern = r'\{% block (\w+) %\}(.*?)\{% endblock %\}'
        for match in re.finditer(block_pattern, content, re.DOTALL):
            block_name, block_content = match.groups()
            blocks[block_name] = block_content.strip()

        template = Template(
            name=name,
            content=content,
            parent=parent,
            blocks=blocks,
        )

        with self._lock:
            self._templates[name] = template

        return template

    def register_filter(self, name: str, func: Callable[[Any], Any]):
        """Register custom filter."""
        self._filters[name] = func

    def get(self, name: str) -> Optional[Template]:
        """Get template by name."""
        return self._templates.get(name)

    def render(self, name: str, context: Optional[Dict[str, Any]] = None) -> str:
        """Render template by name.

        Args:
            name: Template name
            context: Template context

        Returns:
            Rendered string
        """
        template = self._templates.get(name)
        if not template:
            raise ValueError(f"Template not found: {name}")

        return self._render_template(template, context or {})

    def render_string(self, content: str, context: Optional[Dict[str, Any]] = None) -> str:
        """Render template string directly.

        Args:
            content: Template content
            context: Template context

        Returns:
            Rendered string
        """
        template = Template(name="_inline", content=content)
        return self._render_template(template, context or {})

    def _render_template(self, template: Template, context: Dict[str, Any]) -> str:
        """Internal render method."""
        content = template.content

        # Handle inheritance
        if template.parent:
            parent = self._templates.get(template.parent)
            if parent:
                content = self._apply_inheritance(parent, template)

        # Process template
        content = self._process_includes(content, context)
        content = self._process_conditionals(content, context)
        content = self._process_loops(content, context)
        content = self._process_variables(content, context)

        return content.strip()

    def _apply_inheritance(self, parent: Template, child: Template) -> str:
        """Apply template inheritance."""
        content = parent.content

        # Replace parent blocks with child blocks
        for block_name, block_content in child.blocks.items():
            pattern = r'\{% block ' + block_name + r' %\}.*?\{% endblock %\}'
            content = re.sub(pattern, block_content, content, flags=re.DOTALL)

        return content

    def _process_includes(self, content: str, context: Dict[str, Any]) -> str:
        """Process include statements."""
        pattern = r'\{% include ["\'](\w+)["\'] %\}'

        def replace(match):
            name = match.group(1)
            template = self._templates.get(name)
            if template:
                return self._render_template(template, context)
            return ""

        return re.sub(pattern, replace, content)

    def _process_conditionals(self, content: str, context: Dict[str, Any]) -> str:
        """Process if/else/endif blocks."""
        # Simple if/else/endif
        pattern = r'\{% if (.+?) %\}(.*?)(?:\{% else %\}(.*?))?\{% endif %\}'

        def replace(match):
            condition, if_block, else_block = match.groups()
            else_block = else_block or ""

            # Evaluate condition
            result = self._evaluate_condition(condition.strip(), context)
            return if_block.strip() if result else else_block.strip()

        # Process nested conditionals from innermost
        while re.search(pattern, content, re.DOTALL):
            content = re.sub(pattern, replace, content, flags=re.DOTALL)

        return content

    def _process_loops(self, content: str, context: Dict[str, Any]) -> str:
        """Process for loops."""
        pattern = r'\{% for (\w+) in (\w+) %\}(.*?)\{% endfor %\}'

        def replace(match):
            item_name, collection_name, body = match.groups()
            collection = context.get(collection_name, [])

            if not isinstance(collection, (list, tuple)):
                return ""

            result = []
            for i, item in enumerate(collection):
                loop_context = {
                    **context,
                    item_name: item,
                    "loop": {
                        "index": i + 1,
                        "index0": i,
                        "first": i == 0,
                        "last": i == len(collection) - 1,
                        "length": len(collection),
                    },
                }
                rendered = self._process_variables(body, loop_context)
                result.append(rendered)

            return "".join(result)

        while re.search(pattern, content, re.DOTALL):
            content = re.sub(pattern, replace, content, flags=re.DOTALL)

        return content

    def _process_variables(self, content: str, context: Dict[str, Any]) -> str:
        """Process variable substitution."""
        # {{ variable | filter }}
        pattern = r'\{\{\s*(.+?)\s*\}\}'

        def replace(match):
            expression = match.group(1)

            # Check for filters
            if "|" in expression:
                parts = expression.split("|")
                value = self._get_value(parts[0].strip(), context)
                for filter_expr in parts[1:]:
                    value = self._apply_filter(filter_expr.strip(), value)
                return str(value) if value is not None else ""

            value = self._get_value(expression, context)
            return str(value) if value is not None else ""

        return re.sub(pattern, replace, content)

    def _get_value(self, key: str, context: Dict[str, Any]) -> Any:
        """Get value from context (supports dot notation)."""
        parts = key.split(".")
        value = context

        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            elif hasattr(value, part):
                value = getattr(value, part)
            else:
                return None

            if value is None:
                return None

        return value

    def _apply_filter(self, filter_expr: str, value: Any) -> Any:
        """Apply filter to value."""
        # Parse filter name and args
        if ":" in filter_expr:
            filter_name, args_str = filter_expr.split(":", 1)
            args = [a.strip().strip("'\"") for a in args_str.split(",")]
        else:
            filter_name = filter_expr
            args = []

        filter_func = self._filters.get(filter_name)
        if filter_func:
            try:
                if args:
                    return filter_func(value, *args)
                return filter_func(value)
            except Exception:
                return value

        return value

    def _evaluate_condition(self, condition: str, context: Dict[str, Any]) -> bool:
        """Evaluate simple condition."""
        # Handle "not" prefix
        if condition.startswith("not "):
            return not self._evaluate_condition(condition[4:], context)

        # Handle comparisons
        for op in [" == ", " != ", " >= ", " <= ", " > ", " < ", " in "]:
            if op in condition:
                left, right = condition.split(op, 1)
                left_val = self._get_value(left.strip(), context)
                right_val = self._parse_literal(right.strip(), context)

                if op == " == ":
                    return left_val == right_val
                elif op == " != ":
                    return left_val != right_val
                elif op == " >= ":
                    return left_val >= right_val
                elif op == " <= ":
                    return left_val <= right_val
                elif op == " > ":
                    return left_val > right_val
                elif op == " < ":
                    return left_val < right_val
                elif op == " in ":
                    return left_val in right_val

        # Simple truthiness check
        value = self._get_value(condition, context)
        return bool(value)

    def _parse_literal(self, value: str, context: Dict[str, Any]) -> Any:
        """Parse literal value or get from context."""
        # String literal
        if (value.startswith("'") and value.endswith("'")) or \
           (value.startswith('"') and value.endswith('"')):
            return value[1:-1]

        # Number
        try:
            if "." in value:
                return float(value)
            return int(value)
        except ValueError:
            pass

        # Boolean
        if value == "True":
            return True
        if value == "False":
            return False

        # Context variable
        return self._get_value(value, context)

    def list_templates(self) -> List[str]:
        """List all template names."""
        return list(self._templates.keys())

    def clear(self):
        """Clear all templates."""
        with self._lock:
            self._templates.clear()


# Singleton instance
template_engine = TemplateEngine()
