/**
 * Unified salary normalisation for all parsers.
 * Converts any period (monthly, hourly, daily) to annual amounts.
 */

export interface NormalizedSalary {
  min: number | null;
  max: number | null;
  raw: string | null;
}

const MULTIPLIERS: Record<string, number> = {
  monthly: 12,
  month:   12,
  mensuel: 12,
  mois:    12,
  daily:   220,  // ~220 working days/year
  day:     220,
  jour:    220,
  hourly:  1_820, // 35h × 52w
  hour:    1_820,
  heure:   1_820,
  yearly:  1,
  year:    1,
  annual:  1,
  annuel:  1,
};

/**
 * Normalise min/max salary values to annual amounts.
 * @param min     Raw minimum value
 * @param max     Raw maximum value (may equal min)
 * @param currency Currency code or symbol (e.g. 'EUR', '€')
 * @param period  Pay period string (e.g. 'monthly', 'yearly', 'hour')
 */
export function normalizeSalary(
  min: number | null,
  max: number | null,
  currency: string,
  period: string,
): NormalizedSalary {
  if (min === null && max === null) return { min: null, max: null, raw: null };

  const multiplier = MULTIPLIERS[period.toLowerCase()] ?? 1;
  const normMin = min !== null ? Math.round(min * multiplier) : null;
  const normMax = max !== null ? Math.round(max * multiplier) : null;

  const cur = currency === 'EUR' ? '€' : currency;
  let raw: string;
  if (normMin !== null && normMax !== null && normMax !== normMin) {
    raw = `${normMin.toLocaleString('fr-FR')}–${normMax.toLocaleString('fr-FR')} ${cur}/an`;
  } else if (normMin !== null) {
    raw = `${normMin.toLocaleString('fr-FR')} ${cur}/an`;
  } else {
    raw = `${normMax!.toLocaleString('fr-FR')} ${cur}/an`;
  }

  return { min: normMin, max: normMax, raw };
}

/** Try to extract a salary range from free-form text (e.g. "45k-55k€") */
const SALARY_RE = /(\d[\d\s]*(?:\.\d+)?)\s*k?\s*[€$£]?\s*[-–à]\s*(\d[\d\s]*(?:\.\d+)?)\s*k?\s*[€$£]/i;
const SALARY_SINGLE = /(\d[\d\s]*(?:\.\d+)?)\s*k\s*[€$£]?/i;

export function extractSalaryFromText(text: string): NormalizedSalary {
  const range = SALARY_RE.exec(text);
  if (range) {
    const factor = text.slice(range.index).toLowerCase().includes('k') ? 1_000 : 1;
    const min = parseFloat(range[1].replace(/\s/g, '')) * factor;
    const max = parseFloat(range[2].replace(/\s/g, '')) * factor;
    return normalizeSalary(min, max, '€', 'yearly');
  }
  const single = SALARY_SINGLE.exec(text);
  if (single) {
    const val = parseFloat(single[1].replace(/\s/g, '')) * 1_000;
    return normalizeSalary(val, null, '€', 'yearly');
  }
  return { min: null, max: null, raw: null };
}
