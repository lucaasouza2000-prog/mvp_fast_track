# Evidências de validação

## Verificações automatizadas

- Instalação limpa com `npm ci`, com manifests e lockfile preservados. As atualizações de sessão, mapa e interface não adicionam dependências.
- TypeScript de web, aplicativo e regras compartilhadas.
- **115 testes Vitest**: regras fiscais, fila, demonstração, diagnóstico, primeiro gestor, escopo dos motoristas, CEP, roteamento, previsão de chegada e autorização do endpoint, 20 verificações de sessão móvel, oito de transações locais, nove de GPS automático e seis do desenho do histórico. A sessão cobre dados ilegíveis, recuperação restrita à autenticação, UTF-8, limites, gravação interrompida, indisponibilidade persistente, concorrência e reabertura com o SDK Supabase real. Os testes de transação exercitam os métodos reais do armazenamento e rollback com SQLite, modelando a exigência de chave por conexão do SQLCipher. Reproduziram o erro 26 antes da correção e verificam preservação da fila, UUIDs e horários. O binding Android não é executado nesses testes.
- Ensaio separado com **SQLCipher 4.12.0 community** (`sqlcipher3-binary 0.6.0`, ferramenta temporária): cinco verificações com o SQL de inicialização da implementação. Uma conexão sem chave reproduziu o erro; a conexão configurada confirmou a transação, preservou o perfil e a fila, reverteu uma gravação incompleta, manteve o cabeçalho criptografado e reabriu o arquivo com a chave original. Esse ensaio em Linux não executa o binding Expo/Android.
- **37 verificações PostgreSQL/PGlite**, executadas na atualização anterior: migration real, RLS, isolamento entre empresas, UUIDs idempotentes, GPS no intervalo ativo e conclusão parcial/total.
- Build Next.js com e sem configuração pública, incluindo o endpoint autenticado de trajeto e o worker MapLibre servido na mesma origem.
- **14 testes Chromium/Playwright**: oito para interfaces, demonstração, configuração e abertura do mapa após check-in; seis para catálogos, CEP, trajeto, previsão, recência e recuperação do mapa. Os testes verificam que um ponto histórico distante não afasta a câmera, a atualização não recria o canvas e o enquadramento manual é preservado. Exercitam falha de blocos e recarregamento com o worker real MapLibre; as imagens de mapa e respostas externas são controladas nos testes. As ações da demonstração não acessam o Supabase. Isso não comprova conectividade com serviços hospedados.
- O check-in/check-out da demonstração foi exercitado com navegador offline; isso não valida a fila SQLCipher do aplicativo nativo.
- Bundle JavaScript Android Expo SDK 58 da versão `0.1.3 (4)`, com fontes Inter, nova marca, sequência de paradas e navegação; a exportação não equivale a compilar um APK ou executar um Keystore nativo.
- Introspecção nativa anterior: SQLCipher ativado, backup Android desativado, permissões de GPS/background/foreground service/notificação e bloqueio de áudio/armazenamento externo.
- Formatação e ausência de segredos nos arquivos versionados. O perfil EAS `preview` contém somente URLs públicas e chave publicável Supabase; nunca a chave administrativa.

Nesta correção, foram repetidos os dois testes de mapa (atualização e recuperação), o build web, TypeScript e a exportação Android. As outras 12 verificações de navegador pertencem à validação da interface anterior. Os testes novos de GPS exercitam a implementação com módulos nativos simulados: captura/envio automáticos, veículo parado, deduplicação, rede indisponível, retomada, pausa durante captura, outra conta e permissões. Não validam o intervalo real de execução do Android.

## Evidências recebidas durante a configuração

O usuário mostrou o diagnóstico hospedado com configuração pública, Auth, cadastro público desativado, 12 tabelas, acesso administrativo e presença de gestor verificados. Confirmou o login de gestor e, após a atualização de motoristas, que a lista passou a funcionar. Também confirmou o login do motorista no navegador, check-in, check-out de uma entrega e conclusão da rota ao finalizar as demais. Esses resultados são relatos do usuário no site publicado; o agente não inspecionou os registros do Supabase hospedado nem confirmou isoladamente cada busca postal.

