# Editar rotas e limpar os testes do painel

Esta atualização é do painel web. Não exige gerar outro APK.

## Ativação no Supabase

Abra https://mvpfasttrack.vercel.app/atualizacao-rotas, clique em **Copiar SQL**, abra o SQL Editor pelo botão da página e execute a consulta uma vez. O mesmo conteúdo está em `supabase/migrations/202611060001_route_management.sql`. O arquivo também fica disponível em https://mvpfasttrack.vercel.app/gestao-rotas.sql após a publicação. A migration acrescenta os controles de edição e exclusão, preserva os registros existentes e pode ser executada novamente sem apagar informações. Não contém credenciais e não exclui rotas por conta própria.

O ambiente de desenvolvimento não possui sessão ou credenciais administrativas do Supabase hospedado; a execução remota não foi feita pelo agente. Não envie senhas ou chaves pelo chat. Depois de executar o SQL, recarregue o painel.

## Organizar as rotas

Em **Gerenciar rotas**, use a busca para encontrar os testes, selecione as rotas desejadas e clique em **Excluir selecionadas**. A lista de confirmação mostra os nomes das rotas. Digite **EXCLUIR** e confirme. A seleção nunca é feita automaticamente pelo nome: uma identificação parecida com TESTE pode pertencer a uma operação que você quer manter.

A exclusão retira as rotas do painel e da listagem do motorista. Ela é um arquivamento: o banco preserva histórico, documentos e eventos, e os cadastros de clientes, motoristas e veículos permanecem disponíveis. As entregas não recebem check-out fictício. O motorista vê a remoção na próxima sincronização com o app aberto; o rastreamento local para quando o aplicativo reconhece que a rota saiu da sua lista. Capturas e operações pendentes de uma rota excluída são reconhecidas pelo servidor como encerradas, sem gerar novos eventos, para liberar a fila do motorista. Essa confirmação só é aceita para o motorista e a empresa da rota arquivada.

Em **Editar rota**, é possível corrigir identificação, veículo, saída prevista, origem e destino das entregas ainda não concluídas, inclusive em rota ativa. A edição mantém os IDs, a sequência das paradas, horários, status e histórico. O documento fiscal original é preservado. Após check-in, motorista, cliente e código da carga confirmada ficam protegidos; entregas concluídas não podem ser reescritas. Rotas totalmente concluídas permitem exclusão, mas não edição.

Novas entregas e remoção de entregas não fazem parte deste editor: use o cadastro de uma nova rota para mudar a composição da operação. Alterações simultâneas de outro gestor são detectadas por versão e exigem atualizar a lista.

## Dados fictícios

O painel `/gestao` usa somente registros persistidos da empresa. Os exemplos automáticos ficam isolados em `/demonstracao` e no armazenamento local do navegador. Rotas de teste cadastradas no projeto real precisam ser selecionadas e excluídas pelo gestor; esta atualização não apaga registros do projeto automaticamente.
