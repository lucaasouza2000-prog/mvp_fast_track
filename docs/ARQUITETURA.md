# Arquitetura e fases

O monorepositório contém `apps/web` (Next.js App Router), `apps/mobile` (Expo Android), `packages/core` (TypeScript/Zod, formatos fiscais e fila) e `supabase` (PostgreSQL/RLS/RPC). Web e APK usam a mesma URL e chave pública Supabase. As credenciais administrativas existem apenas no servidor Next.js e em scripts locais.

## Fase 1 — Base funcional

`packages/core`, manifests, `supabase/migrations/202611050001_fasttrack.sql`, `apps/web/lib` e login. Auth real por senha; redirecionamento por perfil lido do banco; políticas de acesso por empresa e rota. Perfis são provisionados pelo trigger de `auth.users` usando **app_metadata administrativo**, nunca `user_metadata`. Clientes não recebem UPDATE/INSERT em perfis. Mesmo chamadas RPC diretas conferem `auth.uid()` e a empresa. A ausência de variáveis abre um estado de configuração, sem contas ou dados simulados.

Configuração externa: projeto Supabase, migration e primeiro gestor pelo bootstrap.

## Fase 2 — Gestão de rotas

`components/admin.tsx` e `/api/motoristas`: cadastro de contas de motorista, clientes, veículos e rotas. A criação de rota é transacional, com paradas ordenadas e múltiplas entregas/documentos. Chaves estrangeiras compostas impedem relações entre empresas. O formulário consulta CEP pelo BrasilAPI, com alternativa ViaCEP, e preenche o endereço. O gestor informa número e complemento, confere ou ajusta o pino no mapa e confirma o local. O ponto fornecido pelo CEP é aproximado; se não houver ponto, a confirmação exige marcação manual. Não existem campos numéricos de latitude/longitude no cadastro. A senha inicial é definida pelo gestor e deve ser entregue por canal seguro. O motorista pode alterá-la pelo fluxo de recuperação de senha configurado no Supabase; este MVP não fornece uma tela de recuperação.

Configuração externa: chave administrativa exclusivamente no servidor para criação de contas. Os cadastros de clientes, veículos e rotas usam a sessão normal e RLS.

## Fase 3 — Motorista web

`app/motorista`, `components/scanner.tsx`: listagem, seleção, câmera ZXing QR/Code 128 e entrada manual. Chave NF-e com módulo 11, extração local de URLs sem visitá-las. Um número curto só é validado no contexto da entrega selecionada. Não há consulta SEFAZ. O servidor verifica o documento e a transição, guarda UUID, captura e recebimento. Check-out exige check-in anterior. Somente o próprio motorista opera as cargas.

Configuração externa: HTTPS e permissão de câmera para testar leitura real. Web exige conexão para confirmar eventos; não faz rastreamento em segundo plano.

## Fase 4 — Android e offline

`apps/mobile/src/{tracking,store,backend}.ts` e `App.tsx`: tarefa registrada no entrypoint; Expo Location/TaskManager; foreground service com notificação; permissões precisa, segundo plano e notificação; SQLCipher por usuário com chave em SecureStore; token dividido em blocos no SecureStore. A fila persiste antes do envio e projeta o estado local na mesma transação. Dados remotos são combinados com eventos pendentes. FIFO preserva check-in antes de check-out, com backoff exponencial e jitter. Remoção somente após RPC bem-sucedida, que é idempotente. Erros permanecem visíveis e não são descartados automaticamente. IDs e horários de captura são mantidos em todas as tentativas.

A ativação inicial/retomada do serviço exige internet e pelo menos um check-in confirmado; depois, captura e operações nas entregas já sincronizadas podem continuar offline. Um motorista só tem uma rota ativa. Todas as entregas devem ser concluídas; não existe encerramento administrativo parcial. A coleta para quando o app observa a conclusão da última entrega, ao pausar ou ao sair. Pausar não conclui a rota no servidor. Android pode interromper tarefas, especialmente em encerramento forçado. Não existe garantia de intervalo exato nem de recuperação após force-stop. Meta: 60 s e deslocamento mínimo de 25 m, ajustáveis no código de tracking.

Configuração externa: development build/APK com SQLCipher, EAS e aparelho físico. Expo Go não serve para validar esse fluxo. Não validado fisicamente.

## Fase 5 — Gestão e mapa

`app/gestao`, `components/{delivery-detail,route-map}.tsx`: busca cliente/nota/carga/rota, filtros, contadores derivados de dados persistidos, modal com motorista/veículo/carga/eventos, MapLibre com pontos e última posição. Realtime e polling de apoio (30 s painel, 20 s detalhe). Recência usa horário de captura, limite de 3 minutos, e nunca é chamada de transmissão contínua. O mapa consulta OSRM para o traçado rodoviário; se falhar, não inventa o trajeto. Não há ETA calculada. Histórico limitado às últimas 1.000 posições da rota; as linhas ligam amostras GPS, sem afirmar que representam todas as vias percorridas.

Configuração externa: acesso a `tile.openstreetmap.org` e ao serviço de roteamento. O serviço público OSRM é apenas um padrão de desenvolvimento: em produção configure serviço com SLA, limites e perfil apropriado ao veículo. O perfil público de automóvel não considera restrições de caminhão. MapLibre permite inclinação; edifícios/terreno 3D não estão disponíveis na camada raster padrão. Não há posições ou tempos fictícios.

## Fase 6 — Validação e entrega

Testes em `packages/core/tests`, `scripts/test-db.mjs`, `tests/web`, instruções de deploy e APK. PGlite executa a migration real com Auth simulado apenas para claims/usuários, roles PostgreSQL e RLS; não substitui Supabase Auth, PostgREST ou Realtime. `scripts/acceptance.mjs` executa Auth/REST/RPC em um projeto de homologação real quando configurado. Não simula GPS nem declara sucesso de aparelho físico.

Limitações: ausência de validação física Android/iOS, de integração Supabase neste ambiente sem credenciais, de geocodificação/ETA/3D, de recuperação de senha na interface e de cancelamento/reconciliação administrativa. Localização é acessível somente ao motorista da rota e gestores da mesma empresa. Antes de produção, a empresa deve definir retenção/exclusão das posições, base legal e acesso operacional, e implementar a política aprovada no banco. Não há expurgo automático nesta versão.

Auditoria de dependências nesta implementação: os alertas altos/críticos foram corrigidos atualizando MapLibre e Expo. Restaram cinco alertas moderados na cadeia de ferramentas Expo (`glob`/`minimatch` e dependentes) na versão atual do SDK. Não foi aplicado override de versão major em ferramentas nativas sem validação de APK. Reavalie `npm audit --omit=dev` antes da distribuição.
