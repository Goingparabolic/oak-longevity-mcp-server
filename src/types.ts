/**
 * Type definitions for the Oak Longevity clinical data model.
 *
 * These mirror the shape of the JSON datasets in src/data/. Fields are typed
 * loosely enough to tolerate minor schema drift in the source data.
 */

export interface Category {
  id: string;
  label: string;
  icon?: string;
  meds: string[];
}

export interface Medication {
  id: string;
  name: string;
  aliases?: string[];
  categoryId: string;
  drugClass: string;
  schedule?: string;
  summary: string;
  mechanism: string;
  whoFor: string[];
  notFor: string[];
  formulations: string[];
}

export interface DosingProtocol {
  indication: string;
  route: string;
  starting: string;
  titration?: string;
  maintenance: string;
  max?: string;
  evidenceGrade?: string;
  notes?: string;
}

export interface ContraEntry {
  /** Display name of the condition. */
  condition: string;
  /** Lowercase keywords matched against patient condition/medication strings. */
  match: string[];
  /** Clinical note / action. */
  note?: string;
}

export interface Contraindications {
  boxedWarning?: string;
  absolute: ContraEntry[];
  relative: ContraEntry[];
  cautions: string[];
  pregnancy?: string;
}

export interface InteractionEntry {
  /** Display name of the interacting agent/class. */
  with: string;
  /** Lowercase keywords identifying the interacting agent/class. */
  match: string[];
  /** "contraindicated" | "major" | "moderate" | "minor". */
  severity: string;
  effect: string;
  management: string;
}

export interface LabItem {
  panel: string;
  tests: string[];
  rationale: string;
}

export interface MonitoringItem {
  interval: string;
  tests: string[];
  action: string;
}

export interface LabPlan {
  baseline: LabItem[];
  monitoring: MonitoringItem[];
}

export interface FdaStatus {
  status: string;
  schedule?: string;
  compounding?: string;
  approvedUses: string[];
  offLabelNote?: string;
  references?: string[];
}

export interface Pathway {
  id: string;
  name: string;
  match: string[];
  firstLine: string[];
  adjuncts: string[];
  avoidIf: string[];
  workup: string[];
  notes: string;
}

/** A flattened index entry describing a single medication. */
export interface MedicationInfo {
  id: string;
  name: string;
  aliases?: string[];
  categoryId: string;
  categoryLabel: string;
  drugClass: string;
  schedule?: string;
  icon?: string;
}
