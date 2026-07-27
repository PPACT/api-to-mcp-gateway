import { startMockServer } from './mock-server.js';
import { parseOpenApiSpec } from '../packages/core/src/parser.js';
import { convertOperation } from '../packages/core/src/converter.js';
import { ToolRegistry } from '../packages/server/src/tools.js';
import { ApiProxy } from '../packages/server/src/proxy.js';
import { createMCPServer } from '../packages/server/src/server.js';

async function runTests() {
  console.log('\n=== API-to-MCP Gateway Test Framework ===\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => Promise<void>): void {
    fn().then(() => {
      console.log('✓ PASS:', name);
      passed++;
    }).catch((err) => {
      console.log('✗ FAIL:', name);
      console.log('  Error:', err.message);
      failed++;
    });
  }

  await startMockServer(8081);

  test('1. Parse OpenAPI spec', async () => {
    const operations = await parseOpenApiSpec('./test-framework/mock-api.yaml');
    if (operations.length !== 5) {
      throw new Error('Expected 5 operations, got ' + operations.length);
    }
    console.log('   Found operations:', operations.map((op) => op.operationId).join(', '));
  });

  test('2. Convert operation to MCP tool', async () => {
    const operations = await parseOpenApiSpec('./test-framework/mock-api.yaml');
    const op = operations.find((o) => o.operationId === 'createUser');
    if (!op) throw new Error('createUser operation not found');

    const tool = convertOperation(op, 'mock');
    if (tool.name !== 'mock_create_user') {
      throw new Error('Expected tool name mock_create_user, got ' + tool.name);
    }
    if (!tool.inputSchema.properties.name) {
      throw new Error('Missing name property in inputSchema');
    }
    if (!tool.inputSchema.properties.email) {
      throw new Error('Missing email property in inputSchema');
    }
    console.log('   Tool name:', tool.name);
    console.log('   Required params:', tool.inputSchema.required?.join(', ') || 'none');
  });

  test('3. ToolRegistry register and list', async () => {
    const proxy = new ApiProxy();
    const registry = new ToolRegistry(proxy);
    const operations = await parseOpenApiSpec('./test-framework/mock-api.yaml');

    for (const op of operations) {
      registry.register(op, { name: 'mock', baseUrl: 'http://localhost:8081/api' });
    }

    const tools = registry.list();
    if (tools.length !== 5) {
      throw new Error('Expected 5 registered tools, got ' + tools.length);
    }
    console.log('   Registered tools:', tools.map((t) => t.name).join(', '));
  });

  test('4. MCP Server initialize', async () => {
    const proxy = new ApiProxy();
    const registry = new ToolRegistry(proxy);
    const server = createMCPServer({ proxy, parser: { parse: async () => [] }, registry, port: 0 });

    await server.start();

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    });

    if (response.result?.serverInfo?.name !== 'api-to-mcp-gateway') {
      throw new Error('Initialize response invalid');
    }
    console.log('   Protocol version:', response.result?.protocolVersion);

    server.stop();
  });

  test('5. MCP Server tools/list', async () => {
    const proxy = new ApiProxy();
    const registry = new ToolRegistry(proxy);
    const operations = await parseOpenApiSpec('./test-framework/mock-api.yaml');
    for (const op of operations) {
      registry.register(op, { name: 'mock', baseUrl: 'http://localhost:8081/api' });
    }

    const server = createMCPServer({ proxy, parser: { parse: async () => [] }, registry, port: 0 });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    const tools = (response.result?.tools as unknown[]) || [];
    if (tools.length !== 5) {
      throw new Error('Expected 5 tools in tools/list, got ' + tools.length);
    }
    console.log('   Listed tools:', (tools as { name: string }[]).map((t) => t.name).join(', '));

    server.stop();
  });

  test('6. MCP Server tools/call - listUsers', async () => {
    const proxy = new ApiProxy();
    const registry = new ToolRegistry(proxy);
    const operations = await parseOpenApiSpec('./test-framework/mock-api.yaml');
    for (const op of operations) {
      registry.register(op, { name: 'mock', baseUrl: 'http://localhost:8081/api' });
    }

    const server = createMCPServer({ proxy, parser: { parse: async () => [] }, registry, port: 0 });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'mock_list_users', arguments: {} },
    });

    const result = response.result as { content: { type: string; text: string }[] };
    const users = JSON.parse(result.content[0].text);
    if (!Array.isArray(users) || users.length !== 3) {
      throw new Error('Expected 3 users, got ' + JSON.stringify(users));
    }
    console.log('   Users returned:', users.map((u: { name: string }) => u.name).join(', '));

    server.stop();
  });

  test('7. MCP Server tools/call - getUserById', async () => {
    const proxy = new ApiProxy();
    const registry = new ToolRegistry(proxy);
    const operations = await parseOpenApiSpec('./test-framework/mock-api.yaml');
    for (const op of operations) {
      registry.register(op, { name: 'mock', baseUrl: 'http://localhost:8081/api' });
    }

    const server = createMCPServer({ proxy, parser: { parse: async () => [] }, registry, port: 0 });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'mock_get_user_by_id', arguments: { id: '1' } },
    });

    const result = response.result as { content: { type: string; text: string }[] };
    const user = JSON.parse(result.content[0].text);
    if (user.name !== 'Alice') {
      throw new Error('Expected user Alice, got ' + JSON.stringify(user));
    }
    console.log('   User found:', user.name);

    server.stop();
  });

  test('8. MCP Server tools/call - createUser', async () => {
    const proxy = new ApiProxy();
    const registry = new ToolRegistry(proxy);
    const operations = await parseOpenApiSpec('./test-framework/mock-api.yaml');
    for (const op of operations) {
      registry.register(op, { name: 'mock', baseUrl: 'http://localhost:8081/api' });
    }

    const server = createMCPServer({ proxy, parser: { parse: async () => [] }, registry, port: 0 });
    await server.start();

    const response = await server.handleRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'mock_create_user',
        arguments: { name: 'Test User', email: 'test@example.com' },
      },
    });

    const result = response.result as { content: { type: string; text: string }[] };
    const user = JSON.parse(result.content[0].text);
    if (user.name !== 'Test User' || user.email !== 'test@example.com') {
      throw new Error('User creation failed: ' + JSON.stringify(user));
    }
    console.log('   Created user:', user.name, '(ID:', user.id + ')');

    server.stop();
  });

  setTimeout(() => {
    console.log('\n=== Test Summary ===');
    console.log('Passed:', passed);
    console.log('Failed:', failed);
    console.log('Total:', passed + failed);
    process.exit(failed > 0 ? 1 : 0);
  }, 2000);
}

runTests();