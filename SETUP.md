# SETUP — passer Close-Pro en production

Checklist pour brancher la vraie donnée et les alertes. ~30–45 min. À faire ensemble.

---

## 1. Supabase (base de données)

1. Créer un compte sur [supabase.com](https://supabase.com) → **New project** (région la plus proche, ex. Europe West).
2. Récupérer dans **Project Settings → API** :
   - `Project URL` → `SUPABASE_URL` (et `VITE_SUPABASE_URL`)
   - clé `anon public` → `VITE_SUPABASE_ANON_KEY`
   - clé `service_role` (secrète) → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ backend uniquement, jamais dans le front)
3. **SQL Editor** → coller le contenu de `supabase/schema.sql` → **Run**.
4. **Authentication → Providers** : activer Email (ou Magic Link). Créer un compte propriétaire et les comptes closeuses, puis insérer une ligne par compte dans la table `agents` (role `owner` / `closer`, `pays`, `auth_uid` = l'id du user).

## 2. Telegram (alertes propriétaire)

1. Sur Telegram, écrire à **@BotFather** → `/newbot` → suivre → récupérer le **token** → `TELEGRAM_BOT_TOKEN`.
2. Écrire `/start` à votre nouveau bot.
3. Ouvrir `https://api.telegram.org/bot<token>/getUpdates` dans le navigateur → lire `result[0].message.chat.id` → `TELEGRAM_CHAT_ID`.

## 3. Déploiement Vercel

1. Pousser le projet sur GitHub, puis l'importer sur [vercel.com](https://vercel.com).
2. Avant le déploiement : `npm i @supabase/supabase-js` et `npm i -D @vercel/node`.
3. **Settings → Environment Variables** : renseigner toutes les variables de `.env.example`
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `INGEST_SECRET`).
4. Déployer. Le cron SLA (`api/sla-cron`, chaque minute) est activé par `vercel.json`.
5. Tester Telegram : ouvrir `https://VOTRE-APP.vercel.app/api/telegram?text=test` → vous devez recevoir le message.

## 4. Google Sheet → app (synchro)

Pour **chaque pays** (un Sheet par pays) :

1. Ouvrir le Google Sheet EasySell → **Extensions → Apps Script**.
2. Coller `apps-script/Code.gs`. Renseigner en haut :
   - `INGEST_URL = 'https://VOTRE-APP.vercel.app/api/ingest'`
   - `INGEST_SECRET` = la même valeur que sur Vercel
   - `PAYS` = `CM` / `CI` / `SN`
   - `FEUILLE` = le nom de l'onglet des commandes
3. **Import de l'historique (une fois)** : exécuter `pushBackfill()` → toutes les anciennes commandes partent en archive, **sans déclencher de compteur** (règle anti-inondation).
4. **Temps réel** : **Déclencheurs → Ajouter** → fonction `pushNouvellesCommandes`, événement `onChange` (ou minuté chaque minute). Chaque nouvelle commande arrive alors dans l'app et arme le compteur 10 min.

## 5. Brancher le front sur Supabase

Étape de code (à faire ensemble) : remplacer les imports de démo (`data.ts`, `archive.json`) par des requêtes Supabase via `@supabase/supabase-js`, et l'auth par Supabase Auth. La structure (`types.ts`, vues, RLS) est déjà prête pour ça.

---

## Rappels importants (issus de l'analyse terrain)

- **Aucune preuve d'appel n'est possible en PWA** : on mesure la *discipline de saisie* (résultat saisi avant l'échéance) et on la croise avec le **taux de livraison**. Preuve dure éventuelle = click-to-call (Twilio / Africa's Talking) en phase ultérieure.
- **Sheets sans heure** : le « 10 min » démarre à la **détection** de la ligne → la synchro doit être quasi temps réel (déclencheur `onChange`, pas un import lent).
- **Données sales** : téléphones, ville (Address 1) et région (City) sont nettoyés à l'ingestion ; ne jamais dédupliquer sur le téléphone seul (numéros parfois partagés).
- **Telegram** privilégié à WhatsApp pour les alertes (WhatsApp API impose des templates payants hors fenêtre 24 h).
