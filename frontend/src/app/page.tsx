'use client'

import { useEffect, useRef, useState } from 'react'

const AHP = process.env.NEXT_PUBLIC_AHP_SERVER ?? 'http://localhost:8001'

export default function Home() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageTimestamp, setImageTimestamp] = useState<string | null>(null)
  const lastUrlRef = useRef<string>('')

  useEffect(() => {
    const fetchLatestImage = () => {
      fetch(`${AHP}/latest-image`, { cache: 'no-store' })
        .then(res => res.json())
        .then(data => {
          const rel = data?.url as string | undefined
          if (!rel) return

          const fullUrl = `${AHP}${rel}`
          if (fullUrl !== lastUrlRef.current) {
            lastUrlRef.current = fullUrl
            // cache-bust so the browser doesn’t show a stale image
            setImageUrl(`${fullUrl}?t=${Date.now()}`)

            const match = rel.match(/(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})\.jpg/)
            if (match) {
              const [_, dd, mm, yyyy, hh, min, ss] = match
              setImageTimestamp(`${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`)
            } else {
              setImageTimestamp(null)
            }
          }
        })
        .catch(err => console.error('Failed to fetch image:', err))
    }

    fetchLatestImage()
    const interval = setInterval(fetchLatestImage, 10_000)
    return () => clearInterval(interval)
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
