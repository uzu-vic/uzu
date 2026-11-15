"use client"
// Lecture d'une vidéo du club par lien signé (stockage privé).
import { useState } from "react"
import { useVideoUrl } from "@/lib/uzu/videos"

export function ClubVideo({ id, label }: { id: string | null | undefined; label?: string }) {
  const url = useVideoUrl(id)
  const [bad, setBad] = useState(false)
  if (!id || bad) return null
  if (!url) return <div className="uzu-video uzu-video--wait" aria-busy="true" aria-label="Chargement de la vidéo" />
  return <video className="uzu-video" controls playsInline preload="metadata" src={url} aria-label={label} onError={() => setBad(true)} />
}
