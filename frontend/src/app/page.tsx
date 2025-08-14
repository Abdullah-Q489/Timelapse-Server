// page.tsx
'use client'
import { useEffect, useRef, useState } from 'react'

const AHP = process.env.NEXT_PUBLIC_AHP_SERVER ?? 'http://localhost:8001'
const WS_URL = `${AHP.replace(/^http/, 'ws')}/ws/updates`

// --- singleton guards (module scope) ---
let wsSingleton: WebSocket | null = null
let reconnectTimerSingleton: ReturnType<typeof setTimeout> | null = null
let fallbackTimerSingleton: ReturnType<typeof setInterval> | null = null
let startedSingleton = false

export default function Home() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageTimestamp, setImageTimestamp] = useState<string | null>(null)
  const lastUrlRef = useRef<string>('')

  const applyImage = (relUrl: string) => {
    const fullUrl = `${AHP}${relUrl}`
    lastUrlRef.current = fullUrl
    setImageUrl(`${fullUrl}?t=${Date.now()}`)

    const match = relUrl.match(/(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})\.jpg/)
    if (match) {
      const [_, dd, mm, yyyy, hh, min, ss] = match
      setImageTimestamp(`${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`)
    } else {
      setImageTimestamp(null)
    }
  }

  const fetchLatestImage = () => {
    fetch(`${AHP}/latest-image`, { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        const rel = data?.url as string | undefined
        if (!rel) return
        const fullUrl = `${AHP}${rel}`
        if (fullUrl !== lastUrlRef.current) applyImage(rel)
      })
      .catch(err => console.error('Failed to fetch image:', err))
  }

  useEffect(() => {
    if (startedSingleton) return
    startedSingleton = true

    // 1) Initial fill
    fetchLatestImage()

    // 2) WebSocket
    const connect = () => {
      wsSingleton = new WebSocket(WS_URL)

      wsSingleton.onopen = () => console.log('[WS] connected')
      wsSingleton.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg?.type === 'new_image' && msg?.url) applyImage(msg.url)
        } catch { /* ignore */ }
      }
      wsSingleton.onclose = () => {
        if (reconnectTimerSingleton) clearTimeout(reconnectTimerSingleton)
        reconnectTimerSingleton = setTimeout(connect, 5000)
      }
      wsSingleton.onerror = () => { try { wsSingleton?.close() } catch {} }
    }
    connect()

    // 3) Slow fallback polling (every 2 min)
    if (!fallbackTimerSingleton) {
      fallbackTimerSingleton = setInterval(fetchLatestImage, 120_000)
    }

    // Cleanup on full page unload only (we keep singleton between remounts)
    return () => {
      // do NOT reset startedSingleton here; StrictMode would double-start again
    }
  }, [])

  return (
    <main className="min-h-screen bg-gray-100 px-6 py-6 font-mono text-sm text-black">
      <div className="flex flex-col items-center gap-4">
        {imageUrl ? (
          <>
            <img src={imageUrl} alt="Latest" className="max-h-[80vh] rounded shadow" />
            <div className="text-gray-700">
              Image captured at: {imageTimestamp || 'Unknown'}
            </div>
          </>
        ) : (
          <p className="text-gray-500">No image available</p>
        )}
      </div>
    </main>
  )
}
