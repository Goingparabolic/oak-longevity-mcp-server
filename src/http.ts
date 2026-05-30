#!/usr/bin/env node
/**
 * Oak Longevity MCP server — Streamable HTTP entry point (for remote hosting,
 * e.g. MCPize, a VPS, or a serverless function).
 *
 * Runs in STATELESS mode: a fresh server + transport is created per request, so
 * the deployment is horizontally scalable and multi-tenant. The per-request
 * license key is read from a header, enabling per-customer entitlement without
 * any shared global state.
 *
 * Headers:
 *   X-Oak-License: <key>             preferred
 *   Authorization: Bearer <key>      also accepted
 *
 * Env:
 *   PORT       (default 3000)
 *
 * Run:  node dist/http.js
 */

import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { createLicenseProvider } from './licensing.js';

const PORT = Number(process.env.PORT || 3000);
const MCP_PATH = '/mcp';

function extractKey(req: IncomingMessage): string | undefined {
  const headerKey = req.headers['x-oak-license'];
  if (typeof headerKey === 'string' && headerKey.trim()) return headerKey.trim();
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && /^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, '').trim();
  }
  return undefined;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Stateless: new instances per request, disposed when the response closes.
  const provider = createLicenseProvider({ key: extractKey(req) });
  const server = createServer(provider);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  const body = await readBody(req);
  await transport.handleRequest(req, res, body);
}

const httpServer = createHttpServer((req, res) => {
  const url = req.url || '';

  if (req.method === 'GET' && (url === '/health' || url === '/')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'oak-longevity', transport: 'streamable-http' }));
    return;
  }

  if (url.startsWith(MCP_PATH)) {
    handleMcp(req, res).catch((err) => {
      console.error('[oak-longevity-http] error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          })
        );
      }
    });
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', hint: `POST ${MCP_PATH}` }));
});

httpServer.listen(PORT, () => {
  console.error(`[oak-longevity-http] Streamable HTTP MCP server listening on :${PORT}${MCP_PATH}`);
});
