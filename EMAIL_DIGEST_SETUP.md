# Alertas diários por cidade — configuração

O recurso é opt-in e separado da criação da conta. O consentimento só fica ativo quando a pessoa marca a caixa e salva as preferências; o job só envia para contas com e-mail confirmado. Nenhum e-mail sai enquanto a infraestrutura abaixo não estiver configurada.

## Remetente sem expor o e-mail pessoal

Use uma conta de envio do projeto e um domínio próprio verificado, por exemplo: Agenda de Mobilizações <avisos@seudominio.org>. O endereço pessoal de login não deve ser colocado em EMAIL_FROM, Reply-To nem no conteúdo público. O provedor ainda conhecerá o dono da conta e o domínio usado. Não use um endereço falso: o serviço escolhido exige autenticação do domínio e, para envios recorrentes em massa, endereço postal e identificação do publicador. Se quiser evitar publicar o endereço residencial, obtenha um endereço postal legítimo para o projeto antes de ativar os envios.

O domínio precisa ter SPF/DKIM configurados. O código usa Resend API para os resumos recorrentes e inclui links de cancelamento e cabeçalhos List-Unsubscribe. A política do provedor exige opt-in explícito, identificação do publicador e um opt-out fácil.

## 1. Configurar segredos (nunca commitar valores)

No Supabase Dashboard → Edge Functions → Secrets, configure:
- RESEND_API_KEY: API key do projeto Resend.
- EMAIL_FROM: remetente autenticado, incluindo nome, como Agenda de Mobilizações <avisos@seudominio.org>.
- EMAIL_POSTAL_ADDRESS: endereço postal legítimo a exibir no rodapé dos e-mails.
- PUBLIC_SITE_URL: URL canônica HTTPS da Agenda, sem barra no final.
- DIGEST_CRON_SECRET: valor aleatório longo (mínimo 32 caracteres); usado apenas pelo job.
- EMAIL_UNSUBSCRIBE_SECRET: outro valor aleatório longo (mínimo 32 caracteres); usado para assinar links de cancelamento.

SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são lidos pelo código no ambiente da Edge Function. Nunca exponha a service role key no navegador, no Vite ou no GitHub.

## 2. Publicar as funções

Depois de aplicar a migration, publique:
- send-city-email-digest com verificação JWT desativada somente porque valida DIGEST_CRON_SECRET por conta própria.
- unsubscribe-city-email-digest com verificação JWT desativada somente porque valida um token HMAC assinado, sem aceitar um user_id arbitrário.

Não exponha nenhum endpoint que envie e-mails por chamada pública sem o segredo do cron.

## 3. Agendar para 08h de Brasília

Supabase Cron usa pg_cron; a documentação recomenda chamar Edge Functions com pg_net e guardar a URL e o segredo no Vault. Depois de habilitar pg_cron, pg_net e Vault para o projeto, guarde estes dois valores no Vault:
- nome city_digest_url: https://SEU-PROJETO.supabase.co/functions/v1/send-city-email-digest
- nome city_digest_cron_secret: o mesmo valor do DIGEST_CRON_SECRET acima

Então crie o job (11:00 UTC = 08:00 no horário de Brasília):

    select cron.schedule(
      'daily-city-email-digest',
      '0 11 * * *',
      $$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'city_digest_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'city_digest_cron_secret')
        ),
        body := jsonb_build_object('trigger', 'supabase-cron')
      );
      $$
    );

Antes de permitir inscrições públicas, faça um teste com uma caixa postal controlada, confirme o domínio e revise o rodapé. O envio contém eventos públicos de hoje e dos próximos sete dias na cidade/UF cadastrada; se não houver eventos, nenhuma mensagem é enviada naquele dia.

## 4. Ativar o botão no site

Mantenha VITE_EMAIL_DIGEST_ENABLED=false enquanto as funções, o domínio, os segredos e o cron não estiverem testados. Depois da validação:
- Vercel: configure VITE_EMAIL_DIGEST_ENABLED=true no ambiente de produção e faça novo deploy.
- Cloudflare via GitHub Actions: defina a variável de repositório Actions VITE_EMAIL_DIGEST_ENABLED=true; o workflow injeta esse valor só durante o build.

Enquanto a flag está desligada, a página inicial mostra o CTA como “Alertas por cidade — em breve” e a página de preferências avisa que o serviço não está ativo; não existe inscrição ativa nem envio. Usuários atuais não são inscritos automaticamente: devem entrar, escolher cidade/UF e marcar o consentimento. Usuários novos só serão inscritos se marcarem a caixa e salvarem as preferências.

## 5. Migração de banco

A migration 20261014024000_add_city_email_digest.sql cria a tabela protegida com RLS e a função que permite ao próprio usuário salvar preferências. Depois do merge, confira a lista de migrations e rode os advisors de segurança do Supabase.
