-- Permet de remplacer l'adresse de réponse (Reply-To) par défaut (l'adresse de connexion Google)
-- par une autre, éditable depuis l'app sans avoir à changer de compte de connexion.
alter table public.company_info add column if not exists reply_to text;
