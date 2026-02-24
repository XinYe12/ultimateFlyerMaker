import { describe, it, expect } from "vitest";
import { parseSaleField, buildPriceDisplay } from "../ipc/parseDiscountXlsx.js";

describe("parseSaleField", () => {
  it("parses a plain price", () => {
    expect(parseSaleField("2.99")).toEqual({ quantity: null, salePrice: "2.99" });
  });

  it("strips leading $ sign", () => {
    expect(parseSaleField("$2.99")).toEqual({ quantity: null, salePrice: "2.99" });
  });

  it("parses N/price format (2/4.99)", () => {
    expect(parseSaleField("2/4.99")).toEqual({ quantity: 2, salePrice: "4.99" });
  });

  it("parses N/$price format (2/$4.99)", () => {
    expect(parseSaleField("2/$4.99")).toEqual({ quantity: 2, salePrice: "4.99" });
  });

  it("parses N FOR $price format (3 FOR $5.99)", () => {
    expect(parseSaleField("3 FOR $5.99")).toEqual({ quantity: 3, salePrice: "5.99" });
  });

  it("parses lowercase 3for5.99", () => {
    expect(parseSaleField("3for5.99")).toEqual({ quantity: 3, salePrice: "5.99" });
  });

  it("handles empty string", () => {
    expect(parseSaleField("")).toEqual({ quantity: null, salePrice: "" });
  });
});

describe("buildPriceDisplay", () => {
  it("formats a single price as $X.XX", () => {
    expect(buildPriceDisplay({ salePrice: "2.99", quantity: null, unit: "" })).toBe("$2.99");
  });

  it("formats a multi-buy price as N FOR $X.XX", () => {
    expect(buildPriceDisplay({ salePrice: "4.99", quantity: 2, unit: "pcs" })).toBe("2 FOR $4.99");
  });

  it("appends unit for single price with unit", () => {
    expect(buildPriceDisplay({ salePrice: "2.58", quantity: null, unit: "lb" })).toBe("$2.58/lb");
  });

  it("returns empty string when no price", () => {
    expect(buildPriceDisplay({ salePrice: "", quantity: null, unit: "" })).toBe("");
  });
});
