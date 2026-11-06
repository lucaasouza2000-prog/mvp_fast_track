# Evidências de validação

## Verificações automatizadas

- Instalação limpa com `npm ci`, com manifests e lockfile preservados. A atualização de recuperação da sessão não adiciona dependências.
- TypeScript de web, aplicativo e regras compartilhadas.
- **71 testes Vitest**: regras fiscais, fila, demonstração, diagnóstico, primeiro gestor, escopo dos motoristas, CEP e 20 verificações de armazenamento da sessão móvel. Estas últimas cobrem dados ilegíveis, recuperação restrita à autenticação, UTF-8, limites de fragmentação, gravação interrompida, indisponibilidade persistente, concorrência e reabertura com o SDK Supabase real. O armazenamento nativo é simulado nesses testes.
- **37 verificações PostgreSQL/PGlite**, executadas na atualização anterior: migration real, RLS, isolamento entre empresas, UUIDs idempotentes, GPS no intervalo ativo e conclusão parcial/total.
- Build Next.js com e sem configuração pública, executado na atualização web anterior.
- **11 testes Chromium/Playwright**, executados na atualização web anterior: sete para interfaces, demonstração e configuração; quatro para catálogos e endereço por CEP com sessão e APIs simuladas. As ações da demonstração foram verificadas sem acessar o Supabase. Os testes de catálogo não comprovam conectividade com serviços hospedados.
- O check-in/check-out da demonstração foi exercitado com navegador offline; isso não valida a fila SQLCipher do aplicativo nativo.
- Bundle JavaScript Android Expo SDK 58 com fontes Inter; a exportação não equivale a compilar um APK ou executar um Keystore nativo.
- Introspecção nativa anterior: SQLCipher ativado, backup Android desativado, permissões de GPS/background/foreground service/notificação e bloqueio de áudio/armazenamento externo.
- Formatação e ausência de segredos nos arquivos versionados. O perfil EAS `preview` contém somente URL e chave publicável Supabase; nunca a chave administrativa.

## Evidências recebidas durante a configuração

O usuário mostrou o diagnóstico hospedado com configuração pública, Auth, cadastro público desativado, 12 tabelas, acesso administrativo e presença de gestor verificados. Confirmou o login de gestor e, após a atualização de motoristas, que a lista passou a funcionar. Também confirmou o login do motorista no navegador, check-in, check-out de uma entrega e conclusão da rota ao finalizar as demais. Esses resultados são relatos do usuário no site publicado; o agente não inspecionou os registros do Supabase hospedado nem confirmou isoladamente cada busca postal.

O usuário instalou Node.js 24 no Windows, instalou dependências, entrou no Expo e mostrou a compilação EAS bem-sucedida do APK `0.1.0 (1)`, SDK 58. Build: `2684d727-bdcc-4533-a414-6d1df83eaf3a`, projeto `lucas_souza_gm/mvpfasttrack`. Também mostrou o APK instalado e a tela de login aberta no BlueStacks P64. A tentativa de login nativo falhou ao descriptografar o contador da sessão em `ExpoSecureStore`; não há confirmação de login nativo bem-sucedido.

A versão `0.1.1 (2)` trata a recuperação de sessão e verifica a releitura das gravações seguras. Foi preparada no repositório; ainda exige um novo APK e confirmação no emulador. O usuário informou que conseguiu baixar o Android Studio. O teste no emulador oficial está pendente. O usuário possui iPhone e não dispõe de Android físico nesta sessão.

## Ainda não comprovado

- Teste automatizado completo de Auth, PostgREST e Realtime contra o projeto hospedado e execução da migration por este agente. O ambiente permanece sem credenciais administrativas injetadas e sem liberação de rede para o domínio Supabase. O diagnóstico `/configuracao` consulta a configuração da Vercel, que é diferente desta máquina.
- Testes autenticados de isolamento entre usuários no serviço hospedado e leitura de notas pela câmera em aparelhos.
- Novo APK `0.1.1 (2)`, login nativo, funcionamento do SQLCipher no emulador e sincronização após perda/retorno de conexão. Os testes automatizados da recuperação não substituem essa confirmação.
- GPS em Android físico com tela bloqueada, permissões, force-stop, bateria, persistência e sincronização offline. Localização simulada do emulador deve ser identificada como teste.
- Verificação direta dos deploys Vercel por este agente: o proxy restringe o acesso à Vercel. Push concluído, build local e deploy publicado são evidências distintas.
- iOS: o APK não instala no iPhone; o rastreamento nativo iOS ainda não foi validado e permanece desabilitado.

A apresentação em `/demonstracao` usa dados explicitamente fictícios e armazenamento local do navegador. Não constitui homologação operacional. Use `OPERACAO.md`, `/configuracao` e `ACEITACAO.md` para os testes reais.

## Ambiente reutilizável

`install_script` e `start_skill` foram salvos no rascunho do ambiente; a gravação foi confirmada pelo serviço, mas exige publicação pelo produto. Isso não configura variáveis da Vercel ou Expo, não aplica migrations e não fornece credenciais. Nenhuma chave administrativa ou senha foi incorporada ao código.
