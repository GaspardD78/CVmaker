/**
 * Generates the LLM prompt for extracting CV data from raw text.
 * The user copies this prompt, pastes it into any LLM, and pastes the JSON response back.
 */
export function buildImportPrompt(rawText: string): string {
  return `Tu es un assistant spécialisé en extraction de données de CV. Ton objectif est d'analyser le texte brut d'un CV ci-dessous et de retourner **uniquement un objet JSON valide**, sans aucun texte autour.

## Schéma JSON attendu

\`\`\`json
{
  "profile": {
    "firstName": "string ou null",
    "lastName": "string ou null",
    "email": "string ou null",
    "phone": "string ou null",
    "address": "string ou null",
    "city": "string ou null",
    "postalCode": "string ou null",
    "country": "string ou null",
    "linkedinUrl": "string ou null",
    "githubUrl": "string ou null",
    "portfolioUrl": "string ou null",
    "title": "titre professionnel / accroche ou null",
    "summary": "résumé/accroche complète ou null"
  },
  "entries": [
    {
      "entryType": "experience | education | skill | certification | language | interest | project | volunteer",
      "title": "intitulé du poste, diplôme, compétence, etc. (obligatoire)",
      "subtitle": "entreprise, école, niveau, organisme... (optionnel)",
      "location": "ville ou pays (optionnel)",
      "startDate": "YYYY-MM ou YYYY (optionnel)",
      "endDate": "YYYY-MM ou YYYY — omettre si poste en cours (optionnel)",
      "isCurrent": "true si poste/formation en cours (optionnel, défaut false)",
      "description": "description en markdown, listes avec - , gras avec **texte** (optionnel)",
      "tags": ["mot-clé1", "mot-clé2"]
    }
  ]
}
\`\`\`

## Règles importantes

- **Ne jamais inventer d'information absente du texte**
- Pour les compétences (\`skill\`), utilise \`title\` = nom de la compétence, \`subtitle\` = niveau si précisé
- Pour les langues (\`language\`), utilise \`title\` = langue, \`subtitle\` = niveau (ex: "Courant", "B2", "Natif")
- Pour les dates : format YYYY-MM si le mois est précisé, sinon YYYY seul
- Si un champ est absent du CV, utilise \`null\` ou omets-le
- Les champs \`tags\` sont optionnels : ajoute uniquement si clairement listés
- Retourne **uniquement le JSON**, sans markdown wrapper, sans explication

## Texte du CV à analyser

${rawText}

## Réponse attendue

Retourne uniquement l'objet JSON valide, rien d'autre.`;
}
