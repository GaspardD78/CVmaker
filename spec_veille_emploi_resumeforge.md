# Spec fonctionnelle — Module "Veille Emploi" · ResumeForge

**Version :** 1.2  
**Date :** 2026-03-30  
**Destinataire :** Jules (assistant de développement)  
**Contexte :** ResumeForge est une app desktop Tauri v2 / React 19 / TypeScript 5.8 / SQLite (tauri-plugin-sql) / Zustand 5 / shadcn/ui. Ce module ajoute une fonctionnalité de veille d'offres d'emploi automatisée, agrégée et filtrée, avec digest email.

> **Note d'architecture (issue de l'audit codebase v1.2)** : l'implémentation est en **TypeScript pur** — il n'existe pas de backend Python dans le projet. Les parsers, le scoring, la déduplication et le scheduler sont implémentés côté TypeScript/frontend Tauri. L'envoi email SMTP est géré par une commande Rust via la crate `lettre`. Le scheduler utilise `setInterval` dans un hook React `useJobWatcher`. Toutes les références Python dans cette spec sont conservées à titre documentaire mais l'équivalent TypeScript est précisé.

---

## 1. Objectif

Permettre à l'utilisateur de surveiller plusieurs job boards simultanément (APEC, Indeed, France Travail, Welcome to the Jungle, LinkedIn via RSS tiers), de centraliser les offres dans ResumeForge, et de recevoir un digest email quotidien des nouvelles offres détectées.

---

## 2. Périmètre fonctionnel

### 2.1 Sources supportées (v1)

| Source | Méthode | Notes |
|---|---|---|
| APEC | RSS officiel | `https://www.apec.fr/rss/...` — paramétrable par mots-clés/localisation |
| Indeed | RSS officiel | `https://fr.indeed.com/rss?q=...&l=...` |
| **France Travail** | **API REST OAuth2 officielle** | API Offres d'emploi v2 — gratuite, inscription sur francetravail.io/mon-espace-icone |
| Welcome to the Jungle | Scraping HTTP | Pas de RSS — parser HTML via `cheerio` (TypeScript) |
| LinkedIn | RSS tiers (rss.app ou jobicy) | Scraping direct trop risqué — contourner via flux RSS généré |

> **LinkedIn** : l'utilisateur peut aussi configurer les alertes email natives LinkedIn, qui seront traitées séparément (hors scope v1).

### 2.2 Fonctionnalités

1. **Configuration des sources** : l'utilisateur définit ses critères de recherche par source (mots-clés, localisation, périmètre km, contrat CDI/CDD/freelance). Pour France Travail : credentials OAuth2 (client_id + client_secret) configurables dans l'interface.
2. **Collecte planifiée** : un hook React `useJobWatcher` avec `setInterval` tourne en arrière-plan toutes les N heures (configurable, défaut 4h).
3. **Déduplication** : chaque offre est identifiée par un hash `(source + url)` — si déjà en base, elle est ignorée.
4. **Scoring basique** : chaque offre reçoit un score de pertinence (0–100) calculé à partir de la présence de mots-clés positifs/négatifs définis par l'utilisateur.
5. **Stockage SQLite** : les offres sont stockées dans la BDD existante de ResumeForge.
6. **Vue "Veille"** : nouvel onglet dans l'interface qui liste les offres avec filtres (source, score, date, statut lu/non lu).
7. **Import Kanban** : bouton sur chaque offre pour l'importer directement dans le tracker de candidatures (Kanban existant).
8. **Calcul du temps de trajet** : lors de la collecte, appel à l'API Navitia pour calculer le temps de trajet en transports en commun depuis l'adresse domicile configurée jusqu'à l'adresse de l'offre. Résultat stocké en base et affiché sur la carte offre.
9. **Digest email quotidien** : envoi automatique chaque matin (heure configurable) d'un récapitulatif HTML des offres nouvelles détectées depuis la dernière collecte.

---

## 3. Modèle de données

### Table `job_watch_config`

