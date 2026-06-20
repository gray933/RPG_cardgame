import React from 'react';
import Card from './Card';

function DeckBuilder({
  title, themeColor, cardPool, deck, onAddCard, onRemoveCard, onSave, onBack, isEnemy
}) {
  return (
    <div id="deck-build-screen" style={{ borderTop: `4px solid ${themeColor}` }}>
      <h1 style={{ color: themeColor, textAlign: 'center', marginBottom: '20px' }}>
        {title} ( {deck.length} / 20 枚 )
      </h1>
      <div className="deck-build-container">
        <div className="half-area">
          <h2 style={{ color: 'white' }}>カードプール</h2>
          <div className="card-grid">
            {cardPool.map((cardData, index) => (
              <div key={`pool-${index}`} onClick={() => onAddCard(cardData)} style={{ cursor: 'pointer' }}>
                <Card cardData={cardData} statusText="追加" isEnemy={false} />
              </div>
            ))}
          </div>
        </div>
        <div className="half-area" style={{ background: isEnemy ? 'rgba(231, 76, 60, 0.05)' : 'transparent' }}>
          <h2 style={{ color: themeColor }}>デッキリスト</h2>
          <div className="card-grid">
            {deck.map((cardData, index) => (
              <div key={`deck-${index}`} onClick={() => onRemoveCard(index)} style={{ cursor: 'pointer' }}>
                <Card cardData={cardData} statusText="外す" isEnemy={false} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="deck-build-footer" style={{ marginTop: '20px', textAlign: 'center' }}>
        <button
          style={{
            padding: '10px 20px', fontSize: '1.2rem', marginRight: '10px',
            background: themeColor,
            color: themeColor === 'white' ? 'black' : 'white', // ★ ここを変更！
            border: 'none',
            cursor: deck.length === 20 ? 'pointer' : 'not-allowed',
            opacity: deck.length === 20 ? 1 : 0.5
          }}
          onClick={onSave} disabled={deck.length !== 20}
        >
          クラウドに保存
        </button>
        <button style={{ padding: '10px 20px', fontSize: '1.2rem', cursor: 'pointer' }} onClick={onBack}>
          ホームに戻る
        </button>
      </div>
    </div>
  );
}

export default DeckBuilder;