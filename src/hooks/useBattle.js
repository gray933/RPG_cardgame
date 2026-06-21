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
            d = nonManaGrave.sort(() => Math.random() - 0.5);
            g = g.filter(c => c.isMana);
        }
        if (d.length > 0) {
            const drawnCard = d.shift();
            if (h.length < 10) h.push(drawnCard);
            else if (!drawnCard.isMana) g.push(drawnCard);
        }
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

    const executeSkillLocal = async (card, isPlayerContext) => {
        if (!card.effectType || card.effectType === "none") return;
        const val = card.effectValue || 0;

        switch (card.effectType) {
            case "gain_mana":
                triggerPopup(`マナ結晶を ${val} 枚獲得！`);
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
                triggerPopup(`相手に ${val} ダメージ`);
                if (isPlayerContext) setLocalEnemyLife(p => Math.max(0, p - val));
                else setLocalPlayerLife(p => Math.max(0, p - val));
                break;
            case "buff_all_allies":
                triggerPopup(`全体強化`);
                if (isPlayerContext) setLocalPlayerField(f => f.map(c => ({ ...c, power: (c.power || 0) + val, hp: (c.hp || 0) + val })));
                else setLocalEnemyField(f => f.map(c => ({ ...c, power: (c.power || 0) + val, hp: (c.hp || 0) + val })));
                break;
            case "increase_max_hp":
                if (isPlayerContext) { setLocalPlayerMaxLife(p => p + val); setLocalPlayerLife(p => p + val); }
                else { setLocalEnemyMaxLife(p => p + val); setLocalEnemyLife(p => p + val); }
                break;
            case "search_card_to_hand": {
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;
                if (isPlayerContext) {
                    const matchIdx = localPlayerDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && localPlayerHand.length < 10) {
                        triggerPopup(`デッキから [${targetName}] を手札に加えた`);
                        const foundCard = localPlayerDeck[matchIdx];
                        setLocalPlayerDeck(localPlayerDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5));
                        setLocalPlayerHand(prev => [...prev, foundCard]);
                    } else { triggerPopup(`⚠️ デッキに [${targetName}] がありません`); }
                } else {
                    const matchIdx = localEnemyDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && localEnemyHand.length < 10) {
                        triggerPopup(`相手はデッキから手札に加えた`);
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
                        triggerPopup(`デッキから [${targetName}] を場に召喚`);
                        const foundCard = localPlayerDeck[matchIdx];
                        setLocalPlayerDeck(localPlayerDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5));
                        setLocalPlayerField(prev => [...prev, { ...foundCard, hasAttacked: true }]);
                    } else { triggerPopup(`⚠️ 召喚失敗`); }
                } else {
                    const matchIdx = localEnemyDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && localEnemyField.length < 4) {
                        triggerPopup(`敵のデッキから [${targetName}] を召喚`);
                        const foundCard = localEnemyDeck[matchIdx];
                        setLocalEnemyDeck(localEnemyDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5));
                        setLocalEnemyField(prev => [...prev, { ...foundCard, hasAttacked: true }]);
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
                            if (isPlayerContext && localPlayerHand.length < 10) { triggerPopup(`✨ [${targetName}] を生成！`); setLocalPlayerHand(prev => [...prev, generatedCard]); }
                            else if (!isPlayerContext && localEnemyHand.length < 10) { triggerPopup(` 相手が手札にキャラクターを生成！`); setLocalEnemyHand(prev => [...prev, generatedCard]); }
                        }
                    });
                } catch (error) { console.error(error); }
                break;
            }
            case "discard_all_hand":
                if (isPlayerContext) {
                    if (localPlayerHand.length === 0) break;
                    triggerPopup("手札をすべて捨てた");
                    setLocalPlayerGrave(prev => [...prev, ...localPlayerHand.filter(c => !c.isMana)]);
                    setLocalPlayerHand([]);
                } else {
                    if (localEnemyHand.length === 0) break;
                    triggerPopup("相手は手札をすべて捨てた");
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
                    triggerPopup(`相手の手札をランダムに ${disc.length} 枚破壊`);
                } else {
                    if (localPlayerHand.length === 0) break;
                    let newHand = [...localPlayerHand]; let disc = [];
                    for (let i = 0; i < count && newHand.length > 0; i++) disc.push(newHand.splice(Math.floor(Math.random() * newHand.length), 1)[0]);
                    setLocalPlayerHand(newHand); setLocalPlayerGrave(prev => [...prev, ...disc.filter(c => !c.isMana)]);
                    triggerPopup(`自分の手札がランダムに ${disc.length} 枚破壊された`);
                }
                break;
            }
            default: break;
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

        setLocalPlayerMaxLife(20); setLocalEnemyMaxLife(20); setLocalPlayerLife(20); setLocalEnemyLife(20);
        setLocalPlayerDeck(pDeck); setLocalPlayerHand(pHand); setLocalEnemyDeck(eDeck); setLocalEnemyHand(eHand);
        setLocalPlayerField([]); setLocalEnemyField([]); setLocalPlayerGrave([]); setLocalEnemyGrave([]);
        setLocalIsPlayerTurn(true); setLocalGameState('playing'); setSelectedAttackerIdx(null); setPendingTarget(null);
    }, [isPvP, playerDeckData, enemyDeckData]);

    useEffect(() => {
        if (isPvP || localGameState !== 'playing') return;
        if (localEnemyLife <= 0) { setLocalGameState('win'); triggerPopup("🎊 YOU WIN 🎊"); }
        else if (localPlayerLife <= 0) { setLocalGameState('lose'); triggerPopup("💀 YOU LOSE 💀"); }
    }, [isPvP, localPlayerLife, localEnemyLife, localGameState]);

    useEffect(() => {
        if (isPvP || localGameState !== 'playing') return;
        const deadP = localPlayerField.filter(c => c && c.hp <= 0 && !c.isMana);
        if (deadP.length > 0) {
            deadP.forEach(c => { if (c.trigger === "death") executeSkillLocal(c, true); });
            setLocalPlayerGrave(p => [...p, ...deadP]); setLocalPlayerField(p => p.filter(c => c.hp > 0));
        }
        const deadE = localEnemyField.filter(c => c && c.hp <= 0 && !c.isMana);
        if (deadE.length > 0) {
            deadE.forEach(c => { if (c.trigger === "death") executeSkillLocal(c, false); });
            setLocalEnemyGrave(p => [...p, ...deadE]); setLocalEnemyField(p => p.filter(c => c.hp > 0));
        }
    }, [isPvP, localPlayerField, localEnemyField, localGameState]);

    const pushGameStateToDB = async (updates) => {
        if (!roomId) return;
        try { await updateDoc(doc(db, 'rooms', roomId), updates); } catch (e) { console.error(e); }
    };

    const checkGameEndPvP = (updates, nPLife, nELife, nPHand, nEHand) => {
        if (nPHand.filter(c => c?.name === "金塊").length >= 8) { updates['status'] = 'finished'; updates['winner'] = myRole; return; }
        if (nEHand.filter(c => c?.name === "金塊").length >= 8) { updates['status'] = 'finished'; updates['winner'] = enemyRole; return; }
        if (nELife <= 0) { updates['status'] = 'finished'; updates['winner'] = myRole; }
        else if (nPLife <= 0) { updates['status'] = 'finished'; updates['winner'] = enemyRole; }
    };

    const playCard = (handIndex) => {
        if (!isPlayerTurn || gameState !== 'playing' || pendingTarget) return;
        const cardToPlay = playerHand[handIndex];
        if (!cardToPlay || cardToPlay.isMana) return;
        if (cardToPlay.cardType !== "magic" && playerField.length >= 4) { triggerPopup("⚠️ フィールドが満杯です"); return; }

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
            if (available.length < reqCost) { triggerPopup("⚠️ マナが足りません"); return; }
            consumedManaIndices = available.slice(0, reqCost);
        }

        if (cardToPlay.trigger === "play" && TARGETED_EFFECTS.includes(cardToPlay.effectType)) {
            if (cardToPlay.effectType.includes("enemy") && enemyField.length === 0) { triggerPopup("⚠️ 対象となる敵がいません"); return; }
            if (cardToPlay.effectType.includes("ally") && playerField.length === 0) { triggerPopup("⚠️ 対象となる味方がいません"); return; }
            setPendingTarget({ handIndex, card: cardToPlay, consumedManaIndices, initialUpdates: updates });
            triggerPopup("対象を選んでください");
            return;
        }

        finishPlayCard(handIndex, consumedManaIndices, cardToPlay, updates);
    };

    const finishPlayCard = async (handIndex, consumedManaIndices, cardToPlay, initialUpdates = {}) => {
        let newHand = playerHand.filter((_, idx) => idx !== handIndex && !consumedManaIndices.includes(idx));
        let nextGrave = [...playerGrave];
        let nextField = [...playerField];

        if (cardToPlay.cardType === "magic") {
            triggerPopup(`${cardToPlay.name} 発動`); nextGrave.push(cardToPlay);
        } else {
            triggerPopup(`${cardToPlay.name} 召喚`); nextField.push({ ...cardToPlay, hasAttacked: true });
        }

        if (isPvP) {
            let updates = { ...initialUpdates, [`${myPath}.hand`]: newHand, [`${myPath}.graveyard`]: nextGrave, [`${myPath}.field`]: nextField };
            if (cardToPlay.trigger === "play" && !TARGETED_EFFECTS.includes(cardToPlay.effectType)) {
                if (cardToPlay.effectType === "draw_card") {
                    const res = processDraw(cardToPlay.effectValue, playerDeck, newHand, nextGrave, updates[`${myPath}.hp`] || playerLife);
                    updates[`${myPath}.deck`] = res.d; updates[`${myPath}.hand`] = res.h; updates[`${myPath}.graveyard`] = res.g; updates[`${myPath}.hp`] = res.life;
                } else if (cardToPlay.effectType === "damage_all_enemies") {
                    const dmgField = enemyField.map(c => ({ ...c, hp: c.hp - cardToPlay.effectValue }));
                    updates[`${enemyPath}.field`] = dmgField.filter(c => c.hp > 0);
                    updates[`${enemyPath}.graveyard`] = [...enemyGrave, ...dmgField.filter(c => c.hp <= 0 && !c.isMana)];
                }
            }
            checkGameEndPvP(updates, updates[`${myPath}.hp`] || playerLife, updates[`${enemyPath}.hp`] || enemyLife, updates[`${myPath}.hand`] || newHand, enemyHand);
            await pushGameStateToDB(updates);
        } else {
            setLocalPlayerHand(newHand); setLocalPlayerGrave(nextGrave); setLocalPlayerField(nextField);
            if (cardToPlay.trigger === "play" && !TARGETED_EFFECTS.includes(cardToPlay.effectType)) {
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

    // 🌟 単体対象の効果解決処理（復活！）
    const resolveTargetedPlay = async (targetIdx, isEnemyTarget) => {
        if (!pendingTarget || gameState !== 'playing') return;
        const { handIndex, card, consumedManaIndices, initialUpdates } = pendingTarget;

        let extraUpdates = { ...initialUpdates };
        let currentEnemyField = [...(isPvP ? enemyField : localEnemyField)];
        let currentPlayerField = [...(isPvP ? playerField : localPlayerField)];
        let currentEnemyGrave = [...(isPvP ? enemyGrave : localEnemyGrave)];

        if (card.effectType.includes("enemy") && isEnemyTarget) {
            let target = currentEnemyField[targetIdx];
            if (card.effectType === "damage_single_enemy") {
                target.hp -= (card.effectValue || 0);
                triggerPopup(`[${target.name}] に ${card.effectValue} ダメージ`);
            } else if (card.effectType === "destroy_single_enemy") {
                target.hp = 0;
                triggerPopup(`[${target.name}] を破壊`);
            }

            const deadE = currentEnemyField.filter(c => c.hp <= 0 && !c.isMana);
            currentEnemyGrave.push(...deadE);
            currentEnemyField = currentEnemyField.filter(c => c.hp > 0);

            if (isPvP) {
                extraUpdates[`${enemyPath}.field`] = currentEnemyField;
                extraUpdates[`${enemyPath}.graveyard`] = currentEnemyGrave;
            } else {
                setLocalEnemyField(currentEnemyField);
                setLocalEnemyGrave(currentEnemyGrave);
            }

        } else if (card.effectType.includes("ally") && !isEnemyTarget) {
            let target = currentPlayerField[targetIdx];
            if (card.effectType === "buff_single_ally") {
                const val = card.effectValue || 0;
                target.power += val;
                target.hp += val;
                triggerPopup(`[${target.name}] を強化`);
            }
            if (isPvP) extraUpdates[`${myPath}.field`] = currentPlayerField;
            else setLocalPlayerField(currentPlayerField);
        } else {
            triggerPopup("⚠️ 対象が不正です。キャンセルしました。");
            setPendingTarget(null);
            return;
        }

        setPendingTarget(null);
        finishPlayCard(handIndex, consumedManaIndices, card, extraUpdates);
    };

    const handleSelectAttacker = (fieldIndex) => {
        if (!isPlayerTurn || gameState !== 'playing') return;
        if (pendingTarget) { resolveTargetedPlay(fieldIndex, false); return; } // 味方を対象に取る場合
        if (playerField[fieldIndex].hasAttacked) return;
        setSelectedAttackerIdx(selectedAttackerIdx === fieldIndex ? null : fieldIndex);
    };

    const handleFightMinion = async (enemyFieldIndex) => {
        if (!isPlayerTurn || gameState !== 'playing') return;
        if (pendingTarget) { resolveTargetedPlay(enemyFieldIndex, true); return; } // 敵を対象に取る場合

        if (selectedAttackerIdx === null) return;
        const attacker = { ...playerField[selectedAttackerIdx] };
        const defender = { ...enemyField[enemyFieldIndex] };
        triggerPopup(`${attacker.name} の攻撃`);

        // 🌟 【復活】攻撃時のトリガー処理
        if (!isPvP && attacker.trigger === "attack") executeSkillLocal(attacker, true);

        attacker.hp -= (defender.power || 0); defender.hp -= (attacker.power || 0);
        attacker.hasAttacked = true;

        let nPField = playerField.map((c, i) => i === selectedAttackerIdx ? attacker : c);
        let nEField = enemyField.map((c, i) => i === enemyFieldIndex ? defender : c);

        if (isPvP) {
            let updates = {
                [`${myPath}.field`]: nPField.filter(c => c.hp > 0),
                [`${myPath}.graveyard`]: [...playerGrave, ...nPField.filter(c => c.hp <= 0 && !c.isMana)],
                [`${enemyPath}.field`]: nEField.filter(c => c.hp > 0),
                [`${enemyPath}.graveyard`]: [...enemyGrave, ...nEField.filter(c => c.hp <= 0 && !c.isMana)]
            };
            setSelectedAttackerIdx(null); await pushGameStateToDB(updates);
        } else {
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

        // 🌟 【復活】攻撃時のトリガー処理
        if (!isPvP && attacker.trigger === "attack") executeSkillLocal(attacker, true);

        const nextELife = Math.max(0, enemyLife - (attacker.power || 0));
        const nPField = playerField.map((c, i) => i === selectedAttackerIdx ? { ...c, hasAttacked: true } : c);

        if (isPvP) {
            let updates = { [`${enemyPath}.hp`]: nextELife, [`${myPath}.field`]: nPField };
            checkGameEndPvP(updates, playerLife, nextELife, playerHand, enemyHand);
            setSelectedAttackerIdx(null); await pushGameStateToDB(updates);
        } else {
            setLocalEnemyLife(nextELife); setLocalPlayerField(nPField); setSelectedAttackerIdx(null);
        }
    };

    const endPlayerTurn = () => {
        if (gameState !== 'playing' || pendingTarget) return;

        // 🌟 【復活】自分のターン終了時効果
        if (!isPvP) {
            localPlayerField.forEach(c => { if (c.trigger === "turn_end") executeSkillLocal(c, true); });
        }

        if (isPvP) {
            setSelectedAttackerIdx(null);
            let eDrawRes = processDraw(1, enemyDeck, enemyHand, enemyGrave, enemyLife);
            if (eDrawRes.h.length < 10) eDrawRes.h.push(JSON.parse(JSON.stringify(MANA_CARD)));
            let updates = {
                "currentTurn": enemyRole,
                "turnCount": roomData.turnCount + (myRole === 'guest' ? 1 : 0),
                [`${enemyPath}.deck`]: eDrawRes.d, [`${enemyPath}.hand`]: eDrawRes.h,
                [`${enemyPath}.graveyard`]: eDrawRes.g, [`${enemyPath}.hp`]: eDrawRes.life,
                [`${enemyPath}.field`]: enemyField.map(c => ({ ...c, hasAttacked: false }))
            };
            checkGameEndPvP(updates, playerLife, eDrawRes.life, playerHand, eDrawRes.h);
            pushGameStateToDB(updates);
            return;
        }

        setLocalIsPlayerTurn(false); setSelectedAttackerIdx(null);

        // 🌟 【復活】敵のターン開始時効果
        localEnemyField.forEach(c => { if (c.trigger === "turn_start") executeSkillLocal(c, false); });

        let pDrawRes = processDraw(1, localPlayerDeck, localPlayerHand, localPlayerGrave, localPlayerLife);
        if (pDrawRes.h.length < 10) pDrawRes.h.push(JSON.parse(JSON.stringify(MANA_CARD)));

        setTimeout(() => {
            if (localGameState !== 'playing') return;
            let eDrawRes = processDraw(1, localEnemyDeck, localEnemyHand, localEnemyGrave, localEnemyLife);
            if (eDrawRes.h.length < 10) eDrawRes.h.push(JSON.parse(JSON.stringify(MANA_CARD)));

            let newEField = [...localEnemyField]; let currentEnemyHand = [...eDrawRes.h];
            let loopSafety = 0;

            while (newEField.length < 4 && loopSafety < 10) {
                loopSafety++;
                const aiMana = currentEnemyHand.filter(c => c.isMana).length;
                const playable = currentEnemyHand
                    .map((c, i) => ({ card: c, originalIdx: i }))
                    .filter(item => !item.card.isMana && item.card.cardType !== 'magic' && aiMana >= (item.card.cost || 1))
                    .sort((a, b) => (b.card.cost || 0) - (a.card.cost || 0));

                if (playable.length === 0) break;
                const targetItem = playable[0];
                const cost = targetItem.card.cost || 1;

                let consumed = 0;
                currentEnemyHand = currentEnemyHand.filter(c => !(c.isMana && consumed < cost && ++consumed));
                currentEnemyHand = currentEnemyHand.filter((_, idx) => idx !== targetItem.originalIdx);

                triggerPopup(`相手が[${targetItem.card.name}]を召喚`);
                newEField.push({ ...targetItem.card, hasAttacked: true });

                // 敵の召喚時（play）効果
                if (targetItem.card.trigger === "play") executeSkillLocal(targetItem.card, false);
            }

            setLocalEnemyDeck(eDrawRes.d); setLocalEnemyHand(currentEnemyHand); setLocalEnemyField(newEField);

            let currentPlayerField = [...localPlayerField].filter(c => c.hp > 0);
            const readyAttackers = newEField.filter(card => !card.hasAttacked);

            if (readyAttackers.length === 0) {
                // 🌟 【復活】敵のターン終了時効果
                newEField.forEach(c => { if (c.trigger === "turn_end") executeSkillLocal(c, false); });

                // ⭕️ 先にターンのドロー処理などを終わらせて手札を確定させる
                setLocalPlayerDeck(pDrawRes.d); setLocalPlayerHand(pDrawRes.h); setLocalPlayerGrave(pDrawRes.g); setLocalPlayerLife(pDrawRes.life);
                setLocalPlayerField(prev => prev.map(c => ({ ...c, hasAttacked: false }))); setLocalIsPlayerTurn(true);

                // ⭕️ 最後に自分のターン開始時効果を発動させる！
                localPlayerField.forEach(c => { if (c.trigger === "turn_start") executeSkillLocal(c, true); });
            } else {
                let currentAttackerIdx = 0;
                const attackRoutine = setInterval(() => {
                    if (localPlayerLife <= 0 || localGameState !== 'playing') { clearInterval(attackRoutine); return; }
                    if (currentAttackerIdx < readyAttackers.length) {
                        const attacker = readyAttackers[currentAttackerIdx];

                        // 🌟 【復活】敵AIの攻撃時トリガー処理
                        if (attacker.trigger === "attack") executeSkillLocal(attacker, false);

                        let targetMinionIdx = currentPlayerField.findIndex(em => (attacker.power || 0) >= (em.hp || 0));

                        if (targetMinionIdx !== -1) {
                            const targetMinion = currentPlayerField[targetMinionIdx];
                            triggerPopup(`相手の [${attacker.name}] が [${targetMinion.name}] を攻撃`);
                            targetMinion.hp -= (attacker.power || 0); attacker.hp -= (targetMinion.power || 0);

                            if (targetMinion.hp <= 0) setLocalPlayerGrave(g => [...g, targetMinion]);
                            if (attacker.hp <= 0) setLocalEnemyGrave(g => [...g, attacker]);

                            currentPlayerField = currentPlayerField.filter(c => c.hp > 0);
                            setLocalPlayerField(currentPlayerField);
                        } else {
                            triggerPopup(`相手の [${attacker.name}] のダイレクトアタック`);
                            setLocalPlayerLife(prev => Math.max(0, prev - (attacker.power || 0)));
                        }
                        currentAttackerIdx++;
                    } else {
                        clearInterval(attackRoutine);
                        setLocalEnemyField(prev => prev.map(c => ({ ...c, hasAttacked: false })));

                        // 🌟 【復活】敵のターン終了時効果
                        newEField.forEach(c => { if (c.trigger === "turn_end") executeSkillLocal(c, false); });

                        // ⭕️ 先にターンのドロー処理などを終わらせて手札を確定させる
                        setLocalPlayerDeck(pDrawRes.d); setLocalPlayerHand(pDrawRes.h); setLocalPlayerGrave(pDrawRes.g); setLocalPlayerLife(pDrawRes.life);
                        setLocalPlayerField(prev => prev.map(c => ({ ...c, hasAttacked: false }))); setLocalIsPlayerTurn(true);

                        // ⭕️ 最後に自分のターン開始時効果を発動させる！
                        localPlayerField.forEach(c => { if (c.trigger === "turn_start") executeSkillLocal(c, true); });
                    }
                }, 1200);
            }
        }, 1200);
    };

    return {
        playerMaxLife, enemyMaxLife, playerLife, enemyLife,
        playerDeck, playerHand, playerField, enemyDeck, enemyHand, enemyField, playerGrave, enemyGrave,
        isPlayerTurn, gameState, selectedAttackerIdx, pendingTarget, pendingPeeping,
        playCard, endPlayerTurn, handleSelectAttacker, handleFightMinion, handleDirectAttack
    };
}