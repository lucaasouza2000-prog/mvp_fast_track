# Evidências de validação

## Executado localmente

- Instalação limpa com `npm ci`; os manifests e o lockfile preservam as dependências verificadas. As alterações desta atualização não adicionam dependências.
- TypeScript de web, aplicativo e regras compartilhadas.
- **26 testes Vitest**: documentos fiscais, fila, transições do exemplo, diagnóstico sem vazamento de chaves e vinculação administrativa do primeiro gestor. O teste SQL usa PostgreSQL/PGlite com a migration real, verifica repetição sem duplicidade, bloqueio de usuários comuns e proteção de literais e delimitadores SQL.
- **37 verificações PostgreSQL/PGlite** de migration, RLS, isolamento entre empresas, UUIDs idempotentes, GPS no intervalo ativo e conclusão parcial/total.
- Build de produção Next.js com configuração pública e também sem credenciais, para validar o primeiro deploy e a apresentação.
- **7 testes Chromium/Playwright**: interfaces vazias, apresentação, cadastros fictícios, associação de motorista, documento incorreto, check-in/check-out, recarga com preservação local, reinicialização, detalhes com posições simuladas e gerador de SQL. As ações da apresentação foram verificadas sem chamadas ao Supabase ou ao endpoint de cadastro real de motoristas.
- O check-in/check-out da apresentação foi exercitado com o navegador offline; esse teste valida apenas a simulação local, não a fila SQLCipher do APK.
- Bundle JavaScript Android Expo SDK 58 com fontes Inter, validado na implementação inicial. Nenhum código nativo do aplicativo foi alterado nesta atualização.
- Introspecção nativa anterior: SQLCipher ativado, backup Android desativado, permissões GPS/background/foreground service/notificação e bloqueio de permissões de áudio/armazenamento externo.
- Inicialização local das interfaces e respostas HTTP 200; formatação, whitespace e verificação de ausência de chaves secretas nos arquivos versionados.

## Ainda não comprovado

- Supabase Auth, PostgREST, Realtime, aplicação de migrations e login de um gestor no projeto hospedado. Esta máquina permanece sem chave administrativa injetada e sem liberação de rede aplicada para o domínio Supabase; o proxy retornou 403. O diagnóstico `/configuracao` consulta a configuração da própria Vercel, que pode ser diferente.
- Criação de contas de motoristas pelo endpoint real, leitura de notas pela câmera em aparelhos e testes autenticados de isolamento entre usuários no serviço hospedado.
- Build nativo EAS/APK, assinatura, instalação e validação física de câmera, SQLite, permissões, GPS com tela bloqueada, perda/retorno de internet, force-stop e bateria.
- Verificação direta do resultado dos novos deploys Vercel a partir desta máquina: o acesso à Vercel também depende de liberação de rede. O código é enviado ao branch `main`; não confundir push concluído, build local e deploy publicado.
- iOS.

A apresentação em `/demonstracao` usa dados explicitamente fictícios e armazenamento local do navegador. Não constitui homologação operacional. Use `OPERACAO.md`, a página `/configuracao` e o roteiro de `ACEITACAO.md` para concluir os pré-requisitos e os testes reais.

## Ambiente reutilizável

`install_script` e `start_skill` foram salvos no rascunho do ambiente. A gravação foi confirmada pelo serviço de configuração e exige publicação pelo produto. Isso não configura automaticamente as variáveis da Vercel, não aplica migrations e não fornece credenciais. Nenhuma chave administrativa ou senha foi incorporada ao código.
