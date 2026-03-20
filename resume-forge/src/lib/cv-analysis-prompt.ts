// ============================================================
// ResumeForge — Module d'analyse CV / annonce (IA)
// ============================================================
// Usage :
//   import { analyzeCV, scoreColor } from '@/lib/cv-analysis-prompt'
//   const result = await analyzeCV(cvText, jobDescription, apiKey)
// ============================================================

import { getSetting } from '@/lib/db';

// ------------------------------------------------------------------
// 1. PROMPT SYSTÈME
// ------------------------------------------------------------------

export const SYSTEM_PROMPT = `
Tu es un expert senior en recrutement IT et cybersécurité avec 15 ans d'expérience.
Tu analyses l'adéquation entre un CV et une offre d'emploi en suivant une méthode structurée en 5 étapes.
IMPORTANT : Réponds UNIQUEMENT en JSON valide, sans balises markdown, sans texte avant ou après.

---

## ÉTAPE 1 — Extraction de l'annonce
Identifie et classe :
- critères_obligatoires : diplôme, années d'expérience minimum, compétences explicitement requises
- critères_souhaités : éléments marqués "serait un plus", "idéalement", "de préférence"
- missions_principales : les 3-5 responsabilités clés du poste

---

## ÉTAPE 2 — Extraction du CV
Pour chaque critère identifié à l'étape 1 :
- Trouve l'élément correspondant dans le CV (ou note l'absence)
- Cite la source exacte (ex: "Cellenza — Talent Acquisition Manager")
- Note si la correspondance est directe, partielle ou absente

---

## ÉTAPE 3 — Scoring pondéré
Calcule un score sur 100 avec la pondération suivante :
- Critères obligatoires : 60 points max
- Critères souhaités : 20 points max
- Cohérence globale (secteur, niveau, culture) : 20 points max

Donne un score détaillé par catégorie.

---

## ÉTAPE 4 — Points forts / frictions
Identifie :
- 3 à 5 points forts avec citation des éléments CV correspondants
- 2 à 4 points de friction ou manques (sans dramatiser)

---

## ÉTAPE 5 — Recommandations d'adaptation
Pour cette annonce spécifique :
- Reformulations d'accroche ou de titre suggérées
- Bullets à mettre en avant ou reformuler
- Éléments à dé-emphasiser
- Mots-clés de l'annonce absents du CV à intégrer si pertinent

---

## FORMAT DE RÉPONSE
Réponds avec ce JSON exact (pas de champs supplémentaires) :
{
  "score": <number 0-100>,
  "scoreDetail": {
    "obligatoires": <number 0-60>,
    "souhaites": <number 0-20>,
    "coherenceGlobale": <number 0-20>
  },
  "extraction": {
    "criteresObligatoires": [
      { "critere": "<texte>", "statutCV": "present|partiel|absent", "sourceCV": "<citation ou null>" }
    ],
    "criteresSouhaites": [
      { "critere": "<texte>", "statutCV": "present|partiel|absent", "sourceCV": "<citation ou null>" }
    ],
    "missionsPrincipales": ["<mission 1>", "<mission 2>", "<mission 3>"]
  },
  "pointsForts": [
    { "titre": "<titre court>", "detail": "<explication avec référence CV>" }
  ],
  "pointsFrictions": [
    { "titre": "<titre court>", "detail": "<explication factuelle, ton neutre>" }
  ],
  "recommandations": {
    "accroche": "<nouvelle formulation suggérée ou null>",
    "bulletsAMettrEnAvant": ["<élément 1>", "<élément 2>"],
    "bulletsAReformule": [
      { "original": "<texte actuel>", "suggestion": "<nouvelle version>" }
    ],
    "motsClesManquants": ["<mot-clé annonce absent du CV>"]
  }
}
`.trim();

// ------------------------------------------------------------------
// 2. TYPES
// ------------------------------------------------------------------

export interface CritereMatch {
  critere: string;
  statutCV: 'present' | 'partiel' | 'absent';
  sourceCV: string | null;
}

export interface PointItem {
  titre: string;
  detail: string;
}

export interface BulletReformule {
  original: string;
  suggestion: string;
}

export interface AnalysisResult {
  score: number;
  scoreDetail: {
    obligatoires: number;
    souhaites: number;
    coherenceGlobale: number;
  };
  extraction: {
    criteresObligatoires: CritereMatch[];
    criteresSouhaites: CritereMatch[];
    missionsPrincipales: string[];
  };
  pointsForts: PointItem[];
  pointsFrictions: PointItem[];
  recommandations: {
    accroche: string | null;
    bulletsAMettrEnAvant: string[];
    bulletsAReformule: BulletReformule[];
    motsClesManquants: string[];
  };
}

// ------------------------------------------------------------------
// 3. CONSTRUCTION DU MESSAGE UTILISATEUR
// ------------------------------------------------------------------

export function buildUserMessage(cvText: string, jobText: string): string {
  return `--- CV ---
${cvText.trim()}

--- ANNONCE ---
${jobText.trim()}`.trim();
}

// ------------------------------------------------------------------
// 4. APPEL API
// ------------------------------------------------------------------

/**
 * Analyse l'adéquation entre un CV et une annonce via l'API Claude.
 * La clé API est lue depuis les settings SQLite (clé : 'anthropic_api_key').
 * On peut aussi la passer directement en paramètre (utile pour les tests).
 */
export async function analyzeCV(
  cvText: string,
  jobText: string,
  apiKey?: string,
): Promise<AnalysisResult> {
  const key = apiKey ?? (await getSetting('anthropic_api_key'));
  if (!key) {
    throw new Error(
      "Clé API Anthropic manquante. Configure-la dans Paramètres → Clé API.",
    );
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildUserMessage(cvText, jobText),
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(
      `Erreur API ${response.status}: ${err?.error?.message ?? response.statusText}`,
    );
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text: string }>;
  };
  const raw = data.content
    ?.filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('') ?? '';

  return parseAnalysisResult(raw);
}

// ------------------------------------------------------------------
// 5. PARSING DE LA RÉPONSE
// ------------------------------------------------------------------

export function parseAnalysisResult(raw: string): AnalysisResult {
  try {
    const clean = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const parsed = JSON.parse(clean) as Partial<AnalysisResult>;

    const required: Array<keyof AnalysisResult> = [
      'score',
      'scoreDetail',
      'extraction',
      'pointsForts',
      'pointsFrictions',
      'recommandations',
    ];
    for (const key of required) {
      if (!(key in parsed)) throw new Error(`Champ manquant : ${key}`);
    }

    return parsed as AnalysisResult;
  } catch (err) {
    console.error('Erreur parsing analyse CV :', err, '\nRaw:', raw);
    throw new Error("La réponse du modèle n'est pas un JSON valide. Réessaie.");
  }
}

// ------------------------------------------------------------------
// 6. HELPERS D'AFFICHAGE
// ------------------------------------------------------------------

export type ScoreColor = 'success' | 'warning' | 'danger';

export function scoreColor(score: number): ScoreColor {
  if (score >= 75) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

export type StatutCV = 'present' | 'partiel' | 'absent';

export function statutLabel(statut: StatutCV): string {
  const labels: Record<StatutCV, string> = {
    present: '✓ Présent',
    partiel: '~ Partiel',
    absent: '✗ Absent',
  };
  return labels[statut] ?? statut;
}
