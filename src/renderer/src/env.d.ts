import type { GuioBridge } from "../../shared/ipc";

declare global {
  interface Window {
    guio: GuioBridge;
  }
}
