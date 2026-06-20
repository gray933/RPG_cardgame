import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import BattleScreen from './components/BattleScreen';
import DevDashboard from './components/DevDashboard';
import DeckBuilder from './components/DeckBuilder';
import './App.css';

function App() {
  // 🌟 初期画面を「タイトル画面」に変更！
  const [currentScreen, setCurrentScreen] = useState('title');
  const [selectPurpose, setSelectPurpose] = useState(''); 
  
  const [cardPool, setCardPool] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [playerDeck, setPlayerDeck] = useState([]);
  const [enemyDeck, setEnemyDeck] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const cardsSnapshot = await getDocs(collection(db, "cards"));
        setCardPool(cardsSnapshot.docs.map(doc => doc.data()));

        const enemyDeckDoc = await getDoc(doc(db, "decks", "enemy_deck_1"));
        if (enemyDeckDoc.exists()) {
          setEnemyDeck(enemyDeckDoc.data().cards || []);
        }
      } catch (error) {
        console.error("初期データの読み込みに失敗しました:", error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadInitialData();
  }, []);

  const handleSlotSelect = async (slotNum) => {
    setSelectedSlot(slotNum);
    setIsLoaded(false); 

    try {
      const playerDeckDoc = await getDoc(doc(db, "decks", `player_deck_${slotNum}`));
      const loadedDeck = playerDeckDoc.exists() ? playerDeckDoc.data().cards || [] : [];
      setPlayerDeck(loadedDeck);

      if (selectPurpose === 'edit') {
        setCurrentScreen('deck');
      } else if (selectPurpose === 'battle') {
        // 🌟 【最重要修正】バトル開始前の安全チェック
        if (loadedDeck.length !== 20) {
          alert(`⚠️ スロット ${slotNum} のデッキは未完成です（現在 ${loadedDeck.length}枚 / 20枚）。\n「デッキを構築する」から20枚編成してください！`);
          return; // バトル画面には行かせず、ここで止める（クラッシュ防止）
        }
        if (enemyDeck.length !== 20) {
          alert("⚠️ 敵のデッキが設定されていないか、未完成です！\n「敵デッキ設定」を確認してください。");
          return;
        }
        setCurrentScreen('battle');
      }
    } catch (error) {
      console.error("デッキの読み込みに失敗:", error);
      alert("デッキの読み込みに失敗しました。");
    } finally {
      setIsLoaded(true);
    }
  };

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

  if (!isLoaded) {
    return (
      <div style={{ color: 'white', textAlign: 'center', marginTop: '150px', fontFamily: 'sans-serif' }}>
        <h1 style={{ color: '#f1c40f', animation: 'blink 1.5s infinite' }}>Now Loading...</h1>
        <p style={{ color: '#bdc3c7' }}>カードデータを同期中...</p>
        <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ width: '100%', minHeight: '100vh', background: '#1e272e', position: 'relative' }}>
      
      {/* =========================================
          👑 タイトル画面（新設）
      ========================================= */}
      {currentScreen === 'title' && (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <h1 style={{ color: '#f1c40f', fontSize: '4rem', textShadow: '0 0 30px #f39c12', margin: '0 0 20px 0', fontFamily: 'monospace', letterSpacing: '5px' }}>
            RPG CARD BATTLE
          </h1>
          <p style={{ color: '#bdc3c7', fontSize: '1.2rem', marginBottom: '80px' }}>タクティカル・カードゲーム</p>
          
          <button 
            style={{ 
              background: 'transparent', color: 'white', fontSize: '1.8rem', border: 'none', cursor: 'pointer', 
              animation: 'blink 2s infinite', fontWeight: 'bold' 
            }}
            onClick={() => setCurrentScreen('home')}
          >
            - TAP TO START -
          </button>
        </div>
      )}

      {/* =========================================
          🏠 ホーム画面（メインメニュー）
      ========================================= */}
      {currentScreen === 'home' && (
        <div id="home-screen" style={{ textAlign: 'center', padding: '80px 20px', boxSizing: 'border-box' }}>
          <h2 style={{ color: 'white', fontSize: '2.5rem', marginBottom: '50px', borderBottom: '3px solid #3498db', display: 'inline-block', paddingBottom: '10px' }}>
            MAIN MENU
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', maxWidth: '350px', margin: '0 auto' }}>
            <button 
              className="pc-menu-btn" 
              style={{ padding: '20px', fontSize: '1.4rem', background: '#3498db', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 5px 15px rgba(52,152,219,0.4)' }} 
              onClick={() => { setSelectPurpose('battle'); setCurrentScreen('deck_select'); }}
            >
              ⚔️ バトルへ進む
            </button>
            <button 
              className="pc-menu-btn" 
              style={{ padding: '20px', fontSize: '1.4rem', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 5px 15px rgba(46,204,113,0.4)' }} 
              onClick={() => { setSelectPurpose('edit'); setCurrentScreen('deck_select'); }}
            >
              🛠 デッキを構築する
            </button>
            <button 
              className="pc-menu-btn" 
              style={{ padding: '15px', fontSize: '1.1rem', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }} 
              onClick={() => setCurrentScreen('enemy_deck')}
            >
              👹 敵デッキ設定
            </button>
            <button 
              className="pc-menu-btn" 
              style={{ padding: '15px', fontSize: '1.1rem', background: '#9b59b6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }} 
              onClick={() => setCurrentScreen('dev')}
            >
              ⚙️ 開発者ツール
            </button>
          </div>
        </div>
      )}

      {/* =========================================
          🗂️ デッキ選択画面
      ========================================= */}
      {currentScreen === 'deck_select' && (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: 'white', boxSizing: 'border-box' }}>
          <h2 style={{ fontSize: '2.2rem', marginBottom: '10px', color: selectPurpose === 'battle' ? '#3498db' : '#2ecc71' }}>
            {selectPurpose === 'battle' ? '⚔️ BATTLE DECK SELECT' : '🛠️ EDIT DECK SELECT'}
          </h2>
          <p style={{ color: '#bdc3c7', marginBottom: '40px' }}>使用するデッキスロットを1〜20から選んでください</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '15px', maxWidth: '900px', margin: '0 auto', padding: '10px' }}>
            {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
              <button 
                key={num}
                onClick={() => handleSlotSelect(num)}
                style={{ 
                  padding: '25px 15px', fontSize: '1.2rem', fontWeight: 'bold', background: '#2c3e50', color: 'white', 
                  border: '2px solid #34495e', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = '#f1c40f'; e.currentTarget.style.background = '#34495e'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = '#34495e'; e.currentTarget.style.background = '#2c3e50'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                デッキ {num}
              </button>
            ))}
          </div>

          <button 
            className="pc-menu-btn" 
            style={{ marginTop: '50px', padding: '12px 40px', fontSize: '1.1rem', background: '#7f8c8d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }} 
            onClick={() => setCurrentScreen('home')}
          >
            メニューに戻る
          </button>
        </div>
      )}

      {/* =========================================
          🛠 デッキ構築画面（プレイヤー）
      ========================================= */}
      {currentScreen === 'deck' && (
        <DeckBuilder
          title={`デッキ構築 (スロット ${selectedSlot})`} themeColor="white" cardPool={cardPool} deck={playerDeck}
          onAddCard={(card) => addCardToDeck(card, playerDeck, setPlayerDeck)}
          onRemoveCard={(index) => setPlayerDeck(playerDeck.filter((_, i) => i !== index))}
          onSave={() => saveDeckToDB(`player_deck_${selectedSlot}`, playerDeck, `デッキ ${selectedSlot} を保存しました！🎉`)}
          onBack={() => setCurrentScreen('deck_select')} isEnemy={false}
        />
      )}

      {/* =========================================
          👹 デッキ構築画面（敵）
      ========================================= */}
      {currentScreen === 'enemy_deck' && (
        <DeckBuilder
          title="👹 敵のデッキ構築" themeColor="#e74c3c" cardPool={cardPool} deck={enemyDeck}
          onAddCard={(card) => addCardToDeck(card, enemyDeck, setEnemyDeck, true)}
          onRemoveCard={(index) => setEnemyDeck(enemyDeck.filter((_, i) => i !== index))}
          onSave={() => saveDeckToDB("enemy_deck_1", enemyDeck, "敵のデッキを保存しました！👹🎉")}
          onBack={() => setCurrentScreen('home')} isEnemy={true}
        />
      )}

      {/* =========================================
          ⚔️ バトル画面
      ========================================= */}
      {currentScreen === 'battle' && (
        <BattleScreen 
          playerDeckData={playerDeck} 
          enemyDeckData={enemyDeck} 
          onBack={() => setCurrentScreen('home')} 
        />
      )}

      {/* =========================================
          ⚙️ 開発者ツール
      ========================================= */}
      {currentScreen === 'dev' && (
        <DevDashboard onBack={() => setCurrentScreen('home')} />
      )}
      
    </div>
  );
}

export default App;