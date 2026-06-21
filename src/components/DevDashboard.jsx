// src/components/DevDashboard.jsx
import React, { useState, useEffect } from 'react';
import { collection, setDoc, doc, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

const requiresTargetCardName = ["search_card_to_hand", "recruit_card_to_field", "generate_card_to_hand", "discard_specific"];

function DevDashboard({ onBack }) {
  const [activeTab, setActiveTab] = useState('register');

  const [cardName, setCardName] = useState("");
  const [cardType, setCardType] = useState("character");
  const [cost, setCost] = useState(1);
  const [costType, setCostType] = useState("mana");
  const [power, setPower] = useState(0);
  const [hp, setHp] = useState(0);
  const [trigger, setTrigger] = useState("none"); 
  const [effectType, setEffectType] = useState("none");
  const [effectValue, setEffectValue] = useState(0);
  const [effectTargetName, setEffectTargetName] = useState("");
  const [imagePath, setImagePath] = useState("img/Slime.png");
  const [effectText, setEffectText] = useState("");

  const [cardList, setCardList] = useState([]);

  const fetchCards = async () => {
    try {
      const snapshot = await getDocs(collection(db, "cards"));
      const cards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      cards.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      setCardList(cards);
    } catch (error) {
      console.error("カード一覧の取得に失敗:", error);
    }
  };

  useEffect(() => {
    fetchCards();
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!cardName.trim()) return alert("カード名を入力してください");

    const cardId = cardName.trim();
    const cardData = {
      name: cardName.trim(),
      cardType,
      cost: Number(cost),
      costType,
      power: cardType === 'character' ? Number(power) : 0,
      hp: cardType === 'character' ? Number(hp) : 0,
      trigger,
      effectType,
      effectValue: Number(effectValue),
      effectTargetName: requiresTargetCardName.includes(effectType) ? effectTargetName.trim() : "",
      image: imagePath.trim(),
      effectText: effectText.trim(),
      isMana: cardType === 'mana'
    };

    try {
      await setDoc(doc(db, "cards", cardId), cardData);
      alert(`🎉 カード「${cardName}」の登録・更新に成功しました！`);
      setCardName("");
      setEffectText("");
      setEffectTargetName("");
      fetchCards();
    } catch (error) {
      console.error("登録エラー:", error);
      alert("登録に失敗しました");
    }
  };

  const handleDeleteCard = async (cardId, name) => {
    if (!window.confirm(`本当に「${name}」をマスターデータから削除しますか？`)) return;
    try {
      await deleteDoc(doc(db, "cards", cardId));
      setCardList(cardList.filter(c => c.id !== cardId));
      alert(`🗑️ 「${name}」を削除しました！`);
    } catch (error) {
      console.error("削除エラー:", error);
      alert("削除に失敗しました。");
    }
  };

  return (
    <div style={{ height: '100vh', overflowY: 'auto', padding: '30px', color: 'white', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ color: '#f1c40f', marginBottom: '25px', borderBottom: '3px solid #f1c40f', display: 'inline-block', paddingBottom: '5px' }}>
        ⚙️ 開発者ダッシュボード
      </h2>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '30px', borderBottom: '2px solid #34495e', paddingBottom: '10px' }}>
        <button onClick={() => setActiveTab('register')} style={{ padding: '12px 24px', background: activeTab === 'register' ? '#2ecc71' : '#2c3e50', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          ➕ カードを新規登録
        </button>
        <button onClick={() => { setActiveTab('list'); fetchCards(); }} style={{ padding: '12px 24px', background: activeTab === 'list' ? '#3498db' : '#2c3e50', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          📋 登録済み一覧 ({cardList.length}枚)
        </button>
      </div>

      {activeTab === 'register' && (
        <form onSubmit={handleRegister} style={{ background: '#2c3e50', padding: '25px', borderRadius: '8px', border: '2px solid #34495e', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', textAlign: 'left' }}>
          
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>カード名（重複時は上書き）</label>
            <input type="text" value={cardName} onChange={(e) => setCardName(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: 'none', background: '#1a252f', color: 'white', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>カードの種類</label>
            <select value={cardType} onChange={(e) => setCardType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: 'none', background: '#1a252f', color: 'white' }}>
              <option value="character">character (ミニオン)</option>
              <option value="magic">magic (魔法・使い切り)</option>
              <option value="mana">mana (マナ結晶システム)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>使用コスト</label>
            <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: 'none', background: '#1a252f', color: 'white', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>コストの支払い先</label>
            <select value={costType} onChange={(e) => setCostType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: 'none', background: '#1a252f', color: 'white' }}>
              <option value="mana">💎 マナ結晶を消費</option>
              <option value="hp">💔 自分のライフを消費</option>
            </select>
          </div>

          {cardType === 'character' && (
            <>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#e74c3c' }}>⚔️ 攻撃力 (Power)</label>
                <input type="number" value={power} onChange={(e) => setPower(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: 'none', background: '#1a252f', color: 'white', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#2ecc71' }}>💖 体力 (HP)</label>
                <input type="number" value={hp} onChange={(e) => setHp(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: 'none', background: '#1a252f', color: 'white', boxSizing: 'border-box' }} />
              </div>
            </>
          )}

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>発動タイミング (Trigger) 🌟復活!</label>
            <select value={trigger} onChange={(e) => setTrigger(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: 'none', background: '#1a252f', color: 'white' }}>
              <option value="none">なし（バニラ）</option>
              <option value="play">play (召喚時 / 魔法発動時)</option>
              <option value="death">death (破壊時・断末魔)</option>
              <option value="attack">attack (攻撃時)</option>
              <option value="turn_start">turn_start (自分のターン開始時)</option>
              <option value="turn_end">turn_end (自分のターン終了時)</option>
              <option value="passive">passive (永続・パッシブ)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>特殊効果 (Effect Type) 🌟復活!</label>
            <select value={effectType} onChange={(e) => setEffectType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: 'none', background: '#1a252f', color: 'white' }}>
              <option value="none">効果なし</option>
              <option value="damage_single_enemy">damage_single_enemy (敵1体にダメージ/要対象)</option>
              <option value="destroy_single_enemy">destroy_single_enemy (敵1体を破壊/要対象)</option>
              <option value="buff_single_ally">buff_single_ally (味方1体を強化/要対象)</option>
              <option value="gain_mana">gain_mana (マナ結晶を手札に生成)</option>
              <option value="heal_player">heal_player (自分のライフ回復)</option>
              <option value="damage_enemy_player">damage_enemy_player (相手ライフへ直撃)</option>
              <option value="damage_all_enemies">damage_all_enemies (敵全体へ全体火力)</option>
              <option value="buff_all_allies">buff_all_allies (味方全員のステータス強化)</option>
              <option value="increase_max_hp">increase_max_hp (最大HPと現在HPを同時増加)</option>
              <option value="draw_card">draw_card (山札からドローする)</option>
              <option value="search_card_to_hand">search_card_to_hand (特定のカードをデッキから手札へ)</option>
              <option value="recruit_card_to_field">recruit_card_to_field (特定のカードをデッキから直接召喚)</option>
              <option value="generate_card_to_hand">generate_card_to_hand (特定のカードを新規生成して手札へ)</option>
              <option value="discard_all_hand">discard_all_hand (手札を全廃棄)</option>
              <option value="discard_random">discard_random (相手の手札をランダムハンデス)</option>
              <option value="discard_specific">discard_specific (指定した名前のカードを手札から捨てる)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>効果の数値 (Effect Value)</label>
            <input type="number" value={effectValue} onChange={(e) => setEffectValue(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: 'none', background: '#1a252f', color: 'white', boxSizing: 'border-box' }} />
          </div>

          {requiresTargetCardName.includes(effectType) && (
            <div style={{ gridColumn: '1 / -1', background: '#e67e22', padding: '10px', borderRadius: '6px' }}>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: 'black' }}>🎯 対象とする具体的なカード名（完全一致）</label>
              <input type="text" value={effectTargetName} onChange={(e) => setEffectTargetName(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: 'none', background: '#1a252f', color: 'white', boxSizing: 'border-box' }} placeholder="例: 金塊" />
            </div>
          )}

          {/* 🌟 ファイル直接選択機能を復活！ */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>画像ファイルのパス</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input type="text" value={imagePath} onChange={(e) => setImagePath(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: '4px', border: 'none', background: '#1a252f', color: 'white', boxSizing: 'border-box' }} />
              <label style={{ background: '#3498db', color: 'white', padding: '10px 15px', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                📁 ファイルを選択
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setImagePath(`img/${e.target.files[0].name}`);
                  }
                }} />
              </label>
            </div>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>カード効果のテキスト説明文</label>
            <textarea value={effectText} onChange={(e) => setEffectText(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: 'none', background: '#1a252f', color: 'white', boxSizing: 'border-box', height: '60px', resize: 'none' }} />
          </div>

          <button type="submit" className="pc-menu-btn" style={{ gridColumn: '1 / -1', background: '#2ecc71', padding: '15px', fontSize: '1.2rem', marginTop: '10px' }}>
            💾 このカードをデータベースに登録
          </button>
        </form>
      )}

      {activeTab === 'list' && (
        <div style={{ background: '#2c3e50', padding: '25px', borderRadius: '8px', border: '2px solid #34495e', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#f1c40f' }}>📋 登録済みマスターカード ({cardList.length}枚)</h3>
            <button onClick={fetchCards} style={{ padding: '8px 16px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              ↻ リストを更新
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '60vh', overflowY: 'auto', paddingRight: '10px' }}>
            {cardList.length === 0 ? <p style={{ color: '#bdc3c7', textAlign: 'center' }}>カードがありません。</p> : (
              cardList.map(card => (
                <div key={card.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a252f', padding: '15px', borderRadius: '6px', borderLeft: card.cardType === 'magic' ? '5px solid #9b59b6' : card.cardType === 'mana' ? '5px solid #3498db' : '5px solid #2ecc71' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#fff' }}>{card.name}</div>
                    <div style={{ fontSize: '0.85rem', color: '#bdc3c7', marginTop: '6px' }}>
                      <span style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '3px', marginRight: '8px' }}>{card.cardType.toUpperCase()}</span>
                      コスト: {card.cost || 0} ({card.costType === 'hp' ? 'HP' : 'マナ'}) 
                      {card.cardType === 'character' && ` | ⚔️${card.power} / 💖${card.hp}`}
                    </div>
                    {card.effectText && <div style={{ fontSize: '0.9rem', color: '#f1c40f', marginTop: '6px', fontStyle: 'italic' }}>効果: {card.effectText}</div>}
                  </div>
                  <button onClick={() => handleDeleteCard(card.id, card.name)} style={{ background: '#e74c3c', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    🗑️ 削除
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <button className="pc-menu-btn" style={{ background: '#7f8c8d', marginTop: '30px', width: '100%' }} onClick={onBack}>
        戻る
      </button>
    </div>
  );
}

export default DevDashboard;