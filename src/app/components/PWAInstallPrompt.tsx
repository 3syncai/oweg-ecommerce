'use client'

import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export default function PWAInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBip as EventListener)
    return () => window.removeEventListener('beforeinstallprompt', onBip as EventListener)
  }, [])

  if (!visible || !deferred) return null

  const handleInstall = async () => {
    try {
      await deferred.prompt()
      await deferred.userChoice
    } finally {
      setVisible(false)
      setDeferred(null)
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-xl border bg-white/80 backdrop-blur-md shadow-lg w-[95%] max-w-md">
      <div className="p-4 flex items-center gap-3">
        <div className="size-10 rounded-lg bg-black text-white grid place-items-center font-bold">OW</div>
        <div className="flex-1">
          <p className="text-sm font-semibold">Install OWEG App</p>
          <p className="text-xs text-gray-600">Faster access and offline support</p>
        </div>
        <button
          onClick={handleInstall}
          className="px-3 py-1.5 rounded-md bg-black text-white text-sm hover:bg-gray-900"
        >
          Install
        </button>
        <button
          aria-label="Dismiss"
          onClick={() => setVisible(false)}
          className="ml-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

