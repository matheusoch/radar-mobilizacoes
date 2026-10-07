# Radar de Mobilizações

Agenda pública de atos, manifestações, plenárias, reuniões e outras mobilizações, organizada por data e cidade, com fontes rastreáveis, mapa, calendário, pôsteres e fluxo editorial.

## Rodar localmente

```bash
npm install
npm run dev
```

O ambiente usa `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Sem Supabase configurado, o aplicativo pode usar o catálogo local de demonstração.

## Supabase

Para uma instalação nova, rode `supabase/schema.sql` e depois o seed editorial disponível em `supabase/seed_full.sql`. Crie uma conta em `Authentication > Users` e vincule o UUID dessa conta à tabela `public.admin_users`.

O banco atual já está provisionado no projeto `radar-mobilizacoes` com:

- 112 eventos
- 109 eventos públicos
- 3 registros ocultos para revisão
- 10 fontes
- 125 vínculos evento/fonte
- 7 atualizações editoriais
- 85 eventos com pôster associado

As políticas de RLS separam leitura pública, administração e moderação. O Storage tem dois buckets: `event_posters` (público para leitura) e `submission_posters` (privado).

## Painel editorial

A rota `/admin` exige uma conta autenticada que esteja em `public.admin_users`.

O painel permite criar e editar eventos, alterar status, publicar/despublicar, anexar ou substituir pôster, selecionar as fontes vinculadas e excluir eventos. Também existe uma caixa de entrada de submissões enviadas pela comunidade.

A caixa de entrada é atualizada automaticamente a cada 10 segundos enquanto o painel está aberto. Uma submissão pode ser transformada em rascunho, revisada e publicada depois.

## Chat e envio de eventos

A rota `/chat` exige login. Mensagens de conversa entram como `pending` e só ficam visíveis para outras pessoas depois de aprovadas pelo administrador.

Além do chat, o usuário autenticado pode usar **Enviar novo evento** para mandar título, data, horário, cidade, UF, local, contexto e um pôster. O arquivo vai para o bucket privado `submission_posters` e chega à caixa de entrada do `/admin`.

O administrador pode aprovar, rejeitar ou marcar mensagens e submissões como spam. Ao criar um rascunho a partir de uma submissão, o pôster é transferido para o bucket público `event_posters` e o evento fica oculto até a publicação manual.

Há limites de 8 mensagens por 15 minutos e 10 submissões por 24 horas por conta. O tamanho máximo do pôster é 8 MB.

## Pôsteres

Os 77 arquivos de `posteres.rar` foram convertidos para JPEG e preservados em `public/posters/archive/p001.jpg` até `p077.jpg`, com o manifesto em `public/posters/archive/manifest.json`.

`POSTER-AUDIT.md` documenta, pôster por pôster, o tratamento editorial: evento existente, evento novo, duplicata, variante, calendário ou peça-resumo.

A página de cada evento com pôster oferece `Compartilhar pôster`, `WhatsApp`, `Baixar imagem` e `Copiar link`.

## Base editorial

A carga foi ampliada a partir da planilha de conferência do levantamento do tweet de @rogeanvinicius e das imagens enviadas posteriormente. Eventos com informação conflitante permanecem como `warning` e registros sem dados suficientes permanecem `pending`/não públicos, em vez de serem apagados silenciosamente.

Algumas peças do conjunto enviado são calendários ou resumos que cobrem várias atividades; elas foram usadas como evidência complementar e não convertidas automaticamente em um evento único.

## Netlify

Build command: `npm run build`

Publish directory: `dist`

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nas Environment Variables do Netlify. O `netlify.toml` já contém o fallback de SPA.
