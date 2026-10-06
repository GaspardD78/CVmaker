# Plan 007

## Modules (`src/lib/watcher/`)

| Module | Rôle |
|---|---|
| `parsers/csp-html.ts` | URL de recherche, liste, JSON-LD, référence, origine (pur) |
| `parsers/choisir-service-public.ts` | collecte polie : cadence 1 req/s, robots.txt, 3 pages, arrêt sur connues, 302, enrichissement |
| `territorial-coverage.ts` | ligne « Couvert via Choisir le service public » et compte d'offres territoriales |
| `public-sector.ts` | piste secteur public (assistant) |
| `email-alerts/` | contrats, liste blanche d'expéditeurs, liens autorisés, suivi UID (phase 3, sans parseur) |

## Intégration

`JobSource` += `choisir_service_public` ; `RawJobOffer`/`JobOffer` += `origin`, `reference` ; `SearchProfile` += `cspVersant`, `cspCategorie` ; `fetcher.ts` persiste `origin`/`reference` ; `query-key.ts` mutualise par (intitulés, versant, catégorie, lieu) ; `UNAVAILABLE_SOURCES` / `COVERED_VIA` dans `sources.ts`.

## Reste à faire (phase 3 et suivantes)

Rust : IMAP (`imap` + `rustls`), trousseau (`keyring`), commandes Tauri ; écran Paramètres « Alertes e-mail » ; parseurs d'expéditeur sur `.eml` réels ; sources `apec_email` et `emploi_territorial_email`.
