# Radar de Mobilizações

Agenda pública de atos, manifestações, plenárias, reuniões e outras mobilizações, organizada por data e cidade, com fontes rastreáveis, mapa, calendário, pôsteres e fluxo editorial.

## Rodar localmente

Crie um arquivo `.env` na raiz do projeto com as mesmas credenciais públicas configuradas no Netlify:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICAVEL
```

Não use a `service_role`/secret key no frontend.

Depois:

```bash
npm install
npm run dev
```

Sem `.env`, o desenvolvimento entra no catálogo local de demonstração: os eventos aparecem, mas recursos ligados ao Supabase, como participantes, autenticação, chat e painel administrativo, não funcionam.

## Supabase

Para uma instalação nova, rode `supabase/schema.sql`, depois `supabase/migrations/20261008090000_event_community.sql` e, por fim, o seed editorial disponível em `supabase/seed_full.sql`. O schema base já inclui a migration de analytics anterior. Crie uma conta em `Authentication > Users` e vincule o UUID dessa conta à tabela `public.admin_users`.

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

## Segurança e discussão por evento

Cada rota `/evento/:id` pode exibir informações comunitárias com estado de verificação, discussão pública, conversa para contas que marcaram interesse e contagem agregada de interessados. Esse interesse autenticado é separado da presença anônima **Eu Vou** já existente; nenhum nome/email/lista de participantes é exibido. Comentários e informações novas passam por validação e fila de moderação; tabelas comunitárias não têm acesso direto pelo cliente e são acessadas por RPCs com `SECURITY DEFINER`, `auth.uid()` e RLS default-deny. Administradores em `public.admin_users` podem atribuir moderadores pela rota `/admin/moderacao`.

Os nomes públicos vêm somente de `user_metadata.display_name` (ou do rótulo genérico “Participante”); e-mails e listas de participantes não são retornados. A migration `20261008090000_event_community.sql` deve ser aplicada no Supabase depois do schema base antes de habilitar o módulo.

Há limites de 8 mensagens por 15 minutos e 10 submissões por 24 horas por conta. O tamanho máximo do pôster é 8 MB.

## Pôsteres

Os 77 arquivos de `posteres.rar` foram convertidos para JPEG e preservados em `public/posters/archive/p001.jpg` até `p077.jpg`, com o manifesto em `public/posters/archive/manifest.json`.

`POSTER-AUDIT.md` documenta, pôster por pôster, o tratamento editorial: evento existente, evento novo, duplicata, variante, calendário ou peça-resumo.

A página de cada evento com pôster oferece `Compartilhar pôster`, `WhatsApp`, `Baixar imagem` e `Copiar link`.

## Base editorial

A carga foi ampliada a partir da planilha de conferência do levantamento do tweet de @rogeanvinicius e das imagens enviadas posteriormente. Eventos com informação conflitante permanecem como `warning` e registros sem dados suficientes permanecem `pending`/não públicos, em vez de serem apagados silenciosamente.

Algumas peças do conjunto enviado são calendários ou resumos que cobrem várias atividades; elas foram usadas como evidência complementar e não convertidas automaticamente em um evento único.

## Interpretação de pôsteres e validação geográfica

No painel `/admin`, a ferramenta de pôsteres pode interpretar em conjunto o OCR da imagem, o texto e a URL da publicação. A saída permanece como sugestão para revisão, não como publicação automática.

A verificação geográfica consulta a lista de municípios e UFs do IBGE. Nomes de prédios, tribunais, praças e pontos de encontro devem ficar em `venue`, não em `city`. Termos de mobilização como “lambe-lambe” e “colagem de lambes” são classificados como `Panfletagem`. Quando a API de lugares estiver disponível, o sistema busca endereço e coordenadas no Google Maps/Places; resultados ambíguos ficam para escolha manual.

### Habilitar endereços e coordenadas no Google Maps

A validação de cidade pelo IBGE funciona sem chave Google. Para pesquisar locais específicos e preencher endereço/latitude/longitude, configure a API de lugares:

1. No Google Cloud Console, selecione um projeto, ative **Places API (New)** e configure faturamento. Consulte a documentação oficial de [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search?hl=pt-BR) e [uso e faturamento](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing).
2. Crie uma chave e restrinja-a à API Places necessária. Não publique a chave no repositório nem a coloque em `wrangler.jsonc`.
3. No Cloudflare, abra **Workers & Pages → agenda-mobilizacoes → Settings → Variables and Secrets → Add → Secret**. Nomeie o segredo exatamente `GOOGLE_MAPS_API_KEY`, cole o valor e faça o deploy. Consulte [Secrets do Cloudflare Workers](https://developers.cloudflare.com/workers/configuration/secrets/).

Sem esse segredo, o painel deve mostrar que o Maps não está configurado; não deve inventar um endereço ou coordenadas. O uso da Places API pode gerar cobranças conforme os campos e as consultas solicitados.

## Netlify

Build command: `npm run build`

Publish directory: `dist`

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nas Environment Variables do Netlify. O `netlify.toml` já contém o fallback de SPA.
