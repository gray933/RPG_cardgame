import React, { useState, useEffect } from 'react';
import Card from './Card';
import { useBattle } from '../hooks/useBattle';
import { doc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore'; // 🌟 追加
import { db } from '../firebase';                    // 🌟 追加

// 引数に isPvP, roomId, myRole を追加
function BattleScreen({ playerDeckData, enemyDeckData, onBack, isPvP = false, roomId = '', myRole = 'host' }) {
  const [viewingGrave, setViewingGrave] = useState(null);
  const [popup, setPopup] = useState({ id: 0, msg: "" });
  const [detailCard, setDetailCard] = useState(null);

  // 🌟 PvP用のリアルタイム部屋データStateを追加
  const [roomData, setRoomData] = useState(null);

  const triggerPopup = (msg) => setPopup({ id: Date.now(), msg });

  // 🌟 PvPモードの時だけ、Firestoreのルームを常時監視して同期する
  useEffect(() => {
    if (!isPvP || !roomId) return;

    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        setRoomData(docSnap.data());
      }
    });
    return () => unsubscribe();
  }, [isPvP, roomId]);

  // 🌟 useBattleの呼び出し引数を PvP/AI 兼用仕様にアップデート
  const {
    playerMaxLife, enemyMaxLife, playerLife, enemyLife,
    playerDeck, playerHand, playerField,
    enemyDeck, enemyHand, enemyField,
    playerGrave, enemyGrave,
    isPlayerTurn, gameState, selectedAttackerIdx, pendingTarget,
    pendingPeeping, resolvePeeping,
    playCard, endPlayerTurn, handleSelectAttacker, handleFightMinion, handleDirectAttack
  } = useBattle({
    roomId,
    myRole,
    isPvP,
    roomData, // 🌟 リアルタイムデータを受け渡す
    playerDeckData,
    enemyDeckData,
    triggerPopup,
    onBack
  });
  // 🌟 (追加) 相手の役割を判定
  const enemyRole = myRole === 'host' ? 'guest' : 'host';

  // 🌟 既存の handleSurrender（降参ボタン用）や、リザルト画面の「メニューに戻る」の処理を統合する、安全なクリーンアップ関数を作成
  const cleanUpAndGoBack = async () => {
    if (isPvP && roomId) {
      try {
        const roomRef = doc(db, 'rooms', roomId);

        if (gameState !== 'playing') {
          await deleteDoc(roomRef);
        } else {
          // まだプレイ中の場合は、自分が降参したため相手を勝者として更新する（削除はしない）
          await updateDoc(roomRef, {
            status: 'finished',
            winner: enemyRole,
            reason: 'surrender'
          });
          // 降参処理の送信が完了するのを少し待ってから画面を戻す
          setTimeout(() => {
            onBack();
          }, 500);
          return; // setTimeout内でonBackを呼ぶため、関数をここで終了
        }
      } catch (error) {
        console.error("ルームクリーンアップエラー:", error);
      }
    }
    onBack();
  };

  // 🌟 (追加) ブラウザのタブ閉じやリロード（強制切断）を検知する
  useEffect(() => {
    if (!isPvP || gameState !== 'playing') return;

    const handleWindowClose = (e) => {
      // タブが閉じられる瞬間に降参処理を投げる
      const roomRef = doc(db, 'rooms', roomId);
      updateDoc(roomRef, {
        status: 'finished',
        winner: enemyRole,
        reason: 'disconnect'
      });
      // 一部のブラウザではダイアログを出すために必要
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleWindowClose);
    return () => {
      window.removeEventListener('beforeunload', handleWindowClose);
    };
  }, [isPvP, gameState, roomId, enemyRole]);

  useEffect(() => {
    if (popup.msg) {
      const timer = setTimeout(() => setPopup({ id: 0, msg: "" }), 1200);
      return () => clearTimeout(timer);
    }
  }, [popup]);

  // ローディング待機（PvPでデータが降ってくるまで一瞬待つ）
  if (isPvP && !roomData) {
    return <div style={{ color: 'white', textAlign: 'center', marginTop: '100px' }}><h2>⚔️ 対戦空間を同期中...</h2></div>;
  }

  return (
    <div id="game-screen" style={{ position: 'relative', width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: '#1e272e', overflow: 'hidden' }}>

      <style>{`
        @keyframes cutInAnim {
          0% { transform: translate(-50%, -50%) scale(0.8) skewX(-10deg); opacity: 0; }
          15% { transform: translate(-50%, -50%) scale(1.1) skewX(0deg); opacity: 1; }
          85% { transform: translate(-50%, -50%) scale(1) skewX(0deg); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.2) skewX(10deg); opacity: 0; }
        }
      `}</style>

      {/* モーダルや警告系のUI群 */}
      {pendingTarget && (
        <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', background: '#e74c3c', color: 'white', padding: '10px 30px', borderRadius: '30px', fontWeight: 'bold', zIndex: 1500, boxShadow: '0 0 15px rgba(231,76,60,0.8)' }}>
          🎯 ターゲットを選択してください
        </div>
      )}

      {/* ピーピングハンデス用の選択モーダル */}
      {pendingPeeping && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: '#f1c40f', marginBottom: '30px', textShadow: '0 0 10px #f39c12' }}>
            👁️ ピーピング・ハンデス！ 👁️<br />
            <span style={{ fontSize: '1.2rem', color: 'white' }}>相手の手札から捨てるカードを1枚選んでください</span>
          </h2>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', maxWidth: '90%', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', padding: '30px', borderRadius: '10px' }}>
            {enemyHand.map((c, i) => (
              <div key={i} onClick={() => resolvePeeping(i)} style={{ cursor: 'pointer', transform: 'scale(1.1)', transition: 'transform 0.2s' }}>
                <Card cardData={c} isEnemy={false} statusText="☠️ 破壊" />
              </div>
            ))}
          </div>
        </div>
      )}

      {detailCard && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#34495e', padding: '30px', borderRadius: '15px', border: '3px solid #f1c40f', textAlign: 'center', maxWidth: '400px', width: '80%', color: 'white', boxShadow: '0 0 25px rgba(0,0,0,0.5)' }}>
            <h2 style={{ margin: '0 0 10px 0', color: '#f1c40f' }}>🔍 CARD DETAILS</h2>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}><Card cardData={detailCard} isEnemy={false} statusText={detailCard.cardType === 'magic' ? '魔法' : 'キャラクター'} /></div>
            <h3 style={{ margin: '10px 0 5px 0', borderBottom: '1px solid #7f8c8d', paddingBottom: '5px' }}>{detailCard.name}</h3>
            <p style={{ fontSize: '0.9rem', color: '#bdc3c7', margin: '5px 0' }}>コスト: {detailCard.isMana ? 'なし' : (detailCard.cost !== undefined ? detailCard.cost : 1)}マナ</p>
            {detailCard.cardType === 'character' && (
              <p style={{ fontWeight: 'bold', margin: '5px 0' }}>攻撃力: <span style={{ color: '#e74c3c' }}>⚔️{detailCard.power}</span> / 体力: <span style={{ color: '#2ecc71' }}>💖{detailCard.hp}</span></p>
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

          {gameState === 'win' && (
            <>
              <h1 style={{ fontSize: '5rem', color: '#f1c40f', textShadow: '0 0 20px #f39c12', margin: 0 }}>YOU WIN!</h1>
              {roomData?.reason === 'surrender' && <p style={{ fontSize: '1.5rem', color: '#bdc3c7' }}>相手が降参しました</p>}
              {roomData?.reason === 'disconnect' && <p style={{ fontSize: '1.5rem', color: '#bdc3c7' }}>相手の通信が切断されました</p>}
            </>
          )}

          {gameState === 'lose' && <h1 style={{ fontSize: '5rem', color: '#e74c3c', textShadow: '0 0 20px #c0392b' }}>YOU LOSE...</h1>}

          <button 
            className="pc-menu-btn" 
            style={{ background: '#3498db', fontSize: '1.5rem', padding: '15px 40px', marginTop: '20px' }} 
            onClick={cleanUpAndGoBack}
          >
            メニューに戻る
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 10px', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box' }}>
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

      <div style={{ height: '220px', minHeight: '220px', background: '#2c3e50', borderTop: '4px solid #f1c40f', display: 'flex', alignItems: 'center', padding: '10px 20px', gap: '20px', boxSizing: 'border-box', zIndex: 100 }}>
        <div style={{ flex: 1, overflowX: 'auto', display: 'flex', height: '100%', alignItems: 'center', paddingBottom: '5px' }}>
          <div style={{ display: 'flex', gap: '10px', paddingTop: '15px', paddingLeft: '10px', paddingRight: '10px', width: 'max-content' }}>
            {playerHand.map((card, idx) => (
              <div key={idx} style={{ flexShrink: 0 }}>
                <Card cardData={card} statusText={pendingTarget && pendingTarget.handIndex === idx ? "❌ 中断" : ""} isEnemy={false} onDragStart={(e) => { if (pendingTarget) return e.preventDefault(); e.dataTransfer.setData("handIndex", idx); }} onDoubleClick={() => setDetailCard(card)} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ width: '200px', minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '20px', borderLeft: '3px solid #34495e', boxSizing: 'border-box', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', background: '#34495e', color: '#1abc9c', padding: '6px 10px', borderRadius: '5px', fontSize: '0.9rem', fontWeight: 'bold', boxShadow: 'inset 0 0 5px rgba(0,0,0,0.3)' }}>手札: {playerHand.length} / 10 枚</div>
          <button className="pc-menu-btn" style={{ background: isPlayerTurn ? '#f39c12' : '#7f8c8d', color: 'white', fontSize: '1.2rem', padding: '15px 0', width: '100%', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: isPlayerTurn && !pendingTarget ? 'pointer' : 'not-allowed', boxShadow: '0 3px 6px rgba(0,0,0,0.3)' }} onClick={endPlayerTurn} disabled={!isPlayerTurn || pendingTarget}>
            {isPlayerTurn ? "ターン終了" : "相手のターン"}
          </button>
          <button
            className="pc-menu-btn"
            style={{ background: '#c0392b', color: 'white', fontSize: '1rem', padding: '10px 0', width: '100%', border: 'none', borderRadius: '6px', cursor: 'pointer', transition: 'background 0.2s' }}
            onClick={cleanUpAndGoBack}
          >
            🏳️ 降参する
          </button>
        </div>
      </div>
    </div>
  );
}

export default BattleScreen;