import { decideSizeFromAspectRatio } from "./layout/sizeFromImage.js";

const tests = [
  { ar: 0.6, expect: "MEDIUM" }, // bottle / roll
  { ar: 0.9, expect: "SMALL" },
  { ar: 1.2, expect: "SMALL" },
  { ar: 1.8, expect: "LARGE" }   // hero
];

tests.forEach(t => {
  console.log(t.ar, "=>", decideSizeFromAspectRatio(t.ar));
});
