/**
 * Prompt de ciblage : section « Cible et intention », règle des mots-clés ATS et règle
 * de titre selon la fiche. Fonctions pures. Les fiches sont des consignes de rédaction :
 * elles n'ajoutent aucun fait au CV.
 */
import { applyWording, type Wording } from './cv-wording';
import { FIRST_READERS, INTENTS, TARGET_TYPES, type AtsLevel, Equivalence, FirstReader, Intent, ResolvedTarget, TargetBrief, TargetTitleRule } from './cv-targets';

const list = (items: readonly string[]): string => items.join(' ; ');
const bullets = (items: readonly string[]): string => items.map(i => `- ${i}`).join('\n');
const arrows = (eq: readonly Equivalence[]): string => eq.map(e => `${e.from} → ${e.to}`).join(' ; ');

// ── Mots-clés ATS ────────────────────────────────────────────────────────────

/** Règle « MOTS-CLÉS » selon le niveau ATS. `strict` : texte historique. */
export function atsRule(level: AtsLevel): string {
  if (level === 'strict') {
    return "- MOTS-CLÉS ATS : chaque indispensable étayé apparaît au moins une fois sous sa forme exacte (titre, accroche, compétences ou puces). Si l'annonce emploie un sigle et sa forme longue, écris les deux une fois (« SIEM (Security Information and Event Management) »).";
  }
  if (level === 'leger') {
    return "- MOTS-CLÉS (ATS léger) : ce CV sera retrouvé plus tard par recherche de mots-clés dans un vivier. Les intitulés et compétences standards du métier visé (tirés des postes envisagés de la cible), sous leur forme la plus courante, apparaissent une fois chacun (titre, accroche, compétences ou puces), sans répétition forcée. Si un sigle et sa forme longue sont d'usage, écris les deux une fois.";
  }
  return "- MOTS-CLÉS : les mots-clés de l'annonce apparaissent naturellement, sans répétition forcée.";
}

// ── Règle de titre ───────────────────────────────────────────────────────────

/** Règle TITRE d'une fiche. Requiert un titre de profil ; sans titre, la règle historique s'applique ailleurs. */
export function targetTitleRule(rule: TargetTitleRule, own: string, equivalences: readonly Equivalence[]): string | null {
  const tail = "Ne modifie jamais l'intitulé d'une expérience pour coller à l'annonce.";
  switch (rule) {
    case 'profile':
      return `- TITRE ("title") : « ${own} » tel quel (positionnement choisi par le candidat). Aucun autre intitulé. ${tail}`;
    case 'equivalence': {
      const eq = equivalences.length > 0 ? ` à l'aide des équivalences suivantes : ${arrows(equivalences)}` : '';
      return `- TITRE ("title") : « ${own} » tel quel, ou traduit${eq}. À défaut, l'intitulé exact d'une expérience du profil ; à défaut, « ${own} » tel quel avec une remarque dans "warnings". Aucun autre intitulé. ${tail}`;
    }
    case 'free':
      return `- TITRE ("title") : intitulé libre, conservé tel quel par l'application. Il décrit la fonction visée sans prétendre à un poste que le profil n'a pas occupé (profil : « ${own} »). ${tail}`;
    default:
      return null; // profile+keyword : règle historique de buildTitleRule
  }
}

// ── Section « Cible et intention » ───────────────────────────────────────────

const INTENT_LINES: Record<Intent, string[]> = {
  annonce: ["Démarche : réponse à une annonce. Adapte le vocabulaire et les priorités à ce type de structure, sans jamais t'écarter de l'annonce."],
  spontanee: [
    "Démarche : candidature spontanée. Aucune offre n'est fournie : la cible décrit l'entreprise, les postes envisagés (par ordre de priorité) et les atouts à mettre en avant, et les indispensables de l'étape 0 en sont tirés.",
    "L'accroche reste ouverte sur plusieurs postes possibles, sans promettre un poste précis.",
  ],
  recommandation: [
    "Démarche : CV transmis par une relation du candidat. Aucune offre n'est fournie : la cible décrit l'entreprise, les postes envisagés (par ordre de priorité) et les atouts à mettre en avant, et les indispensables de l'étape 0 en sont tirés.",
    "L'accroche reste ouverte sur plusieurs postes possibles, sans promettre un poste précis.",
    "La personne qui transmet le CV n'apparaît JAMAIS dans le CV : ni nom, ni fonction, ni formule du type « recommandé par ».",
  ],
  'mobilite-interne': [
    "Démarche : mobilité interne. Le lecteur connaît l'entreprise : emploie son vocabulaire, mets en avant ce qui est transférable vers le poste visé, et ne présente jamais l'entreprise elle-même.",
  ],
  chasseur: [
    "Démarche : réponse à une approche de chasseur ou de cabinet. Le CV est plus complet et factuel (le chasseur le reformulera) : garde visibles toutes les expériences pertinentes ; les chiffres suivent l'orientation retenue.",
  ],
};

