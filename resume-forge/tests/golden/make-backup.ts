/**
 * Génère un fichier de sauvegarde ResumeForge (format de src/lib/backup.ts)
 * contenant une fixture golden, pour la charger dans l'app et exporter le PDF
 * qui servira à la validation croisée (compare-pdf.ts).
 *
 *   bun tests/golden/make-backup.ts <fixture> <template> [sortie.json]
 *
 * Modules inclus : Profil, Entrées CV, Documents CV. À l'import, l'app
 * rattache le profil au profil connecté : importer depuis un profil de test
 * dédié, jamais depuis le profil principal (voir README).
 */
import { writeFileSync } from 'node:fs';
import { loadFixture } from './lib/fixtures';

const [fixture, template, outArg] = process.argv.slice(2);
if (!fixture || !template) {
  console.error('Usage : bun tests/golden/make-backup.ts <fixture> <template> [sortie.json]');
  process.exit(2);
}
const { data } = loadFixture(fixture, template);
const { profile: p, entries, cv, blocks } = data;
const ts = '2026-01-01 00:00:00';

const profiles = [{
  id: p.id, first_name: p.firstName, last_name: p.lastName, email: p.email, phone: p.phone,
  address: p.address, city: p.city, postal_code: p.postalCode, country: p.country,
  linkedin_url: p.linkedinUrl, github_url: p.githubUrl, portfolio_url: p.portfolioUrl,
  photo_path: p.photoPath, title: p.title, summary: p.summary, created_at: ts, updated_at: ts,
}];
const master_entries = entries.map((e) => ({
  id: `golden-${e.id}`, profile_id: p.id, entry_type: e.entryType, title: e.title, subtitle: e.subtitle,
  location: e.location, start_date: e.startDate, end_date: e.endDate, is_current: e.isCurrent ? 1 : 0,
  description: e.description, metadata: '{}', sort_order: e.sortOrder, tags: '[]', created_at: ts, updated_at: ts,
}));
const cv_documents = [{
  id: `golden-cv-${fixture}-${template}`, profile_id: p.id, name: `${cv.name} (${template})`, template_id: template,
  target_job: cv.targetJob, target_company: cv.targetCompany, custom_summary: cv.customSummary,
  settings: JSON.stringify(cv.settings), is_favorite: 0, last_exported: null, markdown_content: null,
  markdown_mode: 0, created_at: ts, updated_at: ts,
}];
const cv_blocks = blocks.map((b) => ({
  id: `golden-${fixture}-${template}-${b.id}`, cv_id: cv_documents[0].id, entry_id: b.entryId ? `golden-${b.entryId}` : null,
  block_type: b.blockType, section_name: b.sectionName, custom_content: b.customContent, sort_order: b.sortOrder,
  is_visible: 1, override_data: JSON.stringify(b.overrideData), created_at: ts,
}));

const backup = {
  __cvmaker_backup: true,
  version: '1.0',
  exportDate: '2026-01-01T00:00:00.000Z',
  modules: { profiles, master_entries, cv_documents, cv_blocks },
  counts: { profile: 1, masterEntries: master_entries.length, cvDocuments: 1 + cv_blocks.length },
};
const out = outArg ?? `golden-${fixture}-${template}.json`;
writeFileSync(out, JSON.stringify(backup, null, 2));
console.log(`Sauvegarde écrite : ${out}`);
