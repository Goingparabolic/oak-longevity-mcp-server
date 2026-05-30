import type { z } from 'zod';
import type { Tier } from '../licensing.js';

export interface ToolContext {
  /** The caller's resolved entitlement tier. */
  tier: Tier;
}

export interface ToolResult {
  /** Human-readable text rendering (Markdown) for the MCP text content block. */
  text: string;
  /** Machine-readable payload returned as MCP structuredContent. */
  data?: unknown;
  /** Marks the result as an error (e.g. unknown medication). */
  isError?: boolean;
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  tier: Tier;
  /** Zod raw shape describing the tool's input parameters. */
  inputShape: z.ZodRawShape;
  run(args: Record<string, unknown>, ctx: ToolContext): ToolResult | Promise<ToolResult>;
}