O usuário instalou Node.js 24 no Windows, instalou dependências, entrou no Expo e mostrou a compilação EAS bem-sucedida do APK `0.1.0 (1)`, SDK 58. Build: `2684d727-bdcc-4533-a414-6d1df83eaf3a`, projeto `lucas_souza_gm/mvpfasttrack`. Também mostrou o APK instalado no BlueStacks P64, onde a tentativa de login falhou ao descriptografar a sessão em `ExpoSecureStore`. Depois instalou o mesmo APK no emulador oficial Pixel 6/Android 15 e mostrou login bem-sucedido e perfil do motorista. A sincronização falhou com `file is not a database`.

A inspeção do Expo SDK 58 confirmou que `withExclusiveTransactionAsync` abre outra conexão sem reaplicar a chave SQLCipher. A versão `0.1.1 (2)` trata a recuperação de sessão, verifica a releitura das gravações seguras e configura cada conexão de transação com a chave do banco existente. O usuário compilou e instalou o APK `0.1.1 (2)`, build `44013497-f08f-4418-8643-913270601ab7`, no Pixel 6 oficial. As capturas mostram sincronização de rotas, check-in de `teste-app-02`, entrega em transporte, rota em andamento, GPS ativo e zero registros pendentes. O painel recebeu coordenadas simuladas em Londrina. Após definir outra posição no emulador, o usuário confirmou atualização do horário e indicador de registro recente. O usuário possui iPhone e não dispõe de Android físico nesta sessão.

## Ainda não comprovado

- Teste automatizado completo de Auth, PostgREST e Realtime contra o projeto hospedado e execução da migration por este agente. O ambiente permanece sem credenciais administrativas injetadas e sem liberação de rede para o domínio Supabase. O diagnóstico `/configuracao` consulta a configuração da Vercel, que é diferente desta máquina.
- Testes autenticados de isolamento entre usuários no serviço hospedado e leitura de notas pela câmera em aparelhos.
- Compilação EAS e execução nativa da versão final `0.1.3 (4)` com a nova interface, marca, navegação e previsão. O bundle JavaScript Android dessa versão foi exportado; não equivale ao APK. A sessão Expo está no computador Windows do usuário, sem credenciais equivalentes neste ambiente. A nova configuração de GPS automático precisa ser validada no APK atualizado.
- Ensaio completo da fila nativa com perda/retorno de conexão. A sincronização online e o envio de posições já foram observados no emulador com `0.1.1 (2)`.
- Disponibilidade real dos serviços públicos de roteamento a partir da Vercel. Os testes locais exercitam respostas e falhas controladas; a rede deste ambiente não permite consultar esses domínios.
- GPS em Android físico com tela bloqueada, permissões, force-stop, bateria, persistência e sincronização offline. Localização simulada do emulador deve ser identificada como teste.
- Verificação direta dos deploys Vercel por este agente: o proxy restringe o acesso à Vercel. Push concluído, build local e deploy publicado são evidências distintas.
- iOS: o APK não instala no iPhone; o rastreamento nativo iOS ainda não foi validado e permanece desabilitado.

A apresentação em `/demonstracao` usa dados explicitamente fictícios e armazenamento local do navegador. Não constitui homologação operacional. Use `OPERACAO.md`, `/configuracao` e `ACEITACAO.md` para os testes reais.

## Ambiente reutilizável

`install_script` e `start_skill` foram salvos no rascunho do ambiente; a gravação foi confirmada pelo serviço, mas exige publicação pelo produto. Isso não configura variáveis da Vercel ou Expo, não aplica migrations e não fornece credenciais. Nenhuma chave administrativa ou senha foi incorporada ao código.
