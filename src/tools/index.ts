import type { ToolDef } from './types.js';
import { getMedicationList } from './getMedicationList.js';
import { getMedicationDetails } from './getMedicationDetails.js';
import { getFdaStatus } from './getFdaStatus.js';
import { getDosingProtocol } from './getDosingProtocol.js';
import { getRequiredLabs } from './getRequiredLabs.js';
import { getMonitoringPlan } from './getMonitoringPlan.js';
import { checkContraindications } from './checkContraindications.js';
import { checkDrugInteractions } from './checkDrugInteractions.js';
import { screenPatientIntake } from './screenPatientIntake.js';

export const TOOLS: ToolDef[] = [
  // FREE tier
  getMedicationList,
  getMedicationDetails,
  getFdaStatus,
  // PREMIUM tier
  getDosingProtocol,
  getRequiredLabs,
  getMonitoringPlan,
  checkContraindications,
  checkDrugInteractions,
  screenPatientIntake,
];

export type { ToolDef, ToolContext, ToolResult } from './types.js';
