/**
 * Normalisation typographique déterministe du texte produit par l'IA, appliquée
 * avant l'écriture dans les blocs : le LLM externe peut désobéir aux consignes de
 * style, ces corrections sont sûres (elles ne changent jamais le sens) et
 * idempotentes.
 */

const NBSP = ' ';
/** Marqueurs de puces que le rendu ne reconnaît pas (il ne gère que « - » et « * »). */
const FOREIGN_BULLET = /^\s*[•·▪▫●○◦‣∙–]\s+/;
const ABBREVIATION_END = /\b(etc|inc|ltd|sa|sas|co)\.$/i;

/**
 * Corrige le texte d'une ligne ou d'un paragraphe :
 * - tiret cadratin « — » remplacé par « - » (toutes langues) ;
 * - français : espace insécable avant « : ; ? ! », guillemets droits remplacés par « ».
 */
export function normalizeTypography(text: string, language: string): string {
  let out = text.replace(/[ \t]*—[ \t]*/g, ' - ');
  if (language === 'fr') {
    // « ? ! ; » : espace insécable avant, si suivis d'un espace, d'une fin ou d'une ponctuation fermante.
    out = out.replace(/([^\s ])[  ]*([;?!])(?=\s|$|[)"»])/g, `$1${NBSP}$2`);
    // « : » seulement après un mot ou un chiffre et avant un espace (ni URL, ni horaires).
    out = out.replace(/([\p{L}\p{N})%])[  ]*:(?=\s|$)/gu, `$1${NBSP}:`);
    out = out.replace(/"([^"\n]+)"/g, `«${NBSP}$1${NBSP}»`);
  }
  return out;
}

/**
 * Normalise une description en liste à puces :
 * - marqueurs étrangers (• – ·…) ramenés à « - » ;
 * - point final retiré de chaque puce (ponctuation de fin homogène) ;
 * - typographie de la langue, lignes vides supprimées.
 * Un texte sans puce (paragraphe) garde sa ponctuation.
 */
export function normalizeDescription(description: string, language: string): string {
  const lines = description.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim() !== '');
  return lines
    .map(line => {
      const isBullet = FOREIGN_BULLET.test(line) || /^\s*[-*]\s+/.test(line);
      let text = line.replace(FOREIGN_BULLET, '- ').replace(/^\s*\*\s+/, '- ').replace(/^\s+/, '');
      text = normalizeTypography(text, language);
      if (isBullet && text.endsWith('.') && !text.endsWith('..') && !ABBREVIATION_END.test(text)) {
        text = text.slice(0, -1).trimEnd();
      }
      return text;
    })
    .join('\n');
}
