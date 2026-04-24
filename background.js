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

async function callGemini(contents, tools, apiKey) {
  if (!apiKey) throw new Error('callGemini: apiKey is required');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
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

if (typeof module !== 'undefined') module.exports = { scoreJobMatch, callGemini, runAgentLoop };
