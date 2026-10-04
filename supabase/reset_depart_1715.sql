-- ============================================================
-- Close-Pro — REMISE À ZÉRO des données (redémarrage « comme neuf »).
-- À exécuter UNE fois dans Supabase > SQL Editor, AVANT de lancer
-- « demarrerDepuisLigne » dans l'Apps Script du Google Sheet.
--
-- Vide   : commandes, historique d'appels, rappels programmés, événements / notifications, clients.
-- Garde  : comptes (agents), pays, produits, configuration (Telegram, Resend, OneSignal…).
-- Copie de sécurité de tout ce qui est vidé dans le schéma « sauvegarde » (non exposé à l'app).
-- ============================================================
begin;

-- 1) Copie de sécurité (récupérable si besoin ; ignorée si déjà faite)
create schema if not exists sauvegarde;
create table if not exists sauvegarde.orders_20261004              as table orders;
create table if not exists sauvegarde.call_attempts_20261004       as table call_attempts;
create table if not exists sauvegarde.scheduled_callbacks_20261004 as table scheduled_callbacks;
create table if not exists sauvegarde.events_20261004              as table events;
create table if not exists sauvegarde.customers_20261004           as table customers;

-- 2) Remise à zéro (toutes les tables liées dans une seule commande)
truncate table call_attempts, scheduled_callbacks, events, orders, customers;

commit;

-- 3) Vérification : doit afficher 0 partout
select (select count(*) from orders)              as commandes,
       (select count(*) from call_attempts)       as appels,
       (select count(*) from events)              as evenements,
       (select count(*) from customers)           as clients,
       (select count(*) from sauvegarde.orders_20261004) as commandes_sauvegardees;
