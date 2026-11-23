import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../src/providers.mjs';

const output = { summary: 'Summary', claims: [], challenges: [], requests: [], candidateCases: [] };
const payload = { model: 'test-model', input: '{"goal":"test"}', outputBudget: 1500 };
test('live adapter counts full structured requests and uses isolated, unstored responses', async () => {
  const calls = [];
  const provider = new OpenAIProvider({ apiKey: 'test-key', fetchImpl: async (url, options) => {
    calls.push({ url, options }); return Response.json(url.endsWith('input_tokens') ? { input_tokens: 123 } : { id: 'response-id', status: 'completed', usage: { input_tokens: 123, output_tokens: 25, input_tokens_details: { cached_tokens: 20 } }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] });
  } });
  const count = await provider.count(payload, {}); const result = await provider.generate(payload, {});
  assert.equal(count.tokens, 123); assert.equal(result.usage.cachedTokens, 20);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses/input_tokens');
  const input = JSON.parse(calls[0].options.body); const generated = JSON.parse(calls[1].options.body);
  assert.deepEqual(input.text, generated.text); assert.equal(generated.text.format.strict, true); assert.equal(generated.store, false); assert.equal(generated.max_output_tokens, 1500);
  assert.equal(generated.previous_response_id, undefined); assert.equal(generated.tools, undefined); assert.equal(calls[1].options.redirect, 'error');
});
test('incomplete JSON retains billable usage for the coordinator', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key', fetchImpl: async () => Response.json({ status: 'incomplete', usage: { input_tokens: 90, output_tokens: 1000 } }) });
  await assert.rejects(provider.generate(payload, {}), error => error.code === 'invalid_output' && error.usage.outputTokens === 1000);
});
test('provider errors do not echo response bodies or authorization values', async () => {
  const provider = new OpenAIProvider({ apiKey: 'secret-test-value', fetchImpl: async () => new Response('private server error details', { status: 401 }) });
  await assert.rejects(provider.count(payload, {}), error => error.message.includes('401') && !error.message.includes('private') && !error.message.includes('secret-test-value'));
});
test('malformed usage is kept unknown rather than corrupting token accounting', async () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key', fetchImpl: async () => Response.json({ status: 'incomplete', usage: { input_tokens: -5, output_tokens: 'invalid' } }) });
  await assert.rejects(provider.generate(payload, {}), error => error.code === 'invalid_output' && error.usage === null);
});
