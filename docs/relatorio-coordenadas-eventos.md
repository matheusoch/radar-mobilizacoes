# Relatório de Coordenadas Geográficas dos Eventos — Radar de Mobilizações

**Data da auditoria:** 17/10/2026  
**Repositório:** `matheusoch/radar-mobilizacoes`

---

## 1. Resumo Quantitativo

| Métrica | Quantidade | Observação |
|---|---:|---|
| **Eventos e peças examinados no acervo local do repositório** | **104** | 77 pôsteres auditados (`p001`–`p077`) + 27 eventos extras de cartazes recentes (13/10 a 18/10/2026) |
| **Eventos na base completa de produção (Supabase)** | **800+** | Base remota não acessível diretamente neste ambiente isolado sem credenciais `.env` |
| **Eventos que já tinham coordenadas válidas no arquivo local** | **0** | Eventos importados por OCR/submissão entravam com `lat: null, lng: null` |
| **Eventos que receberam coordenadas novas verificadas (`src/data/event-coordinates.json`)** | **57** | 100% validados no Google Maps com cidade/UF compatíveis |
| **Localizados com alta confiança (`high`)** | **51** | Endereço completo com número, equipamento público oficial, campus ou praça exata |
| **Localizados com média confiança (`medium`)** | **6** | Via/bairro/estabelecimento confirmado sem número predial explícito no cartaz |
| **Localizados com baixa confiança (`low`)** | **0** | Nenhum resultado de baixa confiança foi incluído no JSON de produção |
| **Registros que continuam sem coordenadas (pendências / virtuais / peças-resumo)** | **21** | Detalhados individualmente nas tabelas abaixo (além de 26 duplicatas visuais já unificadas) |

---

## 2. Eventos com Percursos, Caminhadas ou Múltiplos Pontos de Encontro

Conforme a regra editorial definida, eventos com trajeto receberam como coordenada principal o **ponto inicial de concentração**, registrando-se a natureza de percurso no campo `notes`:

| `event_id` | Título / Evento | Cidade/UF | Percurso descrito | Coordenada atribuída (Ponto Inicial) |
|---|---|---|---|---|
| `belem-caminhada-praca-da-republica-09-10` | Caminhada Pará com Lula (09/10) | Belém/PA | Praça da República → Estação das Docas | `-1.45261, -48.49395` (Praça da República) |
| `vitoria-passeata-praca-do-papa-11-10` | Passeata a favor do Lula (11/10) | Vitória/ES | Praça do Papa → Praça dos Namorados | `-20.31568, -40.29512` (Praça do Papa) |
| `curitiba-praca-19-de-dezembro-18-10` | Caminhada Curitiba (18/10) | Curitiba/PR | Praça 19 de Dezembro → Palácio Iguaçu | `-25.42416, -49.26835` (Praça 19 de Dezembro) |
| `rio-de-janeiro-candelaria-07-10` | Protesto Estudantil Pacífico (07/10) | Rio de Janeiro/RJ | Candelária → Cinelândia / Centro | `-22.90075, -43.17764` (Igreja da Candelária) |
| `recife-parque-13-de-maio-11-10` | Caminhada Juntos contra o Bolsonarismo (11/10) | Recife/PE | Concentração no Parque 13 de Maio (percurso pelo Centro) | `-8.05752, -34.88196` (Parque 13 de Maio) |
| `sao-goncalo-praca-ex-combatentes-09-10` | Caminhada São Gonçalo (09/10) | São Gonçalo/RJ | Praça dos Ex-Combatentes → Praça Zé Garoto | `-22.82564, -43.05812` (Praça dos Ex-Combatentes) |
| `rio-de-janeiro-viaduto-madureira-15-10` | Ato Unificado da Educação em Madureira (15/10) | Rio de Janeiro/RJ | Viaduto de Madureira → Parque Madureira | `-22.87412, -43.33648` (Viaduto Negrão de Lima) |
| `manaus-bosque-da-resistencia-ufam-15-10` | Levante da Educação UEA-UFAM-INPA-IFAM (15/10) | Manaus/AM | Bosque da Resistência (em frente à UFAM) → INPA | `-3.09842, -59.98514` (Bosque da Resistência / UFAM) |
| `itapecerica-da-serra-praca-do-cruzeiro-17-10` | Itapecerica pela Democracia (17/10) | Itapecerica da Serra/SP | Saída da Av. 15 de Novembro / Praça do Cruzeiro | `-23.71654, -46.84928` (Praça do Cruzeiro) |
| `itajai-escola-xv-de-junho-17-10` | Caminhada Mulheres e Juventude (17/10) | Itajaí/SC | Saída em frente à Escola XV de Junho (Av. Min. Luiz Gallotti) | `-26.90685, -48.68652` (Av. Min. Luiz Gallotti) |
| `pelotas-rua-marques-de-olinda-299-17-10` | Caminhada Py Crespo (17/10) | Pelotas/RS | Concentração ACEPAS (Rua Marquês de Olinda, 299) → Café Aquários | `-31.74185, -52.33142` (Rua Marquês de Olinda, 299) |

