-- ============================================================
-- Close-Pro — Configuration RLS + bootstrap (À EXÉCUTER UNE FOIS)
-- Supabase > SQL Editor > New query > coller > Run.  Réexécutable sans risque.
-- ============================================================

-- Helpers SECURITY DEFINER (non bloqués par RLS -> évite la récursion)
create or replace function public.is_owner() returns boolean
  language sql security definer stable set search_path = public as
  $$ select exists (select 1 from agents where auth_uid = auth.uid() and role = 'owner') $$;

create or replace function public.my_agent_id() returns uuid
  language sql security definer stable set search_path = public as
  $$ select id from agents where auth_uid = auth.uid() limit 1 $$;

grant execute on function public.is_owner() to anon, authenticated;
grant execute on function public.my_agent_id() to anon, authenticated;

-- agents : chacun lit sa fiche ; le proprietaire lit/ecrit tout
alter table agents enable row level security;
drop policy if exists agents_select on agents;
drop policy if exists agents_write on agents;
create policy agents_select on agents for select to authenticated using (auth_uid = auth.uid() or public.is_owner());
create policy agents_write  on agents for all    to authenticated using (public.is_owner()) with check (public.is_owner());

-- countries : lecture pour tout compte connecte ; ecriture proprietaire
alter table countries enable row level security;
drop policy if exists countries_sel on countries;
drop policy if exists countries_wr on countries;
create policy countries_sel on countries for select to authenticated using (true);
create policy countries_wr  on countries for all    to authenticated using (public.is_owner()) with check (public.is_owner());

-- products / customers / call_attempts / scheduled_callbacks : comptes connectes
alter table products enable row level security;
drop policy if exists products_rw on products;
create policy products_rw on products for all to authenticated using (true) with check (true);

alter table customers enable row level security;
drop policy if exists customers_rw on customers;
create policy customers_rw on customers for all to authenticated using (true) with check (true);

alter table call_attempts enable row level security;
drop policy if exists ca_rw on call_attempts;
create policy ca_rw on call_attempts for all to authenticated using (true) with check (true);

alter table scheduled_callbacks enable row level security;
drop policy if exists sc_rw on scheduled_callbacks;
create policy sc_rw on scheduled_callbacks for all to authenticated using (true) with check (true);

-- orders : le proprietaire voit tout, la closeuse voit/edite les commandes de son pays
alter table orders enable row level security;
drop policy if exists owner_all_orders on orders;
drop policy if exists closer_own_orders on orders;
drop policy if exists orders_owner on orders;
drop policy if exists orders_closer on orders;
create policy orders_owner  on orders for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy orders_closer on orders for all to authenticated
  using  (pays in (select pays from agents where auth_uid = auth.uid() and role = 'closer'))
  with check (pays in (select pays from agents where auth_uid = auth.uid() and role = 'closer'));

-- events / app_config : proprietaire (le cron Telegram tourne en postgres et bypass)
alter table events enable row level security;
drop policy if exists events_rw on events;
create policy events_rw on events for all to authenticated using (public.is_owner()) with check (public.is_owner());

alter table app_config enable row level security;
drop policy if exists cfg_rw on app_config;
create policy cfg_rw on app_config for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- ============ Données de départ ============

insert into countries (code, nom, indicatif, devise, fuseau, longueur_locale) values
  ('CM','Cameroun','237','FCFA','Africa/Douala',9),
  ('CI','Côte d''Ivoire','225','FCFA','Africa/Abidjan',10),
  ('SN','Sénégal','221','FCFA','Africa/Dakar',9)
on conflict (code) do nothing;

-- Te declarer PROPRIETAIRE (par email — aucun UUID a copier)
insert into agents (auth_uid, role, nom, pays)
select id, 'owner', 'Patrick', 'CM'
from auth.users
where email = 'charlesbaguidi03@gmail.com'
on conflict (auth_uid) do update set role = 'owner';

-- Telegram (alertes proprietaire)
insert into app_config (key, value) values
  ('telegram_token','8864478457:AAF3n0V1MwOLSVO3-ExIOwh6WGOOH1vDRS8'),
  ('telegram_chat_id','6140767033')
on conflict (key) do update set value = excluded.value;

-- Auto-assignation : toute nouvelle commande va a la closeuse du pays
create or replace function auto_assign_order() returns trigger language plpgsql as $$
begin
  if new.closeuse_id is null then
    select id into new.closeuse_id from agents
      where role = 'closer' and actif and pays = new.pays order by created_at limit 1;
  end if;
  return new;
end $$;
drop trigger if exists trg_auto_assign on orders;
create trigger trg_auto_assign before insert on orders for each row execute function auto_assign_order();
