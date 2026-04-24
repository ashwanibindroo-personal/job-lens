// Agentic loop service worker — implementation added in Tasks 2-6

const SYSTEM_PROMPT = `You are a job-hunting assistant. Your goal is to find relevant job listings on the current webpage for a given job title and skills list. Use the available tools to scrape content, extract job links, and score matches. Return a clear, numbered list of the top matching jobs with their scores and URLs.`;

const GEMINI_TOOLS = [{
  function_declarations: [
    {
      name: 'scrape_page_content',
      description: 'Returns the full visible text content of the current browser tab',
      parameters: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'extract_job_links',
      description: 'Scans the page DOM and returns job-related anchor links found on the page',
      parameters: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'score_job_match',
      description: 'Scores how well a job description matches the target role and skills on a scale of 1-10',
      parameters: {
        type: 'object',
        properties: {
          jobDescription: { type: 'string', description: 'Text of the job listing to evaluate' },
          jobTitle: { type: 'string', description: 'Target job title' },
          skills: { type: 'string', description: 'Comma-separated list of desired skills' }
        },
        required: ['jobDescription', 'jobTitle', 'skills']
      }
    }
  ]
}];

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

async function callGemini(contents, tools, apiKey, retries = 3) {
  if (!apiKey) throw new Error('callGemini: apiKey is required');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    tools
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429 && retries > 0) {
      const delay = (4 - retries) * 5000;
      await new Promise(r => setTimeout(r, delay));
      return callGemini(contents, tools, apiKey, retries - 1);
    }
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  return res.json();
}

async function runAgentLoop({ contents, tools, apiKey, jobTitle, skills, onUpdate, callGeminiFn = callGemini, executeToolFn }) {
  const MAX_STEPS = 10;
  const messages = [...contents];

  for (let step = 0; step < MAX_STEPS; step++) {
    onUpdate({ text: '🤖 Agent thinking...', style: 'thinking' });

    const response = await callGeminiFn(messages, tools, apiKey);
    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error('No candidates in Gemini response');

    const content = candidate.content;
    if (!content?.parts) {
      onUpdate({ text: '⚠️ Agent response blocked or empty.', style: 'warning' });
      return;
    }
    const parts = content.parts;

    if (parts.length === 0) {
      onUpdate({ text: '⚠️ Agent returned empty response.', style: 'warning' });
      return;
    }

    messages.push({ role: 'model', parts });

    const functionCallParts = parts.filter(p => p.functionCall);
    const textParts = parts.filter(p => p.text);

    if (functionCallParts.length === 0) {
      const text = textParts.map(p => p.text || '').join('');
      onUpdate({ text: `🧠 ${text}`, style: 'result' });
      return;
    }

    if (textParts.length > 0 && functionCallParts.length > 0) {
      const reasoningText = textParts.map(p => p.text).join('');
      onUpdate({ text: `🧠 ${reasoningText}`, style: 'result' });
    }

    const toolResponseParts = [];
    for (const part of functionCallParts) {
      const { name, args } = part.functionCall;
      onUpdate({ text: `🛠 Calling Tool: ${name}...`, style: 'tool' });

      let toolResult;
      try {
        toolResult = await executeToolFn(name, args, { jobTitle, skills });
        onUpdate({ text: `✅ Tool executed.`, style: 'success' });
      } catch (err) {
        onUpdate({ text: `⚠️ Tool ${name} failed: ${err.message}`, style: 'warning' });
        toolResult = { error: err.message };
      }

      toolResponseParts.push({
        functionResponse: {
          name,
          response: { result: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult) }
        }
      });
    }

    messages.push({ role: 'user', parts: toolResponseParts });
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
  chrome.runtime.sendMessage(payload).catch(() => {
    // Popup may be closed — ignore the error
  });
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
      parts: [{ text: `Find jobs for: "${jobTitle}". My skills: ${skills || 'not specified'}. Analyze this page and return the top matching job listings with their URLs.` }]
    }];

    const executeToolFn = (name, args, ctx) =>
      chromeExecuteTool(name, { ...args, _tabId: capturedTabId }, ctx);

    try {
      await runAgentLoop({
        contents,
        tools: GEMINI_TOOLS,
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
  // No `return true` needed — responses flow via broadcast(), not sendResponse.
  if (msg.type === 'START_AGENT') handleStartAgent(msg);
  // KEEPALIVE messages keep the service worker alive — no action needed
});

if (typeof module !== 'undefined') module.exports = { scoreJobMatch, callGemini, runAgentLoop };
