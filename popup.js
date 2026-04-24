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

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found. Navigate to a job board first.');
    chrome.runtime.sendMessage({ type: 'START_AGENT', jobTitle, skills, tabId: tab.id });
    keepaliveTimer = setInterval(() => {
      chrome.runtime.sendMessage({ type: 'KEEPALIVE' });
    }, 25000);
  } catch (err) {
    appendLog(`❌ ${err.message}`, 'error');
    startBtn.disabled = false;
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AGENT_UPDATE') appendLog(msg.text, msg.style);
  if (msg.type === 'AGENT_DONE') {
    startBtn.disabled = false;
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
});

const VALID_STYLES = new Set(['thinking', 'tool', 'success', 'result', 'error', 'warning', 'info']);

function appendLog(text, style = 'info') {
  const safeStyle = VALID_STYLES.has(style) ? style : 'info';
  const line = document.createElement('span');
  line.className = `log-line ${safeStyle}`;
  line.textContent = text;
  consoleEl.appendChild(line);
  consoleEl.appendChild(document.createElement('br'));
  consoleEl.scrollTop = consoleEl.scrollHeight;
}
