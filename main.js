import { app as electronApp, BrowserWindow } from "electron";
// BrowserWindow: Used to create windows for displaying your frontend.
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import { isPackaged } from "electron-is-packaged";
// isPackaged: Checks if the app is running as a packaged desktop app vs dev mode.
import backendApp from "./backend/index.js";

// Converts ES module URL (import.meta.url) to a usable file path.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


let mainWindow;
let server;

/*mainWindow stores a reference to the Electron window.
server stores the backend server instance so you can close it when the app quits. */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      /*Creates a window 1200x800 pixels.
      nodeIntegration: false + contextIsolation: true: Security best practices, 
      prevents renderer code from accessing Node directly. */
      autoplayPolicy: 'no-user-gesture-required'
    },
  });


  if (isPackaged) {
    mainWindow.loadFile(path.join(process.resourcesPath, "public", "index.html"));
  } else {
    mainWindow.loadURL("http://localhost:3000");
  }


  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
/*Dev mode: Load frontend from dev server (localhost:3000).
Packaged mode: Load the prebuilt HTML from the packaged app. */

function waitForServer(url, timeout = 10000) {

  const start = Date.now();

  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        await axios.get(url); // Axios request
        resolve();
      } catch (err) {
        if (Date.now() - start > timeout) {
          reject(new Error("Backend server did not start in time"));
        } else {
          setTimeout(check, 500); // Retry after 500ms
        }
      }
    };

    check();
    /*Uses Axios to ping the backend until it’s ready or timeout occurs.
    Retry logic: keeps checking every 500ms until backend responds.
    Promise ensures you can await it. */
  });
}


electronApp.whenReady().then(async () => {
  // Start backend server 
  const PORT = process.env.PORT || 3000;
  server = backendApp.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });

  if (!isPackaged) {
    try {
      await waitForServer(`http://localhost:${PORT}`);
    } catch (err) {
      console.error("❌ " + err.message);
      electronApp.quit();
    }
    /*In dev mode ,it waits for backend to load before frontend 
    In development mode, your frontend (server at http://localhost:3000) often starts before your backend server is ready.
    If Electron tries to load the frontend immediately, any API calls from the frontend to the backend will fail because the backend isn’t listening yet.
    By waiting for the backend to respond using waitForServer, you ensure that:
    The backend is fully up and running.
    The frontend can safely make API requests without errors.
    Your Electron app doesn’t open a broken or empty page. */
  }

  createWindow();

  electronApp.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    /*activate event is macOS-specific. It fires when the user clicks the app icon in the Dock or switches to the app.
    The handler checks if no windows are open (getAllWindows().length === 0).
    If no windows exist, it creates a new window (createWindow()). */
  });
});
  
electronApp.on("window-all-closed", () => {
  if (server) server.close();
  /*Closes backend server when all windows are closed.
  On macOS, apps typically stay open until explicitly quit. */
  /*"darwin" is the internal Node.js name for macOS (Apple computers).
  In Electron, apps behave differently on macOS compared to Windows/Linux:
  On Windows/Linux, closing all windows usually means the app quits.
  On macOS, closing all windows does not quit the app by default—the app stays active in the dock. */
  if (process.platform !== "darwin") electronApp.quit();
});
/*server.close()
Stops the backend Express server regardless of OS.
Frees up the port and any resources the server was using.

electronApp.quit()
Only called if the platform is not macOS (process.platform !== "darwin").
On macOS, electronApp.quit() is not called, so the Electron process keeps running in the Dock.
On macOS: Backend server still closes when all windows are closed because server.close() runs.
Only the Electron app itself stays running, waiting for the user to click the Dock icon. */


/*
| OS            | All windows closed | `activate` fires?     | Result                                |
| ------------- | ------------------ | --------------------- | ------------------------------------- |
| macOS         | Yes                | Yes (click Dock icon) | New window is created                 |
| Windows/Linux | Yes                | No                    | App quits (unless manually prevented) |
 */
