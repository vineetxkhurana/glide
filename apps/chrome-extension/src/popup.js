// Glide Chrome Extension — Popup Script

const enabledToggle = document.getElementById('enabled');
const modeButtons = document.querySelectorAll('.mode-btn');
const intensityRow = document.getElementById('intensityRow');
const intensitySlider = document.getElementById('intensity');
const intensityValue = document.getElementById('intensityValue');
const statusEl = document.getElementById('status');

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;
  if (type === 'success') {
    setTimeout(() => {
      statusEl.className = 'status';
    }, 3000);
  }
}

// Load saved settings
chrome.storage.sync.get(['enabled', 'mode', 'intensity'], (result) => {
  enabledToggle.checked = result.enabled === true;
  intensitySlider.value = result.intensity || 0.5;
  intensityValue.textContent = result.intensity || 0.5;

  const activeMode = result.mode || 'focus';
  modeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === activeMode);
  });
  intensityRow.classList.toggle('disabled', activeMode === 'calm');
});

// Listen for processing status from background
chrome.storage.onChanged.addListener((changes) => {
  if (changes.lastError) {
    const err = changes.lastError.newValue;
    if (err) showStatus(err, 'error');
  }
  if (changes.lastSuccess) {
    const msg = changes.lastSuccess.newValue;
    if (msg) showStatus(msg, 'success');
  }
});

// Check for recent error on popup open
chrome.storage.local.get(['lastError'], (result) => {
  if (result.lastError) showStatus(result.lastError, 'error');
});

// Toggle
enabledToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: enabledToggle.checked });
  chrome.storage.local.remove(['lastError']);
  statusEl.className = 'status';
});

// Mode
modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    modeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.mode;
    chrome.storage.sync.set({ mode });
    intensityRow.classList.toggle('disabled', mode === 'calm');
  });
});

// Intensity
intensitySlider.addEventListener('input', () => {
  const val = parseFloat(intensitySlider.value);
  intensityValue.textContent = val;
  chrome.storage.sync.set({ intensity: val });
});
