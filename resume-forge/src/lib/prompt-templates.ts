import { PromptTemplate } from '@/types/ai-prompt';

/**
 * Default differentiator text, used when no custom value is set in settings.
 * The user can override this via Settings → "Atout différenciant".
 */
export const DEFAULT_DIFFERENTIATOR =
  'Jeu de cartes pédagogique conçu pour standardiser l\'évaluation technique des candidats';

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'adapt-summary',
    name: 'Adapter l\'accroche',
    description: 'Génère 3 versions d\'accroche adaptées à une annonce spécifique',
    template: `Tu es expert en rédaction de CV professionnels.

## Règles absolues
- Ne jamais inventer une compétence, une certification ou une expérience absente du profil ci-dessous
- Ne jamais utiliser de superlatifs ("expert reconnu", "passionné", "dynamique", etc.)
- Rester factuel et mesurable
- Ton naturel, direct, professionnel - écris comme un humain qui parle, pas comme une IA
- Ne jamais utiliser le tiret cadratin "—" : utiliser " - " ou une virgule
- Être synthétique et percutant : phrases courtes, pas de remplissage
- Mettre en **gras** les termes-clés importants (technologies, certifications, métriques chiffrées)
- Éviter absolument les marqueurs IA : "en effet", "il convient de noter", "force est de constater", "dans le cadre de", "il est important de souligner", "n'hésitez pas"
- Les mots-clés de l'annonce doivent apparaître naturellement, pas plaqués artificiellement
- Fournir les reformulations dans un bloc de code markdown

## Mon profil complet
Nom : {prénom} {nom}
Titre actuel : {titre}
Résumé actuel : {résumé}
Expériences (dans ce CV) : {liste_postes_cv}
Compétences déclarées : {compétences}
Certifications : {certifications}

## L'annonce
{texte_annonce}

## Analyse préalable (fais-la avant de rédiger)
Avant de proposer les accroches, réponds à ces questions :
- Quels sont les 3 critères prioritaires de cette annonce ?
- Lesquels correspondent exactement à mon profil ?
- Lesquels correspondent partiellement ?
- Lesquels sont absents de mon profil ? (ne pas les mentionner dans l'accroche)

## Ta mission
Sur la base de cette analyse, propose 3 versions d'accroche (4-6 lignes max chacune) qui mettent en avant les angles les plus pertinents au regard de cette annonce spécifique.

Les versions doivent être réellement différentes dans leur angle d'attaque, pas juste des reformulations l'une de l'autre. Elles doivent sonner comme si un professionnel les avait écrites lui-même, pas comme un texte généré.

Pour chaque version, indique en une ligne l'angle choisi et pourquoi il est pertinent pour cette annonce.`,
  },
  {
    id: 'ats-keywords',
    name: 'Mots-clés ATS manquants',
    description: 'Analyse les mots-clés ATS manquants par rapport à une annonce',
    template: `Tu es expert en optimisation ATS pour les CVs professionnels.

## Règles absolues
- Ne suggérer d'ajouter un mot-clé que s'il correspond à une réalité du profil (même partielle)
- Si un mot-clé est absent ET que le profil n'y correspond pas, le signaler honnêtement sans proposer de l'inventer
- Distinguer ce qui est vraiment manquant de ce qui est simplement mal formulé
- Ton naturel et direct - pas de langue de bois
- Ne jamais utiliser le tiret cadratin "—" : utiliser " - " ou une virgule
- Être synthétique : phrases courtes, pas de remplissage
- Mettre en **gras** les termes-clés importants
- Éviter les marqueurs IA : "en effet", "il convient de noter", "force est de constater", "dans le cadre de"

## Mon CV actuel
Blocs visibles : {liste_blocs_cv}
Compétences : {compétences}
Certifications : {certifications}

## L'annonce
{texte_annonce}

## Ta mission

### Étape 1 - Extraction des mots-clés de l'annonce
Classe-les en :
- Indispensables (mentionnés plusieurs fois ou marqués "requis")
- Importants (mentionnés une fois)
- Secondaires (nice to have)

### Étape 2 - Analyse de correspondance
Pour chaque mot-clé, statut :
PRÉSENT et bien formulé
PRÉSENT mais mal mis en valeur - proposition de reformulation
ABSENT mais profil compatible - suggestion d'ajout réaliste
ABSENT et profil non compatible - à ne pas mentionner

### Étape 3 - Plan d'action priorisé
Les 5 modifications les plus impactantes à faire dans le CV, dans l'ordre de priorité.

### Étape 4 - Correspondance globale
Score honnête de correspondance profil/annonce (ex: 7/10) avec justification en 2-3 lignes.`,
  },
  {
    id: 'reformulate-experience',
    name: 'Reformuler une expérience',
    description: 'Reformule un bloc expérience pour l\'adapter à une annonce',
    requiresBlock: true,
    template: `Tu es expert en rédaction de CV professionnels.

## Règles absolues
- Utiliser uniquement les éléments factuels de la description actuelle
- Ne jamais inventer de chiffres, de périmètres ou de responsabilités
- Si la description actuelle est pauvre, proposer des questions à se poser pour l'enrichir plutôt que d'inventer
- Verbes d'action à l'infinitif, pas de "j'ai", pas de "nous avons"
- Ton naturel et humain - écris comme un professionnel expérimenté, pas comme une IA
- Ne jamais utiliser le tiret cadratin "—" : utiliser " - " ou une virgule
- Être synthétique et percutant : phrases courtes, zéro remplissage
- Mettre en **gras** les termes-clés importants (technologies, certifications, métriques chiffrées)
- Éviter absolument : "en effet", "il convient de noter", "force est de constater", "dans le cadre de", "il est important de souligner"
- Fournir les reformulations dans un bloc de code markdown

## L'expérience à reformuler
Poste : {titre_bloc}
Entreprise : {sous_titre_bloc}
Période : {dates_bloc}
Description actuelle : {description_bloc}

## Contexte de candidature
Poste visé : {poste_cible}
Entreprise : {entreprise_cible}
Annonce : {texte_annonce}

## Mon profil
{certifications}

## Ta mission

### Étape 1 - Analyse
- Quels éléments de cette expérience sont directement pertinents pour l'annonce ?
- Quels éléments sont neutres ?
- Y a-t-il des incohérences ou des formulations à risque ?

### Étape 2 - Reformulations
Version A - Courte (3-4 bullets, max 80 caractères par bullet)
Version B - Développée (5-6 bullets, avec contexte et impact)

### Étape 3 - Questions à compléter
Si la description actuelle manque d'informations, liste 3-5 questions précises auxquelles je pourrais répondre pour enrichir les versions ci-dessus avec de vraies données.`,
  },
  {
    id: 'prepare-interview',
    name: 'Préparer l\'entretien',
    description: 'Prépare les questions probables et stratégie d\'entretien',
    template: `Tu es coach spécialisé en préparation d'entretiens professionnels.

## Règles absolues
- Construire les suggestions de réponses uniquement à partir des expériences réelles ci-dessous
- Ne pas inventer d'exemples ou de situations
- Si une question ne trouve pas de réponse solide dans le profil, le dire clairement plutôt que de suggérer une réponse creuse
- Ton conversationnel et humain - les réponses suggérées doivent sonner naturelles, pas récitées
- Ne jamais utiliser le tiret cadratin "—" : utiliser " - " ou une virgule
- Être synthétique : aller droit au but
- Mettre en **gras** les points-clés à retenir
- Éviter les marqueurs IA : "en effet", "il convient de noter", "force est de constater"

## Mon profil
{résumé}
Expériences clés (dans ce CV) : {liste_postes_cv}
Certifications : {certifications}
Atout différenciant : {atout_différenciant}

## Le poste
Entreprise : {entreprise_cible}
Poste : {poste_cible}
Annonce complète : {texte_annonce}

## Ta mission

### 1 - Lecture de l'annonce
Identifie le profil recherché en filigrane : type de structure, niveau de séniorité attendu, culture d'entreprise.

### 2 - Questions probables (5-7 questions)
Pour chaque question :
- La question telle qu'elle sera posée
- Pourquoi cette question dans ce contexte précis
- Structure de réponse STAR basée sur MES expériences réelles
- Ce qu'il ne faut pas dire

### 3 - Questions pièges (2-3)
Questions qui pourraient mettre en difficulté ce profil spécifique.
Pour chaque : comment la retourner honnêtement sans esquiver.

### 4 - Mes questions à poser (3-4)
Questions pertinentes et différenciantes à poser en fin d'entretien, adaptées à ce poste et cette entreprise spécifique.`,
  },
  {
    id: 'application-message',
    name: 'Message de candidature',
    description: 'Génère des messages LinkedIn, email et InMail adaptés',
    requiresContactName: true,
    template: `Tu es expert en communication professionnelle pour les candidatures.

## Règles absolues
- Maximum 150 mots pour LinkedIn, 200 mots pour l'email
- Aucune formule d'accroche bateau ("Je me permets", "Très intéressé par", "Passionné par")
- Un seul fait différenciant mis en avant - pas une liste
- Ton direct, humain, pas corporate - le message doit sonner comme écrit par une vraie personne
- Ne jamais utiliser le tiret cadratin "—" : utiliser " - " ou une virgule
- Ne jamais promettre ce que le profil ne garantit pas
- L'appel à l'action doit être simple et sans pression
- Mettre en **gras** un ou deux éléments-clés maximum
- Éviter absolument : "en effet", "il convient de noter", "force est de constater", "n'hésitez pas"
- Fournir les messages dans un bloc de code markdown

## Mon profil
Nom : {prénom} {nom}
Titre : {titre}
Résumé : {résumé}
Expériences clés : {liste_postes_courts}
Atout différenciant : {atout_différenciant}

## La cible
Entreprise : {entreprise_cible}
Poste : {poste_cible}
Contact (si connu) : {contact_name}
Annonce : {texte_annonce}

## Analyse préalable (fais-la avant de rédiger)
- Quel est l'élément le plus distinctif de mon profil par rapport à un candidat classique ?
- Quel problème concret cette entreprise cherche-t-elle à résoudre avec ce recrutement ?
- Y a-t-il un point de connexion naturel entre mon parcours et cette entreprise/ce secteur ?

## Ta mission

### Version LinkedIn (150 mots max)
Message de prise de contact direct, sans objet.
Structure : accroche avec un fait concret, lien avec le poste, appel à l'action sobre.

### Version Email (200 mots max)
Objet : court, factuel, pas accrocheur.
Structure : contexte en 1 phrase, valeur ajoutée concrète, 1 question ou proposition d'échange.

### Version InMail candidature spontanée
Uniquement si {texte_annonce} est vide ou non renseigné : message de contact sans annonce précise, basé uniquement sur la cible entreprise/secteur.

Pour chaque version : note en italique ce que tu as choisi de mettre en avant et pourquoi.`,
  },
];

