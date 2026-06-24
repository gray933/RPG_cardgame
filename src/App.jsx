// src/App.jsx
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth, provider } from './firebase';
import DeckBuilder from './components/DeckBuilder';
import BattleScreen from './components/BattleScreen';
import DevDashboard from './components/DevDashboard';
import MatchingScreen from './components/MatchingScreen';
import './App.css';
import { bgmManager } from './utils/audioManager';
import { SoundButton } from './components/SoundButton';
import SettingsScreen from './components/SettingsScreen';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [inputNickname, setInputNickname] = useState('');

  const [currentScreen, setCurrentScreen] = useState('title');
  const [playerDeck, setPlayerDeck] = useState([]);
  const [enemyDeck, setEnemyDeck] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(1); // ここは内部の識別IDとしてそのまま1〜5を保持します
  const [selectPurpose, setSelectPurpose] = useState('');
  const [isLoaded, setIsLoaded] = useState(true);

  const [pvpRoomId, setPvpRoomId] = useState('');
  const [pvpRole, setPvpRole] = useState('');

  // 🎵 BGMの管理：画面が切り替わるたびにチェックする
  useEffect(() => {
      // 画面が「battle（バトル画面）」の時
      if (currentScreen === 'battle') {
          // メイン画面のBGMを止める
          bgmManager.stop();
      } 
      // それ以外の画面（title, home, deck_select, deck など）の時
      else {
          // メインBGMを流す（同じ曲が流れていれば bgmManager が自動でスルーしてくれます）
          bgmManager.play('maou_bgm_fantasy10.mp3');
      }
      
  }, [currentScreen]);
  useEffect(() => {
    const unlockAudio = () => {
      // バトル画面以外なら、クリックされた瞬間にBGMを鳴らす
      if (currentScreen !== 'battle') {
        bgmManager.play('maou_bgm_fantasy10.mp3');
      }
      // 一度クリックされて音が鳴ったら、この監視カメラは消去する
      document.removeEventListener('click', unlockAudio);
    };

    // 「画面のどこかをクリックした時」に unlockAudio を実行するようにセット
    document.addEventListener('click', unlockAudio);

    return () => {
      document.removeEventListener('click', unlockAudio);
    };
  }, [currentScreen]);
  // ログイン状態＆プロフィール監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserProfile(userDoc.data());
          setCurrentScreen('title');
        } else {
          setUserProfile(null);
          setCurrentScreen('set_nickname');
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("ログインエラー:", error);
      alert("ログインに失敗しました。");
    }
  };

  const handleLogout = async () => {
    if (window.confirm("ログアウトしますか？")) {
      await signOut(auth);
      setCurrentScreen('title');
    }
  };

  const handleSetNickname = async () => {
    if (!inputNickname.trim()) return alert("ニックネームを入力してください！");
    try {
      const newProfile = {
        nickname: inputNickname.trim(),
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', currentUser.uid), newProfile);
      setUserProfile(newProfile);
      setCurrentScreen('title');
    } catch (error) {
      console.error("プロフィール作成エラー:", error);
    }
  };

  // アカウント別のデッキを読み込む処理
  const handleSlotSelect = async (slotNum) => {
    setSelectedSlot(slotNum);
    setIsLoaded(false);
    try {
      // 🌟 追加: まずマスターのカードデータを全て取得する
      const cardsSnap = await getDocs(collection(db, "cards"));
      const allMasterCards = cardsSnap.docs.map(doc => doc.data());

      const myDeckDocName = `deck_${currentUser.uid}_${slotNum}`;
      const playerDeckDoc = await getDoc(doc(db, "decks", myDeckDocName));

      // 🌟 修正: 保存されているのが名前か実態か判定し、実データに復元する
      const loadedRawData = playerDeckDoc.exists() ? playerDeckDoc.data().cards || [] : [];
      const loadedDeck = loadedRawData.map(item => {
        if (typeof item === 'string') {
          // 名前（文字列）で保存されている新形式なら、マスターデータから検索して最新版を取得
          return allMasterCards.find(c => c.name === item);
        } else {
          // 昔のデータ（オブジェクト）が残っていればそのまま使うか、名前で再検索する
          return allMasterCards.find(c => c.name === item.name) || item;
        }
      }).filter(Boolean); // 削除されて存在しないカードを弾く

      setPlayerDeck(loadedDeck);

      if (selectPurpose === 'edit') {
        setCurrentScreen('deck');
      } else if (selectPurpose === 'battle') {
        if (loadedDeck.length !== 20) { return alert(`⚠️ デッキが未完成です`); }
        
        const enemyDeckDoc = await getDoc(doc(db, "decks", "enemy_deck_1"));
        
        // 🌟 敵のデッキも最新能力になるように復元処理を通す
        const eRawData = enemyDeckDoc.exists() ? enemyDeckDoc.data().cards || [] : [];
        const eDeck = eRawData.map(item => {
           if (typeof item === 'string') return allMasterCards.find(c => c.name === item);
           return allMasterCards.find(c => c.name === item.name) || item;
        }).filter(Boolean);

        setEnemyDeck(eDeck);
        setCurrentScreen('battle');
      } else if (selectPurpose === 'pvp') {
        if (loadedDeck.length !== 20) {
          alert(`⚠️ デッキが未完成です（${loadedDeck.length}/20枚）。編成してから選んでください！`);
          return;
        }
        setCurrentScreen('matching');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoaded(true);
    }
  };

  // ログインしていない場合の画面
  if (!currentUser) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px', background: '#1e272e', minHeight: '100vh', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <h1 style={{ fontSize: '3.5rem', color: '#f1c40f', textShadow: '0 0 10px rgba(241,196,15,0.3)', marginBottom: '10px' }}>RPG CARD GAME</h1>
        <div style={{ background: '#2c3e50', padding: '40px', borderRadius: '12px', border: '2px solid #34495e', maxWidth: '400px', width: '100%' }}>
          <p style={{ marginBottom: '25px', fontSize: '1.1rem' }}>ゲームをプレイするには<br />Googleアカウントでの認証が必要です。</p>
          <SoundButton
            className="pc-menu-btn"
            style={{ background: '#dd4b39', color: 'white', fontSize: '1.2rem', padding: '15px 0', width: '100%', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            onClick={handleLogin}
          >
            🔴 Googleアカウントでログイン
          </SoundButton>
        </div>
      </div>
    );
  }

  // ニックネーム未設定の場合の画面
  if (currentUser && !userProfile) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px', background: '#1e272e', minHeight: '100vh', color: 'white' }}>
        <h2 style={{ fontSize: '2.5rem', color: '#f1c40f', marginBottom: '20px' }}>はじめまして！</h2>
        <p style={{ fontSize: '1.2rem', marginBottom: '40px', color: '#bdc3c7' }}>
          ゲーム内で他のプレイヤーに表示される<br />「ニックネーム」を決めてください。
        </p>
        <input
          type="text"
          placeholder="ニックネームを入力"
          value={inputNickname}
          onChange={(e) => setInputNickname(e.target.value)}
          style={{ padding: '15px', fontSize: '1.5rem', borderRadius: '8px', border: '2px solid #34495e', background: '#2c3e50', color: 'white', textAlign: 'center', marginBottom: '30px' }}
        />
        <br />
        <SoundButton
          className="pc-menu-btn"
          style={{ background: '#2ecc71', fontSize: '1.2rem', padding: '15px 40px' }}
          onClick={handleSetNickname}
        >
          決定してスタート！
        </SoundButton>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ width: '100%', minHeight: '100vh', background: '#1e272e', position: 'relative' }}>

      <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', alignItems: 'center', gap: '15px', zIndex: 90, background: 'rgba(0,0,0,0.5)', padding: '5px 15px', borderRadius: '20px', border: '1px solid #485460' }}>
        <span style={{ color: '#d2dae2', fontSize: '0.9rem' }}>👤 {userProfile.nickname}</span>
        <SoundButton
          onClick={handleLogout}
          style={{ padding: '3px 10px', background: '#c0392b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
        >
          ログアウト
        </SoundButton>
      </div>

      {currentScreen === 'title' && (
        <div id="title-screen" style={{ textAlign: 'center', padding: '120px 20px' }}>
          <h1 style={{ color: '#f1c40f', fontSize: '4rem', margin: '0 0 20px 0', letterSpacing: '4px' }}>RPG CARD GAME</h1>
          <p style={{ color: '#7f8c8d', fontSize: '1.2rem', marginBottom: '60px' }}>PRESS THE BUTTON TO START</p>
          <SoundButton className="pc-menu-btn" style={{ padding: '20px 60px', fontSize: '1.5rem', background: '#e67e22' }} onClick={() => setCurrentScreen('home')}>
            ゲームを始める
          </SoundButton>
        </div>
      )}

      {currentScreen === 'home' && (
        <div id="home-screen" style={{ textAlign: 'center', padding: '80px 20px' }}>
          <h2 style={{ color: 'white', fontSize: '2.5rem', marginBottom: '50px', borderBottom: '3px solid #3498db', display: 'inline-block', paddingBottom: '10px' }}>MAIN MENU</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', maxWidth: '350px', margin: '0 auto' }}>
            <SoundButton className="pc-menu-btn" style={{ padding: '20px', fontSize: '1.4rem', background: '#9b59b6', boxShadow: '0 5px 15px rgba(155,89,182,0.4)' }} onClick={() => { setSelectPurpose('pvp'); setCurrentScreen('deck_select'); }}>
              🌐 オンライン対人戦 (PvP)
            </SoundButton>
            <SoundButton className="pc-menu-btn" style={{ padding: '20px', fontSize: '1.4rem', background: '#3498db' }} onClick={() => { setSelectPurpose('battle'); setCurrentScreen('deck_select'); }}>
              ⚔️ VS コンピューター (AI)
            </SoundButton>
            <SoundButton className="pc-menu-btn" style={{ padding: '20px', background: '#2ecc71' }} onClick={() => { setSelectPurpose('edit'); setCurrentScreen('deck_select'); }}>
              🛠 デッキを構築する
            </SoundButton>
            <SoundButton className="pc-menu-btn" style={{ padding: '20px', background: '#34495e' }} onClick={() => setCurrentScreen('settings')}>⚙️ 設定（音量調整）</SoundButton>
            {import.meta.env.VITE_SHOW_DEV === "true" && (
              <SoundButton className="pc-menu-btn" style={{ padding: '15px', background: '#e74c3c', marginTop: '30px' }} onClick={() => setCurrentScreen('dev_dashboard')}>
                ⚙️ 開発者ツール（カード図鑑）
              </SoundButton>
            )}
          </div>
        </div>
      )}

      {/* 🌟 【修正箇所】セーブスロットから「デッキ選択」に変え、5個までループするように変更 */}
      {currentScreen === 'deck_select' && (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'white' }}>
          <h2>使用するデッキを選択してください</h2>
          {!isLoaded && <h3 style={{ color: '#f1c40f' }}>📥 デッキデータをロード中...</h3>}
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '20px', margin: '40px auto', maxWidth: '800px' }}>
            {[1, 2, 3, 4, 5].map(num => (
              <SoundButton
                key={num}
                className="pc-menu-btn"
                style={{ width: '130px', padding: '25px 0', background: '#34495e', fontSize: '1.2rem', boxShadow: '0 4px 6px rgba(0,0,0,0.2)' }}
                onClick={() => handleSlotSelect(num)}
              >
                🃏 デッキ {num}
              </SoundButton>
            ))}
          </div>
          <SoundButton className="pc-menu-btn" style={{ background: '#7f8c8d', marginTop: '20px' }} onClick={() => setCurrentScreen('home')}>
            戻る
          </SoundButton>
        </div>
      )}

      {currentScreen === 'deck' && (
        <DeckBuilder
          slotId={selectedSlot}
          userId={currentUser.uid}
          onBack={() => setCurrentScreen('home')}
        />
      )}

      {currentScreen === 'matching' && (
        <MatchingScreen
          myDeck={playerDeck}
          playerName={userProfile.nickname}
          onBack={() => setCurrentScreen('home')}
          onBattleStart={(roomId, role) => {
            setPvpRoomId(roomId);
            setPvpRole(role);
            setCurrentScreen('battle');
          }}
        />
      )}

      {currentScreen === 'battle' && (
        <BattleScreen
          playerDeckData={playerDeck}
          enemyDeckData={enemyDeck}
          onBack={() => setCurrentScreen('home')}
          isPvP={selectPurpose === 'pvp'}
          roomId={pvpRoomId}
          myRole={pvpRole}
        />
      )}
      
      {currentScreen === 'settings' && (
        <SettingsScreen onBack={() => setCurrentScreen('home')} />
      )}

      {currentScreen === 'dev_dashboard' && import.meta.env.VITE_SHOW_DEV === "true" && (
        <DevDashboard onBack={() => setCurrentScreen('home')} />
      )}
    </div>
  );
}

export default App;