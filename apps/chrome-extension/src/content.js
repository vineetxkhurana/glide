// Glide Chrome Extension — Content Script (MAIN world)
// Runs in page context: can patch XHR, no chrome.* APIs.
// Communicates with bridge.js (ISOLATED world) via CustomEvents.

let enabled = false
let mode = 'focus'
let intensity = 0.5
let observer = null
let wordMap = new Map()
let processingPromise = null
let charDebounce = new WeakMap()
let captionLines = [] // store raw intercepted lines for re-processing

// --- Settings from bridge.js ---
window.addEventListener('glide-settings', (e) => {
  try {
    const s = JSON.parse(e.detail)
    const wasEnabled = enabled
    const modeChanged = mode !== s.mode
    const intensityChanged = intensity !== s.intensity
    enabled = s.enabled
    mode = s.mode
    intensity = s.intensity

    if (!enabled) {
      restoreAll()
      stopObserving()
    } else if (!wasEnabled) {
      wordMap.clear()
      captionLines = []
      interceptCaptions()
      startObserving()
    } else if (modeChanged || intensityChanged) {
      // Re-process with new settings using stored caption lines
      wordMap.clear()
      restoreAll()
      if (captionLines.length > 0) {
        bulkProcess(captionLines)
      }
    }
  } catch {}
})

// --- Intercept YouTube's timedtext XHR ---
const origOpen = XMLHttpRequest.prototype.open
const origSend = XMLHttpRequest.prototype.send

XMLHttpRequest.prototype.open = function (method, url) {
  this._glideUrl = typeof url === 'string' ? url : ''
  return origOpen.apply(this, arguments)
}

XMLHttpRequest.prototype.send = function () {
  if (this._glideUrl && this._glideUrl.includes('timedtext')) {
    this.addEventListener('load', function () {
      try {
        const data = JSON.parse(this.responseText)
        if (data && data.events) {
          const lines = []
          for (const event of data.events) {
            if (!event.segs) continue
            const text = event.segs.map(s => s.utf8 || '').join('')
            if (text.trim()) lines.push(text.trim())
          }
          if (lines.length > 0) {
            captionLines = lines
            if (enabled) bulkProcess(lines)
          }
        }
      } catch {}
    })
  }
  return origSend.apply(this, arguments)
}

// --- Bulk process all lines via bridge → background → API ---

function buildWordMap(originalLines, processedLines) {
  for (let i = 0; i < originalLines.length && i < processedLines.length; i++) {
    const origWords = originalLines[i].split(/(\s+)/)
    const procWords = processedLines[i].split(/(\s+)/)

    for (let j = 0; j < origWords.length && j < procWords.length; j++) {
      const ow = origWords[j]
      const pw = procWords[j]
      if (ow.trim() && ow !== pw) {
        wordMap.set(ow, pw)
      }
    }
  }
}

