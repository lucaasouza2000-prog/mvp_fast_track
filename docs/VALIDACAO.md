# Evidências de validação

## Executado localmente

- Instalação limpa com `npm ci`; os manifests e o lockfile preservam as dependências verificadas. As alterações desta atualização não adicionam dependências.
- TypeScript de web, aplicativo e regras compartilhadas.
- **51 testes Vitest**: documentos fiscais, fila, transições do exemplo, diagnóstico sem vazamento de chaves e vinculação administrativa do primeiro gestor. O teste SQL usa PostgreSQL/PGlite com a migration real, verifica repetição sem duplicidade, bloqueio de usuários comuns e proteção de literais e delimitadores SQL.
- **37 verificações PostgreSQL/PGlite** de migration, RLS, isolamento entre empresas, UUIDs idempotentes, GPS no intervalo ativo e conclusão parcial/total.
- Build de produção Next.js com configuração pública e também sem credenciais, para validar o primeiro deploy e a apresentação.
- **11 testes Chromium/Playwright**: interfaces vazias, apresentação, cadastros fictícios, associação de motorista, documento incorreto, check-in/check-out, recarga com preservação local, reinicialização, detalhes com posições simuladas e gerador de SQL. As ações da apresentação foram verificadas sem chamadas ao Supabase ou ao endpoint de cadastro real de motoristas. Quatro testes adicionais usam sessão e APIs simuladas para a gestão: motorista disponível apesar de falha em veículos, atualização sem recriar conta, retorno do cadastro para a rota e confirmação de endereço por CEP sem campos numéricos de coordenadas. Quatro testes adicionais exercitam a gestão com sessão e APIs simuladas: motorista disponível apesar de falha em outra consulta, recuperação sem recriar conta, atualização depois do cadastro e endereço por CEP sem campos de coordenadas.
- O check-in/check-out da apresentação foi exercitado com o navegador offline; esse teste valida apenas a simulação local, não a fila SQLCipher do APK.
- Bundle JavaScript Android Expo SDK 58 com fontes Inter, validado na implementação inicial. Nenhum código nativo do aplicativo foi alterado nesta atualização.
- Introspecção nativa anterior: SQLCipher ativado, backup Android desativado, permissões GPS/background/foreground service/notificação e bloqueio de permissões de áudio/armazenamento externo.
- Inicialização local das interfaces e respostas HTTP 200; formatação, whitespace e verificação de ausência de chaves secretas nos arquivos versionados.

## Evidências recebidas durante a configuração

O usuário mostrou a página hospedada com verificações positivas para configuração pública, Auth, cadastro público desativado, 12 tabelas, acesso administrativo e presença de gestor. Também confirmou que o login de gestor funcionou. Em seguida relatou que o cadastro de motorista mostrou sucesso, mas a lista ficou vazia. O registro específico no Supabase hospedado não foi inspecionado a partir desta máquina. A atualização adiciona verificação do perfil, recuperação restrita à empresa e carregamento independente; a confirmação desse caso no site requer o novo deploy e o uso de **Atualizar motoristas**.

Os novos testes cobrem o escopo das APIs, a recusa de mudança de papel/empresa, a confirmação das gravações, consultas por CEP, pontos ausentes sem coordenadas inventadas e a alternativa ViaCEP. As respostas externas e as sessões dos testes de catálogo são simuladas; não são prova de leitura de um CEP real nem de acesso ao projeto hospedado.

## Evidências da configuração guiada

O usuário mostrou o diagnóstico hospedado com configuração pública, Auth, cadastro público desativado, tabelas, acesso administrativo e presença de gestor verificados; também confirmou que o login funcionou. Depois informou que o motorista recebeu aviso de cadastro salvo, mas não apareceu na lista. A atualização verifica o perfil e o vínculo antes de responder com sucesso, separa o carregamento dos catálogos e oferece atualização restrita à empresa. O registro específico desse motorista no projeto hospedado não foi inspecionado por este agente; a confirmação depende do novo deploy e de usar Atualizar motoristas.

Os testes novos também cobrem escopo de empresa, recusa de mudanças de papel, preservação de contas existentes, busca postal, alternativa ViaCEP e ausência de ponto sem coordenadas inventadas. A busca de um CEP real pelos serviços externos e a recuperação do registro do usuário ainda precisam ser confirmadas no site publicado. As respostas de serviços e as sessões dos testes de catálogo são simuladas.

## Ainda não comprovado

- Teste automatizado completo de Auth, PostgREST e Realtime contra o projeto hospedado e execução direta da migration por este agente. Esta máquina permanece sem chave administrativa injetada e sem liberação de rede aplicada para o domínio Supabase; o proxy retornou 403. O diagnóstico `/configuracao` consulta a configuração da própria Vercel, que pode ser diferente.
- Criação de contas de motoristas pelo endpoint real, leitura de notas pela câmera em aparelhos e testes autenticados de isolamento entre usuários no serviço hospedado.
- Build nativo EAS/APK, assinatura, instalação e validação física de câmera, SQLite, permissões, GPS com tela bloqueada, perda/retorno de internet, force-stop e bateria.
- Verificação direta do resultado dos novos deploys Vercel a partir desta máquina: o acesso à Vercel também depende de liberação de rede. O código é enviado ao branch `main`; não confundir push concluído, build local e deploy publicado.
- iOS.

A apresentação em `/demonstracao` usa dados explicitamente fictícios e armazenamento local do navegador. Não constitui homologação operacional. Use `OPERACAO.md`, a página `/configuracao` e o roteiro de `ACEITACAO.md` para concluir os pré-requisitos e os testes reais.

## Ambiente reutilizável

`install_script` e `start_skill` foram salvos no rascunho do ambiente. A gravação foi confirmada pelo serviço de configuração e exige publicação pelo produto. Isso não configura automaticamente as variáveis da Vercel, não aplica migrations e não fornece credenciais. Nenhuma chave administrativa ou senha foi incorporada ao código.
