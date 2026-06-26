# Close-Pro

Application **mobile (PWA)** de confirmation des commandes **COD** (paiement à la livraison) pour les closeuses et le propriétaire. Multi-pays (Cameroun, Côte d'Ivoire, Sénégal), source des commandes = Google Sheet (EasySell).

> État : **maquette fonctionnelle vérifiée**, données encore locales. Le branchement Supabase + Google Sheet + Telegram se fait via [SETUP.md](./SETUP.md) (nécessite vos accès).

## Lancer en local

```bash
npm install
npm run dev        # http://localhost:5173 (et URL réseau pour tester sur téléphone)
```

Sur le téléphone : ouvrir l'URL réseau affichée par Vite (même Wi-Fi), puis « Ajouter à l'écran d'accueil » pour l'installer comme une app.

## Ce qui est construit (et vérifié)

**Côté closeuse**
- Sas du matin « À clôturer » : impose de trancher les livraisons d'hier (Livré / Retour / Reporté) avant d'accéder aux appels.
- Liste des commandes : comptes à rebours en direct, filtres (À appeler / Rappels / En retard / Toutes), tri par urgence.
- Mode appel guidé : enchaîne les commandes, boutons `Appeler` (`tel:`) et `WhatsApp` (`wa.me`), saisie du résultat en 1 tap.
- Archive : **1 360 vraies commandes** (échantillon) normalisées, recherche, **300 doublons** détectés.

**Côté propriétaire**
- Attribution : modes Auto / Manuel, réglages en feuille du bas (curseur Équité ↔ Performance, plancher garanti, capacité), closeuses avec charge/score.
- Tableau de bord : KPI du jour, alerte « en retard », vue 3 pays, classement des closeuses (réservé au propriétaire).

Bascule de rôle pour la démo : onglet **Moi** → « Passer en vue propriétaire / closeuse ».

## Logique métier (`src/lib`)

- `normalize.ts` — téléphones en E.164 par pays, clés de dédup.
- `cities.ts` — table de normalisation des villes (Dla→Douala…) + recalcul de la région.
- `assignment.ts` — moteur d'attribution (équilibré / performance) avec **plancher garanti** et apprentissage (sans pénaliser).
- `sla.ts` — échéances d'appel (10 min, rappels) + escalade graduée.

## Backend prêt à déployer (`api/`, `supabase/`, `apps-script/`)

- `supabase/schema.sql` — schéma Postgres complet + RLS (cloisonnement closeuse).
- `api/ingest.ts` — ingestion des lignes du Sheet (normalisation, dédup, idempotent, règle anti-inondation du backfill).
- `api/telegram.ts` — alertes propriétaire (canal maître).
- `api/sla-cron.ts` — détection des retards chaque minute → Telegram (anti-spam).
- `apps-script/Code.gs` — pousse les nouvelles lignes du Google Sheet vers `/api/ingest`.

## Structure

```
src/
  App.tsx              routeur de rôle (closeuse / propriétaire)
  CloseuseApp.tsx      app closeuse (sas, liste, mode appel, archive)
  OwnerApp.tsx         app propriétaire (attribution, dashboard)
  components/          OrderCard, CallMode, ArchiveView, MorningSas,
                       Attribution, Dashboard, ReglagesSheet
  data.ts, ownerData.ts, data/archive.json   données de démo + réelles
  lib/                 normalize, cities, assignment, sla
api/                   fonctions serverless Vercel
supabase/schema.sql    schéma base de données
apps-script/Code.gs    synchro Google Sheet
```

## Pile technique

PWA React + Vite · Supabase (Postgres / Auth / RLS / cron) · Vercel · Telegram Bot · Google Apps Script.

Étapes pour passer en production : voir **[SETUP.md](./SETUP.md)**.
