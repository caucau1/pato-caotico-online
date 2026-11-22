/* All authoritative state comes from the server. Never render player input as HTML. */
const socket = io({ reconnection: true, reconnectionDelay: 750, reconnectionDelayMax: 5000 });
const app = document.querySelector('#app'), statusEl = document.querySelector('#connection');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state = null, draft = { action: 'cooperate', target: '', ally: '', power: 'none' }, draftKey = '', busy = false, offset = 0, noticeTimer;
const sessionKey = 'pato-session-v3';
function saved() { try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { return null; } }
function save(value) { try { if (value) localStorage.setItem(sessionKey, JSON.stringify(value)); else localStorage.removeItem(sessionKey); } catch { toast('Seu navegador não permite salvar a sessão. A reconexão após recarregar pode falhar.'); } }
function toast(message) { const el = document.querySelector('#notice'); el.textContent = message; el.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => el.hidden = true, 6000); }
function request(event, data = {}) { return new Promise(resolve => socket.timeout(8000).emit(event, data, (error, result) => resolve(error ? { ok: false, retryable: true, error: 'Sem resposta. Confira a conexão antes de tentar novamente.' } : result))); }
function bind(id, fn) { const el = document.getElementById(id); if (el) el.onclick = fn; }
const names = id => state?.players.find(p => p.id === id)?.name || '—';
const label = { cooperate: '🌱 Cooperou', steal: '🗡️ Roubou', protect: '🛡️ Protegeu' };
const powerLabel = { none: 'Sem poder', shell: 'Casco extra', windfall: 'Bolso secreto' };
function playerList(sorted = false) {
  const ps = sorted ? [...state.players].sort((a,b) => b.coins-a.coins) : state.players;
  return ps.map((p, i) => `<div class="player"><div class="avatar">${['🦆','🐥','🦢','🐤','🦜','🐧','🦉','🐦'][state.players.findIndex(x=>x.id===p.id)]}</div><div class="player-info"><div class="name">${sorted ? `${i+1}. ` : ''}${esc(p.name)} ${p.id===state.me ? '<span class="small">(você)</span>' : ''}</div><div class="meta"><span class="${p.connected?'online':''}">${p.connected?'Conectado':'Reconectando…'}</span>${p.id===state.hostId?' · 👑 ADM':''}${state.phase==='choosing' && p.ready?' · ✓ Pronto':''}</div><div class="meta">🛡️ ${p.shields} · ⚡ ${p.charges}</div></div><div class="score">${p.coins}<div class="meta">moedas</div></div></div>`).join('');
}
function home() {
  const invite = new URLSearchParams(location.search).get('sala') || '';
  app.innerHTML = `<div class="hero"><section><div class="eyebrow">Seu grupo. Seu lago. Seu caos.</div><div class="duck" aria-hidden="true">🦆</div><h1>Amigos hoje.<br><em>Suspeitos amanhã.</em></h1><p class="lead">Coopere, proteja ou passe a perna. Doze rodadas para descobrir quem manda no lago.</p><div class="chips"><span class="chip">2–8 jogadores</span><span class="chip">Salas privadas</span><span class="chip">Escolhas secretas</span></div></section><section class="panel"><h2>${invite?'Você foi convidado!':'Bora causar?'}</h2><p>Um dispositivo por pato. Escolha seu nome e reúna a galera.</p><form id="entry"><label for="name">Como te chamam no lago?</label><input id="name" maxlength="20" autocomplete="nickname" placeholder="Seu nome" required><button id="create" type="button" class="wide">Criar sala privada</button><div class="divider">ou entre na sala dos amigos</div><label for="code">Código da sala</label><div class="join-row"><input id="code" maxlength="6" placeholder="EX: QUACK7" value="${esc(invite)}" autocapitalize="characters" autocomplete="off"><button id="join" type="submit" class="secondary">Entrar</button></div><p class="small">Grátis, sem cadastro. O ADM decide quando começar.</p></form></section></div>`;
  async function enter(event) {
    if (busy || !socket.connected) return toast('Aguarde a conexão com o lago.');
    const name = document.querySelector('#name').value.trim(), code = document.querySelector('#code').value.trim();
    if (!name) return toast('Escolha seu nome primeiro.');
    busy = true; document.querySelectorAll('#entry button').forEach(b=>b.disabled=true);
    const result = await request(event, { name, code }); busy = false;
    if (!result.ok) { toast(result.error); if (!state) document.querySelectorAll('#entry button').forEach(b=>b.disabled=false); return; }
    save({ code: result.code, playerId: result.playerId, token: result.token });
    history.replaceState(null, '', `?sala=${encodeURIComponent(result.code)}`);
  }
  bind('create', () => enter('create'));
  document.querySelector('#entry').onsubmit = e => { e.preventDefault(); enter('join'); };
}
function roomHeader() { return `<div class="room-head"><div><div class="eyebrow">Sala privada · ${state.players.length}/8 patos</div><div class="room-code">${esc(state.code)}</div></div><div><button id="invite" class="secondary">Copiar convite</button>${['lobby','finished'].includes(state.phase)?'<button id="leave" class="quiet">Sair</button>':''}</div></div>`; }
function resultHTML(result) { return result.rows.map(p=>`<div class="reveal-row"><div><b>${esc(p.name)}</b><div class="small">${label[p.action]}${p.target?` · alvo: ${esc(names(p.target))}`:''}${p.automatic?' · automático':''}</div><div class="small">Aliança: ${esc(names(p.ally))} · ${powerLabel[p.power]}</div></div><strong class="${p.delta>=0?'positive':'negative'}">${p.delta>=0?'+':''}${p.delta}</strong></div>`).join(''); }
function render() {
  if (!state) return home();
  const host = state.me===state.hostId, me=state.players.find(p=>p.id===state.me);
  const key = `${state.code}:${state.round}:${state.phase}`;
  if (key !== draftKey) { draftKey=key; draft={ action:'cooperate', target:state.players.find(p=>p.id!==state.me)?.id||'', ally:'', power:'none' }; }
  let main;
  if (state.phase==='lobby') {
    const canStart = state.players.length>=2 && state.players.every(p=>p.connected);
    main=`<section class="panel"><div class="eyebrow">Antes da confusão</div><h2>O lago está enchendo.</h2><p>Mande o convite para os amigos. Cada um entra com seu próprio nome.</p><div class="players">${playerList()}</div><div class="banner">${state.players.length<2?'Falta pelo menos mais um pato.':canStart?'Galera reunida. Tudo pronto para começar!':'Aguardando os patos reconectarem…'}</div>${host?`<button id="start" class="wide" ${canStart?'':'disabled'}>Começar o caos · ${state.players.length} ${state.players.length===1?'jogador':'jogadores'}</button>`:`<p>Aguardando ${esc(names(state.hostId))} iniciar a partida.</p>`}</section>`;
  } else if (state.phase==='choosing') {
    const options = state.players.filter(p=>p.id!==state.me).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
    main=`<section class="panel"><div class="round-top"><span class="eyebrow">Rodada ${state.round} / 12</span><span class="timer" id="timer"></span></div><progress class="progress" max="12" value="${state.round}" aria-label="Progresso da partida"></progress><h2>${state.myChoice?'Escolha guardada. 🤫':'Qual é a sua, pato?'}</h2><p>${state.myChoice?'Aguarde os outros patos. Ninguém vê sua decisão antes da hora.':`Cooperar rende ${state.balance.cooperative}. Roubar tenta levar ${state.balance.steal}. Confie por sua conta.`}</p>${state.myChoice?`<div class="banner">${label[state.myChoice.action]}${state.myChoice.target?` · alvo: ${esc(names(state.myChoice.target))}`:''}<br>${powerLabel[state.myChoice.power]} · Aliança: ${esc(names(state.myChoice.ally))}</div>`:`<div class="actions">${[['cooperate','🌱','Cooperar'],['steal','🗡️','Roubar'],['protect','🛡️','Proteger']].map(([id,icon,title])=>`<button class="action ${draft.action===id?'selected':''}" data-action="${id}" aria-pressed="${draft.action===id}"><span>${icon}</span>${title}</button>`).join('')}</div><div class="fields"><div><label for="target">Alvo da ação</label><select id="target" ${draft.action==='cooperate'?'disabled':''}>${options}</select></div><div><label for="ally">Propor aliança nesta rodada</label><select id="ally"><option value="">Sem aliança</option>${options}</select></div></div><label for="power">Poder · ${me.charges} carga(s) disponíveis</label><select id="power" ${me.charges?'':'disabled'}><option value="none">Guardar minhas cargas</option><option value="shell">🛡️ Casco extra · +1 escudo</option><option value="windfall">🪙 Bolso secreto · +5 moedas</option></select><button class="wide" id="confirm">Confirmar escolha secreta</button><p class="small">Depois de confirmar, a escolha fica travada. Sem escolha no prazo? Seu pato coopera.</p>`}<p class="small">${state.players.filter(p=>p.ready).length}/${state.players.length} escolhas confirmadas</p></section>`;
  } else if (state.phase==='reveal') {
    const r=state.result;
    main=`<section class="panel"><div class="round-top"><span class="eyebrow">Revelação · rodada ${state.round}/12</span><span id="timer" class="timer"></span></div><div class="wheel"><span class="wheel-icon" id="wheel-icon">${r.event.icon}</span><h2 class="event-name" id="event-name">${esc(r.event.name)}</h2><p>${esc(r.event.description)}${r.lucky?` Sorteado: ${esc(r.lucky)}.`:''}</p></div>${resultHTML(r)}<ul class="log">${r.logs.map(l=>`<li>${esc(l)}</li>`).join('')}</ul><p class="small">Evento sorteado pelo servidor e igual para toda a sala. ${state.round===12?'O resultado final vem a seguir.':'A próxima rodada começa automaticamente.'}</p></section>`;
  } else {
    const max=Math.max(...state.players.map(p=>p.coins)), winners=state.players.filter(p=>p.coins===max).map(p=>p.name).join(' e ');
    main=`<section class="panel"><div class="winner"><div class="duck">🏆</div><div class="eyebrow">O lago tem seus campeões</div><h1>${esc(winners)}</h1><p>${max} moedas. Doze rodadas. Amizade sobreviveu?</p></div><div class="leaderboard">${playerList(true)}</div>${host?'<button id="rematch" class="wide">Jogar revanche</button>':'<p>Aguardando o ADM abrir a revanche.</p>'}<details><summary>Histórico das 12 rodadas</summary>${state.history.map(r=>`<h3>Rodada ${r.round} · ${esc(r.event.name)}</h3>${resultHTML(r)}`).join('')}</details></section>`;
  }
  app.innerHTML=roomHeader()+`<div class="layout">${main}<aside class="panel"><div class="eyebrow">${state.phase==='lobby'?'Plano de voo':'Placar ao vivo'}</div><h2>${state.phase==='lobby'?'12 rodadas. Zero certezas.':'Cada moeda conta.'}</h2>${state.phase==='lobby'?`<p>🌱 Coopere para ganhar.<br>🗡️ Roube para arriscar.<br>🛡️ Proteja quem merece.</p><p>Combine alianças — elas só valem quando os dois se escolhem.</p><p class="small">Regras adaptadas a ${state.players.length} patos: cooperação +${state.balance.cooperative}, tentativa de roubo ${state.balance.steal}.</p><button id="side-rules" class="secondary wide">Entender as regras</button>`:`<div class="leaderboard">${playerList(true)}</div>`}<p class="small">Perdeu a conexão? Reabra neste navegador para recuperar sua vaga. Reiniciar o servidor encerra a sala.</p></aside></div>`;
  bind('invite', async()=>{ const url=`${location.origin}/?sala=${state.code}`; try { await navigator.clipboard.writeText(url); toast('Convite copiado! Mande no grupo.'); } catch { toast(url); } });
  async function action(event) { if (busy) return; busy=true; const r=await request(event); busy=false; if(!r.ok) toast(r.error); }
  bind('start',()=>action('start')); bind('rematch',()=>action('rematch'));
  bind('leave',async()=>{ const r=await request('leave'); if(!r.ok)return toast(r.error); save(null); state=null; history.replaceState(null,'','/'); home(); });
  bind('side-rules',()=>document.querySelector('#rules').showModal());
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{draft.action=b.dataset.action;render();});
  for(const id of ['target','ally','power']) { const el=document.getElementById(id); if(el) {el.value=draft[id];el.onchange=()=>draft[id]=el.value;} }
  bind('confirm',async()=>{ const b=document.querySelector('#confirm');b.disabled=true;const r=await request('choose',{...draft,round:state.round});if(!r.ok){toast(r.error);if(document.contains(b))b.disabled=false;} });
  tick();
}
function tick(){if(state?.phase==='reveal'){const spinning=Date.now()+offset<state.spinUntil;const icon=document.querySelector('#wheel-icon'), title=document.querySelector('#event-name');if(icon)icon.textContent=spinning?state.events[Math.floor((Date.now()+offset)/100)%state.events.length].icon:state.result.event.icon;if(title)title.textContent=spinning?'Girando a roleta…':state.result.event.name;}const el=document.querySelector('#timer');if(el&&state?.deadline){const secs=Math.max(0,Math.ceil((state.deadline-Date.now()-offset)/1000));el.textContent=`${secs}s`;el.setAttribute('aria-label',`${secs} segundos restantes`);}}
setInterval(tick,250);
socket.on('state',next=>{state=next;offset=next.serverTime-Date.now();render();});
socket.on('connect',async()=>{statusEl.textContent='● Online';const data=saved();if(data){statusEl.textContent='Recuperando sessão…';const r=await request('resume',data);statusEl.textContent='● Online';if(!r.ok){if(!r.retryable){save(null);state=null;home();}toast(r.error);}}});
socket.on('disconnect',reason=>{statusEl.textContent=reason==='io server disconnect'?'Sessão encerrada':'Reconectando…';});
socket.on('connect_error',()=>{statusEl.textContent='Tentando conectar…';});
socket.on('replaced',()=>{state=null;home();toast('Sua sessão foi aberta em outra aba. Continue por lá.');});
bind('open-rules',()=>document.querySelector('#rules').showModal());bind('close-rules',()=>document.querySelector('#rules').close());
home();