```sql
CREATE TABLE IF NOT EXISTS job_watch_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,           -- 'apec' | 'indeed' | 'france_travail' | 'wttj' | 'linkedin_rss'
    keywords TEXT NOT NULL,         -- JSON array ex: ["recruteur", "talent acquisition"]
    location TEXT,                  -- ex: "Paris"
    radius_km INTEGER DEFAULT 50,
    contract_types TEXT,            -- JSON array ex: ["CDI"] — France Travail : codes typeContrat
    rss_url TEXT,                   -- URL RSS construite ou fournie manuellement (non France Travail)
    enabled INTEGER DEFAULT 1,
    last_fetched_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
```

### Table `job_offers`

```sql
CREATE TABLE IF NOT EXISTS job_offers (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),  -- UUID cohérent avec le reste du projet
    source TEXT NOT NULL,           -- 'apec' | 'indeed' | 'france_travail' | 'wttj' | 'linkedin_rss'
    external_id TEXT,               -- ID natif source (ex: identifiant France Travail) pour dédup alternative
    url TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE,      -- SHA256(source + url)
    title TEXT NOT NULL,
    company TEXT,
    location TEXT,                  -- adresse ou ville extraite de l'offre
    location_lat REAL,              -- latitude géocodée (Nominatim) — utilisée pour Navitia
    location_lon REAL,              -- longitude géocodée
    contract_type TEXT,
    salary_min INTEGER,             -- salaire min annuel brut si disponible (France Travail le fournit)
    salary_max INTEGER,             -- salaire max annuel brut si disponible
    description_snippet TEXT,       -- 500 premiers caractères
    published_at TEXT,
    fetched_at TEXT DEFAULT (datetime('now')),
    score INTEGER DEFAULT 0,        -- score de pertinence 0-100
    commute_minutes INTEGER,        -- temps de trajet TC en minutes (NULL si non calculé)
    commute_status TEXT DEFAULT 'pending', -- 'pending' | 'ok' | 'error' | 'not_found'
    is_read INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    kanban_id TEXT,                 -- FK TEXT UUID vers applications(id) — corrigé depuis INTEGER
    FOREIGN KEY (kanban_id) REFERENCES applications(id)
);
```

### Table `job_watch_settings`

```sql
CREATE TABLE IF NOT EXISTS job_watch_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
-- Clés attendues :
-- fetch_interval_hours (défaut: 4)
-- email_digest_enabled (défaut: 1)
-- email_digest_time (défaut: "08:00")
-- email_smtp_host
-- email_smtp_port
-- email_smtp_user
-- email_smtp_password (stocké chiffré ou en clair selon contexte local)
-- email_to
-- positive_keywords (JSON array)
-- negative_keywords (JSON array)
-- navitia_api_key
-- commute_origin_address (ex: "Carrières-sous-Poissy 78955")
-- commute_departure_time (ex: "09:00")
-- commute_max_minutes (ex: 75 — filtre optionnel)
-- france_travail_client_id     (OAuth2 — obtenu sur francetravail.io/mon-espace-icone)
-- france_travail_client_secret (OAuth2)
-- france_travail_access_token  (stocké temporairement — expire après 1499s)
-- france_travail_token_expires_at (timestamp ISO)
```

---

## 4. Architecture technique

> **Implémentation TypeScript** — pas de backend Python. Voir note d'architecture en en-tête.

### 4.1 Structure des fichiers (TypeScript)

