import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// Configuration des clés de sécurité Web Push (VAPID)
webpush.setVapidDetails(
  'mailto:contact@uzu-app.fr',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Connexion administrateur à Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    // 1. Récupérer tous les élèves ayant activé les notifications
    const { data: eleves, error: errEleves } = await supabase
      .from('profiles')
      .select('id, prenom, push_subscription')
      .not('push_subscription', 'is', null);

    if (errEleves) throw errEleves;

    if (!eleves || eleves.length === 0) {
      return res.status(200).json({ message: 'Aucun élève abonné aux notifications pour le moment.' });
    }

    let envoyes = 0;

    for (const eleve of eleves) {
      // 2. Lire les 3 dernières séances de l'élève dans Supabase
      const { data: seances } = await supabase
        .from('seances')
        .select('systeme, sens, sub_subies_blanche, sub_subies_grade, note')
        .eq('user_id', eleve.id)
        .order('created_at', { ascending: false })
        .limit(3);

      // 3. Demander à Claude Haiku un conseil court de 120 caractères max
      const aiResponse = await fetch('https://anthropic.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 100,
          system: `Tu es un coach de JJB/Grappling bienveillant et percutant. Rédige une notification push de 120 caractères maximum (sans guillemets) pour motiver l'élève avant son cours du soir en ciblant un point précis de ses dernières séances.`,
          messages: [{
            role: 'user',
            content: `Prénom: ${eleve.prenom || 'Pratiquant'}. Dernières séances: ${JSON.stringify(seances || [])}`
          }]
        })
      });

      const aiData = await aiResponse.json();
      const messageCoach = aiData.content?.[0]?.text || `Prêt pour le tatami ${eleve.prenom || ''} ? Concentre-toi sur tes fondamentaux ce soir !`;

      // 4. Envoyer la notification push sur le téléphone de l'élève
      try {
        await webpush.sendNotification(
          eleve.push_subscription,
          JSON.stringify({
            title: '🥋 Ton cours commence bientôt !',
            body: messageCoach,
            url: '/'
          })
        );
        envoyes++;
      } catch (pushErr) {
        // Si l'élève a désinstallé l'app ou bloqué les notifications (code 410), on nettoie son jeton
        if (pushErr.statusCode === 410) {
          await supabase
            .from('profiles')
            .update({ push_subscription: null })
            .eq('id', eleve.id);
        }
      }
    }

    return res.status(200).json({ success: true, notifications_envoyees: envoyes });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
