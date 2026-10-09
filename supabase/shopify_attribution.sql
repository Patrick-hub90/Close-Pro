-- ============================================================
-- Close-Pro — Attribution publicitaire des commandes Shopify (fbclid / IP client).
-- Un webhook Shopify « Création de commande » appelle l'Edge Function `shopify-commande`, qui range
-- ici l'identifiant de clic Meta (fbclid) et l'IP du client lus dans les attributs EasySell
-- (full_url, IP Address). L'envoi « CommandeLivree » (meta_capi.sql) s'en sert pour relier chaque
-- livraison à la pub cliquée (paramètre fbc) et l'envoyer comme événement « site web ».
-- Table séparée (et non colonnes de orders) : le webhook arrive souvent AVANT la synchro du Sheet.
-- Idempotent.
-- ============================================================
create table if not exists shopify_attributions (
  pays         text not null,
  numero       text not null,               -- n° de commande sans « # » (= orders.numero)
  fbclid       text,
  ad_id        text,
  ip           text,
  user_agent   text,
  url          text,                         -- page produit (sans paramètres) = event_source_url
  commande_at  timestamptz,                  -- création de la commande Shopify (horodatage du fbc)
  updated_at   timestamptz not null default now(),
  primary key (pays, numero)
);
alter table shopify_attributions enable row level security;  -- aucune policy : service_role uniquement

-- Boutique Shopify -> pays de l'appli, et jeton secret attendu dans l'URL du webhook.
insert into app_config (key, value) values
  ('shopify_pays_pnz5xm-pg.myshopify.com', 'CM'),   -- Noshop_CAM
  ('shopify_pays_8kif7q-am.myshopify.com', 'SN'),   -- Noshop_SEN
  ('shopify_webhook_token', replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;
