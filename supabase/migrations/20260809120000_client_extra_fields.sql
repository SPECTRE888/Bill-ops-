-- Ajoute des infos optionnelles à la fiche client : SIRET/TVA client + adresse de facturation
-- distincte (affichées sur la facture si renseignées), tarif horaire par défaut (pré-remplit
-- prestas/lignes de facture, n'apparaît pas tel quel sur la facture), notes internes (jamais
-- affichées sur la facture).
alter table public.clients add column if not exists siret text;
alter table public.clients add column if not exists billing_addr text;
alter table public.clients add column if not exists default_rate numeric;
alter table public.clients add column if not exists notes text;
