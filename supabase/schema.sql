-- ============================================================
-- Close-Pro — schema Postgres (Supabase)
-- A executer dans Supabase > SQL Editor.
-- ============================================================

create extension if not exists "pgcrypto";

-- Pays / espaces isoles (1 par realite : sheet, closeuses, produits propres)
create table if not exists countries (
  code        text primary key,             -- 'CM', 'CI', 'SN'
  nom         text not null,
  indicatif   text not null,                -- '237', '225', '221'
  devise      text not null default 'FCFA',
  fuseau      text not null default 'Africa/Douala',
  longueur_locale int not null default 9,
  sheet_url   text,                         -- Google Sheet source
  actif       boolean not null default true
);

-- Comptes : proprietaire + closeuses (rattachees a un pays)
create table if not exists agents (
  id          uuid primary key default gen_random_uuid(),
  auth_uid    uuid unique,                  -- = auth.users.id (Supabase Auth)
  role        text not null check (role in ('owner','closer')),
  nom         text not null,
  pays        text references countries(code),
  actif       boolean not null default true,
  horaires    jsonb,                        -- plage de service
  created_at  timestamptz not null default now()
);

-- Produits (catalogue dynamique, auto-cree depuis le nom)
create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  pays        text references countries(code),
  nom         text not null,
  prix_catalogue int,
  actif       boolean not null default true,
  extra       jsonb default '{}'::jsonb,
  unique (pays, nom)
);

-- Clients (dedup par telephone normalise)
create table if not exists customers (
  id            uuid primary key default gen_random_uuid(),
  pays          text references countries(code),
  telephone_e164 text not null,
  whatsapp      text,
  nom           text,
  commandes_count int not null default 0,
  livrees_count   int not null default 0,
  annulees_count  int not null default 0,
  blackliste    boolean not null default false,
  extra         jsonb default '{}'::jsonb,
  unique (pays, telephone_e164)
);

-- Commandes
create table if not exists orders (
  id            uuid primary key default gen_random_uuid(),
  pays          text references countries(code),
  numero        text not null,              -- "#1659"
  source        text not null default 'sheet', -- sheet | abandoned | manuel
  client_id     uuid references customers(id),
  produit_nom   text,
  quantite      int not null default 1,
  prix_unitaire int not null default 0,
  prix_negocie  int,
  cout_livraison int,
  total         int not null default 0,
  nom_complet   text,
  telephone     text,
  telephone_e164 text,
  whatsapp      text,
  adresse       text,                       -- ville / quartier
  region        text,
  statut        text not null default 'a_appeler',
  tentatives    int not null default 0,
  appel_deadline   timestamptz,             -- coeur du controle SLA
  appel_deadline_type text,                 -- nouvelle_10min | rappel_programme
  rappel_at     timestamptz,
  rappel_lieu   text,
  closeuse_id   uuid references agents(id),
  epingle       boolean not null default false, -- override manuel : pas de re-routage
  is_backfill   boolean not null default false, -- import historique : aucun timer
  is_duplicate_suspect boolean not null default false,
  dernier_commentaire text,
  confirme_at   timestamptz,                -- date de confirmation (revue de livraison le lendemain)
  livre_at      timestamptz,                -- date de livraison (finance par periode)
  date_commande timestamptz,
  extra         jsonb default '{}'::jsonb,  -- colonnes variables du sheet
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (pays, numero)                     -- import idempotent
);
create index if not exists orders_statut_idx on orders (pays, statut);
create index if not exists orders_deadline_idx on orders (appel_deadline) where statut in ('a_appeler');
create index if not exists orders_closeuse_idx on orders (closeuse_id);
create index if not exists orders_tel_idx on orders (pays, telephone_e164);

-- Tentatives d'appel (auto-declaratif + signaux verifiables)
create table if not exists call_attempts (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references orders(id) on delete cascade,
  agent_id    uuid references agents(id),
  canal       text,                         -- tel | whatsapp
  clicked_at  timestamptz not null default now(),
  away_sec    int,                          -- temps hors-app (proxy duree)
  resultat    text,                         -- repondu | pas_de_reponse | ...
  commentaire text,
  created_at  timestamptz not null default now()
);

-- Rappels programmes
create table if not exists scheduled_callbacks (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references orders(id) on delete cascade,
  agent_id    uuid references agents(id),
  rappel_at   timestamptz not null,
  lieu        text,
  motif       text,
  honore      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Journal d'evenements + notifications (audit + declencheur d'escalade)
create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid references orders(id) on delete set null,
  type         text not null,
  severite     text not null default 'info', -- info | warn | alerte
  payload      jsonb default '{}'::jsonb,
  canal_notif  text,                          -- telegram | in_app
  destinataire text,
  notifie      boolean not null default false,
  envoye_at    timestamptz,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- RLS de base — REMPLACEE par setup_rls.sql (qui fait foi : cloisonnement PAR PAYS,
-- la closeuse voit/edite toutes les commandes de son pays). Les policies ci-dessous
-- ne sont qu'un point de depart historique.
-- ============================================================
alter table orders enable row level security;

create policy owner_all_orders on orders
  for all using (
    exists (select 1 from agents a where a.auth_uid = auth.uid() and a.role = 'owner')
  );

create policy closer_own_orders on orders
  for all using (
    closeuse_id = (select id from agents a where a.auth_uid = auth.uid())
  );

-- (Repliquer des policies similaires sur call_attempts / scheduled_callbacks.)

-- Seed pays
insert into countries (code, nom, indicatif, devise, fuseau, longueur_locale) values
  ('CM','Cameroun','237','FCFA','Africa/Douala',9),
  ('CI','Côte d''Ivoire','225','FCFA','Africa/Abidjan',10),
  ('SN','Sénégal','221','FCFA','Africa/Dakar',9)
on conflict (code) do nothing;
