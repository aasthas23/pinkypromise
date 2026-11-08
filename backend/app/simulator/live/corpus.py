"""Retrieval over the redacted FTC robocall corpus (backend/data/robocall_transcripts.jsonl).

Small enough (a few hundred transcripts) for an in-memory BM25 index, so no
vector store or extra dependency is needed. Each scenario asks for transcripts
matching its scam types and tactics plus a free-text query; the top matches are
given to the model as reference patterns.
"""

import json
import math
import random
import re
from collections import Counter
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

CORPUS_PATH = Path(__file__).resolve().parents[3] / 'data' / 'robocall_transcripts.jsonl'
_WORD = re.compile(r"[a-z']+")
_STOP = set('the a an and or to of you your is are we our this that for in on it be with please if as at by from will have has can'.split())


def _tokens(text: str) -> list[str]:
    return [w for w in _WORD.findall(text.lower()) if w not in _STOP and len(w) > 2]


@dataclass(frozen=True)
class SourceTranscript:
    id: str
    source_file: str
    text: str
    scam_types: tuple[str, ...]
    tactics: tuple[str, ...]


@dataclass
class Corpus:
    docs: list[SourceTranscript]
    _tf: list[Counter] = field(default_factory=list, repr=False)
    _df: Counter = field(default_factory=Counter, repr=False)
    _avg_len: float = 1.0

    def __post_init__(self) -> None:
        self._tf = [Counter(_tokens(d.text)) for d in self.docs]
        for tf in self._tf:
            self._df.update(tf.keys())
        self._avg_len = sum(sum(tf.values()) for tf in self._tf) / max(1, len(self._tf))

    def _bm25(self, i: int, query: list[str], k1: float = 1.4, b: float = 0.75) -> float:
        tf, n = self._tf[i], len(self.docs)
        length = sum(tf.values()) or 1
        score = 0.0
        for q in query:
            if q not in tf:
                continue
            idf = math.log(1 + (n - self._df[q] + 0.5) / (self._df[q] + 0.5))
            score += idf * tf[q] * (k1 + 1) / (tf[q] + k1 * (1 - b + b * length / self._avg_len))
        return score

    def retrieve(
        self,
        query: str,
        scam_types: tuple[str, ...] = (),
        tactics: tuple[str, ...] = (),
        k: int = 4,
        rng: random.Random | None = None,
    ) -> list[SourceTranscript]:
        """Top-k transcripts by BM25 + tag overlap, sampled from the best few so calls vary."""
        q = _tokens(query)
        scored = []
        for i, d in enumerate(self.docs):
            s = self._bm25(i, q) + 2.0 * len(set(scam_types) & set(d.scam_types)) + 1.0 * len(set(tactics) & set(d.tactics))
            if s > 0:
                scored.append((s, i))
        scored.sort(reverse=True)
        pool = [self.docs[i] for _, i in scored[: k * 3]]
        if rng and len(pool) > k:
            return rng.sample(pool, k)
        return pool[:k]


@lru_cache(maxsize=1)
def load_corpus(path: Path = CORPUS_PATH) -> Corpus:
    docs = []
    with path.open(encoding='utf-8') as f:
        for line in f:
            r = json.loads(line)
            docs.append(SourceTranscript(r['id'], r['source_file'], r['text'], tuple(r['scam_types']), tuple(r['tactics'])))
    return Corpus(docs)
