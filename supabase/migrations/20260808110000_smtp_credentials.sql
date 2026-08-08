-- Remplace l'OAuth Gmail par un mot de passe d'application + SMTP, par utilisateur, stocké avec
-- le reste des infos entreprise (synchronisé cross-device, corrige la régression de gmailAuth
-- qui n'était jamais poussé au cloud). oauth_pending et les Edge Functions oauth-google-* restent
-- en place mais ne sont plus appelées côté client (aucune suppression : réversible sans risque).
alter table public.company_info add column if not exists smtp_email text;
alter table public.company_info add column if not exists smtp_app_password text;
