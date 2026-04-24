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

if (typeof module !== 'undefined') module.exports = { scoreJobMatch, callGemini };
