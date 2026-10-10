ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS author_role text NOT NULL DEFAULT 'user';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chat_messages_author_role_check'
      AND conrelid = 'public.chat_messages'::regclass
  ) THEN
    ALTER TABLE public.chat_messages
      ADD CONSTRAINT chat_messages_author_role_check
      CHECK (author_role IN ('user', 'admin'));
  END IF;
END
$$;

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

    -- Publicações oficiais da equipe não precisam passar pela própria fila de moderação.
    IF TG_OP = 'INSERT' THEN
      NEW.status := 'approved';
      NEW.reviewed_at := now();
      NEW.reviewed_by := NEW.user_id;
    END IF;
  ELSE
    NEW.author_role := 'user';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_chat_message_author_identity() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_chat_message_author_identity ON public.chat_messages;
CREATE TRIGGER enforce_chat_message_author_identity
  BEFORE INSERT OR UPDATE OF user_id, display_name, author_role
  ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_chat_message_author_identity();
