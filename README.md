# oak-longevity-mcp-server

> An [MCP](https://modelcontextprotocol.io) server for **longevity & metabolic medicine** — a medication catalog, evidence-based dosing protocols, contraindication screening, drug-interaction checks, required baseline labs, ongoing monitoring plans, FDA/compounding regulatory status, and patient-intake pathway suggestions across **35 compounds**.

Built for [Oak Longevity Institute](https://www.oaklongevity.com) by Keith Schmidt, MD — a telemedicine longevity practice in Illinois. This server makes the practice's clinical reference data available to any MCP client (Claude Desktop, Claude Code, or your own agent), and is structured for a free/premium monetization model.

> ⚠️ **Clinical decision-support, not medical advice.** All output must be reviewed by a licensed clinician. **Many longevity compounds here are used off-label, are compounded, or are investigational/not FDA-approved.** Dosing, contraindication, interaction, lab, and regulatory data change frequently — always verify against current primary literature, FDA/DEA resources, and your state board of pharmacy.

---

## What it does

| Tool | Tier | Description |
|---|---|---|
| `get_medication_list` | **Free** | Full medication catalog grouped by category, with ids, drug class, and DEA/Rx schedule. |
| `get_medication_details` | **Free** | Mechanism, formulations, who it's for / not for, and schedule for one medication. |
| `get_fda_status` | **Free** | FDA approval status, DEA schedule, 503A/503B compounding considerations, approved uses, off-label notes. |
| `get_dosing_protocol` | Premium | Evidence-based dosing: route, start, titration, maintenance, max, evidence grade, pearls — by indication. |
| `get_required_labs` | Premium | Recommended baseline labs/assessments **before** prescribing, grouped by panel with rationale. |
| `get_monitoring_plan` | Premium | Ongoing monitoring schedule — what to check, interval, and action/threshold. |
| `check_contraindications` | Premium | Screens a medication against a patient profile (age, sex, conditions, meds) → **PASS / FLAG / REJECT** with the triggering findings. |
| `check_drug_interactions` | Premium | Pairwise interaction warnings across a medication list, ranked by severity, with mechanism + management. |
| `screen_patient_intake` | Premium | Maps a patient's symptoms/goals to suggested treatment pathways with first-line + adjunct medications and workup. |

The eight categories: **Weight Management, Peptide Therapy, Hormone Optimization, Longevity & Metabolic, Sexual Health, Immune & Inflammation, Hair Restoration, Dermatology.**

Every tool accepts a medication as a **name, id, or brand/alias** (e.g. `"Tirzepatide"`, `"tirzepatide"`, `"Mounjaro"`, or `"copper peptide"` → GHK-Cu). Unrecognized queries return "did you mean" suggestions.

### Compounds covered

Semaglutide · Tirzepatide · Liraglutide · Naltrexone/Bupropion · BPC-157 · Sermorelin · CJC-1295/Ipamorelin · Ipamorelin · Tesamorelin · Thymosin Beta-4 (TB-500) · Testosterone (cypionate & cream) · Estradiol · Progesterone · DHEA · Anastrozole · Pregnenolone · hCG · NAD+ · Metformin · Rapamycin · Berberine · Resveratrol · NMN · PT-141 · Oxytocin · Tadalafil · Sildenafil · Thymosin Alpha-1 · Glutathione · Low-Dose Naltrexone · Finasteride · Oral Minoxidil · GHK-Cu · Tretinoin.

---

## Install & build

```bash
git clone <repo> longevity-mcp-server
cd longevity-mcp-server
npm install

npm run build             # compile TypeScript → dist/ and copy data
npm run smoke             # end-to-end test (optional)
```

The clinical data ships as JSON in `src/data/` and is copied into `dist/data/` at build.

---

## Use with Claude Desktop

Add to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "oak-longevity": {
      "command": "node",
      "args": ["/absolute/path/to/longevity-mcp-server/dist/index.js"],
      "env": { "LONGEVITY_LICENSE_KEY": "OAK-XXXX-XXXX-XXXX" }
    }
  }
}
```

Restart Claude Desktop. You can then ask things like:

- *"List the peptide therapy options."*
- *"What's the dosing protocol for tirzepatide for weight loss?"*
- *"Can I prescribe tadalafil to a 60-year-old man taking nitroglycerin?"*
- *"Check interactions between rapamycin, simvastatin, and clarithromycin."*
- *"What baseline labs do I need before starting testosterone?"*
- *"A patient reports fatigue, low libido, and wants to lose weight — what pathways fit?"*

See [`examples/claude_desktop_config.json`](examples/claude_desktop_config.json) for an `npx` variant.

## Use with Claude Code

```bash
claude mcp add oak-longevity -- node /absolute/path/to/longevity-mcp-server/dist/index.js
```

## Inspect locally

```bash
npm run inspect          # opens the MCP Inspector against the stdio server
```

---

## Remote hosting (HTTP / SSE)

The same tools are served over **Streamable HTTP** for remote deployment (MCPize, a VPS, or serverless):

```bash
npm run build
PORT=3000 node dist/http.js
# → POST http://localhost:3000/mcp     (GET /health for a liveness check)
```

The HTTP transport is **stateless and multi-tenant**: the per-customer license key is read from a request header, so a single deployment can serve many customers.

```
X-Oak-License: OAK-XXXX-XXXX-XXXX        (preferred)
Authorization: Bearer OAK-XXXX-XXXX-XXXX (also accepted)
```

---

## Monetization & licensing

The server has a built-in **free / premium** split designed to be wired to a billing provider (Stripe, MCPize) with minimal change.

- **Free tier:** `get_medication_list`, `get_medication_details`, `get_fda_status` — the catalog and regulatory reference.
- **Premium tier:** the clinical decision-support engine — dosing protocols, baseline labs, monitoring plans, contraindication screening, drug-interaction checks, and intake pathway suggestions.

Premium tools remain *discoverable* (they appear in `tools/list` so clients can advertise the upgrade), but calling one without a valid entitlement returns an upgrade prompt instead of data.

### Entitlement resolution

Configured via environment variables (stdio) or request headers (HTTP):

| Variable | Purpose |
|---|---|
| `LONGEVITY_LICENSE_KEY` | The customer's license key. |
| `LONGEVITY_TIER` | Force `premium` or `free` (self-hosted / enterprise override). |
| `LONGEVITY_VALID_KEYS` | Comma-separated allowlist of keys treated as valid premium (manual provisioning / testing). |
| `LONGEVITY_LICENSE_VERIFY_URL` | Optional HTTP endpoint for **remote** key verification. When set, keys are validated against this service instead of locally. |

A locally-issued key matches the format `OAK-XXXX-XXXX-XXXX`. For production, point `LONGEVITY_LICENSE_VERIFY_URL` at your billing webhook; it should accept `{ "key": "..." }` and return `{ "valid": true, "tier": "premium", "expiresAt": "..." }`.

The verification layer lives entirely in [`src/licensing.ts`](src/licensing.ts) behind a `LicenseProvider` interface — swap the implementation without touching any tool.

---

## Project structure

```
longevity-mcp-server/
├── src/
│   ├── index.ts          # stdio entry point (Claude Desktop / Code)
│   ├── http.ts           # Streamable HTTP entry point (remote hosting)
│   ├── server.ts         # builds the MCP server + tier gating
│   ├── licensing.ts      # free/premium entitlement (pluggable)
│   ├── data.ts           # data loading + medication resolver
│   ├── types.ts          # clinical data types
│   ├── tools/            # one file per MCP tool (9 tools)
│   └── data/             # clinical data (JSON)
│       ├── categories.json
│       ├── medications.json
│       ├── dosing.json
│       ├── contraindications.json
│       ├── interactions.json
│       ├── labs.json
│       ├── fda.json
│       └── pathways.json
├── scripts/
│   ├── copy-assets.mjs   # copy JSON into dist/ at build
│   └── smoke-test.mjs    # end-to-end MCP client/server test
├── examples/
│   └── claude_desktop_config.json
├── package.json
├── tsconfig.json
├── LICENSE
└── README.md
```

## Data model

The clinical data is hand-curated from standard pharmacology references and longevity-medicine practice (Endocrine Society / Menopause Society / ISSWSH guidance, FDA labeling and shortage/bulk-substance lists, and the peer-reviewed literature for off-label and investigational compounds). Each dataset is keyed by medication id:

- **medications.json** — class, mechanism, formulations, candidate profile, schedule.
- **dosing.json** — per-indication route / start / titration / maintenance / max / evidence grade.
- **contraindications.json** — boxed warnings, absolute & relative contraindications (with machine-matchable condition keywords), cautions, pregnancy.
- **interactions.json** — per-drug interaction rules (severity, effect, management).
- **labs.json** — baseline panels and ongoing monitoring schedule.
- **fda.json** — approval status, schedule, 503A/503B compounding considerations, approved uses, references.
- **pathways.json** — 15 intake pathways mapping symptoms/goals → first-line + adjunct medications.

> Because regulatory status (especially FDA drug-shortage listings and 503A bulk-substance eligibility for peptides) shifts frequently, treat `get_fda_status` output as a starting point and confirm against the current FDA database before compounding.

---

## License

[MIT](LICENSE) © 2026 Keith Schmidt, MD — Oak Longevity Institute

The clinical reference content is provided for educational and decision-support
purposes only and does not constitute medical advice. See the disclaimer in [LICENSE](LICENSE).
