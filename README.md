# FastTrack

MVP de rastreamento de entregas da **Fast Ariam Equipamentos + Nostra Via**: gestão web Next.js, aplicativo Android Expo, backend Supabase e regras TypeScript compartilhadas. Interface em português, sem dados fictícios no fluxo normal.

## Começar

Requisitos: Node.js 22.13+ (24 recomendado), npm e um projeto Supabase. Use o checkout existente; cada tarefa na nuvem já é isolada e não requer Git worktree.

```bash
npm ci
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

Preencha a URL e a chave pública **do mesmo projeto** nos dois aplicativos. Configure `SUPABASE_SERVICE_ROLE_KEY` somente em `apps/web/.env.local`/servidor Vercel para cadastro de contas de motorista. Nunca use essa chave em uma variável `NEXT_PUBLIC_*` ou `EXPO_PUBLIC_*`. Nenhum segredo deve ser commitado.

### Banco e primeiro acesso

1. Aplique `supabase/migrations/202611050001_fasttrack.sql` no SQL Editor do Supabase, ou `supabase link --project-ref SEU_REF` e `supabase db push` com a CLI oficial autenticada.
2. Desative cadastro público no Supabase Auth. Configure a URL do site e URLs de redirecionamento autorizadas para seu domínio. Não permita que clientes controlem `app_metadata`.
3. Copie `.env.example` para `.env` na raiz e preencha os campos administrativos (`TENANT_NAME`, `GESTOR_*`, URL e service role). Use senha com pelo menos 12 caracteres.
4. Execute **uma vez** `node --env-file=.env scripts/bootstrap.mjs`. O script cria a empresa e o primeiro gestor. Não é um seed automático nem é idempotente: uma repetição com outro e-mail cria outra empresa.
5. Execute `npm run dev`, acesse `/login`, entre com o gestor e abra **Nova rota**. Cadastre primeiro motorista, veículo e cliente; crie a rota com uma ou mais entregas. Informe endereços e coordenadas reais verificadas, código da carga e chave/código fiscal.

O motorista usa as credenciais cadastradas em `/motorista` ou no app Android. A câmera web requer HTTPS ou localhost e permissão. Interface responsiva web permite consultas e check-in/check-out online; GPS em segundo plano e fila offline pertencem ao APK.

Sem as variáveis do backend, `/gestao` exibe o estado de configuração e contadores vazios. Isso não demonstra integração real. Não há senha ou usuário padrão embutido.

## Desenvolvimento e validação

```bash
npm run dev                 # Next.js
npm run mobile              # Expo development client
npm run typecheck           # web + mobile + core
npm test                    # regras fiscais e sincronização
npm run test:db             # PostgreSQL WASM, migration real e RLS
npm run build               # produção web
npm run start -w @fasttrack/web  # executar build web
npm run test:web            # servidor acima ativo, sem variáveis Supabase
npm run format:check
```

O Playwright usa Chromium em `/usr/bin/chromium`; em outra máquina configure `CHROMIUM_PATH` com o caminho do executável instalado. Os testes web sem backend validam estados de configuração, busca vazia e layout móvel. Não substituem o fluxo autenticado. Para validar Auth/REST/RPC no Supabase, use um **projeto separado de homologação**, preencha os campos de teste no `.env`, marque `ALLOW_TEST_DATA=1` e execute `node --env-file=.env scripts/acceptance.mjs`. O script cria dados explicitamente fictícios e preserva os registros para inspeção; use e-mail de motorista ainda não cadastrado. Não execute em produção. Esse script não envia posições GPS fictícias.

A migration exige um banco Supabase novo. Tabelas são protegidas por empresa, papel e rota, com escrita de eventos/localizações apenas por RPC. Histórico registra captura e recebimento separadamente. Cada evento só pode alterar a entrega uma vez; repetir o mesmo UUID e conteúdo é seguro. Uma entrega concluída não encerra a rota até todas serem concluídas.

## Deploy web na Vercel

Projeto: `lucas-c223/mvp_fast_track`. Site informado: `https://mvpfasttrack.vercel.app`. Após um deploy bem-sucedido, `/interfaces` permite conhecer as telas de gestão, motorista e login sem autenticação, sem acessar o Supabase e sem exibir dados operacionais. A operação real continua protegida por Auth e RLS. O login também oferece o link **Visualizar as interfaces**.

No painel Vercel, confira **Settings → Build and Deployment → Root Directory: `apps/web`** e o framework **Next.js**. O arquivo `apps/web/vercel.json` instala os workspaces a partir da raiz e compila o aplicativo web. O branch de produção deve ser `main`, conectado a `lucaasouza2000-prog/mvp_fast_track`. As variáveis preenchidas no ambiente Codex não são transferidas automaticamente à Vercel: configure as variáveis públicas também no projeto Vercel quando for habilitar login real. A prévia `/interfaces` funciona sem essas variáveis.

Importe este monorepositório no projeto Vercel, escolha **Next.js** e **Root Directory: `apps/web`**, habilitando acesso aos arquivos fora da pasta raiz para o pacote compartilhado. Instalação na raiz do monorepositório: `npm ci`; build: `npm run build` no workspace web (ou padrão Next.js na raiz escolhida). Configure as variáveis de `apps/web/.env.example` no projeto, incluindo a chave administrativa apenas como variável de servidor. Variáveis `NEXT_PUBLIC_*` são embutidas no build; faça novo deploy quando alteradas. Configure também as URLs autorizadas no Supabase Auth. Consulte [arquitetura e limites](docs/ARQUITETURA.md).

## APK e testes físicos

Veja [Android, GPS e offline](docs/ANDROID.md) para EAS, instalação e permissões, e [aceitação](docs/ACEITACAO.md) para o cenário com três entregas e os critérios que exigem aparelho real. O bundle JavaScript não comprova que a localização funciona com tela bloqueada.

## Estrutura

- `apps/web`: login, `/gestao`, `/motorista`, API administrativa protegida.
- `apps/mobile`: câmera, GPS nativo, SQLite criptografado e sincronização.
- `packages/core`: tipos, validações, chave NF-e e regras da fila.
- `supabase`: migration, constraints, índices, RLS e RPCs.
- `docs`: fases implementadas, operação e pendências verificáveis.

As três referências visuais citadas no escopo não foram anexadas. A interface segue a identidade branca/azul, Inter e Lucide solicitada.
