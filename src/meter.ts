/**
 * Per-call usage metering (Track B: pay-per-call).
 *
 * Fire-and-forget: records ONE Stripe billing meter event per successful,
 * billable premium tool call. Completely inert unless ALL of these hold:
 *   - STRIPE_SECRET_KEY and STRIPE_METER_EVENT_NAME are set (server-side host), AND
 *   - the caller resolves to a Stripe customer on the metered plan
 *     (entitlement.stripeCustomerId present and entitlement.metered === true).
 *
 * So local/stdio usage, the free tier, flat $29/mo subscribers, and self-hosted
 * deployments are NEVER charged per call.
 *
 * Never throws and never blocks the tool call — a metering hiccup must not break
 * a clinical lookup.
 */

export interface MeterContext {
  stripeCustomerId?: string;
  metered?: boolean;
  server: string;
  tool: string;
  tier: 'free' | 'premium';
}

const METER_API = 'https://api.stripe.com/v1/billing/meter_events';

export function meteringEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_METER_EVENT_NAME);
}

export function recordUsage(ctx: MeterContext): void {
  if (!meteringEnabled() || ctx.tier !== 'premium' || !ctx.metered || !ctx.stripeCustomerId) {
    return;
  }

  const secret = process.env.STRIPE_SECRET_KEY as string;
  const eventName = process.env.STRIPE_METER_EVENT_NAME as string;

  const body = new URLSearchParams({
    event_name: eventName,
    'payload[stripe_customer_id]': ctx.stripeCustomerId,
    'payload[value]': '1',
    identifier: `${ctx.server}-${ctx.tool}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });

  void fetch(METER_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  })
    .then((res) => {
      if (!res.ok) console.error(`[meter] usage record HTTP ${res.status}`);
    })
    .catch((err) => {
      console.error('[meter] usage record failed:', err instanceof Error ? err.message : err);
    });
}
