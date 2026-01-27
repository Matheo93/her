"""
Search Engine - Sprint 759

Full-text search system.

Features:
- In-memory indexing
- TF-IDF scoring
- Fuzzy matching
- Faceted search
- Highlighting
"""

import re
import math
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Set, Tuple, Generic
)
from enum import Enum


T = TypeVar("T")


class MatchType(str, Enum):
    """Match type for search."""
    EXACT = "exact"
    PREFIX = "prefix"
    FUZZY = "fuzzy"
    CONTAINS = "contains"


@dataclass
class SearchHit(Generic[T]):
    """Search result hit."""
    id: str
    document: T
    score: float
    highlights: Dict[str, List[str]] = field(default_factory=dict)
    matched_terms: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "score": round(self.score, 4),
            "highlights": self.highlights,
            "matched_terms": self.matched_terms,
        }


@dataclass
class SearchResults(Generic[T]):
    """Search results container."""
    hits: List[SearchHit[T]]
    total: int
    query: str
    took_ms: float = 0
    facets: Dict[str, Dict[str, int]] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "total": self.total,
            "query": self.query,
            "took_ms": round(self.took_ms, 2),
            "hits": [h.to_dict() for h in self.hits],
            "facets": self.facets,
        }


@dataclass
class FieldConfig:
    """Field configuration for indexing."""
    name: str
    weight: float = 1.0
    searchable: bool = True
    facetable: bool = False
    analyzer: Optional[Callable[[str], List[str]]] = None


class TextAnalyzer:
    """Text analyzer for tokenization and normalization."""

    def __init__(
        self,
        lowercase: bool = True,
        remove_accents: bool = True,
        min_token_length: int = 2,
        stopwords: Optional[Set[str]] = None,
    ):
        self._lowercase = lowercase
        self._remove_accents = remove_accents
        self._min_length = min_token_length
        self._stopwords = stopwords or {
            "a", "an", "and", "are", "as", "at", "be", "by", "for",
            "from", "has", "he", "in", "is", "it", "its", "of", "on",
            "that", "the", "to", "was", "were", "will", "with"
        }

    def analyze(self, text: str) -> List[str]:
        """Analyze text into tokens."""
        if not text:
            return []

        # Normalize unicode
        if self._remove_accents:
            text = unicodedata.normalize("NFKD", text)
            text = "".join(c for c in text if not unicodedata.combining(c))

        # Lowercase
        if self._lowercase:
            text = text.lower()

        # Tokenize (split on non-alphanumeric)
        tokens = re.findall(r"\b\w+\b", text)

        # Filter
        tokens = [
            t for t in tokens
            if len(t) >= self._min_length
            and t not in self._stopwords
        ]

        return tokens


