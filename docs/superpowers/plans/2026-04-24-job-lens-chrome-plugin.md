# Job Lens Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 Chrome Extension that runs a Gemini 2.0 Flash agentic loop to find and score job listings on any job board the user is visiting.

**Architecture:** `background.js` (service worker) owns all Gemini API calls and the agentic loop. `popup.js` sends a `START_AGENT` message with the active tab ID and streams live status updates to the console UI. Three tools are defined in `background.js`: `scrapePageContent` and `extractJobLinks` are injected into the active tab via `chrome.scripting.executeScript({ func })`, while `scoreJobMatch` runs locally in the service worker.

**Tech Stack:** Vanilla JavaScript (ES2020), Chrome Extension Manifest V3, Google Gemini 2.0 Flash REST API (`generativelanguage.googleapis.com`), Jest 29 (unit tests).

---

## File Map

| File | Responsibility |
|---|---|
| `manifest.json` | MV3 config, permissions |
| `background.js` | Service worker: constants, 3 tool functions, `scoreJobMatch`, `callGemini`, `runAgentLoop`, Chrome message listener |
| `popup.html` | Extension popup shell |
| `popup.css` | Dark console-style theme |
| `popup.js` | UI logic: send `START_AGENT`, receive `AGENT_UPDATE`, settings toggle, keepalive ping |
| `jest.config.js` | Jest config pointing to test setup file |
| `tests/setup.js` | Global Chrome API mocks + `fetch` mock |
| `tests/score_job_match.test.js` | Unit tests for `scoreJobMatch` |
| `tests/call_gemini.test.js` | Unit tests for `callGemini` with mocked `fetch` |
| `tests/agent_loop.test.js` | Unit tests for `runAgentLoop` with mocked dependencies |

---

## Task 1: Scaffold

**Files:**
- Create: `manifest.json`
- Create: `package.json`
- Create: `jest.config.js`
- Create: `.gitignore`
- Create: `background.js` (stub)
- Create: `popup.html` (stub)
- Create: `popup.css` (empty)
- Create: `popup.js` (stub)
- Create: `tests/setup.js`

- [ ] **Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Job Lens",
  "version": "1.0",
  "description": "Agentic AI job finder powered by Gemini",
  "permissions": ["scripting", "storage", "tabs"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html" }
}
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "job-lens",
  "version": "1.0.0",
  "scripts": { "test": "jest" },
  "devDependencies": { "jest": "^29.0.0" }
}
```

- [ ] **Step 3: Create jest.config.js**

```javascript
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./tests/setup.js']
};
```

- [ ] **Step 4: Create tests/setup.js**

```javascript
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: { addListener: jest.fn() }
  },
  scripting: { executeScript: jest.fn() },
  tabs: { query: jest.fn() }
};
global.fetch = jest.fn();
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
.superpowers/
```

- [ ] **Step 6: Create background.js stub**

```javascript
// Agentic loop service worker — implementation added in Tasks 2-6

if (typeof module !== 'undefined') module.exports = {};
```

- [ ] **Step 7: Create popup.html stub**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Job Lens</title><link rel="stylesheet" href="popup.css"></head>
<body>
  <p style="color:white;padding:12px">Coming soon</p>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 8: Create popup.js stub**

```javascript
// UI logic — implemented in Task 5
```

- [ ] **Step 9: Create popup.css (empty file)**

Leave `popup.css` as an empty file — content added in Task 5.

- [ ] **Step 10: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 11: Run tests**

```bash
npm test
```

Expected: `Test Suites: 0 passed, 0 total` — no failures.

- [ ] **Step 12: Commit**

```bash
git add manifest.json package.json package-lock.json jest.config.js .gitignore background.js popup.html popup.css popup.js tests/setup.js
git commit -m "feat: scaffold chrome extension with jest test setup"
```

---

## Task 2: scoreJobMatch — TDD

**Files:**
- Create: `tests/score_job_match.test.js`
- Modify: `background.js`

- [ ] **Step 1: Write failing tests**

Create `tests/score_job_match.test.js`:

```javascript
const { scoreJobMatch } = require('../background');

