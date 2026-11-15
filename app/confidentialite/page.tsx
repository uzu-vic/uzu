import type { Metadata } from "next"
import { ContactLine, LEGAL, LegalPage } from "@/components/uzu/legal-pages"

export const metadata: Metadata = { title: "Politique de confidentialité — UZU", description: "Quelles données UZU traite, pourquoi, qui y a accès, combien de temps et comment exercer tes droits." }

export default function Page() {
  return <LegalPage title="Politique de confidentialité" lead="UZU sert à suivre ta progression en sports de combat et à faire vivre ton club. Nous ne collectons que ce qui sert à ce suivi, sans publicité ni revente.">
    <h2>Qui traite tes données</h2>
    <p>L&apos;application est éditée par {LEGAL.editor}. Quand tu fais partie d&apos;un club, ce club décide de l&apos;usage pédagogique de tes données (responsable du traitement) et UZU les traite pour son compte. En carnet solo, sans club, UZU est seul responsable de tes données.</p>
    <h2>Les données traitées</h2>
    <ul>
      <li><b>Compte</b> : adresse e-mail, mot de passe (chiffré, jamais lisible), prénom et nom.</li>
      <li><b>Carnet d&apos;entraînement</b> : séances, préparation physique, intensité ressentie, techniques travaillées, soumissions, compétitions, ceinture et barrettes.</li>
      <li><b>Données de santé</b> : état physique, fatigue et notes privées. Elles sont rangées dans un espace que toi seul peux lire, ni ton professeur ni ton club n&apos;y ont accès.</li>
      <li><b>Vie du club</b> : présences aux cours, demandes et validations de grade, notes pédagogiques de l&apos;équipe, annonces, vidéos du club.</li>
      <li><b>Tranche d&apos;âge et sexe</b> : facultatifs, utilisés seulement dans les statistiques anonymes du club.</li>
      <li><b>Notifications</b> : tes préférences et, si tu les actives, l&apos;identifiant technique de ton téléphone pour les recevoir.</li>
      <li><b>Modération</b> : les signalements que tu envoies et les membres que tu masques.</li>
    </ul>
    <h2>Pourquoi et sur quelle base</h2>
    <ul>
      <li>Faire fonctionner ton carnet, ton club et ton compte : exécution du service que tu as demandé.</li>
      <li>Données de santé et partage de ton activité dans le fil du club : ton consentement, que tu peux retirer à tout moment depuis Mon profil.</li>
      <li>Sécurité et modération du fil : intérêt légitime à protéger les membres.</li>
    </ul>
    <h2>Qui voit quoi</h2>
    <ul>
      <li><b>Toi</b> : tout ton carnet, y compris ton état physique et tes notes privées.</li>
      <li><b>L&apos;équipe de ton club</b> : selon les droits donnés par le responsable (séances, présences, progression, grades). Jamais tes données de santé.</li>
      <li><b>Les membres de ton club</b> : seulement si tu actives le fil, et seulement tes séances (durée, tenue, système), étapes, podiums et grades.</li>
      <li><b>Nos prestataires techniques</b> : Supabase (base de données, connexion, stockage, hébergés dans l&apos;Union européenne) et Vercel (pages de l&apos;application). Pour les notifications, le service de ton navigateur ou de ton téléphone reçoit le texte de la notification.</li>
    </ul>
    <p>Aucune donnée n&apos;est vendue ni utilisée pour de la publicité. L&apos;application n&apos;utilise aucun traceur publicitaire : le stockage de ton navigateur sert seulement à garder ta session et ton carnet hors connexion.</p>
    <h2>Combien de temps</h2>
    <p>Tant que ton compte existe. Quand tu supprimes ton compte, tes données sont effacées immédiatement. Le journal d&apos;activité de ton club garde la trace des actions passées sans ton identité, et les signalements te concernant sont rendus anonymes. Les sauvegardes techniques de l&apos;hébergeur sont écrasées selon leur cycle normal.</p>
    <h2>Mineurs</h2>
    <p>En dessous de 16 ans, l&apos;accord du représentant légal est requis pour utiliser UZU. Le représentant légal peut demander à tout moment l&apos;accès aux données de l&apos;enfant ou leur suppression.</p>
    <h2>Sécurité</h2>
    <p>Les échanges sont chiffrés. Chaque lecture et chaque écriture est contrôlée par le serveur selon ton rôle : l&apos;application ne peut pas contourner ces règles.</p>
    <h2>Tes droits</h2>
    <p>Tu peux accéder à tes données, les corriger, t&apos;opposer à un traitement, retirer ton consentement et supprimer ton compte (<a href="/suppression-compte">voir comment</a>). Tu peux aussi saisir la CNIL (cnil.fr). <ContactLine /></p>
  </LegalPage>
}
