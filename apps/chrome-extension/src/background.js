// Glide Chrome Extension — Background Service Worker

const API_URL = 'https://glide-api-worker.glide-bionic.workers.dev'

// Badge icon state
function updateBadge(enabled) {
  const text = enabled ? 'ON' : ''
  const color = enabled ? '#1d4ed8' : '#9ca3af'
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color })
}

// Set default settings on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    enabled: false,
    mode: 'focus',
    intensity: 0.5
  })
  updateBadge(false)
})

// Keep badge in sync when settings change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled !== undefined) {
    updateBadge(changes.enabled.newValue === true)
  }
})

// Restore badge state on service worker wake
chrome.storage.sync.get(['enabled'], (result) => {
  updateBadge(result.enabled === true)
})

// Keyboard shortcut — Alt+G opens popup, but _execute_action
// only opens the popup. To also toggle, listen for the command:
chrome.commands.onCommand.addListener((command) => {
  if (command === '_execute_action') {
    chrome.storage.sync.get(['enabled'], (result) => {
      const newState = !result.enabled
      chrome.storage.sync.set({ enabled: newState })
      updateBadge(newState)
    })
  }
})

// Proxy API calls from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'process') return

  fetch(`${API_URL}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message.payload)
  })
    .then(r => {
      if (!r.ok) {
        if (r.status === 429) {
          chrome.storage.local.set({ lastError: 'Rate limit reached. Wait a minute.' })
        } else {
          chrome.storage.local.set({ lastError: `API error (${r.status})` })
        }
        throw new Error(`${r.status}`)
      }
      return r.json()
    })
    .then(data => {
      chrome.storage.local.remove(['lastError'])
      chrome.storage.local.set({ lastSuccess: `Processing complete` })
      sendResponse({ ok: true, data })
    })
    .catch(err => {
      if (err.message === 'Failed to fetch') {
        chrome.storage.local.set({ lastError: 'Cannot reach API. Check your connection.' })
      }
      sendResponse({ ok: false, error: err.message })
    })

  return true
})
