/**
 * Builds the Oak Longevity MCP server: registers every tool, applies tier
 * gating, and adapts each ToolDef into an MCP tool handler. Transport-agnostic —
 * see index.ts (stdio) and http.ts (Streamable HTTP / SSE) for the wiring.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOLS } from './tools/index.js';
import type { ToolDef, ToolResult } from './tools/index.js';
import {
  getEntitlement,
  upgradeMessage,
  createLicenseProvider,
  type LicenseProvider,
} from './licensing.js';
import { recordUsage } from './meter.js';

export const SERVER_NAME = 'oak-longevity';
export const SERVER_VERSION = '0.1.0';

function toCallResult(result: ToolResult) {
  const content = [{ type: 'text' as const, text: result.text }];
  const out: {
    content: { type: 'text'; text: string }[];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  } = { content };
  if (result.data !== undefined && result.data !== null && typeof result.data === 'object') {
    out.structuredContent = result.data as Record<string, unknown>;
  }
  if (result.isError) out.isError = true;
  return out;
}

function registerTool(server: McpServer, tool: ToolDef, provider: LicenseProvider) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputShape,
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) => {
      const entitlement = await getEntitlement(provider);

      // Tier gating: premium tools require a premium entitlement.
      if (tool.tier === 'premium' && entitlement.tier !== 'premium') {
        return toCallResult({ text: upgradeMessage(tool.name), isError: true });
      }

      try {
        const result = await tool.run(args || {}, { tier: entitlement.tier });
        // Track B (pay-per-call): meter successful premium calls. Inert unless
        // metering is configured AND the caller is on the metered plan.
        if (tool.tier === 'premium' && !result.isError) {
          recordUsage({
            stripeCustomerId: entitlement.stripeCustomerId,
            metered: entitlement.metered,
            server: SERVER_NAME,
            tool: tool.name,
            tier: entitlement.tier,
          });
        }
        return toCallResult(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return toCallResult({
          text: `Internal error in ${tool.name}: ${msg}`,
          isError: true,
        });
      }
    }
  );
}

export function createServer(provider: LicenseProvider = createLicenseProvider()): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'Oak Longevity provides longevity & metabolic medicine reference data: a medication catalog ' +
        '(GLP-1s, peptides, hormones, NAD+/rapamycin/metformin, sexual health, hair & skin), ' +
        'evidence-based dosing protocols, contraindication screening, drug-interaction checks, ' +
        'required baseline labs, ongoing monitoring plans, FDA/compounding regulatory status, and ' +
        'patient-intake pathway suggestions. Start with get_medication_list to discover medication ' +
        'ids, then call a specific tool. Tools accept a medication name, id, or brand/alias. ' +
        'This is clinical decision-support, not medical advice — a licensed clinician must review all ' +
        'output, and many longevity compounds are used off-label or are investigational.',
    }
  );

  for (const tool of TOOLS) registerTool(server, tool, provider);
  return server;
}
