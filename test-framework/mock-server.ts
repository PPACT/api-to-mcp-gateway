import { createServer } from 'node:http';

interface User {
  id: string;
  name: string;
  email: string;
}

const users: User[] = [
  { id: '1', name: 'Alice', email: 'alice@example.com' },
  { id: '2', name: 'Bob', email: 'bob@example.com' },
  { id: '3', name: 'Charlie', email: 'charlie@example.com' },
];

let nextId = 4;

function handleRequest(req: { method: string; url: string }, body: string): { statusCode: number; body: string } {
  const { method, url } = req;
  const parsedUrl = new URL(url, 'http://localhost');
  const pathname = parsedUrl.pathname;

  if (pathname === '/api/users' && method === 'GET') {
    const page = parseInt(parsedUrl.searchParams.get('page') || '1');
    const limit = parseInt(parsedUrl.searchParams.get('limit') || '10');
    const start = (page - 1) * limit;
    const end = start + limit;
    return { statusCode: 200, body: JSON.stringify(users.slice(start, end), null, 2) };
  }

  if (pathname === '/api/users' && method === 'POST') {
    try {
      const data = JSON.parse(body);
      const newUser: User = {
        id: String(nextId++),
        name: data.name,
        email: data.email,
      };
      users.push(newUser);
      return { statusCode: 201, body: JSON.stringify(newUser, null, 2) };
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }, null, 2) };
    }
  }

  const match = pathname.match(/\/api\/users\/(\d+)/);
  if (match) {
    const id = match[1];
    const user = users.find((u) => u.id === id);

    if (method === 'GET') {
      if (user) {
        return { statusCode: 200, body: JSON.stringify(user, null, 2) };
      }
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }, null, 2) };
    }

    if (method === 'PUT') {
      if (user) {
        try {
          const data = JSON.parse(body);
          user.name = data.name || user.name;
          user.email = data.email || user.email;
          return { statusCode: 200, body: JSON.stringify(user, null, 2) };
        } catch {
          return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }, null, 2) };
        }
      }
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }, null, 2) };
    }

    if (method === 'DELETE') {
      if (user) {
        const index = users.indexOf(user);
        users.splice(index, 1);
        return { statusCode: 204, body: '' };
      }
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }, null, 2) };
    }
  }

  return { statusCode: 404, body: JSON.stringify({ error: 'Not found' }, null, 2) };
}

export function startMockServer(port: number): Promise<void> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', () => {
        const result = handleRequest(req, body);
        res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
        res.end(result.body);
      });
    });

    server.listen(port, () => {
      console.log('Mock API server running at http://localhost:' + port + '/api');
      resolve();
    });
  });
}