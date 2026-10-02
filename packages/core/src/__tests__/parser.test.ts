import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOpenApiSpec } from '../parser.js';

// Resolve the fixture against this file, not the process cwd — otherwise the test
// only passes when vitest happens to be launched from `packages/core`.
const SPEC_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../specs/petstore.yaml');

describe('parseOpenApiSpec', () => {
  it('parses a valid OpenAPI 3.0 spec and extracts operations', async () => {
    const operations = await parseOpenApiSpec(SPEC_PATH);

    expect(operations).toHaveLength(3);

    const addPet = operations.find((op) => op.operationId === 'addPet');
    expect(addPet).toBeDefined();
    expect(addPet!.method).toBe('POST');
    expect(addPet!.path).toBe('/pet');
    expect(addPet!.summary).toBe('Add a new pet to the store');
    expect(addPet!.parameters).toHaveLength(1);
    expect(addPet!.parameters[0]!.in).toBe('header');
    expect(addPet!.requestBody).toBeDefined();

    const getPetById = operations.find((op) => op.operationId === 'getPetById');
    expect(getPetById).toBeDefined();
    expect(getPetById!.method).toBe('GET');
    expect(getPetById!.path).toBe('/pet/{petId}');
    expect(getPetById!.parameters[0]!.name).toBe('petId');
    expect(getPetById!.parameters[0]!.required).toBe(true);
  });

  it('rejects non-OpenAPI files', async () => {
    await expect(parseOpenApiSpec('/nonexistent/path')).rejects.toThrow();
  });
});
