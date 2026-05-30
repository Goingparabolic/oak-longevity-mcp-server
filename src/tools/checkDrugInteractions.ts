import { z } from 'zod';
import { resolveMedication, getInteractions } from '../data.js';
import type { ToolDef } from './types.js';
import { matchesAny, toStringList } from './util.js';

const SEVERITY_RANK: Record<string, number> = { contraindicated: 0, major: 1, moderate: 2, minor: 3 };
const SEVERITY_ICON: Record<string, string> = {
  contraindicated: '🛑',
  major: '🔴',
  moderate: '🟠',
  minor: '🟡',
};

interface ResolvedItem {
  raw: string;
  id: string | null;
  name: string;
  /** Strings used to test whether another drug's interaction keywords hit this item. */
  searchable: string;
}

interface Warning {
  a: string;
  b: string;
  severity: string;
  effect: string;
  management: string;
}

export const checkDrugInteractions: ToolDef = {
  name: 'check_drug_interactions',
  title: 'Check Drug Interactions',
  description:
    'Given a list of medications (catalog drugs and/or outside agents like "warfarin", "nitrates", ' +
    '"insulin"), returns pairwise interaction warnings ranked by severity (contraindicated > major > ' +
    'moderate > minor), each with the mechanism/effect and management. PREMIUM tier.',
  tier: 'premium',
  inputShape: {
    medications: z
      .array(z.string())
      .describe('List of medications to check against each other. A comma-separated string is also accepted.'),
  },
  run(args) {
    const raws = toStringList(args.medications);
    if (raws.length < 2) {
      return {
        text: 'Provide at least two medications to check for interactions (e.g. ["tadalafil", "nitroglycerin"]).',
        isError: true,
      };
    }

    const items: ResolvedItem[] = raws.map((raw) => {
      const { medication } = resolveMedication(raw);
      if (medication) {
        const searchable = [medication.name, medication.id, medication.drugClass, ...(medication.aliases || [])].join(' ');
        return { raw, id: medication.id, name: medication.name, searchable: `${raw} ${searchable}` };
      }
      return { raw, id: null, name: raw, searchable: raw };
    });

    const warnings: Warning[] = [];
    const seen = new Set<string>();

    // For each catalog medication in the list, test its interaction rules against every OTHER item.
    for (let i = 0; i < items.length; i++) {
      const source = items[i];
      if (!source.id) continue;
      const rules = getInteractions(source.id);
      if (!rules.length) continue;
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const target = items[j];
        for (const rule of rules) {
          if (matchesAny(target.searchable, rule.match)) {
            // Dedupe by unordered pair + effect.
            const pairKey = [source.name, target.name].sort().join('::') + '::' + rule.severity + '::' + rule.effect;
            if (seen.has(pairKey)) continue;
            seen.add(pairKey);
            warnings.push({
              a: source.name,
              b: target.name,
              severity: rule.severity.toLowerCase(),
              effect: rule.effect,
              management: rule.management,
            });
          }
        }
      }
    }

    warnings.sort((x, y) => (SEVERITY_RANK[x.severity] ?? 9) - (SEVERITY_RANK[y.severity] ?? 9));

    const lines: string[] = [];
    lines.push(`# Drug Interaction Check`);
    lines.push(`**Medications screened:** ${items.map((it) => it.name + (it.id ? '' : ' _(not in catalog)_')).join(', ')}`);
    lines.push('');

    const unresolved = items.filter((it) => !it.id);
    if (unresolved.length) {
      lines.push(
        `_Note: ${unresolved.map((u) => `"${u.raw}"`).join(', ')} ${unresolved.length === 1 ? 'is' : 'are'} not in the ` +
          'Oak Longevity catalog. They were still checked AS interacting agents against catalog drugs, but ' +
          'their own full interaction profile is not known here._'
      );
      lines.push('');
    }

    if (!warnings.length) {
      lines.push('## ✅ No interactions found');
      lines.push('No known interactions matched among the supplied medications. This is not a guarantee ' +
        'of safety — verify against a comprehensive interaction database.');
    } else {
      const counts = warnings.reduce<Record<string, number>>((acc, w) => {
        acc[w.severity] = (acc[w.severity] || 0) + 1;
        return acc;
      }, {});
      const summary = Object.keys(SEVERITY_RANK)
        .filter((s) => counts[s])
        .map((s) => `${counts[s]} ${s}`)
        .join(', ');
      lines.push(`## Found ${warnings.length} interaction${warnings.length === 1 ? '' : 's'} (${summary})`);
      lines.push('');
      for (const w of warnings) {
        const icon = SEVERITY_ICON[w.severity] || '•';
        lines.push(`### ${icon} ${w.a} ⇄ ${w.b} — ${w.severity.toUpperCase()}`);
        lines.push(`- **Effect:** ${w.effect}`);
        lines.push(`- **Management:** ${w.management}`);
        lines.push('');
      }
    }

    lines.push(
      '> ⚠️ Decision-support only and limited to mapped interactions. Always confirm with a full ' +
        'interaction checker and the patient’s complete medication/supplement list.'
    );

    return {
      text: lines.join('\n'),
      data: {
        screened: items.map((it) => ({ raw: it.raw, id: it.id, name: it.name })),
        unresolved: unresolved.map((u) => u.raw),
        interactionCount: warnings.length,
        warnings,
      },
    };
  },
};