```
src/
  lib/
    watcher/
      fetcher.ts         # Orchestrateur : appelle les parsers par source
      deduplicator.ts    # Hash SHA-256 (Web Crypto API) + vérification BDD
      scorer.ts          # Calcul du score de pertinence
      commute.ts         # Géocodage Nominatim + appel Navitia
      email-digest.ts    # Génération template HTML digest
      parsers/
        apec.ts          # Parser RSS officiel APEC
        indeed.ts        # Parser RSS officiel Indeed
        france-travail.ts # Parser API REST OAuth2 France Travail
        wttj.ts          # Scraper HTML WTTJ (cheerio)
        linkedin-rss.ts  # Parser flux RSS tiers LinkedIn
        index.ts         # Export + registry des parsers
  hooks/
    useJobWatcher.ts     # Hook React : setInterval + déclenchement manuel
  stores/
    jobWatchStore.ts     # Zustand slice : état offres, filtres, config, loading
  types/
    job-watch.ts         # Interfaces TypeScript : JobOffer, JobWatchConfig, etc.
  components/
    job-watch/
      JobWatchPage.tsx   # Page principale (sous-onglets Offres / Configuration)
      JobOffersView.tsx  # Liste offres + filtres
      JobOfferCard.tsx   # Carte offre individuelle
      JobWatchConfig.tsx # Formulaire configuration

src-tauri/
  migrations/
    004_job_watch.sql    # Création des 3 tables (idempotent)
  src/
    email.rs             # Commande Tauri send_email via crate lettre
```

### 4.2 Dépendances à ajouter

**npm :**
```
rss-parser          # Parsing flux RSS (APEC, Indeed, LinkedIn RSS)
cheerio             # Parsing HTML (WTTJ)
@radix-ui/react-slider     # Slider filtres (si non disponible : fallback <input type="range">)
@radix-ui/react-checkbox   # Checkboxes sources (si non disponible : fallback natif)
```

**Cargo (Rust) :**
```
lettre = { version = "0.11", features = ["smtp-transport", "tokio1-native-tls"] }
```

### 4.3 Communication Tauri

Le frontend accède à SQLite directement via `@tauri-apps/plugin-sql` (pattern existant dans le projet — `getDb()` dans `src/lib/db.ts`). Aucune commande Tauri supplémentaire n'est nécessaire sauf pour l'envoi email.

**Commandes Tauri existantes utilisées :**
- `db.select<T[]>(sql, params)` — lecture
- `db.execute(sql, params)` — écriture

**Nouvelle commande Tauri Rust à créer :**
- `send_email(config: EmailConfig, html_body: string)` → via crate `lettre`

**Appels HTTP externes** (fetch natif depuis TypeScript) :
- API France Travail OAuth2 — domaine `api.francetravail.io` à autoriser dans `capabilities/default.json`
- API Navitia — domaine `api.navitia.io`
- Nominatim — domaine `nominatim.openstreetmap.org`
- Flux RSS APEC/Indeed — domaines respectifs
- WTTJ — domaine `www.welcometothejungle.com`

---

## 5. Interface utilisateur

### 5.1 Nouvel onglet "Veille"

Positionnement : dans la barre de navigation principale de ResumeForge, après "Candidatures".

**Sous-onglets :**

- **Offres** : liste des offres collectées
- **Configuration** : paramétrage des sources et de l'email

### 5.2 Vue "Offres"

**Filtres disponibles :**
- Source (checkboxes)
- Score minimum (slider 0–100)
- Temps de trajet maximum (slider en minutes, ex: 30 / 45 / 60 / 75 / illimité)
- Statut : Toutes / Non lues / Archivées
- Date de détection (range)

**Carte offre (composant `JobOfferCard`) :**
- Titre du poste + entreprise + localisation
- Badge source (couleur par source)
- Score de pertinence (badge coloré : vert >70, orange 40–70, gris <40)
- Temps de trajet TC (icône 🚇 + durée en minutes ; gris si non calculé, rouge si > seuil configuré)
- Date de détection
- Snippet de description (2 lignes, expandable)
- Actions : [Ouvrir] [Marquer lu] [Importer dans Kanban] [Archiver]

### 5.3 Vue "Configuration"

**Section "Sources"** :  
Pour chaque source : toggle on/off, champ mots-clés, localisation, types de contrat, URL RSS (si applicable). Pour France Travail : champs client_id et client_secret avec lien vers la page d'inscription.

**Section "Scoring"** :  
Liste de mots-clés positifs (ex: "cybersécurité", "IAM", "Talent Acquisition") et négatifs (ex: "stagiaire", "alternance").

**Section "Temps de trajet"** :  
Adresse de départ (texte libre, ex: "Carrières-sous-Poissy 78955"), heure de départ souhaitée (time picker), seuil maximum en minutes (slider — les offres au-delà sont affichées en rouge mais pas masquées par défaut), clé API Navitia.

