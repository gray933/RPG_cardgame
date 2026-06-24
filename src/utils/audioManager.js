// 🎵 1. SEの「対応表」を作る（switch文の代わりになります）
const SE_MAP = {
  "ドロー": "se_draw.mp3",
  "攻撃": "se_attack.mp3",
  "ダメージ": "se_damage.mp3",
  "回復": "se_heal.mp3",
  "破壊": "se_destroy.mp3",
  "クリック": "se_click.mp3",
  "エラー": "se_error.mp3",
  "シャッフル": "se_shuffle.mp3",
  "カード設置": "se_place_card.mp3",
  "魔法": "se_magic.mp3",
  "マナ回復": "se_mana_restore.mp3",
  "勝利": "se_victory.mp3",
  "敗北": "se_defeat.mp3",
  "強化": "se_buff.mp3",
};
export let currentSeVolume = localStorage.getItem('seVolume') !== null ? parseFloat(localStorage.getItem('seVolume')) : 0.5;
export let currentBgmVolume = localStorage.getItem('bgmVolume') !== null ? parseFloat(localStorage.getItem('bgmVolume')) : 0.3;

export const setSeVolume = (vol) => {
  currentSeVolume = vol;
  localStorage.setItem('seVolume', vol);
};

export const setBgmVolume = (vol) => {
  currentBgmVolume = vol;
  localStorage.setItem('bgmVolume', vol);
  if (bgmManager.currentBgm) {
    bgmManager.currentBgm.volume = currentBgmVolume;
  }
};
// 🔊 2. SEを鳴らす関数
export const playSE = (actionName) => {
  // 対応表からファイル名を探す
  const fileName = SE_MAP[actionName];

  // もし対応表にない言葉が送られてきたら、警告を出して処理を止める（バグ防止）
  if (!fileName) {
    console.warn(`⚠️ 未定義のSEアクションです: "${actionName}"`);
    return;
  }

  // ファイル名が見つかったら音を鳴らす
  const audio = new Audio(`/audio/${fileName}`);
  audio.volume = currentSeVolume;
  audio.play().catch(error => console.warn("SE再生ブロック:", error));
};

// BGM（ループ再生）を管理するクラス
export const bgmManager = {
  currentBgm: null,
  currentFileName: null, // 🌟 追加：現在鳴っている曲の名前を記録する

  play: (fileName) => {
    // 🌟 修正ポイント：同じ曲が指定された場合の処理を賢くする！
    if (bgmManager.currentFileName === fileName && bgmManager.currentBgm) {
      // もしブラウザのブロック等で「実際には止まっている（paused）」なら、もう一度再生を試みる
      if (bgmManager.currentBgm.paused) {
        bgmManager.currentBgm.play().catch(error => console.warn("BGM再生ブロック:", error));
      }
      return; // ちゃんと鳴っているなら何もしないで終了
    }

    // 既に別のBGMが鳴っていれば止める
    if (bgmManager.currentBgm) {
      bgmManager.currentBgm.pause();
    }
    
    bgmManager.currentBgm = new Audio(`/audio/${fileName}`);
    bgmManager.currentFileName = fileName;
    bgmManager.currentBgm.loop = true;
    bgmManager.currentBgm.volume = currentBgmVolume; // 設定された音量を使用
    
    bgmManager.currentBgm.play().catch(error => {
      console.warn("BGM再生ブロック（ユーザーの操作が必要です）:", error);
    });
  },

  stop: () => {
    if (bgmManager.currentBgm) {
      bgmManager.currentBgm.pause();
      bgmManager.currentBgm.currentTime = 0;
      bgmManager.currentBgm = null;
      bgmManager.currentFileName = null; // 🌟 記録をリセット
    }
  }
};