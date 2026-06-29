-- Report daté des livraisons : une commande « reportée » depuis la revue du matin (SAS)
-- ne réapparaît qu'à partir de cette date. À exécuter une fois dans Supabase → SQL Editor.
alter table orders add column if not exists livraison_prevue timestamptz;
