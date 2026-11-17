"use client"
// Filet de sécurité : si un écran plante, on affiche une page de secours au lieu d'une page blanche,
// et le plantage est signalé (lib/uzu/errors.ts). Le reste de l'application reste utilisable.
import { Component, type ErrorInfo, type ReactNode } from "react"
import { reportError } from "@/lib/uzu/errors"

export function CrashCard({ onRetry }: { onRetry?: () => void }) {
  return <section className="panel uzu-panel uzu-crash" role="alert">
    <div className="eyebrow">ÉCRAN INDISPONIBLE</div>
    <h2 className="uzu-h2">Cet écran a rencontré un problème</h2>
    <p className="uzu-text">Tes données ne sont pas touchées. Le problème nous a été signalé automatiquement. Réessaie, ou reviens à l&apos;accueil.</p>
    <div className="uzu-actions uzu-actions--start">
      {onRetry && <button className="button button--dark" onClick={onRetry}>Réessayer</button>}
      <button className="button button--outline" onClick={() => window.location.replace("/")}>Revenir à l&apos;accueil</button>
    </div>
  </section>
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { reportError("render", error, info.componentStack || "") }
  render() { return this.state.failed ? <CrashCard onRetry={() => this.setState({ failed: false })} /> : this.props.children }
}
