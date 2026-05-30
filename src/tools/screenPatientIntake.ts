import { z } from 'zod';
import { PATHWAYS, getMedicationInfo } from '../data.js';
import type { Pathway } from '../types.js';
import type { ToolDef } from './types.js';
import { norm, toStringList } from './util.js';

interface ScoredPathway {
  pathway: Pathway;
  score: number;
  hits: string[];
}

function medName(id: string): string {
  return getMedicationInfo(id)?.name || id;
}

export const screenPatientIntake: ToolDef = {
  name: 'screen_patient_intake',
  title: 'Screen Patient Intake → Suggested Pathways',
  description:
    'Given a patient’s symptoms and/or goals (free text or a list — e.g. "fatigue, low libido, want ' +
    'to lose weight"), suggests the most relevant longevity treatment pathways, each with first-line ' +
    'and adjunct medications, a suggested workup, and key things to avoid. Use to triage an intake. ' +
    'PREMIUM tier.',
  tier: 'premium',
  inputShape: {
    symptoms: z
      .string()
      .optional()
      .describe('Patient symptoms and/or goals as free text (e.g. "tired, low sex drive, brain fog").'),
    goals: z
      .array(z.string())
      .optional()
      .describe('Optional explicit list of goals/symptoms. Combined with `symptoms` if both given.'),
  },
  run(args) {
    const parts: string[] = [];
    if (typeof args.symptoms === 'string' && args.symptoms.trim()) parts.push(args.symptoms);
    parts.push(...toStringList(args.goals));
    const query = norm(parts.join(' '));

    if (!query) {
      return {
        text: 'Please provide `symptoms` (free text) and/or `goals` (a list) describing the patient.',
        isError: true,
      };
    }

    const qTokens = new Set(query.split(' ').filter((t) => t.length > 2));

    const scored: ScoredPathway[] = PATHWAYS.map((p) => {
      let score = 0;
      const hits: string[] = [];
      for (const kw of p.match) {
        const nkw = norm(kw);
        if (!nkw) continue;
        if (query.includes(nkw)) {
          // Phrase match weighted by length.
          score += nkw.includes(' ') ? 4 : 2.5;
          hits.push(kw);
        } else {
          // Token overlap fallback.
          const kwTokens = nkw.split(' ').filter((t) => t.length > 2);
          const overlap = kwTokens.filter((t) => qTokens.has(t));
          if (overlap.length) {
            score += overlap.length;
            hits.push(kw);
          }
        }
      }
      return { pathway: p, score, hits: Array.from(new Set(hits)) };
    })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const lines: string[] = [];
    lines.push(`# Patient Intake Screen`);
    lines.push(`**Reported:** ${parts.join(' · ')}`);
    lines.push('');

    if (!scored.length) {
      lines.push('No pathway matched the reported symptoms/goals. Try more specific terms (e.g. ' +
        '"weight loss", "low testosterone", "menopause", "hair loss", "longevity").');
      return { text: lines.join('\n'), data: { reported: parts, matches: [] } };
    }

    const top = scored.slice(0, 4);
    lines.push(`## Suggested pathways (${top.length})`);
    lines.push('');

    for (const s of top) {
      const p = s.pathway;
      lines.push(`### ${p.name}  _(matched: ${s.hits.join(', ')})_`);
      lines.push(`- **First-line:** ${p.firstLine.map(medName).join(', ')}`);
      if (p.adjuncts.length) lines.push(`- **Adjuncts:** ${p.adjuncts.map(medName).join(', ')}`);
      if (p.workup.length) lines.push(`- **Suggested workup:** ${p.workup.join('; ')}`);
      if (p.avoidIf.length) lines.push(`- **Avoid / caution if:** ${p.avoidIf.join('; ')}`);
      lines.push(`- **Notes:** ${p.notes}`);
      lines.push('');
    }

    lines.push(
      '> ⚠️ Triage decision-support only — a suggestion engine, not a diagnosis or prescription. ' +
        'Confirm with history, exam, and labs, then screen any candidate drug with ' +
        'check_contraindications and check_drug_interactions before prescribing.'
    );

    return {
      text: lines.join('\n'),
      data: {
        reported: parts,
        matches: top.map((s) => ({
          pathwayId: s.pathway.id,
          name: s.pathway.name,
          score: s.score,
          matched: s.hits,
          firstLine: s.pathway.firstLine.map((id) => ({ id, name: medName(id) })),
          adjuncts: s.pathway.adjuncts.map((id) => ({ id, name: medName(id) })),
          workup: s.pathway.workup,
          avoidIf: s.pathway.avoidIf,
          notes: s.pathway.notes,
        })),
      },
    };
  },
};