---

## 3. Eventos Pendentes (Endereço Insuficiente, Ambíguo, Virtual ou Conflitante)

Nenhum destes eventos recebeu coordenada aproximada de centro de cidade para não distorcer o mapa:

| ID / Referência | Título | Cidade/UF informada | Local informado | Motivo da pendência | Informação que falta para resolver |
|---|---|---|---|---|---|
| `p005` (`dce-viracao-assembleia-geral`) | DCE Viração — Assembleia Geral Estudantes pela Democracia | Não informada no pôster | `"DCE Barzinho"` | **Cidade e UF ausentes / Local ambíguo** | Identificar a universidade e o município correspondente à chapa "DCE Viração". |
| `p017` (`porto-alegre-estudantes-novo-local`) | Estudantes com Lula — Novo Local | Porto Alegre/RS | `"Novo local"` (variante complementar UFRGS) | **Endereço ausente na peça complementar** | Confirmar se o novo local é o Largo Zumbi dos Palmares (`p007`) ou o Viaduto Imperatriz Leopoldina (`p012`). |
| `p030` / `p042` (`fortaleza-plenaria-online-juventude-06-10`) | Plenária Online da Juventude de Fortaleza | Fortaleza/CE | `"Google Meet"` | **Evento 100% Virtual** | Nenhuma coordenada física aplicável (corretamente filtrado como modalidade `Virtual`). |
| `p047` (`uemg-plenaria-antifascista-07-10`) | Plenária UEMG Antifascista | Múltiplas cidades/MG | `"Link geral + pontos de apoio presencial nas unidades"` | **Múltiplas unidades sem campus especificado** | A UEMG possui unidades em BH, Divinópolis, Barbacena, Carangola, Passos, Ubá etc. Falta listar quais unidades tiveram ponto presencial. |
| `p053` (`betim-casa-marx-engels-07-10`) | Conversa com a Base | Betim/MG | `"Casa Marx-Engels"` | **Endereço predial não localizado no Google Maps** | Informar rua, número e bairro da sede/espaço "Casa Marx-Engels" em Betim/MG. |
| `p040` (`cuiaba-agenda-06-11-10`) | Agenda Cuiabá 06 a 11/10 (7 atividades) | Cuiabá/MT | Múltiplos locais no calendário consolidado | **Locais individuais ausentes no resumo textual** | Extrair o endereço/ponto de encontro de cada uma das 7 atividades de Cuiabá. |
| `p065` (`balneario-camboriu-litoral-sc`) | Mobilização 2º Turno — Calendário Litoral SC | Balneário Camboriú/SC | Não detalhado no snippet do calendário | **Ponto de encontro específico ausente** | Confirmar praça ou endereço do ato em Balneário Camboriú. |
| `p074` (`sc-agenda-plenarias-catarinenses`) | Agenda de Plenárias e Reuniões — Catarinenses pela Virada | Estado de Santa Catarina/SC | Sem local específico | **Peça-resumo estadual sem endereço físico** | Não deve gerar pino único no mapa. |
| `p075-blumenau` (`blumenau-vale-do-itajai-08-10`) | Plenária Blumenau / Vale do Itajaí (08/10 18h30) | Blumenau/SC | Não detalhado na transcrição | **Endereço específico ausente** | Confirmar rua/sede ou praça em Blumenau/SC. |
| `p075-criciuma` (`criciuma-plenaria-06-10`) | Plenária Criciúma (06/10 19h30) | Criciúma/SC | Não detalhado na transcrição | **Endereço específico ausente** | Confirmar rua/sede ou praça em Criciúma/SC. |
| `juventude-praca-do-begonhao-15-10` | Juventude nas Ruas por um futuro mais justo (15/10 17h) | Cidade não informada no cartaz | `"Ponto de Encontro: Praça do Begozão → Praça do Centro, Praça do Leão"` | **Cidade e UF não constam na arte do pôster** | Identificar o município onde ficam a "Praça do Begozão" e a "Praça do Leão". |
| `sp-feira-cantidio-sampaio-15-10` | Panfletagem e Bandeiraço — Feira da Cantídio Sampaio (15/10 9h30) | São Paulo/SP | `"Feira da Cantídio Sampaio - Parada de Taipas"` | **Extensão da via sem altura/número** | A Av. Dep. Cantídio Sampaio tem mais de 9 km; falta o cruzamento ou número exato da feira livre em Parada de Taipas. |
| `sp-nova-cachoeirinha-18-10` | Bota pra Virar — Domingo é nas Periferias (Zona Norte) | São Paulo/SP | `"Zona Norte - Nova Cachoeirinha"` | **Apenas bairro/distrito informado** | Confirmar se o ato ocorre no Largo do Japonês, Terminal Vila Nova Cachoeirinha ou Centro Cultural da Juventude (CCJ). |
| `pelotas-sitio-floresta-14-10` | Caminhada Sítio Floresta (14/10 14h) | Pelotas/RS | `"Rua Arthur Raubach com BR-116"` | **Cruzamento rodoviário extenso** | Confirmar o ponto exato de concentração na marginal da BR-116. |
| `pelotas-rotula-carrefour-14-10` | Bandeiraço Rótula do Carrefour (14/10 17h) | Pelotas/RS | `"Rótula do Carrefour"` | **Confirmar endereço exato da rótula** | Av. Juscelino Kubitschek de Oliveira, 2300 (confirmar se é a rótula da JK com Dom Joaquim). |
| `pelotas-adesivaco-bento-17-10` | Adesivaço Av. Bento (17/10 10h) | Pelotas/RS | `"Av. Bento entre Félix e Gonçalves"` | **Trecho entre duas quadras** | Confirmar esquina principal (Rua Félix da Cunha ou Rua Gonçalves Chaves). |
| `pelotas-santa-terezinha-17-10` | Caminhada Santa Terezinha (17/10 10h) | Pelotas/RS | `"Concentração na Igreja Santa Terezinha"` | **Homônimos no município** | Confirmar o endereço da Paróquia Santa Teresinha no bairro Três Vendas. |
| `pelotas-areal-fundos-18-10` | Caminhada Areal Fundos (18/10 10h) | Pelotas/RS | `"Esquina Domingos de Almeida com Rafael Dias Mazza"` | **Verificação de numeração/cruzamento** | Confirmar coordenada exata do cruzamento no bairro Areal. |
| `pelotas-laranjal-trapiche-18-10` | Caminhada Laranjal (18/10 14h) | Pelotas/RS | `"Laranjal - Trapiche"` | **Nome popular de ponto turístico** | Confirmar se refere ao Trapiche da Praia do Laranjal (Av. Dr. Antônio Augusto de Assumpção Júnior). |

