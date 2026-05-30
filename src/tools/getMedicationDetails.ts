import { z } from 'zod';
import { getMedication } from '../data.js';
import type { ToolDef } from './types.js';
import { resolveOrError } from './util.js';

export const getMedicationDetails: ToolDef = {
  name: 'get_medication_details',
  title: 'Get Medication Details',
  description:
    'Given a medication name, id, or brand/alias (e.g. "tirzepatide", "Ozempic", "copper peptide"), ' +
    'returns its drug class, mechanism of action, available formulations, who it is for (candidate ' +
    'profile), who it is NOT for (at-a-glance cautions), and DEA/Rx schedule. FREE tier.',
  tier: 'free',
  inputShape: {
    medication: z.string().describe('Medication name, id, or brand/alias.'),
  },
  run(args) {
    const resolved = resolveOrError(args.medication);
    if ('error' in resolved) return resolved.error;
    const { medication } = resolved;
    const med = getMedication(medication.id)!;

    const lines: string[] = [];
    lines.push(`# ${med.name}`);
    lines.push(`_id: \`${med.id}\` · ${medication.categoryLabel} · ${med.drugClass}_`);
    if (med.schedule) lines.push(`_Schedule: ${med.schedule}_`);
    lines.push('');
    lines.push(med.summary);
    lines.push('');
    lines.push('## Mechanism of action');
    lines.push(med.mechanism);
    lines.push('');
    lines.push('## Formulations');
    for (const f of med.formulations) lines.push(`- ${f}`);
    lines.push('');
    lines.push('## Who it is for');
    for (const w of med.whoFor) lines.push(`- ${w}`);
    lines.push('');
    lines.push('## Who it is NOT for (at a glance)');
    for (const n of med.notFor) lines.push(`- ${n}`);
    lines.push('');
    lines.push(
      '> For a full screen against a specific patient, use check_contraindications. For dosing, use ' +
        'get_dosing_protocol. For regulatory status, use get_fda_status.'
    );

    return {
      text: lines.join('\n'),
      data: {
        id: med.id,
        name: med.name,
        aliases: med.aliases ?? [],
        categoryId: med.categoryId,
        categoryLabel: medication.categoryLabel,
        drugClass: med.drugClass,
        schedule: med.schedule ?? null,
        summary: med.summary,
        mechanism: med.mechanism,
        formulations: med.formulations,
        whoFor: med.whoFor,
        notFor: med.notFor,
      },
    };
  },
};
