#!/usr/bin/env node
/**
 * End-to-end smoke test. Spins up the compiled MCP server in-process, connects a
 * real MCP Client over a linked in-memory transport, and exercises tool
 * discovery, the FREE tier, premium tier-gating, and the PREMIUM tier.
 *
 * Run after building:  npm run build && npm run smoke
 */

import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../dist/server.js';
import { createLicenseProvider } from '../dist/licensing.js';

let passed = 0;
function check(name, cond) {
  assert.ok(cond, name);
  console.log(`  ✓ ${name}`);
  passed++;
}

async function connect(provider) {
  const server = createServer(provider);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'smoke', version: '0.0.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client, server };
}

function textOf(result) {
  return (result.content || []).map((c) => c.text || '').join('\n');
}

async function main() {
  console.log('Oak Longevity MCP smoke test\n');

  // ── FREE tier (no license) ──
  console.log('FREE tier:');
  const free = await connect(createLicenseProvider({ key: '' }));

  const tools = await free.client.listTools();
  check(`exposes 9 tools (got ${tools.tools.length})`, tools.tools.length === 9);
  const names = tools.tools.map((t) => t.name).sort();
  for (const expected of [
    'get_medication_list',
    'get_medication_details',
    'get_fda_status',
    'get_dosing_protocol',
    'get_required_labs',
    'get_monitoring_plan',
    'check_contraindications',
    'check_drug_interactions',
    'screen_patient_intake',
  ]) {
    check(`tool registered: ${expected}`, names.includes(expected));
  }

  const list = await free.client.callTool({ name: 'get_medication_list', arguments: {} });
  const listText = textOf(list);
  check('get_medication_list returns catalog', /Medication Catalog/.test(listText));
  check('catalog includes Peptide Therapy category', /Peptide Therapy/.test(listText));
  check('get_medication_list structuredContent total >= 30', (list.structuredContent?.total ?? 0) >= 30);

  const details = await free.client.callTool({ name: 'get_medication_details', arguments: { medication: 'semaglutide' } });
  check('get_medication_details (semaglutide) mentions GLP-1', /GLP-1/.test(textOf(details)));
  check('get_medication_details resolves brand alias "Ozempic"', /Semaglutide/.test(textOf(
    await free.client.callTool({ name: 'get_medication_details', arguments: { medication: 'Ozempic' } })
  )));
  check('get_medication_details resolves fuzzy "copper peptide"', /GHK-Cu/.test(textOf(
    await free.client.callTool({ name: 'get_medication_details', arguments: { medication: 'copper peptide' } })
  )));

  const fda = await free.client.callTool({ name: 'get_fda_status', arguments: { compound: 'rapamycin' } });
  const fdaText = textOf(fda);
  check('get_fda_status (rapamycin) shows status + off-label note', /Status:/.test(fdaText) && /off-label/i.test(fdaText));
  check('get_fda_status (bpc-157) flags compounding restriction', /Category 2|not be compounded|restricted/i.test(textOf(
    await free.client.callTool({ name: 'get_fda_status', arguments: { compound: 'bpc-157' } })
  )));

  // Premium tool on FREE tier → gated.
  const gated = await free.client.callTool({ name: 'get_dosing_protocol', arguments: { medication: 'tirzepatide' } });
  check('premium tool gated on free tier', /PREMIUM/.test(textOf(gated)) && gated.isError === true);

  // Unknown medication → helpful error.
  const unknown = await free.client.callTool({ name: 'get_medication_details', arguments: { medication: 'zzzqqq' } });
  check('unknown medication returns error', unknown.isError === true);

  await free.server.close();

  // ── PREMIUM tier (key provisioned via the allowlist) ──
  console.log('\nPREMIUM tier:');
  process.env.LONGEVITY_VALID_KEYS = 'OAK-TEST-TEST-TEST';
  const prem = await connect(createLicenseProvider({ key: 'OAK-TEST-TEST-TEST' }));

  const dosing = await prem.client.callTool({ name: 'get_dosing_protocol', arguments: { medication: 'tirzepatide', indication: 'weight management' } });
  const dosingText = textOf(dosing);
  check('dosing unlocked on premium', /Dosing Protocol/.test(dosingText));
  check('tirzepatide weight dosing includes 15 mg max', /15 mg/.test(dosingText));

  const labs = await prem.client.callTool({ name: 'get_required_labs', arguments: { medication: 'testosterone-cypionate' } });
  check('required labs include PSA and hematocrit', /PSA/.test(textOf(labs)) && /[Hh]ematocrit/.test(textOf(labs)));

  const monitor = await prem.client.callTool({ name: 'get_monitoring_plan', arguments: { medication: 'metformin' } });
  check('monitoring plan includes eGFR', /eGFR/.test(textOf(monitor)));

  // Contraindication screening.
  const reject = await prem.client.callTool({
    name: 'check_contraindications',
    arguments: { medication: 'tadalafil', age: 60, currentMedications: ['nitroglycerin'] },
  });
  const rejectText = textOf(reject);
  check('contraindication screen returns REJECT for tadalafil + nitrate', /Verdict:\s*\*\*REJECT\*\*/.test(rejectText));
  check('contraindication structuredContent verdict = REJECT', reject.structuredContent?.verdict === 'REJECT');

  const flag = await prem.client.callTool({
    name: 'check_contraindications',
    arguments: { medication: 'semaglutide', age: 45, conditions: ['history of pancreatitis'] },
  });
  check('semaglutide + pancreatitis → FLAG', textOf(flag).includes('FLAG'));

  const rejectMtc = await prem.client.callTool({
    name: 'check_contraindications',
    arguments: { medication: 'semaglutide', conditions: ['medullary thyroid carcinoma'] },
  });
  check('semaglutide + MTC → REJECT', rejectMtc.structuredContent?.verdict === 'REJECT');

  // Drug interactions.
  const ix = await prem.client.callTool({
    name: 'check_drug_interactions',
    arguments: { medications: ['tadalafil', 'nitroglycerin'] },
  });
  const ixText = textOf(ix);
  check('interaction check flags tadalafil ⇄ nitroglycerin as contraindicated', /CONTRAINDICATED/.test(ixText));
  check('interaction structuredContent has >=1 warning', (ix.structuredContent?.interactionCount ?? 0) >= 1);

  const ix2 = await prem.client.callTool({
    name: 'check_drug_interactions',
    arguments: { medications: ['semaglutide', 'insulin'] },
  });
  check('semaglutide + insulin flagged (major hypoglycemia)', /MAJOR/.test(textOf(ix2)));

  // Intake screen.
  const intake = await prem.client.callTool({
    name: 'screen_patient_intake',
    arguments: { symptoms: 'tired, low sex drive, want to lose weight' },
  });
  const intakeText = textOf(intake);
  check('intake screen suggests pathways', /Suggested pathways/.test(intakeText));
  check('intake matches a weight-loss pathway', /Weight Loss/i.test(intakeText));
  check('intake structuredContent has matches', Array.isArray(intake.structuredContent?.matches) && intake.structuredContent.matches.length > 0);

  await prem.server.close();

  console.log(`\n✅ All ${passed} checks passed.`);
}

main().catch((err) => {
  console.error('\n❌ Smoke test failed:', err);
  process.exit(1);
});
