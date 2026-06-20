import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore'; // 🌟 getDocsなどを追加
import { db } from '../firebase'; // dbのインポートを確認
import Card from './Card';

const MANA_CARD = { name: "マナ結晶", cardType: "mana", effectText: "コスト用", image: "img/mana.png", isMana: true };

// ==========================================
// ⚙️ コアロジック：ドロー処理（山札切れ・手札上限）
// ==========================================
const processDraw = (drawCount, currentDeck, currentHand, currentGrave, currentLife, isPlayer) => {
  let d = [...currentDeck];
  let h = [...currentHand];
  let g = [...currentGrave];
  let life = currentLife;
  let logsToAdd = [];

  for (let i = 0; i < drawCount; i++) {
    if (d.length === 0) {
      const nonManaGrave = g.filter(c => !c.isMana);
      if (nonManaGrave.length === 0) {
        break;
      }
      life -= 5;
      d = nonManaGrave.sort(() => Math.random() - 0.5);
      g = g.filter(c => c.isMana);
    }
    if (d.length > 0) {
      const drawnCard = d.shift();
      if (h.length < 10) {
        h.push(drawnCard);
      } else {
        if (!drawnCard.isMana) g.push(drawnCard);
      }
    }
  }
  return { d, h, g, life };
};

const TARGETED_EFFECTS = ["damage_single_enemy", "destroy_single_enemy", "buff_single_ally"];

function BattleScreen({ playerDeckData, enemyDeckData, onBack }) {
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

  const triggerPopup = (msg) => setPopup({ id: Date.now(), msg });

  // ==========================================
  // ⚙️ コアロジック：スキル発動処理
  // ==========================================
  // src/components/BattleScreen.jsx 内の executeSkill 関数の修正
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
        if (isPlayerContext) setPlayerField(f => f.map(c => ({...c, power: (c.power||0)+val, hp: (c.hp||0)+val})));
        else setEnemyField(f => f.map(c => ({...c, power: (c.power||0)+val, hp: (c.hp||0)+val})));
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
  useEffect(() => {
    const pDeck = JSON.parse(JSON.stringify(playerDeckData || []));
    const eDeck = JSON.parse(JSON.stringify(enemyDeckData || []));
    pDeck.sort(() => Math.random() - 0.5);
    eDeck.sort(() => Math.random() - 0.5);

    const pHand = [];
    for(let i = 0; i < 4; i++) if (pDeck.length > 0) pHand.push(pDeck.shift());
    pHand.push(JSON.parse(JSON.stringify(MANA_CARD)));

    const eHand = [];
    for(let i = 0; i < 3; i++) if (eDeck.length > 0) eHand.push(eDeck.shift());
    eHand.push(JSON.parse(JSON.stringify(MANA_CARD)));

    setPlayerMaxLife(20);
    setEnemyMaxLife(20);
    setPlayerLife(20);
    setEnemyLife(20);
    setPlayerDeck(pDeck);
    setPlayerHand(pHand);
    setEnemyDeck(eDeck);
    setEnemyHand(eHand);
    setPlayerField([]);
    setEnemyField([]);
    setPlayerGrave([]);
    setEnemyGrave([]);
    setIsPlayerTurn(true);
    setGameState('playing');
    setSelectedAttackerIdx(null);
    setPendingTarget(null);
    setViewingGrave(null);
    setDetailCard(null);
  }, [playerDeckData, enemyDeckData]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    if (enemyLife <= 0) {
      setGameState('win');
      triggerPopup("🎊 YOU WIN 🎊");
    } else if (playerLife <= 0) {
      setGameState('lose');
      triggerPopup("💀 YOU LOSE 💀");
    }
  }, [playerLife, enemyLife, gameState]);
  // src/components/BattleScreen.jsx 内の useEffect 群の中に追加します

  // 🌟 新設：手札の「金塊」による特殊勝利チェックシステム
  useEffect(() => {
  if (gameState !== 'playing') return;

  // 1. プレイヤー側のチェック
  const playerGoldCount = playerHand.filter(card => card && card.name === "金塊").length;
  if (playerGoldCount >= 5) {
    setGameState('win');
    triggerPopup("💰 金塊が5枚揃った 特殊勝利 💰");
  }

  // 2. 相手（敵AI）側のチェック（AIデッキに金塊を入れる場合を想定）
  const enemyGoldCount = enemyHand.filter(card => card && card.name === "金塊").length;
  if (enemyGoldCount >= 5) {
    setGameState('lose');
    triggerPopup("💀 相手の金塊が5枚揃ってしまった！ 💀");
  }
  }, [playerHand, enemyHand, gameState]);

  // src/components/BattleScreen.jsx 内の useEffect 群の中に追加します

