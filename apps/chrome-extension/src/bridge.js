// Glide Bridge — runs in ISOLATED world
// Has chrome.* APIs, relays between MAIN world and background worker

let enabled = false
let mode = 'focus'
let intensity = 0.5

// Load settings and broadcast to MAIN world
chrome.storage.sync.get(['enabled', 'mode', 'intensity'], (result) => {
  enabled = result.enabled === true
  mode = result.mode || 'focus'
  intensity = result.intensity || 0.5
  window.dispatchEvent(new CustomEvent('glide-settings', {
    detail: JSON.stringify({ enabled, mode, intensity })
  }))
})

chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) enabled = changes.enabled.newValue === true
  if (changes.mode) mode = changes.mode.newValue
  if (changes.intensity) intensity = changes.intensity.newValue
  window.dispatchEvent(new CustomEvent('glide-settings', {
    detail: JSON.stringify({ enabled, mode, intensity })
  }))
})

// Send message with retry — first attempt wakes up sleeping service worker
function sendWithRetry(message, maxRetries = 3) {
  return new Promise((resolve) => {
    let attempts = 0

    function attempt() {
      attempts++
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            if (attempts < maxRetries) {
              // Wait a bit for service worker to wake up, then retry
              setTimeout(attempt, 500)
            } else {
              resolve({ ok: false, error: chrome.runtime.lastError.message })
            }
          } else {
            resolve(response || { ok: false, error: 'empty response' })
          }
        })
      } catch (err) {
        if (attempts < maxRetries) {
          setTimeout(attempt, 500)
        } else {
          resolve({ ok: false, error: err.message })
        }
      }
    }

    attempt()
  })
}

// Listen for caption data from MAIN world, proxy to background worker
window.addEventListener('glide-process', async (e) => {
  let payload
  try { payload = JSON.parse(e.detail) } catch { return }

  const response = await sendWithRetry({ type: 'process', payload })

  window.dispatchEvent(new CustomEvent('glide-result', {
    detail: JSON.stringify(response)
  }))
})
