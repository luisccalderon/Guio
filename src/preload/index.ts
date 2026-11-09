import { contextBridge, ipcRenderer } from "electron";
import { channelFor, type GuioBridge, type IpcMethod } from "../shared/ipc";

const bridge: GuioBridge = {
  invoke: (method: IpcMethod, input: unknown) => ipcRenderer.invoke(channelFor(method), input),
};

contextBridge.exposeInMainWorld("guio", bridge);
