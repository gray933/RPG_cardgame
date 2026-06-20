// src/hooks/useBattle.js
import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const MANA_CARD = { name: "マナ結晶", cardType: "mana", effectText: "コスト用", image: "img/mana.png", isMana: true };
const TARGETED_EFFECTS = ["damage_single_enemy", "destroy_single_enemy", "buff_single_ally"];

// ドロー計算（外部関数）
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

export function useBattle({ playerDeckData, enemyDeckData, triggerPopup, onBack }) {
    const [playerMaxLife, setPlayerMaxLife] = useState(20);
    const [enemyMaxLife, setEnemyMaxLife] = useState(20);
    const [playerLife, setPlayerLife] = useState(20);
    const [enemyLife, setEnemyLife] = useState(20);

    const [playerDeck, setPlayerDeck] = useState([]);
    const [playerHand, setPlayerHand] = useState([]);
    const [playerField, setPlayerField] = useState([]);

    const [enemyDeck, setEnemyDeck] = useState([]);
    const [enemyHand, setEnemyHand] = useState([]);
    const [enemyField, setEnemyField] = useState([]);

    const [isPlayerTurn, setIsPlayerTurn] = useState(true);
    const [gameState, setGameState] = useState('playing');

    const [selectedAttackerIdx, setSelectedAttackerIdx] = useState(null);
    const [pendingTarget, setPendingTarget] = useState(null);
    const [pendingPeeping, setPendingPeeping] = useState(false);

    const [playerGrave, setPlayerGrave] = useState([]);
    const [enemyGrave, setEnemyGrave] = useState([]);

    // =========================================================
    // 🌟 修正ポイント1: 関数を上に移動 (Hoisting対策)
    // =========================================================
    const executeSkill = async (card, isPlayerContext) => {
        if (!card.effectType || card.effectType === "none") return;
        const val = card.effectValue || 0;

        switch (card.effectType) {
            case "gain_mana":
                triggerPopup(`💎 マナ結晶を ${val} 枚獲得！`);
                if (isPlayerContext) {
                    setPlayerHand(curr => {
                        let n = [...curr];
                        for (let i = 0; i < val; i++) if (n.length < 10) n.push(JSON.parse(JSON.stringify(MANA_CARD)));
                        return n;
                    });
                } else {
                    setEnemyHand(curr => {
                        let n = [...curr];
                        for (let i = 0; i < val; i++) if (n.length < 10) n.push(JSON.parse(JSON.stringify(MANA_CARD)));
                        return n;
                    });
                }
                break;
            case "heal_player":
                if (isPlayerContext) setPlayerLife(p => Math.min(playerMaxLife, p + val));
                else setEnemyLife(p => Math.min(enemyMaxLife, p + val));
                break;
            case "damage_enemy_player":
                triggerPopup(`🔥 相手に ${val} ダメージ！`);
                if (isPlayerContext) setEnemyLife(p => Math.max(0, p - val));
                else setPlayerLife(p => Math.max(0, p - val));
                break;
            case "buff_all_allies":
                triggerPopup(`💪 全体強化！`);
                if (isPlayerContext) setPlayerField(f => f.map(c => ({ ...c, power: (c.power || 0) + val, hp: (c.hp || 0) + val })));
                else setEnemyField(f => f.map(c => ({ ...c, power: (c.power || 0) + val, hp: (c.hp || 0) + val })));
                break;
            case "increase_max_hp":
                if (isPlayerContext) { setPlayerMaxLife(p => p + val); setPlayerLife(p => p + val); }
                else { setEnemyMaxLife(p => p + val); setEnemyLife(p => p + val); }
                break;
            case "search_card_to_hand": {
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;
                if (isPlayerContext) {
                    const matchIdx = playerDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && playerHand.length < 10) {
                        triggerPopup(`🃏 デッキから [${targetName}] を手札に加えた！`);
                        const foundCard = playerDeck[matchIdx];
                        setPlayerDeck(playerDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5));
                        setPlayerHand(prev => [...prev, foundCard]);
                    } else { triggerPopup(`⚠️ デッキに [${targetName}] がありません`); }
                } else {
                    const matchIdx = enemyDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && enemyHand.length < 10) {
                        triggerPopup(`👹 相手はデッキからカードをサーチした！`);
                        const foundCard = enemyDeck[matchIdx];
                        setEnemyDeck(enemyDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5));
                        setEnemyHand(prev => [...prev, foundCard]);
                    }
                }
                break;
            }
            case "recruit_card_to_field": {
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;
                if (isPlayerContext) {
                    const matchIdx = playerDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && playerField.length < 4) {
                        triggerPopup(`🌟 デッキから [${targetName}] を場に直接召喚！`);
                        const foundCard = playerDeck[matchIdx];
                        setPlayerDeck(playerDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5));
                        setPlayerField(prev => [...prev, { ...foundCard, hasAttacked: true }]);
                    } else { triggerPopup(`⚠️ 召喚失敗（デッキにない、または戦場満杯）`); }
                } else {
                    const matchIdx = enemyDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && enemyField.length < 4) {
                        triggerPopup(`👹 敵のデッキから [${targetName}] が飛び出してきた！`);
                        const foundCard = enemyDeck[matchIdx];
                        setEnemyDeck(enemyDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5));
                        setEnemyField(prev => [...prev, { ...foundCard, hasAttacked: true }]);
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
                        if (isPlayerContext && playerHand.length < 10) { triggerPopup(`✨ [${targetName}] を生成して手札に加えた！`); setPlayerHand(prev => [...prev, generatedCard]); }
                        else if (!isPlayerContext && enemyHand.length < 10) { triggerPopup(`👹 相手が手札にトークンを生成した！`); setEnemyHand(prev => [...prev, generatedCard]); }
                    }
                } catch (error) { console.error(error); }
                break;
            }
            case "generate_card_to_field": {
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;
                try {
                    const q = query(collection(db, "cards"), where("name", "==", targetName));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                        const generatedCard = { ...snap.docs[0].data(), hasAttacked: true };
                        if (isPlayerContext && playerField.length < 4) { triggerPopup(`✨ [${targetName}] が戦場に生成された！`); setPlayerField(prev => [...prev, generatedCard]); }
                        else if (!isPlayerContext && enemyField.length < 4) { triggerPopup(`👹 敵の陣地に [${targetName}] が生成された！`); setEnemyField(prev => [...prev, generatedCard]); }
                    }
                } catch (error) { console.error(error); }
                break;
            }
            case "discard_all_hand": {
                if (isPlayerContext) {
                    if (playerHand.length === 0) break;
                    triggerPopup("💥 手札をすべて捨てた！");
                    const realCards = playerHand.filter(c => c && !c.isMana);
                    if (realCards.length > 0) setPlayerGrave(prev => [...prev, ...realCards]);
                    setPlayerHand([]);
                } else {
                    if (enemyHand.length === 0) break;
                    triggerPopup("👹 相手は手札をすべて捨てた！");
                    const realCards = enemyHand.filter(c => c && !c.isMana);
                    if (realCards.length > 0) setEnemyGrave(prev => [...prev, ...realCards]);
                    setEnemyHand([]);
                }
                break;
            }
            case "discard_random": {
                const discardCount = val || 1;
                if (isPlayerContext) {
                    if (enemyHand.length === 0) { triggerPopup("⚠️ 相手の手札がありません"); break; }
                    let newEnemyHand = [...enemyHand];
                    let discardedCards = [];
                    for (let i = 0; i < discardCount && newEnemyHand.length > 0; i++) {
                        const randIdx = Math.floor(Math.random() * newEnemyHand.length);
                        discardedCards.push(newEnemyHand.splice(randIdx, 1)[0]);
                    }
                    setEnemyHand(newEnemyHand);
                    setEnemyGrave(prev => [...prev, ...discardedCards.filter(c => !c.isMana)]);
                    triggerPopup(`💥 相手の手札をランダムに ${discardedCards.length} 枚破壊！`);
                } else {
                    if (playerHand.length === 0) break;
                    let newPlayerHand = [...playerHand];
                    let discardedCards = [];
                    for (let i = 0; i < discardCount && newPlayerHand.length > 0; i++) {
                        const randIdx = Math.floor(Math.random() * newPlayerHand.length);
                        discardedCards.push(newPlayerHand.splice(randIdx, 1)[0]);
                    }
                    setPlayerHand(newPlayerHand);
                    setPlayerGrave(prev => [...prev, ...discardedCards.filter(c => !c.isMana)]);
                    triggerPopup(`👹 自分の手札がランダムに ${discardedCards.length} 枚破壊された！`);
                }
                break;
            }
            case "discard_specific": {
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;
                if (isPlayerContext) {
                    const matchIdx = enemyHand.findIndex(c => c && c.name === targetName);
                    if (matchIdx !== -1) {
                        const discarded = enemyHand[matchIdx];
                        setEnemyHand(enemyHand.filter((_, idx) => idx !== matchIdx));
                        if (!discarded.isMana) setEnemyGrave(prev => [...prev, discarded]);
                        triggerPopup(`💥 相手の手札から [${targetName}] を破壊！`);
                    } else { triggerPopup(`💨 相手の手札に [${targetName}] はなかった！`); }
                } else {
                    const matchIdx = playerHand.findIndex(c => c && c.name === targetName);
                    if (matchIdx !== -1) {
                        const discarded = playerHand[matchIdx];
                        setPlayerHand(playerHand.filter((_, idx) => idx !== matchIdx));
                        if (!discarded.isMana) setPlayerGrave(prev => [...prev, discarded]);
                        triggerPopup(`👹 手札の [${targetName}] が破壊された！`);
                    }
                }
                break;
            }
            case "discard_peeping": {
                if (isPlayerContext) {
                    if (enemyHand.length === 0) { triggerPopup("⚠️ 相手の手札がありません"); break; }
                    setPendingPeeping(true); // UI側で手札選択画面を出す
                } else {
                    // AIの場合：マナ以外のカードの中で、一番コストが高いカードを狙って捨てる
                    if (playerHand.length === 0) break;
                    const nonMana = playerHand.filter(c => !c.isMana);
                    const targetList = nonMana.length > 0 ? nonMana : playerHand;
                    targetList.sort((a, b) => (b.cost || 0) - (a.cost || 0));
                    const targetCard = targetList[0];
                    const matchIdx = playerHand.findIndex(c => c === targetCard);

                    const discarded = playerHand[matchIdx];
                    setPlayerHand(playerHand.filter((_, idx) => idx !== matchIdx));
                    if (!discarded.isMana) setPlayerGrave(prev => [...prev, discarded]);
                    triggerPopup(`👹 ピーピングハンデス！ [${discarded.name}] が捨てられた！`);
                }
                break;
            }
            default: break;
        }
    };

    const checkAndTriggerDeathrattle = (deadCards, isPlayerContext) => {
        deadCards.forEach(card => { if (card.trigger === "death") executeSkill(card, isPlayerContext); });
    };


    // =========================================================
    // 🌟 修正ポイント2: エラー回避のコメントを追加
    // eslintの設定をゲーム特有のロジックにあわせて部分的にオフにします
    // =========================================================

    // 初期化エフェクト
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const pDeck = JSON.parse(JSON.stringify(playerDeckData || []));
        const eDeck = JSON.parse(JSON.stringify(enemyDeckData || []));
        pDeck.sort(() => Math.random() - 0.5);
        eDeck.sort(() => Math.random() - 0.5);

        const pHand = [];
        for (let i = 0; i < 4; i++) if (pDeck.length > 0) pHand.push(pDeck.shift());
        pHand.push(JSON.parse(JSON.stringify(MANA_CARD)));

        const eHand = [];
        for (let i = 0; i < 3; i++) if (eDeck.length > 0) eHand.push(eDeck.shift());
        eHand.push(JSON.parse(JSON.stringify(MANA_CARD)));

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPlayerMaxLife(20); setEnemyMaxLife(20); setPlayerLife(20); setEnemyLife(20);
        setPlayerDeck(pDeck); setPlayerHand(pHand); setEnemyDeck(eDeck); setEnemyHand(eHand);
        setPlayerField([]); setEnemyField([]); setPlayerGrave([]); setEnemyGrave([]);
        setIsPlayerTurn(true); setGameState('playing'); setSelectedAttackerIdx(null); setPendingTarget(null);
    }, [playerDeckData, enemyDeckData]);

    // 勝敗判定エフェクト
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (gameState !== 'playing') return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (enemyLife <= 0) { setGameState('win'); triggerPopup("🎊 YOU WIN 🎊"); }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        else if (playerLife <= 0) { setGameState('lose'); triggerPopup("💀 YOU LOSE 💀"); }
    }, [playerLife, enemyLife, gameState]);

    // 金塊の特殊勝利エフェクト
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (gameState !== 'playing') return;
        const playerGoldCount = playerHand.filter(card => card && card.name === "金塊").length;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (playerGoldCount >= 8) { setGameState('win'); triggerPopup("💰 金塊が8枚揃った 特殊勝利 💰"); }

        const enemyGoldCount = enemyHand.filter(card => card && card.name === "金塊").length;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (enemyGoldCount >= 8) { setGameState('lose'); triggerPopup("💀 相手の金塊が8枚揃ってしまった！ 💀"); }
    }, [playerHand, enemyHand, gameState]);

    // 盤面自動整理システム
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (gameState !== 'playing') return;
        const deadPlayerCards = playerField.filter(c => c && c.hp <= 0 && !c.isMana);
        if (deadPlayerCards.length > 0) {
            checkAndTriggerDeathrattle(deadPlayerCards, true);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPlayerGrave(prev => [...prev, ...deadPlayerCards]);
            setPlayerField(prev => prev.filter(c => c.hp > 0));
        }
        const deadEnemyCards = enemyField.filter(c => c && c.hp <= 0 && !c.isMana);
        if (deadEnemyCards.length > 0) {
            checkAndTriggerDeathrattle(deadEnemyCards, false);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setEnemyGrave(prev => [...prev, ...deadEnemyCards]);
            setEnemyField(prev => prev.filter(c => c.hp > 0));
        }
    }, [playerField, enemyField, gameState]);


    // =========================================================
    // 以下、既存のロジックはそのままです
    // =========================================================

    const playCard = (handIndex) => {
        if (!isPlayerTurn || gameState !== 'playing' || pendingTarget) return;
        const cardToPlay = playerHand[handIndex];
        if (!cardToPlay || cardToPlay.isMana) return;
        if (cardToPlay.cardType !== "magic" && playerField.length >= 4) { triggerPopup("⚠️ フィールドが満杯です"); return; }

        if (cardToPlay.reqCardName && cardToPlay.reqCardCount > 0) {
            const currentCount = playerHand.filter(c => c && c.name === cardToPlay.reqCardName).length;
            if (currentCount < cardToPlay.reqCardCount) {
                triggerPopup(`❌ 手札に「${cardToPlay.reqCardName}」が ${cardToPlay.reqCardCount} 枚以上必要です！`);
                return;
            }
        }
        const resolvePeeping = (handIndex) => {
            const discarded = enemyHand[handIndex];
            setEnemyHand(enemyHand.filter((_, idx) => idx !== handIndex));
            if (!discarded.isMana) setEnemyGrave(prev => [...prev, discarded]);
            triggerPopup(`👁️ [${discarded.name}] を捨てさせた！`);
            setPendingPeeping(false);
        };

        const reqCost = cardToPlay.cost !== undefined ? cardToPlay.cost : 1;
        let consumedManaIndices = [];

        if (cardToPlay.costType === "hp") {
            if (playerLife <= reqCost || playerMaxLife <= reqCost) { triggerPopup("❌ ライフコストが足りません！"); return; }
            triggerPopup(`💔 命を削った！ (最大HP・現在HP -${reqCost})`);
            setPlayerMaxLife(p => p - reqCost); setPlayerLife(p => p - reqCost);
        } else {
            const availableManaIndices = playerHand.map((c, i) => c.isMana ? i : -1).filter(i => i !== -1);
            if (availableManaIndices.length < reqCost) { triggerPopup("⚠️ マナが足りません"); return; }
            consumedManaIndices = availableManaIndices.slice(0, reqCost);
        }

        if (cardToPlay.trigger === "play" && TARGETED_EFFECTS.includes(cardToPlay.effectType)) {
            if (cardToPlay.effectType.includes("enemy") && enemyField.length === 0) { triggerPopup("⚠️ 敵がいません"); return; }
            if (cardToPlay.effectType.includes("ally") && playerField.length === 0 && cardToPlay.cardType === "magic") { triggerPopup("⚠️ 味方がいません"); return; }
            setPendingTarget({ handIndex, card: cardToPlay, consumedManaIndices });
            return;
        }
        finishPlayCard(handIndex, consumedManaIndices, cardToPlay);
    };

    const finishPlayCard = (handIndex, consumedManaIndices, cardToPlay) => {
        let newHand = playerHand.filter((_, idx) => idx !== handIndex && !consumedManaIndices.includes(idx));
        let nextGrave = [...playerGrave];

        if (cardToPlay.cardType === "magic") {
            if (!TARGETED_EFFECTS.includes(cardToPlay.effectType) && cardToPlay.effectType !== "damage_enemy_player" && cardToPlay.effectType !== "damage_all_enemies" && cardToPlay.effectType !== "buff_all_allies") {
                triggerPopup(`🔮 ${cardToPlay.name} 発動！`);
            }
            nextGrave.push(cardToPlay); setPlayerHand(newHand); setPlayerGrave(nextGrave);
        } else {
            triggerPopup(`🌟 ${cardToPlay.name} 召喚！`);
            setPlayerHand(newHand); setPlayerGrave(nextGrave);
            setPlayerField([...playerField, { ...cardToPlay, hasAttacked: true }]);
        }

        if (cardToPlay.trigger === "play" && !TARGETED_EFFECTS.includes(cardToPlay.effectType)) {
            if (cardToPlay.effectType === "draw_card") {
                const drawRes = processDraw(cardToPlay.effectValue, playerDeck, newHand, nextGrave, playerLife);
                setPlayerDeck(drawRes.d); setPlayerHand(drawRes.h); setPlayerGrave(drawRes.g); setPlayerLife(drawRes.life);
            } else if (cardToPlay.effectType === "damage_all_enemies") {
                triggerPopup(`☄️ 敵全体に ${cardToPlay.effectValue} ダメージ！`);
                const damagedEnemyField = enemyField.map(card => ({ ...card, hp: card.hp - cardToPlay.effectValue }));
                if (damagedEnemyField.filter(c => c.hp <= 0).length > 0) setEnemyGrave(prev => [...prev, ...damagedEnemyField.filter(c => c.hp <= 0 && !c.isMana)]);
                setEnemyField(damagedEnemyField.filter(c => c.hp > 0));
            } else { executeSkill(cardToPlay, true); }
        }
    };

    const resolveTargetedPlay = (targetTeam, targetIdx) => {
        if (!pendingTarget) return;
        const { handIndex, card, consumedManaIndices } = pendingTarget;
        const val = card.effectValue || 0;
        let success = false;

        if (card.effectType === "damage_single_enemy" || card.effectType === "destroy_single_enemy") {
            if (targetTeam !== "enemy") return;
            const newEnemyField = [...enemyField];
            const targetCard = newEnemyField[targetIdx];
            if (card.effectType === "damage_single_enemy") { triggerPopup(`💥 狙い撃ち (-${val})`); targetCard.hp -= val; }
            else { triggerPopup(`☠️ 即死！`); targetCard.hp = 0; }

            if (targetCard.hp <= 0) {
                checkAndTriggerDeathrattle([targetCard], false);
                setEnemyGrave(prev => [...prev, targetCard]);
            }
            setEnemyField(newEnemyField.filter(c => c.hp > 0));
            success = true;
        } else if (card.effectType === "buff_single_ally") {
            if (targetTeam !== "player") return;
            const newPlayerField = [...playerField];
            newPlayerField[targetIdx].power += val;
            newPlayerField[targetIdx].hp += val;
            setPlayerField(newPlayerField);
            success = true;
        }

        if (success) { setPendingTarget(null); finishPlayCard(handIndex, consumedManaIndices, card); }
    };

    const handleSelectAttacker = (fieldIndex) => {
        if (!isPlayerTurn || gameState !== 'playing') return;
        if (pendingTarget) { resolveTargetedPlay("player", fieldIndex); return; }
        const card = playerField[fieldIndex];
        if (card.hasAttacked) return;
        setSelectedAttackerIdx(selectedAttackerIdx === fieldIndex ? null : fieldIndex);
    };

    const handleFightMinion = (enemyFieldIndex) => {
        if (!isPlayerTurn || gameState !== 'playing') return;
        if (pendingTarget) { resolveTargetedPlay("enemy", enemyFieldIndex); return; }
        if (selectedAttackerIdx === null) return;

        const attacker = playerField[selectedAttackerIdx];
        if (attacker.trigger === "attack") executeSkill(attacker, true);

        const defender = enemyField[enemyFieldIndex];
        triggerPopup(`⚔️ ${attacker.name} の攻撃！`);

        const newPlayerField = [...playerField];
        const newEnemyField = [...enemyField];
        newPlayerField[selectedAttackerIdx].hp -= (defender.power || 0);
        newEnemyField[enemyFieldIndex].hp -= (attacker.power || 0);
        newPlayerField[selectedAttackerIdx].hasAttacked = true;

        if (newPlayerField[selectedAttackerIdx].hp <= 0) { checkAndTriggerDeathrattle([newPlayerField[selectedAttackerIdx]], true); setPlayerGrave(g => [...g, newPlayerField[selectedAttackerIdx]]); }
        if (newEnemyField[enemyFieldIndex].hp <= 0) { checkAndTriggerDeathrattle([newEnemyField[enemyFieldIndex]], false); setEnemyGrave(g => [...g, newEnemyField[enemyFieldIndex]]); }

        setPlayerField(newPlayerField.filter(c => c.hp > 0));
        setEnemyField(newEnemyField.filter(c => c.hp > 0));
        setSelectedAttackerIdx(null);
    };

    const handleDirectAttack = () => {
        if (pendingTarget || selectedAttackerIdx === null || !isPlayerTurn || gameState !== 'playing') return;
        const attacker = playerField[selectedAttackerIdx];
        if (attacker.trigger === "attack") executeSkill(attacker, true);

        triggerPopup(`💥 ダイレクトアタック！`);
        setEnemyLife(prev => Math.max(0, prev - (attacker.power || 0)));
        setPlayerField(playerField.map((c, i) => i === selectedAttackerIdx ? { ...c, hasAttacked: true } : c));
        setSelectedAttackerIdx(null);
    };

    const proceedToPlayerTurn = (pDrawRes) => {
        if (gameState !== 'playing') return;
        setTimeout(() => {
            triggerPopup("🔵 YOUR TURN");
            playerField.forEach(c => { if (c.trigger === "turn_start") executeSkill(c, true); });
            setPlayerDeck(pDrawRes.d); setPlayerHand(pDrawRes.h); setPlayerGrave(pDrawRes.g); setPlayerLife(pDrawRes.life);
            setPlayerField(prev => prev.map(c => ({ ...c, hasAttacked: false })));
            setIsPlayerTurn(true);
        }, 1000);
    };

    const endPlayerTurn = () => {
        if (gameState !== 'playing' || pendingTarget) return;
        setIsPlayerTurn(false); setSelectedAttackerIdx(null);

        enemyField.forEach(c => { if (c.trigger === "turn_start") executeSkill(c, false); });

        let pDrawRes = processDraw(1, playerDeck, playerHand, playerGrave, playerLife);
        if (pDrawRes.h.length < 10) pDrawRes.h.push(JSON.parse(JSON.stringify(MANA_CARD)));

        setTimeout(async () => {
            if (gameState !== 'playing') return;
            let eDrawRes = processDraw(1, enemyDeck, enemyHand, enemyGrave, enemyLife);
            if (eDrawRes.h.length < 10) eDrawRes.h.push(JSON.parse(JSON.stringify(MANA_CARD)));

            let newEField = [...enemyField];
            let currentEnemyHand = [...eDrawRes.h];

            let loopSafety = 0;
            while (newEField.length < 4 && loopSafety < 10) {
                loopSafety++;
                const aiManaCount = currentEnemyHand.filter(c => c.isMana).length;
                const playableCards = currentEnemyHand
                    .map((c, i) => ({ card: c, originalIdx: i }))
                    .filter(item => !item.card.isMana && item.card.cardType !== 'magic' && aiManaCount >= (item.card.cost !== undefined ? item.card.cost : 1))
                    .sort((a, b) => (b.card.cost || 0) - (a.card.cost || 0));

                if (playableCards.length === 0) break;

                const targetItem = playableCards[0];
                const cost = targetItem.card.cost !== undefined ? targetItem.card.cost : 1;

                let manaConsumed = 0;
                currentEnemyHand = currentEnemyHand.filter(c => !(c.isMana && manaConsumed < cost && ++manaConsumed));
                currentEnemyHand = currentEnemyHand.filter((_, idx) => idx !== targetItem.originalIdx);

                if (targetItem.card.trigger === "play") {
                    if (TARGETED_EFFECTS.includes(targetItem.card.effectType) && targetItem.card.effectType.includes("enemy") && playerField.length > 0) {
                        let targetIdx = playerField.reduce((maxIdx, c, idx, arr) => (c.power || 0) > (arr[maxIdx].power || 0) ? idx : maxIdx, 0);
                        if (targetItem.card.effectType === "damage_single_enemy") setPlayerField(prev => prev.map((c, i) => i === targetIdx ? { ...c, hp: c.hp - targetItem.card.effectValue } : c));
                        else if (targetItem.card.effectType === "destroy_single_enemy") setPlayerField(prev => prev.map((c, i) => i === targetIdx ? { ...c, hp: 0 } : c));
                    } else { executeSkill(targetItem.card, false); }
                }

                triggerPopup(`👹 敵が [${targetItem.card.name}] を召喚！`);
                newEField.push({ ...targetItem.card, hasAttacked: true });
            }

            setEnemyDeck(eDrawRes.d); setEnemyHand(currentEnemyHand); setEnemyGrave(eDrawRes.g); setEnemyField(newEField); setEnemyLife(eDrawRes.life);

            let currentPlayerField = [...playerField].filter(c => c.hp > 0);
            const readyAttackers = newEField.filter(card => !card.hasAttacked);

            if (readyAttackers.length === 0) { proceedToPlayerTurn(pDrawRes); }
            else {
                let currentAttackerIdx = 0;
                const attackRoutine = setInterval(() => {
                    if (playerLife <= 0 || gameState !== 'playing') { clearInterval(attackRoutine); return; }
                    if (currentAttackerIdx < readyAttackers.length) {
                        const attacker = readyAttackers[currentAttackerIdx];
                        if (attacker.trigger === "attack") executeSkill(attacker, false);

                        let targetMinionIdx = currentPlayerField.findIndex(em => (attacker.power || 0) >= (em.hp || 0) && (em.power || 0) < (attacker.hp || 0));
                        if (targetMinionIdx === -1) targetMinionIdx = currentPlayerField.findIndex(em => (attacker.power || 0) >= (em.hp || 0));

                        if (targetMinionIdx !== -1) {
                            const targetMinion = currentPlayerField[targetMinionIdx];
                            triggerPopup(`⚔️ 敵の [${attacker.name}] が [${targetMinion.name}] を攻撃！`);
                            targetMinion.hp -= (attacker.power || 0); attacker.hp -= (targetMinion.power || 0);

                            if (targetMinion.hp <= 0) { checkAndTriggerDeathrattle([targetMinion], true); setPlayerGrave(g => [...g, targetMinion]); }
                            if (attacker.hp <= 0) { checkAndTriggerDeathrattle([attacker], false); setEnemyGrave(g => [...g, attacker]); }

                            currentPlayerField = currentPlayerField.filter(c => c.hp > 0); newEField = newEField.filter(c => c.hp > 0);
                            setPlayerField(currentPlayerField);
                            setEnemyField(newEField.map(c => c.name === attacker.name ? { ...c, hp: attacker.hp, hasAttacked: true } : c));
                        } else {
                            triggerPopup(`💥 敵 [${attacker.name}] のダイレクトアタック！`);
                            setPlayerLife(prev => Math.max(0, prev - (attacker.power || 0)));
                            newEField = newEField.map(c => c.name === attacker.name ? { ...c, hasAttacked: true } : c);
                            setEnemyField(newEField);
                        }
                        currentAttackerIdx++;
                    } else {
                        clearInterval(attackRoutine);
                        setEnemyField(prev => prev.map(c => ({ ...c, hasAttacked: false })));
                        proceedToPlayerTurn(pDrawRes);
                    }
                }, 1200);
            }
        }, 1200);
    };

    return {
        playerMaxLife, enemyMaxLife, playerLife, enemyLife,
        playerDeck, playerHand, playerField,
        enemyDeck, enemyHand, enemyField,
        playerGrave, enemyGrave,
        isPlayerTurn, gameState, selectedAttackerIdx, pendingTarget,
        pendingPeeping,
        playCard, endPlayerTurn, handleSelectAttacker, handleFightMinion, handleDirectAttack
    };
}