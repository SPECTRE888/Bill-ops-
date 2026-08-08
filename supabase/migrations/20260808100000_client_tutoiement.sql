-- Remplace la formule de politesse libre (email_body) par un simple choix vouvoiement/tutoiement
-- par client ; la formule elle-même reste un texte figé côté app (facture.html), pas éditable.
alter table public.clients add column if not exists tutoiement boolean not null default false;
