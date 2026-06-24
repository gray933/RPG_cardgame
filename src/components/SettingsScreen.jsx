import React, { useState } from 'react';
import { currentSeVolume, currentBgmVolume, setSeVolume, setBgmVolume, playSE } from '../utils/audioManager';
import { SoundButton } from './SoundButton';

export default function SettingsScreen({ onBack }) {
  // スライダーの表示用State（初期値は audioManager から取得）
  const [seVol, setSeVol] = useState(currentSeVolume);
  const [bgmVol, setBgmVol] = useState(currentBgmVolume);

  // SEスライダーを動かした時
  const handleSeChange = (e) => {
    const val = parseFloat(e.target.value);
    setSeVol(val);     // 画面の見た目を更新
    setSeVolume(val);  // 裏側のシステムと保存データを更新
    playSE("クリック");  // 🔊 テスト音を鳴らして「今のデカさ」を伝える
  };

  // BGMスライダーを動かした時
  const handleBgmChange = (e) => {
    const val = parseFloat(e.target.value);
    setBgmVol(val);     // 画面の見た目を更新
    setBgmVolume(val);  // 裏側のシステムと保存データを更新（再生中なら即反映される！）
    playSE("クリック");  // 🔊 テスト音を鳴らして「今のデカさ」を伝える
  };

  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', color: 'white' }}>
      <h2 style={{ fontSize: '2.5rem', marginBottom: '40px', color: '#f1c40f' }}>⚙️ 設定</h2>

      <div style={{ background: '#2c3e50', padding: '40px', borderRadius: '12px', maxWidth: '500px', margin: '0 auto' }}>
        
        {/* BGM音量設定 */}
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ marginBottom: '10px' }}>BGM音量 : {Math.round(bgmVol * 100)}%</h3>
          <input 
            type="range" 
            min="0" max="1" step="0.05" // 0.00 〜 1.00 の間で調整
            value={bgmVol} 
            onChange={handleBgmChange}
            style={{ width: '80%', cursor: 'pointer' }}
          />
        </div>

        {/* SE音量設定 */}
        <div style={{ marginBottom: '40px' }}>
          <h3 style={{ marginBottom: '10px' }}>SE（効果音）音量 : {Math.round(seVol * 100)}%</h3>
          <input 
            type="range" 
            min="0" max="1" step="0.05"
            value={seVol} 
            onChange={handleSeChange}
            style={{ width: '80%', cursor: 'pointer' }}
          />
        </div>

        <SoundButton 
          className="pc-menu-btn" 
          style={{ background: '#7f8c8d', padding: '15px 40px', fontSize: '1.2rem' }} 
          onClick={onBack}
        >
          ホームに戻る
        </SoundButton>
      </div>
    </div>
  );
}