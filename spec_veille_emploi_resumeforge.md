# Spec fonctionnelle — Module "Veille Emploi" · ResumeForge

**Version :** 1.1  
**Date :** 2026-03-30  
**Destinataire :** Jules (assistant de développement)  
**Contexte :** ResumeForge est une app desktop Tauri v2 / React / TypeScript / SQLite / Zustand / shadcn/ui. Ce module ajoute une fonctionnalité de veille d'offres d'emploi automatisée, agrégée et filtrée, avec digest email.

---

## 1. Objectif

Permettre à l'utilisateur de surveiller plusieurs job boards simultanément (APEC, Indeed, Welcome to the Jungle, LinkedIn via RSS tiers), de centraliser les offres dans ResumeForge, et de recevoir un digest email quotidien des nouvelles offres détectées.

---

## 2. Périmètre fonctionnel

### 2.1 Sources supportées (v1)

| Source | Méthode | Notes |
|---|---|---|
| APEC | RSS officiel | `https://www.apec.fr/rss/...` — paramétrable par mots-clés/localisation |
| Indeed | RSS officiel | `https://fr.indeed.com/rss?q=...&l=...` |
| Welcome to the Jungle | Scraping HTTP | Pas de RSS — parser HTML via `httpx` + `BeautifulSoup` |
| LinkedIn | RSS tiers (rss.app ou jobicy) | Scraping direct trop risqué — contourner via flux RSS généré |

> **LinkedIn** : l'utilisateur peut aussi configurer les alertes email natives LinkedIn, qui seront traitées séparément (hors scope v1).

### 2.2 Fonctionnalités

1. **Configuration des sources** : l'utilisateur définit ses critères de recherche par source (mots-clés, localisation, périmètre km, contrat CDI/CDD/freelance).
2. **Collecte planifiée** : un job Python tourne en arrière-plan (scheduler APScheduler ou simple thread avec `time.sleep`) toutes les N heures (configurable, défaut 4h).
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
    source TEXT NOT NULL,           -- 'apec' | 'indeed' | 'wttj' | 'linkedin_rss'
    keywords TEXT NOT NULL,         -- JSON array ex: ["recruteur", "talent acquisition"]
    location TEXT,                  -- ex: "Paris"
    radius_km INTEGER DEFAULT 50,
    contract_types TEXT,            -- JSON array ex: ["CDI", "Freelance"]
    rss_url TEXT,                   -- URL RSS construite ou fournie manuellement
    enabled INTEGER DEFAULT 1,
    last_fetched_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
```

### Table `job_offers`

```sql
CREATE TABLE IF NOT EXISTS job_offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    url TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE,      -- SHA256(source + url)
    title TEXT NOT NULL,
    company TEXT,
    location TEXT,
    contract_type TEXT,
    description_snippet TEXT,       -- 500 premiers caractères
    published_at TEXT,
    fetched_at TEXT DEFAULT (datetime('now')),
    score INTEGER DEFAULT 0,        -- score de pertinence 0-100
    commute_minutes INTEGER,        -- temps de trajet TC en minutes (NULL si non calculé)
    commute_status TEXT DEFAULT 'pending', -- 'pending' | 'ok' | 'error' | 'not_found'
    is_read INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    kanban_id INTEGER,              -- FK vers candidature si importée
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
-- commute_origin_address (ex: "9 rue des Lilas, Carrières-sous-Poissy")
-- commute_departure_time (ex: "09:00")
-- commute_max_minutes (ex: 75 — filtre optionnel)
```

---

## 4. Architecture technique

### 4.1 Structure des fichiers (côté Python/backend Tauri)

```
src-tauri/
  python/
    watcher/
      __init__.py
      scheduler.py       # Entrée principale, lance APScheduler
      fetcher.py         # Orchestrateur : appelle les parsers par source
      parsers/
        apec.py
        indeed.py
        wttj.py
        linkedin_rss.py
      scorer.py          # Calcul du score de pertinence
      commute.py         # Calcul temps de trajet via Navitia API
      deduplicator.py    # Hash + vérification BDD
      email_digest.py    # Génération HTML + envoi SMTP
      db.py              # Accès SQLite (réutilise la BDD principale)
