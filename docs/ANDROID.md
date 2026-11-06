# APK Android, permissões e offline

## Gerar o aplicativo

O aplicativo está vinculado ao projeto Expo `lucas_souza_gm/mvpfasttrack`, ID `4ef6f5b5-dce9-4a36-8a1a-761f876d8b86`. A versão preparada é **0.1.4 (5)**, com nome de exibição **FAST TRACK** e o desenho enviado pelo usuário: cabeçalho azul escuro, ações verdes, lista de rotas e detalhe de entregas com nota, peso e check-in/check-out. O pacote e a assinatura permanecem os mesmos para permitir atualização sobre a versão instalada.

Instale dependências na raiz (`npm ci`). O perfil `preview` de `apps/mobile/eas.json` já inclui a URL e a chave **publicável** do mesmo Supabase usado pelo site e `EXPO_PUBLIC_WEB_URL=https://mvpfasttrack.vercel.app` para consultar a previsão. Esses valores são públicos e ficam embutidos no APK; nenhuma chave administrativa faz parte dessa configuração. O ambiente EAS selecionado para esse perfil é `preview`. O perfil `production` usa o ambiente `production` e exige as duas variáveis `EXPO_PUBLIC_SUPABASE_*` configuradas nesse ambiente antes de gerar um AAB. Nunca configure `service_role` no Expo.

Para desenvolvimento local, copie `apps/mobile/.env.example` para `apps/mobile/.env` e preencha a URL e a chave pública. As variáveis da Vercel não são transferidas para Expo automaticamente.

O primeiro APK é iniciado pela CLI com a conta Expo que tem acesso ao projeto:

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

O `projectId` e o proprietário já estão definidos na configuração. No primeiro build Android, aceite gerar uma nova chave de assinatura quando a CLI perguntar, caso o projeto ainda não tenha uma. As credenciais de assinatura ficam gerenciadas pela conta EAS. O usuário gerou com sucesso o primeiro APK `0.1.0 (1)`, build `2684d727-bdcc-4533-a414-6d1df83eaf3a`, e mostrou sua instalação e abertura no BlueStacks. Este agente não iniciou esse build: não há sessão Expo configurada nesta máquina. Para uso local com Android Studio/SDK/JDK compatíveis, `npm run android` cria um development build. `npm run start` inicia o Metro para esse cliente.

No Windows, use PowerShell e Node.js LTS compatível com `engines.node` do projeto. Depois de obter o repositório, entre na pasta raiz, execute `npm.cmd ci` e siga os comandos acima usando `npx.cmd`. O login acontece no navegador ou no terminal, conforme a versão da CLI; não é necessário enviar a senha no chat.

Se baixou o repositório por ZIP, execute a partir de `apps/mobile`:

```powershell
$env:EAS_NO_VCS = "1"
$env:EAS_PROJECT_ROOT = (Resolve-Path "..\..").Path
npx.cmd eas-cli@27.5.0 login
npx.cmd eas-cli@27.5.0 build --platform android --profile preview
```

A raiz explícita inclui `packages/core`, os manifests dos workspaces e o lockfile na compilação remota. Esses comandos foram conferidos com a CLI 27.5.0, usada no primeiro APK. O aviso sobre ausência de controle de versão é esperado ao trabalhar com ZIP.

Para atualizar a cópia Windows já usada nesta apresentação, `scripts/atualizar-apk-windows.ps1` baixa o código, salva backup dos fontes em uma pasta temporária, atualiza o aplicativo e o pacote compartilhado e inicia esse mesmo build. Aceita `-ProjectRoot` para outro caminho e `-Revision` para fixar um commit. Mantém os arquivos `.env` locais. O script não limpa dados do emulador; ao terminar, responda **Y** para instalar a atualização sobre o aplicativo existente.

Após o primeiro build Android bem-sucedido pela CLI, pode-se conectar o repositório `lucaasouza2000-prog/mvp_fast_track` em **Project settings → GitHub** do Expo. Defina **Base directory** como `apps/mobile`. No painel de builds, use branch `main`, plataforma **Android** e perfil **preview** para gerar APKs. A documentação do Expo exige um primeiro build bem-sucedido por CLI antes de iniciar builds pela integração GitHub. Os perfis já definem `image: latest`, exigido por essa integração.

