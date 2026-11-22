# Verificação de entrega

Executada em 22/11/2026, com Node.js 24.22.3.

## Resultado automático

`node --test`: **15 testes aprovados, zero falhas**.

- Sete partidas completas: uma para cada quantidade de jogadores entre 2 e 8, com clientes Socket.IO reais, 12 rodadas, resultados sincronizados e revanche.
- Sigilo das decisões até a revelação, escolha única por rodada, alvo inválido, rodada inválida e poder inválido.
- Início e revanche exclusivos do ADM, mínimo de participantes e sala cheia.
- Salas independentes, entrada e saída, HTTP, WebSocket e polling.
- Credencial inválida rejeitada, reconexão válida e substituição de conexão antiga.
- Prazo com escolha automática, ADM ausente e retorno quando todos ficaram offline.
- Sala temporariamente vazia ganha novo ADM quando alguém entra.
- Cooperação, alianças mútuas, traição, proteção, escudos, poderes, divisão de roubos e limites de todos os 12 eventos.

Os testes reduzem os prazos para rodar rapidamente. A configuração de produção mantém 45 segundos para escolher e 8,5 segundos para revelar.

`node --check server.js` e `node --check public/client.js`: aprovados.

Consulta `npm audit --omit=dev`: zero vulnerabilidades conhecidas reportadas no momento da entrega. O resultado é uma consulta pontual, não uma garantia permanente.

## Navegador

Conferidos o lobby, a entrada de um segundo cliente, início pelo ADM, confirmação de cooperação com aliança e poder, revelação e atualização de saldo. Layout conferido em viewport de 390 × 844, com largura do conteúdo igual à área útil, sem rolagem horizontal. Os nomes usados na sessão de teste foram Pato ADM e Pato Amigo.

## Publicação

Incluídos `render.yaml`, `.node-version`, lock de dependências e instruções detalhadas no README. O dashboard do Render apresentou tela de login, sem uma sessão autenticada disponível. **Nenhum deploy público foi realizado ou verificado.**

Depois de publicar, ainda é necessário executar o roteiro de dois aparelhos no endereço HTTPS real, descrito no README. As salas não persistem após reinício do servidor.
