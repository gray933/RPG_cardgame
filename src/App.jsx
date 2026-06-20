import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import BattleScreen from './components/BattleScreen';
import DevDashboard from './components/DevDashboard';
import DeckBuilder from './components/DeckBuilder';
import './App.css';

function App() {
  const [currentScreen, setCurrentScreen] = useState('home');
  const [cardPool, setCardPool] = useState([]);
  const [playerDeck, setPlayerDeck] = useState([]);
  const [enemyDeck, setEnemyDeck] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // 🌟 復活させたデータ読み込み処理
  useEffect(() => {
    const loadGameData = async () => {
      try {
        // 1. マスターデータの取得（全カード）
        const cardsSnapshot = await getDocs(collection(db, "cards"));
        const loadedCards = cardsSnapshot.docs.map(doc => doc.data());
        setCardPool(loadedCards);

        // 2. プレイヤーデッキの取得
        const playerDeckDoc = await getDoc(doc(db, "decks", "player_deck"));
        if (playerDeckDoc.exists()) {
          setPlayerDeck(playerDeckDoc.data().cards || []);
        }

        // 3. 敵デッキの取得
        const enemyDeckDoc = await getDoc(doc(db, "decks", "enemy_deck_1"));
        if (enemyDeckDoc.exists()) {
          setEnemyDeck(enemyDeckDoc.data().cards || []);
        }
      } catch (error) {
        console.error("データの読み込みに失敗しました:", error);
      } finally {
        // ★ 取得が終わったらローディング画面を解除する
        setIsLoaded(true);
      }
    };

    loadGameData();
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
    } catch (error) { 
      console.error(error); 
      alert("保存に失敗しました。"); 
    }
  };

  if (!isLoaded) return <div style={{ color: 'white', textAlign: 'center', marginTop: '100px' }}><h1>Now Loading...</h1></div>;

  return (
    <div className="app-container">
      {currentScreen === 'home' && (
        <div id="home-screen" style={{ textAlign: 'center', padding: '50px' }}>
          <h1 style={{ color: '#f1c40f', fontSize: '3rem', textShadow: '0 0 20px #f39c12' }}>RPG CARD BATTLE</h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '300px', margin: '0 auto', marginTop: '50px' }}>
            <button className="pc-menu-btn" style={{ padding: '15px', fontSize: '1.2rem', background: '#3498db' }} onClick={() => setCurrentScreen('battle')}>
              ⚔️ バトル開始
            </button>
            <button className="pc-menu-btn" style={{ padding: '15px', fontSize: '1.2rem', background: '#2ecc71' }} onClick={() => setCurrentScreen('deck')}>
              🛠 デッキ構築
            </button>
            <button className="pc-menu-btn" style={{ padding: '15px', fontSize: '1.2rem', background: '#e74c3c' }} onClick={() => setCurrentScreen('enemy_deck')}>
              👹 敵デッキ設定
            </button>
            <button className="pc-menu-btn" style={{ padding: '15px', fontSize: '1.2rem', background: '#9b59b6' }} onClick={() => setCurrentScreen('dev')}>
              ⚙️ 開発者ツール
            </button>
          </div>
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