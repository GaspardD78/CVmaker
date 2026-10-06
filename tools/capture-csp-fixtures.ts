/**
 * Capture de fixtures réelles « Choisir le service public » (spec 007).
 *
 * À lancer depuis une machine ordinaire (le bac à sable de développement n'a
 * pas accès au site) :
 *
 *   bun run tools/capture-csp-fixtures.ts "chargé de recrutement"
 *
 * Écrit dans resume-forge/src/lib/watcher/parsers/__fixtures__/ :
 *   csp-list.html            page de liste (versant FPT)
 *   csp-offer-et.html        première offre d'origine Emploi Territorial rencontrée (réf. O0…)
 *   csp-offer-pep.html       première offre d'origine Place de l'emploi public
 *
 * Politesse : UA honnête, une requête par seconde, une page de liste et au plus
 * 12 pages d'offre. Aucun contournement : si le site répond autre chose que 200,
 * le script s'arrête.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HOST = 'https://choisirleservicepublic.gouv.fr';
const UA = 'ResumeForge/1.3 (veille emploi personnelle)';
const OUT = join(import.meta.dir, '..', 'resume-forge', 'src', 'lib', 'watcher', 'parsers', '__fixtures__');
const keywords = process.argv[2] ?? 'chargé de recrutement';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function get(url: string): Promise<string> {
  await sleep(1000);
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' } });
  if (res.status !== 200) throw new Error(`HTTP ${res.status} sur ${url} — arrêt (pas de contournement)`);
  return res.text();
}

mkdirSync(OUT, { recursive: true });
const listUrl = `${HOST}/nos-offres/filtres/mot-cles/${encodeURIComponent(keywords)}/versant/2458/`;
const list = await get(listUrl);
writeFileSync(join(OUT, 'csp-list.html'), list);
console.log(`liste : ${list.length} octets`);

const links = [...new Set([...list.matchAll(/href="([^"]*\/offre-emploi\/[^"]+)"/g)].map(m => new URL(m[1], HOST).pathname))];
console.log(`${links.length} liens /offre-emploi/ trouvés`);
let et = false, pep = false;
for (const path of links.slice(0, 12)) {
  if (et && pep) break;
  const html = await get(`${HOST}${path}`);
  const isEt = /emploi-territorial\.fr\/offre\//i.test(html) || /\bO0\d{10,}/.test(html);
  if (isEt && !et) { writeFileSync(join(OUT, 'csp-offer-et.html'), html); et = true; console.log('offre ET :', path); }
  if (!isEt && !pep) { writeFileSync(join(OUT, 'csp-offer-pep.html'), html); pep = true; console.log('offre PEP :', path); }
}
console.log(`terminé (ET: ${et}, PEP: ${pep}). Relancez : cd resume-forge && bun test`);
