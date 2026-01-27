"""
Search Engine - Sprint 821

Full-text search and filtering utilities.

Features:
- Text tokenization and normalization
- Inverted index
- TF-IDF ranking
- Fuzzy matching
- Faceted search
- Query parsing
- Highlighting
"""

import math
import re
import unicodedata
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import (
    Any, Callable, Dict, Generic, Iterable, List, Optional, Set, Tuple, TypeVar, Union
)

T = TypeVar("T")


class TokenizerType(str, Enum):
    SIMPLE = "simple"
    WHITESPACE = "whitespace"
    NGRAM = "ngram"
    EDGE_NGRAM = "edge_ngram"


class MatchMode(str, Enum):
    ALL = "all"
    ANY = "any"
    PHRASE = "phrase"


@dataclass
class SearchHit(Generic[T]):
    document: T
    doc_id: str
    score: float
    highlights: Dict[str, List[str]] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SearchResult(Generic[T]):
    hits: List[SearchHit[T]]
    total: int
    took_ms: float
    facets: Dict[str, Dict[str, int]] = field(default_factory=dict)
    suggestions: List[str] = field(default_factory=list)

    @property
    def documents(self) -> List[T]:
        return [hit.document for hit in self.hits]


@dataclass
class FacetConfig:
    field: str
    size: int = 10
    min_count: int = 1


class Tokenizer(ABC):
    @abstractmethod
    def tokenize(self, text: str) -> List[str]:
        pass


class SimpleTokenizer(Tokenizer):
    def __init__(self, min_length: int = 2, stop_words: Optional[Set[str]] = None):
        self.min_length = min_length
        self.stop_words = stop_words or {
            "a", "an", "and", "are", "as", "at", "be", "by", "for",
            "from", "has", "he", "in", "is", "it", "its", "of", "on",
            "or", "that", "the", "to", "was", "were", "will", "with"
        }

    def tokenize(self, text: str) -> List[str]:
        if not text:
            return []
        text = unicodedata.normalize("NFKC", text)
        tokens = re.split(r"[^a-zA-Z0-9]+", text.lower())
        return [t for t in tokens if len(t) >= self.min_length and t not in self.stop_words]


class WhitespaceTokenizer(Tokenizer):
    def tokenize(self, text: str) -> List[str]:
        if not text:
            return []
        return text.lower().split()


class NGramTokenizer(Tokenizer):
    def __init__(self, min_n: int = 2, max_n: int = 3):
        self.min_n = min_n
        self.max_n = max_n

    def tokenize(self, text: str) -> List[str]:
        if not text:
            return []
        text = text.lower()
        tokens = []
        for n in range(self.min_n, self.max_n + 1):
            for i in range(len(text) - n + 1):
                tokens.append(text[i:i + n])
        return tokens


class EdgeNGramTokenizer(Tokenizer):
    def __init__(self, min_n: int = 1, max_n: int = 10):
        self.min_n = min_n
        self.max_n = max_n

    def tokenize(self, text: str) -> List[str]:
        if not text:
            return []
        words = text.lower().split()
        tokens = []
        for word in words:
            max_len = min(len(word), self.max_n)
            for n in range(self.min_n, max_len + 1):
                tokens.append(word[:n])
        return tokens


class Analyzer:
    def __init__(
        self,
        tokenizer: Optional[Tokenizer] = None,
        filters: Optional[List[Callable[[str], Optional[str]]]] = None,
    ):
        self.tokenizer = tokenizer or SimpleTokenizer()
        self.filters = filters or []

    def analyze(self, text: str) -> List[str]:
        tokens = self.tokenizer.tokenize(text)
        for filter_fn in self.filters:
            new_tokens = []
            for token in tokens:
                result = filter_fn(token)
                if result:
                    new_tokens.append(result)
            tokens = new_tokens
        return tokens


