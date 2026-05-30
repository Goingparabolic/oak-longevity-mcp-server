#!/usr/bin/env node
/**
 * Oak Longevity MCP server — stdio entry point (for Claude Desktop, Claude Code,
 * and any stdio-based MCP client).
 *
 * Run:  node dist/index.js
 * Or:   npx @oaklongevity/mcp-server
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // IMPORTANT: never write to stdout — it is the JSON-RPC channel. Logs go to stderr.
  console.error('[oak-longevity] MCP server running on stdio.');
}

main().catch((err) => {
  console.error('[oak-longevity] Fatal error:', err);
  process.exit(1);
});
