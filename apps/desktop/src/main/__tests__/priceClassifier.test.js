import { describe, it, expect } from "vitest";
import { classifyPrice } from "../discount/priceClassifier.js";

describe("classifyPrice", () => {
  describe("SINGLE prices", () => {
    it("parses a plain price", () => {
      expect(classifyPrice("10.99")).toEqual({ type: "SINGLE", price: "10.99", unit: "" });
    });

    it("parses price with /ea unit", () => {
      expect(classifyPrice("10.99/ea")).toEqual({ type: "SINGLE", price: "10.99", unit: "ea" });
    });

    it("parses price with /lb unit", () => {
      expect(classifyPrice("2.58/lb")).toEqual({ type: "SINGLE", price: "2.58", unit: "lb" });
    });

    it("normalises /lbs to lb", () => {
      expect(classifyPrice("3.99/lbs")).toMatchObject({ unit: "lb" });
    });

    it("parses /order unit", () => {
      expect(classifyPrice("15.88/order")).toEqual({ type: "SINGLE", price: "15.88", unit: "order" });
    });

    it("returns null for non-price strings", () => {
      expect(classifyPrice("abc")).toBeNull();
      expect(classifyPrice("")).toBeNull();
      expect(classifyPrice(null)).toBeNull();
    });

    it("returns null when price has only one decimal digit", () => {
      // classifyPrice requires exactly 2 decimal places
      expect(classifyPrice("10.9")).toBeNull();
    });
  });

  describe("MULTI-BUY prices", () => {
    it("parses qty/price (2/2.99)", () => {
      expect(classifyPrice("2/2.99")).toEqual({ type: "MULTI", price: "2.99", qty: "2", unit: "pcs" });
    });

    it("parses N for price (3 for 3.99)", () => {
      expect(classifyPrice("3 for 3.99")).toMatchObject({ type: "MULTI", price: "3.99", qty: "3" });
    });

    it("parses N for $price (3 for $5.99)", () => {
      expect(classifyPrice("3 for $5.99")).toMatchObject({ type: "MULTI", price: "5.99", qty: "3" });
    });

    it("parses qty/price with ea unit (5/2ea)", () => {
      expect(classifyPrice("5/2.00ea")).toMatchObject({ type: "MULTI", qty: "5" });
    });
  });
});
