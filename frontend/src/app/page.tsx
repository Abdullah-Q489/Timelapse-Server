'use client'

import { useEffect, useRef, useState } from 'react'

export default function Home() {
  const [utcTime, setUtcTime] = useState<string>("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageTimestamp, setImageTimestamp] = useState<string | null>(null)
  const [deviceOnline, setDeviceOnline] = useState<boolean | null>(null)
  const [temperature, setTemperature] = useState<number | null>(null)
  const [diskUsage, setDiskUsage] = useState<{ total_gb: number, used_gb: number, free_gb: number } | null>(null)
  const watchdog = useRef<NodeJS.Timeout | null>(null)

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
    let lastUrl = ""

    const fetchLatestImage = () => {
      fetch("http://172.16.1.2:8001/latest-image")
        .then(res => res.json())
        .then(data => {
          if (data.url) {
            const fullUrl = `http://172.16.1.2:8001${data.url}`
            if (fullUrl !== lastUrl) {
              lastUrl = fullUrl
              setImageUrl(fullUrl)

              const match = data.url.match(/(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})\.jpg/)
              if (match) {
                const [_, dd, mm, yyyy, hh, min, ss] = match
                const formatted = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`
                setImageTimestamp(formatted)
              }
            }
          }
        })
        .catch(err => console.error("Failed to fetch image:", err))
    }

    fetchLatestImage()
    const interval = setInterval(fetchLatestImage, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const checkStatus = () => {
      fetch("http://172.16.1.94:8000/status")
        .then(res => res.json())
        .then(data => {
          setTemperature(data.temperature_c)
          setDiskUsage(data.disk)
        })
        .catch(() => {
          setTemperature(null)
          setDiskUsage(null)
        })
    }

    checkStatus()
    const interval = setInterval(checkStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let socket: WebSocket
    let reconnectInterval: NodeJS.Timeout

    const resetWatchdog = () => {
      if (watchdog.current) clearTimeout(watchdog.current)
      watchdog.current = setTimeout(() => {
        setDeviceOnline(false)
      }, 8000)
    }

    const connect = () => {
      socket = new WebSocket("ws://172.16.1.94:8000/ws/heartbeat")

      socket.onopen = () => {
        console.log("[WebSocket] connected")
        setDeviceOnline(true)
        resetWatchdog()
      }

      socket.onmessage = (e) => {
        if (e.data === "ping") {
          setDeviceOnline(true)
          resetWatchdog()
        }
      }

      socket.onerror = (err) => {
        console.warn("[WebSocket] error:", err)
        setDeviceOnline(false)
        socket.close()
      }

      socket.onclose = () => {
        console.log("[WebSocket] closed. Attempting reconnect...")
        setDeviceOnline(false)
        if (watchdog.current) clearTimeout(watchdog.current)
        reconnectInterval = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      if (watchdog.current) clearTimeout(watchdog.current)
      if (reconnectInterval) clearTimeout(reconnectInterval)
      socket.close()
    }
  }, [])

  return (
    <main className="min-h-screen bg-gray-100 px-6 py-6 font-mono text-sm text-black">
      {/* Top Status Bar */}
      <div className="flex items-center gap-6 bg-white px-4 py-2 rounded shadow mb-6 w-fit mx-auto">
        <div>UTC: {utcTime}</div>
      </div>

      {/* Image + Sidebar */}
      <div className="flex flex-col md:flex-row justify-center items-start gap-8">
        {/* Image Section */}
        <div className="flex flex-col items-center space-y-4">
          {imageUrl ? (
            <>
              <img src={imageUrl} alt="Latest" className="max-h-[80vh] rounded shadow" />
              <div className="text-gray-700">
                Image captured at: {imageTimestamp || "Unknown"}
              </div>
            </>
          ) : (
            <p className="text-gray-500">No image available</p>
          )}
        </div>

        {/* Status Sidebar */}
        <div className="bg-white px-6 py-4 rounded shadow w-full max-w-xs space-y-2">
          <div className="text-lg font-semibold mb-2">RPI</div>

          <div className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${deviceOnline ? 'bg-green-500' : 'bg-red-500'}`} />
            Device {deviceOnline ? "Online" : "Offline"}
          </div>

          <div>Temperature: {temperature !== null ? `${temperature.toFixed(1)} °C` : "Unknown"}</div>
          <div>Disk Usage:</div>
          {diskUsage ? (
            <ul className="ml-4 list-disc">
              <li>Used: {diskUsage.used_gb} GB</li>
              <li>Free: {diskUsage.free_gb} GB</li>
              <li>Total: {diskUsage.total_gb} GB</li>
            </ul>
          ) : (
            <div className="ml-4 text-gray-500">Unavailable</div>
          )}
        </div>
      </div>
    </main>
  )
}
