-- Fiche contact façon "équipier" BAR OPS : tarifs horaires (ce qu'il coûte / ce qu'on facture).
alter table public.contacts add column if not exists cost_rate numeric;
alter table public.contacts add column if not exists bill_rate numeric;
