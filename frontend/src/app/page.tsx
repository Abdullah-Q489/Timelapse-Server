'use client'

import { useEffect, useState } from 'react'

export default function Home() {
  const [utcTime, setUtcTime] = useState<string>("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageTimestamp, setImageTimestamp] = useState<string | null>(null)

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const utc = now.toISOString().replace("T", " ").slice(0, 19)
      setUtcTime(utc)
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetch("http://172.16.1.2:8001/latest-image")
      .then(res => res.json())
      .then(data => {
        if (data.url) {
          const fullUrl = `http://172.16.1.2:8001${data.url}`
          setImageUrl(fullUrl)

          // Extract timestamp from filename (e.g., "22-07-2025_23-09-08.jpg")
          const match = data.url.match(/(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})\.jpg/)
          if (match) {
            const [_, dd, mm, yyyy, hh, min, ss] = match
            const formatted = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`
            setImageTimestamp(formatted)
          }
        }
      })
      .catch(err => console.error("Failed to fetch image:", err))
  }, [])

  return (
    <main className="relative min-h-screen bg-gray-100">
      {/* UTC Clock Top Right */}
      <div className="absolute top-4 right-6 bg-white text-black font-mono text-sm px-3 py-2 rounded shadow-md">
        UTC: {utcTime}
      </div>

      {/* Centered Image and Timestamp */}
      <div className="flex flex-col justify-center items-center h-screen space-y-4">
        {imageUrl ? (
          <>
            <img src={imageUrl} alt="Latest" className="max-h-[80vh] rounded shadow" />
            <div className="text-gray-700 font-mono">
              Image captured at: {imageTimestamp || "Unknown"}
            </div>
          </>
        ) : (
          <p className="text-gray-500">No image available</p>
        )}
      </div>
    </main>
  )
}
