# Auditoria do lote de pôsteres 3

**Data da verificação:** 14/10/2026  
**Branch de trabalho:** `audit/poster-batch-3-manifest`  
**Estado:** manifesto preparado; não houve upload para Storage nem alteração de eventos.

## O que foi conferido

- O arquivo `novos-posters-3-importacao.zip` contém um RAR com **60 arquivos**.
- Os 60 arquivos do RAR correspondem a 60 arquivos do `posters-compactados.zip` por nome-base, tamanho e CRC.
- O ZIP de apoio também contém um JPEG extra de WhatsApp que **não pertence ao RAR oficial**.
- Dos 60 itens oficiais, **58 são elegíveis para catálogo** e dois são capturas de tela de páginas web, excluídas do catálogo de pôsteres.
- O manifesto em `POSTER-BATCH-3-MANIFEST.csv` registra nome, SHA-256, tamanho, dimensões, formato, classificação editorial, IDs candidatos e a razão da decisão.
- Comparei os SHA-256 dos 60 itens oficiais e do arquivo extra com `public.poster_index`: **nenhum hash já aparece no índice**. Isso só comprova ausência no índice de catálogo, não ausência física de qualquer objeto no Supabase Storage.

## Candidatos e cautelas

| Arquivo | Candidato | Resultado da revisão |
|---|---|---|
| `845530274_18028490552857255_8474512516782219532_n.jpg` | `30955248-151b-4b93-9750-9de4c1c6274b` | Correspondência forte: Caminhada em defesa da educação pública, Fortaleza, 13/10 às 14h, Praça da Bandeira. O evento está sem `image_url`; falta publicar o arquivo no Storage e fazer uma revisão final antes de vinculá-lo. |
| `HUhGd_uWgAAsyXj.jfif` | `d477e08a-fe01-4ae3-8fe5-d599f8a2628c` | Arte relacionada ao evento de Pelotas em 13/10; ele já possui imagem. Tratar como variante de catálogo e **não substituir** a imagem existente. |
| `HUhICxyWoAA7MeW.jfif` | `4e55aaba-5b0a-4233-a3aa-e407dec0d71c` | Arte compatível com data/local do ato em Brasília; o evento já possui imagem. Não sobrescrever. |
| `HUhJ-ENXIAAqZiY.jfif` | `c159e3f5-a480-4c6f-b9a4-ce3bc7cc28ae` | Arte compatível com data/horário do ato em Aracaju; o evento já possui imagem. Não sobrescrever. |
| `846727879_18633106765019303_6196360561892266010_n.jpg` e `HUhLAgNWkAAIpIG.jfif` | `994a5a21-79b2-4101-8c6e-9f4024067386` | Há conexão possível com o ato no Largo da Batata após a atividade da USP, mas horários/pontos diferem; revisão manual, sem vínculo automático. |
| `846843465_18646303405020567_7257882688157588770_n.jpg` | `610a4ad7-8b9f-45b8-95f1-6606c59e21e3` / `a086ca64-a859-44fd-8787-173be820eec1` | A arte de Teresina não permite decidir com segurança qual dos dois eventos existentes seria o destino. Revisão manual. |
| `848774213_18639338116042011_2288131987378242238_n.jpg` | `747215be-d126-54c4-b73a-62053f0f0b59` | A concentração na Praça do Homem Nu não coincide claramente com a rota atualmente cadastrada; revisão manual. |
| `WhatsApp Image 2026-10-13 at 09.00.27.jpeg` | — | A arte aponta para Arapiraca em 13/10, mas o evento semelhante na base está datado de 11/10. Não associar por coincidência de local. |

Os IDs acima são **candidatos de revisão**, não vínculos gravados.

## Materiais coletivos

As peças de agenda diária e as 20 páginas do calendário semanal são tratadas como fontes compartilhadas. Não devem ser associadas como pôster único de um só evento. O material genérico de panfletos/adesivos fica no catálogo de referência e não deve criar um evento. O JPEG extra que não veio no RAR oficial fica isolado até confirmação da sua origem. As duas capturas de tela de páginas web são excluídas do catálogo de pôsteres.

## O que ainda falta antes da importação

1. Obter ou confirmar os permalinks originais das artes individuais; nome/hash do arquivo, isoladamente, não comprova a origem nem licença de reutilização.
2. Fazer revisão manual dos candidatos ambíguos e dos eventos sem correspondência.
3. Publicar os arquivos elegíveis no bucket público correto usando o fluxo normal de upload do projeto; não criar metadados falsos em `storage.objects`.
4. Só então gravar entradas de índice/vínculos após uma comparação final. Preservar `image_url` e `poster_sha256` existentes.
5. Fazer conferência visual desktop/mobile depois do deploy.

Nenhum evento foi criado, atualizado, ocultado ou excluído neste trabalho. Também não foram alterados `src/components/EventCard.tsx`, o layout dos cards ou os SVGs.
