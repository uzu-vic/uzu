import type { Metadata } from "next"
import { ContactLine, LegalPage } from "@/components/uzu/legal-pages"

export const metadata: Metadata = { title: "Supprimer son compte — UZU", description: "Comment supprimer définitivement ton compte UZU et ce qui est effacé." }

export default function Page() {
  return <LegalPage title="Supprimer son compte" lead="Tu peux supprimer ton compte UZU toi-même, à tout moment, depuis l'application ou depuis ce site. La suppression est immédiate et définitive.">
    <h2>Comment faire</h2>
    <ol>
      <li>Connecte-toi sur <a href="/">l&apos;application UZU</a> (sur ton téléphone ou sur ce site).</li>
      <li>Ouvre <b>Mon profil</b>, puis descends jusqu&apos;à <b>Supprimer mon compte</b>.</li>
      <li>Tape <b>SUPPRIMER</b> pour confirmer, puis valide.</li>
    </ol>
    <p>Mot de passe oublié ? Sur l&apos;écran de connexion, choisis « Mot de passe oublié » pour recevoir un lien, puis suis les étapes ci-dessus.</p>
    <h2>Ce qui est effacé</h2>
    <ul>
      <li>Ton compte de connexion et ton profil.</li>
      <li>Ton carnet : séances, préparation physique, compétitions, techniques, état physique et notes privées.</li>
      <li>Ta présence dans le fil, tes présences aux cours, ton historique de grades, les notes pédagogiques te concernant.</li>
      <li>Tes notifications, tes préférences et les membres que tu as masqués.</li>
    </ul>
    <h2>Ce qui est conservé, sans ton identité</h2>
    <ul>
      <li>Le journal d&apos;activité de ton club garde la trace des actions passées, sans ton nom.</li>
      <li>Les signalements te concernant restent visibles par le club, rendus anonymes.</li>
    </ul>
    <h2>Cas particulier : responsable d&apos;un club</h2>
    <p>Si tu es le seul responsable d&apos;un club qui a d&apos;autres membres, nomme d&apos;abord un autre responsable (Club, puis Équipe). Si tu es seul dans ton club, le club est supprimé avec ton compte.</p>
    <h2>Effacer seulement ton carnet</h2>
    <p>Pour repartir de zéro sans fermer ton compte, Mon profil propose aussi « Supprimer toutes mes données ». <ContactLine /></p>
  </LegalPage>
}
