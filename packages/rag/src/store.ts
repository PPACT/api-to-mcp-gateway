/**
 * In-memory vector store with cosine similarity search.
 * Used for RAG document retrieval without external dependencies.
 */
export interface VectorDoc {
  id: string;
  embedding: number[];
  metadata: Record<string, string>;
}

export class MemoryVectorStore {
  private docs: VectorDoc[] = [];
  private specDocs: Map<string, VectorDoc[]> = new Map();

  add(doc: VectorDoc): void {
    this.docs.push(doc);
    const specName = doc.metadata['sourceName'] ?? '_default';
    const existing = this.specDocs.get(specName) ?? [];
    existing.push(doc);
    this.specDocs.set(specName, existing);
  }

  /**
   * Search by cosine similarity across all documents.
   * Returns top-K results with similarity scores.
   */
  search(queryEmbedding: number[], topK: number): Array<VectorDoc & { score: number }> {
    if (this.docs.length === 0) return [];

    const scored = this.docs.map((doc) => ({
      ...doc,
      score: cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** Search within a specific spec namespace. */
  searchInSpec(
    queryEmbedding: number[],
    topK: number,
    specName: string,
  ): Array<VectorDoc & { score: number }> {
    const docs = this.specDocs.get(specName) ?? [];
    if (docs.length === 0) return [];

    const scored = docs.map((doc) => ({
      ...doc,
      score: cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  clear(specName: string): void {
    this.specDocs.delete(specName);
    this.docs = this.docs.filter(
      (d) => (d.metadata['sourceName'] ?? '_default') !== specName,
    );
  }

  count(): number {
    return this.docs.length;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
