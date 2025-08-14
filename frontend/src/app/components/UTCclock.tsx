'use client'
import { useEffect, useState } from 'react'

export default function UTCclock() {
  const [utc, setUtc] = useState<string>("")

  useEffect(() => {
    const update = () => {
      const now = new Date()
      setUtc(now.toISOString().replace("T", " ").slice(0, 19))
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="bg-white text-black font-mono text-sm px-4 py-1 rounded shadow">
      UTC: {utc}
    </div>
  )
}