test('returns high score when job matches title and skills', () => {
  const result = scoreJobMatch({
    jobDescription: 'We are looking for a Frontend Developer with React and TypeScript experience',
    jobTitle: 'Frontend Developer',
    skills: 'React, TypeScript'
  });
  expect(result).toBeGreaterThanOrEqual(7);
});

test('returns low score for unrelated job', () => {
  const result = scoreJobMatch({
    jobDescription: 'Licensed plumber needed for residential pipe installation work',
    jobTitle: 'Frontend Developer',
    skills: 'React, TypeScript'
  });
  expect(result).toBeLessThanOrEqual(3);
});

test('returns integer between 1 and 10', () => {
  const result = scoreJobMatch({
    jobDescription: 'Some generic job posting with no relevant keywords',
    jobTitle: 'Developer',
    skills: 'JavaScript'
  });
  expect(Number.isInteger(result)).toBe(true);
  expect(result).toBeGreaterThanOrEqual(1);
  expect(result).toBeLessThanOrEqual(10);
});

test('partial skill match returns mid-range score', () => {
  const result = scoreJobMatch({
    jobDescription: 'React developer position, CSS experience a plus',
    jobTitle: 'Frontend Developer',
    skills: 'React, TypeScript, CSS, Node.js'
  });
  expect(result).toBeGreaterThanOrEqual(4);
  expect(result).toBeLessThanOrEqual(8);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/score_job_match.test.js
```

Expected: `FAIL tests/score_job_match.test.js` — `scoreJobMatch is not a function`

- [ ] **Step 3: Implement scoreJobMatch in background.js**

Replace `background.js` entirely with:

```javascript
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
  const text = jobDescription.toLowerCase();
  const skillTokens = skills.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const titleTokens = jobTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  const skillHits = skillTokens.filter(skill => text.includes(skill)).length;
  const skillScore = Math.min(skillHits * 2, 6);

  const titleHits = titleTokens.filter(word => text.includes(word)).length;
  const titleScore = Math.min(titleHits * 1.5, 3);

  return Math.max(1, Math.min(10, Math.round(skillScore + titleScore)));
}

if (typeof module !== 'undefined') module.exports = { scoreJobMatch };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/score_job_match.test.js
```

Expected: `PASS tests/score_job_match.test.js` — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add background.js tests/score_job_match.test.js
git commit -m "feat: implement scoreJobMatch with TDD"
```

---

## Task 3: callGemini — TDD

**Files:**
- Create: `tests/call_gemini.test.js`
- Modify: `background.js`

- [ ] **Step 1: Write failing tests**

Create `tests/call_gemini.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/call_gemini.test.js
```

Expected: `FAIL tests/call_gemini.test.js` — `callGemini is not a function`

- [ ] **Step 3: Add callGemini to background.js**

Add this function after `scoreJobMatch` and before the `module.exports` line:

```javascript
async function callGemini(contents, tools, apiKey) {
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
```

Update `module.exports` at the bottom of `background.js`:

```javascript
if (typeof module !== 'undefined') module.exports = { scoreJobMatch, callGemini };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/call_gemini.test.js
```

Expected: `PASS tests/call_gemini.test.js` — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add background.js tests/call_gemini.test.js
git commit -m "feat: implement Gemini API call with TDD"
```

---

## Task 4: runAgentLoop — TDD

**Files:**
- Create: `tests/agent_loop.test.js`
- Modify: `background.js`

- [ ] **Step 1: Write failing tests**

Create `tests/agent_loop.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/agent_loop.test.js
```

Expected: `FAIL tests/agent_loop.test.js` — `runAgentLoop is not a function`

- [ ] **Step 3: Add runAgentLoop to background.js**

Add after `callGemini` and before `module.exports`:

```javascript
async function runAgentLoop({ contents, tools, apiKey, jobTitle, skills, onUpdate, callGeminiFn = callGemini, executeToolFn }) {
  const MAX_STEPS = 10;
  const messages = [...contents];

  for (let step = 0; step < MAX_STEPS; step++) {
    onUpdate({ text: '🤖 Agent thinking...', style: 'thinking' });

    const response = await callGeminiFn(messages, tools, apiKey);
    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error('No candidates in Gemini response');

    const parts = candidate.content.parts;
    messages.push({ role: 'model', parts });

    const functionCallParts = parts.filter(p => p.functionCall);

    if (functionCallParts.length === 0) {
      const text = parts.map(p => p.text || '').join('');
      onUpdate({ text: `🧠 ${text}`, style: 'result' });
      return;
    }

    const toolResponseParts = [];
    for (const part of functionCallParts) {
      const { name, args } = part.functionCall;
      onUpdate({ text: `🛠 Calling Tool: ${name}...`, style: 'tool' });

      const result = await executeToolFn(name, args, { jobTitle, skills });
      onUpdate({ text: `✅ Tool executed.`, style: 'success' });

      toolResponseParts.push({
        functionResponse: {
          name,
          response: { result: typeof result === 'string' ? result : JSON.stringify(result) }
        }
      });
    }

    messages.push({ role: 'user', parts: toolResponseParts });
  }

  onUpdate({ text: '⚠️ Max steps reached', style: 'warning' });
}
```

Update `module.exports`:

```javascript
if (typeof module !== 'undefined') module.exports = { scoreJobMatch, callGemini, runAgentLoop };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/agent_loop.test.js
```

Expected: `PASS tests/agent_loop.test.js` — 3 tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: `Test Suites: 3 passed` — all 10 tests pass.

- [ ] **Step 6: Commit**

```bash
git add background.js tests/agent_loop.test.js
git commit -m "feat: implement agentic loop with TDD"
```

---

## Task 5: Popup UI

**Files:**
- Modify: `popup.html`
- Modify: `popup.css`
- Modify: `popup.js`

- [ ] **Step 1: Write popup.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Job Lens</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div id="app">
    <div class="header">🔍 Job Lens</div>

    <div class="inputs">
      <input id="job-title" class="input-field" type="text" placeholder="Job title (e.g. Frontend Developer)">
      <input id="skills" class="input-field" type="text" placeholder="Skills (e.g. React, TypeScript, CSS)">
      <button id="start-btn" class="btn-primary">▶ Find Jobs on This Page</button>
    </div>

    <div id="console" class="console"></div>

    <div class="settings-bar">
      <span id="settings-toggle" class="settings-link">⚙ Settings</span>
    </div>
    <div id="settings-panel" class="settings-panel hidden">
      <input id="api-key" class="input-field" type="password" placeholder="Gemini API key">
      <button id="save-key-btn" class="btn-secondary">Save Key</button>
      <div id="key-status" class="key-status"></div>
    </div>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write popup.css**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  width: 380px;
  min-height: 480px;
  background: #0f172a;
  color: #e2e8f0;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
}

#app { display: flex; flex-direction: column; padding: 12px; gap: 10px; }

.header {
  color: #38bdf8;
  font-size: 16px;
  font-weight: 700;
  padding-bottom: 8px;
  border-bottom: 1px solid #1e293b;
}

.inputs { display: flex; flex-direction: column; gap: 6px; }

.input-field {
  width: 100%;
  padding: 7px 10px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 5px;
  color: #e2e8f0;
  font-size: 12px;
  outline: none;
}
.input-field:focus { border-color: #38bdf8; }
.input-field::placeholder { color: #475569; }

.btn-primary {
  width: 100%;
  padding: 8px;
  background: #0ea5e9;
  color: #fff;
  border: none;
  border-radius: 5px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 600;
}
.btn-primary:hover { background: #0284c7; }
.btn-primary:disabled { background: #334155; cursor: not-allowed; color: #64748b; }

.console {
  min-height: 160px;
  max-height: 220px;
  overflow-y: auto;
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 5px;
  padding: 8px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.6;
}

.log-line { display: block; word-break: break-word; }
.log-line.thinking { color: #22c55e; }
.log-line.tool     { color: #f59e0b; }
.log-line.success  { color: #94a3b8; }
.log-line.result   { color: #a78bfa; }
.log-line.error    { color: #f87171; }
.log-line.warning  { color: #fbbf24; }
.log-line.info     { color: #38bdf8; }

.settings-bar {
  border-top: 1px solid #1e293b;
  padding-top: 6px;
}
.settings-link { color: #475569; font-size: 11px; cursor: pointer; }
.settings-link:hover { color: #94a3b8; }

.settings-panel { display: flex; flex-direction: column; gap: 6px; }
.settings-panel.hidden { display: none; }

.btn-secondary {
  padding: 6px 10px;
  background: #1e293b;
  color: #94a3b8;
  border: 1px solid #334155;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}
.btn-secondary:hover { border-color: #38bdf8; color: #e2e8f0; }

.key-status { font-size: 10px; color: #64748b; }
```

- [ ] **Step 3: Write popup.js**

```javascript
const startBtn = document.getElementById('start-btn');
const jobTitleInput = document.getElementById('job-title');
const skillsInput = document.getElementById('skills');
const consoleEl = document.getElementById('console');
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const apiKeyInput = document.getElementById('api-key');
const saveKeyBtn = document.getElementById('save-key-btn');
const keyStatus = document.getElementById('key-status');

let keepaliveTimer = null;

chrome.storage.local.get(['apiKey'], ({ apiKey }) => {
  if (apiKey) {
    apiKeyInput.value = apiKey;
    keyStatus.textContent = 'Key saved ✓';
  }
});

settingsToggle.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  chrome.storage.local.set({ apiKey: key }, () => {
    keyStatus.textContent = 'Key saved ✓';
  });
});

startBtn.addEventListener('click', async () => {
  const jobTitle = jobTitleInput.value.trim();
  const skills = skillsInput.value.trim();
  if (!jobTitle) { appendLog('❌ Enter a job title first.', 'error'); return; }

  consoleEl.innerHTML = '';
  startBtn.disabled = true;
  appendLog('Starting agent...', 'info');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.runtime.sendMessage({ type: 'START_AGENT', jobTitle, skills, tabId: tab.id });

  keepaliveTimer = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'KEEPALIVE' });
  }, 25000);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AGENT_UPDATE') appendLog(msg.text, msg.style);
  if (msg.type === 'AGENT_DONE') {
    startBtn.disabled = false;
    clearInterval(keepaliveTimer);
  }
});

function appendLog(text, style = 'info') {
  const line = document.createElement('span');
  line.className = `log-line ${style}`;
  line.textContent = text;
  consoleEl.appendChild(line);
  consoleEl.appendChild(document.createElement('br'));
  consoleEl.scrollTop = consoleEl.scrollHeight;
}
```

- [ ] **Step 4: Open popup.html directly in a browser to verify layout**

Open `popup.html` as a local file (`file:///...`). Confirm:
- Dark background, "🔍 Job Lens" header visible
- Two input fields and "▶ Find Jobs on This Page" button
- Dark console area below
- "⚙ Settings" link at bottom toggles an API key input when clicked

- [ ] **Step 5: Commit**

```bash
git add popup.html popup.css popup.js
git commit -m "feat: build popup UI with console log and settings footer"
```

---

## Task 6: Wire background.js — Chrome Integration

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Add injectable tab tool functions**

Add the following two functions at the top of `background.js`, directly after the `GEMINI_TOOLS` constant and before `scoreJobMatch`. These must be fully self-contained — they cannot reference any variables outside their own scope because they are serialized and injected into the tab by `executeScript`:

```javascript
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
```

- [ ] **Step 2: Add Chrome tool dispatcher**

Add after `runAgentLoop` and before `module.exports`:

```javascript
async function chromeExecuteTool(toolName, args, { jobTitle, skills }) {
  if (toolName === 'scrape_page_content') {
    const results = await chrome.scripting.executeScript({
      target: { tabId: args._tabId },
      func: scrapePageContent
    });
    return results[0].result;
  }

  if (toolName === 'extract_job_links') {
    const results = await chrome.scripting.executeScript({
      target: { tabId: args._tabId },
      func: extractJobLinks
    });
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
```

- [ ] **Step 3: Add Chrome message listener**

Add after `chromeExecuteTool` and before `module.exports`:

```javascript
let agentTabId = null;

function broadcast(payload) {
  chrome.runtime.sendMessage(payload).catch(() => {
    // Popup may be closed — ignore the error
  });
}

async function handleStartAgent({ jobTitle, skills, tabId }) {
  agentTabId = tabId;

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
    chromeExecuteTool(name, { ...args, _tabId: agentTabId }, ctx);

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
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_AGENT') handleStartAgent(msg);
  // KEEPALIVE messages keep the service worker alive — no action needed
});
```

- [ ] **Step 4: Verify module.exports is still correct**

The last line of `background.js` must be:

```javascript
if (typeof module !== 'undefined') module.exports = { scoreJobMatch, callGemini, runAgentLoop };
```

- [ ] **Step 5: Run full test suite to confirm nothing broke**

```bash
npm test
```

Expected: `Test Suites: 3 passed` — all 10 tests pass.

- [ ] **Step 6: Commit**

```bash
git add background.js
git commit -m "feat: wire Chrome APIs, tab tools, and message listener in background.js"
```

---

## Task 7: Load in Chrome and End-to-End Test

**Files:** None modified — manual testing only.

- [ ] **Step 1: Open Chrome Extensions page**

Navigate to `chrome://extensions/`.

- [ ] **Step 2: Enable Developer Mode**

Toggle "Developer mode" on (top-right corner).

- [ ] **Step 3: Load the unpacked extension**

Click "Load unpacked" → select the `job-lens/` directory (the folder containing `manifest.json`).

Expected: "Job Lens" card appears with no errors. If there are errors, click the "Errors" button to see the details.

- [ ] **Step 4: Add the Gemini API key**

1. Click the Job Lens icon in the Chrome toolbar
2. Click "⚙ Settings"
3. Paste your Gemini API key (obtain a free key at `aistudio.google.com`)
4. Click "Save Key"

Expected: "Key saved ✓" appears below the input.

- [ ] **Step 5: Navigate to a job board**

Open `https://news.ycombinator.com/jobs` in the same Chrome window.

- [ ] **Step 6: Run the agent**

1. Click the Job Lens icon
2. Enter: Job title = `Software Engineer`, Skills = `JavaScript, React, Node.js`
3. Click "▶ Find Jobs on This Page"

Expected console output (order may vary):
```
Starting agent...
🤖 Agent thinking...
🛠 Calling Tool: scrape_page_content...
✅ Tool executed.
🤖 Agent thinking...
🛠 Calling Tool: extract_job_links...
✅ Tool executed.
🤖 Agent thinking...
🛠 Calling Tool: score_job_match...
✅ Tool executed.
🧠 Here are the top matching jobs I found: ...
```

- [ ] **Step 7: Capture the messages log for submission**

Open `chrome://extensions/` → find Job Lens → click "service worker" link to open DevTools for background.js.

Add `console.log(JSON.stringify(messages, null, 2))` at the end of `handleStartAgent` (before `broadcast({ type: 'AGENT_DONE' })`), reload the extension (`chrome://extensions/` → refresh icon), run the agent again, and copy the full messages log from the DevTools console.

- [ ] **Step 8: Remove debug log and commit**

Remove the `console.log` line added in Step 7, then:

```bash
git add background.js
git commit -m "chore: remove debug log — extension ready for demo"
```

---

## Submission Checklist

- [ ] Multi-step LLM loop running end-to-end (Query → Response → Tool → Result → Loop)
- [ ] Full `messages[]` history passed on every Gemini call (visible in logged output)
- [ ] Live reasoning chain displayed in popup console
- [ ] 3 custom tools implemented and called by the agent
- [ ] Screen recording captured for YouTube upload
- [ ] Raw `messages[]` JSON log copied for submission