**Section "Email digest"** :  
Toggle activation, champ destinataire, heure d'envoi, configuration SMTP (host, port, user, password).

**Bouton "Tester la configuration"** : envoie un email de test immédiatement.

---

## 6. Intégration API France Travail

### 6.1 Présentation

L'API Offres d'emploi France Travail (v2) est une API REST officielle, gratuite, accessible après inscription sur [francetravail.io/mon-espace-icone](https://francetravail.io/mon-espace-icone). Elle retourne des données structurées riches : intitulé, entreprise, lieu (avec coordonnées GPS natives), type de contrat, salaire, description complète.

> **Avantage clé** : France Travail retourne directement `lieuTravail.latitude` et `lieuTravail.longitude` — le géocodage Nominatim n'est pas nécessaire pour ces offres. Les coordonnées peuvent être stockées directement dans `location_lat` / `location_lon`.

### 6.2 Authentification OAuth2 Client Credentials

```typescript
// src/lib/watcher/parsers/france-travail.ts

const FT_TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token'
const FT_API_URL   = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search'
const FT_SCOPE     = 'api_offresdemploiv2 o2dsoffre'

interface FTTokenResponse {
  access_token: string
  expires_in: number   // 1499 secondes (~25 min)
  token_type: string
}

async function getFTAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: FT_SCOPE,
  })

  const res = await fetch(FT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) throw new Error(`FT OAuth2 error: ${res.status}`)
  const data: FTTokenResponse = await res.json()
  return data.access_token
}
```

**Gestion du token** : le token expire après ~25 minutes. Stocker `access_token` et `token_expires_at` dans `job_watch_settings`. Avant chaque appel API, vérifier si le token est encore valide ; sinon le renouveler automatiquement.

### 6.3 Recherche d'offres

```typescript
interface FTSearchParams {
  motsCles: string        // mots-clés (ex: "talent acquisition recruteur")
  commune?: string        // code INSEE commune (ex: "75056" pour Paris)
  distance?: number       // rayon en km autour de la commune
  typeContrat?: string    // "CDI" | "CDD" | "MIS" | "SAI"
  nbResultatsParPage?: number  // max 150
  range?: string          // pagination ex: "0-49"
}

async function searchFTOffers(
  params: FTSearchParams,
  accessToken: string
): Promise<JobOffer[]> {
  const url = new URL(FT_API_URL)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined) url.searchParams.set(k, String(v))
  })

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
    },
  })

  // 204 = aucun résultat (pas une erreur)
  if (res.status === 204) return []
  if (!res.ok) throw new Error(`FT API error: ${res.status}`)

  const data = await res.json()
  return (data.resultats ?? []).map(mapFTOfferToJobOffer)
}
```

### 6.4 Mapping vers JobOffer

```typescript
function mapFTOfferToJobOffer(ft: any): Partial<JobOffer> {
  return {
    source: 'france_travail',
    externalId: ft.id,
    url: ft.origineOffre?.urlOrigine ?? `https://candidat.francetravail.fr/offres/recherche/detail/${ft.id}`,
    title: ft.intitule,
    company: ft.entreprise?.nom ?? null,
    location: ft.lieuTravail?.libelle ?? null,
    locationLat: ft.lieuTravail?.latitude ?? null,    // coordonnées natives — pas besoin de géocodage
    locationLon: ft.lieuTravail?.longitude ?? null,
    contractType: ft.typeContratLibelle ?? null,
    salaryMin: ft.salaire?.commentaire ? null : parseSalaryMin(ft.salaire?.libelle),
    salaryMax: ft.salaire?.commentaire ? null : parseSalaryMax(ft.salaire?.libelle),
    descriptionSnippet: (ft.description ?? '').slice(0, 500),
    publishedAt: ft.dateCreation ?? null,
  }
}
```

### 6.5 Pagination

L'API France Travail retourne max 150 résultats par page via le header `Range: 0-149`. Si le header de réponse `Content-Range` indique plus de 150 résultats disponibles, effectuer une deuxième requête `Range: 150-299`. Limiter à 2 pages (300 offres max) par collecte pour respecter les quotas.

### 6.6 Quota et bonnes pratiques

- Quota standard : **3 appels/seconde**, **100 000 appels/mois** — très largement suffisant
- Respecter un délai de 400ms entre les appels de pagination
- Renouveler le token automatiquement si `token_expires_at` est dans moins de 60 secondes

---

## 7. Calcul du temps de trajet (Navitia)

### 6.1 Principe

L'API utilisée est [Navitia.io](https://navitia.io) — inscription gratuite, clé API requise, couverture IDF complète (Transilien, RER, métro, bus).

Endpoint utilisé : `GET https://api.navitia.io/v1/coverage/fr-idf/journeys`

