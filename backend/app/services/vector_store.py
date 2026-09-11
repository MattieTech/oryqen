"""
ORYQEN Backend - Vector Store Service
Local FAISS vector store for semantic search across course material chunks.
Runs entirely offline — no cloud dependencies.
"""

import json
import os
from pathlib import Path
from typing import Optional

import faiss
import numpy as np

from .embeddings import EMBEDDING_DIMENSION, generate_embedding

# Vector store lives in backend/data/vectors/
VECTORS_DIR = Path(__file__).parent.parent.parent / "data" / "vectors"


class VectorStore:
    """
    Local FAISS-based vector store for ORYQEN course material search.

    Each course gets its own FAISS index so we can search within
    a specific course's materials.
    """

    def __init__(self):
        VECTORS_DIR.mkdir(parents=True, exist_ok=True)
        # In-memory store: course_id -> {index, metadata}
        self._indices: dict[str, faiss.IndexFlatIP] = {}
        self._metadata: dict[str, list[dict]] = {}

    def _index_path(self, course_id: str) -> Path:
        return VECTORS_DIR / f"{course_id}.index"

    def _metadata_path(self, course_id: str) -> Path:
        return VECTORS_DIR / f"{course_id}.meta.json"

    def add_chunks(self, course_id: str, chunks: list[dict], embeddings: list[list[float]]):
        """
        Add embedded chunks to the vector store for a course.

        Args:
            course_id: The course these chunks belong to
            chunks: List of chunk dicts (must have 'id', 'content', etc.)
            embeddings: Corresponding embedding vectors
        """
        vectors = np.array(embeddings, dtype=np.float32)

        # Normalize vectors for cosine similarity (IndexFlatIP does inner product)
        faiss.normalize_L2(vectors)

        if course_id not in self._indices:
            # Create new index
            index = faiss.IndexFlatIP(EMBEDDING_DIMENSION)
            self._indices[course_id] = index
            self._metadata[course_id] = []
        else:
            index = self._indices[course_id]

        # Add vectors to index
        index.add(vectors)

        # Store metadata alongside (same order as vectors)
        for chunk in chunks:
            self._metadata[course_id].append({
                "id": chunk["id"],
                "content": chunk["content"],
                "page_number": chunk.get("page_number"),
                "chunk_index": chunk.get("chunk_index"),
                "material_id": chunk.get("material_id"),
                "material_title": chunk.get("material_title", ""),
                "token_count": chunk.get("token_count", 0),
            })

        # Persist to disk
        self._save(course_id)
        print(f"  [OK] Stored {len(chunks)} chunks for course {course_id} "
              f"(total: {index.ntotal})")

    def search(
        self,
        query: str,
        course_id: str,
        top_k: int = 5,
        min_score: float = 0.3,
    ) -> list[dict]:
        """
        Search for chunks most relevant to a query within a course.

        Args:
            query: The student's question
            course_id: Which course to search in
            top_k: Number of results to return
            min_score: Minimum similarity score (0-1)

        Returns:
            List of dicts with 'content', 'score', 'page_number', etc.
        """
        # Load index if not in memory
        if course_id not in self._indices:
            self._load(course_id)

        if course_id not in self._indices:
            print(f"  [NOTICE] No vector index found for course {course_id}")
            return []

        index = self._indices[course_id]
        metadata = self._metadata[course_id]

        if index.ntotal == 0:
            return []

        # Embed the query
        query_vector = np.array([generate_embedding(query)], dtype=np.float32)
        faiss.normalize_L2(query_vector)

        # Search
        actual_k = min(top_k, index.ntotal)
        scores, indices = index.search(query_vector, actual_k)

        # Build results with metadata
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or score < min_score:
                continue
            result = {**metadata[idx], "score": float(score)}
            results.append(result)

        return results

    def _save(self, course_id: str):
        """Persist index and metadata to disk."""
        if course_id in self._indices:
            faiss.write_index(
                self._indices[course_id],
                str(self._index_path(course_id))
            )
        if course_id in self._metadata:
            with open(self._metadata_path(course_id), 'w') as f:
                json.dump(self._metadata[course_id], f)

    def _load(self, course_id: str):
        """Load index and metadata from disk."""
        index_path = self._index_path(course_id)
        meta_path = self._metadata_path(course_id)

        if index_path.exists() and meta_path.exists():
            self._indices[course_id] = faiss.read_index(str(index_path))
            with open(meta_path, 'r') as f:
                self._metadata[course_id] = json.load(f)
            print(f"  [OK] Loaded {self._indices[course_id].ntotal} vectors "
                  f"for course {course_id}")

    def get_course_stats(self, course_id: str) -> dict:
        """Get stats about a course's vector index."""
        if course_id not in self._indices:
            self._load(course_id)
        if course_id not in self._indices:
            return {"total_chunks": 0, "indexed": False}
        return {
            "total_chunks": self._indices[course_id].ntotal,
            "indexed": True,
        }


# Singleton instance
vector_store = VectorStore()
