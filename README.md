# Job Lens — Agentic AI Chrome Extension

A Chrome Extension that runs a multi-step AI agent powered by **Claude Opus 4.7** (Anthropic) to find and score relevant job listings on any job board you're visiting.

---

## How It Works

The extension embeds a full **agentic loop** inside the browser. When you click "Find Jobs on This Page", the background service worker:

1. Sends your job title and skills to Claude along with a set of tools
2. Claude decides which tools to call (scraping, link extraction, scoring)
3. Each tool result is fed back into Claude's context
4. The loop repeats until Claude produces a final answer
5. Every step of the agent's reasoning is streamed live into the popup console

```
User Input (Job Title + Skills)
        │
        ▼
┌───────────────────────┐
│   Claude Opus 4.7     │  ◄── Full message history on every call
│   (Agentic Loop)      │
└──────────┬────────────┘
           │  Tool Calls
    ┌──────┼──────────────────┐
    │      │                  │
    ▼      ▼                  ▼
scrape_ extract_        score_job_
page_   job_links       match
content (DOM scan)      (local scoring)
(tab text)
    │      │                  │
    └──────┴──────────────────┘
           │  Tool Results
           ▼
┌───────────────────────┐
│   Claude Opus 4.7     │  Produces final ranked list
└───────────────────────┘
           │
           ▼
    Popup Console UI
```

---

## Features

| Feature | Detail |
|---|---|
| **Multi-step reasoning** | Claude loops until it has enough information to answer |
| **Full memory** | Every past message (tool calls + results) is passed on every API call |
| **Live reasoning UI** | Each tool call and LLM response is streamed to the popup console |
| **3 custom tools** | `scrape_page_content`, `extract_job_links`, `score_job_match` |
| **Works on any job board** | LinkedIn, HackerNews Jobs, Greenhouse, Lever, Workday, etc. |

---

## Architecture

```
job-lens/
├── manifest.json        # Chrome MV3 config — permissions: scripting, storage, tabs
├── background.js        # Service worker: Claude API, agentic loop, tool dispatch
├── popup.html           # Extension popup shell
├── popup.css            # Dark console-style theme
├── popup.js             # UI: sends START_AGENT, receives AGENT_UPDATE stream
└── tests/
    ├── setup.js              # Global Chrome API + fetch mocks for Jest
    ├── score_job_match.test.js
    ├── call_gemini.test.js   # Tests callClaude (file name kept from original)
    └── agent_loop.test.js
```

### Message Flow

```
popup.js                    background.js (service worker)
   │                                │
   │── START_AGENT {jobTitle,       │
   │   skills, tabId} ────────────► │
   │                                │── callClaude(messages, tools)
   │                                │      │
   │                                │◄─────┘ response
   │                                │
   │                                │── chrome.scripting.executeScript()
   │                                │      (inject scrapePageContent into tab)
   │                                │
   │◄── AGENT_UPDATE {text, style} ─│  (streamed for each step)
   │◄── AGENT_UPDATE ...            │
   │◄── AGENT_DONE ─────────────────│
```

---

## The Three Custom Tools

### 1. `scrape_page_content`
Injects a function into the active tab via `chrome.scripting.executeScript` and returns up to 8,000 characters of visible text from `document.body.innerText`.

### 2. `extract_job_links`
Injects a DOM scanner that finds `<a>` tags whose `href` or text contains job-related keywords (`job`, `career`, `apply`, `hiring`, etc.) and returns up to 50 matching links with their text and URLs.

### 3. `score_job_match`
Runs locally in the service worker. Tokenises the job title and skills list, counts keyword matches in the job description using word-boundary regex, and returns a relevance score from **1–10**.

---

## The Agentic Loop

```javascript
// Simplified view of runAgentLoop in background.js
for (let step = 0; step < MAX_STEPS; step++) {
  const response = await callClaude(messages, tools, apiKey);

  messages.push({ role: 'assistant', content: response.content });

  if (response.stop_reason === 'end_turn') return; // done

  // Execute each tool_use block Claude requested
  for (const block of response.content.filter(b => b.type === 'tool_use')) {
    const result = await executeToolFn(block.name, block.input, ctx);
    toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
  }

  messages.push({ role: 'user', content: toolResults }); // loop
}
```

Claude sees the **full message history** on every API call — this is the memory retention that allows multi-turn reasoning without losing context.

---

## Installation

### Prerequisites
- Google Chrome (or any Chromium browser)
- An [Anthropic API key](https://console.anthropic.com/) (free tier available)

### Steps

1. **Clone the repo**
   ```bash
   git clone https://github.com/ashwanibindroo-personal/job-lens.git
   cd job-lens
   ```

2. **Load the extension**
   - Open `chrome://extensions/`
   - Enable **Developer mode** (top-right toggle)
   - Click **Load unpacked** → select the `job-lens/` folder
   - "Job Lens" should appear in your extensions list

3. **Add your API key**
   - Click the Job Lens icon in the Chrome toolbar
   - Click **⚙ Settings** at the bottom
   - Paste your Anthropic API key
   - Click **Save Key** — you should see "Key saved ✓"

4. **Run the agent**
   - Navigate to any job board (e.g. `https://news.ycombinator.com/jobs`)
   - Click the Job Lens icon
   - Enter a job title (e.g. `Software Engineer`)
   - Enter your skills (e.g. `JavaScript, React, Node.js`)
   - Click **▶ Find Jobs on This Page**

---

## Example Console Output

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
🧠 Here are the top 3 matching jobs I found:

1. Senior Software Engineer – Stripe (Score: 9/10)
   https://stripe.com/jobs/listing/senior-engineer

2. Full Stack Engineer – Vercel (Score: 8/10)
   https://vercel.com/careers/full-stack-engineer

3. Node.js Backend Engineer – Shopify (Score: 7/10)
   https://shopify.com/careers/backend-engineer
```

---

## Development

### Run tests
```bash
npm install
npm test
```

All 15 unit tests cover `scoreJobMatch`, `callClaude`, and `runAgentLoop`.

### Tech stack
- **Vanilla JavaScript** (ES2020, no build step)
- **Chrome Extension Manifest V3**
- **Anthropic Claude API** — `claude-opus-4-7` via raw `fetch`
- **Jest 29** for unit tests

---

## Privacy

- Your Anthropic API key is stored locally in `chrome.storage.local` and never sent anywhere except `api.anthropic.com`.
- Page content is sent to the Anthropic API only when you click "Find Jobs on This Page".
- No data is stored between sessions.

---

## License

MIT
