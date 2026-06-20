import { useState, useEffect } from 'react';

export function useBattle() {
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

    const [playerGrave, setPlayerGrave] = useState([]);
    const [enemyGrave, setEnemyGrave] = useState([]);
    const [viewingGrave, setViewingGrave] = useState(null);
    const [popup, setPopup] = useState({ id: 0, msg: "" });
    const [detailCard, setDetailCard] = useState(null);

    // ==========================================
    // ⚙️ コアロジック：スキル発動処理
    // ==========================================
    const executeSkill = async (card, isPlayerContext) => {
        if (!card.effectType || card.effectType === "none") return;
        const val = card.effectValue || 0;

        switch (card.effectType) {
            case "gain_mana":
                // 🌟 トリガーポップアップを表示して動いているか分かりやすくする
                triggerPopup(`💎 マナ結晶を ${val} 枚獲得！`);

                if (isPlayerContext) {
                    setPlayerHand(currentHand => {
                        let nextHand = [...currentHand];
                        for (let i = 0; i < val; i++) {
                            if (nextHand.length < 10) {
                                nextHand.push(JSON.parse(JSON.stringify(MANA_CARD)));
                            }
                        }
                        return nextHand;
                    });
                } else {
                    setEnemyHand(currentHand => {
                        let nextHand = [...currentHand];
                        for (let i = 0; i < val; i++) {
                            if (nextHand.length < 10) {
                                nextHand.push(JSON.parse(JSON.stringify(MANA_CARD)));
                            }
                        }
                        return nextHand;
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
                        const newDeck = playerDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5);
                        setPlayerDeck(newDeck);
                        setPlayerHand(prev => [...prev, foundCard]);
                    } else {
                        triggerPopup(`⚠️ デッキに [${targetName}] がありません`);
                    }
                } else {
                    const matchIdx = enemyDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && enemyHand.length < 10) {
                        triggerPopup(`👹 相手はデッキからカードをサーチした！`);
                        const foundCard = enemyDeck[matchIdx];
                        const newDeck = enemyDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5);
                        setEnemyDeck(newDeck);
                        setEnemyHand(prev => [...prev, foundCard]);
                    }
                }
                break;
            }

            case "recruit_card_to_field": {
                // 🌟 修正
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;

                if (isPlayerContext) {
                    const matchIdx = playerDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && playerField.length < 5) {
                        triggerPopup(`🌟 デッキから [${targetName}] を場に直接召喚！`);
                        const foundCard = playerDeck[matchIdx];
                        const newDeck = playerDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5);
                        setPlayerDeck(newDeck);
                        setPlayerField(prev => [...prev, { ...foundCard, hasAttacked: true }]);
                    } else {
                        triggerPopup(`⚠️ 召喚失敗（デッキにない、または戦場満杯）`);
                    }
                } else {
                    const matchIdx = enemyDeck.findIndex(c => c.name === targetName);
                    if (matchIdx !== -1 && enemyField.length < 5) {
                        triggerPopup(`👹 敵のデッキから [${targetName}] が飛び出してきた！`);
                        const foundCard = enemyDeck[matchIdx];
                        const newDeck = enemyDeck.filter((_, idx) => idx !== matchIdx).sort(() => Math.random() - 0.5);
                        setEnemyDeck(newDeck);
                        setEnemyField(prev => [...prev, { ...foundCard, hasAttacked: true }]);
                    }
                }
                break;
            }

            case "generate_card_to_hand": {
                // 🌟 修正
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;

                try {
                    const q = query(collection(db, "cards"), where("name", "==", targetName));
                    const querySnapshot = await getDocs(q);
                    if (!querySnapshot.empty) {
                        const baseCardData = querySnapshot.docs[0].data();
                        const generatedCard = { ...baseCardData };
                        if (isPlayerContext) {
                            if (playerHand.length < 10) {
                                triggerPopup(`✨ [${targetName}] を生成して手札に加えた！`);
                                setPlayerHand(prev => [...prev, generatedCard]);
                            }
                        } else {
                            if (enemyHand.length < 10) {
                                triggerPopup(`👹 相手が手札にトークンを生成した！`);
                                setEnemyHand(prev => [...prev, generatedCard]);
                            }
                        }
                    }
                } catch (error) { console.error(error); }
                break;
            }

            case "generate_card_to_field": {
                // 🌟 修正
                const targetName = card.effectTargetName ? card.effectTargetName.trim() : "";
                if (!targetName) break;

                try {
                    const q = query(collection(db, "cards"), where("name", "==", targetName));
                    const querySnapshot = await getDocs(q);
                    if (!querySnapshot.empty) {
                        const baseCardData = querySnapshot.docs[0].data();
                        const generatedCard = { ...baseCardData, hasAttacked: true };
                        if (isPlayerContext) {
                            if (playerField.length < 5) {
                                triggerPopup(`✨ [${targetName}] が戦場に生成された！`);
                                setPlayerField(prev => [...prev, generatedCard]);
                            }
                        } else {
                            if (enemyField.length < 5) {
                                triggerPopup(`👹 敵の陣地に [${targetName}] が生成された！`);
                                setEnemyField(prev => [...prev, generatedCard]);
                            }
                        }
                    }
                } catch (error) { console.error(error); }
                break;
            }
            // src/components/BattleScreen.jsx 内の executeSkill 関数の switch 文の中に追加します

            case "discard_all_hand": {
                if (isPlayerContext) {
                    // 🌟 プレイヤー側の処理
                    if (playerHand.length === 0) break;

                    triggerPopup("💥 手札をすべて捨てた！");

                    // マナ結晶以外の本物のカードだけを墓地に送る
                    const realCardsInHand = playerHand.filter(c => c && !c.isMana);
                    if (realCardsInHand.length > 0) {
                        setPlayerGrave(prev => [...prev, ...realCardsInHand]);
                    }

                    // 手札を完全に空っぽにする
                    setPlayerHand([]);
                } else {
                    // 🌟 敵AI側の処理
                    if (enemyHand.length === 0) break;

                    triggerPopup("👹 相手は手札をすべて捨てた！");

                    const realCardsInHand = enemyHand.filter(c => c && !c.isMana);
                    if (realCardsInHand.length > 0) {
                        setEnemyGrave(prev => [...prev, ...realCardsInHand]);
                    }
                    setEnemyHand([]);
                }
                break;
            }
            default:
                break;
        }
    };

    // 🌟 破壊されたカードの効果をチェックして実行するヘルパー関数
    const checkAndTriggerDeathrattle = (deadCards, isPlayerContext) => {
        deadCards.forEach(card => {
            if (card.trigger === "death") {
                console.log(`💀 破壊時効果発動: ${card.name}`);
                // 破壊されたミニオンの効果を実行（非同期関数なのでそのまま呼び出します）
                executeSkill(card, isPlayerContext);
            }
        });
    };
    // ==========================================
    // ⚙️ コアロジック：カードプレイ
    // ==========================================
    const playCard = (handIndex) => {
        if (!isPlayerTurn || gameState !== 'playing' || pendingTarget) return;

        const cardToPlay = playerHand[handIndex];
        if (!cardToPlay || cardToPlay.isMana) return;
        if (cardToPlay.cardType !== "magic" && playerField.length >= 5) {
            triggerPopup("⚠️ フィールドが満杯です");
            return;
        }

        // プレイ条件チェック（金塊が3枚あるかなど、先ほど実装した処理）
        if (cardToPlay.reqCardName && cardToPlay.reqCardCount > 0) {
            const currentCount = playerHand.filter(c => c && c.name === cardToPlay.reqCardName).length;
            if (currentCount < cardToPlay.reqCardCount) {
                triggerPopup(`❌ 手札に「${cardToPlay.reqCardName}」が ${cardToPlay.reqCardCount} 枚以上必要です！`);
                return;
            }
        }

        const reqCost = cardToPlay.cost !== undefined ? cardToPlay.cost : 1;

        // ========================================================
        // 🌟 新設：コストタイプによる分岐処理
        // ========================================================
        let consumedManaIndices = [];

        if (cardToPlay.costType === "hp") {
            // 💔 HPコストの支払いチェック
            // コストを支払った結果、最大HPが0以下になる、または現在HPが0以下になって自滅する場合はプレイ不可にする
            if (playerLife <= reqCost || playerMaxLife <= reqCost) {
                triggerPopup("❌ ライフコストが足りません！（支払うと死んでしまいます）");
                return;
            }

            // コストの支払い：最大HPと現在HPを同時に削る！
            triggerPopup(`💔 命を削った！ (最大HP・現在HP -${reqCost})`);
            setPlayerMaxLife(p => p - reqCost);
            setPlayerLife(p => p - reqCost);

            // HP支払いなので、消費するマナ結晶のインデックスは空（[]）のまま進む
            consumedManaIndices = [];

        } else {
            // 💎 通常のマナコスト支払いチェック（既存の処理）
            const availableManaIndices = playerHand.map((c, i) => c.isMana ? i : -1).filter(i => i !== -1);

            if (availableManaIndices.length < reqCost) {
                triggerPopup("⚠️ マナが足りません");
                return;
            }
            consumedManaIndices = availableManaIndices.slice(0, reqCost);
        }

        // ========================================================
        // ターゲット選択やカード使用の確定処理へ（既存の処理に流す）
        // ========================================================
        if (cardToPlay.trigger === "play" && TARGETED_EFFECTS.includes(cardToPlay.effectType)) {
            if (cardToPlay.effectType.includes("enemy") && enemyField.length === 0) {
                triggerPopup("⚠️ 敵がいません"); return;
            }
            if (cardToPlay.effectType.includes("ally") && playerField.length === 0 && cardToPlay.cardType === "magic") {
                triggerPopup("⚠️ 味方がいません"); return;
            }
            setPendingTarget({ handIndex, card: cardToPlay, consumedManaIndices });
            return;
        }
        finishPlayCard(handIndex, consumedManaIndices, cardToPlay);
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

            if (card.effectType === "damage_single_enemy") {
                triggerPopup(`💥 狙い撃ち (-${val})`);
                targetCard.hp -= val;
            } else {
                triggerPopup(`☠️ 即死！`);
                targetCard.hp = 0;
            }

            const survivingEnemies = newEnemyField.filter(c => c.hp > 0);
            const deadEnemies = newEnemyField.filter(c => c.hp <= 0 && !c.isMana);
            if (deadEnemies.length > 0) {
                checkAndTriggerDeathrattle(deadEnemies, false); // 敵の破壊時効果
                setEnemyGrave(prev => [...prev, ...deadEnemies]);
            }
            setEnemyField(survivingEnemies);
            success = true;
        }
        else if (card.effectType === "buff_single_ally") {
            if (targetTeam !== "player") return;
            const newPlayerField = [...playerField];
            const targetCard = newPlayerField[targetIdx];
            triggerPopup(`💪 パワーアップ！`);
            targetCard.power += val;
            targetCard.hp += val;
            setPlayerField(newPlayerField);
            success = true;
        }

        if (success) {
            setPendingTarget(null);
            finishPlayCard(handIndex, consumedManaIndices, card);
        }
    };

    // src/components/BattleScreen.jsx 内の finishPlayCard を以下の最新版に差し替え
    const finishPlayCard = (handIndex, consumedManaIndices, cardToPlay) => {
        // ① コストとなったマナと、使ったカードを手札から取り除く（仮の次手札を作成）
        let newHand = playerHand.filter((_, idx) => idx !== handIndex && !consumedManaIndices.includes(idx));
        let nextGrave = [...playerGrave];

        // 🔍 F12のコンソール画面でカードのデータを確認するためのデバッグ命令
        console.log("プレイしたカードの詳細データ:", cardToPlay);

        // ② 召喚ポップアップを最優先で表示
        if (cardToPlay.cardType === "magic") {
            if (!TARGETED_EFFECTS.includes(cardToPlay.effectType) && cardToPlay.effectType !== "damage_enemy_player" && cardToPlay.effectType !== "damage_all_enemies" && cardToPlay.effectType !== "buff_all_allies") {
                triggerPopup(`🔮 ${cardToPlay.name} 発動！`);
            }
            nextGrave.push(cardToPlay);
            setPlayerHand(newHand);
            setPlayerGrave(nextGrave);
        } else {
            triggerPopup(`🌟 ${cardToPlay.name} 召喚！`);
            setPlayerHand(newHand);
            setPlayerGrave(nextGrave);
            setPlayerField([...playerField, { ...cardToPlay, hasAttacked: false }]);
        }

        // ③ 手札が新しくなった「直後」のタイミングでプレイ時効果（雄叫び）を実行！
        if (cardToPlay.trigger === "play" && !TARGETED_EFFECTS.includes(cardToPlay.effectType)) {
            console.log("プレイ時効果の条件を通過しました！ 効果タイプ:", cardToPlay.effectType);

            if (cardToPlay.effectType === "draw_card") {
                const drawRes = processDraw(cardToPlay.effectValue, playerDeck, newHand, nextGrave, playerLife);
                setPlayerDeck(drawRes.d);
                setPlayerHand(drawRes.h);
                setPlayerGrave(drawRes.g);
                setPlayerLife(drawRes.life);
            } else if (cardToPlay.effectType === "damage_all_enemies") {
                triggerPopup(`☄️ 敵全体に ${cardToPlay.effectValue} ダメージ！`);
                const damagedEnemyField = enemyField.map(card => ({ ...card, hp: card.hp - cardToPlay.effectValue }));
                const survivingEnemies = damagedEnemyField.filter(c => c.hp > 0);
                const deadEnemies = damagedEnemyField.filter(c => c.hp <= 0 && !c.isMana);
                if (deadEnemies.length > 0) setEnemyGrave(prev => [...prev, ...deadEnemies]);
                setEnemyField(survivingEnemies);
            } else {
                // 🌟 エルフの効果（gain_mana）などは確実にここへ流れます
                console.log("executeSkill を呼び出します。");
                executeSkill(cardToPlay, true);
            }
        }
    };

    // ==========================================
    // ⚙️ コアロジック：戦闘・ターン処理
    // ==========================================
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
        const updatedAttacker = { ...attacker };
        const updatedDefender = { ...defender };

        updatedAttacker.hp -= (updatedDefender.power || 0);
        updatedDefender.hp -= (updatedAttacker.power || 0);
        updatedAttacker.hasAttacked = true;

        newPlayerField[selectedAttackerIdx] = updatedAttacker;
        newEnemyField[enemyFieldIndex] = updatedDefender;

        const finalPlayerField = newPlayerField.filter(c => c.hp > 0);
        const deadPlayerCards = newPlayerField.filter(c => c.hp <= 0 && !c.isMana);
        const finalEnemyField = newEnemyField.filter(c => c.hp > 0);
        const deadEnemyCards = newEnemyField.filter(c => c.hp <= 0 && !c.isMana);

        if (deadPlayerCards.length > 0) {
            checkAndTriggerDeathrattle(deadPlayerCards, true); // 自分ミニオンの破壊時効果
            setPlayerGrave(prev => [...prev, ...deadPlayerCards]);
        }
        if (deadEnemyCards.length > 0) {
            checkAndTriggerDeathrattle(deadEnemyCards, false); // 敵ミニオンの破壊時効果
            setEnemyGrave(prev => [...prev, ...deadEnemyCards]);
        }

        setPlayerField(finalPlayerField);
        setEnemyField(finalEnemyField);
        setSelectedAttackerIdx(null);
    };

    const handleSelectAttacker = (fieldIndex) => {
        if (!isPlayerTurn || gameState !== 'playing') return;
        if (pendingTarget) { resolveTargetedPlay("player", fieldIndex); return; }
        const card = playerField[fieldIndex];
        if (card.hasAttacked) return;
        if (selectedAttackerIdx === fieldIndex) setSelectedAttackerIdx(null);
        else setSelectedAttackerIdx(fieldIndex);
    };
    const handleDirectAttack = () => {
        if (pendingTarget) return;
        if (selectedAttackerIdx === null || !isPlayerTurn || gameState !== 'playing') return;
        const attacker = playerField[selectedAttackerIdx];
        if (attacker.trigger === "attack") executeSkill(attacker, true);

        triggerPopup(`💥 ダイレクトアタック！`);
        setEnemyLife(prev => Math.max(0, prev - (attacker.power || 0)));
        const newField = [...playerField];
        newField[selectedAttackerIdx].hasAttacked = true;
        setPlayerField(newField);
        setSelectedAttackerIdx(null);
    };

    const endPlayerTurn = () => {
        if (gameState !== 'playing' || pendingTarget) return;
        setIsPlayerTurn(false);
        setSelectedAttackerIdx(null);

        // 1. 敵のターン開始時効果の発動
        enemyField.forEach(c => {
            if (c.trigger === "turn_start") executeSkill(c, false);
        });

        // プレイヤーと敵の次ターン用のドロー計算
        let pDrawRes = processDraw(1, playerDeck, playerHand, playerGrave, playerLife);
        if (pDrawRes.h.length < 10) pDrawRes.h.push(JSON.parse(JSON.stringify(MANA_CARD)));

        setTimeout(async () => {
            if (gameState !== 'playing') return;

            let eDrawRes = processDraw(1, enemyDeck, enemyHand, enemyGrave, enemyLife);
            if (eDrawRes.h.length < 10) eDrawRes.h.push(JSON.parse(JSON.stringify(MANA_CARD)));

            let newEField = [...enemyField];
            let currentEnemyHand = [...eDrawRes.h];

            // ========================================================
            // 🧠 進化1：手札プレイAI（コストが許す限りたくさん展開する）
            // ========================================================
            let loopSafety = 0;
            while (newEField.length < 5 && loopSafety < 10) {
                loopSafety++;
                const aiManaCount = currentEnemyHand.filter(c => c.isMana).length;

                // 出せるカード（マナ・魔法以外）をコストが高い順にソートして探す（強いカードを優先）
                const playableCards = currentEnemyHand
                    .map((c, i) => ({ card: c, originalIdx: i }))
                    .filter(item => {
                        if (item.card.isMana || item.card.cardType === 'magic') return false;
                        const cost = item.card.cost !== undefined ? item.card.cost : 1;
                        return aiManaCount >= cost;
                    })
                    .sort((a, b) => (b.card.cost || 0) - (a.card.cost || 0));

                if (playableCards.length === 0) break; // 出せるカードがなくなったら終了

                // 一番強い（コストの高い）カードをプレイ
                const targetItem = playableCards[0];
                const playedCard = targetItem.card;
                const cost = playedCard.cost !== undefined ? playedCard.cost : 1;

                // マナの消費処理
                let manaConsumed = 0;
                currentEnemyHand = currentEnemyHand.filter((c) => {
                    if (c.isMana && manaConsumed < cost) {
                        manaConsumed++;
                        return false;
                    }
                    return true;
                });
                // プレイしたカード自体を手札から消す
                currentEnemyHand = currentEnemyHand.filter((_, idx) => idx !== (targetItem.originalIdx - (targetItem.originalIdx > currentEnemyHand.length ? 1 : 0)));

                // プレイ時効果（雄叫びなど）の処理
                if (playedCard.trigger === "play") {
                    if (TARGETED_EFFECTS.includes(playedCard.effectType)) {
                        // 単体除去系効果なら、一番攻撃力の高いプレイヤーのミニオンを狙い撃つ！
                        if (playedCard.effectType.includes("enemy") && playerField.length > 0) {
                            let targetIdx = 0;
                            let maxPower = -1;
                            playerField.forEach((c, idx) => {
                                if ((c.power || 0) > maxPower) { maxPower = c.power; targetIdx = idx; }
                            });

                            if (playedCard.effectType === "damage_single_enemy") {
                                setPlayerField(prev => prev.map((c, i) => i === targetIdx ? { ...c, hp: c.hp - playedCard.effectValue } : c));
                            } else if (playedCard.effectType === "destroy_single_enemy") {
                                setPlayerField(prev => prev.map((c, i) => i === targetIdx ? { ...c, hp: 0 } : c));
                            }
                        }
                    } else {
                        executeSkill(playedCard, false);
                    }
                }

                triggerPopup(`👹 敵が [${playedCard.name}] を召喚！`);
                newEField.push({ ...playedCard, hasAttacked: true }); // 出したターンは攻撃不可
            }

            // 敵の状態を一旦確定
            setEnemyDeck(eDrawRes.d);
            setEnemyHand(currentEnemyHand);
            setEnemyGrave(eDrawRes.g);
            setEnemyField(newEField);
            setEnemyLife(eDrawRes.life);

            // プレイヤー側の死亡チェックを挟む
            let currentPlayerField = [...playerField].filter(c => c.hp > 0);

            // ========================================================
            // 🧠 進化2：戦闘AI（盤面を計算して有利トレードを仕掛ける）
            // ========================================================
            const readyAttackers = newEField.filter(card => !card.hasAttacked);

            if (readyAttackers.length === 0) {
                proceedToPlayerTurn(pDrawRes);
            } else {
                let currentAttackerIdx = 0;

                const attackRoutine = setInterval(() => {
                    if (playerLife <= 0 || gameState !== 'playing') {
                        clearInterval(attackRoutine);
                        return;
                    }

                    if (currentAttackerIdx < readyAttackers.length) {
                        const attacker = readyAttackers[currentAttackerIdx];
                        if (attacker.trigger === "attack") executeSkill(attacker, false);

                        // 🎯 ターゲット選択の思考ロジック
                        let targetMinionIdx = -1;

                        // プレイヤーの場にミニオンがいる場合、一方的に勝てる、または相打ちにできる有利な相手を探す
                        if (currentPlayerField.length > 0) {
                            // 例: 相手を倒せて、かつ自分が生き残れる「一方通行な有利トレード」を最優先
                            targetMinionIdx = currentPlayerField.findIndex(enemyMinion =>
                                (attacker.power || 0) >= (enemyMinion.hp || 0) && (enemyMinion.power || 0) < (attacker.hp || 0)
                            );

                            // 見つからない場合、攻撃力が高い邪悪な敵ミニオンと「相打ち」を狙う
                            if (targetMinionIdx === -1) {
                                targetMinionIdx = currentPlayerField.findIndex(enemyMinion =>
                                    (attacker.power || 0) >= (enemyMinion.hp || 0)
                                );
                            }
                        }

                        if (targetMinionIdx !== -1) {
                            // ⚔️ ミニオン同士の戦闘を選択！
                            const targetMinion = currentPlayerField[targetMinionIdx];
                            triggerPopup(`⚔️ 敵の [${attacker.name}] が [${targetMinion.name}] を攻撃！`);

                            targetMinion.hp -= (attacker.power || 0);
                            attacker.hp -= (targetMinion.power || 0);

                            // 死亡判定と墓地送り
                            if (targetMinion.hp <= 0) {
                                if (targetMinion.trigger === "death") executeSkill(targetMinion, true); // プレイヤー側の破壊時誘発
                                setPlayerGrave(g => [...g, targetMinion]);
                            }
                            if (attacker.hp <= 0) {
                                if (attacker.trigger === "death") executeSkill(attacker, false); // 敵側の破壊時誘発
                                setEnemyGrave(g => [...g, attacker]);
                            }

                            // フィールドのリアルタイム更新
                            currentPlayerField = currentPlayerField.filter(c => c.hp > 0);
                            newEField = newEField.filter(c => c.hp > 0);
                            setPlayerField(currentPlayerField);
                            setEnemyField(newEField.map(c => c.name === attacker.name ? { ...c, hp: attacker.hp, hasAttacked: true } : c));

                        } else {
                            // 💥 有利なトレードがない、またはプレイヤーの場が空ならプレイヤーの「顔」を殴る！
                            triggerPopup(`💥 敵 [${attacker.name}] のダイレクトアタック！`);
                            setPlayerLife(prev => {
                                const nextLife = Math.max(0, prev - (attacker.power || 0));
                                return nextLife;
                            });

                            // 行動済みにする
                            newEField = newEField.map(c => c.name === attacker.name ? { ...c, hasAttacked: true } : c);
                            setEnemyField(newEField);
                        }

                        currentAttackerIdx++;
                    } else {
                        // すべての攻撃が終了
                        clearInterval(attackRoutine);
                        // 生き残った敵ミニオンの行動フラグを次のターンのためにリセット
                        setEnemyField(prev => prev.map(c => ({ ...c, hasAttacked: false })));
                        proceedToPlayerTurn(pDrawRes);
                    }
                }, 1200);
            }
        }, 1200);
    };
    const proceedToPlayerTurn = (pDrawRes) => {
        if (gameState !== 'playing') return;

        setTimeout(() => {
            triggerPopup("🔵 YOUR TURN");

            // 1. プレイヤー側の「ターン開始時（turn_start）」効果を発動
            playerField.forEach(c => {
                if (c.trigger === "turn_start") executeSkill(c, true);
            });

            // 2. ターンの初めに引いたカード（ドロー結果）を反映させる
            setPlayerDeck(pDrawRes.d);
            setPlayerHand(pDrawRes.h);
            setPlayerGrave(pDrawRes.g);
            setPlayerLife(pDrawRes.life);

            // 3. プレイヤーの場のミニオンが再び攻撃できるように「行動済み」をリセットする
            setPlayerField(prevField => prevField.map(c => ({ ...c, hasAttacked: false })));

            // 4. 最後にプレイヤーのターンフラグをONにする！
            setIsPlayerTurn(true);
        }, 1000);
    };
    return {
        playerLife,
        playerHand,
        enemyDeck,
        enemyHand,
        enemyLife,
        playerGrave,
        enemyGrave
    };
}