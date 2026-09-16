// src/hooks/useBattle.js
import { useState, useEffect, useEffectEvent, useRef } from 'react';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { playSE } from '../utils/audioManager';

const MANA_CARD = { name: "マナ結晶", cardType: "mana", effectText: "コスト用", image: "img/mana.png", isMana: true };
const TARGETED_EFFECTS = [
    "damage_single_enemy",
    "destroy_single_enemy",
    "buff_single_ally",
    "buff_power_single_ally", // 追加: 単体の攻撃力アップ
    "buff_hp_single_ally"     // 追加: 単体の体力アップ
];
const BATTLE_CONFIG = {
    INITIAL_LIFE: 20,          // 初期HP
    MAX_HAND_SIZE: 10,         // 手札の最大枚数
    MAX_FIELD_SIZE: 4,         // フィールドに出せる最大枚数
    FATIGUE_DAMAGE: 5,         // 山札切れ時のペナルティダメージ
    GOLD_WIN_COUNT: 5,         // 特殊勝利に必要な「黄金」の枚数
    INITIAL_DRAW_PLAYER: 3,    // 先攻の初期手札ドロー数
    INITIAL_DRAW_ENEMY: 4      // 後攻の初期手札ドロー数
};

// シャッフル済みのデッキから初期手札を取り出す。デッキ枚数が不足していても安全に動作する。
const drawInitialHand = (deck, drawCount) => deck.splice(0, drawCount);

const processDraw = (drawCount, currentDeck, currentHand, currentGrave, currentLife) => {
    let d = [...currentDeck];
    let h = [...currentHand];
    let g = [...currentGrave];
    let life = currentLife;

    for (let i = 0; i < drawCount; i++) {
        if (d.length === 0) {
            const nonManaGrave = g.filter(c => !c.isMana);
            if (nonManaGrave.length === 0) break;
            life -= BATTLE_CONFIG.FATIGUE_DAMAGE;
            // 🌟 墓地からデッキに戻る際に、HPと攻撃力を元の状態にリセットする
            d = nonManaGrave.map(c => {
                let resetCard = { ...c };
                if (resetCard.originalHp !== undefined) resetCard.hp = resetCard.originalHp;
                if (resetCard.originalPower !== undefined) resetCard.power = resetCard.originalPower;
                resetCard.hasAttacked = false;
                return resetCard;
            }).sort(() => Math.random() - 0.5);
            g = g.filter(c => c.isMana);
        }
        playSE('ドロー'); // 🌟 修正：カードを引く音を再生
        // 🌟 修正：「カードを引く処理」を for ループの【中】に入れました！
        if (d.length > 0) {
            const drawnCard = d.shift();
            if (h.length < BATTLE_CONFIG.MAX_HAND_SIZE) h.push(drawnCard);
            else if (!drawnCard.isMana) g.push(drawnCard);
        }
    }
    return { d, h, g, life };
};

