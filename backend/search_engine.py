"""
Search Engine - Sprint 721

Full-text search implementation.

Features:
- Text indexing
- Tokenization
- TF-IDF scoring
- Fuzzy matching
- Faceted search
"""

import re
import math
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Set, Tuple
)
from collections import defaultdict
from enum import Enum
import threading


class MatchType(str, Enum):
    """Match type for search."""
    EXACT = "exact"
    PREFIX = "prefix"
    FUZZY = "fuzzy"
    CONTAINS = "contains"


@dataclass
class SearchResult:
    """Single search result."""
    id: str
    score: float
    document: Dict[str, Any]
    highlights: Dict[str, List[str]] = field(default_factory=dict)
    matched_fields: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "score": round(self.score, 4),
            "document": self.document,
            "highlights": self.highlights,
            "matched_fields": self.matched_fields,
        }


@dataclass
class SearchResponse:
    """Search response with results and metadata."""
    query: str
    total: int
    results: List[SearchResult]
    took_ms: float
    facets: Dict[str, Dict[str, int]] = field(default_factory=dict)
    suggestions: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "query": self.query,
            "total": self.total,
            "results": [r.to_dict() for r in self.results],
            "took_ms": round(self.took_ms, 2),
            "facets": self.facets,
            "suggestions": self.suggestions,
        }


class Tokenizer:
    """Text tokenizer."""

    def __init__(
        self,
        lowercase: bool = True,
        strip_punctuation: bool = True,
        min_length: int = 2,
        stop_words: Optional[Set[str]] = None,
    ):
        """Initialize tokenizer."""
        self.lowercase = lowercase
        self.strip_punctuation = strip_punctuation
        self.min_length = min_length
        self.stop_words = stop_words or {
            "a", "an", "the", "and", "or", "but", "in", "on", "at", "to",
            "for", "of", "with", "by", "from", "is", "are", "was", "were",
            "be", "been", "being", "have", "has", "had", "do", "does", "did",
            "will", "would", "could", "should", "may", "might", "must",
            "this", "that", "these", "those", "it", "its",
        }

    def tokenize(self, text: str) -> List[str]:
        """Tokenize text into terms."""
        if not text:
            return []

        # Lowercase
        if self.lowercase:
            text = text.lower()

        # Strip punctuation
        if self.strip_punctuation:
            text = re.sub(r"[^\w\s]", " ", text)

        # Split on whitespace
        tokens = text.split()

        # Filter
        tokens = [
            t for t in tokens
            if len(t) >= self.min_length and t not in self.stop_words
        ]

        return tokens


class Stemmer:
    """Simple word stemmer."""

    SUFFIX_RULES = [
        ("ies", "y"),
        ("es", "e"),
        ("s", ""),
        ("ing", ""),
        ("ed", ""),
        ("ly", ""),
        ("ment", ""),
        ("ness", ""),
        ("tion", ""),
        ("able", ""),
        ("ible", ""),
    ]

    def stem(self, word: str) -> str:
        """Stem a word to its root form."""
        for suffix, replacement in self.SUFFIX_RULES:
            if word.endswith(suffix) and len(word) > len(suffix) + 2:
                return word[:-len(suffix)] + replacement
        return word


