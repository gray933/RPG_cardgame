// src/components/DevDashboard.jsx
import { useState } from 'react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

function DevDashboard({ onBack }) {
  const [name, setName] = useState('');
  const [image, setImage] = useState('img/default.png');
  const [cardType, setCardType] = useState('character');
  const [costType, setCostType] = useState('mana');
  const [cost, setCost] = useState(1);
  const [power, setPower] = useState(0);
  const [hp, setHp] = useState(0);
  const [trigger, setTrigger] = useState('play');
  const [effectType, setEffectType] = useState('none');
  const [effectValue, setEffectValue] = useState(0);
  const [effectTargetName, setEffectTargetName] = useState(''); // 🌟新設：システム用の対象カード名
  const [effectText, setEffectText] = useState('');
  const [batchCards, setBatchCards] = useState([]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const autoPath = `img/${file.name}`;
    setImage(autoPath);
    alert(`📸 画像パスを自動設定しました: ${autoPath}`);
  };

  const handleAddCard = () => {
    if (!name) return alert("カード名を入力してください！");
    const newCard = { name, image, cardType, costType: "mana", cost: Number(cost), effectText };
    if (cardType === 'character') {
      newCard.power = Number(power);
      newCard.hp = Number(hp);
    }
    if (effectType !== 'none') {
      newCard.trigger = trigger;
      newCard.effectType = effectType;
      newCard.effectValue = Number(effectValue);
      newCard.effectTargetName = effectTargetName.trim(); // 🌟DBに保存
    }
    setBatchCards([...batchCards, newCard]);
    alert(`[${name}] をバッチリストに追加しました！`);
  };

  const handleBulkRegister = async () => {
    if (batchCards.length === 0) return alert("登録するカードがありません！");
    try {
      const batch = writeBatch(db);
      batchCards.forEach((card) => {
        const newCardRef = doc(collection(db, "cards"));
        batch.set(newCardRef, card);
      });
      await batch.commit();
      alert(`🎉 成功！ ${batchCards.length} 枚のカードをDBに一括登録しました！`);
      setBatchCards([]);
    } catch (error) {
      console.error("一括登録エラー:", error);
      alert("⚠️ 登録に失敗しました...");
    }
  };

  // 表示用に一部の効果タイプ名に注釈を入れました
  const requiresTargetCardName = [
    "search_card_to_hand",
    "recruit_card_to_field",
    "generate_card_to_hand",
    "generate_card_to_field"
  ].includes(effectType);

  return (
    <div style={{ padding: '20px', paddingBottom: '100px', color: 'white', background: '#2c3e50', height: '100vh', overflowY: 'auto', boxSizing: 'border-box' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>🛠️ 開発者用 カードジェネレーター</h1>
        <button className="pc-menu-btn" onClick={onBack} style={{ background: '#7f8c8d' }}>戻る</button>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginTop: '20px', flexWrap: 'wrap' }}>

        {/* 左側：入力フォーム */}
        <div style={{ flex: '1 1 400px', background: '#34495e', padding: '20px', borderRadius: '10px' }}>
          <h3>カードパラメータ入力</h3>

          <div style={{ marginBottom: '10px' }}>
            <label>カード名: </label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '5px' }} />
          </div>

          <div style={{ marginBottom: '15px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '5px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>カード画像設定: </label>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
              <input type="file" id="file-input" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
              <button type="button" onClick={() => document.getElementById('file-input').click()} style={{ background: '#3498db', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                📁 パソコンからファイルを選択
              </button>
              <div style={{ fontSize: '0.85rem', color: '#bdc3c7' }}>現在のパス: <code style={{ color: '#f1c40f' }}>{image}</code></div>
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label>カードタイプ: </label>
            <select value={cardType} onChange={e => setCardType(e.target.value)} style={{ width: '100%', padding: '5px' }}>
              <option value="character">キャラクター (Character)</option>
              <option value="magic">魔法 (Magic)</option>
            </select>
          </div>

          <hr style={{ borderColor: '#7f8c8d', margin: '20px 0' }} />

          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontWeight: 'bold' }}>コストの支払い方法: </label>
            <select value={costType} onChange={e => setCostType(e.target.value)} style={{ width: '100%', padding: '5px', border: '1px solid #f1c40f' }}>
              <option value="mana">マナ結晶を消費 (mana)</option>
              <option value="hp">自分の最大HPと現在HPを消費 (hp)</option>
            </select>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label style={{ color: '#f1c40f', fontWeight: 'bold' }}>消費マナコスト (Cost): </label>
            <input type="number" value={cost} onChange={e => setCost(e.target.value)} min="0" style={{ width: '100%', padding: '5px' }} />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <div style={{ flex: 1 }}>
              <label>攻撃力 (Power): </label>
              <input type="number" value={power} onChange={e => setPower(e.target.value)} disabled={cardType !== 'character'} style={{ width: '100%', padding: '5px' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label>体力 (HP): </label>
              <input type="number" value={hp} onChange={e => setHp(e.target.value)} disabled={cardType !== 'character'} style={{ width: '100%', padding: '5px' }} />
            </div>
          </div>

          <hr style={{ borderColor: '#7f8c8d', margin: '20px 0' }} />

          <div style={{ marginBottom: '10px' }}>
            <label>効果の発動タイミング (Trigger): </label>
            <select value={trigger} onChange={e => setTrigger(e.target.value)} style={{ width: '100%', padding: '5px' }}>
              <option value="play">場に出した時・使った時 (play)</option>
              <option value="attack">攻撃した時 (attack)</option>
              <option value="turn_start">自分のターン開始時 / パッシブ (turn_start)</option>
              <option value="death">破壊された時 (death)</option>
            </select>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label>DB制御用 効果タイプ (EffectType): </label>
            <select value={effectType} onChange={e => setEffectType(e.target.value)} style={{ width: '100%', padding: '5px' }}>
              <option value="none">効果なし</option>
              <option value="gain_mana">マナを増やす (gain_mana)</option>
              <option value="heal_player">プレイヤーを回復 (heal_player)</option>
              <option value="draw_card">カードを引く (draw_card)</option>
              <option value="increase_max_hp">最大HPを増やす (increase_max_hp)</option>
              <option value="damage_enemy_player">相手プレイヤーにダメージ (damage_enemy_player)</option>
              <option value="damage_all_enemies">敵モンスター全体にダメージ (damage_all_enemies)</option>
              <option value="buff_all_allies">味方全体を強化 (buff_all_allies)</option>
              <option value="damage_single_enemy">敵1体にダメージ (damage_single_enemy)</option>
              <option value="destroy_single_enemy">敵1体を破壊 (destroy_single_enemy)</option>
              <option value="buff_single_ally">味方1体を強化 (buff_single_ally)</option>
              <option value="search_card_to_hand">サーチ：特定のカードをデッキから手札に加える</option>
              <option value="recruit_card_to_field">リクルート：特定のカードをデッキから場に出す</option>
              <option value="generate_card_to_hand">トークン：デッキ外からカードを生成して手札に加える</option>
              <option value="generate_card_to_field">トークン：デッキ外からカードを生成して場に出す</option>
              <option value="discard_all_hand">手札をすべて捨てる (discard_all_hand)</option>
            </select>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label>効果量 (EffectValue): </label>
            <input type="number" value={effectValue} onChange={e => setEffectValue(e.target.value)} disabled={effectType === 'none'} style={{ width: '100%', padding: '5px' }} />
          </div>

          {/* 🌟新設：効果対象カード名の入力欄（サーチやトークン系の時だけ活性化・強調されます） */}
          <div style={{ marginBottom: '10px', background: requiresTargetCardName ? 'rgba(241, 196, 15, 0.1)' : 'transparent', padding: '5px', borderRadius: '5px', border: requiresTargetCardName ? '1px dashed #f1c40f' : 'none' }}>
            <label style={{ color: requiresTargetCardName ? '#f1c40f' : 'white', fontWeight: requiresTargetCardName ? 'bold' : 'normal' }}>
              🎯 効果の対象カード名 (EffectTargetName):
            </label>
            <input
              type="text"
              value={effectTargetName}
              onChange={e => setEffectTargetName(e.target.value)}
              disabled={!requiresTargetCardName}
              placeholder="例: 勇者 / スライム (サーチ・トークン系効果のみ使用)"
              style={{ width: '100%', padding: '5px', marginTop: '3px' }}
            />
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label>テキスト（表示用・プレイヤー向け説明文）: </label>
            <input type="text" value={effectText} onChange={e => setEffectText(e.target.value)} placeholder="例: 召喚時: デッキから「勇者」を1枚手札に加える。" style={{ width: '100%', padding: '5px' }} />
          </div>

          <button onClick={handleAddCard} style={{ width: '100%', padding: '15px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '1.2rem', marginTop: '10px', fontWeight: 'bold' }}>
            ➕ このカードを送信リストに追加
          </button>
        </div>

        {/* 右側：バッチリスト */}
        <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ background: '#34495e', padding: '20px', borderRadius: '10px' }}>
            <h3>送信待機リスト ({batchCards.length}枚)</h3>
            <div style={{ background: '#1abc9c', color: 'black', padding: '10px', borderRadius: '5px', maxHeight: '200px', overflowY: 'auto' }}>
              {batchCards.length === 0 ? "まだありません" : batchCards.map((c, i) => (
                <div key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.2)', paddingBottom: '5px', marginBottom: '5px' }}>
                  {i + 1}. <b>{c.name}</b> ({c.cardType} / コスト:{c.cost})
                </div>
              ))}
            </div>
            <button onClick={handleBulkRegister} disabled={batchCards.length === 0} style={{ width: '100%', padding: '15px', background: batchCards.length > 0 ? '#e74c3c' : '#7f8c8d', color: 'white', border: 'none', borderRadius: '5px', cursor: batchCards.length > 0 ? 'pointer' : 'not-allowed', fontSize: '1.2rem', marginTop: '20px', fontWeight: 'bold' }}>
              🚀 リストのカードをDBに一括登録！
            </button>
            <button onClick={() => setBatchCards([])} style={{ width: '100%', padding: '5px', marginTop: '10px', background: 'transparent', color: '#e74c3c', border: '1px solid #e74c3c', cursor: 'pointer' }}>リストをクリア</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DevDashboard;