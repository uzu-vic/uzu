"use client"
// Mesure d'audience Vercel Web Analytics : sans cookie, agrégée.
// Les paramètres et fragments d'adresse sont retirés avant envoi : ils peuvent contenir un jeton
// d'invitation (?invite=), de réinitialisation du mot de passe (#access_token=) ou un raccourci (?go=).
import { Analytics } from "@vercel/analytics/next"

export function Audience() {
  return <Analytics beforeSend={e => ({ ...e, url: e.url.split(/[?#]/)[0] })} />
}
