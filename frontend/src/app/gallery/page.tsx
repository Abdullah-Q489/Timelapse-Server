'use client'

import { useEffect, useState } from 'react'

export default function GalleryPage() {
  const [images, setImages] = useState<string[]>([])

  useEffect(() => {
    const fetchImages = async () => {
      try {
        const res = await fetch("http://172.16.1.94:8001/all-images")
        const data = await res.json()
        const urls = data.images.map((path: string) => `http://172.16.1.94:8001${path}`)
        setImages(urls)
      } catch (err) {
        console.error("Failed to fetch gallery:", err)
      }
    }

    fetchImages()
  }, [])

  return (
    <main className="min-h-screen bg-gray-100 px-6 py-6 font-mono text-sm text-black">
      <h1 className="text-2xl font-bold mb-6 text-center">Gallery</h1>

      {images.length === 0 ? (
        <p className="text-center text-gray-500">No images found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((url, idx) => (
            <div key={idx} className="bg-white p-2 rounded shadow">
              <img src={url} alt={`Image ${idx}`} className="rounded w-full" />
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
