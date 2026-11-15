import type { Metadata } from "next"
import { ContactLine, LEGAL, LegalPage } from "@/components/uzu/legal-pages"

export const metadata: Metadata = { title: "Conditions d'utilisation — UZU", description: "Les règles d'utilisation d'UZU, du fil du club et de la modération." }

export default function Page() {
  return <LegalPage title="Conditions d'utilisation" lead="En créant un compte UZU, tu acceptes ces règles simples. Elles protègent les membres de ton club et toi-même.">
    <h2>Le service</h2>
    <p>UZU, édité par {LEGAL.editor}, est un carnet de progression pour les sports de combat et un outil de gestion pour les clubs : cours, présences, élèves, grades, contenus pédagogiques et fil du club. Le service est fourni tel quel ; nous faisons de notre mieux pour qu&apos;il reste disponible et exact.</p>
    <h2>Ton compte</h2>
    <ul>
      <li>Les informations que tu donnes doivent être exactes. Ton compte est personnel : ne partage pas ton mot de passe.</li>
      <li>En dessous de 16 ans, l&apos;accord de ton représentant légal est nécessaire.</li>
      <li>Tu peux supprimer ton compte à tout moment depuis Mon profil (<a href="/suppression-compte">comment faire</a>).</li>
    </ul>
    <h2>Respect dans le fil du club</h2>
    <p>Le fil montre l&apos;activité des membres qui l&apos;ont choisi. Sont interdits : moqueries, harcèlement, contenus choquants, fausses informations (séances, grades ou résultats inventés) et usurpation d&apos;identité.</p>
    <ul>
      <li><b>Signaler</b> : chaque publication d&apos;un autre membre propose « Signaler ». Le responsable de ton club est prévenu et traite le signalement.</li>
      <li><b>Masquer</b> : tu peux masquer un membre. Vous ne voyez plus l&apos;activité l&apos;un de l&apos;autre dans le fil. Tu peux annuler depuis Mon profil.</li>
      <li>Le club peut retirer un membre qui ne respecte pas ces règles.</li>
    </ul>
    <h2>Le rôle du club</h2>
    <p>Chaque club gère ses membres, son équipe et leurs droits, ses cours et ses contenus. Les vidéos et annonces publiées par un club lui appartiennent et ne sont visibles que par ses membres connectés.</p>
    <h2>Santé et sécurité</h2>
    <p>UZU ne donne pas d&apos;avis médical. Les rappels, statistiques et suggestions ne remplacent ni ton professeur ni un médecin. Écoute ton corps et respecte les consignes de sécurité de ton club.</p>
    <h2>Évolutions et droit applicable</h2>
    <p>Ces conditions peuvent évoluer ; la date de mise à jour figure en haut de la page. Elles sont soumises au droit français. <ContactLine /></p>
  </LegalPage>
}