const READER_LINES: Record<FirstReader, string> = {
  rh: "Premier lecteur : recruteur ou RH. L'accroche met en avant le processus et les méthodes, de la demande à l'intégration.",
  operationnel: "Premier lecteur : manager opérationnel. L'accroche met en avant le périmètre, les interlocuteurs et les réalisations concrètes.",
  direction: "Premier lecteur : dirigeant. L'accroche met en avant les enjeux, l'autonomie et l'impact sur l'organisation.",
  ats: "Premier lecteur : tri automatique. Intitulés et compétences standards sous leur forme la plus courante, structure simple.",
};

function briefLines(brief: TargetBrief): string[] {
  const out: string[] = [];
  if (brief.company) out.push(`- Entreprise : ${brief.company}`);
  if (brief.activity) out.push(`- Activité : ${brief.activity}`);
  if (brief.hrContext) out.push(`- Contexte RH : ${brief.hrContext}`);
  if (brief.positions?.length) out.push(`- Postes envisagés, par ordre de priorité : ${brief.positions.map((p, i) => `${i + 1}. ${p}`).join(' ; ')}`);
  if (brief.strengths?.length) out.push(`- Atouts à mettre en avant : ${list(brief.strengths)}`);
  if (brief.context) out.push(`- Contexte connu : ${brief.context}`);
  if (brief.referrer) out.push(`- Personne qui transmet le CV : ${brief.referrer} (ne la mentionne JAMAIS dans le CV)`);
  return out;
}

/**
 * Section « Cible et intention ». Vide quand rien n'est précisé (aucun type, annonce, aucun
 * lecteur, aucune cible) : le prompt reste alors identique à celui d'avant le ciblage.
 */
export function buildTargetBlock(target: ResolvedTarget, opts: { mode?: Wording } = {}): string {
  const { sheet, intent, firstReader, readerNote, brief, publicDetails } = target;
  const hasIntent = intent !== 'annonce';
  if (!sheet && !hasIntent && !firstReader && !readerNote && !brief) return '';

  const parts: string[] = ['## Cible et intention'];
  const header = [
    sheet ? `Type de structure : ${sheet.label}` : '',
    ...(hasIntent || sheet ? INTENT_LINES[intent] : []),
  ].filter(Boolean);
  if (header.length > 0) parts.push(bullets(header));

  if (brief) parts.push(`### Cible\n${briefLines(brief).join('\n')}`);

  if (sheet) {
    parts.push(`### Ce que ce type de lecteur cherche à vérifier\n${bullets(sheet.attentes)}`);
    parts.push(`### À mettre en avant\n${bullets(sheet.valorise)}`);
    const avoid = [...sheet.eviter];
    if (sheet.avoidTerms.length > 0) avoid.push(`termes à ne pas employer : ${sheet.avoidTerms.join(', ')}`);
    if (avoid.length > 0) parts.push(`### À éviter\n${bullets(avoid)}`);
    const vocab = [`Registre : ${sheet.vocabulaire.registre}.`];
    if (sheet.vocabulaire.privilegier.length > 0) vocab.push(`Termes à privilégier : ${list(sheet.vocabulaire.privilegier)}.`);
    if (sheet.vocabulaire.equivalences.length > 0) {
      vocab.push(`Équivalences autorisées (les seuls changements de terme permis, jamais pour un poste non tenu) : ${arrows(sheet.vocabulaire.equivalences)}.`);
    }
    parts.push(`### Vocabulaire\n${vocab.join('\n')}`);
    if (sheet.publicFields) {
      const pub: string[] = [];
      if (sheet.publicFields.frenchOnly) pub.push('Intitulés et compétences en français.');
      if (sheet.publicFields.savoirs) pub.push('Les références aux savoirs, savoir-faire et savoir-être sont possibles.');
      if (publicDetails?.categorie) pub.push(`Catégorie visée : ${publicDetails.categorie} (reprise du texte fourni).`);
      if (publicDetails?.filiere) pub.push(`Filière : ${publicDetails.filiere} (reprise du texte fourni).`);
      pub.push("La catégorie et la filière ne sont jamais déduites pour le candidat : seulement reprises du texte fourni.");
      parts.push(`### Fonction publique\n${pub.join('\n')}`);
    }
  }

  if (firstReader) {
    const reader = [READER_LINES[firstReader]];
    if (readerNote) {
      reader.push(`Ce que valorise ce lecteur : « ${readerNote} ». Appuie-toi dessus pour choisir quoi mettre en avant. Ne le mentionne JAMAIS dans le CV et n'attribue JAMAIS au candidat ses compétences ou sa fonction.`);
    }
    parts.push(`### Premier lecteur\n${reader.join('\n')}`);
  } else if (readerNote) {
    parts.push(`### Premier lecteur\nCe que valorise ce lecteur : « ${readerNote} ». Appuie-toi dessus pour choisir quoi mettre en avant. Ne le mentionne JAMAIS dans le CV et n'attribue JAMAIS au candidat ses compétences ou sa fonction.`);
  }

  return applyWording(parts.filter(Boolean).join('\n\n'), opts.mode);
}

