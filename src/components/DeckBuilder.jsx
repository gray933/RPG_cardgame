// src/components/DeckBuilder.jsx
import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import Card from './Card';

function DeckBuilder({ slotId, userId, onBack }) {
  const [allCards, setAllCards] = useState([]);
  const [deckCards, setDeckCards] = useState([]);
  const [loading, setLoading] = useState(true);

  // カードプールと自分専用のデッキをロード
  useEffect(() => {
    const loadBuilderData = async () => {
      setLoading(true);
      try {
        const cardsSnap = await getDocs(collection(db, "cards"));
        const list = cardsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllCards(list);
        console.log("読み込んだカードの枚数:", list.length);
        const myDeckDocName = `deck_${userId}_${slotId}`;
        const deckDoc = await getDoc(doc(db, "decks", myDeckDocName));
        if (deckDoc.exists()) {
          const loadedRawData = deckDoc.data().cards || [];
          
          // 名前（文字列）で保存されている場合はマスター(list)から検索して復元、
          // 古い形式（オブジェクト）の場合はそのまま使う処理
          const reconstructedDeck = loadedRawData.map(item => {
            if (typeof item === 'string') {
              return list.find(c => c.name === item);
            } else {
              // 昔のオブジェクト形式のデータ用フォールバック
              return list.find(c => c.name === item.name) || item;
            }
          }).filter(Boolean); // 削除されてしまったカード（undefined）を配列から弾く

          setDeckCards(reconstructedDeck);
        } else {
          setDeckCards([]);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    if (userId && slotId) loadBuilderData();
  }, [slotId, userId]);

  const addCard = (card) => {
    if (deckCards.length >= 20) return alert("⚠️ デッキは最大20枚です。");
    const count = deckCards.filter(c => c.name === card.name).length;
    if (count >= 2) return alert("⚠️ 同名カードは2枚までです。");
    setDeckCards([...deckCards, card]);
  };

  const removeCard = (index) => {
    setDeckCards(deckCards.filter((_, idx) => idx !== index));
  };

  const saveDeck = async () => {
    try {
      const myDeckDocName = `deck_${userId}_${slotId}`;
      const deckCardNames = deckCards.map(card => card.name);
      await setDoc(doc(db, "decks", myDeckDocName), { cards: deckCardNames });
      // 🌟 ポップアップを「デッキ X」に修正
      alert(`デッキ ${slotId} にマイデッキを保存しました！ (${deckCards.length}/20枚)`);
    } catch (error) {
      console.error(error);
      alert("⚠️ 保存に失敗しました");
    }
  };

  if (loading) return <div style={{ color: 'white', textAlign: 'center', marginTop: '100px' }}><h3>📥 デッキデータを構築中...</h3></div>;

  return (
    <div style={{ padding: '20px', color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #2ecc71', paddingBottom: '10px' }}>
        {/* 🌟 タイトルを「デッキ X」に修正 */}
        <h2>🛠 デッキ構築 (デッキ {slotId})</h2>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button className="pc-menu-btn" style={{ background: '#2ecc71', padding: '10px 25px' }} onClick={saveDeck}>💾 デッキを保存</button>
          <button className="pc-menu-btn" style={{ background: '#7f8c8d', padding: '10px 25px' }} onClick={onBack}>戻る</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
        {/* 左側: カードプール */}
        <div>
          <h3>🃏 カード一覧 (クリックでデッキに追加)</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', maxHeight: '70vh', overflowY: 'auto', padding: '10px', background: '#1a1a1a', borderRadius: '8px' }}>
            {allCards.map(card => {
              const currentInDeck = deckCards.filter(c => c.name === card.name).length;
              return (
                <div
                  key={card.id}
                  onClick={() => addCard(card)}
                  style={{
                    cursor: 'pointer',
                    opacity: currentInDeck >= 2 ? 0.4 : 1,
                    position: 'relative',
                    // 🌟 枠のサイズ指定はCard.jsx側(100x140)に合わせるか、少し余裕を持たせる
                    width: '100px',
                    height: '140px',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {/* 🌟 修正ポイント： card={card} ではなく、cardData={card} で渡す！！ */}
                  <Card cardData={card} />

                  {/* デッキに入っている枚数バッジ */}
                  {currentInDeck > 0 && (
                    <div style={{
                      position: 'absolute', top: '-5px', right: '-5px',
                      background: '#e67e22', color: 'white', borderRadius: '50%',
                      width: '24px', height: '24px', display: 'flex',
                      justifyContent: 'center', alignItems: 'center',
                      fontSize: '0.9rem', fontWeight: 'bold', border: '2px solid white',
                      zIndex: 10
                    }}>
                      {currentInDeck}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: '#2c3e50', padding: '15px', borderRadius: '8px', border: '2px solid #34495e' }}>
          <h3>📋 現在のデッキ ({deckCards.length} / 20)</h3>
          <div style={{ maxHeight: '65vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', padding: '5px' }}>
            {deckCards.length === 0 ? (
              <p style={{ color: '#7f8c8d', textAlign: 'center', marginTop: '20px' }}>カードがありません。<br />左から選んでください。</p>
            ) : (
              deckCards.map((card, idx) => (
                <div
                  key={idx}
                  onClick={() => removeCard(idx)}
                  className="deck-item-row"
                  title="クリックでデッキから外す"
                  style={{
                    display: 'flex',
                    flexDirection: 'column', // 🌟 要素を縦に並べるために column に変更
                    background: '#34495e',
                    padding: '8px 12px',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    borderLeft: card.cardType === 'mana' ? '4px solid #3498db' : card.cardType === 'magic' ? '4px solid #9b59b6' : '4px solid #2ecc71',
                    transition: 'transform 0.1s'
                  }}
                >
                  {/* カード名とステータスの行 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold' }}>{card.name}</span>
                    <span style={{ fontSize: '0.85rem', color: '#bdc3c7', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '3px' }}>
                      {card.cardType === 'mana' ? 'マナ' : card.cardType === 'magic' ? '魔法' : `${card.power}/${card.hp}`}
                    </span>
                  </div>

                  {/* 🌟 追加：カード効果を名前の下に表示 */}
                  {card.effect && (
                    <div style={{ fontSize: '0.75rem', color: '#f1c40f', marginTop: '4px' }}>
                      {card.effect}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DeckBuilder;