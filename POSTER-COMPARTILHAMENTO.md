# Pôster e compartilhamento

A página `/evento/:id` agora mostra o pôster quando `image_url` estiver preenchido.

Ações disponíveis:
- Compartilhar pôster: usa Web Share com arquivo quando o dispositivo/navegador oferece suporte; caso contrário, compartilha o contexto e o link.
- WhatsApp: abre `wa.me` com título, data, cidade, local e URL do evento.
- Baixar imagem: tenta baixar via `fetch` + Blob; se o servidor não permitir CORS, abre a imagem em nova aba para salvar manualmente.
- Copiar link: copia o endereço do evento.

No `/admin`, existe agora um campo `URL do pôster`. O campo grava em `events.image_url`, já existente no schema do Supabase.


### Base ampliada
A base consolidada agora inclui 77 registros editoriais. O pôster aparece automaticamente quando `image_url` é preenchido.
