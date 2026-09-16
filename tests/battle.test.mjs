import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run the production hook with deterministic state, timers, audio, and Firestore.
// No real account or database is used by these regression tests.
const source = readFileSync(new URL('../src/hooks/useBattle.js', import.meta.url), 'utf8');
const stateNames = [...source.matchAll(/const \[(\w+)(?:,\s*\w+)?\] = useState/g)].map(m => m[1]);
const unit = (props = {}) => ({ name: 'unit', cardType: 'character', hp: 5, power: 2, cost: 0, ...props });
const magic = (props = {}) => unit({ name: 'spell', cardType: 'magic', ...props });
const player = (props = {}) => ({ hp: 20, maxHp: 20, hand: [], deck: [], field: [], graveyard: [], ...props });

function mount({ remote = false, host = {}, guest = {}, local = {}, turn = 'host' } = {}) {
  const states = [], refs = [], effects = [];
  let si = 0, ri = 0, ei = 0, scheduled = false, now = 0, nextTimer = 0, mounted = true;
  const timers = new Map();
  const writes = [];
  const roomData = { players: { host: player(host), guest: player(guest) }, status: 'playing', currentTurn: turn, turnCount: 1 };
  const args = { isPvP: remote, roomId: 'test', myRole: 'host', roomData, triggerPopup() {} };
  const context = vm.createContext({
    console, Math,
    useState(initial) {
      const i = si++;
      if (!(i in states)) states[i] = stateNames[i] in local ? local[stateNames[i]] : initial;
      return [states[i], value => {
        states[i] = typeof value === 'function' ? value(states[i]) : value;
        if (!scheduled) { scheduled = true; queueMicrotask(render); }
      }];
    },
    useRef(initial) { const i = ri++; return refs[i] ||= { current: initial }; },
    useEffectEvent(fn) { return fn; },
    useEffect(fn, deps) {
      const i = ei++;
      // Local fixtures replace only randomized initial dealing.
      if (fn.toString().includes('const pDeck =')) return;
      const previous = effects[i];
      if (!previous || !deps || deps.some((v, j) => !Object.is(v, previous.deps?.[j]))) {
        effects[i] = { deps, fn, pending: true, cleanup: previous?.cleanup };
      }
    },
    setTimeout(fn, delay = 0) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    playSE() {}, bgmManager: { play() {}, stop() {} }, db: {},
    doc() { return {}; }, collection() {}, query() {}, where() {},
    async getDocs() { return { empty: true }; },
    async updateDoc(_ref, updates) { writes.push(structuredClone(updates)); },
  });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace('export function useBattle', 'function useBattle') + '\nthis.hook = useBattle;', context);
  let value;
  function render() {
    if (!mounted) return;
    scheduled = false; si = 0; ri = 0; ei = 0;
    value = context.hook(args);
    for (const effect of effects) if (effect?.pending) {
      effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.fn();
    }
  }
  render();
  return {
    get battle() { return value; }, writes, roomData,
    async settle() {
      for (let i = 0; i < 300; i++) {
        for (let j = 0; j < 20; j++) await Promise.resolve();
        if (!timers.size) return;
        const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        timers.delete(id); now = timer.at; timer.fn();
      }
      throw new Error('Battle failed to settle');
    },
    unmount() { mounted = false; for (const effect of effects) effect?.cleanup?.(); },
  };
}

for (const remote of [false, true]) {
  test(`targeted ally buff survives card resolution (${remote ? 'PvP' : 'CPU'})`, async () => {
    const hand = [magic({ effectType: 'buff_power_single_ally', effectValue: 3 })];
    const field = [unit()];
    const game = mount({ remote, host: { hand, field }, local: { localPlayerHand: hand, localPlayerField: field } });
    game.battle.playCard(0);
    await game.settle();
    await game.battle.handleSelectAttacker(0);
    await game.settle();
    assert.equal(remote ? game.writes.at(-1)['players.host.field'][0].power : game.battle.playerField[0].power, 5);
    assert.equal(field[0].power, 2, 'original card must stay immutable');
  });
}

test('HP is not spent when a targeted spell has no valid target', async () => {
  const game = mount({ local: { localPlayerHand: [magic({ costType: 'hp', cost: 3, effectType: 'destroy_single_enemy' })] } });
  game.battle.playCard(0);
  await game.settle();
  assert.equal(game.battle.playerLife, 20);
  assert.equal(game.battle.playerHand.length, 1);
});

test('HP draw spell pays its cost exactly once', async () => {
  const game = mount({ local: { localPlayerHand: [magic({ costType: 'hp', cost: 3, effectType: 'draw_card', effectValue: 1 })], localPlayerDeck: [unit()] } });
  const action = game.battle.playCard(0);
  await game.settle(); await action;
  assert.equal(game.battle.playerLife, 17);
  assert.equal(game.battle.playerMaxLife, 17);
  assert.equal(game.battle.playerHand.length, 1);
});

