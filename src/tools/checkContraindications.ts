import { z } from 'zod';
import { getContraindications, getInteractions } from '../data.js';
import type { ToolDef } from './types.js';
import { resolveOrError, matchesAny, toStringList, norm } from './util.js';

type Verdict = 'PASS' | 'FLAG' | 'REJECT';

interface Finding {
  severity: 'reject' | 'flag' | 'caution';
  source: 'absolute-contraindication' | 'relative-contraindication' | 'drug-interaction' | 'pregnancy' | 'age';
  trigger: string;
  detail: string;
}

const PREGNANCY_KEYWORDS = ['pregnant', 'pregnancy', 'breastfeeding', 'lactating', 'trying to conceive', 'planning pregnancy'];

export const checkContraindications: ToolDef = {
  name: 'check_contraindications',
  title: 'Screen Patient for Contraindications',
  description:
    'Given a medication and a patient profile (age, sex, conditions, current medications), screens ' +
    'against absolute and relative contraindications and known drug interactions and returns an ' +
    'overall verdict — PASS, FLAG (proceed with caution / address first), or REJECT (do not ' +
    'prescribe) — with the specific triggering findings and clinical notes. PREMIUM tier.',
  tier: 'premium',
  inputShape: {
    medication: z.string().describe('Medication name, id, or brand/alias to screen.'),
    age: z.number().optional().describe('Patient age in years.'),
    sex: z.string().optional().describe('Patient sex (e.g. "male", "female").'),
    conditions: z
      .array(z.string())
      .optional()
      .describe('Patient conditions / history (e.g. ["prostate cancer", "hematocrit 55%"]). A comma-separated string is also accepted.'),
    currentMedications: z
      .array(z.string())
      .optional()
      .describe('Current medications (e.g. ["warfarin", "nitroglycerin"]). A comma-separated string is also accepted.'),
  },
  run(args) {
    const resolved = resolveOrError(args.medication);
    if ('error' in resolved) return resolved.error;
    const { medication } = resolved;

    const contra = getContraindications(medication.id);
    const interactions = getInteractions(medication.id);

    const age = typeof args.age === 'number' ? args.age : undefined;
    const sex = typeof args.sex === 'string' ? args.sex.toLowerCase().trim() : undefined;
    const conditions = toStringList(args.conditions);
    const currentMeds = toStringList(args.currentMedications ?? (args as Record<string, unknown>).medications);

    const findings: Finding[] = [];

    if (contra) {
      // Absolute contraindications → REJECT.
      for (const entry of contra.absolute) {
        const hit = conditions.find((c) => matchesAny(c, entry.match)) ||
          currentMeds.find((m) => matchesAny(m, entry.match));
        if (hit) {
          findings.push({
            severity: 'reject',
            source: 'absolute-contraindication',
            trigger: `${entry.condition} (patient: "${hit}")`,
            detail: entry.note || 'Absolute contraindication.',
          });
        }
      }
      // Relative contraindications → FLAG.
      for (const entry of contra.relative) {
        const hit = conditions.find((c) => matchesAny(c, entry.match)) ||
          currentMeds.find((m) => matchesAny(m, entry.match));
        if (hit) {
          findings.push({
            severity: 'flag',
            source: 'relative-contraindication',
            trigger: `${entry.condition} (patient: "${hit}")`,
            detail: entry.note || 'Relative contraindication — use caution.',
          });
        }
      }
      // Pregnancy logic.
      const pregnant = conditions.some((c) => matchesAny(c, PREGNANCY_KEYWORDS));
      if (pregnant && contra.pregnancy) {
        const pregNote = contra.pregnancy.toLowerCase();
        const isReject = pregNote.includes('contraindicat') || pregNote.includes('avoid');
        findings.push({
          severity: isReject ? 'reject' : 'flag',
          source: 'pregnancy',
          trigger: 'Pregnancy / breastfeeding',
          detail: contra.pregnancy,
        });
      }
    }

    // Drug interactions against current medications.
    for (const ix of interactions) {
      const hit = currentMeds.find((m) => matchesAny(m, ix.match));
      if (hit) {
        const sev = ix.severity.toLowerCase();
        const severity: Finding['severity'] =
          sev === 'contraindicated' ? 'reject' : sev === 'minor' ? 'caution' : 'flag';
        findings.push({
          severity,
          source: 'drug-interaction',
          trigger: `${ix.with} (patient med: "${hit}") — ${ix.severity}`,
          detail: `${ix.effect} → ${ix.management}`,
        });
      }
    }

    // Light age heuristics for a few classes (informational caution).
    if (age !== undefined) {
      if (age < 18) {
        findings.push({
          severity: 'flag',
          source: 'age',
          trigger: `Age ${age} (pediatric/adolescent)`,
          detail: 'Most longevity/optimization therapies are studied and indicated in adults — pediatric use is generally not appropriate.',
        });
      } else if (age >= 65 && /pde5|sildenafil|tadalafil/.test(norm(medication.drugClass + ' ' + medication.id))) {
        findings.push({
          severity: 'caution',
          source: 'age',
          trigger: `Age ${age}`,
          detail: 'Start at the lowest dose in older adults (PDE5 inhibitors) and review cardiovascular fitness for sexual activity.',
        });
      }
    }

    const hasReject = findings.some((f) => f.severity === 'reject');
    const hasFlag = findings.some((f) => f.severity === 'flag');
    const verdict: Verdict = hasReject ? 'REJECT' : hasFlag ? 'FLAG' : 'PASS';

    const icon = verdict === 'REJECT' ? '🛑' : verdict === 'FLAG' ? '⚠️' : '✅';

    const lines: string[] = [];
    lines.push(`# Contraindication Screen — ${medication.name}`);
    lines.push(`_id: \`${medication.id}\`_`);
    lines.push('');
    lines.push(`## ${icon} Verdict: **${verdict}**`);
    if (verdict === 'REJECT') lines.push('_Do not prescribe without resolving the absolute contraindication(s) below._');
    else if (verdict === 'FLAG') lines.push('_Proceed with caution — address the flagged item(s) and document the rationale._');
    else lines.push('_No contraindication or interaction matched the supplied profile._');
    lines.push('');

    // Echo the profile screened.
    const profileBits: string[] = [];
    if (age !== undefined) profileBits.push(`age ${age}`);
    if (sex) profileBits.push(sex);
    if (conditions.length) profileBits.push(`conditions: ${conditions.join(', ')}`);
    if (currentMeds.length) profileBits.push(`meds: ${currentMeds.join(', ')}`);
    lines.push(`**Profile screened:** ${profileBits.length ? profileBits.join(' · ') : 'none supplied'}`);
    lines.push('');

    const group = (sev: Finding['severity'], heading: string) => {
      const items = findings.filter((f) => f.severity === sev);
      if (!items.length) return;
      lines.push(`## ${heading}`);
      for (const f of items) {
        lines.push(`- **${f.trigger}** — ${f.detail}`);
      }
      lines.push('');
    };
    group('reject', '🛑 Absolute / do-not-prescribe');
    group('flag', '⚠️ Flags — address before prescribing');
    group('caution', 'ℹ️ Cautions');

    if (!findings.length && contra) {
      lines.push('No matches found. Standard cautions still apply:');
      for (const c of contra.cautions) lines.push(`- ${c}`);
      lines.push('');
    }

    if (conditions.length === 0 && currentMeds.length === 0) {
      lines.push('> ℹ️ No conditions or current medications were supplied, so the screen could only ' +
        'apply age/pregnancy logic. Provide `conditions` and `currentMedications` for a full screen.');
      lines.push('');
    }

    lines.push(
      '> ⚠️ Automated screen — NOT a substitute for clinical judgment. A licensed clinician must ' +
        'review the full history, labs, and current guidelines before prescribing.'
    );

    return {
      text: lines.join('\n'),
      data: {
        id: medication.id,
        name: medication.name,
        verdict,
        profile: { age: age ?? null, sex: sex ?? null, conditions, currentMedications: currentMeds },
        findings,
        boxedWarning: contra?.boxedWarning ?? null,
        standardCautions: contra?.cautions ?? [],
      },
    };
  },
};
