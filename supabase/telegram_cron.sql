-- ============================================================
-- Close-Pro — alertes Telegram SANS serveur (tout dans Supabase).
-- pg_cron scanne chaque minute, pg_net appelle l'API Telegram.
-- A executer (ou re-executer) dans Supabase > SQL Editor. Idempotent.
-- ============================================================

-- 1) Extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists http with schema extensions;  -- requetes HTTP synchrones (liaison Telegram)

-- 2) Config Telegram (ne pas ecraser des valeurs deja saisies)
create table if not exists app_config (key text primary key, value text);
insert into app_config (key, value) values
  ('telegram_token', 'COLLER_VOTRE_TOKEN_BOT'),
  ('telegram_chat_id', 'COLLER_VOTRE_CHAT_ID'),
  ('notif_force', 'false'),                              -- 'true' = forcer (ignore dimanche + horaires)
  ('telegram_bot_username', 'CloseProBot')   -- sans @, pour le bouton "Lier mon Telegram"
on conflict (key) do nothing;
--   update app_config set value='TON_TOKEN'   where key='telegram_token';
--   update app_config set value='TON_CHAT_ID' where key='telegram_chat_id';

-- 2a-bis) Config Email (Resend) : les memes alertes closeuses partent aussi par email,
--         et le proprietaire recoit les alertes de retard par email (owner_email).
insert into app_config (key, value) values
  ('resend_api_key', 'COLLER_VOTRE_CLE_RESEND'),
  ('resend_from',    'Close-Pro <onboarding@resend.dev>'),  -- a remplacer par un expediteur d'un domaine verifie dans Resend
  ('owner_email',    'contact.velaura@gmail.com')           -- email qui recoit les alertes proprietaire
on conflict (key) do nothing;
--   update app_config set value='re_xxxxxxxx'                          where key='resend_api_key';
--   update app_config set value='Close-Pro <alertes@tondomaine.com>'   where key='resend_from';
--   update app_config set value='ton-email@gmail.com'                  where key='owner_email';

-- 2a-ter) Config Push (OneSignal) : notification directement sur le telephone des closeuses.
insert into app_config (key, value) values
  ('onesignal_app_id',  'dcb18cac-e4a6-468a-978b-703a1759758e'),
  ('onesignal_api_key', 'COLLER_VOTRE_CLE_API_ONESIGNAL')
on conflict (key) do nothing;
--   update app_config set value='os_v2_app_xxxxxxxx' where key='onesignal_api_key';

-- 2b) Drapeau de notification sur les tentatives (pour notifier "traite" une seule fois)
alter table call_attempts add column if not exists notifie boolean default false;

-- 2c) Chat Telegram de chaque closeuse (pour ses notifications individuelles).
alter table agents add column if not exists telegram_chat_id text;
alter table agents add column if not exists telegram_link_code text;

-- 2d) RPC : un agent (closeuse) genere son code de liaison Telegram.
--     SECURITY DEFINER pour contourner la RLS (la closeuse n'ecrit pas dans agents directement).
drop function if exists link_code_generer();  -- type de retour change (text -> jsonb)
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

-- 2e) RPC appelee par l'app (polling) : lit les messages du bot (getUpdates SYNCHRONE via http)
--     et, si un message contient le code de l'agent, enregistre son chat_id. Renvoie true si lie.
create or replace function telegram_relier() returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare tok text; aid uuid; code text; existing text; body text; resp jsonb; u jsonb; vtxt text; chatid text;
begin
  select id, telegram_link_code, telegram_chat_id into aid, code, existing from agents where auth_uid = auth.uid();
  if aid is null then return false; end if;
  if existing is not null and existing <> '' then return true; end if;   -- deja lie
  if code is null or code = '' then return false; end if;                -- pas de liaison en cours
  select value into tok from app_config where key = 'telegram_token';
  if tok is null or tok like 'COLLER%' then return false; end if;
  begin
    select content into body from extensions.http_get('https://api.telegram.org/bot' || tok || '/getUpdates?limit=40');
  exception when others then return false; end;
  if body is null then return false; end if;
  begin resp := body::jsonb; exception when others then return false; end;
  if not coalesce((resp->>'ok')::boolean, false) then return false; end if;
  for u in select jsonb_array_elements(resp->'result') loop
    vtxt := trim(coalesce(u->'message'->>'text', ''));
    if vtxt like '/start %' then vtxt := trim(substring(vtxt from 8)); end if;  -- enleve "/start "
    chatid := u->'message'->'chat'->>'id';
    if chatid is not null and upper(vtxt) = upper(code) then
      update agents set telegram_chat_id = chatid, telegram_link_code = null where id = aid;
      return true;
    end if;
  end loop;
  return false;