// ── Ciblage proposé par l'IA (`analyse.cible`) ───────────────────────────────

export type CibleAxis = 'type' | 'intent' | 'firstReader';

/**
 * Axes que l'IA doit renseigner dans `analyse.cible` : ceux encore par défaut, une fois le
 * ciblage engagé (un type, un lecteur, une cible ou une intention autre que l'annonce).
 * Tout en auto sans rien de détecté : aucun axe, le prompt reste celui d'avant le ciblage.
 */
export function cibleAxesToAsk(target: ResolvedTarget): CibleAxis[] {
  const engaged = target.type !== null || target.firstReader !== null || target.intent !== 'annonce' || Boolean(target.brief) || Boolean(target.readerNote);
  if (!engaged) return [];
  return (['type', 'intent', 'firstReader'] as const).filter(axis => target.sources[axis] === 'default');
}

const AXIS_LABEL: Record<CibleAxis, string> = { type: 'type', intent: 'intention', firstReader: 'premierLecteur' };

/** Valeurs permises pour un axe (sans `annonce` quand le prompt n'a pas de texte d'annonce). */
function axisValues(axis: CibleAxis, mode: Wording | undefined): readonly string[] {
  if (axis === 'type') return TARGET_TYPES;
  if (axis === 'firstReader') return FIRST_READERS;
  return mode === 'cible' ? INTENTS.filter(i => i !== 'annonce') : INTENTS;
}

/** Ligne de l'étape 0 qui demande le ciblage ; vide sans axe à renseigner. */
export function cibleAnalysisLine(axes: readonly CibleAxis[], mode: Wording | undefined): string {
  if (axes.length === 0) return '';
  const parts = axes.map(a => `${AXIS_LABEL[a]} (${axisValues(a, mode).join(' | ')})`);
  return `- cible : renseigne uniquement ${parts.join(', ')}, avec "raison" (une phrase). Les autres axes sont déjà fixés ci-dessus : ne les modifie pas. Ce choix n'est jamais appliqué sur un choix explicite du candidat.`;
}

/** Champ `cible` du schéma JSON ; vide sans axe à renseigner. */
export function cibleSchemaField(axes: readonly CibleAxis[], mode: Wording | undefined): string {
  if (axes.length === 0) return '';
  const fields = axes.map(a => `"${AXIS_LABEL[a]}": "${axisValues(a, mode).join('|')}"`);
  return `,\n    "cible": { ${fields.join(', ')}, "raison": "(une phrase)" }`;
}
