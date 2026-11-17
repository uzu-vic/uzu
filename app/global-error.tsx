"use client"
// Dernier recours : erreur au niveau de la page entière.
import { useEffect } from "react"
import { reportError } from "@/lib/uzu/errors"

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError("render", error, error.digest ? "digest " + error.digest : "") }, [error])
  return <html lang="fr"><body style={{ margin: 0, background: "#f5f2ed", color: "#171717", fontFamily: "system-ui, sans-serif" }}>
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "64px 24px" }}>
      <p style={{ color: "#941b2b", fontWeight: 700, letterSpacing: ".14em", fontSize: 13 }}>UZU</p>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 32 }}>L&apos;application a rencontré un problème.</h1>
      <p style={{ lineHeight: 1.6 }}>Tes données ne sont pas touchées et le problème nous a été signalé. Recharge la page pour continuer.</p>
      <p><button onClick={reset} style={{ minHeight: 44, padding: "0 18px", border: 0, borderRadius: 8, background: "#171717", color: "#fff", font: "inherit", fontWeight: 600 }}>Réessayer</button>{" "}
        <a href="/" style={{ color: "#941b2b", marginLeft: 12 }}>Revenir à l&apos;accueil</a></p>
    </main>
  </body></html>
}