end $$;
grant execute on function telegram_relier() to authenticated;

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
declare tok text; chat text; resend text; rfrom text; oemail text; r record; msg text; prefix text;
begin
  select value into tok    from app_config where key = 'telegram_token';
  select value into chat   from app_config where key = 'telegram_chat_id';
  select value into resend from app_config where key = 'resend_api_key';
  select value into rfrom  from app_config where key = 'resend_from';
  select value into oemail from app_config where key = 'owner_email';
  -- On continue tant qu'au moins un canal est configure (Telegram OU email).
  if (tok is null or tok like 'COLLER%' or chat is null or chat like 'COLLER%')
     and (resend is null or resend like 'COLLER%') then return; end if;

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

    if tok is not null and tok not like 'COLLER%' and chat is not null and chat not like 'COLLER%' then
      perform net.http_post(
        url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object('chat_id', chat, 'text', msg)
      );
    end if;
    -- Meme alerte au proprietaire par email (si Resend + owner_email configures).
    perform envoyer_email(resend, rfrom, oemail,
      'Close-Pro — ' || (case when r.rappel_at is not null then 'rappel depasse' else 'retard 10 min' end) || ' : ' || r.numero,
      msg);
    insert into events (order_id, type, severite, canal_notif, destinataire, notifie, envoye_at)
    values (r.id, 'retard', 'alerte', 'telegram', 'owner', true, now());
  end loop;
end; $$;

-- 6) (Notification de traitement supprimee : le proprietaire ne veut plus etre
--    notifie des changements de statut. On retire l'ancienne fonction si elle existe.)
drop function if exists notify_traitements();

-- 6b) Notifie chaque CLOSEUSE (sur son propre chat Telegram). Quatre declencheurs,
--     chacun avec son propre marqueur de dedup (events.type='cz_appel', payload.m) pour
--     qu'ils partent independamment :
--       'new'              -> nouvelle commande des qu'elle arrive dans "a appeler"
--       'new10:<deadline>' -> cette nouvelle commande depasse son echeance (10 min) sans etre appelee
--       'rap:<rappel_at>'  -> un rappel/injoignable/reporte dont l'heure vient de passer (revient dans "a appeler")
--       'rap10:<rappel_at>'-> ce rappel n'est toujours pas traite 10 min apres l'heure prevue
--     Une commande genere donc jusqu'a 2 alertes : a l'apparition, puis une relance a +10 min.

-- Helper reutilisable : envoie un email via l'API Resend (asynchrone, pg_net). No-op si non configure.
create or replace function envoyer_email(p_resend text, p_from text, p_to text, p_sujet text, p_corps text)
  returns void language plpgsql as $$
begin
  if p_resend is null or p_resend like 'COLLER%' or p_to is null or p_to = '' then return; end if;
  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || p_resend),
    body := jsonb_build_object('from', p_from, 'to', jsonb_build_array(p_to), 'subject', p_sujet, 'text', p_corps)
  );
end; $$;