### 6.2 Flux de traitement (dans `commute.py`)

```python
import httpx
from geopy.geocoders import Nominatim

def geocode_address(address: str) -> tuple[float, float] | None:
    """Retourne (lon, lat) via Nominatim (OpenStreetMap). Gratuit, pas de clé."""
    geolocator = Nominatim(user_agent="resumeforge")
    location = geolocator.geocode(address)
    if location:
        return (location.longitude, location.latitude)
    return None

def get_commute_minutes(
    origin_address: str,
    destination_address: str,
    departure_time: str,  # ex: "09:00"
    navitia_api_key: str
) -> int | None:
    """
    Retourne le temps de trajet en minutes, ou None si erreur/introuvable.
    departure_time est converti en datetime ISO pour Navitia (prochain jour ouvré).
    """
    origin_coords = geocode_address(origin_address)
    dest_coords = geocode_address(destination_address)
    
    if not origin_coords or not dest_coords:
        return None
    
    from_place = f"{origin_coords[0]};{origin_coords[1]}"
    to_place = f"{dest_coords[0]};{dest_coords[1]}"
    
    # Construire un datetime ISO pour le prochain lundi à l'heure configurée
    dt_iso = next_weekday_datetime(departure_time)  # helper à implémenter
    
    url = "https://api.navitia.io/v1/coverage/fr-idf/journeys"
    params = {
        "from": from_place,
        "to": to_place,
        "datetime": dt_iso,
        "count": 1,
        "first_section_mode[]": "walking",
        "last_section_mode[]": "walking",
    }
    headers = {"Authorization": navitia_api_key}
    
    response = httpx.get(url, params=params, headers=headers, timeout=10)
    data = response.json()
    
    journeys = data.get("journeys", [])
    if not journeys:
        return None
    
    duration_seconds = journeys[0].get("duration", 0)
    return round(duration_seconds / 60)
```

### 7.3 Intégration dans le pipeline de collecte

Dans `fetcher.ts`, après déduplication et scoring, pour chaque nouvelle offre :

```typescript
// Pour les offres France Travail : coordonnées déjà disponibles, pas de géocodage
const hasCoords = offer.locationLat !== null && offer.locationLon !== null
const hasLocation = hasCoords || Boolean(offer.location)

if (settings.navitiaApiKey && hasLocation) {
  const result = await getCommuteMinutes({
    originAddress: settings.commuteOriginAddress,
    destinationLat: offer.locationLat,
    destinationLon: offer.locationLon,
    destinationAddress: offer.location,  // fallback si pas de coords
    departureTime: settings.commuteDepartureTime,
    navitiaApiKey: settings.navitiaApiKey,
  })
  offer.commuteMinutes = result ?? null
  offer.commuteStatus = result !== null ? 'ok' : 'error'
} else {
  offer.commuteMinutes = null
  offer.commuteStatus = settings.navitiaApiKey ? 'pending' : 'pending'
}
```

### 7.4 Gestion du quota Navitia

- Free tier : **3 000 requêtes/jour** — largement suffisant à l'échelle d'une veille personnelle
- Délai de 500ms entre chaque appel dans le batch (`await sleep(500)`)
- Les offres France Travail bénéficient des coordonnées natives → appel Navitia direct sans géocodage préalable, plus fiable et plus rapide