class InvertedIndex(Generic[T]):
    def __init__(self, analyzer: Optional[Analyzer] = None):
        self.analyzer = analyzer or Analyzer()
        self._index: Dict[str, Dict[str, List[int]]] = defaultdict(dict)
        self._documents: Dict[str, T] = {}
        self._doc_lengths: Dict[str, int] = {}
        self._field_values: Dict[str, Dict[str, Any]] = defaultdict(dict)
        self._total_docs = 0
        self._avg_doc_length = 0.0

    def add_document(
        self, doc_id: str, text: str, document: Optional[T] = None, fields: Optional[Dict[str, Any]] = None
    ) -> None:
        tokens = self.analyzer.analyze(text)
        self._documents[doc_id] = document or text
        self._doc_lengths[doc_id] = len(tokens)
        if fields:
            for field_name, value in fields.items():
                self._field_values[field_name][doc_id] = value
        for position, token in enumerate(tokens):
            if doc_id not in self._index[token]:
                self._index[token][doc_id] = []
            self._index[token][doc_id].append(position)
        self._total_docs += 1
        total_length = sum(self._doc_lengths.values())
        self._avg_doc_length = total_length / self._total_docs if self._total_docs > 0 else 0

    def remove_document(self, doc_id: str) -> bool:
        if doc_id not in self._documents:
            return False
        empty_terms = []
        for term, postings in self._index.items():
            if doc_id in postings:
                del postings[doc_id]
                if not postings:
                    empty_terms.append(term)
        for term in empty_terms:
            del self._index[term]
        del self._documents[doc_id]
        del self._doc_lengths[doc_id]
        for field_values in self._field_values.values():
            if doc_id in field_values:
                del field_values[doc_id]
        self._total_docs -= 1
        total_length = sum(self._doc_lengths.values())
        self._avg_doc_length = total_length / self._total_docs if self._total_docs > 0 else 0
        return True

    def search(
        self, query: str, mode: MatchMode = MatchMode.ALL, limit: int = 10, offset: int = 0,
        filters: Optional[Dict[str, Any]] = None, facets: Optional[List[FacetConfig]] = None
    ) -> SearchResult[T]:
        import time
        start_time = time.time()
        query_tokens = self.analyzer.analyze(query)
        if not query_tokens:
            return SearchResult(hits=[], total=0, took_ms=0)
        matching_docs = self._find_matching_docs(query_tokens, mode)
        if filters:
            matching_docs = self._apply_filters(matching_docs, filters)
        scored_docs = self._score_documents(matching_docs, query_tokens)
        scored_docs.sort(key=lambda x: x[1], reverse=True)
        total = len(scored_docs)
        paginated = scored_docs[offset:offset + limit]
        hits = []
        for doc_id, score in paginated:
            doc = self._documents.get(doc_id)
            hit = SearchHit(document=doc, doc_id=doc_id, score=score, highlights=self._get_highlights(doc_id, query_tokens))
            hits.append(hit)
        facet_results = {}
        if facets:
            all_matching = {doc_id for doc_id, _ in scored_docs}
            for facet_config in facets:
                facet_results[facet_config.field] = self._calculate_facet(facet_config, all_matching)
        took_ms = (time.time() - start_time) * 1000
        return SearchResult(hits=hits, total=total, took_ms=took_ms, facets=facet_results)

    def _find_matching_docs(self, tokens: List[str], mode: MatchMode) -> Set[str]:
        if not tokens:
            return set()
        if mode == MatchMode.ANY:
            result = set()
            for token in tokens:
                if token in self._index:
                    result.update(self._index[token].keys())
            return result
        elif mode == MatchMode.ALL:
            result = None
            for token in tokens:
                if token not in self._index:
                    return set()
                doc_ids = set(self._index[token].keys())
                if result is None:
                    result = doc_ids
                else:
                    result &= doc_ids
            return result or set()
        elif mode == MatchMode.PHRASE:
            if len(tokens) < 2:
                return self._find_matching_docs(tokens, MatchMode.ALL)
            if tokens[0] not in self._index:
                return set()
            candidates = set(self._index[tokens[0]].keys())
            for i in range(1, len(tokens)):
                token = tokens[i]
                if token not in self._index:
                    return set()
                new_candidates = set()
                for doc_id in candidates:
                    if doc_id not in self._index[token]:
                        continue
                    prev_positions = self._index[tokens[i - 1]].get(doc_id, [])
                    curr_positions = self._index[token].get(doc_id, [])
                    for prev_pos in prev_positions:
                        if prev_pos + 1 in curr_positions:
                            new_candidates.add(doc_id)
                            break
                candidates = new_candidates
            return candidates
        return set()

    def _apply_filters(self, doc_ids: Set[str], filters: Dict[str, Any]) -> Set[str]:
        result = set()
        for doc_id in doc_ids:
            match = True
            for field_name, filter_value in filters.items():
                if field_name not in self._field_values:
                    match = False
                    break
                doc_value = self._field_values[field_name].get(doc_id)
                if isinstance(filter_value, list):
                    if doc_value not in filter_value:
                        match = False
                        break
                else:
                    if doc_value != filter_value:
                        match = False
                        break
            if match:
                result.add(doc_id)
        return result

    def _score_documents(self, doc_ids: Set[str], query_tokens: List[str]) -> List[Tuple[str, float]]:
        k1 = 1.2
        b = 0.75
        scores = []
        for doc_id in doc_ids:
            score = 0.0
            doc_length = self._doc_lengths.get(doc_id, 0)
            for token in query_tokens:
                if token not in self._index:
                    continue
                df = len(self._index[token])
                idf = math.log((self._total_docs - df + 0.5) / (df + 0.5) + 1)
                tf = len(self._index[token].get(doc_id, []))
                numerator = tf * (k1 + 1)
                denominator = tf + k1 * (1 - b + b * (doc_length / self._avg_doc_length)) if self._avg_doc_length > 0 else 1
                score += idf * (numerator / denominator)
            scores.append((doc_id, score))
        return scores

    def _get_highlights(self, doc_id: str, query_tokens: List[str]) -> Dict[str, List[str]]:
        doc = self._documents.get(doc_id)
        if not isinstance(doc, str):
            return {}
        highlights = []
        words = doc.split()
        matched_positions = set()
        for token in query_tokens:
            if token in self._index and doc_id in self._index[token]:
                for pos in self._index[token][doc_id]:
                    matched_positions.add(pos)
        for pos in sorted(matched_positions):
            start = max(0, pos - 3)
            end = min(len(words), pos + 4)
            snippet = words[start:end]
            if pos - start < len(snippet):
                snippet[pos - start] = f"**{snippet[pos - start]}**"
            highlights.append(" ".join(snippet))
        return {"content": highlights[:3]} if highlights else {}

    def _calculate_facet(self, config: FacetConfig, matching_docs: Set[str]) -> Dict[str, int]:
        counts: Dict[str, int] = defaultdict(int)
        field_values = self._field_values.get(config.field, {})
        for doc_id in matching_docs:
            value = field_values.get(doc_id)
            if value is not None:
                counts[str(value)] += 1
        filtered = {k: v for k, v in counts.items() if v >= config.min_count}
        sorted_items = sorted(filtered.items(), key=lambda x: x[1], reverse=True)
        return dict(sorted_items[:config.size])

    def suggest(self, prefix: str, limit: int = 10) -> List[str]:
        prefix = prefix.lower()
        suggestions = []
        for term in self._index.keys():
            if term.startswith(prefix):
                suggestions.append(term)
                if len(suggestions) >= limit:
                    break
        return suggestions


