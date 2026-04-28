// Agentic loop service worker — Anthropic Claude API

const SYSTEM_PROMPT = `You are a job-hunting assistant. Your goal is to find relevant job listings on the current webpage for a given job title and skills list. Use the available tools to scrape content, extract job links, and score matches. Return a clear, numbered list of the top matching jobs with their scores and URLs.`;

const CLAUDE_TOOLS = [
  {
    name: 'scrape_page_content',
    description: 'Returns the full visible text content of the current browser tab',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'extract_job_links',
    description: 'Scans the page DOM and returns job-related anchor links found on the page',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'score_job_match',
    description: 'Scores how well a job description matches the target role and skills on a scale of 1-10',
    input_schema: {
      type: 'object',
      properties: {
        jobDescription: { type: 'string', description: 'Text of the job listing to evaluate' },
        jobTitle: { type: 'string', description: 'Target job title' },
        skills: { type: 'string', description: 'Comma-separated list of desired skills' }
      },
      required: ['jobDescription', 'jobTitle', 'skills']
    }
  }
];

function scrapePageContent() {
  return document.body.innerText.slice(0, 8000);
}

function extractJobLinks() {
  const keywords = ['job', 'career', 'position', 'role', 'apply', 'opening', 'hiring', 'vacancy'];
  const links = Array.from(document.querySelectorAll('a'));
  const matched = links.filter(a => {
    const href = (a.href || '').toLowerCase();
    const text = (a.innerText || '').toLowerCase();
    return keywords.some(kw => href.includes(kw) || text.includes(kw));
  });
  return matched.slice(0, 50).map(a => ({ text: a.innerText.trim().slice(0, 100), href: a.href }));
}

function scoreJobMatch({ jobDescription, jobTitle, skills }) {
  const text = (jobDescription || '').toLowerCase();
  const skillTokens = (skills || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const titleTokens = (jobTitle || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);

  const skillHits = skillTokens.filter(skill => {
    const pattern = new RegExp('\\b' + skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    return pattern.test(text);
  }).length;
  const skillScore = Math.min(skillHits * 2, 7);

  const titleHits = titleTokens.filter(word => {
    const pattern = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    return pattern.test(text);
  }).length;
  const titleScore = Math.min(titleHits * 1.5, 3);

  return Math.max(1, Math.min(10, Math.round(skillScore + titleScore)));
}

async function callClaude(messages, tools, apiKey, retries = 3) {
  if (!apiKey) throw new Error('callClaude: apiKey is required');
  const url = 'https://api.anthropic.com/v1/messages';
  const body = {
    model: 'claude-opus-4-7',
    system: SYSTEM_PROMPT,
    messages,
    tools,
    max_tokens: 4096
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429 && retries > 0) {
      const retryMatch = errText.match(/retry[^\d]*(\d+)s/i);
      const waitMs = retryMatch ? (parseInt(retryMatch[1], 10) + 2) * 1000 : 45000;
      await new Promise(r => setTimeout(r, waitMs));
      return callClaude(messages, tools, apiKey, retries - 1);
    }
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  return res.json();
}

async function runAgentLoop({ contents, tools, apiKey, jobTitle, skills, onUpdate, callClaudeFn = callClaude, executeToolFn }) {
  const MAX_STEPS = 10;
  const messages = [...contents];

  for (let step = 0; step < MAX_STEPS; step++) {
    onUpdate({ text: '🤖 Agent thinking...', style: 'thinking' });

    const response = await callClaudeFn(messages, tools, apiKey);

    if (!response.content || response.content.length === 0) {
      onUpdate({ text: '⚠️ Agent returned empty response.', style: 'warning' });
      return;
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolUseParts = response.content.filter(b => b.type === 'tool_use');
    const textParts = response.content.filter(b => b.type === 'text');

    if (textParts.length > 0) {
      const text = textParts.map(b => b.text).join('');
      if (text.trim()) {
        onUpdate({ text: `🧠 ${text}`, style: response.stop_reason === 'end_turn' ? 'result' : 'thinking' });
      }
    }

    if (response.stop_reason === 'end_turn' || toolUseParts.length === 0) {
      return;
    }

    const toolResults = [];
    for (const block of toolUseParts) {
      const { id, name, input } = block;
      onUpdate({ text: `🛠 Calling Tool: ${name}...`, style: 'tool' });

      let toolResult;
      try {
        toolResult = await executeToolFn(name, input, { jobTitle, skills });
        onUpdate({ text: `✅ Tool executed.`, style: 'success' });
      } catch (err) {
        onUpdate({ text: `⚠️ Tool ${name} failed: ${err.message}`, style: 'warning' });
        toolResult = { error: err.message };
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: id,
        content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  onUpdate({ text: '⚠️ Max steps reached', style: 'warning' });
}

async function chromeExecuteTool(toolName, args, { jobTitle, skills }) {
  if (toolName === 'scrape_page_content') {
    const results = await chrome.scripting.executeScript({
      target: { tabId: args._tabId },
      func: scrapePageContent
    });
    if (!results || results.length === 0 || results[0] == null) {
      throw new Error(`executeScript returned no result for tool: ${toolName}`);
    }
    return results[0].result;
  }

  if (toolName === 'extract_job_links') {
    const results = await chrome.scripting.executeScript({
      target: { tabId: args._tabId },
      func: extractJobLinks
    });
    if (!results || results.length === 0 || results[0] == null) {
      throw new Error(`executeScript returned no result for tool: ${toolName}`);
    }
    return results[0].result;
  }

  if (toolName === 'score_job_match') {
    return scoreJobMatch({
      jobDescription: args.jobDescription,
      jobTitle: args.jobTitle || jobTitle,
      skills: args.skills || skills
    });
  }

  throw new Error(`Unknown tool: ${toolName}`);
}

function broadcast(payload) {
  chrome.runtime.sendMessage(payload).catch(() => {});
}

async function handleStartAgent({ jobTitle, skills, tabId }) {
  if (handleStartAgent._running) {
    broadcast({ type: 'AGENT_UPDATE', text: '⚠️ Agent already running.', style: 'warning' });
    broadcast({ type: 'AGENT_DONE' });
    return;
  }
  handleStartAgent._running = true;

  const capturedTabId = tabId;

  try {
    const { apiKey } = await chrome.storage.local.get(['apiKey']);
    if (!apiKey) {
      broadcast({ type: 'AGENT_UPDATE', text: '❌ API key not set. Enter it in Settings.', style: 'error' });
      broadcast({ type: 'AGENT_DONE' });
      return;
    }

    const contents = [{
      role: 'user',
      content: `Find jobs for: "${jobTitle}". My skills: ${skills || 'not specified'}. Analyze this page and return the top matching job listings with their URLs.`
    }];

    const executeToolFn = (name, args, ctx) =>
      chromeExecuteTool(name, { ...args, _tabId: capturedTabId }, ctx);

    try {
      await runAgentLoop({
        contents,
        tools: CLAUDE_TOOLS,
        apiKey,
        jobTitle,
        skills,
        onUpdate: (u) => broadcast({ type: 'AGENT_UPDATE', ...u }),
        executeToolFn
      });
    } catch (err) {
      broadcast({ type: 'AGENT_UPDATE', text: `❌ ${err.message}`, style: 'error' });
    }

    broadcast({ type: 'AGENT_DONE' });
  } finally {
    handleStartAgent._running = false;
  }
}
handleStartAgent._running = false;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_AGENT') handleStartAgent(msg);
  // KEEPALIVE messages keep the service worker alive — no action needed
});

if (typeof module !== 'undefined') module.exports = { scoreJobMatch, callClaude, runAgentLoop };
