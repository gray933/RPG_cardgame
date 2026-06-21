import React, { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

const MANA_CARD = { name: "マナ結晶", cardType: "mana", effectText: "コスト用", image: "img/mana.png", isMana: true };

// 配列をランダムにシャッフルする関数
const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

function MatchingScreen({ myDeck, playerName,onBattleStart, onBack }) {
  const [inputRoomId, setInputRoomId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [error, setError] = useState('');
  const [myRole, setMyRole] = useState(''); // 'host' or 'guest'

  // 🌟 ホスト主導のゲーム初期化
  const initializeGameByHost = async (targetRoomId, currentData) => {
    const hostDeck = shuffleArray(currentData.players.host.deck);
    const guestDeck = shuffleArray(currentData.players.guest.deck);

    const hostHand = [];
    for (let i = 0; i < 4; i++) if (hostDeck.length > 0) hostHand.push(hostDeck.shift());
    hostHand.push(JSON.parse(JSON.stringify(MANA_CARD)));

    const guestHand = [];
    for (let i = 0; i < 3; i++) if (guestDeck.length > 0) guestHand.push(guestDeck.shift());
    guestHand.push(JSON.parse(JSON.stringify(MANA_CARD)));

    const roomRef = doc(db, 'rooms', targetRoomId);
    await updateDoc(roomRef, {
      "players.host.deck": hostDeck,
      "players.host.hand": hostHand,
      "players.host.field": [],
      "players.host.graveyard": [],
      "players.guest.deck": guestDeck,
      "players.guest.hand": guestHand,
      "players.guest.field": [],
      "players.guest.graveyard": [],
      "isInitialized": true
    });
  };

  // 1. 部屋を作る（ホストになる）
  const createRoom = async () => {
    setError('');
    const newRoomId = Math.random().toString(36).substring(2, 6).toUpperCase(); 
    const roomRef = doc(db, 'rooms', newRoomId);

    const initialRoom = {
      roomId: newRoomId,
      status: 'waiting',
      currentTurn: 'host', 
      turnCount: 1,
      isInitialized: false,
      players: {
        host: {
          playerName: playerName || "プレイヤー1(ホスト)",
          hp: 20,
          maxHp: 20,
          deck: myDeck,
          hand: [], field: [], graveyard: []
        }
      },
      createdAt: new Date().toISOString()
    };

    await setDoc(roomRef, initialRoom);
    setRoomId(newRoomId);
    setMyRole('host');
  };

  // 2. 部屋に入る（ゲストになる）
  const joinRoom = async () => {
    setError('');
    const targetId = inputRoomId.trim().toUpperCase();
    if (!targetId) return;

    const roomRef = doc(db, 'rooms', targetId);
    const roomSnap = await getDoc(roomRef);

    if (!roomSnap.exists()) {
      setError('⚠️ 部屋が見つかりません');
      return;
    }

    const data = roomSnap.data();
    if (data.status !== 'waiting') {
      setError('⚠️ すでに満員か、対戦中の部屋です');
      return;
    }

    // ゲストデータを追加してステータスを playing に
    await updateDoc(roomRef, {
      status: 'playing',
      "players.guest": {
        playerName: playerName || "プレイヤー2(ゲスト)",
        hp: 20,
        maxHp: 20,
        deck: myDeck,
        hand: [], field: [], graveyard: []
      }
    });

    setRoomId(targetId);
    setMyRole('guest');
  };

  // 🌟 (追加) 待機をキャンセルして部屋を消して戻る関数
  const handleCancelWaiting = async () => {
    if (roomId && myRole === 'host') {
      try {
        const roomRef = doc(db, 'rooms', roomId);
        await deleteDoc(roomRef); // Firestoreからこの部屋を完全に消去！
      } catch (error) {
        console.error("部屋の削除に失敗しました:", error);
      }
    }
    onBack(); // メニューに戻る
  };

  // 3. ルームデータのリアルタイム監視
  useEffect(() => {
    if (!roomId) return;

    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRoomData(data);

        if (data.status === 'playing' && !data.isInitialized && myRole === 'host') {
          initializeGameByHost(roomId, data);
        }

        if (data.status === 'playing' && data.isInitialized) {
          onBattleStart(roomId, myRole);
        }
      }
    });

    return () => unsubscribe();
  }, [roomId, myRole]);

  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', color: 'white' }}>
      <h2 style={{ fontSize: '2.5rem', color: '#f1c40f', marginBottom: '30px', borderBottom: '3px solid #f1c40f', display: 'inline-block', paddingBottom: '10px' }}>
        ONLINE PVP LOBBY
      </h2>
      
      {error && <p style={{ color: '#e74c3c', fontWeight: 'bold', marginBottom: '20px' }}>{error}</p>}

      {!roomId ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', maxWidth: '400px', margin: '0 auto' }}>
          <button className="pc-menu-btn" style={{ padding: '20px', background: '#9b59b6', fontSize: '1.3rem' }} onClick={createRoom}>
            👑 部屋を作って待つ (ホスト)
          </button>
          
          {/* 👇 消えてしまっていたゲスト側の入室用UIを完全復活！ 👇 */}
          <div style={{ margin: '20px 0', color: '#7f8c8d' }}>━━━━━━━━ OR ━━━━━━━━</div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              placeholder="4桁のルームIDを入力" 
              value={inputRoomId}
              onChange={(e) => setInputRoomId(e.target.value)}
              style={{ flex: 1, padding: '15px', fontSize: '1.2rem', borderRadius: '8px', border: '2px solid #34495e', background: '#2c3e50', color: 'white', textAlign: 'center' }}
            />
            <button className="pc-menu-btn" style={{ padding: '0 25px', background: '#2ecc71', fontSize: '1.1rem' }} onClick={joinRoom}>
              参戦
            </button>
          </div>
          {/* 👆 ここまで 👆 */}
          
          <button className="pc-menu-btn" style={{ marginTop: '40px', background: '#7f8c8d' }} onClick={onBack}>メニューに戻る</button>
        </div>
      ) : (
        <div style={{ background: '#2c3e50', padding: '40px', borderRadius: '15px', maxWidth: '500px', margin: '0 auto', border: '2px solid #f1c40f' }}>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '10px' }}>ルーム作成成功！</h3>
          <h1 style={{ fontSize: '4rem', color: '#f1c40f', letterSpacing: '5px', margin: '10px 0' }}>{roomId}</h1>
          <p style={{ color: '#bdc3c7', fontSize: '1.1rem' }}>対戦相手にこの4桁のコードを伝えてください。</p>
          <div style={{ marginTop: '30px', color: '#e67e22', animation: 'blink 1.5s infinite' }}>⏳ 対戦相手の接続を待っています...</div>
          
          <button 
            className="pc-menu-btn" 
            style={{ marginTop: '30px', background: '#e74c3c', width: '100%', padding: '12px' }} 
            onClick={handleCancelWaiting}
          >
            ❌ 部屋を閉じて戻る
          </button>
        </div>
      )}
    </div>
  );
}

export default MatchingScreen;