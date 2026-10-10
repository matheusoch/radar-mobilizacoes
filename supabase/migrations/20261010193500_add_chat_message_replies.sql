alter table public.chat_messages
  add column if not exists parent_message_id uuid
  references public.chat_messages(id) on delete cascade;

create index if not exists chat_messages_parent_message_id_idx
  on public.chat_messages(parent_message_id);
