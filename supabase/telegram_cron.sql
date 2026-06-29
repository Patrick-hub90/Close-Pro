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
  ('telegram_chat_id', 'COLLER_VOTRE_CHAT_ID'),
  ('notif_force', 'false'),                              -- 'true' = forcer (ignore dimanche + horaires)
  ('telegram_bot_username', 'COLLER_USERNAME_DU_BOT')   -- sans @ (ex. CloseProBot), pour le bouton "Lier"
on conflict (key) do nothing;
--   update app_config set value='TON_TOKEN'   where key='telegram_token';
--   update app_config set value='TON_CHAT_ID' where key='telegram_chat_id';

-- 2b) Drapeau de notification sur les tentatives (pour notifier "traite" une seule fois)
alter table call_attempts add column if not exists notifie boolean default false;

-- 2c) Chat Telegram de chaque closeuse (pour ses notifications individuelles).
alter table agents add column if not exists telegram_chat_id text;
alter table agents add column if not exists telegram_link_code text;

-- 2d) RPC : un agent (closeuse) genere son code de liaison Telegram.
--     SECURITY DEFINER pour contourner la RLS (la closeuse n'ecrit pas dans agents directement).
create or replace function link_code_generer() returns jsonb language plpgsql security definer set search_path = public as $$
declare code text; aid uuid; bot text;
begin
  select id into aid from agents where auth_uid = auth.uid();
  if aid is null then return null; end if;
  code := 'LIER-' || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
  update agents set telegram_link_code = code where id = aid;
  select value into bot from app_config where key = 'telegram_bot_username';
  return jsonb_build_object('code', code, 'bot', coalesce(nullif(bot, 'COLLER_USERNAME_DU_BOT'), ''));
end $$;
grant execute on function link_code_generer() to authenticated;

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

-- 3b) Notification autorisee ? Par defaut : en heures de travail ET pas le dimanche.
--     Si app_config.notif_force = 'true', on outrepasse tout (notifs toujours envoyees).
create or replace function notif_autorisee(p_fuseau text, p_horaires jsonb)
returns boolean language plpgsql stable as $$
declare force_on boolean; jour int;
begin
  select coalesce(value = 'true', false) into force_on from app_config where key = 'notif_force';
  if force_on then return true; end if;
  -- dimanche (dow = 0) selon le fuseau du pays -> pas de notification
  jour := extract(dow from (now() at time zone coalesce(nullif(p_fuseau,''),'Africa/Abidjan')));
  if jour = 0 then return false; end if;
  return in_working_hours(p_fuseau, p_horaires);
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
      and notif_autorisee(coalesce(c.fuseau, 'Africa/Abidjan'), a.horaires)
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

-- 6b) Notifie chaque CLOSEUSE (sur son propre chat Telegram) des commandes a appeler :
--     nouvelles commandes + rappels dont l'heure vient de passer. Une notif par commande/echeance.
create or replace function notify_closeuses() returns void language plpgsql as $$
declare tok text; r record; msg text;
begin
  select value into tok from app_config where key = 'telegram_token';
  if tok is null or tok like 'COLLER%' then return; end if;

  for r in
    select o.id, o.numero, o.nom_complet, o.region, o.statut, o.rappel_at,
           a.telegram_chat_id as chat, a.horaires as horaires,
           coalesce(c.fuseau, 'Africa/Abidjan') as fuseau,
           case when o.statut = 'a_appeler' then 'new'
                else 'rap:' || coalesce(to_char(o.rappel_at, 'YYYYMMDDHH24MI'), '') end as marqueur
    from orders o
    join agents a on a.id = o.closeuse_id
    left join countries c on c.code = o.pays
    where a.telegram_chat_id is not null and a.telegram_chat_id <> ''
      and o.is_backfill = false
      and (
            (o.statut = 'a_appeler' and o.rappel_at is null)
         or (o.statut in ('a_rappeler','injoignable','reporte') and o.rappel_at is not null and o.rappel_at < now())
          )
      and notif_autorisee(coalesce(c.fuseau, 'Africa/Abidjan'), a.horaires)
      and not exists (
        select 1 from events e where e.order_id = o.id and e.type = 'cz_appel'
          and e.payload->>'m' = (case when o.statut = 'a_appeler' then 'new'
                                       else 'rap:' || coalesce(to_char(o.rappel_at, 'YYYYMMDDHH24MI'), '') end)
      )
    limit 80
  loop
    msg := E'\xF0\x9F\x93\x9E A appeler : ' || r.numero || E'\n'
        || coalesce(r.nom_complet, '') || ' (' || coalesce(r.region, '-') || ')'
        || case when r.statut <> 'a_appeler'
                then E'\n' || 'rappel prevu ' || to_char(r.rappel_at at time zone r.fuseau, 'HH24:MI')
                else '' end;
    perform net.http_post(
      url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('chat_id', r.chat, 'text', msg)
    );
    insert into events (order_id, type, severite, canal_notif, destinataire, notifie, envoye_at, payload)
    values (r.id, 'cz_appel', 'info', 'telegram', 'closeuse', true, now(), jsonb_build_object('m', r.marqueur));
  end loop;