O plugin `expo-sqlite` usa `useSQLCipher:true`; por isso é obrigatório compilar um aplicativo nativo próprio. Expo Go não inclui esse banco criptografado nem fornece validação do serviço de localização exigido. A configuração de câmera remove gravação de áudio.

Baixe o APK do build `preview`, transfira ao aparelho e habilite temporariamente instalação por essa origem (navegador/arquivos). Abra o APK e confirme a instalação. Guarde a chave de assinatura/conta EAS: futuras atualizações precisam da mesma assinatura. APK é distribuição interna; nenhuma publicação na Play Store é necessária.

## Sessão e emuladores

O APK inicial abriu no BlueStacks P64, mas o usuário recebeu uma falha `ExpoSecureStore` ao descriptografar o contador da sessão. Isso não estabelece que a senha esteja incorreta. P64 identifica uma instância Android 9. Com o mesmo APK, o usuário confirmou login no emulador oficial Pixel 6/Android 15. A sincronização seguinte mostrou `file is not a database`: a conexão adicional de `withExclusiveTransactionAsync` do Expo SDK 58 não herda `PRAGMA key`.

A versão `0.1.1 (2)` recupera metadados e fragmentos de sessão ilegíveis removendo somente as entradas de autenticação afetadas e solicitando novo login. Nunca limpa as chaves SQLCipher, a fila de entregas ou o estado do GPS. Gravações são relidas antes de confirmar persistência; se o Keystore continua falhando, o login informa indisponibilidade do armazenamento seguro. Não há alternativa em texto aberto nem desativação da criptografia. Os testes dessa recuperação usam um adaptador simulado e o SDK Supabase real, não um Keystore físico.

Essa versão também abre uma conexão isolada para cada transação local, aplica a chave SQLCipher antes de consultar o banco e inicia `BEGIN IMMEDIATE`. Confirma ou reverte a operação e fecha a conexão. A conexão principal também é explicitamente configurada com a chave. O arquivo, as tabelas e a chave existente são preservados. Os testes de integração exercitam o armazenamento real do aplicativo com SQLite, modelando a exigência de chave por conexão; eles reproduziram a falha antes da correção. O usuário confirmou a instalação da versão `0.1.1 (2)`, build `44013497-f08f-4418-8643-913270601ab7`, sincronização de rotas, check-in, fila zerada e posição recebida no painel usando o emulador oficial. Isso não valida GPS em aparelho físico ou toda a operação offline.

A versão `0.1.4 (5)` também exige gerar e instalar um novo APK; versões já instaladas não recebem estas alterações de código automaticamente. Ao atualizar fontes de uma cópia ZIP, copie tanto `apps/mobile` quanto `packages/core` antes de iniciar o build. Instale atualizações com o mesmo pacote e assinatura para conservar dados. Não desinstale nem limpe o armazenamento se houver entregas pendentes de sincronização.

No Android Studio, conclua o assistente **Standard**, abra **More Actions → Virtual Device Manager**, crie um dispositivo com imagem Android 11 ou superior compatível com seu computador e inicie-o. Baixe o APK do Expo e arraste o arquivo para a janela do emulador. Use contas e rotas marcadas como teste: a localização do emulador é simulada e não comprova GPS durante uma viagem real.

## Rota e previsão

Após check-in online, a confirmação oferece **Ver rota da entrega**. O botão também fica no detalhe da parada e abre o Google Maps com o destino cadastrado e a origem na posição atual do motorista. No emulador sem Maps instalado, a navegação pode abrir no navegador. Navegação e consulta de previsão exigem conexão; o registro offline continua no armazenamento local até sincronizar.

A previsão aparece apenas para carga em transporte, rota ativa e GPS recente recebido pelo servidor. Ela considera o percurso até a entrega e as paradas anteriores em transporte, sem trânsito em tempo real ou tempo de parada. Uma captura com mais de três minutos exige nova posição. No emulador, use **⋮ → Location → Set location** e aguarde a sincronização. O endpoint do site valida a sessão e a atribuição da rota do motorista.

