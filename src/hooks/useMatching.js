// src/hooks/useMatching.js (新規作成のイメージ)
import { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase'; // Firebaseの初期化ファイル

export const useMatching = (myDeck, myName) => {
  const [roomId, setRoomId] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [error, setError] = useState('');

  // 1. 部屋を作る（ホスト）
  const createRoom = async () => {
    // 4桁のランダムなIDを生成（例: "A7B9"）
    const newRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    const roomRef = doc(db, 'rooms', newRoomId);

    // 部屋の初期データをFirestoreに作成
    await setDoc(roomRef, {
      roomId: newRoomId,
      status: 'waiting',
      currentTurn: 'host', // ホストが先攻
      turnCount: 1,
      players: {
        host: {
          playerName: myName,
          hp: 20,
          maxHp: 20,
          mana: 1,
          deck: myDeck, // 構築したデッキ情報をセット
          hand: [],
          field: [],
          graveyard: []
        }
        // guest はまだ空
      },
      createdAt: new Date().toISOString()
    });

    setRoomId(newRoomId);
    listenToRoom(newRoomId); // 部屋の監視を開始
  };

  // 2. 部屋に入る（ゲスト）
  const joinRoom = async (inputRoomId) => {
    const roomRef = doc(db, 'rooms', inputRoomId.toUpperCase());
    const roomSnap = await getDoc(roomRef);

    if (!roomSnap.exists()) {
      setError('部屋が見つかりません');
      return;
    }

    const data = roomSnap.data();
    if (data.status !== 'waiting') {
      setError('すでに対戦中か、終了した部屋です');
      return;
    }

    // 部屋に入れたら、自分の（ゲストの）データを追加し、ステータスを playing に変更
    await updateDoc(roomRef, {
      status: 'playing',
      "players.guest": {
        playerName: myName,
        hp: 20,
        maxHp: 20,
        mana: 1,
        deck: myDeck,
        hand: [],
        field: [],
        graveyard: []
      }
    });

    setRoomId(inputRoomId.toUpperCase());
    listenToRoom(inputRoomId.toUpperCase());
  };

  // 3. 部屋の状態をリアルタイム監視
  const listenToRoom = (id) => {
    const roomRef = doc(db, 'rooms', id);
    // onSnapshotを使うことで、Firestoreの変更が即座にroomDataに反映される
    const unsubscribe = onSnapshot(roomRef, (doc) => {
      if (doc.exists()) {
        setRoomData(doc.data());
      }
    });
    return unsubscribe;
  };

  return { createRoom, joinRoom, roomId, roomData, error };
};