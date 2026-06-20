// src/components/Card.jsx
import React from 'react';

function Card({ cardData, statusText, isEnemy, onDragStart, onDoubleClick }) {
  if (!cardData) return null;

  const isMana = cardData.isMana;
  const isMagic = cardData.cardType === 'magic';
  
  // DBのコストを読み込む（設定されていなければ1、マナ結晶はコスト不要なので表示しない）
  const cost = cardData.cost !== undefined ? cardData.cost : 1;

  return (
    <div
      draggable={!isEnemy && !isMana}
      onDragStart={onDragStart}
      onDoubleClick={onDoubleClick}
      style={{
        width: '100px',
        flexShrink: 0,
        height: '140px',
        background: isMana ? '#3498db' : isMagic ? '#9b59b6' : '#2c3e50',
        border: '2px solid #bdc3c7',
        borderRadius: '8px',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '5px',
        boxSizing: 'border-box',
        color: 'white',
        userSelect: 'none',
        cursor: isEnemy ? 'default' : isMana ? 'pointer' : 'grab',
        transition: 'transform 0.1s'
      }}
    >
      {/* 🌟 新設：コストバッジ（左上）マナ結晶以外のカードに表示 */}
      {!isMana && (
        <div style={{
          position: 'absolute',
          top: '-8px',
          left: '-8px',
          background: '#f1c40f',
          color: '#000',
          borderRadius: '50%',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          fontSize: '0.85rem',
          border: '2px solid #fff',
          boxShadow: '0 2px 5px rgba(0,0,0,0.4)',
          zIndex: 10
        }}>
          {cost}
        </div>
      )}

      {/* ステータステキスト */}
      {statusText && (
        <div style={{ fontSize: '0.65rem', background: 'rgba(0,0,0,0.6)', padding: '1px 4px', borderRadius: '4px', marginBottom: '3px', whiteSpace: 'nowrap' }}>
          {statusText}
        </div>
      )}

      {/* カード名 */}
      <div style={{ fontSize: '0.75rem', fontWeight: 'bold', textAlign: 'center', margin: '2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
        {cardData.name}
      </div>

      {/* 画像エリア */}
      <div style={{ width: '100%', flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', margin: '4px 0' }}>
        <img 
          src={`/${cardData.image}`} 
          alt="" 
          onError={(e) => { e.target.src = 'https://placehold.co/80x60?text=No+Image'; }}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      {/* ステータス（攻撃力 / 体力） */}
      {cardData.cardType === 'character' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0 2px', fontSize: '0.8rem', fontWeight: 'bold', boxSizing: 'border-box' }}>
          <span style={{ color: '#e74c3c' }}>⚔️{cardData.power}</span>
          <span style={{ color: '#2ecc71' }}>💖{cardData.hp}</span>
        </div>
      )}

      {isMagic && (
        <div style={{ fontSize: '0.65rem', color: '#e0aaff', fontWeight: 'bold' }}>🔮 魔法</div>
      )}
    </div>
  );
}

export default Card;