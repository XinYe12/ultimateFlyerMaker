import type { CardDef } from "../types";

export type TextFieldSection = "title" | "price";

export function titleStylePatchFromCard(card: CardDef): Partial<CardDef> {
  return {
    titleFontFamily: card.titleFontFamily,
    titleColor: card.titleColor,
    titleItalic: card.titleItalic,
    titleBg: card.titleBg,
    titleBgPad: card.titleBgPad,
    titleEffect: card.titleEffect,
    titleScale: card.titleScale,
    titleOffsetX: card.titleOffsetX,
    titleOffsetY: card.titleOffsetY,
    titleCompMetaScale: card.titleCompMetaScale,
    titleCompMetaOffsetY: card.titleCompMetaOffsetY,
  };
}

export function priceStylePatchFromCard(card: CardDef): Partial<CardDef> {
  return {
    priceFontFamily: card.priceFontFamily,
    priceColor: card.priceColor,
    priceShowDollar: card.priceShowDollar,
    priceBg: card.priceBg,
    priceBgPad: card.priceBgPad,
    priceEffect: card.priceEffect,
    priceScale: card.priceScale,
    priceOffsetX: card.priceOffsetX,
    priceOffsetY: card.priceOffsetY,
    priceCompDollarRatio: card.priceCompDollarRatio,
    priceCompDollarOffsetY: card.priceCompDollarOffsetY,
    priceCompQtyRatio: card.priceCompQtyRatio,
    priceCompDecRatio: card.priceCompDecRatio,
    priceCompDecOffsetY: card.priceCompDecOffsetY,
    priceCompUnitRatio: card.priceCompUnitRatio,
    priceCompUnitOffsetY: card.priceCompUnitOffsetY,
  };
}

export function textStylePatchFromCard(card: CardDef, section: TextFieldSection): Partial<CardDef> {
  return section === "title" ? titleStylePatchFromCard(card) : priceStylePatchFromCard(card);
}

export function applyTextStylePatch(card: CardDef, patch: Partial<CardDef>): CardDef {
  return { ...card, ...patch };
}
