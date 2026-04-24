const { runAgentLoop } = require('../background');

function makeTextResponse(text) {
  return { candidates: [{ content: { parts: [{ text }], role: 'model' } }] };
}

function makeToolCallResponse(name, args) {
  return { candidates: [{ content: { parts: [{ functionCall: { name, args } }], role: 'model' } }] };
}

test('exits on text response and emits result update', async () => {
  const mockCallGemini = jest.fn().mockResolvedValue(makeTextResponse('Found 3 jobs.'));
  const mockExecuteTool = jest.fn();
  const updates = [];

  await runAgentLoop({
    contents: [{ role: 'user', parts: [{ text: 'Find jobs' }] }],
    tools: [],
    apiKey: 'key',
    jobTitle: 'Developer',
    skills: 'JS',
    onUpdate: (u) => updates.push(u),
    callGeminiFn: mockCallGemini,
    executeToolFn: mockExecuteTool
  });

  expect(mockCallGemini).toHaveBeenCalledTimes(1);
  expect(mockExecuteTool).not.toHaveBeenCalled();
  expect(updates.some(u => u.text.includes('Found 3 jobs'))).toBe(true);
});

test('executes tool then loops again on tool call response', async () => {
  const mockCallGemini = jest.fn()
    .mockResolvedValueOnce(makeToolCallResponse('scrape_page_content', {}))
    .mockResolvedValueOnce(makeTextResponse('Done.'));
  const mockExecuteTool = jest.fn().mockResolvedValue('page text content');
  const updates = [];

  await runAgentLoop({
    contents: [],
    tools: [],
    apiKey: 'key',
    jobTitle: 'Developer',
    skills: 'JS',
    onUpdate: (u) => updates.push(u),
    callGeminiFn: mockCallGemini,
    executeToolFn: mockExecuteTool
  });

  expect(mockCallGemini).toHaveBeenCalledTimes(2);
  expect(mockExecuteTool).toHaveBeenCalledWith('scrape_page_content', {}, expect.any(Object));
  expect(updates.some(u => u.text.includes('scrape_page_content'))).toBe(true);
});

test('stops after 10 iterations and emits max-steps warning', async () => {
  const mockCallGemini = jest.fn().mockResolvedValue(makeToolCallResponse('scrape_page_content', {}));
  const mockExecuteTool = jest.fn().mockResolvedValue('result');
  const updates = [];

  await runAgentLoop({
    contents: [],
    tools: [],
    apiKey: 'key',
    jobTitle: 'Dev',
    skills: 'JS',
    onUpdate: (u) => updates.push(u),
    callGeminiFn: mockCallGemini,
    executeToolFn: mockExecuteTool
  });

  expect(mockCallGemini).toHaveBeenCalledTimes(10);
  expect(updates.some(u => u.text.includes('Max steps reached'))).toBe(true);
});
