// Executes the actual Edge Function handler locally, with no network or real account.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const org = '11111111-1111-4111-8111-111111111111';
const otherOrg = '22222222-2222-4222-8222-222222222222';
let handler, requests = 0, writes = 0, validSession = true;
const subscription = { organization_id: org, plan_id: 'starter', status: 'trial' };
const client = {
  auth: { getUser: async () => ({ data: { user: validSession ? { id: 'test-user' } : null } }) },
  from(table) {
    const filters = {};
    const query = {
      select() { return query; },
      eq(key, value) { filters[key] = value; return query; },
      async maybeSingle() {
        if (table === 'organization_members') return { data: filters.organization_id === org ? { organization_id: org, role: 'owner' } : null };
        if (table === 'subscription_payments') return { data: { organization_id: org, provider_payment_id: 'test-payment', provider_kind: 'softpay', applied_at: null } };
        throw new Error('Unexpected read: ' + table);
      },
      async single() {
        assert.equal(table, 'subscriptions');
        assert.equal(filters.organization_id, org);
        return { data: subscription };
      },
      insert() { writes++; throw new Error('Unexpected write'); },
      update() { writes++; throw new Error('Unexpected write'); },
    };
    return query;
  },
  rpc() { writes++; throw new Error('Unexpected RPC'); },
};
const compiled = transformSync(readFileSync('supabase/functions/saspay-proxy/index.ts', 'utf8'), { loader: 'ts', format: 'esm', target: 'es2022' }).code
  .replace(/^import .*?from .*?;\n/m, '');
vm.runInNewContext(compiled, {
  createClient: () => client,
  Deno: { serve: callback => { handler = callback; }, env: { get: key => key === 'SASPAY_API_KEY' ? undefined : 'test-only' } },
  Response, Request, console,
  fetch: async () => { requests++; throw new Error('No external call is allowed in this test'); },
});
let checks = 0;
async function call(action, payload, expected, authenticated = true) {
  const response = await handler(new Request('https://example.invalid', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer test-only' } : {}) },
    body: JSON.stringify({ action, payload }),
  }));
  assert.equal(response.status, expected, action);
  checks++;
  return response.json();
}
await call('subscription-status', { organizationId: org }, 401, false);
validSession = false;
await call('subscription-status', { organizationId: org }, 401);
validSession = true;
await call('subscription-status', {}, 400);
await call('subscription-status', { organizationId: otherOrg }, 403);
assert.deepEqual((await call('subscription-status', { organizationId: org }, 200)).subscription, subscription);
assert.equal((await call('subscription-initiate', { organizationId: org, planId: 'standard', billingCycle: 'monthly', mode: 'checkout' }, 503)).code, 'GATEWAY_NOT_CONFIGURED');
assert.equal((await call('subscription-verify', { organizationId: org, paymentRef: 'test-payment' }, 503)).code, 'GATEWAY_NOT_CONFIGURED');
await call('ping', {}, 200);
assert.equal(requests, 0, 'No provider request without a key'); checks++;
assert.equal(writes, 0, 'No payment/subscription write without a key'); checks++;
console.log(`${checks} contrôles serveur réussis : statut accessible après authentification ; sans clé SasPay, paiement refusé (503), zéro appel externe et zéro écriture.`);