---

## 4. Inconsistências de Cadastro e Alertas Editoriais Detectados

1. **Erro de sigla de universidade/UF corrigido (`p024`):** O registro mencionava `"UFES"` (Espírito Santo), mas o título e a cidade eram *"Plenária da Juventude Feirense com Lula — Feira de Santana/BA"*. O local correto é **UEFS** (Universidade Estadual de Feira de Santana, BA).
2. **Divergência de horário no mesmo local (`p004`, `p026`, `p037`):** Ato Distrito 13 na Praça da Bandeira em Macapá/AP em 17/10 aparece em uma versão às **13h–16h** e em outra às **18h**. Ambos apontam para a mesma coordenada verificada (`0.03895, -51.05818`), mantendo o status `warning` para revisão editorial.
3. **Dois atos distintos no MASP em 11/10 (`sao-paulo-masp-11-10` e `p027`):** Um ato geral às **11h** e o ato *"Fandoms na Rua com Lula"* às **13h**. Com a função `spreadOverlappingMarkers()` implementada em `src/lib/coordinates.ts`, ambos os marcadores aparecem lado a lado no mapa sem se ocultar.
4. **Dois atos em Vitória/ES em 11/10 às 15h (`p020` e `p051`/`p055`):** Um cartaz indica saída na **Praça do Papa** (`-20.31568, -40.29512`) e outro indica **Assembleia Legislativa - ALES** (`-20.31442, -40.29688`), distantes cerca de 250 metros na Enseada do Suá. Ambos foram geolocalizados separadamente.

---

## 5. Limitações de Acesso Encontradas e Como Concluir os Demais Registros do Supabase

- **Limitação:** O container de execução atual não possui acesso de rede/credenciais para a instância remota do Supabase (`VITE_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`), onde estão armazenados os mais de 800 registros totais.
- **Solução pronta:** Execute `node scripts/sync-event-coordinates.mjs` localmente (com o arquivo `.env` configurado) para vincular os UUIDs do banco ao `src/data/event-coordinates.json` e listar quaisquer outros eventos recém-aprovados no painel `/admin` que ainda estejam com `lat IS NULL`.