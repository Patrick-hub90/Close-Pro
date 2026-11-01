-- ============================================================
-- Close-Pro — Formulaire de commande maison (remplace EasySell sur les nouvelles boutiques).
-- L'Edge Function `commande-cod` crée la commande directement dans `orders`.
-- Les numéros partent de 50001 pour ne jamais croiser ceux des boutiques Shopify (#1001…).
-- Idempotent.
-- ============================================================
create sequence if not exists cod_numero_seq start with 50001;

create or replace function cod_prochain_numero() returns bigint
language sql security definer set search_path = public as $$
  select nextval('cod_numero_seq')
$$;
revoke all on function cod_prochain_numero() from public, anon, authenticated;

-- Boutiques autorisées à utiliser le formulaire -> pays de l'appli.
insert into app_config (key, value) values
  ('cod_shop_utauxp-w2.myshopify.com', 'SN')   -- Noshop_SENE
on conflict (key) do nothing;
