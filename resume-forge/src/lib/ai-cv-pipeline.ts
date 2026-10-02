import { guardAiCv, type GuardContext, type GuardReport } from './ai-cv-guard';
import { parseAiCvResponse, type AiCvResponse } from './ai-cv-response';

export type AiCvAnalysis =
  | { ok: true; /** Réponse nettoyée (à appliquer). */ data: AiCvResponse; report: GuardReport }
  | { ok: false; error: string };

/**
 * Chaîne complète « JSON collé -> réponse exploitable » : parse tolérant puis
 * garde-fou. Point d'entrée unique des deux écrans (drawer Veille, panneau IA du
 * CV) pour que l'aperçu du rapport et l'application utilisent exactement les
 * mêmes données.
 */
export function analyzeAiCvJson(raw: string, ctx: GuardContext): AiCvAnalysis {
  let parsed: AiCvResponse;
  try {
    parsed = parseAiCvResponse(raw);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'JSON invalide' };
  }
  const { data, report } = guardAiCv(parsed, ctx);
  return { ok: true, data, report };
}