class InvertedIndex:
    """Inverted index for search."""

    def __init__(self, analyzer: Optional[TextAnalyzer] = None):
        self._analyzer = analyzer or TextAnalyzer()
        self._index: Dict[str, Dict[str, List[int]]] = defaultdict(lambda: defaultdict(list))
        self._doc_terms: Dict[str, Dict[str, List[str]]] = {}
        self._doc_lengths: Dict[str, int] = {}
        self._num_docs: int = 0
        self._avg_doc_length: float = 0

    def add_document(
        self,
        doc_id: str,
        fields: Dict[str, str],
        analyzer: Optional[Callable[[str], List[str]]] = None,
    ) -> None:
        """Index a document."""
        analyze = analyzer or self._analyzer.analyze

        self._doc_terms[doc_id] = {}
        total_tokens = 0

        for field_name, field_value in fields.items():
            if not field_value:
                continue

            tokens = analyze(str(field_value))
            self._doc_terms[doc_id][field_name] = tokens
            total_tokens += len(tokens)

            for position, token in enumerate(tokens):
                self._index[token][doc_id].append(position)

        self._doc_lengths[doc_id] = total_tokens
        self._num_docs += 1
        self._avg_doc_length = sum(self._doc_lengths.values()) / self._num_docs

    def remove_document(self, doc_id: str) -> bool:
        """Remove document from index."""
        if doc_id not in self._doc_terms:
            return False

        for field_tokens in self._doc_terms[doc_id].values():
            for token in set(field_tokens):
                if token in self._index and doc_id in self._index[token]:
                    del self._index[token][doc_id]
                    if not self._index[token]:
                        del self._index[token]

        del self._doc_terms[doc_id]
        del self._doc_lengths[doc_id]
        self._num_docs -= 1

        if self._num_docs > 0:
            self._avg_doc_length = sum(self._doc_lengths.values()) / self._num_docs
        else:
            self._avg_doc_length = 0

        return True

    def search(self, query: str, match_type: MatchType = MatchType.CONTAINS) -> Dict[str, float]:
        """Search index and return doc_id -> score mapping."""
        tokens = self._analyzer.analyze(query)
        if not tokens:
            return {}

        scores: Dict[str, float] = defaultdict(float)

        for token in tokens:
            matching_terms = self._get_matching_terms(token, match_type)

            for term in matching_terms:
                if term not in self._index:
                    continue

                idf = math.log(1 + (self._num_docs / len(self._index[term])))

                for doc_id, positions in self._index[term].items():
                    tf = len(positions)
                    doc_len = self._doc_lengths.get(doc_id, 1)
                    k1 = 1.2
                    b = 0.75
                    tf_score = (tf * (k1 + 1)) / (
                        tf + k1 * (1 - b + b * (doc_len / self._avg_doc_length))
                    )
                    scores[doc_id] += tf_score * idf

        return dict(scores)

    def _get_matching_terms(self, token: str, match_type: MatchType) -> List[str]:
        """Get terms matching the query token."""
        if match_type == MatchType.EXACT:
            return [token] if token in self._index else []
        elif match_type == MatchType.PREFIX:
            return [t for t in self._index if t.startswith(token)]
        elif match_type == MatchType.CONTAINS:
            return [t for t in self._index if token in t]
        elif match_type == MatchType.FUZZY:
            matches = []
            for term in self._index:
                if self._edit_distance(token, term) <= 2:
                    matches.append(term)
            return matches
        return []

    def _edit_distance(self, s1: str, s2: str, max_dist: int = 2) -> int:
        """Calculate Levenshtein edit distance."""
        if abs(len(s1) - len(s2)) > max_dist:
            return max_dist + 1

        m, n = len(s1), len(s2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]

        for i in range(m + 1):
            dp[i][0] = i
        for j in range(n + 1):
            dp[0][j] = j

        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if s1[i-1] == s2[j-1]:
                    dp[i][j] = dp[i-1][j-1]
                else:
                    dp[i][j] = 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])

        return dp[m][n]

    def get_document_terms(self, doc_id: str) -> Dict[str, List[str]]:
        """Get indexed terms for a document."""
        return self._doc_terms.get(doc_id, {})