```

### 4.2 Dépendances Python requises

```
httpx          # Requêtes HTTP async
feedparser     # Parsing RSS/Atom
beautifulsoup4 # Parsing HTML (WTTJ)
apscheduler    # Scheduler
jinja2         # Template email HTML
geopy          # Géocodage adresse → coordonnées GPS (pour Navitia)
```

### 4.3 Communication Tauri ↔ Python

Utiliser le mécanisme existant de ResumeForge (sidecar Python ou commandes Tauri).  
Le frontend appelle des commandes Tauri pour :
- Déclencher une collecte manuelle
- Récupérer les offres (avec filtres)
- Marquer comme lu / archiver
- Importer dans le Kanban
- Sauvegarder la configuration

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
Pour chaque source : toggle on/off, champ mots-clés, localisation, types de contrat, URL RSS (si applicable).

**Section "Scoring"** :  
Liste de mots-clés positifs (ex: "cybersécurité", "IAM", "Talent Acquisition") et négatifs (ex: "stagiaire", "alternance").

**Section "Temps de trajet"** :  
Adresse de départ (texte libre, ex: "Carrières-sous-Poissy 78955"), heure de départ souhaitée (time picker), seuil maximum en minutes (slider — les offres au-delà sont affichées en rouge mais pas masquées par défaut), clé API Navitia.

**Section "Email digest"** :  
Toggle activation, champ destinataire, heure d'envoi, configuration SMTP (host, port, user, password).

**Bouton "Tester la configuration"** : envoie un email de test immédiatement.

---

## 6. Calcul du temps de trajet (Navitia)

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

### 6.3 Intégration dans le pipeline de collecte

Dans `fetcher.py`, après déduplication et scoring, pour chaque nouvelle offre :

```python
if settings.navitia_api_key and offer.get("location"):
    minutes = get_commute_minutes(
        origin_address=settings.commute_origin_address,
        destination_address=offer["location"],
        departure_time=settings.commute_departure_time,
        navitia_api_key=settings.navitia_api_key
    )
    offer["commute_minutes"] = minutes
    offer["commute_status"] = "ok" if minutes is not None else "error"
else:
    offer["commute_minutes"] = None
    offer["commute_status"] = "pending"
```

### 6.4 Gestion du quota Navitia

- L'offre free tier Navitia est de **3 000 requêtes/jour**.
- Avec une collecte toutes les 4h et en moyenne 20–30 nouvelles offres par cycle, on reste très largement en dessous.
- Pas de rate limiting spécifique à implémenter en v1 — un simple délai `asyncio.sleep(0.5)` entre chaque appel suffit pour éviter les erreurs 429.

### 6.5 Cas où l'adresse de l'offre est introuvable

Certaines offres ne précisent pas d'adresse (ex: "télétravail", "France entière"). Dans ce cas :
- `commute_status = 'not_found'`
- `commute_minutes = NULL`
- Affichage sur la carte : badge gris "Localisation non précisée"
- Ces offres **ne sont pas masquées** par le filtre temps de trajet

---

## 7. Logique de scoring

```python
def compute_score(offer: dict, positive_kw: list, negative_kw: list) -> int:
    text = f"{offer['title']} {offer['description_snippet']}".lower()
    
    score = 50  # base neutre
    
    for kw in positive_kw:
        if kw.lower() in text:
            score += 10
    
    for kw in negative_kw:
        if kw.lower() in text:
            score -= 20
    
    return max(0, min(100, score))
```

---

## 8. Digest email

### Format HTML

- Objet : `[ResumeForge] X nouvelles offres · {date}`
- En-tête : résumé (nb offres par source)
- Corps : liste des offres (titre, entreprise, score, temps de trajet TC, lien direct)

## 9. Comportements attendus

| Cas | Comportement |
|---|---|
| Offre déjà en base | Ignorée silencieusement (pas de doublon) |
| Source inaccessible | Log erreur, continuer avec les autres sources |
| Score < 0 | Ramenée à 0 |
| Score > 100 | Ramenée à 100 |
| Import Kanban | Crée une entrée "À postuler" dans le Kanban avec titre, entreprise, URL pré-remplis |
| SMTP échoue | Log erreur, notification in-app (toast) |
| Adresse offre non géocodable | `commute_status = 'not_found'`, offre non masquée |
| Navitia API inaccessible | `commute_status = 'error'`, log, poursuite normale |
| Clé Navitia non configurée | Calcul trajet désactivé silencieusement, colonne masquée dans l'UI |

---

## 10. Hors scope v1

- Postulation automatique
- Parsing du PDF de l'offre
- Analyse sémantique avancée (NLP/embeddings)
- Support LinkedIn scraping direct
- Authentification APEC/Indeed pour offres premium
- Calcul trajet en voiture ou vélo

---

## 11. Ordre de développement suggéré

1. Migration SQLite (création des 3 tables)
2. Parser APEC (RSS — le plus simple)
3. Parser Indeed (RSS)
4. Déduplication + scoring
5. Module `commute.py` (géocodage + appel Navitia)
6. Commandes Tauri exposées au frontend
7. Vue "Offres" (liste + filtres dont temps de trajet)
8. Parser WTTJ (scraping)
9. Parser LinkedIn RSS tiers
10. Vue "Configuration" (incl. section Navitia)
11. Email digest (template + envoi SMTP)
12. Import Kanban
13. Scheduler + lancement au démarrage de l'app