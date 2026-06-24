import { playSE } from '../utils/audioManager';

export const SoundButton = ({ onClick, children, ...props }) => {
  const handleClick = (e) => {
    playSE('クリック'); // 🔊 押したら絶対鳴る
    if (onClick) onClick(e); // 元々のクリック処理も実行する
  };

  return (
    <button onClick={handleClick} {...props}>
      {children}
    </button>
  );
};