function processTextFromMap(text) {
  if (wordMap.size === 0) return null
  const parts = text.split(/(\s+)/)
  let changed = false
  const result = parts.map(part => {
    if (!part.trim()) return part
    let processed = wordMap.get(part)
    if (processed) { changed = true; return processed }
    const punctMatch = part.match(/^(.+?)([.,!?;:'"]+)$/)
    if (punctMatch) {
      processed = wordMap.get(punctMatch[1])
      if (processed) { changed = true; return processed + punctMatch[2] }
    }
    return part
  })
  return changed ? result.join('') : null
}

function bulkProcess(lines) {
  if (!enabled) return

  const bulkText = lines.join('\n')

  processingPromise = new Promise((resolve) => {
    const handler = (e) => {
      window.removeEventListener('glide-result', handler)
      try {
        const response = JSON.parse(e.detail)
        if (response?.ok && response.data?.processedText) {
          const processedLines = response.data.processedText.split('\n')
          buildWordMap(lines, processedLines)
          processAllCurrent()
        }
      } catch {}
      resolve()
    }

    window.addEventListener('glide-result', handler)

    window.dispatchEvent(new CustomEvent('glide-process', {
      detail: JSON.stringify({
        text: bulkText,
        format: 'plain',
        mode,
        intensity,
        emphasisMode: 'html'
      })
    }))

    setTimeout(() => {
      window.removeEventListener('glide-result', handler)
      resolve()
    }, 15000)
  })
}

// --- Trigger captions reload for already-loaded subs ---
function interceptCaptions() {
  const btn = document.querySelector('.ytp-subtitles-button')
  if (btn && btn.getAttribute('aria-pressed') === 'true') {
    // Use YouTube's internal API to reload captions without visible flicker
    const player = document.getElementById('movie_player')
    if (player && player.getOption && player.setOption) {
      try {
        const track = player.getOption('captions', 'track')
        player.setOption('captions', 'track', {})
        setTimeout(() => player.setOption('captions', 'track', track), 100)
        return
      } catch {}
    }
    // Fallback: toggle button
    btn.click()
    setTimeout(() => btn.click(), 300)
  }
}

// --- DOM: swap captions using word map ---

function processSegment(segment) {
  const text = segment.textContent
  if (!text || text.trim().length < 2) return

  if (segment.dataset.glideProcessed && segment.dataset.glideLastText === text) return

  const processed = processTextFromMap(text)
  if (processed) {
    if (observer) observer.disconnect()

    segment.dataset.glideOriginal = text
    segment.dataset.glideProcessed = 'true'
    segment.dataset.glideLastText = text
    segment.classList.add('glide-processed')

    // Build DOM nodes manually to bypass Trusted Types
    while (segment.firstChild) segment.removeChild(segment.firstChild)
    const htmlParts = processed.split(/(<b>.*?<\/b>)/g)
    for (const part of htmlParts) {
      const boldMatch = part.match(/^<b>(.*?)<\/b>$/)
      if (boldMatch) {
        const b = document.createElement('b')
        b.textContent = boldMatch[1]
        segment.appendChild(b)
      } else if (part) {
        segment.appendChild(document.createTextNode(part))
      }
    }

    if (observer) {
      const player = document.querySelector('#movie_player')
      if (player) observer.observe(player, { childList: true, subtree: true, characterData: true })
    }
  }
}

function processAllCurrent() {
  if (!enabled) return
  document.querySelectorAll('.ytp-caption-segment').forEach(processSegment)
}

function restoreAll() {
  if (observer) observer.disconnect()
  document.querySelectorAll('[data-glide-processed]').forEach(el => {
    if (el.dataset.glideOriginal) el.textContent = el.dataset.glideOriginal
    el.classList.remove('glide-processed')
    delete el.dataset.glideProcessed
    delete el.dataset.glideOriginal
    delete el.dataset.glideLastText
  })
  wordMap.clear()
  const player = document.querySelector('#movie_player')
  if (observer && player) observer.observe(player, { childList: true, subtree: true, characterData: true })
}

function handleMutations(mutations) {
  if (!enabled || wordMap.size === 0) return

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue
      if (node.classList?.contains('ytp-caption-segment')) {
        processSegment(node)
      } else if (node.querySelectorAll) {
        node.querySelectorAll('.ytp-caption-segment').forEach(processSegment)
      }
    }

    if (mutation.type === 'characterData') {
      const parent = mutation.target.parentElement
      if (parent?.classList?.contains('ytp-caption-segment')) {
        const existing = charDebounce.get(parent)
        if (existing) clearTimeout(existing)
        charDebounce.set(parent, setTimeout(() => {
          charDebounce.delete(parent)
          processSegment(parent)
        }, 30))
      }
    }

    if (mutation.type === 'childList' && mutation.target.classList?.contains('ytp-caption-segment')) {
      processSegment(mutation.target)
    }
  }
}

function startObserving() {
  if (observer) return

  const check = setInterval(() => {
    const player = document.querySelector('#movie_player')
    if (!player) return
    clearInterval(check)

    observer = new MutationObserver(handleMutations)
    observer.observe(player, { childList: true, subtree: true, characterData: true })
    processAllCurrent()
  }, 500)

  startObserving._interval = check
}

function stopObserving() {
  if (startObserving._interval) { clearInterval(startObserving._interval); startObserving._interval = null }
  if (observer) { observer.disconnect(); observer = null }
}

// YouTube SPA navigation
let lastUrl = location.href
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href
    stopObserving()
    restoreAll()
    captionLines = []
    if (enabled) startObserving()
  }
}).observe(document.documentElement, { childList: true, subtree: true })