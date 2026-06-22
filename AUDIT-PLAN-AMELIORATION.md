# Audit & Plan d'Amélioration — ResumeForge

Audit réalisé le 2026-06-10 · Plan finalisé le 2026-06-10 · Statut : **Jalon « Quick wins » livré**

Ce document est la version finalisée du rapport d'audit du dépôt et du plan
d'exécution qui en découle. Il intègre les décisions produit prises après
l'audit et fait foi sur les chantiers restants.

---

## 1. Résumé exécutif

**Note de santé initiale : C+** — cœur applicatif sain (TypeScript strict sans
`any`, architecture claire, 87 tests réels sur le pipeline de veille) mais
dépôt non protégé : secrets commités, aucune CI, aucun lint.

Après livraison des quick wins (voir §4) : les deux constats **Critiques**
sont corrigés et la CI verrouille `tsc`, `bun test` et `clippy` sur chaque PR.

## 2. Décisions produit actées

| Question | Décision |
|---|---|
| Visibilité du dépôt | **Privé, le restera** → pas de purge d'historique git ; rotation du secret Google recommandée mais non bloquante |
| Parc Android | 2–3 appareils → keystore actuel conservé (hors git), réinstallation manuelle acceptable si rotation un jour |
| Gestionnaire de paquets | **Bun partout** (install, scripts, CI) ; `package-lock.json` supprimé |
| Parsers dépréciés `mantiks` / `linkedin-rss` | **Supprimés** ; valeurs d'enum conservées pour les offres historiques |
| Extension Chrome `tools/apec-id-mapper-extension/` | **Conservée** |
| Contournement anti-bot (scraping) | Assumé — usage strictement personnel |

## 3. Constats d'audit — état

### Sécurité

| Constat | Gravité | Preuve | État |
|---|---|---|---|
| Secret OAuth Google en dur | Critique | `src/lib/gdrive.ts:25` | ✅ Corrigé — fourni via `VITE_GDRIVE_CLIENT_SECRET` au build (README §Drive) |
| Keystore Android suivi par git | Critique | `gen/android/app/resumeforge.keystore` | ✅ Corrigé — untracked + `.gitignore` (`*.keystore`) ; reste dans l'historique (dépôt privé, accepté) |
| Capabilities trop larges (`fs:read-all`, `fs:write-all`, fetch `http://**`) | Élevé | `src-tauri/capabilities/default.json:21-28` | ⬜ **Restant** — tâche R1 |
| Injection CSS via réglages de CV | Élevé | `PrintableCV.tsx:247` | ✅ Corrigé — validation par `src/lib/css-sanitize.ts` |
| Credentials SMTP en clair dans SQLite | Moyen | `email.rs:6-14`, `db.ts:210-213` | 🔵 Assumé (outil local mono-utilisateur) — à documenter (tâche R5) |
| `unsafe-headers` sur tauri-plugin-http | Moyen | `Cargo.toml:31` | 🔵 Assumé — requis par le scraping |
| CSP `style-src 'unsafe-inline'` | Faible | `tauri.conf.json:21` | 🔵 Assumé — contrainte Tailwind/styles dynamiques |

### Tests / CI / DX

| Constat | Gravité | État |
|---|---|---|
| ~~Suite de tests cassée~~ — **infirmé** : 87/87 passent après `bun install` propre | ~~Critique~~ | ✅ Constat retiré de l'audit |
| Aucune CI | Élevé | ✅ Corrigé — `.github/workflows/ci.yml` (tsc + bun test + clippy) |
| Zéro test sur `export-docx`, `export-pdf`, stores, `db.ts`, `gdrive.ts`, 9 parsers, Rust | Élevé | ⬜ **Restant** — tâches R2/R3 |
| Double lockfile npm + bun | Moyen | ✅ Corrigé — bun seul |
| Pas de linter/formateur | Moyen | ⬜ **Restant** — tâche R4 (Biome recommandé) |
| `@types/*` en dependencies, postinstall patch-package no-op | Faible | ✅ Corrigé |

### Architecture / Qualité

