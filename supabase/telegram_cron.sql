-- ============================================================
-- Close-Pro — alertes Telegram SANS serveur (tout dans Supabase).
-- pg_cron scanne chaque minute, pg_net appelle l'API Telegram.
-- A executer (ou re-executer) dans Supabase > SQL Editor. Idempotent.
-- ============================================================

-- 1) Extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Config Telegram (ne pas ecraser des valeurs deja saisies)
create table if not exists app_config (key text primary key, value text);
insert into app_config (key, value) values
  ('telegram_token', 'COLLER_VOTRE_TOKEN_BOT'),
  ('telegram_chat_id', 'COLLER_VOTRE_CHAT_ID')
on conflict (key) do nothing;
--   update app_config set value='TON_TOKEN'   where key='telegram_token';
--   update app_config set value='TON_CHAT_ID' where key='telegram_chat_id';

-- 2b) Drapeau de notification sur les tentatives (pour notifier "traite" une seule fois)
alter table call_attempts add column if not exists notifie boolean default false;

-- 3) Heures de travail (selon le fuseau du pays). Pas d'horaires = toujours actif.
create or replace function in_working_hours(p_fuseau text, p_horaires jsonb)
returns boolean language plpgsql stable as $$
declare deb text; fin text; cur time; dt time; ft time;
begin
  deb := nullif(p_horaires->>'debut','');
  fin := nullif(p_horaires->>'fin','');
  if deb is null or fin is null then return true; end if;
  cur := (now() at time zone coalesce(nullif(p_fuseau,''),'Africa/Abidjan'))::time;
  begin dt := deb::time; ft := fin::time; exception when others then return true; end;
  if ft > dt then return cur >= dt and cur < ft;
  else return cur >= dt or cur < ft; end if;
end; $$;

-- 4) Test immediat du branchement Telegram.  select notify_test();
create or replace function notify_test() returns text language plpgsql as $$
declare tok text; chat text;
begin
  select value into tok  from app_config where key = 'telegram_token';
  select value into chat from app_config where key = 'telegram_chat_id';
  if tok is null or chat is null or tok like 'COLLER%' or chat like 'COLLER%' then
    return 'Token/chat_id non configures dans app_config.';
  end if;
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('chat_id', chat, 'text', E'Close-Pro \xE2\x9C\x85 test de notification OK.')
  );
  return 'Message de test envoye. Verifie Telegram.';
end; $$;

-- 5) UNE SEULE alerte par commande en retard (10 min depassees ou rappel manque),
--    pendant les heures de travail. Pas d'escalade.
create or replace function notify_late_orders() returns void language plpgsql as $$
declare tok text; chat text; r record; msg text; prefix text;
begin
  select value into tok  from app_config where key = 'telegram_token';
  select value into chat from app_config where key = 'telegram_chat_id';
  if tok is null or chat is null or tok like 'COLLER%' or chat like 'COLLER%' then return; end if;

  for r in
    select o.id, o.numero, o.nom_complet, o.produit_nom, o.total, o.region, o.pays,
           o.appel_deadline, o.rappel_at, o.statut,
           a.nom as closeuse_nom, a.horaires as horaires,
           coalesce(c.fuseau, 'Africa/Abidjan') as fuseau
    from orders o
    left join agents a on a.id = o.closeuse_id
    left join countries c on c.code = o.pays
    where o.is_backfill = false
      and o.statut in ('a_appeler', 'a_rappeler', 'injoignable', 'reporte')
      and (
            (o.rappel_at is not null and o.rappel_at + interval '10 minutes' < now())
         or (o.rappel_at is null and o.statut = 'a_appeler'
             and o.appel_deadline is not null and o.appel_deadline < now())
          )
      and in_working_hours(coalesce(c.fuseau, 'Africa/Abidjan'), a.horaires)
      and not exists (select 1 from events e where e.order_id = o.id and e.type = 'retard' and e.notifie)
    limit 60
  loop
    prefix := case when r.rappel_at is not null
                   then E'\xE2\x8F\xB0 RAPPEL DEPASSE (+10 min)'
                   else E'\xF0\x9F\x9F\xA0 RETARD (10 min)' end;
    msg := prefix || ' — ' || coalesce(r.closeuse_nom, 'closeuse') || E'\n'
        || r.numero || ' - ' || coalesce(r.nom_complet, '') || ' (' || coalesce(r.region, '-') || ')' || E'\n'
        || coalesce(r.produit_nom, '') || ' - ' || coalesce(r.total, 0)::text || ' FCFA';

    perform net.http_post(
      url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('chat_id', chat, 'text', msg)
    );
    insert into events (order_id, type, severite, canal_notif, destinataire, notifie, envoye_at)
    values (r.id, 'retard', 'alerte', 'telegram', 'owner', true, now());
  end loop;
end; $$;

-- 6) (Notification de traitement supprimee : le proprietaire ne veut plus etre
--    notifie des changements de statut. On retire l'ancienne fonction si elle existe.)
drop function if exists notify_traitements();

-- 7) Scan des retards chaque minute.
create or replace function notify_scan() returns void language plpgsql as $$
begin
  perform notify_late_orders();
end; $$;

select cron.unschedule('close-pro-sla') where exists (select 1 from cron.job where jobname = 'close-pro-sla');
select cron.schedule('close-pro-sla', '* * * * *', $$select notify_scan()$$);

-- ============================================================
-- DIAGNOSTIC :
--   select notify_test();        -- message Telegram immediat
--   select notify_scan();        -- force un scan des retards
--   select * from cron.job;      -- tache 'close-pro-sla' planifiee ?
-- ============================================================
