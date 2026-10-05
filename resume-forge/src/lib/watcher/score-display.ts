/**
 * Affichage du score : entier, avec décomposition lisible.
 *
 * Les écarts de score viennent surtout du salaire (+20/-30) et de l'ancienneté
 * (-2 pts/jour), pas de l'adéquation au poste : montrer le seul total (et avec
 * trois décimales) rend ces scores incompréhensibles.
 */

import type { ScoreBreakdown } from './scorer';

export const formatScore = (score: number): number => Math.round(score);

export interface BreakdownPart {
  key: 'title' | 'skills' | 'domain' | 'contract' | 'salary' | 'age' | 'learned';
  label: string;
  points: number;
}

/** Composantes non nulles (le titre, les mots-clés et le domaine sont toujours listés). */
export function breakdownParts(b: ScoreBreakdown): BreakdownPart[] {
  const all: BreakdownPart[] = [
    { key: 'title',    label: 'Titre',          points: b.titleMatchScore },
    { key: 'skills',   label: 'Mots-clés',      points: b.skillsScore },
    { key: 'domain',   label: 'Domaine',        points: b.domainScore },
    { key: 'contract', label: 'Contrat',        points: b.contractMatchScore },
    { key: 'salary',   label: 'Salaire',        points: b.salaryScore },
    { key: 'age',      label: 'Ancienneté',     points: b.decayPenalty },
    { key: 'learned',  label: 'Appris',         points: Math.round(b.learnedScore) },
  ];
  const always = new Set(['title', 'skills', 'domain']);
  return all.filter(p => always.has(p.key) || p.points !== 0);
}

/** « Titre +40, Mots-clés +6, Domaine +0, Salaire -30, Ancienneté -8 » */
export function formatBreakdown(b: ScoreBreakdown): string {
  if (b.disqualified) return b.disqualifyReason ?? 'Offre écartée';
  const parts = breakdownParts(b).map(p => `${p.label} ${p.points >= 0 ? '+' : ''}${p.points}`);
  if (b.capApplied) parts.push('plafonné à 25');
  return parts.join(', ');
}
