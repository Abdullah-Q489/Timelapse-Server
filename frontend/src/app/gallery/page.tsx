// app/gallery/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const AHP = process.env.NEXT_PUBLIC_AHP_SERVER ?? 'http://localhost:8001'
const WS_URL = `${AHP.replace(/^http/, 'ws')}/ws/updates`
const BATCH_SIZE = 60

type PagedResp = {
  images: string[]
  page: number
  per_page: number
  total: number
  has_more: boolean
}

type Order = 'arrival' | 'capture'

// Parse dd-mm-YYYY_HH-MM-SS.jpg from filename
const NAME_RE = /(?<dd>\d{2})-(?<mm>\d{2})-(?<yyyy>\d{4})_(?<hh>\d{2})-(?<mi>\d{2})-(?<ss>\d{2})\.jpe?g$/i

const dateKeyFromRel = (rel: string) => {
  const m = rel.match(NAME_RE)
  if (!m || !m.groups) return 'Unknown'
  const { yyyy, mm, dd } = m.groups as Record<string, string>
  return `${yyyy}-${mm}-${dd}`
}

const timestampFromRel = (rel: string) => {
  const m = rel.match(NAME_RE)
  if (!m || !m.groups) return null
  const { yyyy, mm, dd, hh, mi, ss } = m.groups as Record<string, string>
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} UTC`
}

export default function GalleryPage() {
  const [order, setOrder] = useState<Order>('arrival')
  const [all, setAll] = useState<string[]>([]) // relative URLs like "/static/2025/08/14/14-08-2025_15-29-30.jpg"
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [usingFallbackAll, setUsingFallbackAll] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Lightbox
  const [open, setOpen] = useState(false)
  const [idx, setIdx] = useState(0)

  // ---- Data fetching ----
  const loadPage = async (nextPage: number) => {
    if (loading) return
    setLoading(true)
    try {
      if (!usingFallbackAll) {
        const res = await fetch(`${AHP}/images?page=${nextPage}&per_page=${BATCH_SIZE}&order=${order}`, { cache: 'no-store' })
        if (res.status === 404) {
          // server doesn't have /images — fallback to /all-images once
          setUsingFallbackAll(true);
          console.warn('[gallery] /images not found; falling back to /all-images (loads everything at once)')
        } else if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        } else {
          const data: PagedResp = await res.json()
          setAll(prev => (nextPage === 1 ? data.images : [...prev, ...data.images]))
          setHasMore(data.has_more)
          setPage(nextPage)
          return
        }
      }

      // Fallback: fetch entire library and stop infinite scroll
      const resAll = await fetch(`${AHP}/all-images`, { cache: 'no-store' })
      if (!resAll.ok) throw new Error(`HTTP ${resAll.status}`)
      const dataAll = await resAll.json()
      const urls: string[] = Array.isArray(dataAll?.images) ? dataAll.images : []
      // In fallback mode we cannot sort by arrival (mtime) client-side; for consistency, sort by capture timestamp if possible
      const sorted = urls.slice().sort((a, b) => (timestampFromRel(a) ?? '').localeCompare(timestampFromRel(b) ?? '')).reverse()
      setAll(sorted)
      setHasMore(false)
      setPage(1)
    } catch (e) {
      console.error('Failed to fetch images:', e)
    } finally {
      setLoading(false)
    }
  }

  // Initial load & when order changes (only effective if /images exists)
  useEffect(() => {
    setAll([]); setPage(0); setHasMore(true); setUsingFallbackAll(false)
    loadPage(1)
  }, [order])

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return
    const el = sentinelRef.current
    const io = new IntersectionObserver(entries => {
      const first = entries[0]
      if (first.isIntersecting && hasMore && !loading) loadPage(page + 1)
    }, { rootMargin: '800px' })
    io.observe(el)
    return () => io.disconnect()
  }, [page, hasMore, loading, order, usingFallbackAll])

  // WS: prepend newest in arrival order when at top slice
  useEffect(() => {
    const ws = new WebSocket(WS_URL)
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg?.type === 'new_image' && msg?.url && order === 'arrival') {
          const rel = msg.url as string
          setAll(prev => (prev.length && prev[0] === rel) ? prev : (prev.includes(rel) ? prev : [rel, ...prev]))
        }
      } catch { /* ignore */ }
    }
    ws.onerror = () => { try { ws.close() } catch {} }
    return () => { try { ws.close() } catch {} }
  }, [order])

  // Build grouped structure with indices for lightbox
  const groups = useMemo(() => {
    const map = new Map<string, { rel: string; idx: number }[]>()
    all.forEach((rel, i) => {
      const key = dateKeyFromRel(rel)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push({ rel, idx: i })
    })
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [all])

  return (
    <main className="min-h-screen">
      {/* Full-bleed wrapper: escapes the layout's max-w-6xl container */}
      <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-neutral-50 dark:bg-neutral-950">
        
        {/* Gallery header sits below the UTC header from layout (h-14 = 56px) */}
        <header className="sticky top-14 z-40 bg-white/80 dark:bg-neutral-900/80 backdrop-blur border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 flex items-center gap-3">
          <h1 className="text-lg font-semibold">Gallery</h1>
          <select
            className="text-sm border rounded px-2 py-1 bg-transparent"
            value={order}
            onChange={(e) => setOrder(e.target.value as Order)}
            aria-label="Sort order"
          >
            <option value="arrival">Newest: arrival time</option>
            <option value="capture">Newest: capture time</option>
          </select>
          <div className="ml-auto text-xs text-neutral-600 dark:text-neutral-400">
            {all.length} loaded{hasMore ? '…' : ''} {usingFallbackAll && '(fallback)'}
          </div>
        </header>

        {/* Full-width content with normal page padding */}
        <div className="px-4 py-4 space-y-10">
          {groups.map(([dateKey, items]) => (
            <section key={dateKey}>
              <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
                {dateKey}
              </h2>

              {/* Fill entire viewport width now */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
                {items.map(({ rel, idx: absIndex }) => {
                  const src = `${AHP}${rel}`
                  const ts = timestampFromRel(rel) ?? 'Unknown'
                  return (
                    <figure
                      key={`${rel}-${absIndex}`}
                      className="relative cursor-zoom-in overflow-hidden rounded-lg bg-neutral-200 dark:bg-neutral-800 group"
                      onClick={() => { setIdx(absIndex); setOpen(true) }}
                      title={ts}
                    >
                      {/* Square placeholder to prevent layout shift */}
                      <div className="pb-[100%]" />
                      <img
                        src={src}
                        alt={`Captured ${ts}`}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    </figure>
                  )
                })}
              </div>
            </section>
          ))}

          <div ref={sentinelRef} className="h-20 flex items-center justify-center text-xs text-neutral-500 dark:text-neutral-400">
            {hasMore ? (loading ? 'Loading…' : 'Scroll to load more') : 'End of library'}
          </div>
        </div>

        {/* Lightbox */}
        {open && all[idx] && (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
            onClick={() => setOpen(false)}
          >
            <button
              className="absolute top-4 right-4 text-white text-xl px-3 py-1 rounded hover:bg-white/10"
              onClick={(e) => { e.stopPropagation(); setOpen(false) }}
              aria-label="Close"
            >
              ✕
            </button>

            <button
              className="absolute left-2 md:left-6 text-white text-2xl px-3 py-2 rounded hover:bg-white/10"
              onClick={(e) => { e.stopPropagation(); setIdx(i => Math.max(0, i - 1)) }}
              aria-label="Previous"
            >
              ‹
            </button>

            <img
              src={`${AHP}${all[idx]}`}
              alt="Preview"
              className="max-h-[90vh] max-w-[95vw] object-contain"
              onClick={(e) => e.stopPropagation()}
            />

            <button
              className="absolute right-2 md:right-6 text-white text-2xl px-3 py-2 rounded hover:bg-white/10"
              onClick={(e) => { e.stopPropagation(); setIdx(i => Math.min(all.length - 1, i + 1)) }}
              aria-label="Next"
            >
              ›
            </button>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/80">
              {timestampFromRel(all[idx]) ?? 'Unknown'}
            </div>
          </div>
        )}
      </div>
    </main>
  )

}
