CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'chat_reply' CHECK (type = 'chat_reply'),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text NOT NULL DEFAULT 'Participante',
  chat_message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  parent_message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  message_preview text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT notifications_user_message_type_key UNIQUE (user_id, chat_message_id, type)
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_created_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users mark own notifications read" ON public.notifications;
CREATE POLICY "Users mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.notifications FROM anon, public;
GRANT SELECT ON public.notifications TO authenticated;
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_chat_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_parent public.chat_messages%ROWTYPE;
  v_actor_name text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' OR NEW.parent_message_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_parent
  FROM public.chat_messages
  WHERE id = NEW.parent_message_id;

  IF NOT FOUND OR v_parent.status <> 'approved' OR v_parent.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = NEW.user_id
  ) THEN 'Admin' ELSE COALESCE(NULLIF(BTRIM(NEW.display_name), ''), 'Participante') END
  INTO v_actor_name;

  INSERT INTO public.notifications (
    user_id, type, actor_user_id, actor_name, chat_message_id,
    parent_message_id, message_preview
  )
  VALUES (
    v_parent.user_id, 'chat_reply', NEW.user_id, v_actor_name, NEW.id,
    v_parent.id, LEFT(COALESCE(NEW.content, ''), 180)
  )
  ON CONFLICT (user_id, chat_message_id, type) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_chat_reply() FROM PUBLIC;

DROP TRIGGER IF EXISTS notify_chat_reply ON public.chat_messages;
CREATE TRIGGER notify_chat_reply
  AFTER INSERT OR UPDATE OF status, parent_message_id
  ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_chat_reply();
