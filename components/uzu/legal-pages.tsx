// Pages publiques (sans connexion) : confidentialité, conditions d'utilisation, suppression du compte, aide.
// Exigées par l'App Store et Google Play : accessibles depuis l'application ET sur le web.
import type { ReactNode } from "react"
import { UzuMark } from "@/components/uzu/mark"

/** Éditeur et contact affichés sur les pages publiques. À compléter avant la publication sur les stores. */
export const LEGAL = { editor: "UZU — The mat doesn't lie", contact: "", updated: "16 novembre 2026" }

export const LEGAL_LINKS: [string, string][] = [["/confidentialite", "Confidentialité"], ["/conditions", "Conditions d'utilisation"], ["/suppression-compte", "Supprimer son compte"], ["/aide", "Aide"]]

export function LegalLinks({ className = "" }: { className?: string }) {
  return <nav className={`uzu-legal-links ${className}`} aria-label="Informations légales">
    {LEGAL_LINKS.map(([h, l]) => <a key={h} href={h}>{l}</a>)}
  </nav>
}

export function ContactLine() {
  return LEGAL.contact
    ? <>Contact : <a href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a>.</>
    : <>Pour toute question, adresse-toi d&apos;abord au responsable de ton club, qui gère ton rattachement. Une adresse de contact de l&apos;éditeur sera publiée sur cette page.</>
}

export function LegalPage({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return <main className="uzu-lp">
    <header className="uzu-lp-head">
      <a className="uzu-lp-brand" href="/"><UzuMark size={26} /><span>UZU</span></a>
      <a className="button button--outline uzu-small-btn" href="/">Ouvrir l&apos;application</a>
    </header>
    <article className="uzu-lp-body">
      <p className="eyebrow">INFORMATIONS · MISE À JOUR LE {LEGAL.updated.toUpperCase()}</p>
      <h1>{title}<span className="heading-period">.</span></h1>
      <p className="uzu-lp-lead">{lead}</p>
      {children}
    </article>
    <footer className="uzu-lp-foot"><LegalLinks /><p>© UZU — The mat doesn&apos;t lie</p></footer>
  </main>
}
