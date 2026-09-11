"""
ORYQEN Backend - PDF Processor
Extracts text from PDF files, cleans it, and splits into chunks for RAG.
"""

import re
import uuid
from pathlib import Path
from typing import Optional

try:
    import pymupdf as fitz
except ImportError:
    import fitz  # PyMuPDF fallback


def extract_text_from_pdf(pdf_path: str | Path) -> list[dict]:
    """
    Extract text from a PDF file, page by page.

    Returns a list of dicts: [{"page": 1, "text": "..."}, ...]
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    pages = []
    doc = fitz.open(str(pdf_path))

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text")

        # Basic cleaning
        text = _clean_text(text)

        if text.strip():  # Skip empty pages
            pages.append({
                "page": page_num + 1,
                "text": text
            })

    doc.close()
    return pages


def _clean_text(text: str) -> str:
    """Clean extracted PDF text."""
    # Remove excessive whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Remove page headers/footers that are just numbers
    text = re.sub(r'^\s*\d+\s*$', '', text, flags=re.MULTILINE)
    # Normalize spaces
    text = re.sub(r'[ \t]+', ' ', text)
    # Remove leading/trailing whitespace per line
    text = '\n'.join(line.strip() for line in text.split('\n'))
    return text.strip()


def chunk_text(
    pages: list[dict],
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    course_id: Optional[str] = None,
    material_id: Optional[str] = None,
    material_title: Optional[str] = None,
) -> list[dict]:
    """
    Split page text into overlapping chunks suitable for RAG.

    Each chunk is ~chunk_size tokens with chunk_overlap overlap.
    Metadata includes source page, course, and material info.

    Returns list of chunk dicts ready for embedding.
    """
    chunks = []
    chunk_index = 0

    for page_data in pages:
        page_num = page_data["page"]
        text = page_data["text"]

        # Simple word-based chunking (approximation of tokens)
        words = text.split()

        if not words:
            continue

        i = 0
        while i < len(words):
            # Get chunk_size words
            chunk_words = words[i:i + chunk_size]
            chunk_text_content = ' '.join(chunk_words)

            if chunk_text_content.strip():
                chunks.append({
                    "id": str(uuid.uuid4()),
                    "content": chunk_text_content,
                    "page_number": page_num,
                    "chunk_index": chunk_index,
                    "course_id": course_id,
                    "material_id": material_id,
                    "material_title": material_title or "",
                    "token_count": len(chunk_words),
                })
                chunk_index += 1

            # Move forward by chunk_size - overlap
            i += chunk_size - chunk_overlap

    return chunks


def process_pdf(
    pdf_path: str | Path,
    course_id: str,
    material_id: str,
    material_title: Optional[str] = None,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> dict:
    """
    Full PDF processing pipeline:
    PDF -> extract text -> clean -> chunk -> return chunks with metadata.

    Returns:
        {
            "material_id": str,
            "filename": str,
            "page_count": int,
            "chunks": list[dict],
            "chunk_count": int,
        }
    """
    pdf_path = Path(pdf_path)

    # Extract text from each page
    pages = extract_text_from_pdf(pdf_path)

    # Split into chunks with metadata
    chunks = chunk_text(
        pages=pages,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        course_id=course_id,
        material_id=material_id,
        material_title=material_title,
    )

    return {
        "material_id": material_id,
        "filename": pdf_path.name,
        "page_count": len(pages),
        "chunks": chunks,
        "chunk_count": len(chunks),
    }


if __name__ == "__main__":
    # Quick test - process a sample PDF
    import sys
    if len(sys.argv) > 1:
        result = process_pdf(
            pdf_path=sys.argv[1],
            course_id="test-course",
            material_id="test-material",
            material_title="Test Document"
        )
        print(f"[OK] Processed: {result['filename']}")
        print(f"     Pages: {result['page_count']}")
        print(f"     Chunks: {result['chunk_count']}")
        if result['chunks']:
            print(f"\n--- First chunk preview ---")
            print(result['chunks'][0]['content'][:300])
    else:
        print("Usage: python pdf_processor.py <path_to_pdf>")
