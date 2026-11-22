import express from 'express';
import { createServer as httpServer } from 'node:http';
import { Server } from 'socket.io';
import { randomBytes, randomInt, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveRound, balance, EVENTS } from './game/rules.js';

const hash = s => createHash('sha256').update(s).digest();
const fail = message => { throw new Error(message); };
export function createGameServer({ turnMs = 45000, revealMs = 8500, graceMs = 45000, ttlMs = 3600000 } = {}) {
  const app = express(), http = httpServer(app), rooms = new Map(), timers = new Set();
  const io = new Server(http, { maxHttpBufferSize: 8192, serveClient: true });
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff'); next();
  });
  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));
  function later(fn, ms) { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; }
  function clear(t) { clearTimeout(t); timers.delete(t); }
  function view(r, me) {
    return { code: r.code, phase: r.phase, hostId: r.hostId, round: r.round, totalRounds: 12,
      deadline: r.deadline, spinUntil: r.spinUntil || null, serverTime: Date.now(), balance: balance(r.players.length), events: EVENTS,
      players: r.players.map(p => ({ id: p.id, name: p.name, connected: !!p.socketId, coins: p.coins, shields: p.shields, charges: p.charges, ready: r.choices.has(p.id) })),
      me, myChoice: r.choices.get(me) || null, result: r.result, history: r.history };
  }
  function emit(r) { r.updated = Date.now(); for (const p of r.players) if (p.socketId) io.to(p.socketId).emit('state', view(r, p.id)); }
  function nextRound(r) {
    if (!rooms.has(r.code)) return;
    r.round++; r.phase = 'choosing'; r.choices.clear(); r.result = null;
    r.deadline = Date.now() + turnMs; r.timer = later(() => reveal(r), turnMs); emit(r);
  }
  function reveal(r) {
    if (r.phase !== 'choosing') return;
    clear(r.timer); r.phase = 'reveal';
    r.result = resolveRound(r, randomInt(EVENTS.length), randomInt(r.players.length));
    r.history.push(r.result); r.spinUntil = Date.now() + Math.min(2200, revealMs / 3); r.deadline = Date.now() + revealMs; emit(r);
    r.timer = later(() => { if (r.round >= 12) { r.phase = 'finished'; r.deadline = null; emit(r); } else nextRound(r); }, revealMs);
  }
  function cleanName(name) {
    if (typeof name !== 'string') fail('Escolha seu nome.');
    name = name.trim().replace(/\s+/g, ' ');
    if (name.length < 1 || name.length > 20 || /[<>\x00-\x1f]/.test(name)) fail('Use um nome de 1 a 20 caracteres, sem < ou >.');
    return name;
  }
  function addPlayer(r, name, socket) {
    if (r.players.some(p => p.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) fail('Esse nome já está na sala.');
    const token = randomBytes(32).toString('hex');
    const p = { id: randomUUID(), name, tokenHash: hash(token), socketId: socket.id, coins: 12, shields: 1, charges: 2 };
    r.players.push(p); socket.data.room = r.code; socket.data.player = p.id; return { p, token };
  }
  function member(s) {
    const r = rooms.get(s.data.room), p = r?.players.find(p => p.id === s.data.player && p.socketId === s.id);
    if (!r || !p) fail('Entre novamente na sala.'); return { r, p };
  }
  function transfer(r) {
    if (!r.players.find(p => p.id === r.hostId)?.socketId) r.hostId = r.players.find(p => p.socketId)?.id || r.hostId;
  }
  io.on('connection', s => {
    let rateAt = Date.now(), count = 0;
    function on(event, fn) { s.on(event, (data, ack) => {
      try {
        if (Date.now() - rateAt > 10000) { count = 0; rateAt = Date.now(); }
        if (++count > 60) fail('Muitas ações. Aguarde alguns segundos.');
        const result = fn(data && typeof data === 'object' && !Array.isArray(data) ? data : {});
        if (typeof ack === 'function') ack({ ok: true, ...result });
      } catch (e) { if (typeof ack === 'function') ack({ ok: false, error: e.message }); }
    }); }
    on('create', d => {
      if (s.data.room) fail('Saia da sala atual primeiro.');
      if (rooms.size >= 300) fail('Servidor cheio. Tente mais tarde.');
      const name = cleanName(d.name); let code;
      do { code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join(''); } while (rooms.has(code));
      const r = { code, phase: 'lobby', players: [], round: 0, choices: new Map(), history: [], result: null, updated: Date.now(), deadline: null };
      const { p, token } = addPlayer(r, name, s); r.hostId = p.id; rooms.set(code, r); emit(r); return { code, playerId: p.id, token };
    });
    on('join', d => {
      if (s.data.room) fail('Saia da sala atual primeiro.');
      const r = rooms.get(String(d.code || '').toUpperCase().trim());
      if (!r) fail('Sala não encontrada ou expirada.');
      if (r.phase !== 'lobby') fail('A partida já começou. Aguarde a revanche.');
      if (r.players.length >= 8) fail('A sala está cheia (8 patos).');
      const { p, token } = addPlayer(r, cleanName(d.name), s);
      if (!r.players.some(x => x.id === r.hostId)) r.hostId = p.id;
      emit(r); return { code: r.code, playerId: p.id, token };
    });
    on('resume', d => {
      if (s.data.room) fail('Você já está conectado a uma sala.');
      const r = rooms.get(d.code), p = r?.players.find(p => p.id === d.playerId);
      if (!p || typeof d.token !== 'string' || d.token.length !== 64 || !timingSafeEqual(p.tokenHash, hash(d.token))) fail('Sessão inválida ou sala expirada.');
      if (p.socketId && p.socketId !== s.id) {
        const old = io.sockets.sockets.get(p.socketId); if (old) { old.emit('replaced'); old.data = {}; old.disconnect(true); }
      }
      clear(p.disconnectTimer); p.socketId = s.id; s.data.room = r.code; s.data.player = p.id;
      const host = r.players.find(x => x.id === r.hostId);
      if (!host?.socketId && Date.now() - (host?.offlineAt || 0) >= graceMs) transfer(r);
      emit(r); return { code: r.code, playerId: p.id };
    });
    on('start', () => {
      const { r, p } = member(s);
      if (r.hostId !== p.id) fail('Somente o ADM pode iniciar.');
      if (r.phase !== 'lobby') fail('A partida já começou.');
      if (r.players.length < 2 || r.players.length > 8 || r.players.some(p => !p.socketId)) fail('São necessários de 2 a 8 patos conectados.');
      nextRound(r);
    });
    on('choose', d => {
      const { r, p } = member(s);
      if (r.phase !== 'choosing' || d.round !== r.round) fail('Esta rodada já terminou.');
      if (r.choices.has(p.id)) fail('Sua escolha já foi confirmada.');
      if (!['cooperate', 'steal', 'protect'].includes(d.action)) fail('Ação inválida.');
      const validOther = id => r.players.some(x => x.id === id && x.id !== p.id);
      if (d.action !== 'cooperate' && !validOther(d.target)) fail('Escolha outro pato como alvo.');
      if (d.ally && !validOther(d.ally)) fail('Aliança inválida.');
      if (!['none', 'shell', 'windfall'].includes(d.power) || (d.power !== 'none' && p.charges < 1)) fail('Poder indisponível.');
      r.choices.set(p.id, { action: d.action, target: d.action === 'cooperate' ? null : d.target, ally: d.ally || null, power: d.power });
      if (r.choices.size === r.players.length) reveal(r); else emit(r);
    });
    on('rematch', () => {
      const { r, p } = member(s);
      if (r.hostId !== p.id || r.phase !== 'finished') fail('A revanche é aberta pelo ADM no final.');
      r.players = r.players.filter(p => p.socketId); r.players.forEach(p => { p.coins = 12; p.shields = 1; p.charges = 2; });
      r.phase = 'lobby'; r.round = 0; r.choices.clear(); r.history = []; r.result = null; emit(r);
    });
    on('leave', () => {
      const { r, p } = member(s);
      if (!['lobby', 'finished'].includes(r.phase)) fail('Durante a partida, feche a aba para sair. Suas rodadas usarão a escolha automática.');
      clear(p.disconnectTimer); r.players = r.players.filter(x => x !== p); s.data = {}; transfer(r);
      if (!r.players.length) { clear(r.timer); rooms.delete(r.code); } else emit(r);
    });
    s.on('disconnect', () => {
      let m; try { m = member(s); } catch { return; }
      const { r, p } = m; p.socketId = null; p.offlineAt = Date.now(); emit(r);
      p.disconnectTimer = later(() => {
        if (p.socketId || !rooms.has(r.code)) return;
        if (r.phase === 'lobby') r.players = r.players.filter(x => x !== p);
        transfer(r); emit(r);
      }, graceMs);
    });
  });
  const sweep = setInterval(() => { for (const [code, r] of rooms) if (!r.players.some(p => p.socketId) && Date.now() - r.updated > ttlMs) { clear(r.timer); r.players.forEach(p => clear(p.disconnectTimer)); rooms.delete(code); } }, Math.min(ttlMs, 60000)); sweep.unref();
  return { app, http, io, rooms, async close() { clearInterval(sweep); for (const t of timers) clearTimeout(t); timers.clear(); await new Promise(resolve => io.close(resolve)); } };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const game = createGameServer();
  game.http.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log(`Pato Caótico: http://localhost:${process.env.PORT || 3000}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => { await game.close(); process.exit(0); });
}
