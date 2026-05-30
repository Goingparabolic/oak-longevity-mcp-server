/**
 * Monetization / licensing layer.
 *
 * The server exposes a FREE tier and a PREMIUM tier. Free tools are always
 * available; premium tools require a valid license key. The verification is
 * intentionally pluggable so it can be wired to MCPize, Stripe, or any HTTP
 * entitlement service later without touching the tool implementations.
 *
 * Configuration (environment variables):
 *   LONGEVITY_LICENSE_KEY   The customer's license key.
 *   LONGEVITY_TIER          Explicit override: "free" | "premium". Useful for
 *                           self-hosted / enterprise deployments where the
 *                           operator owns the data and skips key checks.
 *   LONGEVITY_VALID_KEYS    Comma-separated allowlist of keys treated as valid
 *                           premium (for local testing / manual provisioning).
 *   LONGEVITY_LICENSE_VERIFY_URL
 *                           (optional) HTTP endpoint that validates keys
 *                           remotely. When set, REMOTE verification is used.
 */

export type Tier = 'free' | 'premium';

export interface Entitlement {
  tier: Tier;
  /** Whether a license key was supplied at all. */
  keyPresent: boolean;
  /** Human-readable explanation, surfaced in upgrade prompts / logs. */
  reason: string;
  /** Optional expiry, if the verifier reports one. */
  expiresAt?: string;
}

/** Recognized format for locally-issued Oak Longevity keys: OAK-XXXX-XXXX-XXXX. */
const LOCAL_KEY_RE = /^OAK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

export interface LicenseProvider {
  /** Resolve the current entitlement. May be async (e.g. remote check). */
  resolve(): Promise<Entitlement>;
}

export interface LicenseOptions {
  /**
   * Explicit license key (e.g. read from an HTTP request header in a
   * multi-tenant deployment). Falls back to LONGEVITY_LICENSE_KEY when omitted.
   */
  key?: string;
}

/**
 * Default provider: resolves entitlement from an explicit key (if given) or
 * environment variables using local rules. Result is cached per instance.
 * Swap this out (see createLicenseProvider) for a remote verifier.
 */
class EnvLicenseProvider implements LicenseProvider {
  private cached?: Promise<Entitlement>;
  constructor(private readonly opts: LicenseOptions = {}) {}

  resolve(): Promise<Entitlement> {
    if (!this.cached) this.cached = this.compute();
    return this.cached;
  }

  private async compute(): Promise<Entitlement> {
    const override = (process.env.LONGEVITY_TIER || '').toLowerCase().trim();
    if (override === 'premium') {
      return { tier: 'premium', keyPresent: true, reason: 'LONGEVITY_TIER=premium override (self-hosted/enterprise).' };
    }
    if (override === 'free') {
      return { tier: 'free', keyPresent: false, reason: 'LONGEVITY_TIER=free override.' };
    }

    const key = (this.opts.key || process.env.LONGEVITY_LICENSE_KEY || '').trim();
    if (!key) {
      return { tier: 'free', keyPresent: false, reason: 'No license key configured. Running on FREE tier.' };
    }

    const allowlist = (process.env.LONGEVITY_VALID_KEYS || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    if (allowlist.includes(key) || LOCAL_KEY_RE.test(key)) {
      return { tier: 'premium', keyPresent: true, reason: 'Valid premium license key.' };
    }

    return {
      tier: 'free',
      keyPresent: true,
      reason: 'License key present but not recognized as valid. Running on FREE tier.',
    };
  }
}

/**
 * Remote provider stub. When LONGEVITY_LICENSE_VERIFY_URL is set, this POSTs the
 * key and expects { valid: boolean, tier?: Tier, expiresAt?: string }. This is
 * where a Stripe / MCPize entitlement webhook would be wired in.
 */
class RemoteLicenseProvider implements LicenseProvider {
  private cached?: Promise<Entitlement>;
  constructor(private readonly url: string, private readonly opts: LicenseOptions = {}) {}

  resolve(): Promise<Entitlement> {
    if (!this.cached) this.cached = this.compute();
    return this.cached;
  }

  private async compute(): Promise<Entitlement> {
    const key = (this.opts.key || process.env.LONGEVITY_LICENSE_KEY || '').trim();
    if (!key) {
      return { tier: 'free', keyPresent: false, reason: 'No license key configured. Running on FREE tier.' };
    }
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) {
        return { tier: 'free', keyPresent: true, reason: `Remote verification failed (HTTP ${res.status}). FREE tier.` };
      }
      const body = (await res.json()) as { valid?: boolean; tier?: Tier; expiresAt?: string };
      if (body.valid) {
        return {
          tier: body.tier === 'free' ? 'free' : 'premium',
          keyPresent: true,
          reason: 'Verified by remote license service.',
          expiresAt: body.expiresAt,
        };
      }
      return { tier: 'free', keyPresent: true, reason: 'Remote service reports key invalid. FREE tier.' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { tier: 'free', keyPresent: true, reason: `Remote verification error: ${msg}. FREE tier.` };
    }
  }
}

export function createLicenseProvider(opts: LicenseOptions = {}): LicenseProvider {
  const url = (process.env.LONGEVITY_LICENSE_VERIFY_URL || '').trim();
  return url ? new RemoteLicenseProvider(url, opts) : new EnvLicenseProvider(opts);
}

/**
 * Resolve entitlement via the given provider. Caching is handled per-provider
 * instance, so callers can construct a fresh provider per request (multi-tenant
 * HTTP) or reuse one for the process lifetime (stdio).
 */
export function getEntitlement(provider: LicenseProvider = createLicenseProvider()): Promise<Entitlement> {
  return provider.resolve();
}

/** Message shown when a premium tool is invoked without entitlement. */
export function upgradeMessage(toolName: string): string {
  return [
    `🔒 "${toolName}" is an Oak Longevity PREMIUM tool.`,
    '',
    'The FREE tier includes: get_medication_list, get_medication_details, and',
    'get_fda_status (regulatory reference).',
    'PREMIUM unlocks the clinical decision-support tools: contraindication',
    'screening, drug-interaction checks, required baseline labs, ongoing',
    'monitoring plans, evidence-based dosing protocols, and patient-intake',
    'pathway suggestions.',
    '',
    'To activate, set the LONGEVITY_LICENSE_KEY environment variable in your MCP',
    'client configuration. Get a key at https://www.oaklongevity.com.',
  ].join('\n');
}
