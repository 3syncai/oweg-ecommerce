'use client'

import { useSyncExternalStore } from 'react'

const displayQuery = '(display-mode: standalone), (display-mode: fullscreen)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(displayQuery)
  media.addEventListener('change', onChange)
  window.addEventListener('pageshow', onChange)
  return () => {
    media.removeEventListener('change', onChange)
    window.removeEventListener('pageshow', onChange)
  }
}

function snapshot() {
  return window.matchMedia(displayQuery).matches ||
    ('standalone' in window.navigator && window.navigator.standalone === true)
}

export function useStandaloneDisplay() {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
