const { callGemini } = require('../background');

beforeEach(() => {
  global.fetch.mockReset();
});

test('POSTs to the correct Gemini endpoint with the API key', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'Hello' }], role: 'model' } }] })
  });

  await callGemini([{ role: 'user', parts: [{ text: 'test' }] }], [], 'test-api-key');

  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toContain('gemini-2.0-flash');
  expect(url).toContain('test-api-key');
  expect(options.method).toBe('POST');
});

test('returns parsed JSON on success', async () => {
  const mockResponse = { candidates: [{ content: { parts: [{ text: 'Result' }], role: 'model' } }] };
  global.fetch.mockResolvedValue({ ok: true, json: async () => mockResponse });

  const result = await callGemini([], [], 'key');
  expect(result).toEqual(mockResponse);
});

test('throws with status code on non-200 response', async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });

  await expect(callGemini([], [], 'bad-key')).rejects.toThrow('Gemini API error 401');
});
