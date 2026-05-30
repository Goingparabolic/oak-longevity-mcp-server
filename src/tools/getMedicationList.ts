import { z } from 'zod';
import { CATEGORIES, MEDICATION_LIST } from '../data.js';
import type { ToolDef } from './types.js';

export const getMedicationList: ToolDef = {
  name: 'get_medication_list',
  title: 'List Longevity Medications',
  description:
    'Returns the full catalog of longevity & metabolic medications, grouped by category ' +
    '(Weight Management, Peptide Therapy, Hormone Optimization, Longevity & Metabolic, Sexual Health, ' +
    'Immune & Inflammation, Hair Restoration, Dermatology). Each entry includes the medication id ' +
    '(used by other tools), display name, drug class, and DEA/Rx schedule. Optionally filter by a ' +
    'category id or name. FREE tier.',
  tier: 'free',
  inputShape: {
    category: z
      .string()
      .optional()
      .describe('Optional category filter (id like "peptide-therapy" or label like "Hormone Optimization").'),
  },
  run(args) {
    const filter = typeof args.category === 'string' ? args.category.toLowerCase().trim() : '';

    const cats = CATEGORIES.filter((c) => {
      if (!filter) return true;
      return c.id.toLowerCase() === filter || c.label.toLowerCase().includes(filter);
    });

    const byId = new Map(MEDICATION_LIST.map((m) => [m.id, m]));

    const groups = cats.map((c) => ({
      categoryId: c.id,
      categoryLabel: c.label,
      icon: c.icon,
      medications: c.meds
        .map((mid) => byId.get(mid))
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
        .map((m) => ({ id: m.id, name: m.name, drugClass: m.drugClass, schedule: m.schedule })),
    }));

    const uniqueIds = new Set<string>();
    for (const g of groups) for (const m of g.medications) uniqueIds.add(m.id);

    const lines: string[] = [];
    lines.push(`# Oak Longevity Medication Catalog`);
    lines.push(
      `${uniqueIds.size} medications across ${groups.length} categor${groups.length === 1 ? 'y' : 'ies'}.`
    );
    lines.push('');
    for (const g of groups) {
      lines.push(`## ${g.icon ? g.icon + ' ' : ''}${g.categoryLabel}  _(${g.categoryId})_`);
      for (const m of g.medications) {
        const sched = m.schedule ? ` — _${m.schedule}_` : '';
        lines.push(`- **${m.name}** _(id: \`${m.id}\`)_ — ${m.drugClass}${sched}`);
      }
      lines.push('');
    }
    lines.push(
      '> ⚠️ Decision-support reference only. Many longevity compounds are used off-label or are ' +
        'investigational/compounded — verify current regulatory status with get_fda_status.'
    );

    return {
      text: lines.join('\n').trim(),
      data: { total: uniqueIds.size, categories: groups },
    };
  },
};
