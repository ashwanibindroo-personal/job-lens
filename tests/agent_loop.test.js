const { runAgentLoop } = require('../background');

function makeTextResponse(text) {
  return { content: [{ type: 'text', text }], stop_reason: 'end_turn' };
}

function makeToolCallResponse(name, args) {
  return {
    content: [{ type: 'tool_use', id: 'toolu_123', name, input: args }],
    stop_reason: 'tool_use'
  };
}

test('exits on text response and emits result update', async () => {
  const mockCallClaude = jest.fn().mockResolvedValue(makeTextResponse('Found 3 jobs.'));
  const mockExecuteTool = jest.fn();
  const updates = [];

  await runAgentLoop({
    contents: [{ role: 'user', content: 'Find jobs' }],
    tools: [],
    apiKey: 'key',
    jobTitle: 'Developer',
    skills: 'JS',
    onUpdate: (u) => updates.push(u),
    callClaudeFn: mockCallClaude,
    executeToolFn: mockExecuteTool
  });

  expect(mockCallClaude).toHaveBeenCalledTimes(1);
  expect(mockExecuteTool).not.toHaveBeenCalled();
  expect(updates.some(u => u.text.includes('Found 3 jobs'))).toBe(true);
});

test('executes tool then loops again on tool call response', async () => {
  const mockCallClaude = jest.fn()
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
    callClaudeFn: mockCallClaude,
    executeToolFn: mockExecuteTool
  });

  expect(mockCallClaude).toHaveBeenCalledTimes(2);
  expect(mockExecuteTool).toHaveBeenCalledWith('scrape_page_content', {}, expect.any(Object));
  expect(updates.some(u => u.text.includes('scrape_page_content'))).toBe(true);
});

test('stops after 10 iterations and emits max-steps warning', async () => {
  const mockCallClaude = jest.fn().mockResolvedValue(makeToolCallResponse('scrape_page_content', {}));
  const mockExecuteTool = jest.fn().mockResolvedValue('result');
  const updates = [];

  await runAgentLoop({
    contents: [],
    tools: [],
    apiKey: 'key',
    jobTitle: 'Dev',
    skills: 'JS',
    onUpdate: (u) => updates.push(u),
    callClaudeFn: mockCallClaude,
    executeToolFn: mockExecuteTool
  });

  expect(mockCallClaude).toHaveBeenCalledTimes(10);
  expect(updates.some(u => u.text.includes('Max steps reached'))).toBe(true);
});

test('handles empty response gracefully', async () => {
  const mockCallClaude = jest.fn().mockResolvedValue({ content: [], stop_reason: 'end_turn' });
  const updates = [];

  await runAgentLoop({
    contents: [],
    tools: [],
    apiKey: 'key',
    jobTitle: 'Dev',
    skills: 'JS',
    onUpdate: (u) => updates.push(u),
    callClaudeFn: mockCallClaude,
    executeToolFn: jest.fn()
  });

  expect(updates.some(u => u.text.includes('empty response'))).toBe(true);
  expect(mockCallClaude).toHaveBeenCalledTimes(1);
});

test('continues loop and emits warning when executeToolFn throws', async () => {
  const mockCallClaude = jest.fn()
    .mockResolvedValueOnce(makeToolCallResponse('scrape_page_content', {}))
    .mockResolvedValueOnce(makeTextResponse('Done despite error.'));
  const mockExecuteTool = jest.fn().mockRejectedValue(new Error('Tab not found'));
  const updates = [];

  await runAgentLoop({
    contents: [],
    tools: [],
    apiKey: 'key',
    jobTitle: 'Dev',
    skills: 'JS',
    onUpdate: (u) => updates.push(u),
    callClaudeFn: mockCallClaude,
    executeToolFn: mockExecuteTool
  });

  expect(updates.some(u => u.text.includes('Tab not found'))).toBe(true);
  expect(mockCallClaude).toHaveBeenCalledTimes(2);
});
