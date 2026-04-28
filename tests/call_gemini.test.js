const { callClaude } = require('../background');

beforeEach(() => {
  global.fetch.mockReset();
});

test('POSTs to the correct Claude endpoint with the API key', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ content: [{ type: 'text', text: 'Hello' }], stop_reason: 'end_turn' })
  });

  await callClaude([{ role: 'user', content: 'test' }], [], 'test-api-key');

  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toContain('anthropic.com');
  expect(options.method).toBe('POST');
  expect(options.headers['x-api-key']).toBe('test-api-key');
});

test('returns parsed JSON on success', async () => {
  const mockResponse = { content: [{ type: 'text', text: 'Result' }], stop_reason: 'end_turn' };
  global.fetch.mockResolvedValue({ ok: true, json: async () => mockResponse });

  const result = await callClaude([], [], 'key');
  expect(result).toEqual(mockResponse);
});

test('throws with status code on non-200 response', async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });

  await expect(callClaude([], [], 'bad-key')).rejects.toThrow('Claude API error 401');
});

test('propagates network errors from fetch', async () => {
  global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(callClaude([], [], 'key')).rejects.toThrow('Failed to fetch');
});
