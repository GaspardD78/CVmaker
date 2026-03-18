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
    template: `Tu es expert en rédaction de CV pour les métiers RH et du recrutement spécialisé en cybersécurité.

## Règles absolues
- Ne jamais inventer une compétence, une certification ou une expérience absente du profil ci-dessous
- Ne jamais utiliser de superlatifs ("expert reconnu", "passionné", "dynamique", etc.)
- Rester factuel et mesurable
- Ton naturel, direct, professionnel — pas de langue de bois RH
- Les mots-clés de l'annonce doivent apparaître naturellement, pas plaqués artificiellement

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

Les versions doivent être réellement différentes dans leur angle d'attaque, pas juste des reformulations l'une de l'autre.

Pour chaque version, indique en une ligne l'angle choisi et pourquoi il est pertinent pour cette annonce.`,
  },
  {
    id: 'ats-keywords',
    name: 'Mots-clés ATS manquants',
    description: 'Analyse les mots-clés ATS manquants par rapport à une annonce',
    template: `Tu es expert en optimisation ATS pour les CVs du secteur RH/recrutement spécialisé cybersécurité.

## Règles absolues
- Ne suggérer d'ajouter un mot-clé que s'il correspond à une réalité du profil (même partielle)
- Si un mot-clé est absent ET que le profil n'y correspond pas, le signaler honnêtement sans proposer de l'inventer
- Distinguer ce qui est vraiment manquant de ce qui est simplement mal formulé

## Mon CV actuel
Blocs visibles : {liste_blocs_cv}
Compétences : {compétences}
Certifications : {certifications}

## L'annonce
{texte_annonce}

## Ta mission

### Étape 1 — Extraction des mots-clés de l'annonce
Classe-les en :
- Indispensables (mentionnés plusieurs fois ou marqués "requis")
- Importants (mentionnés une fois)
- Secondaires (nice to have)

### Étape 2 — Analyse de correspondance
Pour chaque mot-clé, statut :
✅ PRÉSENT et bien formulé
⚠️ PRÉSENT mais mal mis en valeur → proposition de reformulation
❌ ABSENT mais profil compatible → suggestion d'ajout réaliste
🚫 ABSENT et profil non compatible → à ne pas mentionner

### Étape 3 — Plan d'action priorisé
Les 5 modifications les plus impactantes à faire dans le CV, dans l'ordre de priorité.

### Étape 4 — Correspondance globale
Score honnête de correspondance profil/annonce (ex: 7/10) avec justification en 2-3 lignes.`,
  },
  {
    id: 'reformulate-experience',
    name: 'Reformuler une expérience',
    description: 'Reformule un bloc expérience pour l\'adapter à une annonce',
    requiresBlock: true,
    template: `Tu es expert en rédaction de CV pour les métiers RH/recrutement cyber.

## Règles absolues
- Utiliser uniquement les éléments factuels de la description actuelle
- Ne jamais inventer de chiffres, de périmètres ou de responsabilités
- Si la description actuelle est pauvre, proposer des questions à se poser pour l'enrichir plutôt que d'inventer
- Verbes d'action à l'infinitif, pas de "j'ai", pas de "nous avons"
- Ton naturel, pas de jargon RH creux

## L'expérience à reformuler
Poste : {titre_bloc}
Entreprise : {sous_titre_bloc}
Période : {dates_bloc}
Description actuelle : {description_bloc}

## Contexte de candidature
Poste visé : {poste_cible}
Entreprise : {entreprise_cible}
Annonce : {texte_annonce}

## Ma spécialisation
Recruteur spécialisé cybersécurité — domaines : IAM, GRC, SOC, Pentest
{certifications}

## Ta mission

### Étape 1 — Analyse
- Quels éléments de cette expérience sont directement pertinents pour l'annonce ?
- Quels éléments sont neutres ?
- Y a-t-il des incohérences ou des formulations à risque ?

### Étape 2 — Reformulations
Version A — Courte (3-4 bullets, max 80 caractères par bullet)
Version B — Développée (5-6 bullets, avec contexte et impact)

### Étape 3 — Questions à compléter
Si la description actuelle manque d'informations, liste 3-5 questions précises auxquelles je pourrais répondre pour enrichir les versions ci-dessus avec de vraies données.`,
  },
  {
    id: 'prepare-interview',
    name: 'Préparer l\'entretien',
    description: 'Prépare les questions probables et stratégie d\'entretien',
    template: `Tu es coach spécialisé en préparation d'entretiens pour les métiers RH/recrutement en environnement tech et cybersécurité.

## Règles absolues
- Construire les suggestions de réponses uniquement à partir des expériences réelles ci-dessous
- Ne pas inventer d'exemples ou de situations
- Si une question ne trouve pas de réponse solide dans le profil, le dire clairement plutôt que de suggérer une réponse creuse
- Ton humain, pas de blabla coaching

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

### 1 — Lecture de l'annonce
Identifie le profil recherché en filigrane : type de structure, niveau de séniorité attendu, culture RH (opérationnelle ? stratégique ? partenaire ?).

### 2 — Questions probables (5-7 questions)
Pour chaque question :
- La question telle qu'elle sera posée
- Pourquoi cette question dans ce contexte précis
- Structure de réponse STAR basée sur MES expériences réelles
- Ce qu'il ne faut pas dire

### 3 — Questions pièges (2-3)
Questions qui pourraient mettre en difficulté ce profil spécifique
Pour chaque : comment la retourner honnêtement sans esquiver.

### 4 — Mes questions à poser (3-4)
Questions pertinentes et différenciantes à poser en fin d'entretien, adaptées à ce poste et cette entreprise spécifique.`,
  },
  {
    id: 'application-message',
    name: 'Message de candidature',
    description: 'Génère des messages LinkedIn, email et InMail adaptés',
    requiresContactName: true,
    template: `Tu es expert en communication professionnelle pour les candidatures dans les métiers RH/recrutement spécialisé cybersécurité.

## Règles absolues
- Maximum 150 mots pour LinkedIn, 200 mots pour l'email
- Aucune formule d'accroche bateau ("Je me permets", "Très intéressé par", "Passionné par")
- Un seul fait différenciant mis en avant — pas une liste
- Ton direct, humain, pas corporate
- Ne jamais promettre ce que le profil ne garantit pas
- L'appel à l'action doit être simple et sans pression

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
- Quel est l'élément le plus distinctif de mon profil par rapport à un recruteur RH classique ?
- Quel problème concret cette entreprise cherche-t-elle à résoudre avec ce recrutement ?
- Y a-t-il un point de connexion naturel entre mon parcours et cette entreprise/ce secteur ?

## Ta mission

### Version LinkedIn (150 mots max)
Message de prise de contact direct, sans objet.
Structure : accroche avec un fait concret → lien avec le poste → appel à l'action sobre.

### Version Email (200 mots max)
Objet : court, factuel, pas accrocheur.
Structure : contexte en 1 phrase → valeur ajoutée concrète → 1 question ou proposition d'échange.

### Version InMail candidature spontanée
Uniquement si {texte_annonce} est vide ou non renseigné : message de contact sans annonce précise, basé uniquement sur la cible entreprise/secteur.

Pour chaque version : note en italique ce que tu as choisi de mettre en avant et pourquoi.`,
  },
];

export function getPromptTemplate(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find(t => t.id === id);
}