class FuzzyMatcher:
    def distance(self, s1: str, s2: str) -> int:
        if len(s1) < len(s2):
            s1, s2 = s2, s1
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

    def match(self, s1: str, s2: str, max_distance: int = 2) -> bool:
        return self.distance(s1, s2) <= max_distance

    def find_closest(self, query: str, candidates: Iterable[str], max_distance: int = 2, limit: int = 5) -> List[Tuple[str, int]]:
        results = []
        for candidate in candidates:
            dist = self.distance(query.lower(), candidate.lower())
            if dist <= max_distance:
                results.append((candidate, dist))
        results.sort(key=lambda x: x[1])
        return results[:limit]


class QueryParser:
    @dataclass
    class ParsedQuery:
        terms: List[str] = field(default_factory=list)
        phrases: List[str] = field(default_factory=list)
        required: List[str] = field(default_factory=list)
        excluded: List[str] = field(default_factory=list)
        field_queries: Dict[str, str] = field(default_factory=dict)

    def parse(self, query: str) -> ParsedQuery:
        result = self.ParsedQuery()
        phrase_pattern = r'"([^"]+)"'
        for match in re.finditer(phrase_pattern, query):
            result.phrases.append(match.group(1))
        query = re.sub(phrase_pattern, "", query)
        tokens = query.split()
        for token in tokens:
            if not token:
                continue
            if ":" in token:
                parts = token.split(":", 1)
                result.field_queries[parts[0]] = parts[1]
            elif token.startswith("+"):
                term = token[1:]
                if term:
                    result.required.append(term)
            elif token.startswith("-"):
                term = token[1:]
                if term:
                    result.excluded.append(term)
            else:
                result.terms.append(token)
        return result


