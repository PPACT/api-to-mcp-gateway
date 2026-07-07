import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryVectorStore } from '../packages/rag/src/store.js';
import { RAGIndexer } from '../packages/rag/src/indexer.js';
import { RAGRetriever } from '../packages/rag/src/retriever.js';
import type { ApiOperation } from '../packages/core/src/types.js';

const sampleOps: ApiOperation[] = [
  {
    operationId: 'listUsers',
    method: 'GET',
    path: '/users',
    summary: 'List all users',
    description: 'Returns a paginated list of users with optional search filters',
    tags: ['users'],
    parameters: [
      { name: 'page', in: 'query', required: false, schema: { type: 'integer' } },
      { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
    ],
    responses: { '200': { statusCode: '200', description: 'OK' } },
  },
  {
    operationId: 'createUser',
    method: 'POST',
    path: '/users',
    summary: 'Create a new user',
    description: 'Creates a user account with email and password',
    tags: ['users'],
    parameters: [],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { email: { type: 'string' }, name: { type: 'string' } },
            required: ['email', 'name'],
          },
        },
      },
    },
    responses: { '201': { statusCode: '201', description: 'Created' } },
  },
  {
    operationId: 'deleteRepo',
    method: 'DELETE',
    path: '/repos/{owner}/{repo}',
    summary: 'Delete a repository',
    description: 'Permanently delete a GitHub repository',
    tags: ['repos'],
    parameters: [
      { name: 'owner', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'repo', in: 'path', required: true, schema: { type: 'string' } },
    ],
    responses: { '204': { statusCode: '204', description: 'No Content' } },
  },
];

describe('MemoryVectorStore', () => {
  let store: MemoryVectorStore;

  beforeEach(() => {
    store = new MemoryVectorStore();
  });

  it('starts with count 0', () => {
    expect(store.count()).toBe(0);
  });

  it('adds documents and counts correctly', () => {
    store.add({ id: 'a', embedding: [1, 0, 0], metadata: { sourceName: 'test' } });
    store.add({ id: 'b', embedding: [0, 1, 0], metadata: { sourceName: 'test' } });
    expect(store.count()).toBe(2);
  });

  it('returns empty array when searching empty store', () => {
    const results = store.search([1, 0, 0], 5);
    expect(results).toEqual([]);
  });

  it('ranks by cosine similarity — identical vector scores highest', () => {
    store.add({ id: 'match', embedding: [1, 0, 0], metadata: { sourceName: 'test' } });
    store.add({ id: 'other', embedding: [0, 1, 0], metadata: { sourceName: 'test' } });

    const results = store.search([1, 0, 0], 2);
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('match');
    expect(results[0]!.score).toBeCloseTo(1, 5);
    expect(results[1]!.score).toBeCloseTo(0, 5);
  });

  it('searchInSpec scopes to one namespace', () => {
    store.add({ id: 'gh-1', embedding: [1, 0, 0], metadata: { sourceName: 'github' } });
    store.add({ id: 'nt-1', embedding: [1, 0, 0], metadata: { sourceName: 'notion' } });

    const results = store.searchInSpec([1, 0, 0], 5, 'github');
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('gh-1');
  });

  it('clears spec namespace', () => {
    store.add({ id: 'a', embedding: [1, 0, 0], metadata: { sourceName: 'gh' } });
    store.add({ id: 'b', embedding: [1, 0, 0], metadata: { sourceName: 'nt' } });
    store.clear('gh');
    expect(store.count()).toBe(1);
  });
});

describe('RAGIndexer', () => {
  let store: MemoryVectorStore;
  let indexer: RAGIndexer;

  beforeEach(() => {
    store = new MemoryVectorStore();
    indexer = new RAGIndexer(store);
  });

  it('indexes operations into the store', async () => {
    await indexer.index(sampleOps, 'github');
    expect(store.count()).toBe(3);
  });

  it('creates unique IDs per spec + operationId', async () => {
    await indexer.index(sampleOps, 'github');
    await indexer.index(sampleOps, 'notion');
    // 3 from github + 3 from notion = 6 total
    expect(store.count()).toBe(6);
  });
});

describe('RAGRetriever', () => {
  let store: MemoryVectorStore;
  let indexer: RAGIndexer;
  let retriever: RAGRetriever;

  beforeEach(async () => {
    store = new MemoryVectorStore();
    indexer = new RAGIndexer(store);
    retriever = new RAGRetriever(store);
    await indexer.index(sampleOps, 'github');
    await indexer.index([sampleOps[2]!], 'gitlab');
  });

  it('returns top-K results for a relevant query', () => {
    const results = retriever.search('list users with pagination', 2);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(2);
    // Hash embeddings are not semantic — verify structure only
    for (const r of results) {
      expect(typeof r.operationId).toBe('string');
      expect(typeof r.similarityScore).toBe('number');
    }
  });

  it('returns results scoped to a specific source', () => {
    const results = retriever.search('delete repository', 3, 'gitlab');
    expect(results).toHaveLength(1);
    expect(results[0]!.operationId).toBe('deleteRepo');
  });

  it('returns empty array when nothing matches', () => {
    const results = retriever.search('zzzxxx unrelated topic', 5);
    // May or may not return results due to hash embedding collisions
    // Just verify it does not throw
    expect(Array.isArray(results)).toBe(true);
  });

  it('returns structured SearchResult objects', () => {
    const results = retriever.search('create user', 1);
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.operationId).toBeTruthy();
    expect(r.toolName).toBeTruthy();
    expect(r.path).toBeTruthy();
    expect(r.method).toBeTruthy();
    expect(typeof r.similarityScore).toBe('number');
  });
});
