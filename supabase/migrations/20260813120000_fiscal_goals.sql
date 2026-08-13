-- Taux d'imposition/charges et objectifs de CA (mensuel/annuel), réglés dans Profil > Fiscalité
-- & objectifs. Absents de company_info depuis le début : toDbRow/fromDbRow ne les mappaient pas,
-- donc hydrateFromCloud() écrasait le blob local `from` avec une version sans ces champs à chaque
-- boot/poll, les effaçant silencieusement. Colonnes ajoutées ici + mapping complété côté client.
alter table public.company_info add column if not exists tax_rate numeric;
alter table public.company_info add column if not exists charges_rate numeric;
alter table public.company_info add column if not exists ca_goal numeric;
alter table public.company_info add column if not exists ca_goal_year numeric;
