import { describe, it, expect } from 'bun:test';
import {
  haversineKm,
  extractDeptFromLocationText,
  classifyOfferZone,
  type GeoZone,
} from './geo';

// Zone de référence : Carrières-sous-Poissy (78), le cas réel du bug —
// des offres à Auch (32), Cholet (49) et Biarritz (64) remontaient dans la
// veille malgré un rayon de 30 km.
const CARRIERES: GeoZone = { lat: 48.951, lon: 2.041, inseeCode: '78123', deptCode: '78' };

const offer = (
  lat: number | null,
  lon: number | null,
  location: string | null,
) => ({ locationLat: lat, locationLon: lon, location });

describe('haversineKm', () => {
  it('computes known distances within tolerance', () => {
    // Paris ↔ Lyon ≈ 392 km
    const d = haversineKm(48.8566, 2.3522, 45.7640, 4.8357);
    expect(d).toBeGreaterThan(380);
    expect(d).toBeLessThan(405);
  });

  it('is zero for identical points', () => {
    expect(haversineKm(48.95, 2.04, 48.95, 2.04)).toBe(0);
  });
});

describe('extractDeptFromLocationText', () => {
  it('parses France Travail style "32 - Auch"', () => {
    expect(extractDeptFromLocationText('32 - Auch')).toBe('32');
    expect(extractDeptFromLocationText('64 - Biarritz')).toBe('64');
  });

  it('parses "Ville (dept)" and "Ville - dept"', () => {
    expect(extractDeptFromLocationText('Auch (32)')).toBe('32');
    expect(extractDeptFromLocationText('Levallois-Perret – 92')).toBe('92');
  });

  it('handles Corsica and DOM codes', () => {
    expect(extractDeptFromLocationText('2A - Ajaccio')).toBe('2A');
    expect(extractDeptFromLocationText('974 - Saint-Denis')).toBe('974');
  });

  it('returns null when no recognisable dept code', () => {
    expect(extractDeptFromLocationText('Paris')).toBeNull();
    expect(extractDeptFromLocationText('France entière')).toBeNull();
    expect(extractDeptFromLocationText('Télétravail')).toBeNull();
    expect(extractDeptFromLocationText(null)).toBeNull();
    expect(extractDeptFromLocationText('')).toBeNull();
  });

  it('rejects codes that are not real departments', () => {
    expect(extractDeptFromLocationText('99 - Nulle Part')).toBeNull();
  });
});

describe('classifyOfferZone — GPS coordinates', () => {
  it('keeps an offer inside the radius (Poissy, ~2 km)', () => {
    expect(classifyOfferZone(offer(48.929, 2.049, '78 - Poissy'), CARRIERES, 30)).toBe('in');
  });

  it('keeps Paris within a 30 km radius (~25 km + marge GPS)', () => {
    expect(classifyOfferZone(offer(48.8566, 2.3522, '75 - Paris'), CARRIERES, 30)).toBe('in');
  });

  it('rejects Auch at ~600 km (the reported bug)', () => {
    expect(classifyOfferZone(offer(43.646, 0.586, '32 - Auch'), CARRIERES, 30)).toBe('out');
  });

  it('rejects Cholet and Biarritz', () => {
    expect(classifyOfferZone(offer(47.058, -0.878, '49 - Cholet'), CARRIERES, 30)).toBe('out');
    expect(classifyOfferZone(offer(43.480, -1.558, '64 - Biarritz'), CARRIERES, 30)).toBe('out');
  });

  it('radius 0 (ville uniquement) still tolerates the GPS margin', () => {
    expect(classifyOfferZone(offer(48.929, 2.049, null), CARRIERES, 0)).toBe('in');
    expect(classifyOfferZone(offer(48.8566, 2.3522, null), CARRIERES, 0)).toBe('out');
  });
});

describe('classifyOfferZone — department fallback (no GPS)', () => {
  it('rejects a text-only offer with a far-away dept code', () => {
    expect(classifyOfferZone(offer(null, null, '32 - Auch'), CARRIERES, 30)).toBe('out');
  });

  it('keeps neighbouring departments (large margin, fail-open spirit)', () => {
    expect(classifyOfferZone(offer(null, null, '75 - Paris'), CARRIERES, 30)).toBe('in');
    expect(classifyOfferZone(offer(null, null, '95 - Cergy'), CARRIERES, 30)).toBe('in');
    expect(classifyOfferZone(offer(null, null, 'Nanterre (92)'), CARRIERES, 30)).toBe('in');
  });

  it('returns unknown when no GPS and no dept code (offer kept)', () => {
    expect(classifyOfferZone(offer(null, null, 'Paris'), CARRIERES, 30)).toBe('unknown');
    expect(classifyOfferZone(offer(null, null, null), CARRIERES, 30)).toBe('unknown');
  });
});
