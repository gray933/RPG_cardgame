import { useState, useEffect } from 'react'; // ★ useEffect を追加
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase'; // ★ さっき作った窓口を読み込み
import BattleScreen from './components/BattleScreen';
import DevDashboard from './components/DevDashboard'; // ★これを追加
import './App.css';
import Card from './components/Card';

function App() {
  const [currentScreen, setCurrentScreen] = useState('home');
  
  // ==========================================
  // データの保存場所（State）
  // ==========================================
  const [cardPool, setCardPool] = useState([]);
  const [playerDeck, setPlayerDeck] = useState([]);
  const [enemyDeck, setEnemyDeck] = useState([]); // 🌟敵のデッキ
  const [isLoaded, setIsLoaded] = useState(false);

  // ==========================================
  // ゲーム起動時に1回だけ実行される処理（useEffect）
  // ==========================================
  useEffect(() => {
    const fetchGameData = async () => {
      try {
        // ① 全カードデータの取得
        const querySnapshot = await getDocs(collection(db, "cards"));
        const loadedCards = [];
        querySnapshot.forEach((docSnap) => {
          loadedCards.push(docSnap.data());
        });
        setCardPool(loadedCards);

        // ② プレイヤーのデッキの取得
        const deckSnap = await getDoc(doc(db, "decks", "player_deck"));
        if (deckSnap.exists()) {
          setPlayerDeck(deckSnap.data().cards);
        }

        // ③ 敵のデッキの取得
        const enemySnap = await getDoc(doc(db, "decks", "enemy_deck_1"));
        if (enemySnap.exists()) {
          setEnemyDeck(enemySnap.data().cards);
        }

        // 読み込み完了！
        setIsLoaded(true);
        console.log("🔥 Firebaseからデータの読み込みが完了しました！");
      } catch (error) {
        console.error("データの読み込みに失敗しました:", error);
      }
    };

    fetchGameData();
  }, []);

  // ==========================================
  // デッキ操作のロジック（関数）
  // ==========================================

  // 👤 プレイヤーデッキ操作
  const addCardToDeck = (cardData) => {
    if (playerDeck.length >= 20) return alert("デッキは20枚までです！");
    const sameCardCount = playerDeck.filter(c => c.name === cardData.name).length;
    if (sameCardCount >= 2) return alert("同じカードは2枚までです！");
    setPlayerDeck([...playerDeck, cardData]);
  };

  const removeCardFromDeck = (indexToRemove) => {
    setPlayerDeck(playerDeck.filter((_, index) => index !== indexToRemove));
  };

  const saveDeckToDB = async () => {
    try {
      await setDoc(doc(db, "decks", "player_deck"), { cards: playerDeck, updatedAt: new Date() });
      alert("プレイヤーデッキを保存しました！🎉");
    } catch (error) { console.error(error); alert("保存に失敗しました。"); }
  };

  // 👹 敵デッキ操作（🌟新設：仕組みはプレイヤーと同じ！）
  const addCardToEnemyDeck = (cardData) => {
    if (enemyDeck.length >= 20) return alert("敵デッキは20枚までです！");
    const sameCardCount = enemyDeck.filter(c => c.name === cardData.name).length;
    if (sameCardCount >= 2) return alert("同じカードは2枚までです！"); // ボス用なので制限解除してもOK
    setEnemyDeck([...enemyDeck, cardData]);
  };

  const removeCardFromEnemyDeck = (indexToRemove) => {
    setEnemyDeck(enemyDeck.filter((_, index) => index !== indexToRemove));
  };

  const saveEnemyDeckToDB = async () => {
    try {
      await setDoc(doc(db, "decks", "enemy_deck_1"), { cards: enemyDeck, updatedAt: new Date() });
      alert("敵のデッキをクラウドに保存しました！👹🎉");
    } catch (error) { console.error(error); alert("保存に失敗しました。"); }
  };

  if (!isLoaded) {
    return <div style={{ color: 'white', textAlign: 'center', marginTop: '100px' }}><h1>Now Loading...</h1></div>;
  }

  return (
    <div className="app-container">
      
      {/* ＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝
          ① ホーム画面
      ＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝ */}
      {currentScreen === 'home' && (
        <div id="home-screen">
          <div className="pc-player-status">
            <div className="avatar">🧙‍♀️</div>
            <div className="player-meta">
              <div className="name">プレイヤー</div>
              <div className="lv">Level 12</div>
            </div>
          </div>

          <div className="pc-main-menu">
            <h1 className="pc-title">RPGカードゲーム</h1>
            <p className="pc-subtitle">- Pixel Tactical Card Battle -</p>
            
            <div className="menu-buttons">
              <button className="pc-menu-btn btn-battle" onClick={() => setCurrentScreen('battle')}>
                ⚔️ デュエルへ
              </button>
              <button className="pc-menu-btn btn-deck" onClick={() => setCurrentScreen('deck')}>
                🃏 デッキ構築・編集
              </button>
              
              {/* 🌟追加：敵デッキ作成画面へのボタン */}
              <button className="pc-menu-btn" onClick={() => setCurrentScreen('enemy_deck')} style={{ background: '#d35400', marginTop: '10px' }}>
                👹 敵のデッキ構築・編集
              </button>

              <button className="pc-menu-btn" onClick={() => setCurrentScreen('dev')} style={{ background: '#c0392b', marginTop: '20px' }}>
                🛠️ 開発者ダッシュボード
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝
          ② プレイヤーのデッキ構築画面
      ＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝ */}
      {currentScreen === 'deck' && (
        <div id="deck-build-screen">
          <h1 style={{ color: 'white', textAlign: 'center', marginBottom: '20px' }}>
            デッキ構築 ( {playerDeck.length} / 20 枚 )
          </h1>
          <div className="deck-build-container">
            <div className="half-area">
              <h2 style={{ color: 'white' }}>カードプール</h2>
              <div className="card-grid">
                {cardPool.map((cardData, index) => (
                  <div key={`pool-${index}`} onClick={() => addCardToDeck(cardData)} style={{ cursor: 'pointer' }}>
                    <Card cardData={cardData} statusText="追加" isEnemy={false} />
                  </div>
                ))}
              </div>
            </div>
            <div className="half-area">
              <h2 style={{ color: 'white' }}>あなたのデッキ</h2>
              <div className="card-grid">
                {playerDeck.map((cardData, index) => (
                  <div key={`deck-${index}`} onClick={() => removeCardFromDeck(index)} style={{ cursor: 'pointer' }}>
                    <Card cardData={cardData} statusText="外す" isEnemy={false} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="deck-build-footer" style={{ marginTop: '20px', textAlign: 'center' }}>
            <button style={{ padding: '10px 20px', fontSize: '1.2rem', marginRight: '10px', cursor: playerDeck.length === 20 ? 'pointer' : 'not-allowed', opacity: playerDeck.length === 20 ? 1 : 0.5 }} onClick={saveDeckToDB} disabled={playerDeck.length !== 20}>デッキをクラウドに保存</button>
            <button style={{ padding: '10px 20px', fontSize: '1.2rem', cursor: 'pointer' }} onClick={() => setCurrentScreen('home')}>ホームに戻る</button>
          </div>
        </div>
      )}

      {/* ＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝
          🌟新設：③ 敵のデッキ構築画面
      ＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝ */}
      {currentScreen === 'enemy_deck' && (
        <div id="deck-build-screen" style={{ borderTop: '4px solid #e74c3c' }}>
          <h1 style={{ color: '#e74c3c', textAlign: 'center', marginBottom: '20px' }}>
            👹 敵のデッキ構築 ( {enemyDeck.length} / 20 枚 )
          </h1>
          
          <div className="deck-build-container">
            {/* 左側：共通カードプール */}
            <div className="half-area">
              <h2 style={{ color: 'white' }}>カードプール（共通）</h2>
              <div className="card-grid">
                {cardPool.map((cardData, index) => (
                  <div key={`epool-${index}`} onClick={() => addCardToEnemyDeck(cardData)} style={{ cursor: 'pointer' }}>
                    <Card cardData={cardData} statusText="追加" isEnemy={false} />
                  </div>
                ))}
              </div>
            </div>

            {/* 右側：敵のデッキ中身 */}
            <div className="half-area" style={{ background: 'rgba(231, 76, 60, 0.05)' }}>
              <h2 style={{ color: '#e74c3c' }}>敵のデッキリスト</h2>
              <div className="card-grid">
                {enemyDeck.map((cardData, index) => (
                  <div key={`edeck-${index}`} onClick={() => removeCardFromEnemyDeck(index)} style={{ cursor: 'pointer' }}>
                    <Card cardData={cardData} statusText="外す" isEnemy={false} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="deck-build-footer" style={{ marginTop: '20px', textAlign: 'center' }}>
            <button 
              style={{ 
                padding: '10px 20px', fontSize: '1.2rem', marginRight: '10px', background: '#e74c3c', color: 'white', border: 'none',
                cursor: enemyDeck.length === 20 ? 'pointer' : 'not-allowed', opacity: enemyDeck.length === 20 ? 1 : 0.5 
              }} 
              onClick={saveEnemyDeckToDB}
              disabled={enemyDeck.length !== 20}
            >
              敵デッキをクラウドに保存
            </button>
            <button style={{ padding: '10px 20px', fontSize: '1.2rem', cursor: 'pointer' }} onClick={() => setCurrentScreen('home')}>ホームに戻る</button>
          </div>
        </div>
      )}

      {/* ＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝
          ④ バトル画面
      ＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝ */}
      {currentScreen === 'battle' && (
        <BattleScreen playerDeckData={playerDeck} enemyDeckData={enemyDeck} onBack={() => setCurrentScreen('home')} />
      )}

      {/* ＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝
          ⑤ 開発者ダッシュボード画面
      ＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝ */}
      {currentScreen === 'dev' && (
        <DevDashboard onBack={() => setCurrentScreen('home')} />
      )}
    </div>
  );
}

export default App;