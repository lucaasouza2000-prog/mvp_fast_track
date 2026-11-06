# Apresentar e começar a operar o FastTrack

## Apresentação com dados fictícios

Depois de um deploy bem-sucedido, abra `https://mvpfasttrack.vercel.app/demonstracao`.

O exemplo começa com dois motoristas, dois veículos, seis clientes, três rotas e seis entregas em situações diferentes. Use Gestão para pesquisar cliente, carga, nota ou rota e abrir os detalhes. Use Motorista para selecionar uma conta fictícia, abrir uma rota e confirmar as cargas. Os códigos fiscais aparecem no painel “Códigos fiscais para testar check-in e check-out” e no formulário de confirmação.

Roteiro rápido: abra a rota `DEMO-PR-001` como motorista Rafael, faça check-in da carga `DEMO-001` com `NF-DEMO-001`, depois faça check-out com o mesmo código. Volte à Gestão: apenas essa entrega estará concluída. As outras duas continuam pendentes. Novos clientes, motoristas, veículos e rotas podem ser cadastrados no exemplo.

As alterações são guardadas no `localStorage` deste navegador, separadas das sessões e do banco de produção. Não há conta real, e-mail enviado ou chamada ao Supabase nesse modo. A simulação de posição GPS acrescenta pontos fictícios à rota ativa; os detalhes e o mapa identificam essa simulação. Ela não testa geolocalização, rastreamento Android ou a situação fiscal de documentos. Não coloque informações pessoais ou cargas reais na apresentação. **Reiniciar demonstração** restaura o conjunto inicial. Se o armazenamento local estiver bloqueado, as alterações duram apenas a sessão atual.

`/interfaces` mantém a prévia vazia anterior. `/login`, `/gestao` e `/motorista` continuam usando o Supabase para a operação real, sem aproveitar os cadastros fictícios.

## Configuração da operação real

Abra `https://mvpfasttrack.vercel.app/configuracao`. A página consulta a configuração do servidor onde o site está publicado. Ela pode mostrar uma situação diferente da máquina de desenvolvimento no Codex, porque são ambientes separados.

1. Na **Vercel → projeto mvp_fast_track → Settings → Environment Variables**, configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave pública) e `SUPABASE_SERVICE_ROLE_KEY` (Secret API key, apenas no servidor). Faça novo deploy após alterar os valores. A chave administrativa nunca recebe prefixo `NEXT_PUBLIC_` ou `EXPO_PUBLIC_`.
2. No **Supabase → SQL Editor**, execute `supabase/migrations/202611050001_fasttrack.sql` em um banco novo. Não repita a migration sobre tabelas existentes sem verificar o estado. A página de configuração verifica a existência das 12 tabelas; esse diagnóstico não substitui os testes de RLS entre usuários.
3. No **Supabase → Authentication → Sign In / Providers**, desative a opção que permite novos cadastros públicos. O cadastro de motoristas será feito por um gestor via backend.
4. No **Supabase → Authentication → Users → Add user**, crie o primeiro usuário com e-mail confirmado e senha forte. Defina a senha nesse painel, sem compartilhá-la no chat.
5. Na página `/configuracao`, informe o nome e o e-mail desse usuário e gere o SQL de vinculação. Execute o SQL no SQL Editor com o papel `postgres`. Ele cria a empresa e o perfil de gestor, registra auditoria e pode ser repetido para a mesma conta sem duplicar registros. Não promove automaticamente uma conta que já é motorista. Não há RPC pública de promoção de papel.
6. Entre em `/login` usando essa conta. Cadastre motorista, veículo e cliente, e crie uma rota com três entregas de homologação. Faça check-in/check-out pelo motorista e confirme os eventos pelo gestor. Use notas associadas às respectivas cargas; um documento incorreto deve ser rejeitado.

O script `scripts/bootstrap.mjs` continua sendo uma alternativa administrativa para quem já possui variáveis locais seguras. O procedimento pelo painel dispensa disponibilizar a senha do gestor ao Codex e não exige criar outra conta pessoal no Supabase.

## O que a verificação automática prova

O endpoint `/api/prontidao` faz apenas leituras, usa timeout, retorna estados sem chaves, IDs de usuário ou mensagens remotas e conserva o resultado por 30 segundos. Verifica configuração pública, resposta do Supabase Auth, cadastro público desativado, existência das tabelas, leitura administrativa de perfis e presença de pelo menos um gestor. A Secret API key é usada exclusivamente no servidor e nunca é retornada.

Esses sinais não comprovam senha correta, permissão do usuário conectado, recebimento de e-mails, Realtime ou isolamento entre empresas. Execute o fluxo autenticado do roteiro de aceitação antes de operar. Sem a chave administrativa, a criação de contas de motorista não funciona. Sem a migration e os perfis, login e persistência não podem ser considerados prontos.

## GPS Android e offline: validação ainda necessária

Para rastrear uma viagem real com tela bloqueada, gere e instale o APK próprio, configure o mesmo Supabase e execute `ANDROID.md` e `ACEITACAO.md` em um aparelho físico. A implementação inclui serviço nativo, permissões, notificação e fila criptografada, mas não há evidência física nesta sessão de compilação nativa, câmera, GPS com tela bloqueada ou sincronização SQLite após perda de conexão. O cenário offline da apresentação testa apenas a simulação local do navegador.

Antes de liberar uma operação real, confirme acesso de cada papel, cadastro de três entregas, recusa de documento errado, ausência de duplicidade após reenvio, conclusão parcial/total, retomada do painel e testes físicos Android. Defina também a retenção e o tratamento das posições pela empresa.
