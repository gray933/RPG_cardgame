import { useState, useEffect } from 'react';
import Card from './Card';
import './BattleScreen.css';
import { useBattle } from '../hooks/useBattle';
import { doc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore'; // 🌟 追加
import { db } from '../firebase';                    // 🌟 追加
import { SoundButton } from './SoundButton';

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
    <div id="game-screen" className="battle-screen" style={{ position: 'relative', width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: '#1e272e', overflow: 'hidden' }}>

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

          <SoundButton 
            className="pc-menu-btn" 
            style={{ background: '#3498db', fontSize: '1.5rem', padding: '15px 40px', marginTop: '20px' }} 
            onClick={cleanUpAndGoBack}
          >
            メニューに戻る
          </SoundButton>
        </div>
      )}

      <div className="battle-board">
        <section id="enemy-area" className="battle-side" onClick={handleDirectAttack}>
          <header className="battle-status">
            <h2>相手 <span>HP {enemyLife} / {enemyMaxLife}</span></h2>
            <div><span>手札 {enemyHand.length}/10</span><span>山札 {enemyDeck.length}</span><button onClick={e => { e.stopPropagation(); setViewingGrave('enemy'); }}>墓地 {enemyGrave.length}</button></div>
          </header>
          <div className="battle-field">
            {enemyField.map((card, idx) => <div className="battle-slot" key={idx} onClick={e => { e.stopPropagation(); handleFightMinion(idx); }}>
              <Card cardData={card} isEnemy statusText={pendingTarget ? '🎯 対象' : '敵軍'} />
            </div>)}
            {!enemyField.length && <span className="battle-empty">相手のフィールド</span>}
          </div>
        </section>
        <div className="battle-turn" aria-live="polite">{pendingTarget ? '🎯 効果の対象を選択' : selectedAttackerIdx !== null ? '攻撃対象を選択・相手のHPを押すと直接攻撃' : isPlayerTurn ? '🔵 あなたのターン' : '⏳ 相手のターン'}</div>
        <section className="battle-side battle-side--player">
          <header className="battle-status">
            <h2>あなた <span>HP {playerLife} / {playerMaxLife}</span></h2>
            <div><span>山札 {playerDeck.length}</span><button onClick={() => setViewingGrave('player')}>墓地 {playerGrave.length}</button></div>
          </header>
          <div id="player-field-area" className="battle-field" onDragOver={e => e.preventDefault()} onDrop={e => {
            e.preventDefault();
            const value = e.dataTransfer.getData('handIndex');
            if (/^\d+$/.test(value)) playCard(Number(value));
          }}>
            {playerField.map((card, idx) => <div key={idx} className={`battle-slot ${selectedAttackerIdx === idx ? 'battle-slot--selected' : ''}`} onClick={() => handleSelectAttacker(idx)}>
              <Card cardData={card} statusText={pendingTarget ? '🎯 対象' : card.hasAttacked ? '行動済み' : selectedAttackerIdx === idx ? '選択中' : '攻撃可能'} />
            </div>)}
            {!playerField.length && <span className="battle-empty">手札をタップ</span>}
          </div>
        </section>
      </div>
      <footer className="battle-hand-area">
        <div className="battle-hand-label">手札 {playerHand.length}/10 <span>効果：マウスを重ねる / 長押し</span></div>
        <div className="battle-hand">
          {playerHand.map((card, idx) => <div className="battle-slot" key={idx}>
            <Card cardData={card} statusText={pendingTarget?.handIndex === idx ? '❌ 中断' : ''}
              onClick={() => playCard(idx)}
              onDragStart={e => { if (pendingTarget) return e.preventDefault(); e.dataTransfer.setData('handIndex', idx); }} />
          </div>)}
        </div>
        <div className="battle-controls">
          <span>{isPlayerTurn ? '手札をタップして使用' : '相手の操作を待っています'}</span>
          <SoundButton className="pc-menu-btn battle-surrender" onClick={cleanUpAndGoBack}>🏳️ 降参</SoundButton>
          <button className="pc-menu-btn battle-end" onClick={endPlayerTurn} disabled={!isPlayerTurn || Boolean(pendingTarget)}>{isPlayerTurn ? 'ターン終了' : '相手のターン'}</button>
        </div>
      </footer>
    </div>
  );
}

export default BattleScreen;
