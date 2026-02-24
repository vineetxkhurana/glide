const API_URL = 'https://glide-api-worker.glide-bionic.workers.dev';

let uploadedText = '';
let processedText = '';
let fileName = '';
let selectedMode = 'focus';

const modeDescriptions = {
  focus: 'High-emphasis subtitles for deep focus',
  calm: 'Gentle anchors for low-fatigue viewing',
};

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileNameEl = document.getElementById('fileName');
const fileSizeEl = document.getElementById('fileSize');
const modeButtons = document.querySelectorAll('.mode-btn');
const modeDescription = document.getElementById('modeDescription');
const intensityControl = document.getElementById('intensityControl');
const intensityLabel = document.getElementById('intensityLabel');
const intensitySlider = document.getElementById('intensity');
const intensityValue = document.getElementById('intensityValue');
const licenseKeyInput = document.getElementById('licenseKey');
const processBtn = document.getElementById('processBtn');
const errorEl = document.getElementById('error');
const resultEl = document.getElementById('result');
const downloadBtn = document.getElementById('downloadBtn');
const processAnotherBtn = document.getElementById('processAnother');

// File upload
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) handleFile(e.target.files[0]);
});

function handleFile(file) {
  if (!file) return;

  if (!file.name.endsWith('.srt') && !file.name.endsWith('.vtt') && !file.name.endsWith('.ass')) {
    showError('Please upload a .srt, .vtt, or .ass file');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showError('File size must be under 5MB');
    return;
  }

  if (window.plausible) window.plausible('upload_started');

  fileName = file.name;
  const reader = new FileReader();

  reader.onload = function (e) {
    uploadedText = e.target.result;
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatFileSize(file.size);
    fileInfo.classList.add('visible');
    processBtn.disabled = false;
    errorEl.classList.remove('visible');
    resultEl.classList.remove('visible');
  };

  reader.onerror = function () {
    showError('Failed to read file');
  };

  reader.readAsText(file);
}

// Mode selection
modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    modeButtons.forEach((b) => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    selectedMode = mode;
    modeDescription.textContent = modeDescriptions[mode];

    if (mode === 'calm') {
      intensityControl.classList.add('disabled');
      intensityLabel.textContent = 'Intensity (Fixed in Calm mode)';
    } else {
      intensityControl.classList.remove('disabled');
      intensityLabel.textContent = 'Intensity';
    }
  });
});

// Intensity slider
intensitySlider.addEventListener('input', () => {
  intensityValue.textContent = intensitySlider.value;
});

// Process
processBtn.addEventListener('click', async () => {
  if (!uploadedText) return;

  if (window.plausible) window.plausible('process_clicked');

  processBtn.disabled = true;
  processBtn.textContent = 'Processing...';
  errorEl.classList.remove('visible');

  try {
    let format = 'srt';
    if (fileName.endsWith('.vtt')) format = 'vtt';
    if (fileName.endsWith('.ass')) format = 'ass';

    const intensity = selectedMode === 'focus' ? parseFloat(intensitySlider.value) : 0.5;
    const licenseKey = licenseKeyInput.value.trim() || null;

    const response = await fetch(`${API_URL}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: uploadedText,
        format,
        mode: selectedMode,
        intensity,
        licenseKey,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    processedText = data.processedText || '';

    if (!processedText) {
      throw new Error('No processed text returned from server');
    }

    if (data.truncated) {
      showError(
        '⚠️ Free tier: Only first 300 subtitle entries processed. Enter your license key to unlock unlimited processing.',
      );
    } else if (licenseKey) {
      if (window.plausible) window.plausible('license_used');
    }

    resultEl.classList.add('visible');
    processBtn.textContent = 'Process captions';
  } catch (error) {
    showError(`Error: ${error.message}`);
    processBtn.disabled = false;
    processBtn.textContent = 'Process captions';
  }
});

// Download
downloadBtn.addEventListener('click', () => {
  if (!processedText) return;

  const blob = new Blob([processedText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ext = fileName.split('.').pop();
  const baseName = fileName.replace(/\.[^/.]+$/, '');

  a.download = `${baseName}_glide.${ext}`;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Process another
processAnotherBtn.addEventListener('click', () => {
  resultEl.classList.remove('visible');
  fileInfo.classList.remove('visible');
  errorEl.classList.remove('visible');
  processBtn.disabled = false;
  uploadedText = '';
  processedText = '';
  fileName = '';
  fileInput.value = '';
});

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.add('visible');
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Checkout tracking
document.querySelectorAll('a[href*="lemonsqueezy"]').forEach((link) => {
  link.addEventListener('click', () => {
    if (window.plausible) window.plausible('checkout_clicked');
  });
});