-- Helper reutilisable : envoie une notification PUSH via OneSignal a une closeuse, ciblee par son
-- external_id (= id de l'agent). No-op si non configure ou external_id absent.
create or replace function envoyer_push(p_app text, p_key text, p_ext text, p_titre text, p_msg text)
  returns void language plpgsql as $$
begin
  if p_app is null or p_app like 'COLLER%' or p_key is null or p_key like 'COLLER%' or p_ext is null or p_ext = '' then return; end if;
  perform net.http_post(
    url := 'https://api.onesignal.com/notifications',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Key ' || p_key),
    body := jsonb_build_object(
      'app_id', p_app,
      'target_channel', 'push',
      'include_aliases', jsonb_build_object('external_id', jsonb_build_array(p_ext)),
      'headings', jsonb_build_object('en', p_titre, 'fr', p_titre),
      'contents', jsonb_build_object('en', p_msg, 'fr', p_msg)
    )
  );
end; $$;

-- Diagnostic : envoie un email de test SYNCHRONE et renvoie la reponse EXACTE de Resend (status + corps),
-- pour voir tout de suite ce qui bloque. A lancer dans SQL Editor :  select cz_diag_email('ton-email@gmail.com');
create or replace function cz_diag_email(p_to text)
  returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text; f text; v_status int; v_content text;
begin
  select value into k from app_config where key = 'resend_api_key';
  select value into f from app_config where key = 'resend_from';
  if k is null or k like 'COLLER%' then
    return jsonb_build_object('ok', false, 'erreur', 'resend_api_key non configuree : colle ta cle Resend dans app_config.');
  end if;
  begin
    select status, content into v_status, v_content
    from extensions.http((
      'POST',
      'https://api.resend.com/emails',
      array[extensions.http_header('Authorization', 'Bearer ' || k)],
      'application/json',
      jsonb_build_object('from', f, 'to', jsonb_build_array(p_to), 'subject', 'Test Close-Pro',
                         'text', 'Email de test Close-Pro : si tu lis ceci, l''envoi fonctionne.')::text
    )::extensions.http_request);
  exception when others then
    return jsonb_build_object('ok', false, 'erreur', 'Appel HTTP echoue : ' || SQLERRM);
  end;
  return jsonb_build_object('ok', v_status = 200, 'status', v_status, 'from_utilise', f, 'reponse_resend', v_content);
end $$;
revoke execute on function cz_diag_email(text) from public;  -- diagnostic admin : SQL Editor uniquement

-- Diagnostic : liste les closeuses avec leur id (= external_id pour le push), l'email et le chat Telegram.
-- A lancer dans SQL Editor :  select * from cz_diag_closeuses();   (email NULL = lien auth_uid a corriger)
drop function if exists cz_diag_closeuses();  -- type de retour elargi (ajout de l'id)
create or replace function cz_diag_closeuses()
  returns table(id text, nom text, email text, telegram_chat_id text) language sql
  security definer set search_path = public, auth as $$
  select a.id::text, a.nom, u.email::text, a.telegram_chat_id
  from agents a left join auth.users u on u.id = a.auth_uid
  where a.role = 'closer'
  order by a.nom;
$$;
revoke execute on function cz_diag_closeuses() from public;  -- diagnostic admin : SQL Editor uniquement

-- Diagnostic : envoie une notification push de test (SYNCHRONE) a un external_id (= id agent) et
-- renvoie la reponse exacte de OneSignal. A lancer :  select cz_diag_push('<id-de-l-agent>');
create or replace function cz_diag_push(p_ext text)
  returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_app text; v_key text; v_status int; v_content text;
begin
  select value into v_app from app_config where key = 'onesignal_app_id';
  select value into v_key from app_config where key = 'onesignal_api_key';
  if v_app is null or v_app like 'COLLER%' or v_key is null or v_key like 'COLLER%' then
    return jsonb_build_object('ok', false, 'erreur', 'onesignal_app_id / onesignal_api_key non configures dans app_config.');
  end if;
  begin
    select status, content into v_status, v_content
    from extensions.http((
      'POST', 'https://api.onesignal.com/notifications',
      array[extensions.http_header('Authorization', 'Key ' || v_key)],
      'application/json',
      jsonb_build_object('app_id', v_app, 'target_channel', 'push',
        'include_aliases', jsonb_build_object('external_id', jsonb_build_array(p_ext)),
        'headings', jsonb_build_object('en', 'Test Close-Pro'),
        'contents', jsonb_build_object('en', 'Notification de test Close-Pro.'))::text
    )::extensions.http_request);
  exception when others then
    return jsonb_build_object('ok', false, 'erreur', 'Appel HTTP echoue : ' || SQLERRM);
  end;
  return jsonb_build_object('ok', v_status = 200, 'status', v_status, 'reponse_onesignal', v_content);
end $$;
revoke execute on function cz_diag_push(text) from public;  -- diagnostic admin : SQL Editor uniquement

-- Helper : alerte la closeuse sur tous les canaux configures (Telegram + email Resend + push OneSignal)
-- puis journalise le marqueur (dedup unique, quel que soit le nombre de canaux).
drop function if exists cz_envoyer(text, text, uuid, text, text);                          -- v1 (avant email)
drop function if exists cz_envoyer(text, text, text, text, text, uuid, text, text, text);  -- v2 (avant push)
create or replace function cz_envoyer(
  p_tok text, p_chat text, p_resend text, p_from text, p_email text,
  p_os_app text, p_os_key text, p_ext text,
  p_order uuid, p_marqueur text, p_titre text, p_msg text
) returns void language plpgsql as $$
begin
  -- Telegram (si la closeuse a lie son compte)
  if p_tok is not null and p_tok not like 'COLLER%' and p_chat is not null and p_chat <> '' then
    perform net.http_post(
      url := 'https://api.telegram.org/bot' || p_tok || '/sendMessage',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('chat_id', p_chat, 'text', p_msg)
    );
  end if;
  -- Email (si la cle Resend est configuree et l'email de la closeuse connu)
  perform envoyer_email(p_resend, p_from, p_email, p_titre, p_msg);
  -- Push OneSignal (si configure et la closeuse a active les notifications sur son telephone)
  perform envoyer_push(p_os_app, p_os_key, p_ext, p_titre, p_msg);
  insert into events (order_id, type, severite, canal_notif, destinataire, notifie, envoye_at, payload)
  values (p_order, 'cz_appel', 'info', 'telegram', 'closeuse', true, now(), jsonb_build_object('m', p_marqueur));
end; $$;

create or replace function notify_closeuses() returns void language plpgsql
  security definer set search_path = public, auth, extensions as $$
declare tok text; resend text; rfrom text; os_app text; os_key text; os_ok boolean; r record; cli text; mk text;
begin
  select value into tok     from app_config where key = 'telegram_token';
  select value into resend  from app_config where key = 'resend_api_key';
  select value into rfrom   from app_config where key = 'resend_from';
  select value into os_app  from app_config where key = 'onesignal_app_id';
  select value into os_key  from app_config where key = 'onesignal_api_key';
  os_ok := os_app is not null and os_app not like 'COLLER%' and os_key is not null and os_key not like 'COLLER%';
  -- Rien a faire si aucun canal n'est configure (ni Telegram, ni email, ni push).
  if (tok is null or tok like 'COLLER%') and (resend is null or resend like 'COLLER%') and not os_ok then return; end if;

  for r in
    select o.id, o.numero, o.nom_complet, o.region, o.statut, o.rappel_at, o.appel_deadline,
           a.telegram_chat_id as chat, a.horaires as horaires, u.email as email, a.id::text as ext,
           coalesce(c.fuseau, 'Africa/Abidjan') as fuseau
    from orders o
    join agents a on a.id = o.closeuse_id
    left join auth.users u on u.id = a.auth_uid
    left join countries c on c.code = o.pays
    where ( (a.telegram_chat_id is not null and a.telegram_chat_id <> '')
         or (u.email is not null and u.email <> '')
         or os_ok )
      and o.is_backfill = false
      and o.statut in ('a_appeler','a_rappeler','injoignable','reporte')
      and notif_autorisee(coalesce(c.fuseau, 'Africa/Abidjan'), a.horaires)
    limit 200
  loop
    cli := coalesce(r.nom_complet, '') || ' (' || coalesce(r.region, '-') || ')';

    if r.statut = 'a_appeler' and r.rappel_at is null then
      -- (1) Nouvelle commande : alerte des l'apparition.
      if not exists (select 1 from events e where e.order_id = r.id and e.type = 'cz_appel' and e.payload->>'m' = 'new') then
        perform cz_envoyer(tok, r.chat, resend, rfrom, r.email, os_app, os_key, r.ext, r.id, 'new',
          'Nouvelle commande a appeler : ' || r.numero,
          E'\xF0\x9F\x93\x9E Nouvelle commande a appeler : ' || r.numero || E'\n' || cli);
      end if;
      -- (3) Nouvelle commande non appelee 10 min apres l'echeance : relance.
      if r.appel_deadline is not null and r.appel_deadline < now() then
        mk := 'new10:' || to_char(r.appel_deadline, 'YYYYMMDDHH24MI');
        if not exists (select 1 from events e where e.order_id = r.id and e.type = 'cz_appel' and e.payload->>'m' = mk) then
          perform cz_envoyer(tok, r.chat, resend, rfrom, r.email, os_app, os_key, r.ext, r.id, mk,
            'Commande pas encore appelee (+10 min) : ' || r.numero,
            E'\xE2\x8F\xB0 Commande pas encore appelee (+10 min) : ' || r.numero || E'\n' || cli);
        end if;
      end if;

    elsif r.statut in ('a_rappeler','injoignable','reporte') and r.rappel_at is not null and r.rappel_at < now() then
      -- (2a) Rappel dont l'heure vient de passer : la commande revient dans "a appeler".
      mk := 'rap:' || to_char(r.rappel_at, 'YYYYMMDDHH24MI');
      if not exists (select 1 from events e where e.order_id = r.id and e.type = 'cz_appel' and e.payload->>'m' = mk) then
        perform cz_envoyer(tok, r.chat, resend, rfrom, r.email, os_app, os_key, r.ext, r.id, mk,
          'A rappeler maintenant : ' || r.numero,
          E'\xF0\x9F\x94\x94 A rappeler maintenant : ' || r.numero || E'\n' || cli);
      end if;
      -- (2b) Rappel toujours pas traite 10 min apres l'heure prevue : relance.
      if r.rappel_at + interval '10 minutes' < now() then
        mk := 'rap10:' || to_char(r.rappel_at, 'YYYYMMDDHH24MI');
        if not exists (select 1 from events e where e.order_id = r.id and e.type = 'cz_appel' and e.payload->>'m' = mk) then
          perform cz_envoyer(tok, r.chat, resend, rfrom, r.email, os_app, os_key, r.ext, r.id, mk,
            'Rappel pas encore fait (+10 min) : ' || r.numero,
            E'\xE2\x8F\xB0 Rappel pas encore fait (+10 min) : ' || r.numero || E'\n' || cli);
        end if;
      end if;
    end if;
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

-- 7) Scan chaque minute : retards (proprietaire) + commandes a appeler (closeuses).
--    (La liaison Telegram se fait via telegram_relier() appelee par l'app, pas ici.)
create or replace function notify_scan() returns void language plpgsql as $$
begin
  perform notify_late_orders();
  perform notify_closeuses();
end; $$;

select cron.unschedule('close-pro-sla') where exists (select 1 from cron.job where jobname = 'close-pro-sla');
select cron.schedule('close-pro-sla', '* * * * *', $$select notify_scan()$$);

-- ============================================================
-- DIAGNOSTIC :
--   select notify_test();        -- message Telegram immediat
--   select notify_scan();        -- force un scan des retards
--   select * from cron.job;      -- tache 'close-pro-sla' planifiee ?
-- ============================================================
