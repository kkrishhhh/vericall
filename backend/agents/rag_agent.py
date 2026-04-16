"""PolicyRAGAgent — ChromaDB + sentence-transformers for RBI compliance.

Implements a Retrieval-Augmented Generation (RAG) agent that:
1. Loads RBI KYC Master Direction 2016 text on first use
2. Chunks the text at ~500 tokens (word-based approximation)
3. Embeds chunks using sentence-transformers/all-MiniLM-L6-v2
4. Stores embeddings in ChromaDB (in-memory collection)
5. On query, retrieves top-K most relevant regulatory chunks

Design notes:
- Singleton pattern: the ChromaDB collection is initialized once and
  reused across all requests (in-memory, no disk persistence).
- Token chunking uses a simple word split at ~500 words (~500 tokens
  for English text) with 50-word overlap for context preservation.
- The embedding function uses ChromaDB's built-in
  SentenceTransformerEmbeddingFunction to avoid manual embedding.
"""

from __future__ import annotations

import os
import re
import logging
from typing import Any

logger = logging.getLogger("vericall.rag")

# Path to RBI KYC Master Direction text file
_RBI_TEXT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "data", "rbi_kyc_master_direction_2016.txt"
)


class PolicyRAGAgent:
    """Singleton RAG agent backed by ChromaDB + MiniLM-L6-v2.

    Usage:
        rag = PolicyRAGAgent.get_instance()
        results = rag.query("Aadhaar verification requirements", top_k=3)
    """

    _instance: PolicyRAGAgent | None = None
    _initialized: bool = False

    def __init__(self) -> None:
        self._collection = None
        self._ready = False

    @classmethod
    def get_instance(cls) -> PolicyRAGAgent:
        """Get or create the singleton PolicyRAGAgent."""
        if cls._instance is None:
            cls._instance = cls()
        if not cls._instance._ready:
            cls._instance._initialize()
        return cls._instance

    def _initialize(self) -> None:
        """Load RBI text, chunk, embed, and store in ChromaDB."""
        if self._ready:
            return

        try:
            import chromadb
            from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
        except ImportError as e:
            logger.warning(
                "chromadb or sentence-transformers not installed. "
                "RAG agent will return empty results. Install with: "
                "pip install chromadb sentence-transformers"
            )
            self._ready = True  # Mark ready to avoid repeated init attempts
            return

        # Load RBI text
        text = self._load_rbi_text()
        if not text:
            logger.warning("RBI KYC text file not found or empty — RAG disabled")
            self._ready = True
            return

        # Chunk the text at ~500 tokens (word-based)
        chunks = self._chunk_text(text, chunk_size=500, overlap=50)
        if not chunks:
            logger.warning("No chunks generated from RBI text — RAG disabled")
            self._ready = True
            return

        logger.info(f"PolicyRAG: Loaded {len(chunks)} chunks from RBI KYC Master Direction")

        # Initialize ChromaDB with sentence-transformer embeddings
        try:
            embedding_fn = SentenceTransformerEmbeddingFunction(
                model_name="sentence-transformers/all-MiniLM-L6-v2"
            )

            client = chromadb.Client()  # In-memory client
            # Delete existing collection if it exists (idempotent re-init)
            try:
                client.delete_collection("rbi_kyc_2016")
            except Exception:
                pass

            self._collection = client.create_collection(
                name="rbi_kyc_2016",
                embedding_function=embedding_fn,
                metadata={"description": "RBI KYC Master Direction 2016 chunks"},
            )

            # Add chunks to collection
            self._collection.add(
                ids=[f"chunk_{i}" for i in range(len(chunks))],
                documents=chunks,
                metadatas=[{"chunk_index": i, "source": "rbi_kyc_master_direction_2016"} for i in range(len(chunks))],
            )

            self._ready = True
            logger.info(f"PolicyRAG: ChromaDB collection created with {len(chunks)} documents")

        except Exception as e:
            logger.error(f"PolicyRAG initialization failed: {e}")
            self._ready = True  # Don't retry on every request

    def _load_rbi_text(self) -> str:
        """Load the RBI KYC Master Direction text file."""
        # Try multiple possible paths
        paths_to_try = [
            _RBI_TEXT_PATH,
            os.path.join(os.path.dirname(__file__), "..", "..", "data", "rbi_kyc_master_direction_2016.txt"),
            os.path.join(os.path.dirname(__file__), "..", "data", "rbi_kyc_master_direction_2016.txt"),
        ]

        for path in paths_to_try:
            abs_path = os.path.abspath(path)
            if os.path.exists(abs_path):
                with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                    return f.read()

        return ""

    @staticmethod
    def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
        """Split text into chunks of approximately `chunk_size` words.

        Uses word-level splitting with `overlap` words of context
        carryover between chunks to preserve sentence boundaries.
        """
        # Clean the text: normalize whitespace, remove excessive blank lines
        text = re.sub(r"\n{3,}", "\n\n", text)
        words = text.split()

        if not words:
            return []

        chunks: list[str] = []
        start = 0

        while start < len(words):
            end = min(start + chunk_size, len(words))
            chunk = " ".join(words[start:end])

            # Only add non-trivial chunks (at least 20 words)
            if len(chunk.split()) >= 20:
                chunks.append(chunk)

            # Advance with overlap
            start = end - overlap if end < len(words) else end

        return chunks

    def query(self, query_text: str, top_k: int = 3) -> list[dict[str, Any]]:
        """Query the RAG collection for relevant regulatory text.

        Args:
            query_text: The decision or question to find regulatory basis for
            top_k: Number of results to return

        Returns:
            List of dicts with 'text', 'relevance_score', 'chunk_index'
        """
        if not self._collection:
            return [{
                "text": "RAG not initialized — PolicyRAGAgent ChromaDB collection unavailable",
                "relevance_score": 0.0,
                "chunk_index": -1,
            }]

        try:
            results = self._collection.query(
                query_texts=[query_text],
                n_results=min(top_k, 10),
            )

            citations: list[dict[str, Any]] = []
            if results and results.get("documents"):
                docs = results["documents"][0]
                distances = results.get("distances", [[]])[0]
                metadatas = results.get("metadatas", [[]])[0]

                for i, doc in enumerate(docs):
                    # ChromaDB returns L2 distances; convert to similarity score
                    distance = distances[i] if i < len(distances) else 1.0
                    similarity = max(0.0, 1.0 - (distance / 10.0))  # Normalize

                    citations.append({
                        "text": doc[:500],  # Truncate to 500 chars for response
                        "relevance_score": round(similarity, 4),
                        "chunk_index": metadatas[i].get("chunk_index", -1) if i < len(metadatas) else -1,
                        "source": "RBI KYC Master Direction 2016",
                    })

            return citations

        except Exception as e:
            logger.error(f"PolicyRAG query failed: {e}")
            return [{
                "text": f"RAG query failed: {str(e)}",
                "relevance_score": 0.0,
                "chunk_index": -1,
            }]
