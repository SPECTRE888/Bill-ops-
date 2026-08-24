-- handle_new_user() est un trigger sur auth.users, jamais censé être appelé en RPC direct par un
-- client. Postgres GRANTait EXECUTE à PUBLIC par défaut à la création, ce que l'advisor sécurité
-- Supabase signale (WARN). Risque réel faible (la fonction échoue hors contexte trigger), mais
-- fermé par hygiène lors de l'audit de sécurité du 2026-08-24.
revoke execute on function public.handle_new_user() from anon, authenticated;
