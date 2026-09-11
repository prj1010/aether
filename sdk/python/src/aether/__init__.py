"""Aether — model-agnostic enterprise RAG engine."""

from .engine import Engine, SearchHit
from .evaluate import EvalReport, run_golden_eval
from .llm import public_llm_status, resolve_llm_config
from .types import Answer, Citation, Document, MemoryItem

__all__ = [
    "Answer",
    "Citation",
    "Document",
    "Engine",
    "EvalReport",
    "MemoryItem",
    "SearchHit",
    "public_llm_status",
    "resolve_llm_config",
    "run_golden_eval",
]
__version__ = "0.1.0"
