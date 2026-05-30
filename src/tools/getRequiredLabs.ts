import { z } from 'zod';
import { getLabPlan } from '../data.js';
import type { ToolDef } from './types.js';
import { resolveOrError } from './util.js';

export const getRequiredLabs: ToolDef = {
  name: 'get_required_labs',
  title: 'Get Required Baseline Labs',
  description:
    'Given a medication, returns the recommended baseline labs/assessments to obtain BEFORE ' +
    'prescribing — grouped into panels with the clinical rationale for each. Use to build a ' +
    'pre-treatment workup. PREMIUM tier.',
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
    lines.push(`# Required Baseline Labs — ${medication.name}`);
    lines.push(`_id: \`${medication.id}\`_`);
    lines.push('');

    if (!plan || !plan.baseline.length) {
      lines.push('No specific baseline lab panel is mapped. Apply general pre-treatment screening ' +
        'appropriate to the drug class and the patient.');
      return { text: lines.join('\n'), data: { id: medication.id, name: medication.name, baseline: [] } };
    }

    const allTests: string[] = [];
    for (const item of plan.baseline) {
      lines.push(`## ${item.panel}`);
      for (const t of item.tests) {
        lines.push(`- ${t}`);
        allTests.push(t);
      }
      lines.push(`  _Rationale: ${item.rationale}_`);
      lines.push('');
    }

    lines.push(
      '> ⚠️ Decision-support only. Tailor the workup to the individual patient, comorbidities, and ' +
        'guidelines. For ongoing labs after starting, use get_monitoring_plan.'
    );

    return {
      text: lines.join('\n'),
      data: {
        id: medication.id,
        name: medication.name,
        baseline: plan.baseline,
        allTests,
      },
    };
  },
};
