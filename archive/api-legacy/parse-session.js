export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { transcript } = req.body;
  if (!transcript) {
    return res.status(400).json({ error: 'Aucun texte vocal fourni' });
  }

  try {
    const response = await fetch('https://anthropic.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: `Tu es l'assistant d'extraction de données de l'app UZU (JJB/Grappling/Lutte). 
Extrais les informations du compte-rendu vocal d'un élève.
Règles strictes :
- Tenue : "No-gi" si grappling, lutte, no-gi ou sans kimono, sinon "Gi".
- Système : Choisis parmi "Fondamentaux", "Lutte & Scrambles", "Contrôle & Dos", "Jeux de jambes".
- Soumissions : Si soumis par un gradé (bleue, violette, marron, noire), mets dans subSubiesGrade. Sinon dans subSubiesBlanche.
- Corrige les erreurs phonétiques du JJB (ex: "qui mourra" -> "Kimura", "tour et en dos" -> "Toreando").`,
        tools: [
          {
            name: 'remplir_formulaire_uzu',
            description: 'Remplit les champs de la séance UZU',
            input_schema: {
              type: 'object',
              properties: {
                tenue: { type: 'string', enum: ['Gi', 'No-gi'] },
                duree: { type: 'string', enum: ['45 min', '1 h', '1 h 30', '2 h'] },
                systeme: { type: 'string', enum: ['Fondamentaux', 'Lutte & Scrambles', 'Contrôle & Dos', 'Jeux de jambes'] },
                sens: { type: 'string', enum: ['Imposé', 'Subi'] },
                rounds: { type: 'integer' },
                subPlacees: { type: 'integer' },
                subSubiesBlanche: { type: 'integer' },
                subSubiesGrade: { type: 'integer' },
                etat: { type: 'string', enum: ['En forme', 'Fatigué', 'Douleur / blessé'] },
                note: { type: 'string', description: 'Résumé propre des techniques et ressentis' }
              },
              required: ['tenue', 'duree', 'systeme', 'rounds', 'etat']
            }
          }
        ],
        tool_choice: { type: 'tool', name: 'remplir_formulaire_uzu' },
        messages: [{ role: 'user', content: transcript }]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Erreur API Anthropic' });
    }

    const toolCall = data.content.find(block => block.type === 'tool_use');
    return res.status(200).json(toolCall.input);

  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur lors de l’analyse vocale' });
  }
}
