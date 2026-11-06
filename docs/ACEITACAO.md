# Aceitação operacional

## Evidências automatizadas locais

- `npm test`: DV NF-e, extração segura, associação à entrega, transições, FIFO, remoção após confirmação, falhas preservadas, backoff, projeção offline e recência.
- `npm run test:db`: executa a migration real em PostgreSQL WASM, isolamento entre empresas, bloqueio de alteração de papel, gravação apenas por RPC, reenvio idempotente, conflito de UUID, rejeição de documento incorreto, GPS apenas no intervalo ativo, conclusão parcial e total.
- `npm run typecheck`, `npm run build`: tipos e produção Next.js.
- `npm run test:web`: Chromium, telas sem configuração e responsividade. Esses testes não usam um Supabase real.
- `EXPO_OFFLINE=1 npx expo export --platform android --output-dir /tmp/fasttrack-android-bundle`, executado em `apps/mobile`: verifica o bundle JavaScript Android; não equivale a build nativo ou teste de GPS.

## Fluxo completo — pendente de Supabase e Android físicos

Use um projeto de homologação e registros marcados como teste. Não confunda coordenadas de teste com viagens reais. Os testes abaixo estão **não executados neste ambiente**, não aprovados.

1. Gestor entra, cadastra um motorista, veículo e clientes; cria rota com três entregas, notas reais de teste e coordenadas verificadas.
2. Motorista entra no APK com a conta atribuída. Outra conta/empresa não pode consultar a rota. Web também deve redirecionar corretamente por perfil.
3. Leia QR de nota com URL contendo chave, Code 128, chave de 44 dígitos e código curto cadastrado. Compare entrada manual. Documento errado deve ser rejeitado. Número repetido em outra entrega não deve validar a carga errada.
4. Faça check-in das três cargas, confirme sincronização e eventos no painel. Check-out antes de check-in deve ser rejeitado inclusive por chamada RPC direta.
5. Inicie o GPS, confirme permissões e notificação persistente. Registre horário/precisão de uma posição real no aparelho e confira no Supabase e mapa.
6. Desloque-se com o app aberto. Depois minimize por pelo menos 10 minutos e bloqueie a tela por mais 10 minutos. Compare capturas no aparelho, recebimentos no banco e lacunas. Não exija intervalo exato de 60 segundos; documente fabricante, modelo, Android, permissões e bateria.
7. Desative internet mantendo localização ativa. Desloque-se e faça check-out de uma entrega. Feche e reabra normalmente o app: fila e estado devem persistir. Não use force-stop neste passo.
8. Reative internet: aguarde backoff, confira mesmos UUIDs, captura original, horário de recebimento posterior e nenhum evento duplicado. Reinicie o app durante um reenvio para validar idempotência. O painel deve mostrar apenas a primeira entrega concluída.
9. Conclua as demais: somente a última deve finalizar a rota. Verifique que a notificação some e não são capturadas novas posições. Reenvios históricos dentro do período ativo continuam sendo aceitos; capturas depois da conclusão devem ser rejeitadas.
10. Negue câmera/GPS/background/notificações separadamente e desligue o GPS. Cada impedimento deve aparecer sem afirmar rastreamento ativo. Teste pausa, logout com fila e retorno com a mesma conta.
11. Faça force-stop; registre que o Android pode interromper o serviço e exigir reabertura/retomada. Teste também reinício do aparelho e modo de economia de energia. A retomada automática após reinício não é implementada.
12. Repita em aparelhos de fabricantes com políticas de bateria diferentes. Registre as configurações necessárias, consumo e limitações.
13. Interrompa Realtime e a conexão do painel: após reconectar, o polling deve recuperar as posições. Dados com captura antiga devem aparecer como desatualizados, mesmo que acabem de chegar ao servidor.

## Registro dos resultados

Para cada teste físico registre: data/hora e fuso, modelo, Android, versão do APK, rota de homologação, IDs dos eventos/posições, permissões, modo de bateria, resultado observado e evidências sem tokens/segredos. Identifique separadamente aprovado, falhou, não executado e bloqueado. Não publique informações pessoais de localização em logs ou issues públicos.
