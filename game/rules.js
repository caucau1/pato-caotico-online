export const EVENTS = [
  { id: 'calm', name: 'Lago tranquilo', icon: '🌊', description: 'Uma pausa no caos. Sem efeito extra.' },
  { id: 'rain', name: 'Chuva de moedas', icon: '🪙', description: 'Todos recebem 3 moedas.' },
  { id: 'festival', name: 'Festival do bem', icon: '🎉', description: 'Quem cooperou recebe mais 4 moedas.' },
  { id: 'tax', name: 'Imposto do pato', icon: '📜', description: 'Todos perdem até 2 moedas.' },
  { id: 'storm', name: 'Tempestade', icon: '⛈️', description: 'Cada pato perde 3 moedas. Um escudo bloqueia.' },
  { id: 'justice', name: 'Justiça do lago', icon: '⚖️', description: 'Quem roubou perde até 4 moedas.' },
  { id: 'gift', name: 'Presente surpresa', icon: '🎁', description: 'Um pato sorteado recebe 8 moedas.' },
  { id: 'balance', name: 'Maré solidária', icon: '💛', description: 'Todos os patos com menor saldo recebem 5 moedas.' },
  { id: 'shield', name: 'Casco reforçado', icon: '🛡️', description: 'Todos ganham um escudo, até o limite de 3.' },
  { id: 'alliance', name: 'Pacto dourado', icon: '🤝', description: 'Alianças mútuas recebem 3 moedas por participante.' },
  { id: 'guard', name: 'Heróis do lago', icon: '🦸', description: 'Quem protegeu recebe 4 moedas.' },
  { id: 'recharge', name: 'Energia caótica', icon: '⚡', description: 'Todos recuperam uma carga de poder, até 2.' }
];
export const balance = n => ({ cooperative: 3 + Math.ceil(n / 2), steal: 3 + Math.floor(n / 3) });
export function resolveRound(room, eventIndex, luckyIndex) {
  const ps = room.players, b = balance(ps.length), before = new Map(ps.map(p => [p.id, p.coins]));
  const choices = new Map(ps.map(p => [p.id, room.choices.get(p.id) || { action: 'cooperate', target: null, ally: null, power: 'none', automatic: true }]));
  const allied = (a, b) => choices.get(a)?.ally === b && choices.get(b)?.ally === a;
  const logs = [], guards = new Set();
  for (const p of ps) {
    const c = choices.get(p.id);
    if (c.power !== 'none' && p.charges > 0) {
      p.charges--;
      if (c.power === 'shell') p.shields = Math.min(3, p.shields + 1);
      if (c.power === 'windfall') p.coins += 5;
    }
    if (c.action === 'protect') { guards.add(c.target); p.coins += 2; }
    if (c.action === 'cooperate') p.coins += b.cooperative;
  }
  if (ps.every(p => choices.get(p.id).action === 'cooperate')) {
    ps.forEach(p => p.coins += 2); logs.push('Todo mundo cooperou: +2 para cada pato.');
  }
  for (const p of ps) {
    const c = choices.get(p.id);
    if (allied(p.id, c.ally)) p.coins += 2;
  }
  // Aggregate demands before transfers: collisions share the victim's budget fairly.
  for (const victim of ps) {
    const attackers = ps.filter(p => { const c = choices.get(p.id); return c.action === 'steal' && c.target === victim.id; });
    if (!attackers.length) continue;
    if (guards.has(victim.id) || victim.shields > 0) {
      if (!guards.has(victim.id)) victim.shields--;
      attackers.forEach(p => p.coins = Math.max(0, p.coins - 2));
      logs.push(`${victim.name} bloqueou ${attackers.length} roubo(s).`); continue;
    }
    const budget = Math.min(victim.coins, b.steal * attackers.length), each = Math.floor(budget / attackers.length);
    // Remainder stays with the victim, avoiding player-order advantages.
    victim.coins -= each * attackers.length;
    for (const a of attackers) {
      a.coins += each;
      if (allied(a.id, victim.id)) { a.coins = Math.max(0, a.coins - 4); logs.push(`${a.name} traiu uma aliança: multa de 4.`); }
    }
    logs.push(`${victim.name} perdeu ${each * attackers.length} em roubos.`);
  }
  const event = EVENTS[eventIndex], poorest = Math.min(...ps.map(p => p.coins));
  for (const [i, p] of ps.entries()) {
    const c = choices.get(p.id);
    if (event.id === 'rain') p.coins += 3;
    if (event.id === 'festival' && c.action === 'cooperate') p.coins += 4;
    if (event.id === 'tax') p.coins -= 2;
    if (event.id === 'storm') { if (p.shields) p.shields--; else p.coins -= 3; }
    if (event.id === 'justice' && c.action === 'steal') p.coins -= 4;
    if (event.id === 'gift' && i === luckyIndex) p.coins += 8;
    if (event.id === 'balance' && p.coins === poorest) p.coins += 5;
    if (event.id === 'shield') p.shields = Math.min(3, p.shields + 1);
    if (event.id === 'alliance' && allied(p.id, c.ally)) p.coins += 3;
    if (event.id === 'guard' && c.action === 'protect') p.coins += 4;
    if (event.id === 'recharge') p.charges = Math.min(2, p.charges + 1);
    p.coins = Math.max(0, p.coins);
  }
  return { round: room.round, event, logs, lucky: event.id === 'gift' ? ps[luckyIndex].name : null,
    rows: ps.map(p => ({ id: p.id, name: p.name, ...choices.get(p.id), delta: p.coins - before.get(p.id), coins: p.coins })) };
}