### 7.5 Cas où l'adresse de l'offre est introuvable

Certaines offres ne précisent pas d'adresse (ex: "télétravail", "France entière"). Dans ce cas :
- `commute_status = 'not_found'`
- `commute_minutes = NULL`
- Affichage sur la carte : badge gris "Localisation non précisée"
- Ces offres **ne sont pas masquées** par le filtre temps de trajet

---

## 8. Logique de scoring

```typescript
// src/lib/watcher/scorer.ts

export function computeScore(
  offer: { title: string; descriptionSnippet: string | null },
  positiveKw: string[],
  negativeKw: string[]
): number {
  const text = `${offer.title} ${offer.descriptionSnippet ?? ''}`.toLowerCase()
  let score = 50

  for (const kw of positiveKw) {
    if (text.includes(kw.toLowerCase())) score += 10
  }
  for (const kw of negativeKw) {
    if (text.includes(kw.toLowerCase())) score -= 20
  }

  return Math.max(0, Math.min(100, score))
}
```

---

## 9. Digest email

### Format HTML

- Objet : `[ResumeForge] X nouvelles offres · {date}`
- En-tête : résumé (nb offres par source, dont France Travail séparé)
- Corps : liste des offres (titre, entreprise, score, temps de trajet TC, salaire si disponible, lien direct)

### Déclenchement

- Automatique chaque matin à l'heure configurée (APScheduler `CronTrigger`)
- Manuel depuis l'interface (bouton "Envoyer le digest maintenant")
- Uniquement si au moins 1 nouvelle offre depuis le dernier envoi

---

## 10. Comportements attendus

| Cas | Comportement |
|---|---|
| Offre déjà en base | Ignorée silencieusement (hash dupliqué) |
| Source inaccessible | Log erreur, continuer avec les autres sources |
| Token France Travail expiré | Renouvellement automatique avant l'appel |
| Token France Travail invalide | Log erreur + toast "Vérifiez vos credentials France Travail" |
| Score < 0 | Ramené à 0 |
| Score > 100 | Ramené à 100 |
| Import Kanban | Crée une entrée "À postuler" avec titre, entreprise, URL, salaire pré-remplis |
| SMTP échoue | Log erreur, notification in-app (toast sonner) |
| Adresse offre non géocodable | `commute_status = 'not_found'`, offre non masquée |
| Navitia API inaccessible | `commute_status = 'error'`, log, poursuite normale |
| Clé Navitia non configurée | Calcul trajet désactivé, colonne masquée dans l'UI |
| Offre France Travail avec coords GPS | Navitia appelé directement sans géocodage |

---

## 11. Hors scope v1

- Postulation automatique
- Parsing du PDF de l'offre
- Analyse sémantique avancée (NLP/embeddings)
- Support LinkedIn scraping direct
- Authentification APEC/Indeed pour offres premium
- Calcul trajet en voiture ou vélo
- Recherche France Travail par code ROME (v2 : utiliser `codeROME` en paramètre)

---

## 12. Ordre de développement suggéré

1. Migration SQLite `004_job_watch.sql` — 3 tables avec `kanban_id TEXT`
2. Types TypeScript + store Zustand `jobWatchStore`
3. Parser APEC (RSS — le plus simple, valide la chaîne complète)
4. Parser Indeed (RSS)
5. Déduplication (`crypto.subtle`) + scoring
6. **Parser France Travail** (OAuth2 + search + mapping)
7. Module `commute.ts` (Nominatim + Navitia, avec shortcut coords natives FT)
8. Hook `useJobWatcher` (orchestrateur + `setInterval`)
9. Vue "Offres" + `JobOfferCard` (affichage salaire FT, trajet, score)
10. Parser WTTJ (scraping `cheerio`)
11. Parser LinkedIn RSS tiers
12. Vue "Configuration" (incl. section France Travail OAuth2 + Navitia)
13. Commande Rust `send_email` + template digest HTML
14. Import Kanban (avec salaire pré-rempli si disponible)
15. Scheduler au démarrage de l'app
