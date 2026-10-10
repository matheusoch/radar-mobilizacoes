CREATE OR REPLACE FUNCTION public.enforce_chat_message_author_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'A mensagem precisa pertencer à conta autenticada.'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE user_id = NEW.user_id
  )
  INTO v_is_admin;

  IF v_is_admin THEN
    NEW.author_role := 'admin';
    NEW.display_name := 'Admin';

    IF TG_OP = 'INSERT' THEN
      NEW.status := 'approved';
      NEW.reviewed_at := now();
      NEW.reviewed_by := NEW.user_id;
    END IF;
  ELSE
    NEW.author_role := 'user';

    IF TG_OP = 'INSERT' THEN
      NEW.status := 'pending';
      NEW.reviewed_at := NULL;
      NEW.reviewed_by := NULL;

      IF lower(btrim(coalesce(NEW.display_name, ''))) ~
        '^(admin|administrador(a)?|moderador(a)?|modera[cç][ãa]o|equipe( da agenda)?)([[:space:]#:_-].*)?$'
      THEN
        NEW.display_name := 'Participante';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_chat_message_author_identity() FROM PUBLIC;
