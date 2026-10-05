/**
 * Règles du moteur de scoring décrites en langage clair, GÉNÉRÉES depuis les
 * constantes du scorer : si un poids change, le prompt d'analyse change avec lui.
 */

import { SCORING_WEIGHTS as W } from './scorer';

const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

export const EXCLUSION_WARNING =
  "Un terme exclu élimine toute offre qui le contient dans son titre OU sa description " +
  "(selon sa portée). Ne propose une exclusion que pour un terme qui n'apparaît pas dans " +
  "la description d'offres pertinentes.";

export function describeEngineRules(): string[] {
  return [
    `Le score va de 0 à 100. Il est gagné point par point (base 0) quand la piste a des intitulés ; ` +
      `sans intitulé, la base est ${W.baseWithoutTitles}.`,
    `VETO : un terme exclu met le score à 0. Portée « titre » : le terme doit figurer dans le titre. ` +
      `Portée « titre + description » : titre OU description. ${EXCLUSION_WARNING}`,
    `Intitulés visés (signal le plus fort) : trouvé dans le titre ${signed(W.titleOther)} à ${signed(W.titleHigh)} ; ` +
      `trouvé seulement dans la description ${signed(W.titleInDescription)} ; ` +
      `aucun intitulé trouvé dans le titre : score plafonné à ${W.balancedCap} (mode équilibré) ou offre écartée (mode strict).`,
    `Mots-clés bonus (champ « skills ») : ${signed(W.skillInTitle)} par mot-clé dans le titre (max ${signed(W.skillInTitleCap)}), ` +
      `${signed(W.skillInDescription)} dans la description (max ${signed(W.skillInDescriptionCap)}). Jamais éliminatoires.`,
    `Domaines bonus (champ « domains ») : ${signed(W.domainMatch)} par domaine trouvé, max ${signed(W.domainCap)}. ` +
      `Jamais éliminatoires. Un domaine pèse au plus ${signed(W.domainCap)}, contre ${signed(W.titleHigh)} pour le titre.`,
    `Domaines obligatoires (optionnel) : si la liste est non vide et qu'aucun terme n'est présent, ` +
      `score plafonné à ${W.balancedCap} (écarté en mode strict).`,
    `Contrat : ${signed(W.contractMatch)} s'il correspond, ${signed(W.contractMismatch)} s'il diffère et que le contrat est connu (écarté en mode strict).`,
    `Salaire annoncé (minimum de l'offre) : ${signed(W.salaryAboveTarget)} si ≥ ${Math.round(W.salaryAboveTargetRatio * 100)} % du salaire cible, ` +
      `${signed(W.salaryNearTarget)} si ≥ ${Math.round(W.salaryNearTargetRatio * 100)} %, ${signed(W.salaryBelowMin)} s'il est sous le salaire minimum. ` +
      `Le salaire pèse donc autant que l'adéquation au poste : une offre sans salaire n'est ni bonifiée ni pénalisée.`,
    `Ancienneté : ${signed(-W.decayPerDay)} points par jour depuis la publication, jusqu'à ${signed(-W.decayCap)}. ` +
      `Un score bas peut simplement signifier une offre ancienne.`,
    `Apprentissage : termes des offres triées, ${signed(W.learnedTotalCap)} / ${signed(-W.learnedTotalCap)} au plus (${W.learnedPerTermCap} par terme) ; ` +
      `réputation d'entreprise ±${W.companyReputation}.`,
  ];
}
