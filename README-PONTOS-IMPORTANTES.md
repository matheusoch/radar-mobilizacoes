# Pontos importantes — versão corrigida

- A base pública usa o Supabase como fonte principal.
- As fontes dos eventos estão ligadas por `event_sources` e o RLS foi ajustado para permitir leitura dos vínculos de eventos públicos.
- Pôsteres incluídos nesta versão estão em `public/posters/`.
- URLs relativas de pôster no banco (`/posters/...`) são convertidas pelo frontend para a origem atual do site.
- O cadastro de fontes continua separado dos eventos, preservando rastreabilidade.