class SearchEngine(Generic[T]):
    """Full-text search engine."""

    def __init__(self):
        self._analyzer = TextAnalyzer()
        self._index = InvertedIndex(self._analyzer)
        self._fields: Dict[str, FieldConfig] = {}
        self._documents: Dict[str, T] = {}
        self._field_values: Dict[str, Dict[str, Any]] = {}

    def add_field(
        self,
        name: str,
        weight: float = 1.0,
        searchable: bool = True,
        facetable: bool = False,
    ) -> None:
        """Configure a field for indexing."""
        self._fields[name] = FieldConfig(
            name=name,
            weight=weight,
            searchable=searchable,
            facetable=facetable,
        )

    def index(
        self,
        doc_id: str,
        fields: Dict[str, Any],
        document: Optional[T] = None,
    ) -> None:
        """Index a document."""
        if document is not None:
            self._documents[doc_id] = document

        self._field_values[doc_id] = fields

        searchable_fields = {}
        for field_name, value in fields.items():
            config = self._fields.get(field_name)
            if config and config.searchable and value:
                searchable_fields[field_name] = str(value)

        self._index.add_document(doc_id, searchable_fields)

    def remove(self, doc_id: str) -> bool:
        """Remove document from index."""
        self._index.remove_document(doc_id)
        if doc_id in self._documents:
            del self._documents[doc_id]
        if doc_id in self._field_values:
            del self._field_values[doc_id]
        return True

    def search(
        self,
        query: str,
        match_type: MatchType = MatchType.CONTAINS,
        limit: int = 10,
        offset: int = 0,
        facet_fields: Optional[List[str]] = None,
        filters: Optional[Dict[str, Any]] = None,
    ) -> SearchResults[T]:
        """Search the index."""
        import time
        start = time.time()

        raw_scores = self._index.search(query, match_type)

        if filters:
            raw_scores = self._apply_filters(raw_scores, filters)

        weighted_scores = self._apply_weights(raw_scores, query)

        sorted_results = sorted(
            weighted_scores.items(),
            key=lambda x: x[1],
            reverse=True
        )

        total = len(sorted_results)
        paginated = sorted_results[offset:offset + limit]

        query_tokens = set(self._analyzer.analyze(query))
        hits = []
        for doc_id, score in paginated:
            document = self._documents.get(doc_id)
            highlights = self._generate_highlights(doc_id, query_tokens)
            doc_terms = self._index.get_document_terms(doc_id)
            all_terms = []
            for terms in doc_terms.values():
                all_terms.extend(terms)
            matched = list(query_tokens & set(all_terms))

            hits.append(SearchHit(
                id=doc_id,
                document=document,
                score=score,
                highlights=highlights,
                matched_terms=matched,
            ))

        facets = {}
        if facet_fields:
            facets = self._calculate_facets(
                [doc_id for doc_id, _ in sorted_results],
                facet_fields
            )

        took_ms = (time.time() - start) * 1000

        return SearchResults(
            hits=hits,
            total=total,
            query=query,
            took_ms=took_ms,
            facets=facets,
        )

    def _apply_filters(
        self,
        scores: Dict[str, float],
        filters: Dict[str, Any],
    ) -> Dict[str, float]:
        """Apply filters to search results."""
        filtered = {}
        for doc_id, score in scores.items():
            field_values = self._field_values.get(doc_id, {})
            match = True

            for fld, expected in filters.items():
                actual = field_values.get(fld)
                if isinstance(expected, list):
                    if actual not in expected:
                        match = False
                        break
                elif actual != expected:
                    match = False
                    break

            if match:
                filtered[doc_id] = score

        return filtered

    def _apply_weights(
        self,
        scores: Dict[str, float],
        query: str,
    ) -> Dict[str, float]:
        """Apply field weights to scores."""
        weighted = {}
        query_tokens = set(self._analyzer.analyze(query))

        for doc_id, base_score in scores.items():
            doc_terms = self._index.get_document_terms(doc_id)
            weight_multiplier = 1.0

            for field_name, tokens in doc_terms.items():
                config = self._fields.get(field_name)
                if config and config.weight != 1.0:
                    overlap = len(query_tokens & set(tokens))
                    if overlap > 0:
                        weight_multiplier += (config.weight - 1.0) * overlap

            weighted[doc_id] = base_score * weight_multiplier

        return weighted

    def _generate_highlights(
        self,
        doc_id: str,
        query_tokens: Set[str],
        tag: str = "em",
        max_length: int = 200,
    ) -> Dict[str, List[str]]:
        """Generate highlighted snippets."""
        highlights = {}
        field_values = self._field_values.get(doc_id, {})

        for field_name, value in field_values.items():
            if not isinstance(value, str):
                continue

            pattern = "|".join(re.escape(t) for t in query_tokens if t)
            if not pattern:
                continue

            matches = list(re.finditer(pattern, value, re.IGNORECASE))
            if not matches:
                continue

            snippets = []
            for match in matches[:3]:
                start = max(0, match.start() - 50)
                end = min(len(value), match.end() + 50)

                snippet = value[start:end]
                if start > 0:
                    snippet = "..." + snippet
                if end < len(value):
                    snippet = snippet + "..."

                snippet = re.sub(
                    pattern,
                    f"<{tag}>\\g<0></{tag}>",
                    snippet,
                    flags=re.IGNORECASE
                )

                snippets.append(snippet)

            if snippets:
                highlights[field_name] = snippets

        return highlights

    def _calculate_facets(
        self,
        doc_ids: List[str],
        facet_fields: List[str],
    ) -> Dict[str, Dict[str, int]]:
        """Calculate facet counts."""
        facets = {}

        for fld in facet_fields:
            config = self._fields.get(fld)
            if not config or not config.facetable:
                continue

            counts: Dict[str, int] = defaultdict(int)
            for doc_id in doc_ids:
                value = self._field_values.get(doc_id, {}).get(fld)
                if value:
                    counts[str(value)] += 1

            facets[fld] = dict(sorted(counts.items(), key=lambda x: -x[1]))

        return facets

    def suggest(
        self,
        prefix: str,
        field: str = "title",
        limit: int = 5,
    ) -> List[str]:
        """Get autocomplete suggestions."""
        suggestions = set()
        prefix_lower = prefix.lower()

        for doc_id, fields in self._field_values.items():
            value = fields.get(field)
            if not isinstance(value, str):
                continue

            tokens = self._analyzer.analyze(value)
            for token in tokens:
                if token.startswith(prefix_lower):
                    suggestions.add(token)

            if len(suggestions) >= limit * 2:
                break

        return sorted(suggestions)[:limit]


_engine: Optional[SearchEngine] = None


def get_search_engine() -> SearchEngine:
    """Get global search engine."""
    global _engine
    if not _engine:
        _engine = SearchEngine()
    return _engine
