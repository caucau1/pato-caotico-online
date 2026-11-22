# 🦆 Pato Caótico Online 3.0

Jogo multiplayer real para **2 a 8 pessoas**, com HTML/CSS/JavaScript, Node.js, Express e Socket.IO. Um único servidor entrega o site e sincroniza as salas. Sem cadastro, banco de dados ou serviço pago obrigatório.

## Jogar no computador

1. Instale o **Node.js 24 LTS** de https://nodejs.org/ (inclui npm).
2. Extraia o ZIP. Abra o terminal dentro da pasta `pato-caotico-online`, onde está `package.json`.
3. Execute:

```sh
npm ci
npm start
```

4. Abra http://localhost:3000. Não abra `index.html` diretamente.
5. Escolha seu nome e crie uma sala. Compartilhe o código ou o convite. O ADM inicia quando todos os 2–8 jogadores estiverem conectados.

No Windows, se o PowerShell bloquear `npm.ps1`, use `npm.cmd ci` e `npm.cmd start`, ou o Prompt de Comando. O arquivo `INICIAR.bat` também instala as dependências na primeira abertura e inicia o servidor.

### Celulares na mesma rede Wi-Fi

Com o servidor aberto e a permissão de rede local do Windows concedida, abra `http://IP-DO-COMPUTADOR:3000` nos celulares. Use esse endereço no computador também para gerar convites válidos na rede. `localhost` em um celular aponta para o próprio celular, não para o computador. Para amigos em outras redes, publique no Render.

## Publicar gratuitamente no Render

**Este projeto está preparado para publicação; isso não significa que já esteja hospedado.**

### Opção A: formulário de Web Service

1. Crie um repositório no GitHub e envie o conteúdo da pasta do projeto. `package.json`, `server.js`, `package-lock.json`, `render.yaml`, `game/` e `public/` devem estar na raiz. Não envie `node_modules/`.
2. Entre em https://dashboard.render.com/ e escolha **New → Web Service**.
3. Conecte o repositório e a branch que recebeu os arquivos.
4. Configure:

| Campo | Valor |
| --- | --- |
| Runtime / Language | Node |
| Root Directory | Deixe vazio se `package.json` está na raiz |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Instance Type / Plan | **Free** |
| Health Check Path | `/health` |

5. Em variáveis de ambiente, configure `NODE_ENV=production`. A versão do Node é definida em `.node-version`. Não fixe `PORT`: o servidor usa a porta fornecida pelo Render.
6. Clique em **Deploy Web Service**. Aguarde o serviço aparecer como **Live** e confirme nos logs que o servidor iniciou.
7. Abra o endereço HTTPS `*.onrender.com` que o Render realmente fornecer. Se `https://SEU-ENDERECO/health` mostrar `{"ok":true}`, o processo responde; valide também uma sala com dois aparelhos e uma rodada completa antes de compartilhar com o grupo.

Não escolha **Static Site**: as salas precisam de Node.js e WebSockets. Nenhum segredo, chave Socket.IO ou banco de dados é necessário.

### Opção B: Blueprint

No Render, escolha **New → Blueprint**, conecte o repositório e aplique o `render.yaml` incluído. Confira que o plano selecionado é **Free**. A aplicação abre uma única instância.

### Limites importantes do plano gratuito

- O Render informa que serviços Free dormem após 15 minutos sem tráfego de entrada; a próxima visita pode levar cerca de um minuto para acordar. Tráfego WebSocket de entrada também conta como atividade.
- **Salas e credenciais de reconexão estão somente na memória.** Dormir, reiniciar, trocar a instância ou publicar uma nova versão encerra todas as salas. A reconexão recupera desconexões temporárias, não reinícios do servidor.
- O plano gratuito tem cotas e pode ser alterado pelo provedor. Confira os termos e disponibilidade da sua conta; este projeto não contrata plano pago automaticamente.
- Use **uma instância**. Escalar para várias exige armazenamento compartilhado, coordenação de partidas e adaptação do Socket.IO.

Documentação oficial: https://render.com/docs/free · https://render.com/docs/websocket · https://render.com/docs/web-services

## Regras completas

**Objetivo:** terminar a rodada 12 com mais moedas. Empatados dividem a vitória. Cada pato começa com 12 moedas, um escudo e duas cargas de poder. Moedas nunca ficam negativas; não há eliminação.

Cada rodada dura até **45 segundos** de escolhas secretas, seguidos de **8,5 segundos** de revelação e roleta sincronizada pelo relógio do servidor. Quando todos confirmam, a revelação começa imediatamente. A escolha é imutável após confirmar. Sem resposta no prazo, o servidor aplica cooperar, sem aliança e sem poder.

| Ação | Resultado |
| --- | --- |
| Cooperar | Recebe `3 + ceil(n/2)` moedas. Todos cooperando: +2 para cada um. |
| Roubar | Escolhe outro pato. Tenta transferir `3 + floor(n/3)` moedas do alvo. |
| Proteger | Escolhe outro pato, ganha 2 moedas e bloqueia todos os roubos contra ele naquela rodada. |

`n` é o número de participantes da partida, incluindo os que perderam conexão; não muda durante as 12 rodadas. Para 2, 3, 4, 5, 6, 7 e 8 patos, cooperar rende 4, 5, 5, 6, 6, 7 e 7; roubar tenta levar 3, 4, 4, 4, 5, 5 e 5.

