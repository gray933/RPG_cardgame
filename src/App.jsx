import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import BattleScreen from './components/BattleScreen';
import DevDashboard from './components/DevDashboard';
import DeckBuilder from './components/DeckBuilder'; // ★ 追加
import './App.css';

function App() {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [cardPool, setCardPool] = useState([]);
  const [playerDeck, setPlayerDeck] = useState([]);
  const [enemyDeck, setEnemyDeck] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // データの読み込み処理（現状と同じなので省略）
  }, []);

  // 共通のデッキ追加関数
  const addCardToDeck = (cardData, deck, setDeck, allowMultiple = false) => {
    if (deck.length >= 20) return alert("デッキは20枚までです！");
    const sameCardCount = deck.filter(c => c.name === cardData.name).length;
    if (!allowMultiple && sameCardCount >= 2) return alert("同じカードは2枚までです！");
    setDeck([...deck, cardData]);
  };

  const saveDeckToDB = async (deckId, deckData, successMsg) => {
    try {
      await setDoc(doc(db, "decks", deckId), { cards: deckData, updatedAt: new Date() });
      alert(successMsg);
    } catch (error) { console.error(error); alert("保存に失敗しました。"); }
  };

  if (!isLoaded) return <div style={{ color: 'white', textAlign: 'center', marginTop: '100px' }}><h1>Now Loading...</h1></div>;

  return (
    <div className="app-container">
      {currentScreen === 'home' && (
        <div id="home-screen">
          {/* ホーム画面のUI（現状と同じなので省略） */}
        </div>
      )}

      {currentScreen === 'deck' && (
        <DeckBuilder
          title="デッキ構築" themeColor="white" cardPool={cardPool} deck={playerDeck}
          onAddCard={(card) => addCardToDeck(card, playerDeck, setPlayerDeck)}
          onRemoveCard={(index) => setPlayerDeck(playerDeck.filter((_, i) => i !== index))}
          onSave={() => saveDeckToDB("player_deck", playerDeck, "プレイヤーデッキを保存しました！🎉")}
          onBack={() => setCurrentScreen('home')} isEnemy={false}
        />
      )}

      {currentScreen === 'enemy_deck' && (
        <DeckBuilder
          title="👹 敵のデッキ構築" themeColor="#e74c3c" cardPool={cardPool} deck={enemyDeck}
          onAddCard={(card) => addCardToDeck(card, enemyDeck, setEnemyDeck, true)} // 敵は制限解除
          onRemoveCard={(index) => setEnemyDeck(enemyDeck.filter((_, i) => i !== index))}
          onSave={() => saveDeckToDB("enemy_deck_1", enemyDeck, "敵のデッキを保存しました！👹🎉")}
          onBack={() => setCurrentScreen('home')} isEnemy={true}
        />
      )}

      {currentScreen === 'battle' && <BattleScreen playerDeckData={playerDeck} enemyDeckData={enemyDeck} onBack={() => setCurrentScreen('home')} />}
      {currentScreen === 'dev' && <DevDashboard onBack={() => setCurrentScreen('home')} />}
    </div>
  );
}

export default App;