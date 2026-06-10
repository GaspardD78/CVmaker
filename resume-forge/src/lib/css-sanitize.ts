/**
 * css-sanitize.ts — validation des valeurs CSS issues des réglages de CV.
 *
 * Les réglages (cv.settings) sont stockés en base et peuvent provenir d'un
 * backup importé ou d'une synchronisation Drive : ils ne sont pas dignes de
 * confiance. Ces helpers garantissent qu'une valeur interpolée dans une
 * feuille de style (PrintableCV injecte du CSS via dangerouslySetInnerHTML)
 * ne peut pas fermer la règle ni introduire de directive dangereuse
 * (url(), expression(), @import, </style>…).
 *
 * Une valeur invalide est remplacée par '' — le style par défaut s'applique.
 */

export type CssValueKind = 'color' | 'length' | 'keyword' | 'fontFamily';

const PATTERNS: Record<CssValueKind, RegExp> = {
  // Hex #rgb → #rrggbbaa, nom de couleur, ou fonction couleur numérique
  color: /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|rgba|hsl|hsla|oklch)\([\d\s.,%/]+\))$/i,
  // Longueurs simples ou composées : "11px", "8px 10px", "1.4", "120%"
  length: /^-?\d*\.?\d+(px|pt|em|rem|%)?(\s+-?\d*\.?\d+(px|pt|em|rem|%)?){0,3}$/,
  // Mots-clés CSS : "uppercase", "italic", "dashed", "600"
  keyword: /^[a-z0-9-]+$/i,
  // Piles de polices : "Georgia, 'Times New Roman', serif"
  fontFamily: /^[\w\s,'"-]+$/,
};

/** Retourne `value` si elle est sûre pour le `kind` donné, sinon ''. */
export function safeCssValue(value: string, kind: CssValueKind): string {
  const v = value.trim();
  if (!v) return '';
  return PATTERNS[kind].test(v) ? v : '';
}
