import type { SearchResult } from '@api2mcp/core';
import { MemoryVectorStore } from './store.js';

import { hashEmbedding } from './indexer.js';

export class RAGRetriever {
  constructor(private store: MemoryVectorStore) {}

  search(query: string, topK: number, specName?: string): SearchResult[] {
    const queryEmbedding = hashEmbedding(query, 128);

    const results = specName
      ? this.store.searchInSpec(queryEmbedding, topK, specName)
      : this.store.search(queryEmbedding, topK);

    return results.map((r) => ({
      operationId: r.metadata['operationId'] ?? '',
      toolName: r.metadata['toolName'] ?? '',
      description: r.metadata['summary'] ?? '',
      path: r.metadata['path'] ?? '',
      method: r.metadata['method'] ?? '',
      similarityScore: Math.round(r.score * 100) / 100,
    }));
  }
}
