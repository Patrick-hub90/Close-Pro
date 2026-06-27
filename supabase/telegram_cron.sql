-- ============================================================
-- Close-Pro — alertes Telegram SANS serveur (tout dans Supabase).
-- pg_cron scanne chaque minute, pg_net appelle l'API Telegram.
-- A executer (ou re-executer) dans Supabase > SQL Editor.
-- Idempotent : peut etre relance sans risque.
-- ============================================================

-- 1) Extensions (si refus ici : Dashboard > Database > Extensions -> activer pg_cron et pg_net)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Config. NE PAS ecraser des valeurs deja saisies -> on cree seulement si absent.
create table if not exists app_config (key text primary key, value text);
insert into app_config (key, value) values
  ('telegram_token', 'COLLER_VOTRE_TOKEN_BOT'),
  ('telegram_chat_id', 'COLLER_VOTRE_CHAT_ID')
on conflict (key) do nothing;
-- >>> Si pas encore fait, renseigne tes valeurs (une seule fois) :
--   update app_config set value='TON_TOKEN'   where key='telegram_token';
--   update app_config set value='TON_CHAT_ID' where key='telegram_chat_id';

-- 3) Heures de travail : l'instant present est-il dans la plage [debut, fin] de la closeuse,
--    selon le fuseau du pays ? (pas d'horaires definis = toujours actif)
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
  else return cur >= dt or cur < ft; end if; -- plage qui passe minuit
end; $$;

-- 4) Test immediat du branchement Telegram (token/chat/pg_net), independant des commandes.
--    Utilisation :  select notify_test();   -> tu dois recevoir un message tout de suite.
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

-- 5) Alerte le proprietaire avec ESCALADE GRADUEE (10 / 20 / 30 min),
--    + rappels MANQUES — uniquement pendant les heures de travail de la closeuse.
create or replace function notify_late_orders() returns void language plpgsql as $$
declare
  tok text; chat text; r record; msg text; prefix text; evtype text;
  due timestamptz; mins numeric; lvl int;
begin
  select value into tok  from app_config where key = 'telegram_token';
  select value into chat from app_config where key = 'telegram_chat_id';
  if tok is null or chat is null or tok like 'COLLER%' or chat like 'COLLER%' then return; end if;

  for r in
    select o.id, o.numero, o.nom_complet, o.produit_nom, o.total, o.region, o.pays,
           o.appel_deadline, o.rappel_at, o.rappel_lieu, o.statut,
           a.nom as closeuse_nom, a.horaires as horaires,
           coalesce(c.fuseau, 'Africa/Abidjan') as fuseau
    from orders o
    left join agents a on a.id = o.closeuse_id
    left join countries c on c.code = o.pays
    where o.is_backfill = false
      and o.statut in ('a_appeler', 'a_rappeler', 'injoignable')
      and (
            (o.rappel_at is not null and o.rappel_at < now())                              -- rappel manque
         or (o.rappel_at is null and o.statut = 'a_appeler'
             and o.appel_deadline is not null and o.appel_deadline < now())                -- 10 min depassees
          )
      and in_working_hours(coalesce(c.fuseau, 'Africa/Abidjan'), a.horaires)
    limit 60
  loop
    -- Echeance de reference : heure de rappel si programmee, sinon deadline des 10 min.
    due := coalesce(r.rappel_at, r.appel_deadline);
    mins := extract(epoch from (now() - due)) / 60.0;
    -- Escalade graduee : niveau 1 = +0 (10 min), 2 = +10 (20 min), 3 = +20 (30 min).
    lvl := case when mins >= 20 then 3 when mins >= 10 then 2 when mins >= 0 then 1 else 0 end;
    if lvl = 0 then continue; end if;
    evtype := 'sla_' || lvl;

    -- une seule alerte par commande ET par niveau (les 3 niveaux tombent au fil du temps)
    if exists (select 1 from events e where e.order_id = r.id and e.type = evtype and e.notifie) then
      continue;
    end if;

    prefix := case
      when r.rappel_at is not null and lvl = 1 then E'\xE2\x8F\xB0 RAPPEL MANQUE'
      when lvl = 1 then E'\xF0\x9F\x9F\xA0 RETARD (10 min)'
      when lvl = 2 then E'\xF0\x9F\x94\xB4 2e ALERTE (20 min)'
      else                  E'\xE2\x9B\x94 CRITIQUE (30 min)'
    end;

    msg := prefix || ' — ' || coalesce(r.closeuse_nom, 'closeuse') || E'\n'
        || r.numero || ' - ' || coalesce(r.nom_complet, '') || ' (' || coalesce(r.region, '-') || ')' || E'\n'
        || coalesce(r.produit_nom, '') || ' - ' || coalesce(r.total, 0)::text || ' FCFA'
        || case when r.rappel_at is not null
                then E'\n' || 'rappel prevu ' || to_char(r.rappel_at at time zone r.fuseau, 'HH24:MI')
                     || coalesce(' - ' || nullif(r.rappel_lieu, ''), '')
                else '' end;

    perform net.http_post(
      url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('chat_id', chat, 'text', msg)
    );

    insert into events (order_id, type, severite, canal_notif, destinataire, notifie, envoye_at)
    values (r.id, evtype, case lvl when 3 then 'critique' when 2 then 'urgent' else 'alerte' end, 'telegram', 'owner', true, now());
  end loop;
end; $$;

-- 6) Planification chaque minute
select cron.unschedule('close-pro-sla') where exists (select 1 from cron.job where jobname = 'close-pro-sla');
select cron.schedule('close-pro-sla', '* * * * *', $$select notify_late_orders()$$);

-- ============================================================
-- DIAGNOSTIC (a executer separement, ligne par ligne, si besoin) :
--   select notify_test();                                  -- doit envoyer un message Telegram tout de suite
--   select * from cron.job;                                -- la tache 'close-pro-sla' est-elle planifiee ?
--   select key, left(value, 10) as apercu from app_config; -- token/chat_id bien presents ?
--   select notify_late_orders();                           -- force un scan immediat des retards
-- ============================================================
