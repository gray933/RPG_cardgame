// src/hooks/useBattle.js
import { useState, useEffect } from 'react';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const MANA_CARD = { name: "マナ結晶", cardType: "mana", effectText: "コスト用", image: "img/mana.png", isMana: true };
const TARGETED_EFFECTS = ["damage_single_enemy", "destroy_single_enemy", "buff_single_ally"];

const processDraw = (drawCount, currentDeck, currentHand, currentGrave, currentLife) => {
    let d = [...currentDeck];
    let h = [...currentHand];
    let g = [...currentGrave];
    let life = currentLife;

    for (let i = 0; i < drawCount; i++) {
        if (d.length === 0) {
            const nonManaGrave = g.filter(c => !c.isMana);
            if (nonManaGrave.length === 0) break;
            life -= 5;
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
    }
    if (d.length > 0) {
        const drawnCard = d.shift();
        if (h.length < 10) h.push(drawnCard);
        else if (!drawnCard.isMana) g.push(drawnCard);
    }
    return { d, h, g, life };
};

export function useBattle({ isPvP, roomId, myRole, roomData, playerDeckData, enemyDeckData, triggerPopup, onBack }) {
    const [localPlayerMaxLife, setLocalPlayerMaxLife] = useState(20);
    const [localEnemyMaxLife, setLocalEnemyMaxLife] = useState(20);
    const [localPlayerLife, setLocalPlayerLife] = useState(20);
    const [localEnemyLife, setLocalEnemyLife] = useState(20);
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
    const [pendingPeeping, setPendingPeeping] = useState(false);

    const useRemote = isPvP && roomData && roomData.players;
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

    const isPlayerTurn = useRemote ? (roomData.currentTurn === myRole) : localIsPlayerTurn;
    const gameState = useRemote
        ? (roomData.status === 'finished' ? (roomData.winner === myRole ? 'win' : 'lose') : 'playing')
        : localGameState;

    // 🤖 【CPU専用】効果処理
    const executeSkillLocal = async (card, isPlayerContext) => {
        if (!card.effectType || card.effectType === "none") return;
        const val = card.effectValue || 0;

        switch (card.effectType) {
            case "gain_mana":
                triggerPopup(`マナ結晶を${val}枚獲得`);
                if (isPlayerContext) {
                    setLocalPlayerHand(curr => {
                        let n = [...curr];
                        for (let i = 0; i < val; i++) if (n.length < 10) n.push(JSON.parse(JSON.stringify(MANA_CARD)));
                        return n;
                    });
                } else {
                    setLocalEnemyHand(curr => {
                        let n = [...curr];
                        for (let i = 0; i < val; i++) if (n.length < 10) n.push(JSON.parse(JSON.stringify(MANA_CARD)));
                        return n;
                    });
                }
                break;
            case "heal_player":
                if (isPlayerContext) setLocalPlayerLife(p => Math.min(localPlayerMaxLife, p + val));
                else setLocalEnemyLife(p => Math.min(localEnemyMaxLife, p + val));
                break;
            case "damage_enemy_player":
                triggerPopup(`相手に${val}ダメージ`);
                if (isPlayerContext) setLocalEnemyLife(p => Math.max(0, p - val));
                else setLocalPlayerLife(p => Math.max(0, p - val));
                break;
            case "buff_all_allies":
                triggerPopup(`味方全体を強化`);
                if (isPlayerContext) setLocalPlayerField(f => f.map(c => ({ ...c, power: (c.power || 0) + val, hp: (c.hp || 0) + val })));
                else setLocalEnemyField(f => f.map(c => ({ ...c, power: (c.power || 0) + val, hp: (c.hp || 0) + val })));
                break;
            case "increase_max_hp":
                if (isPlayerContext) { setLocalPlayerMaxLife(p => p + val); }
                else { setLocalEnemyMaxLife(p => p + val); }
                break;
            case "search_card_to_hand": {
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;
                if (isPlayerContext) {
                    const matchIdx = localPlayerDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && localPlayerHand.length < 10) {
                        triggerPopup(`デッキから[${targetName}]を手札に追加`);
                        const foundCard = localPlayerDeck[matchIdx];
                        setLocalPlayerDeck(localPlayerDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5));
                        setLocalPlayerHand(prev => [...prev, foundCard]);
                    } else { triggerPopup(`対象のカードがデッキにありません`); }
                } else {
                    const matchIdx = localEnemyDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && localEnemyHand.length < 10) {
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
                    if (matchIdx !== -1 && localPlayerField.length < 4) {
                        triggerPopup(`デッキから[${targetName}]をフィールドに召喚`);
                        const foundCard = localPlayerDeck[matchIdx];
                        setLocalPlayerDeck(localPlayerDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5));
                        // 🌟 修正
                        setLocalPlayerField(prev => [...prev, { ...foundCard, hasAttacked: true, originalHp: foundCard.originalHp ?? foundCard.hp, originalPower: foundCard.originalPower ?? foundCard.power }]);
                    } else { triggerPopup(`召喚に失敗しました`); }
                } else {
                    const matchIdx = localEnemyDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && localEnemyField.length < 4) {
                        triggerPopup(`相手がデッキから[${targetName}]をフィールドに召喚`);
                        const foundCard = localEnemyDeck[matchIdx];
                        setLocalEnemyDeck(localEnemyDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5));
                        // 🌟 修正
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
                    getDocs(q).then(snap => {
                        if (!snap.empty) {
                            const generatedCard = { ...snap.docs[0].data() };
                            if (isPlayerContext && localPlayerHand.length < 10) { triggerPopup(`[${targetName}]を手札に生成`); setLocalPlayerHand(prev => [...prev, generatedCard]); }
                            else if (!isPlayerContext && localEnemyHand.length < 10) { triggerPopup(`相手が手札に[${targetName}]を生成`); setLocalEnemyHand(prev => [...prev, generatedCard]); }
                        }
                    });
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
                        let n = [...prev]; const idx = Math.floor(Math.random() * n.length);
                        triggerPopup(`[${card.name}]の効果！相手の[${n[idx].name}]を破壊！`);
                        n[idx].hp = 0; return n;
                    });
                } else {
                    setLocalPlayerField(prev => {
                        if (prev.length === 0) return prev;
                        let n = [...prev]; const idx = Math.floor(Math.random() * n.length);
                        triggerPopup(`相手の[${card.name}]が味方の[${n[idx].name}]を破壊！`);
                        n[idx].hp = 0; return n;
                    });
                }
                break;
            case "damage_single_enemy":
                if (isPlayerContext) {
                    setLocalEnemyField(prev => {
                        if (prev.length === 0) return prev;
                        let n = [...prev]; const idx = Math.floor(Math.random() * n.length);
                        triggerPopup(`[${card.name}]の効果！[${n[idx].name}]に${val}ダメージ！`);
                        n[idx].hp -= val; return n;
                    });
                } else {
                    setLocalPlayerField(prev => {
                        if (prev.length === 0) return prev;
                        let n = [...prev]; const idx = Math.floor(Math.random() * n.length);
                        triggerPopup(`相手が味方の[${n[idx].name}]に${val}ダメージ！`);
                        n[idx].hp -= val; return n;
                    });
                }
                break;
            case "buff_single_ally":
                if (isPlayerContext) {
                    setLocalPlayerField(prev => {
                        if (prev.length === 0) return prev;
                        let n = [...prev]; const idx = Math.floor(Math.random() * n.length);
                        triggerPopup(`[${card.name}]の効果！味方の[${n[idx].name}]を強化`);
                        n[idx].power += val; n[idx].hp += val; return n;
                    });
                } else {
                    setLocalEnemyField(prev => {
                        if (prev.length === 0) return prev;
                        let n = [...prev]; const idx = Math.floor(Math.random() * n.length);
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
                for (let i = 0; i < val; i++) if (hand.length < 10) hand.push(JSON.parse(JSON.stringify(MANA_CARD)));
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
            case "buff_all_allies": {
                let field = [...getVal(`${mPath}.field`, isPlayerContext ? playerField : enemyField)];
                updates[`${mPath}.field`] = field.map(c => ({ ...c, power: (c.power || 0) + val, hp: (c.hp || 0) + val }));
                triggerPopup(`味方全体を強化`);
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
                if (matchIdx !== -1 && hand.length < 10) {
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
                if (matchIdx !== -1 && field.length < 4) {
                    field.push({
                        ...deck[matchIdx],
                        hasAttacked: true,
                        originalHp: deck[matchIdx].originalHp ?? deck[matchIdx].hp,
                        originalPower: deck[matchIdx].originalPower ?? deck[matchIdx].power
                    });
                }
                break;
            }
            case "generate_card_to_hand": {
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;
                let hand = [...getVal(`${mPath}.hand`, isPlayerContext ? playerHand : enemyHand)];
                if (hand.length < 10) {
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
                break;
            }
            case "damage_all_enemies": {
                let field = [...getVal(`${ePath}.field`, isPlayerContext ? enemyField : playerField)];
                let grave = [...getVal(`${ePath}.graveyard`, isPlayerContext ? enemyGrave : playerGrave)];
                const dmgField = field.map(c => ({ ...c, hp: c.hp - val }));
                updates[`${ePath}.field`] = dmgField.filter(c => c.hp > 0);
                updates[`${ePath}.graveyard`] = [...grave, ...dmgField.filter(c => c.hp <= 0 && !c.isMana)];
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
        }
    };

    useEffect(() => {
        if (isPvP) return;

        const pDeck = JSON.parse(JSON.stringify(playerDeckData || []));
        const eDeck = JSON.parse(JSON.stringify(enemyDeckData || []));
        pDeck.sort(() => Math.random() - 0.5);
        eDeck.sort(() => Math.random() - 0.5);

        const pHand = []; for (let i = 0; i < 4; i++) if (pDeck.length > 0) pHand.push(pDeck.shift());
        pHand.push(JSON.parse(JSON.stringify(MANA_CARD)));
        const eHand = []; for (let i = 0; i < 3; i++) if (eDeck.length > 0) eHand.push(eDeck.shift());
        eHand.push(JSON.parse(JSON.stringify(MANA_CARD)));

        setTimeout(() => {
            setLocalPlayerMaxLife(20); setLocalEnemyMaxLife(20); setLocalPlayerLife(20); setLocalEnemyLife(20);
            setLocalPlayerDeck(pDeck); setLocalPlayerHand(pHand); setLocalEnemyDeck(eDeck); setLocalEnemyHand(eHand);
            setLocalPlayerField([]); setLocalEnemyField([]); setLocalPlayerGrave([]); setLocalEnemyGrave([]);
            setLocalIsPlayerTurn(true); setLocalGameState('playing'); setSelectedAttackerIdx(null); setPendingTarget(null);
        }, 0);
    }, [isPvP, playerDeckData, enemyDeckData]);

    useEffect(() => {
        if (isPvP || localGameState !== 'playing') return;

        // 🌟 金塊の枚数をカウント
        const pGoldCount = localPlayerHand.filter(c => c?.name === "金塊").length;
        const eGoldCount = localEnemyHand.filter(c => c?.name === "金塊").length;

        if (pGoldCount >= 6 || eGoldCount >= 6 || localEnemyLife <= 0 || localPlayerLife <= 0) {
            setTimeout(() => {
                if (pGoldCount >= 6) {
                    setLocalGameState('win');
                    triggerPopup("特殊勝利：金塊を6枚集めた！");
                } else if (eGoldCount >= 6) {
                    setLocalGameState('lose');
                    triggerPopup("特殊敗北：相手が金塊を集めきった…");
                } else if (localEnemyLife <= 0) {
                    setLocalGameState('win');
                    triggerPopup("YOU WIN");
                } else if (localPlayerLife <= 0) {
                    setLocalGameState('lose');
                    triggerPopup("YOU LOSE");
                }
            }, 0);
        }
    }, [isPvP, localPlayerLife, localEnemyLife, localPlayerHand, localEnemyHand, localGameState]);

    useEffect(() => {
        if (isPvP || localGameState !== 'playing') return;
        const deadP = localPlayerField.filter(c => c && c.hp <= 0 && !c.isMana);
        const deadE = localEnemyField.filter(c => c && c.hp <= 0 && !c.isMana);

        if (deadP.length > 0 || deadE.length > 0) {
            setTimeout(() => {
                if (deadP.length > 0) {
                    deadP.forEach(c => { if (c.trigger === "death") executeSkillLocal(c, true); });
                    setLocalPlayerGrave(p => [...p, ...deadP]);
                    setLocalPlayerField(p => p.filter(c => c.hp > 0));
                }
                if (deadE.length > 0) {
                    deadE.forEach(c => { if (c.trigger === "death") executeSkillLocal(c, false); });
                    setLocalEnemyGrave(p => [...p, ...deadE]);
                    setLocalEnemyField(p => p.filter(c => c.hp > 0));
                }
            }, 0);
        }
    }, [isPvP, localPlayerField, localEnemyField, localGameState]);

    const pushGameStateToDB = async (updates) => {
        if (!roomId) return;
        try { await updateDoc(doc(db, 'rooms', roomId), updates); } catch (e) { console.error(e); }
    };

    const checkGameEndPvP = (updates, nPLife, nELife, nPHand, nEHand) => {
        if (nPHand.filter(c => c?.name === "金塊").length >= 6) { updates['status'] = 'finished'; updates['winner'] = myRole; return; }
        if (nEHand.filter(c => c?.name === "金塊").length >= 6) { updates['status'] = 'finished'; updates['winner'] = enemyRole; return; }
        if (nELife <= 0) { updates['status'] = 'finished'; updates['winner'] = myRole; }
        else if (nPLife <= 0) { updates['status'] = 'finished'; updates['winner'] = enemyRole; }
    };

    const playCard = (handIndex) => {
        if (!isPlayerTurn || gameState !== 'playing' || pendingTarget) return;
        const cardToPlay = playerHand[handIndex];
        if (!cardToPlay || cardToPlay.isMana) return;
        if (cardToPlay.cardType !== "magic" && playerField.length >= 4) { triggerPopup("フィールドが満杯です"); return; }

        const reqCost = cardToPlay.cost !== undefined ? cardToPlay.cost : 1;
        let consumedManaIndices = [];
        let updates = {};

        if (cardToPlay.costType === "hp") {
            if (playerLife <= reqCost) { triggerPopup("ライフコストが足りない"); return; }
            triggerPopup(`ライフコスト支払 (ライフ -${reqCost})`);
            if (isPvP) {
                updates[`${myPath}.maxHp`] = playerMaxLife - reqCost; updates[`${myPath}.hp`] = playerLife - reqCost;
            } else {
                setLocalPlayerMaxLife(p => p - reqCost); setLocalPlayerLife(p => p - reqCost);
            }
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

        finishPlayCard(handIndex, consumedManaIndices, cardToPlay, updates);
    };

    const finishPlayCard = async (handIndex, consumedManaIndices, cardToPlay, initialUpdates = {}) => {
        let newHand = playerHand.filter((_, idx) => idx !== handIndex && !consumedManaIndices.includes(idx));
        let nextGrave = [...playerGrave];
        let nextField = [...playerField];

        if (cardToPlay.cardType === "magic") {
            triggerPopup(`${cardToPlay.name}を発動`); nextGrave.push(cardToPlay);
        } else {
            triggerPopup(`${cardToPlay.name}を召喚`);
            nextField.push({
                ...cardToPlay,
                hasAttacked: true,
                originalHp: cardToPlay.originalHp ?? cardToPlay.hp,      // 🌟 元のHPを記憶
                originalPower: cardToPlay.originalPower ?? cardToPlay.power // 🌟 元の攻撃力を記憶
            });
        }

        const isEffectActivatable = cardToPlay.trigger === "play" || cardToPlay.cardType === "magic";

        if (isPvP) {
            let updates = { ...initialUpdates };
            updates[`${myPath}.hand`] = newHand;
            updates[`${myPath}.graveyard`] = nextGrave;
            updates[`${myPath}.field`] = nextField;

            if (isEffectActivatable && !TARGETED_EFFECTS.includes(cardToPlay.effectType)) {
                await executeSkillPvP(cardToPlay, true, updates);
            }

            await processDeathsPvP(updates);
            checkGameEndPvP(updates, updates[`${myPath}.hp`] ?? playerLife, updates[`${enemyPath}.hp`] ?? enemyLife, updates[`${myPath}.hand`] ?? newHand, enemyHand);
            await pushGameStateToDB(updates);
        } else {
            setLocalPlayerHand(newHand); setLocalPlayerGrave(nextGrave); setLocalPlayerField(nextField);
            if (isEffectActivatable && !TARGETED_EFFECTS.includes(cardToPlay.effectType)) {
                if (cardToPlay.effectType === "draw_card") {
                    const res = processDraw(cardToPlay.effectValue, localPlayerDeck, newHand, nextGrave, localPlayerLife);
                    setLocalPlayerDeck(res.d); setLocalPlayerHand(res.h); setLocalPlayerGrave(res.g); setLocalPlayerLife(res.life);
                } else if (cardToPlay.effectType === "damage_all_enemies") {
                    const dmgField = localEnemyField.map(c => ({ ...c, hp: c.hp - cardToPlay.effectValue }));
                    setLocalEnemyGrave(g => [...g, ...dmgField.filter(c => c.hp <= 0 && !c.isMana)]);
                    setLocalEnemyField(dmgField.filter(c => c.hp > 0));
                } else {
                    executeSkillLocal(cardToPlay, true);
                }
            }
        }
    };

    const resolveTargetedPlay = async (targetIdx, isEnemyTarget) => {
        if (!pendingTarget || gameState !== 'playing') return;
        const { handIndex, card, consumedManaIndices, initialUpdates } = pendingTarget;

        let extraUpdates = { ...initialUpdates };
        let currentEnemyField = [...(isPvP ? enemyField : localEnemyField)];
        let currentPlayerField = [...(isPvP ? playerField : localPlayerField)];

        if (card.effectType.includes("enemy") && isEnemyTarget) {
            let target = { ...currentEnemyField[targetIdx] };
            if (card.effectType === "damage_single_enemy") {
                target.hp -= (card.effectValue || 0);
                triggerPopup(`[${target.name}]に${card.effectValue}ダメージ`);
            } else if (card.effectType === "destroy_single_enemy") {
                target.hp = 0;
                triggerPopup(`[${target.name}]を破壊`);
            }
            currentEnemyField[targetIdx] = target;

            if (isPvP) {
                extraUpdates[`${enemyPath}.field`] = currentEnemyField;
            } else {
                setLocalEnemyField(currentEnemyField);
            }

        } else if (card.effectType.includes("ally") && !isEnemyTarget) {
            let target = { ...currentPlayerField[targetIdx] };
            if (card.effectType === "buff_single_ally") {
                const val = card.effectValue || 0;
                target.power += val;
                target.hp += val;
                triggerPopup(`[${target.name}]を強化`);
            }
            currentPlayerField[targetIdx] = target;

            if (isPvP) extraUpdates[`${myPath}.field`] = currentPlayerField;
            else setLocalPlayerField(currentPlayerField);
        } else {
            triggerPopup("対象が不正なためキャンセルしました");
            setPendingTarget(null);
            return;
        }

        setPendingTarget(null);
        finishPlayCard(handIndex, consumedManaIndices, card, extraUpdates);
    };

    const handleSelectAttacker = (fieldIndex) => {
        if (!isPlayerTurn || gameState !== 'playing') return;
        if (pendingTarget) { resolveTargetedPlay(fieldIndex, false); return; }
        if (playerField[fieldIndex].hasAttacked) return;
        setSelectedAttackerIdx(selectedAttackerIdx === fieldIndex ? null : fieldIndex);
    };

    const handleFightMinion = async (enemyFieldIndex) => {
        if (!isPlayerTurn || gameState !== 'playing') return;
        if (pendingTarget) { resolveTargetedPlay(enemyFieldIndex, true); return; }

        if (selectedAttackerIdx === null) return;
        const attacker = { ...playerField[selectedAttackerIdx] };
        const defender = { ...enemyField[enemyFieldIndex] };
        triggerPopup(`${attacker.name}の攻撃`);

        if (isPvP) {
            let updates = {};
            if (attacker.trigger === "attack") await executeSkillPvP(attacker, true, updates);

            let currentPField = updates[`${myPath}.field`] || [...playerField];
            let currentEField = updates[`${enemyPath}.field`] || [...enemyField];

            let a = { ...currentPField[selectedAttackerIdx] };
            let d = { ...currentEField[enemyFieldIndex] };

            a.hp -= (d.power || 0);
            d.hp -= (a.power || 0);
            a.hasAttacked = true;

            currentPField[selectedAttackerIdx] = a;
            currentEField[enemyFieldIndex] = d;

            updates[`${myPath}.field`] = currentPField;
            updates[`${enemyPath}.field`] = currentEField;

            await processDeathsPvP(updates);
            setSelectedAttackerIdx(null);
            await pushGameStateToDB(updates);
        } else {
            if (attacker.trigger === "attack") executeSkillLocal(attacker, true);
            attacker.hp -= (defender.power || 0); defender.hp -= (attacker.power || 0);
            attacker.hasAttacked = true;
            let nPField = playerField.map((c, i) => i === selectedAttackerIdx ? attacker : c);
            let nEField = enemyField.map((c, i) => i === enemyFieldIndex ? defender : c);

            setLocalPlayerField(nPField.filter(c => c.hp > 0));
            setLocalPlayerGrave(g => [...g, ...nPField.filter(c => c.hp <= 0 && !c.isMana)]);
            setLocalEnemyField(nEField.filter(c => c.hp > 0));
            setLocalEnemyGrave(g => [...g, ...nEField.filter(c => c.hp <= 0 && !c.isMana)]);
            setSelectedAttackerIdx(null);
        }
    };

    const handleDirectAttack = async () => {
        if (selectedAttackerIdx === null || !isPlayerTurn || gameState !== 'playing') return;
        const attacker = playerField[selectedAttackerIdx];
        triggerPopup(`ダイレクトアタック`);

        if (isPvP) {
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
            checkGameEndPvP(updates, playerLife, eHp, playerHand, enemyHand);
            setSelectedAttackerIdx(null);
            await pushGameStateToDB(updates);
        } else {
            if (attacker.trigger === "attack") executeSkillLocal(attacker, true);
            const nextELife = Math.max(0, enemyLife - (attacker.power || 0));
            const nPField = playerField.map((c, i) => i === selectedAttackerIdx ? { ...c, hasAttacked: true } : c);
            setLocalEnemyLife(nextELife); setLocalPlayerField(nPField); setSelectedAttackerIdx(null);
        }
    };

    const endPlayerTurn = async () => {
        if (gameState !== 'playing' || pendingTarget) return;

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
            pushGameStateToDB(updates);
            return;
        }

        // 🤖 CPU処理
        setLocalIsPlayerTurn(false);
        setSelectedAttackerIdx(null);

        // プレイヤーのターン終了時効果
        localPlayerField.forEach(c => { if (c.trigger === "turn_end") executeSkillLocal(c, true); });

        // プレイヤーのドロー計算 (最新のライフを上書きしないよう、差分だけを計算しておく)
        let pDrawRes = processDraw(1, localPlayerDeck, localPlayerHand, localPlayerGrave, localPlayerLife);
        if (pDrawRes.h.length < 10) pDrawRes.h.push(JSON.parse(JSON.stringify(MANA_CARD)));
        const playerFatigueDamage = localPlayerLife - pDrawRes.life;

        // CPUのターン開始を少し待機
        setTimeout(async () => {
            if (localGameState !== 'playing') return;

            // CPUのドロー
            let eDrawRes = processDraw(1, localEnemyDeck, localEnemyHand, localEnemyGrave, localEnemyLife);
            if (eDrawRes.h.length < 10) eDrawRes.h.push(JSON.parse(JSON.stringify(MANA_CARD)));

            let currentEField = [...localEnemyField];
            let currentEnemyHand = [...eDrawRes.h];
            let currentPlayerField = [...localPlayerField];
            let loopSafety = 0;

            // ターン開始時効果
            currentEField.forEach(c => { if (c.trigger === "turn_start") executeSkillLocal(c, false); });

            // 【召喚フェイズ】
            while (currentEField.length < 4 && loopSafety < 10) {
                loopSafety++;
                const aiMana = currentEnemyHand.filter(c => c.isMana).length;
                const playable = currentEnemyHand
                    .map((c, i) => ({ card: c, originalIdx: i }))
                    .filter(item => !item.card.isMana && item.card.cardType !== 'magic' && aiMana >= (item.card.cost || 1))
                    .sort((a, b) => (b.card.cost || 0) - (a.card.cost || 0));

                if (playable.length === 0) break;

                const targetItem = playable[0];
                const cost = targetItem.card.cost || 1;

                // 手札から対象のカードを削除
                currentEnemyHand.splice(targetItem.originalIdx, 1);

                // マナを消費
                let consumed = 0;
                currentEnemyHand = currentEnemyHand.filter(c => !(c.isMana && consumed < cost && ++consumed));

                triggerPopup(`相手が[${targetItem.card.name}]を召喚`);

                const summoned = {
                    ...targetItem.card,
                    hasAttacked: true, // 召喚酔い
                    originalHp: targetItem.card.originalHp ?? targetItem.card.hp,
                    originalPower: targetItem.card.originalPower ?? targetItem.card.power
                };

                currentEField.push(summoned);
                setLocalEnemyField([...currentEField]); // 描画を更新
                setLocalEnemyHand([...currentEnemyHand]);

                // 効果発動（少し待機して演出）
                await new Promise(resolve => setTimeout(resolve, 800));
                if (targetItem.card.trigger === "play") {
                    await executeSkillLocal(targetItem.card, false);
                }
            }

            setLocalEnemyDeck(eDrawRes.d);

            // 【攻撃フェイズ】
            // 🌟 修正: idではなく、配列の「インデックス番号」で確実に対象を特定する
            let readyAttackers = currentEField
                .map((c, i) => ({ card: { ...c }, index: i }))
                .filter(item => !item.card.hasAttacked);

            for (let { card: attacker, index: attackerIdx } of readyAttackers) {
                if (localGameState !== 'playing') break;
                if (attacker.hp <= 0) continue; // すでに死亡している場合はスキップ

                // 攻撃演出のための待機
                await new Promise(resolve => setTimeout(resolve, 1200));

                if (attacker.trigger === "attack") {
                    await executeSkillLocal(attacker, false);
                }

                // 攻撃目標の選定（最新のプレイヤー盤面を参照）
                let targetMinionIdx = currentPlayerField.findIndex(em => (attacker.power || 0) >= (em.hp || 0));

                if (targetMinionIdx !== -1) {
                    const targetMinion = { ...currentPlayerField[targetMinionIdx] };
                    triggerPopup(`相手の[${attacker.name}]が[${targetMinion.name}]を攻撃`);

                    targetMinion.hp -= (attacker.power || 0);
                    attacker.hp -= (targetMinion.power || 0);

                    // 墓地送り処理
                    if (targetMinion.hp <= 0) {
                        setLocalPlayerGrave(g => [...g, targetMinion]);
                    }
                    if (attacker.hp <= 0) {
                        setLocalEnemyGrave(g => [...g, attacker]);
                    }

                    // 盤面更新
                    currentPlayerField[targetMinionIdx] = targetMinion;
                    currentPlayerField = currentPlayerField.filter(c => c.hp > 0);
                    setLocalPlayerField([...currentPlayerField]);

                    // インデックスを維持したまま更新
                    currentEField[attackerIdx] = attacker;
                    setLocalEnemyField(currentEField.filter(c => c.hp > 0));

                } else {
                    triggerPopup(`相手の[${attacker.name}]によるダイレクトアタック`);
                    setLocalPlayerLife(prev => Math.max(0, prev - (attacker.power || 0)));
                }
            }

            // すべての攻撃が終わった後に、死亡したカードを盤面から消去
            currentEField = currentEField.filter(c => c.hp > 0);

            // 攻撃フェイズ終了時の待機
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 【CPUターン終了処理】
            let finalEField = currentEField.map(c => ({ ...c, hasAttacked: false }));
            setLocalEnemyField(finalEField);

            finalEField.forEach(c => { if (c.trigger === "turn_end") executeSkillLocal(c, false); });

            // プレイヤーのターン開始処理
            setLocalPlayerDeck(pDrawRes.d);
            setLocalPlayerHand(pDrawRes.h);

            // 🌟 修正: 直接ライフを上書きせず、もしファティーグ(山札切れ)ダメージを受けていたらそれだけを引く
            if (playerFatigueDamage > 0) {
                setLocalPlayerLife(prev => Math.max(0, prev - playerFatigueDamage));
            }
            if (pDrawRes.g.length !== localPlayerGrave.length) {
                const newGraveCards = pDrawRes.g.slice(localPlayerGrave.length);
                setLocalPlayerGrave(prev => [...prev, ...newGraveCards]);
            }

            setLocalPlayerField(prev => prev.map(c => ({ ...c, hasAttacked: false })));
            setLocalIsPlayerTurn(true);

            // プレイヤーのターン開始時効果
            currentPlayerField.forEach(c => { if (c.trigger === "turn_start") executeSkillLocal(c, true); });

        }, 1200);
    };

    return {
        playerMaxLife, enemyMaxLife, playerLife, enemyLife,
        playerDeck, playerHand, playerField, enemyDeck, enemyHand, enemyField, playerGrave, enemyGrave,
        isPlayerTurn, gameState, selectedAttackerIdx, pendingTarget, pendingPeeping,
        playCard, endPlayerTurn, handleSelectAttacker, handleFightMinion, handleDirectAttack
    };
}