class SearchEngine(Generic[T]):
    def __init__(self, analyzer: Optional[Analyzer] = None):
        self._index = InvertedIndex(analyzer)
        self._fuzzy = FuzzyMatcher()
        self._parser = QueryParser()

    def index(self, doc_id: str, document: T, text: str, fields: Optional[Dict[str, Any]] = None) -> None:
        self._index.add_document(doc_id, text, document, fields)

    def remove(self, doc_id: str) -> bool:
        return self._index.remove_document(doc_id)

    def search(
        self, query: str, limit: int = 10, offset: int = 0, filters: Optional[Dict[str, Any]] = None,
        facets: Optional[List[FacetConfig]] = None, fuzzy: bool = False, fuzzy_distance: int = 1
    ) -> SearchResult[T]:
        parsed = self._parser.parse(query)
        all_terms = parsed.terms + parsed.required + [word for phrase in parsed.phrases for word in phrase.split()]
        combined_filters = dict(filters or {})
        combined_filters.update(parsed.field_queries)
        mode = MatchMode.PHRASE if parsed.phrases else MatchMode.ALL
        result = self._index.search(
            " ".join(all_terms), mode=mode, limit=limit, offset=offset,
            filters=combined_filters if combined_filters else None, facets=facets
        )
        if parsed.excluded:
            result.hits = [hit for hit in result.hits if not any(term in str(hit.document).lower() for term in parsed.excluded)]
        if fuzzy and not result.hits:
            suggestions = []
            for term in all_terms:
                closest = self._fuzzy.find_closest(term, self._index._index.keys(), max_distance=fuzzy_distance)
                suggestions.extend([s for s, _ in closest])
            result.suggestions = list(set(suggestions))[:5]
        return result

    def suggest(self, prefix: str, limit: int = 10) -> List[str]:
        return self._index.suggest(prefix, limit)


def create_search_engine(tokenizer_type: TokenizerType = TokenizerType.SIMPLE) -> SearchEngine:
    if tokenizer_type == TokenizerType.SIMPLE:
        tokenizer = SimpleTokenizer()
    elif tokenizer_type == TokenizerType.WHITESPACE:
        tokenizer = WhitespaceTokenizer()
    elif tokenizer_type == TokenizerType.NGRAM:
        tokenizer = NGramTokenizer()
    elif tokenizer_type == TokenizerType.EDGE_NGRAM:
        tokenizer = EdgeNGramTokenizer()
    else:
        tokenizer = SimpleTokenizer()
    analyzer = Analyzer(tokenizer=tokenizer)
    return SearchEngine(analyzer)
