import test from 'node:test';
import assert from 'node:assert/strict';
import { io as client } from 'socket.io-client';
import { createGameServer } from '../server.js';
import { EVENTS, balance, resolveRound } from '../game/rules.js';

const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(fn) { const end=Date.now()+5000; while(!fn()){if(Date.now()>end)throw Error('Tempo esgotado aguardando estado');await delay(5);} }
const send=(s,event,data={})=>new Promise((resolve,reject)=>s.timeout(2000).emit(event,data,(e,r)=>e?reject(e):resolve(r)));
async function setup(t,opts={}) {
  const game=createGameServer({turnMs:3000,revealMs:20,graceMs:30,...opts});
  await new Promise(r=>game.http.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${game.http.address().port}`, sockets=[];
  async function connect(transport='websocket'){
    const s=client(url,{transports:[transport],forceNew:true,reconnection:false}); sockets.push(s);
    s.on('state',x=>s.view=x);await new Promise((r,j)=>{s.once('connect',r);s.once('connect_error',j);});return s;
  }
  t.after(async()=>{sockets.forEach(s=>s.disconnect());await game.close();});
  return {game,connect,url};
}
const choice=(round,extra={})=>({round,action:'cooperate',power:'none',ally:null,...extra});

for(let n=2;n<=8;n++) test(`Partida completa real com ${n} jogadores, 12 rodadas e revanche`,async t=>{
  const {connect,url}=await setup(t), ss=[];
  for(let i=0;i<n;i++){
    const s=await connect();ss.push(s);
    const r=await send(s,i?'join':'create',{name:`Pato ${i}`,code:ss[0].view?.code});assert.equal(r.ok,true);
  }
  assert.equal((await fetch(url+'/health')).status,200);
  assert.equal((await fetch(url+'/')).status,200);
  assert.equal((await send(ss[1],'start')).ok,false);
  assert.equal((await send(ss[0],'start')).ok,true);
  for(let round=1;round<=12;round++){
    await until(()=>ss.every(s=>s.view?.round===round&&s.view.phase==='choosing'));
    assert.equal(ss[0].view.balance.cooperative,balance(n).cooperative);
    for(const s of ss)assert.equal((await send(s,'choose',choice(round))).ok,true);
    await until(()=>ss.every(s=>s.view.phase==='reveal'));
    const result=JSON.stringify(ss[0].view.result);
    ss.forEach(s=>assert.equal(JSON.stringify(s.view.result),result));
  }
  await until(()=>ss.every(s=>s.view.phase==='finished'));
  assert.equal(ss[0].view.history.length,12);
  assert.equal((await send(ss[1],'rematch')).ok,false);
  assert.equal((await send(ss[0],'rematch')).ok,true);
  await until(()=>ss[0].view.phase==='lobby');
  assert.equal(ss[0].view.round,0);assert.equal(ss[0].view.players[0].coins,12);
});

test('Sigilo, validações, lotação e identidade protegida',async t=>{
  const {connect}=await setup(t), a=await connect('polling'), b=await connect();
  const auth=await send(a,'create',{name:'ADM'});
  assert.equal((await send(a,'start')).ok,false);
  assert.equal((await send(b,'join',{name:'<script>',code:auth.code})).ok,false);
  assert.equal((await send(b,'join',{name:'adm',code:auth.code})).ok,false);
  assert.equal((await send(b,'join',{name:'Amigo',code:auth.code})).ok,true);
  assert.equal((await send(a,'start')).ok,true);
  await until(()=>a.view.phase==='choosing');
  assert.equal((await send(a,'choose',choice(2))).ok,false);
  assert.equal((await send(a,'choose',choice(1,{action:'steal',target:a.view.me}))).ok,false);
  assert.equal((await send(a,'choose',choice(1,{power:'hack'}))).ok,false);
  assert.equal((await send(a,'choose',choice(1,{action:'steal',target:b.view.me,power:'windfall',ally:b.view.me}))).ok,true);
  await until(()=>b.view.players.find(p=>p.id===a.view.me).ready);
  const text=JSON.stringify(b.view);
  assert.equal(b.view.myChoice,null);assert.equal(b.view.result,null);
  assert.ok(!text.includes('token'));assert.ok(!text.includes('windfall'));assert.ok(!text.includes('"action":"steal"'));
  assert.equal((await send(a,'choose',choice(1))).ok,false);
  const rogue=await connect();
  assert.equal((await send(rogue,'join',{name:'Intruso',code:auth.code})).ok,false);
  assert.equal((await send(rogue,'resume',{...auth,token:'0'.repeat(64)})).ok,false);
  assert.equal((await send(rogue,'start')).ok,false);
  const fresh=await connect();
  assert.equal((await send(fresh,'resume',auth)).ok,true);
  await until(()=>!a.connected&&fresh.view?.myChoice);
  assert.equal(fresh.view.myChoice.action,'steal');
  assert.equal((await send(fresh,'choose',choice(1))).ok,false);
});

test('Oito vagas, saída e isolamento entre salas',async t=>{
  const {connect}=await setup(t), host=await connect();const auth=await send(host,'create',{name:'Host'});
  for(let i=1;i<8;i++){const s=await connect();assert.equal((await send(s,'join',{name:`p${i}`,code:auth.code})).ok,true);}
  const outsider=await connect();assert.equal((await send(outsider,'join',{name:'Extra',code:auth.code})).ok,false);
  const other=await send(outsider,'create',{name:'Outro'});assert.notEqual(other.code,auth.code);
  assert.equal(outsider.view.players.length,1);assert.equal(host.view.players.length,8);
  assert.equal((await send(outsider,'leave')).ok,true);
  assert.equal((await send(outsider,'join',{name:'X',code:'XXXXX1'})).ok,false);
});

test('Prazo automático, reconexão e transferência de ADM',async t=>{
  const {connect}=await setup(t,{turnMs:90,revealMs:100,graceMs:30}),a=await connect(),b=await connect();
  const auth=await send(a,'create',{name:'A'});await send(b,'join',{name:'B',code:auth.code});await send(a,'start');
  a.disconnect();await until(()=>b.view.hostId===b.view.me);
  await until(()=>b.view.phase==='reveal');
  assert.equal(b.view.result.rows.every(r=>r.automatic),true);
  const again=await connect();assert.equal((await send(again,'resume',auth)).ok,true);
  assert.equal(again.view.me,auth.playerId);
  assert.equal(again.view.hostId,b.view.me);
});

function fixture(n=3){return {round:1,players:Array.from({length:n},(_,i)=>({id:`p${i}`,name:`P${i}`,coins:12,shields:0,charges:2})),choices:new Map()};}
test('Sala vazia continua tendo ADM quando um convidado chega depois',async t=>{
  const {connect,game}=await setup(t,{graceMs:15}),a=await connect();const auth=await send(a,'create',{name:'Ausente'});
  a.disconnect();await until(()=>game.rooms.get(auth.code).players.length===0);
  const b=await connect();assert.equal((await send(b,'join',{name:'Novo ADM',code:auth.code})).ok,true);
  assert.equal(b.view.hostId,b.view.me);
});
test('Reconexão após todos ficarem fora preserva administração da partida',async t=>{
  const {connect}=await setup(t,{graceMs:15}),a=await connect(),b=await connect();
  const auth=await send(a,'create',{name:'A'}),authB=await send(b,'join',{name:'B',code:auth.code});
  await send(a,'start');a.disconnect();b.disconnect();await delay(40);
  const again=await connect();assert.equal((await send(again,'resume',authB)).ok,true);
  assert.equal(again.view.hostId,again.view.me);
});
test('Regras: cooperação, alianças mútuas, escudo e poder',()=>{
  const r=fixture(2);r.choices.set('p0',choice(1,{ally:'p1',power:'windfall'}));r.choices.set('p1',choice(1,{ally:'p0'}));
  resolveRound(r,0,0);assert.equal(r.players[0].coins,25);assert.equal(r.players[1].coins,20);assert.equal(r.players[0].charges,1);
  const s=fixture(2);s.choices.set('p0',choice(1,{action:'steal',target:'p1'}));s.choices.set('p1',choice(1,{power:'shell'}));
  resolveRound(s,0,0);assert.equal(s.players[0].coins,10);assert.equal(s.players[1].shields,0);
});
test('Regras: proteção múltipla, divisão justa e traição',()=>{
  const r=fixture();r.players[0].coins=3;
  r.choices.set('p0',choice(1,{action:'protect',target:'p1'}));
  r.choices.set('p1',choice(1,{action:'steal',target:'p0'}));r.choices.set('p2',choice(1,{action:'steal',target:'p0'}));
  resolveRound(r,0,0);assert.equal(r.players[0].coins,1);assert.equal(r.players[1].coins,14);assert.equal(r.players[2].coins,14);
  const s=fixture();s.choices.set('p0',choice(1,{action:'protect',target:'p1'}));s.choices.set('p1',choice(1));s.choices.set('p2',choice(1,{action:'steal',target:'p1'}));
  resolveRound(s,0,0);assert.equal(s.players[2].coins,10);
  const a=fixture(2);a.choices.set('p0',choice(1,{action:'steal',target:'p1',ally:'p1'}));a.choices.set('p1',choice(1,{ally:'p0'}));
  const result=resolveRound(a,0,0);assert.ok(result.logs.some(l=>l.includes('traiu')));assert.equal(a.players[0].coins,13);
});
test('Todos os 12 eventos preservam limites, resultados e escolhas automáticas',()=>{
  assert.equal(EVENTS.length,12);
  for(let i=0;i<EVENTS.length;i++){const r=fixture(8);const result=resolveRound(r,i,0);assert.equal(result.rows.length,8);r.players.forEach(p=>{assert.ok(Number.isInteger(p.coins)&&p.coins>=0);assert.ok(p.shields<=3);assert.ok(p.charges<=2);});}
});
