/**
 * Clinical data access layer.
 *
 * Loads the JSON datasets and exposes typed lookups plus a fuzzy medication
 * resolver so callers can pass either a medication id ("semaglutide"), a
 * display name ("Testosterone Cypionate"), a brand/alias ("Ozempic"), or a
 * loose phrase ("copper peptide").
 */

import { createRequire } from 'node:module';
import type {
  Category,
  Medication,
  DosingProtocol,
  Contraindications,
  InteractionEntry,
  LabPlan,
  FdaStatus,
  Pathway,
  MedicationInfo,
} from './types.js';

const require = createRequire(import.meta.url);

export const CATEGORIES: Category[] = require('./data/categories.json');
export const MEDICATIONS: Record<string, Medication> = require('./data/medications.json');
export const DOSING: Record<string, DosingProtocol[]> = require('./data/dosing.json');
export const CONTRAINDICATIONS: Record<string, Contraindications> = require('./data/contraindications.json');
export const INTERACTIONS: Record<string, InteractionEntry[]> = require('./data/interactions.json');
export const LABS: Record<string, LabPlan> = require('./data/labs.json');
export const FDA: Record<string, FdaStatus> = require('./data/fda.json');
export const PATHWAYS: Pathway[] = require('./data/pathways.json');

// ─── Medication index ────────────────────────────────────────────────────────

const categoryById = new Map<string, Category>();
const categoryByMed = new Map<string, Category>();
for (const cat of CATEGORIES) {
  categoryById.set(cat.id, cat);
  for (const m of cat.meds) {
    // First category that lists a med is treated as its primary category.
    if (!categoryByMed.has(m)) categoryByMed.set(m, cat);
  }
}

function buildMedicationInfo(id: string): MedicationInfo {
  const med = MEDICATIONS[id];
  const cat = categoryById.get(med.categoryId) || categoryByMed.get(id);
  return {
    id,
    name: med.name,
    aliases: med.aliases,
    categoryId: med.categoryId,
    categoryLabel: cat?.label || 'Uncategorized',
    drugClass: med.drugClass,
    schedule: med.schedule,
    icon: cat?.icon,
  };
}

export const MEDICATION_LIST: MedicationInfo[] = Object.keys(MEDICATIONS)
  .map(buildMedicationInfo)
  .sort((a, b) => a.name.localeCompare(b.name));

const medById = new Map<string, MedicationInfo>();
for (const m of MEDICATION_LIST) medById.set(m.id, m);

/** High-signal alias strings per medication for the resolver. */
const medAliases = new Map<string, string[]>();
for (const m of MEDICATION_LIST) {
  const aliases = new Set<string>();
  aliases.add(m.name);
  aliases.add(m.id);
  for (const a of m.aliases || []) aliases.add(a);
  medAliases.set(m.id, Array.from(aliases));
}

// ─── Resolver ────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(s: string): string[] {
  return norm(s).split(' ').filter(Boolean);
}

export interface ResolveResult {
  medication: MedicationInfo | null;
  suggestions: MedicationInfo[];
}

/**
 * Resolve a free-form query to a medication. Resolution order:
 *   1. Exact id match.
 *   2. Exact (normalized) name / alias match.
 *   3. Token-overlap fuzzy match against name + aliases + class.
 */
export function resolveMedication(query: string): ResolveResult {
  const q = (query || '').trim();
  if (!q) return { medication: null, suggestions: [] };

  // 1. Exact id.
  if (medById.has(q)) return { medication: medById.get(q)!, suggestions: [] };
  const lowerNoSpace = q.toLowerCase().replace(/\s+/g, '');
  if (medById.has(lowerNoSpace)) return { medication: medById.get(lowerNoSpace)!, suggestions: [] };

  const nq = norm(q);

  // 2. Exact normalized match against any alias.
  for (const m of MEDICATION_LIST) {
    const aliases = medAliases.get(m.id) || [m.name];
    if (aliases.some((a) => norm(a) === nq)) return { medication: m, suggestions: [] };
  }

  // 3. Fuzzy token overlap.
  const qTokens = tokens(q);
  const scored = MEDICATION_LIST.map((m) => {
    const aliases = medAliases.get(m.id) || [m.name];
    const idHay = tokens(`${aliases.join(' ')} ${m.drugClass}`);
    const idSet = new Set(idHay);
    let score = 0;
    for (const t of qTokens) {
      if (idSet.has(t)) score += 3;
      else if (idHay.some((h) => h.includes(t) || t.includes(h))) score += 1.5;
    }
    // Strong bonus when an alias contains (or equals) the full normalized query.
    if (aliases.some((a) => norm(a).includes(nq))) score += 4;
    return { m, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { medication: null, suggestions: [] };

  const top = scored[0];
  const suggestions = scored.slice(0, 5).map((s) => s.m);
  const second = scored[1]?.score ?? 0;
  if (top.score >= 3 && top.score > second) {
    return { medication: top.m, suggestions: suggestions.slice(1) };
  }
  return { medication: null, suggestions };
}

export function getMedicationInfo(id: string): MedicationInfo | undefined {
  return medById.get(id);
}

export function getMedication(id: string): Medication | undefined {
  return MEDICATIONS[id];
}

export function getCategory(id: string): Category | undefined {
  return categoryById.get(id);
}

export function getDosing(id: string): DosingProtocol[] {
  return DOSING[id] || [];
}

export function getContraindications(id: string): Contraindications | undefined {
  return CONTRAINDICATIONS[id];
}

export function getInteractions(id: string): InteractionEntry[] {
  return INTERACTIONS[id] || [];
}

export function getLabPlan(id: string): LabPlan | undefined {
  return LABS[id];
}

export function getFdaStatus(id: string): FdaStatus | undefined {
  return FDA[id];
}