end; $$;

-- 6c) Liaison Telegram automatique : lit les messages recus par le bot (getUpdates) et,
--     quand le texte correspond au code de liaison d'un agent, enregistre son chat_id.
--     Fonctionne en 2 temps : traite la reponse de l'appel precedent, puis relance un appel.
create or replace function telegram_sync_links() returns void language plpgsql as $$
declare tok text; req bigint; resp text; j jsonb; u jsonb; off bigint; maxid bigint; vtxt text;
begin
  select value into tok from app_config where key = 'telegram_token';
  if tok is null or tok like 'COLLER%' then return; end if;

  -- 1) Traiter la reponse du getUpdates precedent (pg_net stocke le corps dans net._http_response)
  select coalesce(value, '0')::bigint into req from app_config where key = 'tg_req';
  if req is not null and req > 0 then
    begin
      select content into resp from net._http_response where id = req;
    exception when others then resp := null; end;
    if resp is not null then
      begin j := resp::jsonb; exception when others then j := null; end;
      if j is not null and coalesce((j->>'ok')::boolean, false) then
        maxid := 0;
        for u in select jsonb_array_elements(j->'result') loop
          vtxt := trim(coalesce(u->'message'->>'text', ''));
          -- Lien profond "t.me/bot?start=CODE" => message "/start CODE" : on enleve le prefixe.
          if vtxt like '/start %' then vtxt := trim(substring(vtxt from 8)); end if;
          if vtxt <> '' and (u->'message'->'chat'->>'id') is not null then
            update agents set telegram_chat_id = (u->'message'->'chat'->>'id'), telegram_link_code = null
            where telegram_link_code is not null and upper(telegram_link_code) = upper(vtxt);
          end if;
          maxid := greatest(maxid, coalesce((u->>'update_id')::bigint, 0));
        end loop;
        if maxid > 0 then
          insert into app_config(key, value) values ('tg_offset', (maxid + 1)::text)
          on conflict (key) do update set value = excluded.value;
        end if;
      end if;
      begin delete from net._http_response where id = req; exception when others then null; end;
    end if;
  end if;

  -- 2) Relancer un getUpdates pour le prochain tick
  select coalesce(value, '0')::bigint into off from app_config where key = 'tg_offset';
  select net.http_get('https://api.telegram.org/bot' || tok || '/getUpdates?offset=' || off || '&limit=30&timeout=0') into req;
  insert into app_config(key, value) values ('tg_req', req::text)
  on conflict (key) do update set value = excluded.value;
end $$;

-- 7) Scan chaque minute : retards (proprietaire) + commandes a appeler (closeuses) + liaisons Telegram.
create or replace function notify_scan() returns void language plpgsql as $$
begin
  perform notify_late_orders();
  perform notify_closeuses();
  perform telegram_sync_links();
end; $$;

select cron.unschedule('close-pro-sla') where exists (select 1 from cron.job where jobname = 'close-pro-sla');
select cron.schedule('close-pro-sla', '* * * * *', $$select notify_scan()$$);

-- ============================================================
-- DIAGNOSTIC :
--   select notify_test();        -- message Telegram immediat
--   select notify_scan();        -- force un scan des retards
--   select * from cron.job;      -- tache 'close-pro-sla' planifiee ?
-- ============================================================
