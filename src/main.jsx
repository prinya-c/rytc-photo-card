import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";

let updateSW;
updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (window.__RYTC_CAN_UPDATE !== false) {
      updateSW?.(true);
    } else {
      window.dispatchEvent(new CustomEvent("rytc-update-available"));
    }
  }
});
window.__RYTC_UPDATE_SW = () => updateSW?.(true);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);