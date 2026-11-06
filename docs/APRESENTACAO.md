# Apresentação do MVP FAST TRACK

Site: https://mvpfasttrack.vercel.app. Use a conta de gestor já cadastrada. A demonstração em https://mvpfasttrack.vercel.app/demonstracao usa dados fictícios, identificados na tela, e pode ser restaurada sem alterar a operação real.

## Roteiro no emulador e site

1. Mantenha o Pixel 6 aberto e conectado. Instale o APK atualizado por cima do anterior, com a mesma assinatura.
2. No gestor, mostre a lista de entregas, busca e cadastro de rota com origem e destinos confirmados no mapa. No aplicativo, abra a rota do motorista: o cartão mostra progresso e o detalhe organiza as entregas em uma sequência de paradas.
3. Escolha uma entrega pendente de uma rota de teste e faça check-in com o documento fiscal dessa entrega. Aguarde a confirmação da sincronização. A rota passa a em andamento. Após o check-in online, use **Ver rota da entrega** para abrir a navegação; o botão também fica na parada.
4. Inicie ou retome o GPS. No emulador, use **⋮ → Location → Set location** com um ponto próximo do destino em Londrina. A localização é simulada para a apresentação. Aguarde o envio e confirme zero registros pendentes.
5. No gestor, abra os detalhes da entrega. Mostre o percurso planejado em azul, motorista em verde, última captura, **Focar motorista**, **Ver rota** e previsão aproximada de chegada. A previsão exige posição recebida há menos de três minutos e serviço de roteamento disponível. Não inclui trânsito nem tempo de parada.
6. Envie outro ponto próximo no emulador e aguarde a atualização. A câmera acompanha o motorista quando esse modo está selecionado e conserva o enquadramento manual quando você explora o mapa.
7. No aplicativo, confirme o check-out com o mesmo documento e aguarde a sincronização. O progresso aumenta; ao concluir todas as entregas, a rota termina e o aplicativo interrompe a coleta.

Use uma entrega ainda pendente para apresentar um novo check-in. A entrega `CLIENTE-01` de `teste-app-02` já estava em transporte no teste observado; o documento exibido no painel era `TESTE-APP-02`.

## O que foi comprovado

Login, sincronização, check-in e envio de posições foram observados no emulador oficial. GPS com tela bloqueada em Android físico, leitura pela câmera física e operação nativa completa sem conexão ainda precisam de testes. A demonstração local do navegador não substitui esses testes. Não é necessário desinstalar nem limpar dados para atualizar o APK.
