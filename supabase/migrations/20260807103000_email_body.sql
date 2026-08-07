-- Formule de politesse pour l'email de facture : un défaut global (company_info) et un
-- override optionnel par client (clients), utilisés à l'envoi à la place du texte i18n figé.
alter table public.company_info add column if not exists email_body text;
alter table public.clients add column if not exists email_body text;
