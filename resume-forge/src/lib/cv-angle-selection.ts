/**
 * Choix de l'angle dans le générateur de CV (drawer Veille) et ses effets :
 * options du prompt, contexte du garde-fou, instantané `cv.settings.cvAngle`.
 * Fonctions pures.
 */
import type { MasterEntry } from '@/types/profile';
import { angleSnapshot, resolveAngle, type AngleSpec, type CvAngle, type CvAngleSnapshot } from './cv-angles';

export type AngleSelection =
  | { mode: 'none' }
  /** Mode 1 : un angle de la bibliothèque. */
  | { mode: 'library'; angleId: string }
  /** Mode 1 : l'IA choisit parmi la bibliothèque (analyse.angle). */
  | { mode: 'auto' }
  /** Mode 2 : proposition retenue (éventuellement modifiée), pour ce CV seulement. */
  | { mode: 'proposal'; proposal: AngleSpec };

export const NO_ANGLE: AngleSelection = { mode: 'none' };

/** Angle à transmettre au prompt et au garde-fou : imposé, ou bibliothèque à choisir. */
export function angleOptions(
  selection: AngleSelection,
  library: readonly CvAngle[],
  entries: readonly MasterEntry[],
): { angle?: AngleSpec; angleChoices?: AngleSpec[] } {
  switch (selection.mode) {
    case 'library': {
      const angle = library.find(a => a.id === selection.angleId);
      return angle ? { angle: resolveAngle(angle, entries) } : {};
    }
    case 'auto':
      return library.length > 0 ? { angleChoices: library.map(a => resolveAngle(a, entries)) } : {};
    case 'proposal':
      return { angle: selection.proposal };
    default:
      return {};
  }
}

/**
 * Instantané à enregistrer dans `cv.settings.cvAngle` à la génération, ou
 * `null` sans angle. En mode `auto`, l'angle est celui que le garde-fou a
 * appliqué (`report.angle`, d'après analyse.angle).
 */
export function selectionSnapshot(
  selection: AngleSelection,
  library: readonly CvAngle[],
  entries: readonly MasterEntry[],
  appliedAngle?: AngleSpec,
): CvAngleSnapshot | null {
  if (selection.mode === 'auto') return appliedAngle ? angleSnapshot(appliedAngle, 'auto') : null;
  const { angle } = angleOptions(selection, library, entries);
  if (!angle) return null;
  return angleSnapshot(angle, selection.mode === 'proposal' ? 'proposal' : 'library');
}
