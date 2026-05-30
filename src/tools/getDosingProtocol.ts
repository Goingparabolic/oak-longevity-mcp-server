import { z } from 'zod';
import { getDosing } from '../data.js';
import type { DosingProtocol } from '../types.js';
import type { ToolDef } from './types.js';
import { resolveOrError, norm } from './util.js';

function renderProtocol(p: DosingProtocol, lines: string[]): void {
  lines.push(`### ${p.indication}`);
  lines.push(`- **Route:** ${p.route}`);
  lines.push(`- **Starting dose:** ${p.starting}`);
  if (p.titration) lines.push(`- **Titration:** ${p.titration}`);
  lines.push(`- **Maintenance:** ${p.maintenance}`);
  if (p.max) lines.push(`- **Maximum:** ${p.max}`);
  if (p.evidenceGrade) lines.push(`- **Evidence:** ${p.evidenceGrade}`);
  if (p.notes) lines.push(`- **Notes:** ${p.notes}`);
  lines.push('');
}

export const getDosingProtocol: ToolDef = {
  name: 'get_dosing_protocol',
  title: 'Get Evidence-Based Dosing Protocol',
  description:
    'Given a medication (and optionally an indication), returns evidence-based dosing: route, ' +
    'starting dose, titration schedule, maintenance range, maximum, evidence grade, and clinical ' +
    'pearls. When an indication is supplied, returns the best-matching protocol; otherwise returns ' +
    'all indications for the medication. PREMIUM tier.',
  tier: 'premium',
  inputShape: {
    medication: z.string().describe('Medication name, id, or brand/alias.'),
    indication: z
      .string()
      .optional()
      .describe('Optional indication to narrow the protocol (e.g. "weight management", "TRT", "longevity").'),
  },
  run(args) {
    const resolved = resolveOrError(args.medication);
    if ('error' in resolved) return resolved.error;
    const { medication } = resolved;

    const protocols = getDosing(medication.id);
    const lines: string[] = [];
    lines.push(`# Dosing Protocol — ${medication.name}`);
    lines.push(`_id: \`${medication.id}\`_`);
    lines.push('');

    if (!protocols.length) {
      lines.push('No structured dosing protocol is mapped for this medication. Consult primary ' +
        'literature and the prescribing information.');
      return { text: lines.join('\n'), data: { id: medication.id, name: medication.name, protocols: [] } };
    }

    const indQuery = typeof args.indication === 'string' ? norm(args.indication) : '';
    let selected = protocols;
    if (indQuery) {
      const matched = protocols.filter((p) => {
        const ind = norm(p.indication);
        return ind.includes(indQuery) || indQuery.includes(ind) ||
          indQuery.split(' ').some((t) => t.length > 2 && ind.includes(t));
      });
      if (matched.length) {
        selected = matched;
      } else {
        lines.push(`_No exact match for indication "${args.indication}" — showing all indications._`);
        lines.push('');
      }
    }

    for (const p of selected) renderProtocol(p, lines);

    lines.push(
      '> ⚠️ Dosing is decision-support, not a prescription. Individualize to the patient, verify ' +
        'against current literature/labeling, and account for renal/hepatic function and interactions. ' +
        'Many ranges reflect off-label or compounded use.'
    );

    return {
      text: lines.join('\n'),
      data: {
        id: medication.id,
        name: medication.name,
        requestedIndication: typeof args.indication === 'string' ? args.indication : null,
        protocols: selected,
      },
    };
  },
};