export const CV_ANALYSIS_TEMPLATE: PromptTemplate = {
  id: 'cv-analysis',
  name: 'Analyse adéquation CV / Offre',
  description: 'Analyse la correspondance entre le CV et l\'annonce, retourne un JSON structuré',
  template: `Tu es expert en recrutement et optimisation de CV. Analyse la correspondance entre le CV ci-dessous et l'offre d'emploi, puis retourne UNIQUEMENT un objet JSON valide (sans texte autour, sans markdown, sans \`\`\`json).

## Règles
- Ne jamais inventer une compétence ou expérience absente du CV
- Les scores doivent être honnêtes et justifiés par le contenu réel du CV
- Retourner UNIQUEMENT le JSON, sans aucun texte avant ou après
- Dans les champs texte du JSON : ton naturel, pas de tiret cadratin "—", phrases courtes et directes
- Éviter les formulations IA génériques dans la synthèse et les recommandations

## CV
Candidat : {prénom} {nom}
Titre : {titre}
Résumé : {résumé}

{liste_blocs_cv}

## Offre d'emploi
{texte_annonce}

## Format de réponse OBLIGATOIRE
Retourne uniquement ce JSON, en remplissant chaque champ honnêtement :

{
  "score_global": <entier 0-100>,
  "scores": {
    "competences": <entier 0-100>,
    "experience": <entier 0-100>,
    "formation": <entier 0-100>,
    "couverture": <entier 0-100>
  },
  "points_forts": [<liste de 3 à 5 chaînes de caractères>],
  "points_friction": [<liste de 2 à 4 chaînes de caractères>],
  "recommandations": [<liste de 3 à 5 actions concrètes>],
  "mots_cles_manquants": [<liste des mots-clés importants absents du CV>],
  "mots_cles_presents": [<liste des mots-clés de l'annonce présents dans le CV>],
  "synthese": "<2-3 phrases résumant l'adéquation globale>"
}`,
};

export function getPromptTemplate(id: string): PromptTemplate | undefined {
  if (id === CV_ANALYSIS_TEMPLATE.id) return CV_ANALYSIS_TEMPLATE;
  return PROMPT_TEMPLATES.find(t => t.id === id);
}