| Constat | Gravité | État |
|---|---|---|
| Fichiers monstres : `ConfigHelpModal.tsx` (1 382 l.), `JobWatchConfig.tsx` (995 l.) | Moyen | ⬜ **Restant** — tâche R6 |
| Catch silencieux (fetcher, migration v2, resets auth) | Moyen | ✅ Corrigé — erreurs tracées en console |
| Code mort (`script.js`, benchmarks, `Test01.*`) + parsers dépréciés | Faible | ✅ Corrigé — supprimés |
| Deux moteurs de scoring (`compatibility-scorer` vs `watcher/scorer`) | Faible | 🔵 **Volontairement non traité** — systèmes sémantiquement distincts, fusion = risque > bénéfice |
| Fetch des sources séquentiel | Faible | 🔵 **Volontairement non traité** — limite la pression sur les sites scrapés |

**Forces à préserver** : TS strict sans `any` ni `@ts-ignore` (~37 k LOC), SQL
100 % paramétré avec whitelist de colonnes, croissances bornées (logs, erreurs
dev, digest), parsers modulaires, migrations SQL versionnées, documentation
exacte.

## 4. Livré — « Quick wins » (2026-06-10)

Commits `108fd2a`, `072fb05`, `3960265` sur `claude/trusting-brown-j6h0ci` :

1. **Sécurité** : keystore hors suivi git ; secret Drive via env build
   (`.env` ignoré par git) ; sanitisation CSS des réglages de CV.
2. **Nettoyage** : code mort et parsers dépréciés supprimés ; bun unique ;
   hygiène `package.json`.
3. **CI + observabilité** : workflow GitHub Actions ; catch silencieux tracés.

Vérifié : `bunx tsc --noEmit` ✓ · `bun test` 87/87 ✓ · clippy délégué à la CI.

⚠️ **Post-merge sur votre machine** : sauvegarder le keystore avant `git pull`
(le pull supprime la copie locale du fichier dé-tracké), puis le remettre en
place ; créer `resume-forge/.env` avec `VITE_GDRIVE_CLIENT_SECRET=…` avant le
prochain build utilisant la sync Drive.

## 5. Chantiers restants

| ID | Tâche | Fichiers | Critères d'acceptation | Charge | Risque |
|---|---|---|---|---|---|
| **R1** | Restreindre les capabilities Tauri : scopes fs ciblés (appdata + dossiers d'export), liste explicite de domaines pour `http:allow-fetch`, suppression de `http://**` | `src-tauri/capabilities/*.json` | Export PDF, backup, sync Drive et chaque source de veille fonctionnent (vérifier via HealthDashboard) ; tout domaine hors liste refusé | M | Moyen — tester chaque source, redirections incluses |
| **R2** | Tests `export-docx.ts` (sections, marges, typo, images) et cycle `backup`/`db.ts` (export→import, fallbacks ALTER TABLE) | `src/lib/export-docx.ts`, `backup.ts`, `db.ts` | ≥ 10 cas docx + round-trip backup vérifié ; CI verte | L | Faible |
| **R3** | Tests des parsers majeurs (APEC, France Travail, LinkedIn) sur fixtures réelles | `src/lib/watcher/parsers/*` | Salaire, contrat, lieu, dédup vérifiés par source | M | Faible |
| **R4** | Linter Biome (lint + format) branché en CI | `biome.json`, `ci.yml` | Lint rouge = PR bloquée ; base de code formatée en un commit dédié | M | Faible |
| **R5** | `SECURITY.md` : modèle de menace assumé (SMTP en clair, sessions Chrome sur disque, secret PKCE dans le binaire) | nouveau fichier | Limites documentées avec mitigations utilisateur (disque chiffré) | S | Nul |
| **R6** | Éclater `ConfigHelpModal.tsx` en modales par sujet sous `job-watch/help/` | `ConfigHelpModal.tsx` | Aucun fichier > 500 lignes ; comportement identique | M | Faible |

**Ordre recommandé** : R1 (sécurité, dernier constat Élevé ouvert) → R2/R3
(protègent le livrable) → R4 → R5 → R6.

**Définition de « terminé » globale** : zéro constat Critique/Élevé ouvert ;
CI verte obligatoire (typecheck, tests, clippy, lint) ; `export-docx`,
`backup/db` et ≥ 3 parsers couverts par des tests comportementaux.