class InvertedIndex:
    """Inverted index for full-text search."""

    def __init__(
        self,
        tokenizer: Optional[Tokenizer] = None,
        use_stemming: bool = True,
    ):
        """Initialize index."""
        self._tokenizer = tokenizer or Tokenizer()
        self._stemmer = Stemmer() if use_stemming else None
        self._index: Dict[str, Dict[str, List[int]]] = defaultdict(dict)
        self._documents: Dict[str, Dict[str, Any]] = {}
        self._field_lengths: Dict[str, Dict[str, int]] = defaultdict(dict)
        self._doc_count = 0
        self._term_doc_counts: Dict[str, int] = defaultdict(int)
        self._lock = threading.Lock()

    def add_document(
        self,
        doc_id: str,
        document: Dict[str, Any],
        searchable_fields: Optional[List[str]] = None,
    ) -> None:
        """Add a document to the index.

        Args:
            doc_id: Document ID
            document: Document content
            searchable_fields: Fields to index (all if None)
        """
        with self._lock:
            # Store document
            self._documents[doc_id] = document
            self._doc_count += 1

            # Index each field
            fields_to_index = searchable_fields or list(document.keys())

            for field in fields_to_index:
                value = document.get(field)
                if not isinstance(value, str):
                    continue

                tokens = self._tokenizer.tokenize(value)
                self._field_lengths[doc_id][field] = len(tokens)

                # Track unique terms for IDF
                unique_terms = set()

                for position, token in enumerate(tokens):
                    term = self._stemmer.stem(token) if self._stemmer else token

                    if doc_id not in self._index[term]:
                        self._index[term][doc_id] = []

                    self._index[term][doc_id].append(position)
                    unique_terms.add(term)

                for term in unique_terms:
                    self._term_doc_counts[term] += 1

    def remove_document(self, doc_id: str) -> bool:
        """Remove a document from the index."""
        with self._lock:
            if doc_id not in self._documents:
                return False

            # Remove from index
            terms_to_remove = []
            for term, docs in self._index.items():
                if doc_id in docs:
                    del docs[doc_id]
                    self._term_doc_counts[term] -= 1
                    if not docs:
                        terms_to_remove.append(term)

            for term in terms_to_remove:
                del self._index[term]

            # Remove document
            del self._documents[doc_id]
            if doc_id in self._field_lengths:
                del self._field_lengths[doc_id]
            self._doc_count -= 1

            return True

    def search(
        self,
        query: str,
        limit: int = 10,
        offset: int = 0,
        fields: Optional[List[str]] = None,
        match_type: MatchType = MatchType.CONTAINS,
    ) -> List[Tuple[str, float]]:
        """Search the index.

        Args:
            query: Search query
            limit: Max results
            offset: Results offset
            fields: Fields to search
            match_type: Match type

        Returns:
            List of (doc_id, score) tuples
        """
        tokens = self._tokenizer.tokenize(query)
        if not tokens:
            return []

        # Stem tokens
        if self._stemmer:
            tokens = [self._stemmer.stem(t) for t in tokens]

        # Find matching documents
        doc_scores: Dict[str, float] = defaultdict(float)

        for token in tokens:
            if match_type == MatchType.EXACT:
                matching_terms = [token] if token in self._index else []
            elif match_type == MatchType.PREFIX:
                matching_terms = [t for t in self._index if t.startswith(token)]
            elif match_type == MatchType.FUZZY:
                matching_terms = self._fuzzy_match(token)
            else:  # CONTAINS
                matching_terms = [t for t in self._index if token in t or t == token]

            for term in matching_terms:
                # Calculate IDF
                doc_count = self._term_doc_counts.get(term, 0)
                if doc_count == 0:
                    continue

                idf = math.log(self._doc_count / doc_count) + 1

                # Score each document
                for doc_id, positions in self._index[term].items():
                    # TF
                    tf = len(positions)
                    doc_length = sum(self._field_lengths.get(doc_id, {}).values()) or 1
                    normalized_tf = tf / doc_length

                    # TF-IDF score
                    score = normalized_tf * idf
                    doc_scores[doc_id] += score

        # Sort by score
        sorted_docs = sorted(doc_scores.items(), key=lambda x: -x[1])

        return sorted_docs[offset:offset + limit]

    def _fuzzy_match(self, term: str, max_distance: int = 2) -> List[str]:
        """Find fuzzy matches for a term."""
        matches = []

        for indexed_term in self._index:
            if self._levenshtein_distance(term, indexed_term) <= max_distance:
                matches.append(indexed_term)

        return matches

    def _levenshtein_distance(self, s1: str, s2: str) -> int:
        """Calculate Levenshtein edit distance."""
        if len(s1) < len(s2):
            return self._levenshtein_distance(s2, s1)

        if len(s2) == 0:
            return len(s1)

        previous_row = range(len(s2) + 1)

        for i, c1 in enumerate(s1):
            current_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = previous_row[j + 1] + 1
                deletions = current_row[j] + 1
                substitutions = previous_row[j] + (c1 != c2)
                current_row.append(min(insertions, deletions, substitutions))
            previous_row = current_row

        return previous_row[-1]

    def get_document(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """Get document by ID."""
        return self._documents.get(doc_id)

    def get_stats(self) -> dict:
        """Get index statistics."""
        return {
            "document_count": self._doc_count,
            "term_count": len(self._index),
            "avg_doc_length": sum(
                sum(lengths.values())
                for lengths in self._field_lengths.values()
            ) / max(self._doc_count, 1),
        }


class SearchEngine:
    """Full-text search engine.

    Usage:
        engine = SearchEngine()

        # Add documents
        engine.add({
            "id": "1",
            "title": "Python Programming",
            "content": "Learn Python programming language",
            "tags": ["python", "programming"]
        })

        # Search
        results = engine.search("python", limit=10)

        # Faceted search
        results = engine.search("programming", facets=["tags"])
    """

    def __init__(
        self,
        tokenizer: Optional[Tokenizer] = None,
        id_field: str = "id",
        searchable_fields: Optional[List[str]] = None,
        facet_fields: Optional[List[str]] = None,
    ):
        """Initialize search engine."""
        self._index = InvertedIndex(tokenizer)
        self._id_field = id_field
        self._searchable_fields = searchable_fields
        self._facet_fields = facet_fields or []
        self._facet_values: Dict[str, Dict[str, Set[str]]] = defaultdict(lambda: defaultdict(set))

    def add(self, document: Dict[str, Any]) -> str:
        """Add a document.

        Args:
            document: Document to add

        Returns:
            Document ID
        """
        doc_id = str(document.get(self._id_field, id(document)))

        self._index.add_document(
            doc_id,
            document,
            self._searchable_fields,
        )

        # Index facets
        for field in self._facet_fields:
            value = document.get(field)
            if value:
                if isinstance(value, list):
                    for v in value:
                        self._facet_values[field][str(v)].add(doc_id)
                else:
                    self._facet_values[field][str(value)].add(doc_id)

        return doc_id

    def add_many(self, documents: List[Dict[str, Any]]) -> List[str]:
        """Add multiple documents."""
        return [self.add(doc) for doc in documents]

    def remove(self, doc_id: str) -> bool:
        """Remove a document."""
        # Remove from facets
        for field in self._facet_fields:
            for value, doc_ids in self._facet_values[field].items():
                doc_ids.discard(doc_id)

        return self._index.remove_document(doc_id)

    def search(
        self,
        query: str,
        limit: int = 10,
        offset: int = 0,
        fields: Optional[List[str]] = None,
        filters: Optional[Dict[str, Any]] = None,
        facets: Optional[List[str]] = None,
        match_type: MatchType = MatchType.CONTAINS,
        highlight: bool = True,
    ) -> SearchResponse:
        """Search documents.

        Args:
            query: Search query
            limit: Max results
            offset: Results offset
            fields: Fields to search
            filters: Facet filters
            facets: Facets to compute
            match_type: Match type
            highlight: Enable highlighting

        Returns:
            SearchResponse with results
        """
        import time
        start_time = time.time()

        # Search index
        raw_results = self._index.search(
            query,
            limit=limit + offset,  # Get enough for offset
            match_type=match_type,
        )

        # Apply filters
        if filters:
            filtered = []
            for doc_id, score in raw_results:
                include = True
                for field, value in filters.items():
                    if field in self._facet_values:
                        if isinstance(value, list):
                            if not any(doc_id in self._facet_values[field].get(v, set()) for v in value):
                                include = False
                                break
                        else:
                            if doc_id not in self._facet_values[field].get(str(value), set()):
                                include = False
                                break
                if include:
                    filtered.append((doc_id, score))
            raw_results = filtered

        # Apply offset
        total = len(raw_results)
        raw_results = raw_results[offset:offset + limit]

        # Build results
        results = []
        query_tokens = set(self._index._tokenizer.tokenize(query))

        for doc_id, score in raw_results:
            document = self._index.get_document(doc_id)
            if not document:
                continue

            # Find matched fields and highlights
            matched_fields = []
            highlights = {}

            if highlight:
                for field, value in document.items():
                    if isinstance(value, str):
                        field_tokens = set(self._index._tokenizer.tokenize(value))
                        if field_tokens & query_tokens:
                            matched_fields.append(field)
                            highlights[field] = self._highlight(value, query_tokens)

            results.append(SearchResult(
                id=doc_id,
                score=score,
                document=document,
                highlights=highlights,
                matched_fields=matched_fields,
            ))

        # Compute facets
        facet_counts: Dict[str, Dict[str, int]] = {}
        if facets:
            result_ids = {r.id for r in results}
            for facet_field in facets:
                if facet_field in self._facet_values:
                    facet_counts[facet_field] = {}
                    for value, doc_ids in self._facet_values[facet_field].items():
                        count = len(doc_ids & result_ids)
                        if count > 0:
                            facet_counts[facet_field][value] = count

        took_ms = (time.time() - start_time) * 1000

        return SearchResponse(
            query=query,
            total=total,
            results=results,
            took_ms=took_ms,
            facets=facet_counts,
        )

    def _highlight(
        self,
        text: str,
        query_tokens: Set[str],
        tag: str = "<mark>",
        end_tag: str = "</mark>",
    ) -> List[str]:
        """Generate highlighted snippets."""
        snippets = []
        words = text.split()

        for i, word in enumerate(words):
            word_lower = word.lower().strip(".,!?;:")
            if word_lower in query_tokens:
                start = max(0, i - 5)
                end = min(len(words), i + 6)
                snippet_words = words[start:end]

                # Highlight matching word
                for j, sw in enumerate(snippet_words):
                    if sw.lower().strip(".,!?;:") in query_tokens:
                        snippet_words[j] = f"{tag}{sw}{end_tag}"

                snippet = " ".join(snippet_words)
                if start > 0:
                    snippet = "..." + snippet
                if end < len(words):
                    snippet = snippet + "..."

                snippets.append(snippet)

                if len(snippets) >= 3:
                    break

        return snippets

    def suggest(self, prefix: str, limit: int = 5) -> List[str]:
        """Get search suggestions.

        Args:
            prefix: Search prefix
            limit: Max suggestions

        Returns:
            List of suggestions
        """
        prefix_lower = prefix.lower()
        suggestions = []

        for term in self._index._index:
            if term.startswith(prefix_lower):
                suggestions.append(term)
                if len(suggestions) >= limit:
                    break

        return sorted(suggestions)

    def get_stats(self) -> dict:
        """Get engine statistics."""
        return {
            **self._index.get_stats(),
            "facet_fields": list(self._facet_fields),
        }


# Singleton instance
search_engine = SearchEngine()


# Convenience functions
def add_to_index(document: Dict[str, Any]) -> str:
    """Add document to global search engine."""
    return search_engine.add(document)


def search(query: str, **kwargs) -> SearchResponse:
    """Search using global search engine."""
    return search_engine.search(query, **kwargs)
