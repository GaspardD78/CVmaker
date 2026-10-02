/**
 * Structure des sections d'un CV : niveau des en-têtes, élagage des en-têtes
 * vides, format d'affichage hérité du parent. Fonctions pures partagées par le
 * rendu écran/PDF (`PrintableCV`), l'export DOCX et `applyAiCvToBlocks`, pour
 * que les trois voient la même structure.
 *
 * Un `section_header` est de niveau « sous-en-tête » quand
 * `overrideData.level === 'sub'` (catégories de compétences) ; sinon c'est un
 * titre de section.
 */

/** Normalisation des libellés : sans casse, sans accents, espaces réduits. */
export function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface HeaderLike {
  blockType: 'section_header' | 'entry_ref' | 'custom_text';
  overrideData?: Record<string, unknown> | null;
}

/** `true` pour un sous-en-tête de catégorie (`section_header` de niveau `sub`). */
export function isSubHeader(block: HeaderLike): boolean {
  return block.blockType === 'section_header' && block.overrideData?.level === 'sub';
}

/** `true` pour un titre de section (`section_header` qui n'est pas un sous-en-tête). */
export function isSectionHeader(block: HeaderLike): boolean {
  return block.blockType === 'section_header' && !isSubHeader(block);
}

/** Nature d'un élément à rendre, du point de vue de l'élagage. */
export type SlotKind = 'section' | 'sub' | 'content' | 'skip';

/**
 * Pour chaque élément, `false` quand c'est un en-tête à masquer parce qu'aucun
 * contenu ne le suit :
 * - un titre de section est conservé s'il y a au moins un contenu avant le
 *   prochain titre de section (sous-en-têtes compris) ;
 * - un sous-en-tête est conservé s'il y a au moins un contenu avant le prochain
 *   en-tête, de n'importe quel niveau.
 * Les éléments `content` et `skip` sont toujours conservés (`true`).
 */
export function visibleHeaderMask(kinds: readonly SlotKind[]): boolean[] {
  const keep = kinds.map(() => true);
  let sectionIdx = -1;
  let sectionHasContent = false;
  let subIdx = -1;
  let subHasContent = false;
  const closeSub = () => {
    if (subIdx >= 0 && !subHasContent) keep[subIdx] = false;
    subIdx = -1;
    subHasContent = false;
  };
  const closeSection = () => {
    closeSub();
    if (sectionIdx >= 0 && !sectionHasContent) keep[sectionIdx] = false;
    sectionIdx = -1;
    sectionHasContent = false;
  };
  kinds.forEach((kind, i) => {
    if (kind === 'section') {
      closeSection();
      sectionIdx = i;
    } else if (kind === 'sub') {
      closeSub();
      subIdx = i;
    } else if (kind === 'content') {
      subHasContent = true;
      sectionHasContent = true;
    }
  });
  closeSection();
  return keep;
}

/**
 * Format d'affichage (`overrideData.displayFormat`) du titre de SECTION qui
 * précède `index` : les sous-en-têtes sont ignorés (la catégorie hérite du
 * format de sa section). `undefined` quand aucun titre de section ne précède.
 */
export function parentDisplayFormat<T extends HeaderLike>(blocks: readonly T[], index: number): string | undefined {
  for (let k = index - 1; k >= 0; k--) {
    if (isSectionHeader(blocks[k])) {
      const format = blocks[k].overrideData?.displayFormat;
      return typeof format === 'string' ? format : undefined;
    }
  }
  return undefined;
}
