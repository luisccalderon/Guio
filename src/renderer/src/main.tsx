import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing root element.");
}
createRoot(root).render(<p>Guio</p>);
