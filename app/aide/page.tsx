import type { Metadata } from "next"
import { ContactLine, LegalPage } from "@/components/uzu/legal-pages"

export const metadata: Metadata = { title: "Aide — UZU", description: "Réponses aux questions fréquentes sur UZU." }

const Q = ({ q, children }: { q: string; children: React.ReactNode }) => <details className="uzu-lp-q"><summary>{q}</summary><div>{children}</div></details>

export default function Page() {
  return <LegalPage title="Aide" lead="Les réponses aux questions les plus fréquentes. Pour le reste, ton professeur ou le responsable de ton club est ton premier contact.">
    <Q q="J'ai oublié mon mot de passe">Sur l&apos;écran de connexion, choisis « Mot de passe oublié ». Tu reçois un lien par e-mail pour en choisir un nouveau.</Q>
    <Q q="Comment rejoindre mon club ?">Demande le code d&apos;invitation à ton professeur. Indique-le à l&apos;inscription, ou plus tard dans Mon profil si tu as commencé en carnet solo : tout ton historique te suit.</Q>
    <Q q="Je ne reçois pas les notifications sur iPhone">Sur iPhone, les notifications n&apos;arrivent que si UZU est ajouté à l&apos;écran d&apos;accueil : dans Safari, touche Partager puis « Sur l&apos;écran d&apos;accueil », ouvre UZU depuis cette icône et active les notifications dans Mon profil.</Q>
    <Q q="La dictée vocale ne fonctionne pas">Elle fonctionne dans Safari sur iPhone et dans Chrome sur Android. Dans les autres navigateurs de l&apos;iPhone, utilise le mode clavier : touche le micro du clavier pour dicter ta phrase.</Q>
    <Q q="Qui voit mes séances ?">Ton professeur et l&apos;équipe du club selon leurs droits. Les autres membres seulement si tu actives le fil. Ton état physique et tes notes privées restent visibles par toi seul. Détails dans la <a href="/confidentialite">politique de confidentialité</a>.</Q>
    <Q q="Un contenu du fil me dérange">Touche « Signaler » sous la publication : le responsable du club est prévenu. Tu peux aussi masquer ce membre ; vous ne verrez plus l&apos;activité l&apos;un de l&apos;autre.</Q>
    <Q q="Comment supprimer mon compte ?">Mon profil, puis « Supprimer mon compte ». Toutes les étapes sont sur la page <a href="/suppression-compte">Supprimer son compte</a>.</Q>
    <h2>Contact</h2>
    <p><ContactLine /></p>
  </LegalPage>
}