## Antes de sair

1. Faça login online, carregue a rota e as entregas.
2. Faça check-in das cargas pela câmera (QR ou Code 128) ou chave/código manual. Aguarde a fila zerar.
3. Toque em **Iniciar / retomar GPS**, leia a explicação, permita localização **precisa**, depois **Permitir o tempo todo**, e notificações (Android 13+).
4. Verifique a notificação persistente e uma posição real no painel do gestor.
5. Oriente o motorista sobre o acesso à localização por ele e pelos gestores da empresa durante a rota. A conclusão de todas as entregas, a pausa e o logout encerram a coleta no aparelho. Pausa/logout não concluem a rota no servidor.

O Android pode direcionar às configurações para a permissão em segundo plano. Se negada, o aplicativo informa o impedimento. Em fabricantes com otimização agressiva, avalie a permissão de bateria “Sem restrições” para o FastTrack. O aplicativo não altera configurações de bateria sem participação do usuário.

## Offline

Rotas precisam ser sincronizadas anteriormente. Eventos e posições são gravados primeiro em SQLCipher e isolados por conta. A chave do banco e tokens ficam no SecureStore. Não são registrados em logs. Não desinstale o app nem limpe seus dados antes de sincronizar: isso pode apagar registros pendentes e suas chaves.

A fila FIFO conserva o UUID e horário original, usa backoff (aproximadamente 1 s até 5 min, mais jitter) e só remove após confirmação do servidor. O app tenta sincronizar a cada 15 s enquanto ativo, no retorno da conexão, ao voltar ao primeiro plano e nas capturas em segundo plano. O Android pode limitar esses acionamentos. Um erro de autorização ou conflito fica pendente e visível; não existe descarte automático. A reconciliação excepcional ainda exige análise administrativa; não apague a fila para “resolver” falhas.

Ativar/retomar rastreamento requer conexão para validar e ativar a rota no backend. Depois de ativo, perda da internet não impede a captura possível pelo dispositivo. Operações de cargas previamente sincronizadas podem ocorrer offline. Após a última conclusão local, o app interrompe o GPS; a conclusão no servidor acontece quando a fila sincroniza.

Meta de coleta automática: intervalo de 15 s, sem exigir deslocamento mínimo. Em primeiro plano, o aplicativo solicita uma captura ao iniciar/voltar à tela e a cada 15 s; o serviço usa o mesmo intervalo solicitado, sem aguardar o lote anterior de 60 s. Uma captura estacionária válida também pode atualizar a recência. Ao voltar ao primeiro plano, um serviço interrompido é retomado somente se já houver rastreamento ativo e permissões concedidas. Pausar ou sair remove essa autorização de sessão e impede retomada automática. A pausa também invalida uma captura ainda em andamento. GPS parado, economia de energia, sinal, fabricante e sistema podem mudar os intervalos. Não há garantia exata. Force-stop pode impedir execução até o próximo lançamento; reabra o app para retomar uma sessão de rastreamento previamente autorizada. Rotas e entregas recebem atualizações Realtime, com consulta de apoio a cada 15 s. Capturas são salvas primeiro e enviadas automaticamente; repetir o mesmo fix entre serviço e primeiro plano não cria outro registro. O aplicativo informa quando o registro foi confirmado no servidor. Estado de GPS, serviço, permissão, conexão e registros pendentes são visíveis. A última captura só é chamada de recente por 3 minutos.

## iOS

Estrutura de bundle, permissão e background mode estão preparadas. O início do rastreamento está deliberadamente limitado ao Android até haver build, permissões e testes físicos específicos de iOS. Não há alegação de suporte validado.

## Interface simplificada

A aba Rotas mostra os cartões e o botão Confirmar para abrir as entregas. O detalhe apresenta endereço, nota, peso e check-in/check-out. As métricas usam somente os dados reais; chegada sem previsão aparece como traço. GPS e navegação ficam em Conta. Estado da conexão, fila, mensagens e tentativa manual de sincronização ficam em Alertas, preservando as funções sem ocupar a tela principal. A pausa e o logout mantêm o comportamento anterior.