export function useBattle({ isPvP, roomId, myRole, roomData, playerDeckData, enemyDeckData, triggerPopup }) {
    const [localPlayerMaxLife, setLocalPlayerMaxLife] = useState(BATTLE_CONFIG.INITIAL_LIFE);
    const [localEnemyMaxLife, setLocalEnemyMaxLife] = useState(BATTLE_CONFIG.INITIAL_LIFE);
    const [localPlayerLife, setLocalPlayerLife] = useState(BATTLE_CONFIG.INITIAL_LIFE);
    const [localEnemyLife, setLocalEnemyLife] = useState(BATTLE_CONFIG.INITIAL_LIFE);
    const [localPlayerDeck, setLocalPlayerDeck] = useState([]);
    const [localPlayerHand, setLocalPlayerHand] = useState([]);
    const [localPlayerField, setLocalPlayerField] = useState([]);
    const [localEnemyDeck, setLocalEnemyDeck] = useState([]);
    const [localEnemyHand, setLocalEnemyHand] = useState([]);
    const [localEnemyField, setLocalEnemyField] = useState([]);
    const [localIsPlayerTurn, setLocalIsPlayerTurn] = useState(true);
    const [localGameState, setLocalGameState] = useState('playing');
    const [localPlayerGrave, setLocalPlayerGrave] = useState([]);
    const [localEnemyGrave, setLocalEnemyGrave] = useState([]);

    const [selectedAttackerIdx, setSelectedAttackerIdx] = useState(null);
    const [pendingTarget, setPendingTarget] = useState(null);
    const [pendingPeeping] = useState(false);
    const [pendingCpuStart, setPendingCpuStart] = useState(false);
    const localStateRef = useRef(null);
    const actionInFlight = useRef(false);
    const performAction = async (action, ...args) => {
        if (actionInFlight.current) return;
        actionInFlight.current = true;
        try { return await action(...args); }
        finally { actionInFlight.current = false; }
    };
    useEffect(() => {
        localStateRef.current = {
            localPlayerMaxLife, localEnemyMaxLife, localPlayerLife, localEnemyLife,
            localPlayerDeck, localPlayerHand, localPlayerField, localPlayerGrave,
            localEnemyDeck, localEnemyHand, localEnemyField, localEnemyGrave,
            localGameState,
        };
    });
    useEffect(() => () => { localStateRef.current = null; }, []);

    const useRemote = isPvP && roomData?.players?.host && roomData?.players?.guest;
    const enemyRole = myRole === 'host' ? 'guest' : 'host';
    const myPath = `players.${myRole}`;
    const enemyPath = `players.${enemyRole}`;
    const myData = useRemote ? roomData.players[myRole] : null;
    const enemyData = useRemote ? roomData.players[enemyRole] : null;

    const playerLife = useRemote ? myData.hp : localPlayerLife;
    const playerMaxLife = useRemote ? myData.maxHp : localPlayerMaxLife;
    const playerDeck = useRemote ? (myData.deck || []) : localPlayerDeck;
    const playerHand = useRemote ? (myData.hand || []) : localPlayerHand;
    const playerField = useRemote ? (myData.field || []) : localPlayerField;
    const playerGrave = useRemote ? (myData.graveyard || []) : localPlayerGrave;

    const enemyLife = useRemote ? enemyData.hp : localEnemyLife;
    const enemyMaxLife = useRemote ? enemyData.maxHp : localEnemyMaxLife;
    const enemyDeck = useRemote ? (enemyData.deck || []) : localEnemyDeck;
    const enemyHand = useRemote ? (enemyData.hand || []) : localEnemyHand;
    const enemyField = useRemote ? (enemyData.field || []) : localEnemyField;
    const enemyGrave = useRemote ? (enemyData.graveyard || []) : localEnemyGrave;

    const isPlayerTurn = isPvP ? Boolean(useRemote && roomData.currentTurn === myRole && roomData.status === 'playing') : localIsPlayerTurn;
    const gameState = useRemote
        ? (roomData.status === 'finished' ? (roomData.winner === myRole ? 'win' : 'lose') : 'playing')
        : localGameState;
    // 🤖 【CPU専用】効果処理
    const executeSkillLocal = async (card, isPlayerContext) => {
        if (!card.effectType || card.effectType === "none") return;
        if (!localStateRef.current) return;
        const {
            localPlayerMaxLife, localEnemyMaxLife, localPlayerDeck, localPlayerHand,
            localPlayerField, localEnemyDeck, localEnemyHand, localEnemyField,
            localPlayerGrave, localEnemyGrave, localPlayerLife, localEnemyLife,
        } = localStateRef.current;
        const val = card.effectValue || 0;

        switch (card.effectType) {
            case 'draw_card': {
                const result = processDraw(val,
                    isPlayerContext ? localPlayerDeck : localEnemyDeck,
                    isPlayerContext ? localPlayerHand : localEnemyHand,
                    isPlayerContext ? localPlayerGrave : localEnemyGrave,
                    isPlayerContext ? localPlayerLife : localEnemyLife);
                if (isPlayerContext) {
                    setLocalPlayerDeck(result.d); setLocalPlayerHand(result.h);
                    setLocalPlayerGrave(result.g); setLocalPlayerLife(result.life);
                } else {
                    setLocalEnemyDeck(result.d); setLocalEnemyHand(result.h);
                    setLocalEnemyGrave(result.g); setLocalEnemyLife(result.life);
                }
                break;
            }
            case 'damage_all_enemies': {
                const setField = isPlayerContext ? setLocalEnemyField : setLocalPlayerField;
                setField(f => f.map(c => ({ ...c, hp: c.hp - val })));
                break;
            }
            case 'buff_power_all_allies':
            case 'buff_hp_all_allies':
            case 'buff_power_single_ally':
            case 'buff_hp_single_ally': {
                const setField = isPlayerContext ? setLocalPlayerField : setLocalEnemyField;
                const field = isPlayerContext ? localPlayerField : localEnemyField;
                const idx = Math.floor(Math.random() * field.length);
                const stat = card.effectType.includes('power') ? 'power' : 'hp';
                setField(f => f.map((c, i) => card.effectType.includes('all_allies') || i === idx
                    ? { ...c, [stat]: (c[stat] || 0) + val } : c));
                break;
            }
            case "gain_mana":
                triggerPopup(`マナ結晶を${val}枚獲得`);
                if (isPlayerContext) {
                    setLocalPlayerHand(curr => {
                        let n = [...curr];
                        for (let i = 0; i < val; i++) if (n.length < BATTLE_CONFIG.MAX_HAND_SIZE) n.push(JSON.parse(JSON.stringify(MANA_CARD)));
                        return n;
                    });
                } else {
                    setLocalEnemyHand(curr => {
                        let n = [...curr];
                        for (let i = 0; i < val; i++) if (n.length < BATTLE_CONFIG.MAX_HAND_SIZE) n.push(JSON.parse(JSON.stringify(MANA_CARD)));
                        return n;
                    });
                }
                playSE('マナ獲得'); // 🌟 修正：マナ獲得音を再生
                break;
            case "heal_player":
                if (isPlayerContext) setLocalPlayerLife(p => Math.min(localPlayerMaxLife, p + val));
                else setLocalEnemyLife(p => Math.min(localEnemyMaxLife, p + val));
                playSE('回復'); // 🌟 修正：回復音を再生
                break;
            case "damage_enemy_player":
                triggerPopup(`相手に${val}ダメージ`);
                playSE('ダメージ'); // 🌟 修正：ダメージ音を再生
                if (isPlayerContext) setLocalEnemyLife(p => Math.max(0, p - val));
                else setLocalPlayerLife(p => Math.max(0, p - val));
                break;
            case "buff_all_allies":
                triggerPopup(`味方全体を強化`);
                if (isPlayerContext) setLocalPlayerField(f => f.map(c => ({ ...c, power: (c.power || 0) + val, hp: (c.hp || 0) + val })));
                else setLocalEnemyField(f => f.map(c => ({ ...c, power: (c.power || 0) + val, hp: (c.hp || 0) + val })));
                playSE('強化'); // 🌟 修正：強化音を再生
                break;
            case "increase_max_hp":
                if (isPlayerContext) { setLocalPlayerMaxLife(p => p + val); }
                else { setLocalEnemyMaxLife(p => p + val); }
                triggerPopup(`最大HPが${val}増加`);
                playSE('マナ回復'); // 🌟 修正：マナ回復音を再生
                break;
            case "search_card_to_hand": {
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;
                if (isPlayerContext) {
                    const matchIdx = localPlayerDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && localPlayerHand.length < BATTLE_CONFIG.MAX_HAND_SIZE) {
                        triggerPopup(`デッキから[${targetName}]を手札に追加`);
                        const foundCard = localPlayerDeck[matchIdx];
                        setLocalPlayerDeck(localPlayerDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5));
                        setLocalPlayerHand(prev => [...prev, foundCard]);
                        playSE('ドロー'); // 🌟 修正：カードを引く音を再生
                    } else { triggerPopup(`対象のカードがデッキにありません`); }
                } else {
                    const matchIdx = localEnemyDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && localEnemyHand.length < BATTLE_CONFIG.MAX_HAND_SIZE) {
                        playSE('ドロー'); // 🌟 修正：カードを引く音を再生
                        triggerPopup(`相手がデッキからカードをサーチ`);
                        const foundCard = localEnemyDeck[matchIdx];
                        setLocalEnemyDeck(localEnemyDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5));
                        setLocalEnemyHand(prev => [...prev, foundCard]);
                    }
                }
                break;
            }
            case "recruit_card_to_field": {
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;
                if (isPlayerContext) {
                    const matchIdx = localPlayerDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && localPlayerField.length < BATTLE_CONFIG.MAX_FIELD_SIZE) {
                        triggerPopup(`デッキから[${targetName}]をフィールドに召喚`);
                        const foundCard = localPlayerDeck[matchIdx];
                        setLocalPlayerDeck(localPlayerDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5));
                        playSE('カード設置'); // 🌟 修正：カードをフィールドに設置する音を再生
                        setLocalPlayerField(prev => [...prev, { ...foundCard, hasAttacked: true, originalHp: foundCard.originalHp ?? foundCard.hp, originalPower: foundCard.originalPower ?? foundCard.power }]);
                    } else { triggerPopup(`召喚に失敗しました`); }
                } else {
                    const matchIdx = localEnemyDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && localEnemyField.length < BATTLE_CONFIG.MAX_FIELD_SIZE) {
                        triggerPopup(`相手がデッキから[${targetName}]をフィールドに召喚`);
                        const foundCard = localEnemyDeck[matchIdx];
                        setLocalEnemyDeck(localEnemyDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5));
                        playSE('カード設置'); // 🌟 修正：カードをフィールドに設置する音を再生
                        setLocalEnemyField(prev => [...prev, { ...foundCard, hasAttacked: true, originalHp: foundCard.originalHp ?? foundCard.hp, originalPower: foundCard.originalPower ?? foundCard.power }]);
                    }
                }
                break;
            }
            case "generate_card_to_hand": {
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;
                try {
                    const q = query(collection(db, "cards"), where("name", "==", targetName));
                    const snap = await getDocs(q);
                        if (!snap.empty) {
                            const generatedCard = { ...snap.docs[0].data() };
                            if (!localStateRef.current || localStateRef.current.localGameState !== 'playing') return;
                            const setHand = isPlayerContext ? setLocalPlayerHand : setLocalEnemyHand;
                            setHand(prev => prev.length < BATTLE_CONFIG.MAX_HAND_SIZE ? [...prev, generatedCard] : prev);
                        }
                } catch (error) { console.error(error); }
                break;
            }
            case "discard_all_hand":
                if (isPlayerContext) {
                    if (localPlayerHand.length === 0) break;
                    triggerPopup("手札をすべて墓地へ送る");
                    setLocalPlayerGrave(prev => [...prev, ...localPlayerHand.filter(c => !c.isMana)]);
                    setLocalPlayerHand([]);
                } else {
                    if (localEnemyHand.length === 0) break;
                    triggerPopup("相手は手札をすべて墓地へ送る");
                    setLocalEnemyGrave(prev => [...prev, ...localEnemyHand.filter(c => !c.isMana)]);
                    setLocalEnemyHand([]);
                }
                break;
            case "discard_random": {
                const count = val || 1;
                if (isPlayerContext) {
                    if (localEnemyHand.length === 0) break;
                    let newHand = [...localEnemyHand]; let disc = [];
                    for (let i = 0; i < count && newHand.length > 0; i++) disc.push(newHand.splice(Math.floor(Math.random() * newHand.length), 1)[0]);
                    setLocalEnemyHand(newHand); setLocalEnemyGrave(prev => [...prev, ...disc.filter(c => !c.isMana)]);
                    triggerPopup(`相手の手札をランダムに${disc.length}枚破壊`);
                } else {
                    if (localPlayerHand.length === 0) break;
                    let newHand = [...localPlayerHand]; let disc = [];
                    for (let i = 0; i < count && newHand.length > 0; i++) disc.push(newHand.splice(Math.floor(Math.random() * newHand.length), 1)[0]);
                    setLocalPlayerHand(newHand); setLocalPlayerGrave(prev => [...prev, ...disc.filter(c => !c.isMana)]);
                    triggerPopup(`手札がランダムに${disc.length}枚破壊された`);
                }
                break;
            }
            // 🌟 追加: 破壊・ダメージなどの対象指定効果のAI処理（ランダム対象として機能させる）
            case "destroy_single_enemy":
                if (isPlayerContext) {
                    setLocalEnemyField(prev => {
                        if (prev.length === 0) return prev;
                        let n = prev.map(c => ({ ...c })); const idx = Math.floor(Math.random() * n.length);
                        triggerPopup(`[${card.name}]の効果！相手の[${n[idx].name}]を破壊！`);
                        n[idx].hp = 0; return n;
                    });
                } else {
                    setLocalPlayerField(prev => {
                        if (prev.length === 0) return prev;
                        let n = prev.map(c => ({ ...c })); const idx = Math.floor(Math.random() * n.length);
                        triggerPopup(`相手の[${card.name}]が味方の[${n[idx].name}]を破壊！`);
                        n[idx].hp = 0; return n;
                    });
                }
                break;
            case "damage_single_enemy":
                if (isPlayerContext) {
                    setLocalEnemyField(prev => {
                        if (prev.length === 0) return prev;
                        let n = prev.map(c => ({ ...c })); const idx = Math.floor(Math.random() * n.length);
                        triggerPopup(`[${card.name}]の効果！[${n[idx].name}]に${val}ダメージ！`);
                        n[idx].hp -= val; return n;
                    });
                } else {
                    setLocalPlayerField(prev => {
                        if (prev.length === 0) return prev;
                        let n = prev.map(c => ({ ...c })); const idx = Math.floor(Math.random() * n.length);
                        triggerPopup(`相手が味方の[${n[idx].name}]に${val}ダメージ！`);
                        n[idx].hp -= val; return n;
                    });
                }
                break;
            case "buff_single_ally":
                if (isPlayerContext) {
                    setLocalPlayerField(prev => {
                        if (prev.length === 0) return prev;
                        let n = prev.map(c => ({ ...c })); const idx = Math.floor(Math.random() * n.length);
                        triggerPopup(`[${card.name}]の効果！味方の[${n[idx].name}]を強化`);
                        n[idx].power += val; n[idx].hp += val; return n;
                    });
                } else {
                    setLocalEnemyField(prev => {
                        if (prev.length === 0) return prev;
                        let n = prev.map(c => ({ ...c })); const idx = Math.floor(Math.random() * n.length);
                        triggerPopup(`相手が[${n[idx].name}]を強化！`);
                        n[idx].power += val; n[idx].hp += val; return n;
                    });
                }
                break;
            default: break;
        }
    };

    // 🌐 【PvP専用】効果処理
    const executeSkillPvP = async (card, isPlayerContext, updates) => {
        if (!card.effectType || card.effectType === "none") return;
        const val = card.effectValue || 0;
        const mPath = isPlayerContext ? myPath : enemyPath;
        const ePath = isPlayerContext ? enemyPath : myPath;

        const getVal = (path, fallback) => updates[path] !== undefined ? updates[path] : fallback;

        switch (card.effectType) {
            case "gain_mana": {
                let hand = [...getVal(`${mPath}.hand`, isPlayerContext ? playerHand : enemyHand)];
                for (let i = 0; i < val; i++) if (hand.length < BATTLE_CONFIG.MAX_HAND_SIZE) hand.push(JSON.parse(JSON.stringify(MANA_CARD)));
                updates[`${mPath}.hand`] = hand;
                triggerPopup(`マナ結晶を${val}枚獲得`);
                break;
            }
            case "heal_player": {
                let maxHp = getVal(`${mPath}.maxHp`, isPlayerContext ? playerMaxLife : enemyMaxLife);
                let hp = getVal(`${mPath}.hp`, isPlayerContext ? playerLife : enemyLife);
                updates[`${mPath}.hp`] = Math.min(maxHp, hp + val);
                break;
            }
            case "damage_enemy_player": {
                let eHp = getVal(`${ePath}.hp`, isPlayerContext ? enemyLife : playerLife);
                updates[`${ePath}.hp`] = Math.max(0, eHp - val);
                triggerPopup(`相手に${val}ダメージ`);
                break;
            }
            // 🌟 以下の4つのケースを追加
            case "buff_all_allies": {
                const field = getVal(`${mPath}.field`, isPlayerContext ? playerField : enemyField);
                updates[`${mPath}.field`] = field.map(c => ({ ...c, power: (c.power || 0) + val, hp: (c.hp || 0) + val }));
                break;
            }
            case "damage_single_enemy":
            case "destroy_single_enemy": {
                const field = [...getVal(`${ePath}.field`, isPlayerContext ? enemyField : playerField)];
                if (field.length > 0) {
                    const idx = Math.floor(Math.random() * field.length);
                    field[idx] = { ...field[idx], hp: card.effectType === 'destroy_single_enemy' ? 0 : field[idx].hp - val };
                    updates[`${ePath}.field`] = field;
                }
                break;
            }
            case "buff_single_ally": {
                const field = [...getVal(`${mPath}.field`, isPlayerContext ? playerField : enemyField)];
                if (field.length > 0) {
                    const idx = Math.floor(Math.random() * field.length);
                    field[idx] = { ...field[idx], hp: (field[idx].hp || 0) + val, power: (field[idx].power || 0) + val };
                    updates[`${mPath}.field`] = field;
                }
                break;
            }
            case "buff_power_all_allies": {
                let field = [...getVal(`${mPath}.field`, isPlayerContext ? playerField : enemyField)];
                updates[`${mPath}.field`] = field.map(c => ({ ...c, power: (c.power || 0) + val }));
                triggerPopup(`味方全体の攻撃力を強化`);
                break;
            }
            case "buff_hp_all_allies": {
                let field = [...getVal(`${mPath}.field`, isPlayerContext ? playerField : enemyField)];
                updates[`${mPath}.field`] = field.map(c => ({ ...c, hp: (c.hp || 0) + val }));
                triggerPopup(`味方全体の体力を強化`);
                break;
            }
            case "buff_power_single_ally": {
                let field = [...getVal(`${mPath}.field`, isPlayerContext ? playerField : enemyField)];
                if (field.length > 0) {
                    const idx = Math.floor(Math.random() * field.length);
                    triggerPopup(isPlayerContext ? `[${card.name}]の効果！味方の[${field[idx].name}]の攻撃力を強化` : `相手が[${field[idx].name}]の攻撃力を強化！`);
                    field[idx] = { ...field[idx], power: (field[idx].power || 0) + val };
                    updates[`${mPath}.field`] = field;
                }
                break;
            }
            case "buff_hp_single_ally": {
                let field = [...getVal(`${mPath}.field`, isPlayerContext ? playerField : enemyField)];
                if (field.length > 0) {
                    const idx = Math.floor(Math.random() * field.length);
                    triggerPopup(isPlayerContext ? `[${card.name}]の効果！味方の[${field[idx].name}]の体力を強化` : `相手が[${field[idx].name}]の体力を強化！`);
                    field[idx] = { ...field[idx], hp: (field[idx].hp || 0) + val };
                    updates[`${mPath}.field`] = field;
                }
                break;
            }
            case "increase_max_hp": {
                let maxHp = getVal(`${mPath}.maxHp`, isPlayerContext ? playerMaxLife : enemyMaxLife);
                updates[`${mPath}.maxHp`] = maxHp + val;
                break;
            }
            case "search_card_to_hand": {
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;
                let deck = [...getVal(`${mPath}.deck`, isPlayerContext ? playerDeck : enemyDeck)];
                let hand = [...getVal(`${mPath}.hand`, isPlayerContext ? playerHand : enemyHand)];
                const matchIdx = deck.findIndex(c => c.name === targetName);
                if (matchIdx !== -1 && hand.length < BATTLE_CONFIG.MAX_HAND_SIZE) {
                    hand.push(deck[matchIdx]);
                    deck = deck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5);
                    updates[`${mPath}.deck`] = deck;
                    updates[`${mPath}.hand`] = hand;
                    triggerPopup(isPlayerContext ? `デッキから[${targetName}]を手札に追加` : `相手がデッキからカードをサーチ`);
                }
                break;
            }
            case "recruit_card_to_field": {
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;
                let deck = [...getVal(`${mPath}.deck`, isPlayerContext ? playerDeck : enemyDeck)];
                let field = [...getVal(`${mPath}.field`, isPlayerContext ? playerField : enemyField)];
                const matchIdx = deck.findIndex(c => c.name === targetName);

                // フィールドの空きが4枠未満（つまり出せる空きがある）なら召喚
                if (matchIdx !== -1 && field.length < BATTLE_CONFIG.MAX_FIELD_SIZE) {
                    field.push({
                        ...deck[matchIdx],
                        hasAttacked: true, // 召喚酔い
                        originalHp: deck[matchIdx].originalHp ?? deck[matchIdx].hp,
                        originalPower: deck[matchIdx].originalPower ?? deck[matchIdx].power
                    });

                    // デッキから対象カードを抜いてシャッフル
                    deck = deck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5);

                    updates[`${mPath}.deck`] = deck;
                    updates[`${mPath}.field`] = field;
                    triggerPopup(isPlayerContext ? `デッキから[${targetName}]をフィールドに召喚` : `相手がデッキから[${targetName}]をフィールドに召喚`);
                } else if (matchIdx === -1) {
                    if (isPlayerContext) triggerPopup(`対象のカードがデッキにありません`);
                } else {
                    if (isPlayerContext) triggerPopup(`フィールドが満杯で召喚できません`);
                }
                break;
            }
            case "generate_card_to_hand": {
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;
                let hand = [...getVal(`${mPath}.hand`, isPlayerContext ? playerHand : enemyHand)];
                if (hand.length < BATTLE_CONFIG.MAX_HAND_SIZE) {
                    try {
                        const q = query(collection(db, "cards"), where("name", "==", targetName));
                        const snap = await getDocs(q);
                        if (!snap.empty) {
                            hand.push({ ...snap.docs[0].data() });
                            updates[`${mPath}.hand`] = hand;
                            triggerPopup(isPlayerContext ? `[${targetName}]を手札に生成` : `相手が手札にトークンを生成`);
                        }
                    } catch (error) { console.error(error); }
                }
                break;
            }
            case "discard_all_hand": {
                let hand = [...getVal(`${mPath}.hand`, isPlayerContext ? playerHand : enemyHand)];
                let grave = [...getVal(`${mPath}.graveyard`, isPlayerContext ? playerGrave : enemyGrave)];
                if (hand.length > 0) {
                    grave.push(...hand.filter(c => !c.isMana));
                    updates[`${mPath}.hand`] = [];
                    updates[`${mPath}.graveyard`] = grave;
                    triggerPopup(isPlayerContext ? `手札をすべて墓地へ送る` : `相手は手札をすべて墓地へ送る`);
                }
                break;
            }
            case "discard_random": {
                const count = val || 1;
                let hand = [...getVal(`${ePath}.hand`, isPlayerContext ? enemyHand : playerHand)];
                let grave = [...getVal(`${ePath}.graveyard`, isPlayerContext ? enemyGrave : playerGrave)];
                if (hand.length > 0) {
                    let disc = [];
                    for (let i = 0; i < count && hand.length > 0; i++) {
                        disc.push(hand.splice(Math.floor(Math.random() * hand.length), 1)[0]);
                    }
                    grave.push(...disc.filter(c => !c.isMana));
                    updates[`${ePath}.hand`] = hand;
                    updates[`${ePath}.graveyard`] = grave;
                    triggerPopup(isPlayerContext ? `相手の手札をランダムに${disc.length}枚破壊` : `手札がランダムに${disc.length}枚破壊された`);
                }
                break;
            }
            case "draw_card": {
                let deck = [...getVal(`${mPath}.deck`, isPlayerContext ? playerDeck : enemyDeck)];
                let hand = [...getVal(`${mPath}.hand`, isPlayerContext ? playerHand : enemyHand)];
                let grave = [...getVal(`${mPath}.graveyard`, isPlayerContext ? playerGrave : enemyGrave)];
                let hp = getVal(`${mPath}.hp`, isPlayerContext ? playerLife : enemyLife);
                const res = processDraw(val, deck, hand, grave, hp);
                updates[`${mPath}.deck`] = res.d;
                updates[`${mPath}.hand`] = res.h;
                updates[`${mPath}.graveyard`] = res.g;
                updates[`${mPath}.hp`] = res.life;
                triggerPopup(isPlayerContext ? `${val}枚ドロー！` : `相手が${val}枚ドロー`); // 🌟これを追加
                break;
            }
            case "damage_all_enemies": {
                let field = [...getVal(`${ePath}.field`, isPlayerContext ? enemyField : playerField)];
                updates[`${ePath}.field`] = field.map(c => ({ ...c, hp: c.hp - val }));
                break;
            }
        }
    };

    // 🌐 【PvP専用】死亡判定・連鎖処理
    const processDeathsPvP = async (updates) => {
        let myF = [...(updates[`${myPath}.field`] || playerField)];
        let myG = [...(updates[`${myPath}.graveyard`] || playerGrave)];
        let enF = [...(updates[`${enemyPath}.field`] || enemyField)];
        let enG = [...(updates[`${enemyPath}.graveyard`] || enemyGrave)];

        const myDead = myF.filter(c => c.hp <= 0 && !c.isMana);
        const enDead = enF.filter(c => c.hp <= 0 && !c.isMana);

        if (myDead.length > 0 || enDead.length > 0) {
            updates[`${myPath}.field`] = myF.filter(c => c.hp > 0);
            updates[`${enemyPath}.field`] = enF.filter(c => c.hp > 0);
            updates[`${myPath}.graveyard`] = [...myG, ...myDead];
            updates[`${enemyPath}.graveyard`] = [...enG, ...enDead];

            for (const c of myDead) {
                if (c.trigger === "death") await executeSkillPvP(c, true, updates);
            }
            for (const c of enDead) {
                if (c.trigger === "death") await executeSkillPvP(c, false, updates);
            }
            await processDeathsPvP(updates);
        }
    };

    const notifyBattle = useEffectEvent(triggerPopup);
    const executeDeathSkill = useEffectEvent(executeSkillLocal);

    useEffect(() => {
        if (isPvP) return;

        const pDeck = JSON.parse(JSON.stringify(playerDeckData || []));
        const eDeck = JSON.parse(JSON.stringify(enemyDeckData || []));
        pDeck.sort(() => Math.random() - 0.5);
        eDeck.sort(() => Math.random() - 0.5);

        const isPlayerFirst = Math.random() < 0.5;
        const pHand = drawInitialHand(pDeck, isPlayerFirst ? BATTLE_CONFIG.INITIAL_DRAW_PLAYER : BATTLE_CONFIG.INITIAL_DRAW_ENEMY);
        pHand.push(JSON.parse(JSON.stringify(MANA_CARD)));
        const eHand = drawInitialHand(eDeck, isPlayerFirst ? BATTLE_CONFIG.INITIAL_DRAW_ENEMY : BATTLE_CONFIG.INITIAL_DRAW_PLAYER);
        eHand.push(JSON.parse(JSON.stringify(MANA_CARD)));

        const timer = setTimeout(() => {
            setLocalPlayerMaxLife(BATTLE_CONFIG.INITIAL_LIFE); setLocalEnemyMaxLife(BATTLE_CONFIG.INITIAL_LIFE); setLocalPlayerLife(BATTLE_CONFIG.INITIAL_LIFE); setLocalEnemyLife(BATTLE_CONFIG.INITIAL_LIFE);
            setLocalPlayerDeck(pDeck); setLocalPlayerHand(pHand); setLocalEnemyDeck(eDeck); setLocalEnemyHand(eHand);
            setLocalPlayerField([]); setLocalEnemyField([]); setLocalPlayerGrave([]); setLocalEnemyGrave([]);
            setLocalGameState('playing'); setSelectedAttackerIdx(null); setPendingTarget(null);

            // 🌟 追加：コイントス処理
            setLocalIsPlayerTurn(isPlayerFirst); // ランダムでターン決定
            
            if (isPlayerFirst) {
                notifyBattle("コイントス結果：先攻です！");
            } else {
                notifyBattle("コイントス結果：後攻です（相手のターン）");
                setPendingCpuStart(true); // 後攻ならCPUのターンを予約
            }
        }, 0);
        return () => clearTimeout(timer);
    }, [isPvP, playerDeckData, enemyDeckData]);

    useEffect(() => {
        if (isPvP || localGameState !== 'playing') return;

        // 🌟 金塊の枚数をカウント
        const pGoldCount = localPlayerHand.filter(c => c?.name === "黄金").length;
        const eGoldCount = localEnemyHand.filter(c => c?.name === "黄金").length;

        if (pGoldCount >= 5 || eGoldCount >= 5 || localEnemyLife <= 0 || localPlayerLife <= 0) {
            const timer = setTimeout(() => {
                if (pGoldCount >= 5) {
                    setLocalGameState('win');
                    playSE('勝利');
                    notifyBattle("特殊勝利：黄金を5枚集めた！");
                } else if (eGoldCount >= 5) {
                    setLocalGameState('lose');
                    playSE('敗北');
                    notifyBattle("特殊敗北：相手が黄金を集めきった…");
                } else if (localEnemyLife <= 0) {
                    playSE('勝利');
                    setLocalGameState('win');
                    notifyBattle("YOU WIN");
                } else if (localPlayerLife <= 0) {
                    playSE('敗北');
                    setLocalGameState('lose');
                    notifyBattle("YOU LOSE");
                }
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [isPvP, localPlayerLife, localEnemyLife, localPlayerHand, localEnemyHand, localGameState]);

    useEffect(() => {
        if (isPvP || localGameState !== 'playing') return;
        const deadP = localPlayerField.filter(c => c && c.hp <= 0 && !c.isMana);
        const deadE = localEnemyField.filter(c => c && c.hp <= 0 && !c.isMana);

        if (deadP.length > 0 || deadE.length > 0) {
            const timer = setTimeout(() => {
                if (deadP.length > 0) {
                    playSE('破壊');
                    deadP.forEach(c => { if (c.trigger === "death") executeDeathSkill(c, true); });
                    setLocalPlayerGrave(p => [...p, ...deadP]);
                    setLocalPlayerField(p => p.filter(c => c.hp > 0));
                }
                if (deadE.length > 0) {
                    playSE('破壊');
                    deadE.forEach(c => { if (c.trigger === "death") executeDeathSkill(c, false); });
                    setLocalEnemyGrave(p => [...p, ...deadE]);
                    setLocalEnemyField(p => p.filter(c => c.hp > 0));
                }
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [isPvP, localPlayerField, localEnemyField, localGameState]);

    const commitGameUpdates = async (updates) => {
        if (!isPvP) {
            const setters = {
                [`${myPath}.hp`]: setLocalPlayerLife,
                [`${myPath}.maxHp`]: setLocalPlayerMaxLife,
                [`${myPath}.deck`]: setLocalPlayerDeck,
                [`${myPath}.hand`]: setLocalPlayerHand,
                [`${myPath}.field`]: setLocalPlayerField,
                [`${myPath}.graveyard`]: setLocalPlayerGrave,
                [`${enemyPath}.hp`]: setLocalEnemyLife,
                [`${enemyPath}.maxHp`]: setLocalEnemyMaxLife,
                [`${enemyPath}.deck`]: setLocalEnemyDeck,
                [`${enemyPath}.hand`]: setLocalEnemyHand,
                [`${enemyPath}.field`]: setLocalEnemyField,
                [`${enemyPath}.graveyard`]: setLocalEnemyGrave,
            };
            for (const [path, value] of Object.entries(updates)) setters[path]?.(value);
            return;
        }
        if (!roomId) return;
        try { await updateDoc(doc(db, 'rooms', roomId), updates); } catch (e) { console.error(e); }
    };

    const checkGameEndPvP = (updates, nPLife, nELife, nPHand, nEHand) => {
        if (nPHand.filter(c => c?.name === "黄金").length >= BATTLE_CONFIG.GOLD_WIN_COUNT) { updates['status'] = 'finished'; updates['winner'] = myRole; return; }
        if (nEHand.filter(c => c?.name === "黄金").length >= BATTLE_CONFIG.GOLD_WIN_COUNT) { updates['status'] = 'finished'; updates['winner'] = enemyRole; return; }
        if (nELife <= 0) { updates['status'] = 'finished'; updates['winner'] = myRole; }
        else if (nPLife <= 0) { updates['status'] = 'finished'; updates['winner'] = enemyRole; }
    };

    const playCard = (handIndex) => {
        if (!isPlayerTurn || gameState !== 'playing' || pendingTarget) return;
        const cardToPlay = playerHand[handIndex];
        if (!cardToPlay || cardToPlay.isMana) return;
        if (cardToPlay.cardType !== "magic" && playerField.length >= BATTLE_CONFIG.MAX_FIELD_SIZE) { triggerPopup("フィールドが満杯です"); return; }

        const reqCost = cardToPlay.cost !== undefined ? cardToPlay.cost : 1;
        let consumedManaIndices = [];
        let updates = {};

        if (cardToPlay.costType === "hp") {
            if (playerLife <= reqCost) { triggerPopup("ライフコストが足りない"); return; }
            triggerPopup(`ライフコスト支払 (ライフ -${reqCost})`);
            updates[`${myPath}.maxHp`] = playerMaxLife - reqCost;
            updates[`${myPath}.hp`] = playerLife - reqCost;
        } else {
            const available = playerHand.map((c, i) => c.isMana ? i : -1).filter(i => i !== -1);
            if (available.length < reqCost) { triggerPopup("マナが足りません"); return; }
            consumedManaIndices = available.slice(0, reqCost);
        }

        // 🌟 追加: 魔法カードも対象選択の判定に含める
        const isEffectActivatable = cardToPlay.trigger === "play" || cardToPlay.cardType === "magic";

        if (isEffectActivatable && TARGETED_EFFECTS.includes(cardToPlay.effectType)) {
            if (cardToPlay.effectType.includes("enemy") && enemyField.length === 0) { triggerPopup("対象となる敵がいません"); return; }
            if (cardToPlay.effectType.includes("ally") && playerField.length === 0) { triggerPopup("対象となる味方がいません"); return; }
            setPendingTarget({ handIndex, card: cardToPlay, consumedManaIndices, initialUpdates: updates });
            triggerPopup("対象を選択してください");
            return;
        }

        return finishPlayCard(handIndex, consumedManaIndices, cardToPlay, updates);
    };

    const finishPlayCard = async (handIndex, consumedManaIndices, cardToPlay, initialUpdates = {}) => {
        let newHand = playerHand.filter((_, idx) => idx !== handIndex && !consumedManaIndices.includes(idx));
        let nextGrave = [...playerGrave];
        let nextField = [...(initialUpdates[`${myPath}.field`] ?? playerField)];

        if (cardToPlay.cardType === "magic") {
            triggerPopup(`${cardToPlay.name}を発動`); nextGrave.push(cardToPlay);
            playSE('魔法'); // 🌟 修正：魔法カードを発動する音を再生
        } else {
            triggerPopup(`${cardToPlay.name}を召喚`);
            playSE('カード設置'); // 🌟 修正：カードをフィールドに設置する音を再生
            nextField.push({
                ...cardToPlay,
                hasAttacked: true,
                originalHp: cardToPlay.originalHp ?? cardToPlay.hp,      // 🌟 元のHPを記憶
                originalPower: cardToPlay.originalPower ?? cardToPlay.power // 🌟 元の攻撃力を記憶
            });
        }

        const isEffectActivatable = cardToPlay.trigger === "play" || cardToPlay.cardType === "magic";

        let updates = { ...initialUpdates };
        updates[`${myPath}.hand`] = newHand;
        updates[`${myPath}.graveyard`] = nextGrave;
        updates[`${myPath}.field`] = nextField;

        if (isEffectActivatable && !TARGETED_EFFECTS.includes(cardToPlay.effectType)) {
            await executeSkillPvP(cardToPlay, true, updates);
        }

        await processDeathsPvP(updates);
        checkGameEndPvP(updates, updates[`${myPath}.hp`] ?? playerLife, updates[`${enemyPath}.hp`] ?? enemyLife, updates[`${myPath}.hand`] ?? newHand, updates[`${enemyPath}.hand`] ?? enemyHand);
        await commitGameUpdates(updates);
    };

    const resolveTargetedPlay = async (targetIdx, isEnemyTarget) => {
        if (!pendingTarget || !isPlayerTurn || gameState !== 'playing') return;
        const { handIndex, card, consumedManaIndices, initialUpdates } = pendingTarget;

        let extraUpdates = { ...initialUpdates };
        let currentEnemyField = [...(isPvP ? enemyField : localEnemyField)];
        let currentPlayerField = [...(isPvP ? playerField : localPlayerField)];
        if (!(isEnemyTarget ? currentEnemyField : currentPlayerField)[targetIdx]) return;

        if (card.effectType.includes("enemy") && isEnemyTarget) {
            let target = { ...currentEnemyField[targetIdx] };
            if (card.effectType === "damage_single_enemy") {
                target.hp -= (card.effectValue || 0);
                triggerPopup(`[${target.name}]に${card.effectValue}ダメージ`);
                playSE('ダメージ');
            } else if (card.effectType === "destroy_single_enemy") {
                target.hp = 0;
                triggerPopup(`[${target.name}]を破壊`);
                playSE('破壊');
            }
            currentEnemyField[targetIdx] = target;

            extraUpdates[`${enemyPath}.field`] = currentEnemyField;

        } else if (card.effectType.includes("ally") && !isEnemyTarget) {
            let target = { ...currentPlayerField[targetIdx] };
            const val = card.effectValue || 0; // 🌟 共通変数として出しておく

            if (card.effectType === "buff_single_ally") {
                target.power += val;
                target.hp += val;
                playSE('強化');
                triggerPopup(`[${target.name}]を総合強化`);
            }
            // 🌟 追加: 攻撃力のみアップ
            else if (card.effectType === "buff_power_single_ally") {
                target.power += val;
                playSE('強化');
                triggerPopup(`[${target.name}]の攻撃力を強化`);
            }
            // 🌟 追加: 体力のみアップ
            else if (card.effectType === "buff_hp_single_ally") {
                target.hp += val;
                playSE('強化');
                triggerPopup(`[${target.name}]の体力を強化`);
            }

            currentPlayerField[targetIdx] = target;

            extraUpdates[`${myPath}.field`] = currentPlayerField;
        } else {
            triggerPopup("対象が不正なためキャンセルしました");
            setPendingTarget(null);
            return;
        }

        setPendingTarget(null);
        return finishPlayCard(handIndex, consumedManaIndices, card, extraUpdates);
    };

    const handleSelectAttacker = (fieldIndex) => {
        if (!isPlayerTurn || gameState !== 'playing') return;
        if (pendingTarget) return resolveTargetedPlay(fieldIndex, false);
        if (!playerField[fieldIndex] || playerField[fieldIndex].hasAttacked) return;
        setSelectedAttackerIdx(selectedAttackerIdx === fieldIndex ? null : fieldIndex);
    };

    const handleFightMinion = async (enemyFieldIndex) => {
        if (!isPlayerTurn || gameState !== 'playing') return;
        if (pendingTarget) return resolveTargetedPlay(enemyFieldIndex, true);

        if (selectedAttackerIdx === null || !playerField[selectedAttackerIdx] || playerField[selectedAttackerIdx].hasAttacked || !enemyField[enemyFieldIndex]) return;
        const attacker = { ...playerField[selectedAttackerIdx] };
        triggerPopup(`${attacker.name}の攻撃`);

        let updates = {};
        if (attacker.trigger === "attack") await executeSkillPvP(attacker, true, updates);

        let currentPField = updates[`${myPath}.field`] || [...playerField];
        let currentEField = updates[`${enemyPath}.field`] || [...enemyField];

        let a = { ...currentPField[selectedAttackerIdx] };
        let d = { ...currentEField[enemyFieldIndex] };

        if (a.hp > 0 && d.hp > 0) {
            a.hp -= (d.power || 0);
            d.hp -= (a.power || 0);
        }
        a.hasAttacked = true;

        currentPField[selectedAttackerIdx] = a;
        currentEField[enemyFieldIndex] = d;

        updates[`${myPath}.field`] = currentPField;
        updates[`${enemyPath}.field`] = currentEField;
        playSE('ダメージ');

        await processDeathsPvP(updates);
        checkGameEndPvP(updates, updates[`${myPath}.hp`] ?? playerLife, updates[`${enemyPath}.hp`] ?? enemyLife, updates[`${myPath}.hand`] ?? playerHand, updates[`${enemyPath}.hand`] ?? enemyHand);
        setSelectedAttackerIdx(null);
        await commitGameUpdates(updates);
    };

    const handleDirectAttack = async () => {
        if (pendingTarget || selectedAttackerIdx === null || !isPlayerTurn || gameState !== 'playing') return;
        const attacker = playerField[selectedAttackerIdx];
        if (!attacker || attacker.hasAttacked) return;
        triggerPopup(`ダイレクトアタック`);

        let updates = {};
        if (attacker.trigger === "attack") await executeSkillPvP(attacker, true, updates);

        let eHp = updates[`${enemyPath}.hp`] !== undefined ? updates[`${enemyPath}.hp`] : enemyLife;
        let currentPField = updates[`${myPath}.field`] || [...playerField];

        let a = { ...currentPField[selectedAttackerIdx] };
        eHp = Math.max(0, eHp - (a.power || 0));
        a.hasAttacked = true;

        currentPField[selectedAttackerIdx] = a;
        updates[`${enemyPath}.hp`] = eHp;
        updates[`${myPath}.field`] = currentPField;

        await processDeathsPvP(updates);
        checkGameEndPvP(updates, updates[`${myPath}.hp`] ?? playerLife, updates[`${enemyPath}.hp`] ?? eHp, updates[`${myPath}.hand`] ?? playerHand, updates[`${enemyPath}.hand`] ?? enemyHand);
        setSelectedAttackerIdx(null);
        await commitGameUpdates(updates);

        playSE('ダメージ');
    };

    const endPlayerTurn = async () => {
        if ((!isPlayerTurn && !pendingCpuStart) || gameState !== 'playing' || pendingTarget) return;

        if (isPvP) {
            setSelectedAttackerIdx(null);
            let updates = {};

            // 自分のターン終了時効果
            let currentMyField = playerField;
            for (const c of currentMyField) {
                if (c.trigger === "turn_end") await executeSkillPvP(c, true, updates);
            }
            await processDeathsPvP(updates);

            // 相手のためのドロー処理
            let eDeck = updates[`${enemyPath}.deck`] || enemyDeck;
            let eHand = updates[`${enemyPath}.hand`] || enemyHand;
            let eGrave = updates[`${enemyPath}.graveyard`] || enemyGrave;
            let eLife = updates[`${enemyPath}.hp`] !== undefined ? updates[`${enemyPath}.hp`] : enemyLife;

            let eDrawRes = processDraw(1, eDeck, eHand, eGrave, eLife);
            if (eDrawRes.h.length < 10) eDrawRes.h.push(JSON.parse(JSON.stringify(MANA_CARD)));

            updates[`${enemyPath}.deck`] = eDrawRes.d;
            updates[`${enemyPath}.hand`] = eDrawRes.h;
            updates[`${enemyPath}.graveyard`] = eDrawRes.g;
            updates[`${enemyPath}.hp`] = eDrawRes.life;

            // 相手の攻撃権を回復
            let eField = updates[`${enemyPath}.field`] || enemyField;
            updates[`${enemyPath}.field`] = eField.map(c => ({ ...c, hasAttacked: false }));

            // 相手のターン開始時効果
            for (const c of eField) {
                if (c.trigger === "turn_start") await executeSkillPvP(c, false, updates);
            }
            await processDeathsPvP(updates);

            updates["currentTurn"] = enemyRole;
            updates["turnCount"] = roomData.turnCount + (myRole === 'guest' ? 1 : 0);

            checkGameEndPvP(updates, updates[`${myPath}.hp`] ?? playerLife, updates[`${enemyPath}.hp`] ?? enemyLife, updates[`${myPath}.hand`] ?? playerHand, updates[`${enemyPath}.hand`] ?? enemyHand);
            await commitGameUpdates(updates);
            return;
        }

        // CPUターン中は、待機のたびに最新の盤面を読み直す。
        setLocalIsPlayerTurn(false);
        setSelectedAttackerIdx(null);
        const active = () => {
            const s = localStateRef.current;
            return s?.localGameState === 'playing' && s.localPlayerLife > 0 && s.localEnemyLife > 0 &&
                s.localPlayerHand.filter(c => c.name === '黄金').length < BATTLE_CONFIG.GOLD_WIN_COUNT &&
                s.localEnemyHand.filter(c => c.name === '黄金').length < BATTLE_CONFIG.GOLD_WIN_COUNT;
        };
        const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
        const applyDraw = (isPlayerContext) => {
            const state = localStateRef.current;
            const result = processDraw(1,
                isPlayerContext ? state.localPlayerDeck : state.localEnemyDeck,
                isPlayerContext ? state.localPlayerHand : state.localEnemyHand,
                isPlayerContext ? state.localPlayerGrave : state.localEnemyGrave,
                isPlayerContext ? state.localPlayerLife : state.localEnemyLife);
            if (result.h.length < BATTLE_CONFIG.MAX_HAND_SIZE) result.h.push({ ...MANA_CARD });
            if (isPlayerContext) {
                setLocalPlayerDeck(result.d); setLocalPlayerHand(result.h);
                setLocalPlayerGrave(result.g); setLocalPlayerLife(result.life);
            } else {
                setLocalEnemyDeck(result.d); setLocalEnemyHand(result.h);
                setLocalEnemyGrave(result.g); setLocalEnemyLife(result.life);
            }
        };
        const runTriggers = async (trigger, isPlayerContext) => {
            const state = localStateRef.current;
            if (!state) return;
            const field = isPlayerContext ? state.localPlayerField : state.localEnemyField;
            for (const card of field) {
                if (!active()) return;
                if (card.trigger === trigger) {
                    await executeSkillLocal(card, isPlayerContext);
                    await pause(0);
                }
            }
        };

        if (!pendingCpuStart) await runTriggers('turn_end', true);
        await pause(1200);
        if (!active()) return;
        applyDraw(false);
        await pause(0);
        if (!active()) return;
        await runTriggers('turn_start', false);

        for (let attempts = 0; attempts < 10 && active(); attempts++) {
            const state = localStateRef.current;
            const mana = state.localEnemyHand.filter(c => c.isMana).length;
            const playable = state.localEnemyHand
                .map((card, index) => ({ card, index }))
                .filter(({ card }) => !card.isMana &&
                    (card.cardType === 'magic' || state.localEnemyField.length < BATTLE_CONFIG.MAX_FIELD_SIZE) &&
                    (card.costType === 'hp' ? state.localEnemyLife > (card.cost ?? 1) : mana >= (card.cost ?? 1)))
                .sort((a, b) => (b.card.cost ?? 1) - (a.card.cost ?? 1))[0];
            if (!playable) break;
            const { card, index } = playable;
            let remainingCost = card.costType === 'hp' ? 0 : (card.cost ?? 1);
            const hand = state.localEnemyHand.filter((c, i) => {
                if (i === index) return false;
                if (c.isMana && remainingCost > 0) { remainingCost--; return false; }
                return true;
            });
            setLocalEnemyHand(hand);
            if (card.costType === 'hp') {
                setLocalEnemyLife(p => p - (card.cost ?? 1));
                setLocalEnemyMaxLife(p => p - (card.cost ?? 1));
            }
            if (card.cardType === 'magic') {
                setLocalEnemyGrave(g => [...g, card]);
            } else {
                setLocalEnemyField(f => [...f, {
                    ...card, hasAttacked: true,
                    originalHp: card.originalHp ?? card.hp,
                    originalPower: card.originalPower ?? card.power,
                }]);
            }
            triggerPopup(`相手が[${card.name}]を使用`);
            await pause(800);
            if (!active()) return;
            if (card.trigger === 'play' || card.cardType === 'magic') {
                await executeSkillLocal(card, false);
                await pause(0);
            }
        }

        while (active()) {
            await pause(1200);
            if (!active()) return;
            let state = localStateRef.current;
            const attackerIdx = state.localEnemyField.findIndex(c => c.hp > 0 && !c.hasAttacked);
            if (attackerIdx === -1) break;
            let attacker = state.localEnemyField[attackerIdx];
            if (attacker.trigger === 'attack') {
                await executeSkillLocal(attacker, false);
                await pause(0);
                if (!active()) return;
                state = localStateRef.current;
                attacker = state.localEnemyField[attackerIdx];
                if (!attacker || attacker.hp <= 0) continue;
            }
            const targetIdx = state.localPlayerField.findIndex(c => c.hp > 0 && (attacker.power || 0) >= c.hp);
            if (targetIdx === -1) {
                triggerPopup(`相手の[${attacker.name}]によるダイレクトアタック`);
                setLocalPlayerLife(p => Math.max(0, p - (attacker.power || 0)));
                setLocalEnemyField(f => f.map((c, i) => i === attackerIdx ? { ...c, hasAttacked: true } : c));
            } else {
                const defender = state.localPlayerField[targetIdx];
                triggerPopup(`相手の[${attacker.name}]が[${defender.name}]を攻撃`);
                setLocalPlayerField(f => f.map((c, i) => i === targetIdx ? { ...c, hp: c.hp - (attacker.power || 0) } : c));
                setLocalEnemyField(f => f.map((c, i) => i === attackerIdx ? { ...c, hp: c.hp - (defender.power || 0), hasAttacked: true } : c));
            }
            playSE('ダメージ');
        }
        if (!active()) return;
        await runTriggers('turn_end', false);
        await pause(0);
        if (!active()) return;
        setLocalEnemyField(f => f.map(c => ({ ...c, hasAttacked: false })));
        applyDraw(true);
        await pause(0);
        if (!active()) return;
        setLocalPlayerField(f => f.map(c => ({ ...c, hasAttacked: false })));
        await runTriggers('turn_start', true);
        if (active()) setLocalIsPlayerTurn(true);
    };
    const startCpuTurn = useEffectEvent(() => performAction(endPlayerTurn));
     // 🌟 追加：後攻になった場合、最新のデータを使って安全にCPUのターンを開始する
    useEffect(() => {
        if (pendingCpuStart && localGameState === 'playing' && localPlayerHand.length > 0) {
            // 👇 setTimeoutで囲んで非同期処理（0秒遅延）にすることで警告を回避
            const timer = setTimeout(() => {
                setPendingCpuStart(false);
                playSE('ドロー'); // 🌟 修正：CPUがカードをドローする音を再生
                startCpuTurn(); // 強制的にプレイヤーのターンを終了してCPUに渡す
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [pendingCpuStart, localGameState, localPlayerHand]);

    return {
        playerMaxLife, enemyMaxLife, playerLife, enemyLife,
        playerDeck, playerHand, playerField, enemyDeck, enemyHand, enemyField, playerGrave, enemyGrave,
        isPlayerTurn, gameState, selectedAttackerIdx, pendingTarget, pendingPeeping,
        playCard: (...args) => performAction(playCard, ...args),
        endPlayerTurn: () => performAction(endPlayerTurn),
        handleSelectAttacker: (...args) => performAction(handleSelectAttacker, ...args),
        handleFightMinion: (...args) => performAction(handleFightMinion, ...args),
        handleDirectAttack: () => performAction(handleDirectAttack)
    };
}
