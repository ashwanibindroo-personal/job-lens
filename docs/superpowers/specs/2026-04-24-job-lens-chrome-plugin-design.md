# Job Lens — Agentic AI Chrome Extension Design

**Date:** 2026-04-24
**Status:** Approved

---

## Overview

A Chrome Extension (Manifest V3) that runs a multi-step agentic AI loop to find and score relevant job listings on whatever job board the user is currently visiting. The agent uses Google Gemini 2.0 Flash as its LLM, executes 3 custom tools, maintains full conversational memory, and streams its reasoning chain live into a console-style popup UI.

---

## Stack & Decisions

| Decision | Choice | Reason |
|---|---|---|
| LLM | Google Gemini 2.0 Flash | Free tier available, strong tool-use support |
| API key storage | `chrome.storage.local` | Pure extension, no backend required |
| Agentic loop location | `background.js` (service worker) | Proper MV3 separation; survives popup close |
| Target job boards | Any page | Flexible; no brittle site-specific selectors |
| Job match input | Job title + skills list | Richer than title-only, simpler than full resume |

---

## File Structure

```
job-lens/
├── manifest.json       # MV3, permissions: activeTab, scripting, storage
├── popup.html          # Extension UI shell
├── popup.css           # Dark console-style theme
├── popup.js            # UI logic: sends START_AGENT, receives AGENT_UPDATE messages
└── background.js       # Service worker: Gemini API calls, agentic loop, all 3 tools
```

`scrape_page_content` and `extract_job_links` are defined as named functions in `background.js` and injected into the active tab at call time via `chrome.scripting.executeScript({ func: scrapePageContent })`. `score_job_match` runs directly in the service worker — no injection needed.

---

## UI Layout (Option C — Settings Footer)

- **Header:** "🔍 Job Lens" title
- **Inputs:** Job Title field + Skills field (stacked)
- **CTA:** "▶ Find Jobs on This Page" button
- **Console log:** Scrollable dark terminal area displaying live agent reasoning
- **Settings footer:** Expandable section (toggle via "⚙ Settings" link) for API key entry (masked input), stored to `chrome.storage.local` on save

Console log line format:
```
🤖 Agent thinking...
🛠 Calling Tool: scrape_page_content...
✅ Tool executed. Found 24 nodes.
🧠 LLM: Here are the 3 most relevant jobs...
❌ Error messages in red
```

---

## Agentic Loop (background.js)

```
popup.js  →  START_AGENT { jobTitle, skills }
               ↓
         Initialize messages[]
         [ { role: "system", content: "..." },
           { role: "user",   content: "Find {jobTitle} jobs, skills: {skills}" } ]
               ↓
         ┌─────────────────────────────┐
         │         LOOP (max 10)       │
         │  POST messages[] + tools    │
         │  to Gemini API              │
         │          ↓                  │
         │   Text response?  ──────────┼──→ Append to messages, post to popup → DONE
         │          ↓                  │
         │   Tool call?                │
         │   - Post tool name to popup │
         │   - executeScript in tab    │
         │   - Append tool result      │
         │   - Loop ↑                  │
         └─────────────────────────────┘
               ↓
         Final answer → popup console
```

**Memory:** Full `messages[]` array is passed on every Gemini call — satisfies the "ALL past interactions" requirement.

**Keepalive:** `popup.js` pings `chrome.runtime.sendMessage` every 25s while the agent is running to prevent service worker termination.

---

## Tools

### `scrape_page_content()`
- **Where:** Injected into active tab via `chrome.scripting.executeScript({ func: scrapePageContent })`
- **Returns:** `document.body.innerText` trimmed to 8,000 chars
- **Parameters:** None

### `extract_job_links()`
- **Where:** Injected into active tab via `chrome.scripting.executeScript({ func: extractJobLinks })`
- **Logic:** Queries all `<a>` tags, filters by href or text containing: `job`, `career`, `position`, `role`, `apply`, `opening`
- **Returns:** Array of `{ text, href }`, capped at 50 items

### `score_job_match({ jobDescription, jobTitle, skills })`
- **Where:** Runs directly in service worker (`background.js`) — no DOM access needed
- **Parameters:** Gemini passes `jobDescription` (scraped text snippet), `jobTitle`, `skills` (comma-separated string)
- **Logic:** Tokenises skills string, counts keyword hits in `jobDescription`, adds bonus if `jobTitle` words appear
- **Returns:** Integer 1–10

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| API key missing | `❌ API key not set. Enter it in Settings.` — loop aborted |
| Gemini API error | `❌ API error: {status} {message}` — loop aborted |
| Tool execution failure | `{ error: "..." }` appended as tool result — Gemini can self-correct |
| Loop exceeds 10 iterations | `⚠️ Max steps reached` — loop aborted |

---

## manifest.json Permissions

```json
{
  "manifest_version": 3,
  "permissions": ["activeTab", "scripting", "storage"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html" }
}
```

---

## Submission Checklist (from assignment)

- [ ] Multi-step LLM loop (Query → Response → Tool → Result → Loop)
- [ ] Full message history passed on every call
- [ ] Live reasoning chain visible in UI
- [ ] 3 custom tools implemented
- [ ] YouTube demo recorded
- [ ] Raw `messages[]` JSON log captured and submitted
