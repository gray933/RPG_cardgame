import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './Card.css';

export default function Card({ cardData, statusText, isEnemy, onDragStart, onDoubleClick, onClick }) {
  const [preview, setPreview] = useState(null);
  const timer = useRef(null);
  const origin = useRef(null);
  const held = useRef(false);
  const id = useId();
  const cancel = () => clearTimeout(timer.current);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!preview) return;
    const dismiss = e => { if (e.type !== 'keydown' || e.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [preview]);
  if (!cardData) return null;
  const isMana = cardData.isMana || cardData.cardType === 'mana';
  const show = element => {
    const rect = element.getBoundingClientRect();
    setPreview({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 312)), above: rect.top > window.innerHeight / 2 });
  };
  return <>
    <div className={`game-card ${isMana ? 'game-card--mana' : cardData.cardType === 'magic' ? 'game-card--magic' : ''}`}
      tabIndex={0} aria-label={cardData.name} aria-describedby={preview ? id : undefined}
      draggable={Boolean(onDragStart) && !isEnemy && !isMana}
      onPointerEnter={e => { if (e.pointerType === 'mouse') show(e.currentTarget); }}
      onPointerLeave={() => { cancel(); setPreview(null); }}
      onFocus={e => { if (e.currentTarget.matches(':focus-visible')) show(e.currentTarget); }}
      onBlur={() => setPreview(null)}
      onPointerDown={e => {
        held.current = false;
        if (e.pointerType === 'mouse') return;
        cancel(); origin.current = { x: e.clientX, y: e.clientY };
        const element = e.currentTarget;
        timer.current = setTimeout(() => { held.current = true; show(element); }, 450);
      }}
      onPointerMove={e => {
        if (origin.current && Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 10) { cancel(); setPreview(null); }
      }}
      onPointerUp={e => { cancel(); origin.current = null; if (e.pointerType !== 'mouse') setPreview(null); }}
      onPointerCancel={() => { cancel(); origin.current = null; setPreview(null); }}
      onContextMenu={e => e.preventDefault()}
      onClick={e => { if (held.current) { e.preventDefault(); e.stopPropagation(); return; } onClick?.(e); }}
      onDoubleClick={e => { if (!held.current) onDoubleClick?.(e); }}
      onDragStart={e => { cancel(); setPreview(null); onDragStart?.(e); }}>
      {!isMana && <span className="game-card__cost">{cardData.cost ?? 1}</span>}
      {statusText && <span className="game-card__status">{statusText}</span>}
      <span className="game-card__name">{cardData.name}</span>
      <div className="game-card__art"><img src={`/${cardData.image}`} alt="" draggable={false} onError={e => { e.currentTarget.style.visibility = 'hidden'; }} /></div>
      {cardData.cardType === 'character' && <div className="game-card__stats"><span>⚔️{cardData.power}</span><span>💖{cardData.hp}</span></div>}
      {cardData.cardType === 'magic' && <span className="game-card__type">🔮 魔法</span>}
    </div>
    {preview && createPortal(<div id={id} role="tooltip" className="card-preview" style={{ left: preview.left, top: preview.above ? 12 : 'auto', bottom: preview.above ? 'auto' : 12 }}>
      <strong>{cardData.name}</strong>
      <div>{isMana ? 'マナ' : `コスト ${cardData.cost ?? 1}`}{cardData.cardType === 'character' && ` / 攻撃 ${cardData.power} / 体力 ${cardData.hp}`}</div>
      <p>{cardData.effectText || '特殊効果はありません。'}</p>
    </div>, document.body)}
  </>;
}