// 🪦 盤面自動整理システム：どちらかの場のミニオンのHPが0以下になったら自動で墓地に送る
useEffect(() => {
  if (gameState !== 'playing') return;

  // 1. プレイヤー側のフィールドチェック
  const deadPlayerCards = playerField.filter(c => c && c.hp <= 0 && !c.isMana);
  if (deadPlayerCards.length > 0) {
    // 破壊時効果（ラストワード）をトリガー
    checkAndTriggerDeathrattle(deadPlayerCards, true);
    // 墓地へ追加
    setPlayerGrave(prev => [...prev, ...deadPlayerCards]);
    // 生き残ったミニオンだけを場に残す
    setPlayerField(prev => prev.filter(c => c.hp > 0));
  }

  // 2. 敵側のフィールドチェック
  const deadEnemyCards = enemyField.filter(c => c && c.hp <= 0 && !c.isMana);
  if (deadEnemyCards.length > 0) {
    // 破壊時効果（ラストワード）をトリガー
    checkAndTriggerDeathrattle(deadEnemyCards, false);
    // 墓地へ追加
    setEnemyGrave(prev => [...prev, ...deadEnemyCards]);
    // 生き残ったミニオンだけを場に残す
    setEnemyField(prev => prev.filter(c => c.hp > 0));
  }
}, [playerField, enemyField, gameState]);

  useEffect(() => {
    if (popup.msg) {
      const timer = setTimeout(() => setPopup({ id: 0, msg: "" }), 1200);
      return () => clearTimeout(timer);
    }
  }, [popup]);

  // ==========================================
  // ⚙️ コアロジック：カードプレイ
  // ==========================================
  // src/components/BattleScreen.jsx 内の playCard 関数を以下のように拡張します

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
    if(!TARGETED_EFFECTS.includes(cardToPlay.effectType) && cardToPlay.effectType !== "damage_enemy_player" && cardToPlay.effectType !== "damage_all_enemies" && cardToPlay.effectType !== "buff_all_allies"){
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
      const damagedEnemyField = enemyField.map(card => ({...card, hp: card.hp - cardToPlay.effectValue}));
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

  // src/components/BattleScreen.jsx 内の endPlayerTurn 関数を以下のように進化させます

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
              setPlayerField(prev => prev.map((c, i) => i === targetIdx ? {...c, hp: c.hp - playedCard.effectValue} : c));
            } else if (playedCard.effectType === "destroy_single_enemy") {
              setPlayerField(prev => prev.map((c, i) => i === targetIdx ? {...c, hp: 0} : c));
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

  return (
    // 🌟 外枠：画面いっぱいに広がるFlexコンテナ（縦並び）に大改造！
    <div id="game-screen" style={{ position: 'relative', width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: '#1e272e', overflow: 'hidden' }}>
      
      <style>{`
        @keyframes cutInAnim {
          0% { transform: translate(-50%, -50%) scale(0.8) skewX(-10deg); opacity: 0; }
          15% { transform: translate(-50%, -50%) scale(1.1) skewX(0deg); opacity: 1; }
          85% { transform: translate(-50%, -50%) scale(1) skewX(0deg); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.2) skewX(10deg); opacity: 0; }
        }
      `}</style>

      {/* モーダルや警告系のUI群（元のまま維持） */}
      {pendingTarget && (
        <div 
          onClick={() => { setPendingTarget(null); }}
          style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', background: '#e74c3c', color: 'white', padding: '10px 30px', borderRadius: '30px', fontWeight: 'bold', zIndex: 1500, boxShadow: '0 0 15px rgba(231,76,60,0.8)', cursor: 'pointer' }}
        >
          🎯 ターゲットを選択してください（クリックでキャンセル）
        </div>
      )}

      {detailCard && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#34495e', padding: '30px', borderRadius: '15px', border: '3px solid #f1c40f', textAlign: 'center', maxWidth: '400px', width: '80%', color: 'white', boxShadow: '0 0 25px rgba(0,0,0,0.5)' }}>
            <h2 style={{ margin: '0 0 10px 0', color: '#f1c40f' }}>🔍 CARD DETAILS</h2>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
              <Card cardData={detailCard} isEnemy={false} statusText={detailCard.cardType === 'magic' ? '魔法' : 'キャラクター'} />
            </div>
            <h3 style={{ margin: '10px 0 5px 0', borderBottom: '1px solid #7f8c8d', paddingBottom: '5px' }}>{detailCard.name}</h3>
            <p style={{ fontSize: '0.9rem', color: '#bdc3c7', margin: '5px 0' }}>コスト: {detailCard.isMana ? 'なし' : (detailCard.cost !== undefined ? detailCard.cost : 1)}マナ</p>
            {detailCard.cardType === 'character' && (
              <p style={{ fontWeight: 'bold', margin: '5px 0' }}>
                攻撃力: <span style={{ color: '#e74c3c' }}>⚔️{detailCard.power}</span> / 体力: <span style={{ color: '#2ecc71' }}>💖{detailCard.hp}</span>
              </p>
            )}
            <div style={{ background: '#2c3e50', padding: '15px', borderRadius: '8px', marginTop: '15px', textAlign: 'left', minHeight: '60px' }}>
              <span style={{ fontSize: '0.8rem', color: '#1abc9c', display: 'block', marginBottom: '3px' }}>【カード効果説明】</span>
              <p style={{ margin: '0', fontSize: '0.9rem', lineHeight: '1.4' }}>{detailCard.effectText || "特殊効果はありません（通常カード）"}</p>
            </div>
            <button className="pc-menu-btn" style={{ marginTop: '25px', padding: '10px 40px', background: '#e74c3c', width: '100%' }} onClick={() => setDetailCard(null)}>確認終了</button>
          </div>
        </div>
      )}

      {viewingGrave && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: 'white', marginBottom: '20px' }}>{viewingGrave === 'player' ? '🪦 あなたの墓地' : '🪦 相手の墓地'} ({viewingGrave === 'player' ? playerGrave.length : enemyGrave.length}枚)</h2>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', maxWidth: '90%', maxHeight: '60%', overflowY: 'auto', background: 'rgba(255,255,255,0.1)', padding: '20px', borderRadius: '10px', justifyContent: 'center' }}>
            {(viewingGrave === 'player' ? playerGrave : enemyGrave).map((c, i) => <Card key={i} cardData={c} isEnemy={false} statusText="墓地" onDoubleClick={() => setDetailCard(c)} />)}
          </div>
          <button className="pc-menu-btn" style={{ marginTop: '30px', padding: '10px 30px', background: '#e74c3c' }} onClick={() => setViewingGrave(null)}>閉じる</button>
        </div>
      )}

      {popup.msg && (
        <div key={popup.id} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0, 0, 0, 0.85)', color: '#f1c40f', padding: '20px 40px', borderRadius: '10px', border: '3px solid #f39c12', fontSize: '2rem', fontWeight: 'bold', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 200, animation: 'cutInAnim 1.2s ease-out forwards', boxShadow: '0 0 30px rgba(243, 156, 18, 0.5)' }}>
          {popup.msg}
        </div>
      )}

      {gameState !== 'playing' && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.9)', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          {gameState === 'win' && <h1 style={{ fontSize: '5rem', color: '#f1c40f', textShadow: '0 0 20px #f39c12' }}>YOU WIN!</h1>}
          {gameState === 'lose' && <h1 style={{ fontSize: '5rem', color: '#e74c3c', textShadow: '0 0 20px #c0392b' }}>YOU LOSE...</h1>}
          <button className="pc-menu-btn" style={{ background: '#3498db', fontSize: '1.5rem', padding: '15px 40px', marginTop: '20px' }} onClick={onBack}>ホームに戻る</button>
        </div>
      )}


      {/* ========================================================
          📦 エリア①：上部バトルフィールド（ここだけが綺麗に縦スクロールする！）
      ======================================================== */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 10px', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box' }}>
        
        {/* 相手情報 & 相手フィールド */}
        <div id="enemy-area" onClick={handleDirectAttack} style={{ cursor: selectedAttackerIdx !== null ? 'crosshair' : 'default', transition: 'all 0.2s', background: 'rgba(0,0,0,0.15)', padding: '15px', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ color: '#e74c3c', margin: 0, fontSize: '1.2rem' }}>相手 (HP: {enemyLife} / {enemyMaxLife}) {selectedAttackerIdx !== null && "🎯 [クリックでダイレクトアタック！]"}</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ background: '#34495e', color: 'white', padding: '3px 10px', borderRadius: '10px', fontSize: '0.8rem' }}>手札: {enemyHand.length}/10枚</div>
              <div style={{ background: '#34495e', color: 'white', padding: '3px 10px', borderRadius: '10px', fontSize: '0.8rem' }}>デッキ: {enemyDeck.length}枚</div>
              <div onClick={(e) => { e.stopPropagation(); setViewingGrave('enemy'); }} style={{ background: '#7f8c8d', color: 'white', padding: '3px 10px', borderRadius: '10px', fontSize: '0.8rem', cursor: 'pointer' }}>🪦 墓地: {enemyGrave.length}枚</div>
            </div>
          </div>
          <div style={{ width: '100%', overflowX: 'auto', marginTop: '5px' }}>
            <div style={{ display: 'flex', gap: '5px', width: 'max-content', padding: '15px 5px 5px 5px' }}>
              {enemyHand.map((_, idx) => <div key={idx} className="card card-back" style={{ transform: 'scale(0.7)', transformOrigin: 'top left' }}></div>)}
            </div>
          </div>
          <div style={{ minHeight: '180px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', marginTop: '10px' }}>
            <div style={{ display: 'flex', gap: '10px', paddingTop: '15px', paddingLeft: '10px' }}>
              {enemyField.map((card, idx) => (
                <div key={idx} onClick={(e) => { e.stopPropagation(); handleFightMinion(idx); }} style={{ cursor: pendingTarget || selectedAttackerIdx !== null ? 'crosshair' : 'default', boxShadow: pendingTarget && pendingTarget.card.effectType.includes("enemy") ? '0 0 15px #e74c3c' : 'none', borderRadius: '8px' }}>
                  <Card cardData={card} isEnemy={true} statusText={pendingTarget ? "🎯 対象" : "敵軍"} onDoubleClick={() => setDetailCard(card)} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', color: isPlayerTurn ? '#3498db' : '#e74c3c', margin: '0', fontWeight: 'bold' }}>
          {isPlayerTurn ? "▼ 🔵 あなたのターンです。 ▼" : "⏳ 🔴 相手の思考中... ⏳"}
        </div>

        {/* 自分プレイヤー情報 & 自分フィールド */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h2 style={{ color: '#2ecc71', margin: 0, fontSize: '1.2rem' }}>あなた (HP: {playerLife} / {playerMaxLife})</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ background: '#34495e', color: 'white', padding: '3px 10px', borderRadius: '10px', fontSize: '0.8rem' }}>デッキ: {playerDeck.length}枚</div>
              <div onClick={() => setViewingGrave('player')} style={{ background: '#7f8c8d', color: 'white', padding: '3px 10px', borderRadius: '10px', fontSize: '0.8rem', cursor: 'pointer' }}>🪦 墓地: {playerGrave.length}枚</div>
            </div>
          </div>
          
          <div id="player-field-area" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { playCard(parseInt(e.dataTransfer.getData("handIndex"))); }} style={{ minHeight: '180px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', border: '2px dashed rgba(255,255,255,0.2)' }}>
            <div style={{ display: 'flex', gap: '10px', paddingTop: '15px', paddingLeft: '10px' }}>
              {playerField.map((card, idx) => {
                const isSelected = selectedAttackerIdx === idx;
                return (
                  <div key={idx} onClick={() => handleSelectAttacker(idx)} style={{ cursor: pendingTarget || !card.hasAttacked ? 'pointer' : 'not-allowed', opacity: card.hasAttacked && !pendingTarget ? 0.5 : 1, transform: isSelected ? 'scale(1.05)' : 'scale(1)', boxShadow: isSelected ? '0 0 15px #f1c40f' : pendingTarget && pendingTarget.card.effectType.includes("ally") ? '0 0 15px #2ecc71' : 'none', borderRadius: '8px', transition: 'all 0.2s' }}>
                    <Card cardData={card} statusText={pendingTarget ? "🎯 対象" : card.hasAttacked ? "行動済み" : isSelected ? "👉 選択中" : "攻撃可能"} isEnemy={false} onDoubleClick={() => setDetailCard(card)} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>


      {/* ========================================================
          📦 エリア②：下部固定操作パネル（高さ220pxで完全固定！）
      ======================================================== */}
      <div style={{ height: '220px', minHeight: '220px', background: '#2c3e50', borderTop: '4px solid #f1c40f', display: 'flex', alignItems: 'center', padding: '10px 20px', gap: '20px', boxSizing: 'border-box', zIndex: 100 }}>
        
        {/* 左〜中央：手札の横スクロールコンテナ（圧縮防止・見切れ対策） */}
        <div style={{ flex: 1, overflowX: 'auto', display: 'flex', height: '100%', alignItems: 'center', paddingBottom: '5px' }}>
          <div style={{ display: 'flex', gap: '10px', paddingTop: '15px', paddingLeft: '10px', paddingRight: '10px', width: 'max-content' }}>
            {playerHand.map((card, idx) => (
              <div key={idx} style={{ flexShrink: 0 }}>
                <Card 
                  cardData={card} 
                  statusText={pendingTarget && pendingTarget.handIndex === idx ? "❌ 中断" : ""} 
                  isEnemy={false}
                  onDragStart={(e) => {
                    if (pendingTarget) return e.preventDefault();
                    e.dataTransfer.setData("handIndex", idx);
                  }} 
                  onDoubleClick={() => setDetailCard(card)} 
                />
              </div>
            ))}
          </div>
        </div>

        {/* 🔴 右端：赤丸のエリア（操作ボタン群を縦に配置） */}
        <div style={{ width: '200px', minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '20px', borderLeft: '3px solid #34495e', boxSizing: 'border-box', justifyContent: 'center' }}>
          
          {/* 🌟 ここに手札の枚数表示を引っ越し！ */}
          <div style={{ textAlignment: 'center', background: '#34495e', color: '#1abc9c', padding: '6px 10px', borderRadius: '5px', fontSize: '0.9rem', fontWeight: 'bold', textAlign: 'center', boxShadow: 'inset 0 0 5px rgba(0,0,0,0.3)' }}>
            手札: {playerHand.length} / 10 枚
          </div>

          <button 
            className="pc-menu-btn" 
            style={{ background: isPlayerTurn ? '#f39c12' : '#7f8c8d', color: 'white', fontSize: '1.2rem', padding: '15px 0', width: '100%', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: isPlayerTurn && !pendingTarget ? 'pointer' : 'not-allowed', boxShadow: '0 3px 6px rgba(0,0,0,0.3)' }} 
            onClick={endPlayerTurn} 
            disabled={!isPlayerTurn || pendingTarget}
          >
            {isPlayerTurn ? "ターン終了" : "相手のターン"}
          </button>
          
          <button 
            className="pc-menu-btn" 
            style={{ background: '#c0392b', color: 'white', fontSize: '1rem', padding: '10px 0', width: '100%', border: 'none', borderRadius: '6px', cursor: 'pointer', transition: 'background 0.2s' }} 
            onClick={onBack}
          >
            🏳️ 降参する
          </button>
        </div>

      </div>

    </div>
  );
}

export default BattleScreen;