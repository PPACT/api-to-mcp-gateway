import { describe, it, expect } from 'vitest';
import { MemoryVectorStore } from '../store.js';

function doc(id: string, embedding: number[], sourceName = 'petstore') {
  return { id, embedding, metadata: { sourceName } };
}

describe('MemoryVectorStore', () => {
  it('orders results by cosine similarity to the query', () => {
    const store = new MemoryVectorStore();
    store.add(doc('far', [0, 1]));
    store.add(doc('near', [1, 0]));
    store.add(doc('opposite', [-1, 0]));

    const hits = store.search([1, 0], 3);

    expect(hits.map((h) => h.id)).toEqual(['near', 'far', 'opposite']);
    expect(hits[0]!.score).toBeCloseTo(1);
    expect(hits[1]!.score).toBeCloseTo(0);
    expect(hits[2]!.score).toBeCloseTo(-1);
  });

  it('returns at most topK hits', () => {
    const store = new MemoryVectorStore();
    store.add(doc('a', [1, 0]));
    store.add(doc('b', [0, 1]));

    const hits = store.search([1, 0], 1);

    expect(hits).toHaveLength(1);
    expect(hits[0]!.id).toBe('a');
  });

  it('returns nothing when the store is empty', () => {
    const store = new MemoryVectorStore();

    expect(store.search([1, 0], 5)).toEqual([]);
  });

  it('treats vectors of different length as unrelated rather than throwing', () => {
    const store = new MemoryVectorStore();
    store.add(doc('short', [1, 0]));

    const hits = store.search([1, 0, 0], 1);

    expect(hits).toHaveLength(1);
    expect(hits[0]!.score).toBe(0);
  });

  it('restricts searchInSpec to one namespace', () => {
    const store = new MemoryVectorStore();
    store.add(doc('gh-issue', [1, 0], 'github'));
    store.add(doc('notion-page', [1, 0], 'notion'));

    const hits = store.searchInSpec([1, 0], 5, 'github');

    expect(hits.map((h) => h.id)).toEqual(['gh-issue']);
  });

  it('clear() drops one namespace and leaves the others intact', () => {
    const store = new MemoryVectorStore();
    store.add(doc('gh-issue', [1, 0], 'github'));
    store.add(doc('notion-page', [1, 0], 'notion'));
    expect(store.count()).toBe(2);

    store.clear('github');

    expect(store.count()).toBe(1);
    expect(store.searchInSpec([1, 0], 5, 'github')).toEqual([]);
    expect(store.searchInSpec([1, 0], 5, 'notion')).toHaveLength(1);
  });
});
