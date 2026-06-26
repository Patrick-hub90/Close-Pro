-- ============================================================
-- Close-Pro — alertes Telegram SANS serveur (tout dans Supabase).
-- pg_cron scanne chaque minute, pg_net appelle l'API Telegram.
-- A executer dans Supabase > SQL Editor APRES schema.sql.
-- ============================================================

-- 1) Extensions (si refus ici : Dashboard > Database > Extensions -> activer pg_cron et pg_net)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Config (mettre VOS valeurs). Le token n'est jamais dans le code de l'app.
create table if not exists app_config (key text primary key, value text);

insert into app_config (key, value) values
  ('telegram_token', 'COLLER_VOTRE_TOKEN_BOT'),
  ('telegram_chat_id', 'COLLER_VOTRE_CHAT_ID')
on conflict (key) do update set value = excluded.value;

-- 3) Fonction : alerte le proprietaire pour les commandes en retard (>30 min, jamais appelees)
create or replace function notify_late_orders() returns void language plpgsql as $$
declare
  tok text;
  chat text;
  r record;
  msg text;
begin
  select value into tok from app_config where key = 'telegram_token';
  select value into chat from app_config where key = 'telegram_chat_id';
  if tok is null or chat is null or tok like 'COLLER%' then return; end if;

  for r in
    select o.id, o.numero, o.nom_complet, o.produit_nom, o.total, o.region,
           a.nom as closeuse_nom
    from orders o
    left join agents a on a.id = o.closeuse_id
    where o.statut = 'a_appeler'
      and o.is_backfill = false
      and o.appel_deadline is not null
      and o.appel_deadline < now() - interval '20 minutes'  -- 30 min apres reception
      and not exists (
        select 1 from events e
        where e.order_id = o.id and e.type = 'deadline_depassee' and e.notifie
      )
    limit 20
  loop
    msg := 'RETARD APPEL — ' || coalesce(r.closeuse_nom, 'closeuse') || E'\n'
        || r.numero || ' — ' || coalesce(r.nom_complet, '') || ' (' || coalesce(r.region, '—') || ')' || E'\n'
        || coalesce(r.produit_nom, '') || ' — ' || coalesce(r.total, 0)::text || ' FCFA' || E'\n'
        || 'jamais appelée';

    perform net.http_post(
      url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('chat_id', chat, 'text', msg)
    );

    insert into events (order_id, type, severite, canal_notif, destinataire, notifie, envoye_at)
    values (r.id, 'deadline_depassee', 'alerte', 'telegram', 'owner', true, now());
  end loop;
end;
$$;

-- 4) Planification chaque minute
select cron.unschedule('close-pro-sla') where exists (select 1 from cron.job where jobname = 'close-pro-sla');
select cron.schedule('close-pro-sla', '* * * * *', $$select notify_late_orders()$$);

-- Test immediat (envoie une alerte si une commande est deja en retard) :
--   select notify_late_orders();
