# Plan 004

1. **Phase 1** audit (`AUDIT.md`) + tests rouges A à E (après un refactor neutre : injection du store dans `applyAiCvToBlocks`).
2. **Phase 2** structure : `cv-sections.ts` (niveau de section, élagage des en-têtes vides, `displayFormat` du parent), `apply-ai-cv.ts` (sous-en-têtes, idempotence, langues), `planCvBlockOrder(skillsHeaderId)`, `CVSectionHeader variant`, `PrintableCV`, `CVSidebar`, `export-docx`.
3. **Phase 3** moteur de prompt v2 (blocs composables, `JSON_RULES`), schéma v2, parse tolérant, `ai-cv-guard.ts`, rapport dans les deux UI.
4. **Phase 4** mise en page / pagination / parité d'export.
5. **Phase 5** qualité rédactionnelle (prompt + garde-fou + typographie).
6. **Phase 6** tests, snapshots, docs (CHANGELOG, ARCHITECTURE, CLAUDE.md).

## Décisions de design (voir aussi la réponse finale)
- Sections vides : masquées **au rendu** (pas dans les données) : réversible, valable pour les modifications manuelles.
- Langue du CV : `cv.settings.cvLanguage` (réglage existant de type clé/valeur) lu par `readDateSettings`.
- Sous-en-têtes : `section_header` avec `overrideData.level = 'sub'`.
