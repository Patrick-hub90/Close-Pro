# SETUP — Close-Pro en production (sans serveur, démarrage à blanc)

Architecture simplifiée : **Google Sheet → Supabase** (direct) et **alertes Telegram dans Supabase** (pg_cron). Pas de Vercel. L'app démarre **à blanc** : seules les nouvelles commandes entrent, on ne charge **pas** l'historique.

---

## 1. Supabase

- [x] Projet créé
- [x] `supabase/schema.sql` exécuté
- [ ] Exécuter **`supabase/telegram_cron.sql`** (SQL Editor) — crée le job d'alerte.
  - Si `create extension pg_cron / pg_net` est refusé : **Database → Extensions** → activer `pg_cron` et `pg_net`, puis relancer.
- [ ] Créer les comptes : **Authentication → Users** (1 propriétaire + les closeuses), puis pour chacun insérer une ligne dans `agents` (`role`, `nom`, `pays`, `auth_uid` = id du user).

Récupérer dans **Project Settings → API** : `Project URL`, clé `anon public`, clé `service_role` (secrète).

## 2. Telegram (alertes propriétaire)

- [x] Bot créé : **@CloseProBot**
- [ ] Ouvrir Telegram → écrire **/start** à **@CloseProBot** (indispensable pour obtenir le `chat_id`).
- [ ] Mettre le token et le `chat_id` dans la table `app_config` (déjà créée par le script) :
  ```sql
  update app_config set value = 'VOTRE_TOKEN'   where key = 'telegram_token';
  update app_config set value = 'VOTRE_CHAT_ID' where key = 'telegram_chat_id';
  ```

## 3. Google Sheet → Supabase (installation 1 clic)

Pour **chaque pays** (un Sheet par pays) :

1. Sheet → **Extensions → Apps Script** → coller tout `apps-script/Code.gs`.
2. Remplir le bloc **CONFIG** en haut : surtout `SUPABASE_SERVICE_KEY` (clé `service_role`).
   `SUPABASE_URL` est déjà pré-rempli ; régler `PAYS` (doit exister dans l'app) et, si besoin, `FEUILLE` (vide = premier onglet).
3. Choisir la fonction **`installer`** dans le menu déroulant en haut → **▷ Exécuter** → autoriser les accès.
   → teste la connexion, **crée le déclencheur minute tout seul** et ignore l'historique. Plus aucun réglage manuel de déclencheur.
4. Vérifier dans le menu **« Exécutions »** (icône ⏱) : doit afficher `Test connexion … OK` puis `INSTALLATION TERMINÉE`.
   En cas d'échec, le message dit quoi corriger (souvent la clé `service_role`), puis relancer `installer`.

Chaque nouvelle ligne du Sheet remonte alors dans l'app **sous 1 min** et arme le compteur 10 min.

## 4. Le front (l'app)

- Pour tester : `npm run dev` → ouvrir l'URL réseau sur le téléphone → « Ajouter à l'écran d'accueil ».
- Hébergement (plus tard, 5 min) : Netlify ou Vercel en site statique (`npm run build` → `dist/`).
- Câblage Supabase (à faire ensemble) : `.env.local` avec `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`, puis remplacer les données de démo par les requêtes Supabase + l'auth. La structure est déjà prête.

---

## Vérifs rapides

- **Telegram marche ?** Dans Supabase SQL Editor : `select notify_late_orders();` (envoie une alerte s'il y a déjà une commande en retard).
- **Le Sheet pousse bien ?** Ajouter une ligne de test dans le Sheet → vérifier dans Supabase **Table Editor → orders**.

## Rappels (analyse terrain)

- Pas de preuve d'appel possible en PWA → on mesure la *discipline de saisie* + on croise avec le **taux de livraison**.
- Sheets sans heure → le « 10 min » démarre à la **détection** (déclencheur **minuté**, ≤ 1 min de latence ; plus fiable que `onChange` pour des lignes ajoutées par une app externe comme EasySell).
- Données sales nettoyées à l'ingestion ; jamais de dédup sur le téléphone seul.
- Telegram > WhatsApp pour les alertes (WhatsApp API = templates payants hors fenêtre 24 h).

> Note : le dossier `api/` (version Vercel) reste disponible comme alternative, mais **n'est pas nécessaire** avec cette architecture Supabase-directe.
