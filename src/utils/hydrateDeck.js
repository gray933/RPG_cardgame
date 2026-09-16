/**
 * 保存済みデッキを、現在のカード定義へ復元する。
 * 保存形式はカード名（現行）とカードオブジェクト（旧形式）の両方に対応する。
 */
export const hydrateDeck = (savedCards, masterCards) =>
  savedCards
    .map((savedCard) => {
      const name = typeof savedCard === 'string' ? savedCard : savedCard.name;
      return masterCards.find((card) => card.name === name) ||
        (typeof savedCard === 'string' ? undefined : savedCard);
    })
    .filter(Boolean);
