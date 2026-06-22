import { describe, it, expect } from "vitest";
import {
  parseSaleField,
  buildPriceDisplay,
  parseRegularPriceField,
  parseSizeField,
  isPureUnitMarker,
} from "../ipc/parseDiscountXlsx.js";

describe("parseSaleField", () => {
  it("parses a plain price", () => {
    expect(parseSaleField("2.99")).toEqual({ quantity: null, salePrice: "2.99", unit: "" });
  });

  it("strips leading $ sign", () => {
    expect(parseSaleField("$2.99")).toEqual({ quantity: null, salePrice: "2.99", unit: "" });
  });

  it("parses N/price format (2/4.99)", () => {
    expect(parseSaleField("2/4.99")).toEqual({ quantity: 2, salePrice: "4.99", unit: "" });
  });

  it("parses N/$price format (2/$4.99)", () => {
    expect(parseSaleField("2/$4.99")).toEqual({ quantity: 2, salePrice: "4.99", unit: "" });
  });

  it("parses N FOR $price format (3 FOR $5.99)", () => {
    expect(parseSaleField("3 FOR $5.99")).toEqual({ quantity: 3, salePrice: "5.99", unit: "" });
  });

  it("parses lowercase 3for5.99", () => {
    expect(parseSaleField("3for5.99")).toEqual({ quantity: 3, salePrice: "5.99", unit: "" });
  });

  it("parses single price with unit suffix ($1.58/lb)", () => {
    expect(parseSaleField("$1.58/lb")).toEqual({ quantity: null, salePrice: "1.58", unit: "lb" });
  });

  it("parses single price with unit suffix (1.58/ea)", () => {
    expect(parseSaleField("1.58/ea")).toEqual({ quantity: null, salePrice: "1.58", unit: "ea" });
  });

  it("handles empty string", () => {
    expect(parseSaleField("")).toEqual({ quantity: null, salePrice: "", unit: "" });
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

describe("isPureUnitMarker", () => {
  it("detects /lb and /ea", () => {
    expect(isPureUnitMarker("/lb")).toBe(true);
    expect(isPureUnitMarker("/ea")).toBe(true);
    expect(isPureUnitMarker("/LB")).toBe(true);
  });

  it("detects bare unit words", () => {
    expect(isPureUnitMarker("each")).toBe(true);
    expect(isPureUnitMarker("ea")).toBe(true);
    expect(isPureUnitMarker("lb")).toBe(true);
  });

  it("rejects real sizes and prices", () => {
    expect(isPureUnitMarker("10lb")).toBe(false);
    expect(isPureUnitMarker("3.99")).toBe(false);
    expect(isPureUnitMarker("2kg bag")).toBe(false);
  });
});

describe("parseRegularPriceField", () => {
  it("extracts numeric regular price", () => {
    expect(parseRegularPriceField("3.99")).toBe("3.99");
    expect(parseRegularPriceField("$12.99")).toBe("12.99");
  });

  it("rejects unit-only values", () => {
    expect(parseRegularPriceField("/lb")).toBe("");
    expect(parseRegularPriceField("/ea")).toBe("");
    expect(parseRegularPriceField("each")).toBe("");
  });
});

describe("parseSizeField", () => {
  it("keeps real size strings", () => {
    expect(parseSizeField("10lb")).toBe("10lb");
    expect(parseSizeField("3lb bag")).toBe("3lb bag");
    expect(parseSizeField("907g")).toBe("907g");
  });

  it("clears unit-only size cells", () => {
    expect(parseSizeField("/lb")).toBe("");
    expect(parseSizeField("/ea")).toBe("");
    expect(parseSizeField("each")).toBe("");
  });
});
