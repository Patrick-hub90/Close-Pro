-- ============================================================
-- Close-Pro — Envoi des commandes LIVRÉES au pixel Meta (API Conversions, côté serveur).
-- Quand une commande est « livre » depuis 2 h (écran d'appel, revue du matin, sélection
-- multiple…), un événement part vers le pixel du pays de la commande.
--
-- Pas de double comptage : le formulaire EasySell/Shopify envoie déjà « Purchase » à la commande ;
-- la livraison part sous un événement DISTINCT (par défaut « CommandeLivree »).
-- Données client hachées en SHA-256 (téléphone, prénom, nom, pays), comme l'exige Meta.
-- L'envoi ne bloque JAMAIS la clôture : il est fait à part, par une tâche planifiée.
-- Idempotent : peut être ré-exécuté.
-- ============================================================

-- 1) Configuration (un pixel + un jeton par pays ; seuls les pays configurés envoient)
insert into app_config (key, value) values
  ('meta_pixel_id_CM',   '783917907877789'),            -- pixel « Noshop_2025 » (boutique Noshop_CAM)
  ('meta_capi_token_CM', 'COLLER_VOTRE_JETON_CAPI'),    -- Gestionnaire d'événements > pixel > Paramètres > API Conversions > Générer un jeton
  ('meta_event_name',    'CommandeLivree'),             -- nom de l'événement envoyé à la livraison
  ('meta_currency',      'XAF'),                        -- devise par défaut : FCFA (Afrique centrale)
  ('meta_pixel_id_SN',   '783917907877789'),            -- Sénégal : même pixel Noshop_2025 (jeton SN = copie du jeton CM)
  ('meta_currency_SN',   'XOF'),                        -- devise propre à un pays (prioritaire) : FCFA (Afrique de l'Ouest)
  ('meta_test_event_code', '')                          -- facultatif : code de l'onglet « Tester les événements »
on conflict (key) do nothing;

-- 2) Corps de la requête pour une commande (partagé par l'envoi automatique et le diagnostic)
create or replace function meta_capi_body(o public.orders) returns jsonb
  language plpgsql stable security definer set search_path = public, extensions as $$
declare evname text; cur text; testc text; tel text; parts text[]; prenom text; nom text; ud jsonb; body jsonb;
begin
  select coalesce(nullif(value, ''), 'CommandeLivree') into evname from app_config where key = 'meta_event_name';
  select coalesce(
    (select nullif(value, '') from app_config where key = 'meta_currency_' || coalesce(o.pays, '')),
    (select nullif(value, '') from app_config where key = 'meta_currency'),
    'XAF') into cur;
  select nullif(value, '') into testc from app_config where key = 'meta_test_event_code';
  evname := coalesce(evname, 'CommandeLivree'); cur := coalesce(cur, 'XAF');

  tel := regexp_replace(coalesce(o.telephone_e164, o.telephone, ''), '\D', '', 'g');
  parts := regexp_split_to_array(lower(trim(regexp_replace(coalesce(o.nom_complet, ''), '[^[:alpha:][:space:]]', ' ', 'g'))), '\s+');
  prenom := nullif(parts[1], '');
  nom := nullif(array_to_string(parts[2:array_length(parts, 1)], ''), '');

  ud := jsonb_build_object('country', jsonb_build_array(encode(sha256(convert_to(lower(coalesce(o.pays, 'cm')), 'UTF8')), 'hex')));
  if tel <> '' then
    ud := ud || jsonb_build_object(
      'ph',          jsonb_build_array(encode(sha256(convert_to(tel, 'UTF8')), 'hex')),
      'external_id', jsonb_build_array(encode(sha256(convert_to(tel, 'UTF8')), 'hex')));
  end if;
  if prenom is not null then ud := ud || jsonb_build_object('fn', jsonb_build_array(encode(sha256(convert_to(prenom, 'UTF8')), 'hex'))); end if;
  if nom    is not null then ud := ud || jsonb_build_object('ln', jsonb_build_array(encode(sha256(convert_to(nom,    'UTF8')), 'hex'))); end if;

  body := jsonb_build_object('data', jsonb_build_array(jsonb_build_object(
    'event_name',    evname,
    'event_time',    extract(epoch from coalesce(o.livre_at, now()))::bigint,
    'event_id',      'livre-' || o.id,                -- identifiant unique : Meta ignore les doublons
    'action_source', 'system_generated',
    'user_data',     ud,
    'custom_data',   jsonb_build_object(
                       'currency', cur, 'value', coalesce(o.total, 0), 'order_id', o.numero,
                       'content_name', o.produit_nom, 'content_type', 'product', 'num_items', coalesce(o.quantite, 1),
                       'pays', o.pays)  -- permet une conversion personnalisée par pays (même pixel)
  )));
  if testc is not null then body := body || jsonb_build_object('test_event_code', testc); end if;
  return body;
end $$;
revoke execute on function meta_capi_body(public.orders) from public;

-- 3) Envoi DIFFÉRÉ : une livraison ne part au pixel que si la commande est restée « livre » pendant
--    meta_delai_minutes (120 par défaut). Une erreur de clic corrigée dans ce délai (Livré -> Annulé…)
--    n'est donc jamais envoyée — Meta ne permet pas de retirer un événement déjà reçu.
--    event_time = livre_at (heure réelle de la livraison) ; Meta accepte jusqu'à 7 jours de retard.
--    Tâche pg_cron toutes les 5 minutes, asynchrone (pg_net) : ne bloque jamais l'appli.
insert into app_config (key, value) values ('meta_delai_minutes', '120') on conflict (key) do nothing;

