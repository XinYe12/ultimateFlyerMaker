import { Agent, setGlobalDispatcher } from "undici";

// 2 minutes is safe for OCR cold start
const agent = new Agent({
  headersTimeout: 120_000,
  bodyTimeout: 120_000,
});

setGlobalDispatcher(agent);
