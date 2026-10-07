# Correção de fontes e pôsteres

Esta versão corrige dois problemas da integração com o Supabase:

1. O RLS de `events`/`event_sources` foi ajustado no projeto Supabase para que eventos públicos e suas fontes possam ser lidos sem quebrar a consulta.
2. O frontend agora converte IDs locais das fontes para os UUIDs usados no banco quando precisar usar a base de fallback.
3. URLs relativas de pôster (`/posters/...`) são resolvidas na origem atual do site, e os pôsteres desta carga ficam em `public/posters/`.

No Supabase, os dados já estão carregados e não precisam ser importados novamente.
