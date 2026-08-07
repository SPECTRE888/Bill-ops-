-- BIC ajouté comme champ distinct, à côté de rib (IBAN), dans le formulaire Mon entreprise.
alter table public.company_info add column if not exists bic text;
