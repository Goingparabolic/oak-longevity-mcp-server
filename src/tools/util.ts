import { resolveMedication } from '../data.js';
import type { MedicationInfo } from '../types.js';
import type { ToolResult } from './types.js';

/**
 * Resolve a free-form medication query, or return a ready-made error ToolResult
 * (with suggestions) if it cannot be confidently resolved.
 */
export function resolveOrError(
  query: unknown
): { medication: MedicationInfo } | { error: ToolResult } {
  if (typeof query !== 'string' || !query.trim()) {
    return {
      error: {
        text: 'Please provide a `medication` name, id, or brand/alias.',
        isError: true,
      },
    };
  }
  const { medication, suggestions } = resolveMedication(query);
  if (medication) return { medication };

  const sugg =
    suggestions.length > 0
      ? '\n\nDid you mean:\n' + suggestions.map((s) => `  • ${s.name} (id: ${s.id})`).join('\n')
      : '\n\nUse get_medication_list to see all available medications.';
  return {
    error: {
      text: `No medication matched "${query}".${sugg}`,
      data: { query, suggestions },
      isError: true,
    },
  };
}

/** Normalize a string for keyword matching. */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Does the patient-supplied text match any of the lowercase keywords?
 * Bidirectional substring check on normalized strings so "type 1 diabetes"
 * matches a keyword "type 1 diabetes" and "prostate cancer (Gleason 7)" matches
 * "prostate cancer".
 */
export function matchesAny(haystackText: string, keywords: string[]): boolean {
  const h = norm(haystackText);
  return keywords.some((k) => {
    const nk = norm(k);
    if (!nk) return false;
    return h.includes(nk) || nk.includes(h);
  });
}

/** Coerce an unknown input into a clean array of non-empty strings. */
export function toStringList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(/[,;\n]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}
