# APK Android, permissões e offline

## Gerar o aplicativo

O aplicativo está vinculado ao projeto Expo `lucas_souza_gm/mvpfasttrack`, ID `4ef6f5b5-dce9-4a36-8a1a-761f876d8b86`. O nome de exibição do aplicativo instalado continua sendo FastTrack.

Instale dependências na raiz (`npm ci`). O perfil `preview` de `apps/mobile/eas.json` já inclui a URL e a chave **publicável** do mesmo Supabase usado pelo site. Esses valores são públicos e ficam embutidos no APK; nenhuma chave administrativa faz parte dessa configuração. O ambiente EAS selecionado para esse perfil é `preview`. O perfil `production` usa o ambiente `production` e exige as duas variáveis `EXPO_PUBLIC_SUPABASE_*` configuradas nesse ambiente antes de gerar um AAB. Nunca configure `service_role` no Expo.

Para desenvolvimento local, copie `apps/mobile/.env.example` para `apps/mobile/.env` e preencha a URL e a chave pública. As variáveis da Vercel não são transferidas para Expo automaticamente.

O primeiro APK é iniciado pela CLI com a conta Expo que tem acesso ao projeto:

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

O `projectId` e o proprietário já estão definidos na configuração. No primeiro build Android, aceite gerar uma nova chave de assinatura quando a CLI perguntar, caso o projeto ainda não tenha uma. As credenciais de assinatura ficam gerenciadas pela conta EAS. EAS Build não foi executado neste ambiente: não há sessão Expo configurada nem APK gerado. Para uso local com Android Studio/SDK/JDK compatíveis, `npm run android` cria um development build. `npm run start` inicia o Metro para esse cliente.

No Windows, use PowerShell e Node.js LTS compatível com `engines.node` do projeto. Depois de obter o repositório, entre na pasta raiz, execute `npm ci` e siga os comandos acima. O login solicita a senha dentro do terminal; não é necessário enviá-la no chat.

Após o primeiro build Android bem-sucedido pela CLI, pode-se conectar o repositório `lucaasouza2000-prog/mvp_fast_track` em **Project settings → GitHub** do Expo. Defina **Base directory** como `apps/mobile`. No painel de builds, use branch `main`, plataforma **Android** e perfil **preview** para gerar APKs. A documentação do Expo exige um primeiro build bem-sucedido por CLI antes de iniciar builds pela integração GitHub. Os perfis já definem `image: latest`, exigido por essa integração.

O plugin `expo-sqlite` usa `useSQLCipher:true`; por isso é obrigatório compilar um aplicativo nativo próprio. Expo Go não inclui esse banco criptografado nem fornece validação do serviço de localização exigido. A configuração de câmera remove gravação de áudio.

Baixe o APK do build `preview`, transfira ao aparelho e habilite temporariamente instalação por essa origem (navegador/arquivos). Abra o APK e confirme a instalação. Guarde a chave de assinatura/conta EAS: futuras atualizações precisam da mesma assinatura. APK é distribuição interna; nenhuma publicação na Play Store é necessária.

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

Meta de coleta: intervalo de 60 s e deslocamento de 25 m. GPS parado, economia de energia, sinal, fabricante e sistema podem mudar os intervalos. Não há garantia exata. Force-stop pode impedir execução até o próximo lançamento; reinicie o app e retome o serviço com internet. Estado de GPS, serviço, permissão, conexão e registros pendentes são visíveis. A última captura só é chamada de recente por 3 minutos.

## iOS

Estrutura de bundle, permissão e background mode estão preparadas. O início do rastreamento está deliberadamente limitado ao Android até haver build, permissões e testes físicos específicos de iOS. Não há alegação de suporte validado.
