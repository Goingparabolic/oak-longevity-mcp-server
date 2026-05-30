import { z } from 'zod';
import { getFdaStatus as getFdaData } from '../data.js';
import type { ToolDef } from './types.js';
import { resolveOrError } from './util.js';

export const getFdaStatus: ToolDef = {
  name: 'get_fda_status',
  title: 'Get FDA / Compounding Regulatory Status',
  description:
    'Given a compound (name, id, or brand/alias), returns its current FDA approval status, DEA/Rx ' +
    'schedule, compounding pathway (503A/503B, shortage-list and bulk-substance considerations), ' +
    'FDA-approved uses, an off-label note, and reference pointers. Essential for compliant ' +
    'compounded-medication practice. FREE tier.',
  tier: 'free',
  inputShape: {
    compound: z.string().describe('Compound/medication name, id, or brand/alias.'),
  },
  run(args) {
    const resolved = resolveOrError(args.compound ?? args.medication);
    if ('error' in resolved) return resolved.error;
    const { medication } = resolved;
    const fda = getFdaData(medication.id);

    const lines: string[] = [];
    lines.push(`# FDA / Regulatory Status — ${medication.name}`);
    lines.push(`_id: \`${medication.id}\`_`);
    lines.push('');

    if (!fda) {
      lines.push('No regulatory record is mapped for this compound. Verify current FDA approval and ' +
        'compounding status before prescribing.');
      return { text: lines.join('\n'), data: { id: medication.id, name: medication.name, fda: null } };
    }

    lines.push(`**Status:** ${fda.status}`);
    if (fda.schedule) lines.push(`**Schedule:** ${fda.schedule}`);
    lines.push('');
    if (fda.compounding) {
      lines.push('## Compounding');
      lines.push(fda.compounding);
      lines.push('');
    }
    lines.push('## FDA-approved uses');
    for (const u of fda.approvedUses) lines.push(`- ${u}`);
    lines.push('');
    if (fda.offLabelNote) {
      lines.push(`**Off-label note:** ${fda.offLabelNote}`);
      lines.push('');
    }
    if (fda.references && fda.references.length) {
      lines.push('## References');
      for (const r of fda.references) lines.push(`- ${r}`);
      lines.push('');
    }
    lines.push(
      '> ⚠️ Regulatory status — especially FDA drug-shortage listings and 503A bulk-substance ' +
        'eligibility — changes frequently. Always confirm against the current FDA database and your ' +
        'state board of pharmacy before compounding or prescribing.'
    );

    return {
      text: lines.join('\n'),
      data: {
        id: medication.id,
        name: medication.name,
        status: fda.status,
        schedule: fda.schedule ?? null,
        compounding: fda.compounding ?? null,
        approvedUses: fda.approvedUses,
        offLabelNote: fda.offLabelNote ?? null,
        references: fda.references ?? [],
      },
    };
  },
};
