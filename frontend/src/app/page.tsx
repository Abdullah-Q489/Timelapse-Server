// app/page.tsx
'use client'
import { useEffect, useRef, useState } from 'react'

const AHP = process.env.NEXT_PUBLIC_AHP_SERVER ?? 'http://localhost:8001'
const WS_URL = `${AHP.replace(/^http/, 'ws')}/ws/updates`

// --- singleton guards (module scope) ---
let wsSingleton: WebSocket | null = null
let reconnectTimerSingleton: ReturnType<typeof setTimeout> | null = null
let fallbackTimerSingleton: ReturnType<typeof setInterval> | null = null
let startedSingleton = false

type WsState = 'connecting' | 'open' | 'closed'

export default function Home() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageTimestamp, setImageTimestamp] = useState<string | null>(null)
  const [wsState, setWsState] = useState<WsState>('connecting')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const lastUrlRef = useRef<string>('')

  const applyImage = (relUrl: string) => {
    const fullUrl = `${AHP}${relUrl}`
    lastUrlRef.current = fullUrl
    setImageUrl(`${fullUrl}?t=${Date.now()}`)
    setIsLoading(false)

    const match = relUrl.match(/(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})\.jpg/)
    if (match) {
      const [, dd, mm, yyyy, hh, min, ss] = match
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
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    if (startedSingleton) return
    startedSingleton = true

    // 1) Initial fill
    fetchLatestImage()

    // 2) WebSocket
    const connect = () => {
      setWsState('connecting')
      wsSingleton = new WebSocket(WS_URL)

      wsSingleton.onopen = () => {
        setWsState('open')
        console.log('[WS] connected')
      }

      wsSingleton.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg?.type === 'new_image' && msg?.url) {
            setIsLoading(true)
            applyImage(msg.url)
          }
        } catch { /* ignore */ }
      }

      wsSingleton.onclose = () => {
        setWsState('closed')
        if (reconnectTimerSingleton) clearTimeout(reconnectTimerSingleton)
        reconnectTimerSingleton = setTimeout(connect, 5000)
      }

      wsSingleton.onerror = () => {
        try { wsSingleton?.close() } catch {}
      }
    }
    connect()

    // 3) Slow fallback polling (every 2 min)
    if (!fallbackTimerSingleton) {
      fallbackTimerSingleton = setInterval(fetchLatestImage, 120_000)
    }

    return () => { /* intentional no-op (keep singletons) */ }
  }, [])

  const StatusPill = () => {
    const label =
      wsState === 'open' ? 'Live' :
      wsState === 'connecting' ? 'Connecting' : 'Offline'
    const dotClasses =
      wsState === 'open' ? 'bg-emerald-500' :
      wsState === 'connecting' ? 'bg-amber-500 animate-pulse' :
      'bg-rose-500'
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-800 px-2.5 py-1 text-xs text-neutral-700 dark:text-neutral-300">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClasses}`} />
        {label}
      </span>
    )
  }

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-0 pb-6">
        <div className="grid">
          {/* Card container clips to rounded shape */}
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden">
            
            {/* Image area with overlay */}
            <div className="relative">
              {isLoading && (
                <div className="absolute inset-0 animate-pulse bg-neutral-100 dark:bg-neutral-800" />
              )}

              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Latest"
                  className="block w-full object-cover"
                  style={{ maxHeight: "calc(100vh - 56px - 24px)" }} // 56px header (h-14) + ~24px page padding
                />
              ) : (
                <div className="flex h-[50vh] items-center justify-center text-neutral-500 text-sm">
                  No image available
                </div>
              )}

              {/* Overlay footer (meta + actions) */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0">
                <div className="bg-gradient-to-t from-black/60 to-transparent pt-10">
                  <div className="pointer-events-auto flex items-center justify-between gap-3 px-4 sm:px-5 py-3">
                    <div className="text-xs sm:text-sm text-white/90">
                      {imageTimestamp ? (
                        <>Captured at <span className="font-medium text-white">{imageTimestamp}</span></>
                      ) : (
                        <>Captured time <span className="font-medium text-white">Unknown</span></>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Inline status pill (overlay-friendly) */}
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/30 px-2.5 py-1 text-xs text-white/90">
                        <span
                          className={[
                            "h-1.5 w-1.5 rounded-full",
                            wsState === "open"
                              ? "bg-emerald-400"
                              : wsState === "connecting"
                              ? "bg-amber-400 animate-pulse"
                              : "bg-rose-400",
                          ].join(" ")}
                        />
                        {wsState === "open" ? "Live" : wsState === "connecting" ? "Connecting" : "Offline"}
                      </span>

                      {imageUrl && (
                        <a
                          href={imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs sm:text-sm text-white/90 underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-white/60 rounded"
                        >
                          Open original
                        </a>
                      )}
                      <button
                        onClick={() => {
                          setIsLoading(true)
                          fetchLatestImage()
                        }}
                        className="rounded-md border border-white/30 bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white/90 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {/* /Overlay */}
            </div>
          </div>
        </div>
      </div>
    </main>
  )



}