- **Aliança:** a cada rodada, indique outro pato. Só existe se ele indicar você também. Ambos recebem +2. O pacto não obriga ninguém a cooperar. Roubar um aliado sem ser bloqueado gera uma multa de 4 para o ladrão.
- **Escudos:** um escudo bloqueia todos os roubos contra seu dono naquela rodada e é consumido. Proteção recebida de outro pato bloqueia primeiro, sem gastar escudo. Ladrões bloqueados perdem até 2 moedas cada.
- **Poder Casco extra:** gasta uma carga e adiciona um escudo (máximo 3).
- **Poder Bolso secreto:** gasta uma carga e adiciona 5 moedas.
- **Múltiplos ladrões:** o orçamento é o menor entre o saldo da vítima e a soma dos roubos tentados. É dividido igualmente, arredondado para baixo; o resto permanece com a vítima.
- **Ordem de cálculo:** poderes, cooperação/proteção, bônus de cooperação total, alianças, roubos por vítima na ordem de entrada e evento. Isso significa que valores recebidos antes podem fazer parte do saldo disponível para um roubo posterior. Todos os alvos e ações são escolhidos antes da resolução, sem acesso às decisões dos adversários.

### Os 12 eventos

Cada rodada sorteia, no servidor, um evento com chances iguais. Eventos podem se repetir; 12 rodadas não garantem passar pelos 12 eventos.

| Evento | Efeito |
| --- | --- |
| Lago tranquilo | Sem efeito extra |
| Chuva de moedas | +3 para todos |
| Festival do bem | +4 para quem cooperou |
| Imposto do pato | −2 para todos |
| Tempestade | −3 para todos; um escudo bloqueia e é consumido |
| Justiça do lago | −4 para quem roubou |
| Presente surpresa | +8 para um participante sorteado |
| Maré solidária | +5 para todos os empatados no menor saldo antes do evento |
| Casco reforçado | +1 escudo para todos, máximo 3 |
| Pacto dourado | +3 para cada participante de aliança mútua |
| Heróis do lago | +4 para quem protegeu |
| Energia caótica | +1 carga para todos, máximo 2 |

## Reconexão e administração

- O navegador guarda uma credencial aleatória de 256 bits no armazenamento local. O servidor guarda apenas seu hash. Código da sala ou nome não permitem assumir outro jogador.
- A credencial é um segredo: não a compartilhe. O convite contém só o código da sala, nunca a credencial.
- Reconectar recupera identidade, saldo e escolha já confirmada. Uma conexão nova válida substitui a conexão antiga do mesmo jogador. Use um dispositivo/perfil por jogador; abas do mesmo navegador e endereço compartilham a sessão.
- Se o ADM ficar fora por 45 segundos, outro conectado assume. No lobby, ausentes são removidos após esse prazo; durante a partida, a vaga continua reservada, com escolhas automáticas quando necessário.
- Novos jogadores não entram em uma partida em andamento. No final, o ADM abre a revanche: volta ao lobby com quem está conectado e reinicia saldos, poderes e escudos. Convidados novos podem entrar nesse lobby.
- Sair pelo botão funciona no lobby e no final. Durante a partida, fechar a aba desconecta; o pato continua com escolhas automáticas e pode voltar.
- Salas vazias expiram após uma hora sem atividade, com verificação a cada minuto.

## Testes e verificação

```sh
npm ci
npm test
```

Os testes usam o servidor HTTP e clientes Socket.IO reais em portas temporárias: partidas completas de 2–8 patos, 12 rodadas, resultados iguais entre clientes, revanche, sigilo das decisões, ações inválidas, exclusividade do ADM, lotação, isolamento de salas, WebSocket e polling, recuperação de credencial, substituição de sessão, prazos automáticos, transferência de ADM, poderes, alianças, escudos e eventos.

Para testar no navegador, use dois navegadores/perfis distintos ou dois dispositivos. Duas abas normais do mesmo navegador compartilham a credencial e podem substituir uma à outra. O visual tem layout responsivo, controles com rótulos, foco de teclado e suporte à preferência por reduzir animações.

### Roteiro após publicar

1. No aparelho A: nome, criar sala, copiar convite.
2. No aparelho B, em outra rede se possível: abrir convite, escolher outro nome e entrar.
3. Confirmar que os dois veem a lista e apenas A tem o botão de início.
4. Iniciar, escolher ações diferentes e confirmar. Conferir a mesma roleta e os mesmos saldos.
5. Recarregar B; conferir recuperação do nome e da escolha, sem poder votar duas vezes.
6. Terminar as 12 rodadas e abrir a revanche pelo ADM.

## Arquivos e limites do projeto

- `server.js`: servidor, salas, validação, segredos, relógios e reconexão.
- `game/rules.js`: regras e eventos, sem dependência da interface.
- `public/`: interface mobile em português, sem compilação.
- `test/game.test.js`: testes automáticos com clientes reais e regras determinísticas.
- `render.yaml`, `.node-version`, `package-lock.json`: configuração reproduzível de deploy.

Este projeto foi pensado para partidas privadas entre amigos. Há validação de entradas, renderização segura de nomes, limite de mensagens por conexão, limite de salas, limites de tamanho de mensagem e autoridade no servidor. Não inclui contas permanentes, moderação, histórico após reinício ou infraestrutura para milhares de jogadores.
