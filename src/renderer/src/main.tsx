import { createRoot } from "react-dom/client";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing root element.");
}
createRoot(root).render(<p>Guio</p>);