-- Moment où la commande a été MARQUÉE « livre » (horloge serveur). livre_at peut être antidaté
-- (revue du matin) : le délai de sécurité part donc du clic, pas de la date de livraison.
alter table orders add column if not exists livre_marque_at timestamptz;
create or replace function orders_livre_marque() returns trigger language plpgsql as $$
begin
  if new.statut = 'livre' and (tg_op = 'INSERT' or old.statut is distinct from 'livre') then
    new.livre_marque_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_orders_livre_marque on orders;
create trigger trg_orders_livre_marque before insert or update of statut on orders
  for each row execute function orders_livre_marque();

drop trigger if exists trg_meta_capi_livraison on orders;   -- ancien envoi immédiat (remplacé)

create or replace function meta_capi_envoyer_en_attente() returns int
  language plpgsql security definer set search_path = public, extensions as $$
declare r record; px text; tok text; delai int; n int := 0;
begin
  select coalesce(nullif(value, '')::int, 120) into delai from app_config where key = 'meta_delai_minutes';
  delai := coalesce(delai, 120);
  for r in
    select o.* from orders o
    where o.statut = 'livre'
      and coalesce(o.livre_marque_at, o.livre_at) <= now() - make_interval(mins => delai)
      and coalesce(o.livre_at, o.livre_marque_at) > now() - interval '6 days'   -- Meta refuse > 7 jours
      and not exists (select 1 from events e where e.order_id = o.id and e.type = 'meta_capi')
    order by coalesce(o.livre_marque_at, o.livre_at)
    limit 50
  loop
    begin
      select value into px  from app_config where key = 'meta_pixel_id_'   || coalesce(r.pays, '');
      select value into tok from app_config where key = 'meta_capi_token_' || coalesce(r.pays, '');
      continue when px is null or px = '' or px like 'COLLER%' or tok is null or tok = '' or tok like 'COLLER%';
      perform net.http_post(
        url := 'https://graph.facebook.com/v21.0/' || px || '/events?access_token=' || tok,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := meta_capi_body(r::public.orders));
      insert into events (order_id, type, severite, canal_notif, destinataire, notifie, envoye_at, payload)
      values (r.id, 'meta_capi', 'info', 'meta', 'pixel', true, now(), jsonb_build_object('pixel', px));
      n := n + 1;
    exception when others then
      raise warning 'meta_capi_envoyer_en_attente (%): %', r.numero, sqlerrm;
    end;
  end loop;
  return n;
end $$;
revoke execute on function meta_capi_envoyer_en_attente() from public;

select cron.unschedule(jobid) from cron.job where jobname = 'meta-capi-livraisons';
select cron.schedule('meta-capi-livraisons', '*/5 * * * *', 'select meta_capi_envoyer_en_attente()');

-- 4) Diagnostic : envoie (SYNCHRONE) l'événement d'une commande et renvoie la réponse exacte de Meta.
--    select cz_diag_meta('1009');   -> {"events_received":1,...} = OK
create or replace function cz_diag_meta(p_numero text, p_pays text default 'CM')
  returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare px text; tok text; o public.orders; v_status int; v_content text;
begin
  select value into px  from app_config where key = 'meta_pixel_id_'   || p_pays;
  select value into tok from app_config where key = 'meta_capi_token_' || p_pays;
  if px is null or tok is null or tok like 'COLLER%' then
    return jsonb_build_object('ok', false, 'erreur', 'Pixel ou jeton non configuré pour ' || p_pays || ' (meta_pixel_id_' || p_pays || ' / meta_capi_token_' || p_pays || ').');
  end if;
  select * into o from orders where numero = p_numero and pays = p_pays;
  if o.id is null then return jsonb_build_object('ok', false, 'erreur', 'Commande ' || p_numero || ' introuvable.'); end if;
  begin
    select status, content into v_status, v_content
    from extensions.http((
      'POST', 'https://graph.facebook.com/v21.0/' || px || '/events?access_token=' || tok,
      array[]::extensions.http_header[], 'application/json', meta_capi_body(o)::text
    )::extensions.http_request);
  exception when others then
    return jsonb_build_object('ok', false, 'erreur', 'Appel HTTP échoué : ' || sqlerrm);
  end;
  return jsonb_build_object('ok', v_status = 200, 'status', v_status, 'reponse_meta', v_content);
end $$;
revoke execute on function cz_diag_meta(text, text) from public;
