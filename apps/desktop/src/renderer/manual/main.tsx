import { createRoot } from "react-dom/client";
import ManualApp from "./ManualApp";
import "../styles/design-tokens.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container not found");
}

createRoot(container).render(<ManualApp />);
