# Geocodificação automática de eventos

A geocodificação recorrente do Radar Mobilizações usa uma fila privada no Supabase e o gatilho agendado do Cloudflare Worker.

## Funcionamento

- Eventos publicados sem latitude/longitude e com um local específico entram na fila automaticamente.
- A fila também é preenchida na instalação para eventos publicados que já estão sem coordenadas.
- A cada minuto, o Worker processa no máximo dois eventos. Isso reduz a pressão sobre o Photon/OpenStreetMap.
- O fluxo usa a rotina comum de geografia do Worker, com consultas alternativas e verificação de município/UF.
- Só grava latitude/longitude quando a rotina retorna `verified_place`, a cidade e a UF coincidem com o cadastro e as coordenadas estão dentro dos limites geográficos do Brasil.
- As coordenadas só são gravadas se os dois campos continuam nulos no momento da gravação. Nunca substitui um ponto já existente.
- Falhas transitórias recebem nova tentativa com espera progressiva. Depois de seis tentativas, o evento fica para revisão. Resultados ambíguos ou locais vagos não são gravados automaticamente.
- Alterar cidade, UF, local ou endereço de um evento sem coordenadas o coloca novamente na fila.

## Proteção da fila

A tabela de fila e o hash do token ficam no schema privado do banco, fora do acesso direto pelo cliente. As funções RPC exigem um token aleatório; a versão em texto fica somente como secret do Cloudflare Worker, sob o binding `GEOCODING_WORKER_TOKEN`. Não armazene esse token no Git, em variáveis públicas do Vite ou nos campos de observação dos eventos.

O Worker usa a chave publicável do Supabase apenas para chamar as funções RPC protegidas pelo token. Não precisa expor a chave `service_role`.

## Revisão

A rotina automática não substitui a revisão editorial: eventos sem local específico, com mais de uma opção plausível ou com divergência geográfica continuam sem coordenadas até que haja informação suficiente.