test('five gold cards win PvP after drawing', async () => {
  const game = mount({ remote: true, host: { hand: [magic({ effectType: 'draw_card', effectValue: 1 }), ...Array.from({ length: 4 }, () => unit({ name: '黄金' }))], deck: [unit({ name: '黄金' })] } });
  await game.battle.playCard(0);
  assert.equal(game.writes.at(-1).winner, 'host');
});

test('area damage resolves death effects and victory', async () => {
  const game = mount({ remote: true, host: { hp: 2, hand: [magic({ effectType: 'damage_all_enemies', effectValue: 10 })] }, guest: { field: [unit({ trigger: 'death', effectType: 'damage_enemy_player', effectValue: 3 })] } });
  await game.battle.playCard(0);
  const write = game.writes.at(-1);
  assert.equal(write['players.guest.graveyard'].length, 1);
  assert.equal(write.winner, 'guest');
});

test('combat attack effect can end PvP', async () => {
  const game = mount({ remote: true, host: { field: [unit({ trigger: 'attack', effectType: 'damage_enemy_player', effectValue: 20 })] }, guest: { field: [unit()] } });
  game.battle.handleSelectAttacker(0); await game.settle();
  await game.battle.handleFightMinion(0);
  assert.equal(game.writes.at(-1).winner, 'host');
});

test('direct attack adds damage to its attack effect', async () => {
  const game = mount({ local: { localPlayerField: [unit({ trigger: 'attack', effectType: 'damage_enemy_player', effectValue: 3 })] } });
  game.battle.handleSelectAttacker(0); await game.settle();
  await game.battle.handleDirectAttack(); await game.settle();
  assert.equal(game.battle.enemyLife, 15);
});

test('opponent cannot end the active PvP turn', async () => {
  const game = mount({ remote: true, turn: 'guest' });
  await game.battle.endPlayerTurn();
  assert.equal(game.writes.length, 0);
});

test('CPU draw is committed even when no card is playable', async () => {
  const game = mount({ local: { localEnemyDeck: [unit({ cost: 99 })] } });
  const action = game.battle.endPlayerTurn();
  await game.settle(); await action;
  assert.equal(game.battle.enemyDeck.length, 0);
  assert.equal(game.battle.enemyHand.length, 2);
  assert.equal(game.battle.isPlayerTurn, true);
});

test('CPU recycling removes grave cards and applies fatigue', async () => {
  const game = mount({ local: { localEnemyGrave: [unit({ cost: 99, hp: 0, originalHp: 5 })] } });
  const action = game.battle.endPlayerTurn();
  await game.settle(); await action;
  assert.equal(game.battle.enemyLife, 15);
  assert.equal(game.battle.enemyGrave.length, 0);
  assert.equal(game.battle.enemyHand[0].hp, 5);
});

test('CPU can cast zero-cost magic and preserves its effect', async () => {
  const game = mount({ local: { localEnemyHand: [magic({ effectType: 'damage_enemy_player', effectValue: 4 })] } });
  const action = game.battle.endPlayerTurn();
  await game.settle(); await action;
  assert.equal(game.battle.playerLife, 16);
  assert.equal(game.battle.enemyGrave.length, 1);
});

test('CPU stops after lethal damage', async () => {
  const game = mount({ local: { localPlayerLife: 1, localEnemyField: [unit(), unit()] } });
  const action = game.battle.endPlayerTurn();
  await game.settle(); await action;
  assert.equal(game.battle.gameState, 'lose');
  assert.equal(game.battle.isPlayerTurn, false);
});

test('attack buff changes combat damage without being overwritten', async () => {
  const game = mount({ local: {
    localPlayerField: [unit({ trigger: 'attack', effectType: 'buff_all_allies', effectValue: 3 })],
    localEnemyField: [unit({ hp: 9, power: 1 })],
  } });
  await game.battle.handleSelectAttacker(0); await game.settle();
  await game.battle.handleFightMinion(0); await game.settle();
  assert.equal(game.battle.playerField[0].power, 5);
  assert.equal(game.battle.playerField[0].hp, 7);
  assert.equal(game.battle.enemyField[0].hp, 4);
});

test('simultaneous actions cannot double-play the same card', async () => {
  const game = mount({ remote: true, host: { hand: [unit()] } });
  await Promise.all([game.battle.playCard(0), game.battle.playCard(0)]);
  assert.equal(game.writes.length, 1);
});

test('leaving a battle cancels CPU actions after its pending delay', async () => {
  const game = mount({ local: { localEnemyField: [unit()] } });
  const action = game.battle.endPlayerTurn();
  game.unmount();
  await game.settle(); await action;
  assert.equal(game.battle.playerLife, 20);
});
