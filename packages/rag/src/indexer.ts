import type { ApiOperation } from '@api2mcp/core';
import { MemoryVectorStore, type VectorDoc } from './store.js';

/**
 * Indexes API operations as searchable documents in a vector store.
 * Uses a simple hash-based embedding for demo purposes.
 */
export class RAGIndexer {
  constructor(private store: MemoryVectorStore) {}

  async index(operations: ApiOperation[], specName: string): Promise<void> {
    for (const op of operations) {
      const docText = buildDocumentText(op, specName);
      const embedding = hashEmbedding(docText, 128);

      const doc: VectorDoc = {
        id: specName + '::' + op.operationId,
        embedding,
        metadata: {
          operationId: op.operationId,
          toolName: specName + '_' + op.operationId.replace(/([A-Z])/g, '_$1').toLowerCase(),
          path: op.path,
          method: op.method,
          sourceName: specName,
        },
      };
      this.store.add(doc);
    }
  }
}

/**
 * Build a searchable text representation of an API operation.
 */
function buildDocumentText(op: ApiOperation, sourceName: string): string {
  const parts: string[] = [];
  parts.push('API: ' + sourceName);
  parts.push('Operation: ' + op.operationId);
  parts.push('Method: ' + op.method + ' ' + op.path);
  if (op.summary) parts.push('Summary: ' + op.summary);
  if (op.description) parts.push('Description: ' + op.description);
  if (op.tags && op.tags.length > 0) parts.push('Tags: ' + op.tags.join(', '));
  for (const p of op.parameters) {
    parts.push('Parameter: ' + p.name + ' (' + p.in + ') ' + (p.required ? 'required' : 'optional'));
  }
  return parts.join('. ');
}

/**
 * Simple hash-based embedding for demo/testing.
 * In production, this would use OpenAI/Claude embeddings API.
 */
export function hashEmbedding(text: string, dims: number): number[] {
  const embedding = new Array<number>(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const bucket = (code * 31 + i * 7) % dims;
    embedding[bucket]! += 1;
  }
  // Normalize to unit vector
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < dims; i++) {
      embedding[i] = embedding[i]! / norm;
    }
  }
  return embedding;
}
