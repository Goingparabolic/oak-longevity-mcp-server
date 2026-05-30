import { z } from 'zod';
import { getLabPlan } from '../data.js';
import type { ToolDef } from './types.js';
import { resolveOrError } from './util.js';

export const getMonitoringPlan: ToolDef = {
  name: 'get_monitoring_plan',
  title: 'Get Ongoing Monitoring Plan',
  description:
    'Given a medication, returns the ongoing monitoring requirements once therapy has started — ' +
    'what to check, at what interval, and the action/threshold for each. Use to build a follow-up ' +
    'schedule. PREMIUM tier.',
  tier: 'premium',
  inputShape: {
    medication: z.string().describe('Medication name, id, or brand/alias.'),
  },
  run(args) {
    const resolved = resolveOrError(args.medication);
    if ('error' in resolved) return resolved.error;
    const { medication } = resolved;

    const plan = getLabPlan(medication.id);
    const lines: string[] = [];
    lines.push(`# Ongoing Monitoring Plan — ${medication.name}`);
    lines.push(`_id: \`${medication.id}\`_`);
    lines.push('');

    if (!plan || !plan.monitoring.length) {
      lines.push('No specific monitoring schedule is mapped. Apply class-appropriate follow-up and ' +
        'periodic reassessment of efficacy and safety.');
      return { text: lines.join('\n'), data: { id: medication.id, name: medication.name, monitoring: [] } };
    }

    lines.push('| Interval | Monitor | Action / Threshold |');
    lines.push('|---|---|---|');
    for (const m of plan.monitoring) {
      lines.push(`| ${m.interval} | ${m.tests.join(', ')} | ${m.action} |`);
    }
    lines.push('');
    lines.push(
      '> ⚠️ Decision-support only. Adjust frequency to the patient, dose changes, and emerging ' +
        'findings. For pre-treatment labs, use get_required_labs.'
    );

    return {
      text: lines.join('\n'),
      data: {
        id: medication.id,
        name: medication.name,
        monitoring: plan.monitoring,
      },
    };
  },
};
