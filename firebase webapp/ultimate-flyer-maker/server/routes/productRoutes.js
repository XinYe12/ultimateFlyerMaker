// routes/productRoutes.js
import express from "express";

const router = express.Router();

/**
 * TEMP ROUTES UNTIL WE IMPLEMENT PRODUCT DB
 * These routes prevent server crash.
 */

router.get("/", (req, res) => {
  res.json({ ok: true, message: "Product route active" });
});

export default router;
