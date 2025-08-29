// routes.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import fsn from "fs";
import { getFileHash, organizeFiles } from "./services/FileOrganizer.js";
import { deleteEmptyFolders } from "./services/DeleteEmptyFolders.js";
import { app } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const forbiddenPaths = [
  "C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\System32",
  "/bin", "/boot", "/dev", "/etc", "/lib", "/proc", "/root", "/sbin", "/sys", "/usr", "/var"
];

function isForbiddenPath(basepath) {
  return forbiddenPaths.some(fp => basepath.startsWith(fp));
}

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

router.post("/preview", async (req, res) => {
  const basepath = req.body.basepath;
  if (isForbiddenPath(basepath)) {
    return res.status(400).send("❌ Operation not allowed on protected system folders.");
  }

  try {
    const files = await fs.readdir(basepath);
    const preview = [];
    for (const item of files) {
      const fullPath = path.join(basepath, item);
      const stat = await fs.lstat(fullPath);
      if (stat.isDirectory()) continue;
      const extension = path.extname(item).slice(1).toLowerCase();
      if (extension && extension !== "js" && extension !== "json") {
        const customFolders = req.body.customFolders || {};
        const targetFolder = customFolders[extension] || extension;
        preview.push({ file: item, targetFolder });
      }
    }
    res.json(preview);
  } catch (err) {
    res.status(500).send("❌ " + err.message);
  }
});

router.post("/organize", async (req, res) => {
  const { basepath, files = [], excludeExt = [], customFolders = {}, copyInstead } = req.body;

  if (isForbiddenPath(basepath)) {
    return res.status(400).send("❌ Operation not allowed on protected system folders.");
  }

  req.session.logs = req.session.logs || [];
  req.session.lastMoved = req.session.lastMoved || [];

  if (!files.length) {
    return res.status(400).send({ message: "No files provided to organize." });
  }

  try {
    // Process only the files sent in this batch
    const summary = await organizeFiles(
      { basepath, excludeExt, customFolders, copyInstead, batchSize: files.length, batchNumber: 0, filesToProcess: files },
      req.session
    );

    await deleteEmptyFolders(basepath, req.session.logs);

    res.json({
      message: "✅ Batch organizing complete",
      logs: req.session.logs,
      summary,
    });
  } catch (err) {
    console.error("Error during organizing:", err);
    res.status(500).send("❌ " + err.message);
  }
});

// ✅ Fixed download-logs for packaged app
router.get("/download-logs", async (req, res) => {
  try {
    const logDir = app.getPath("userData");
    const logFile = path.join(logDir, "logs.txt");

    await fs.writeFile(logFile, (req.session.logs || []).join("\n"));
    res.download(logFile);
  } catch (err) {
    res.status(500).send("❌ Error downloading logs: " + err.message);
  }
});

router.post("/undo", async (req, res) => {
  try {
    for (const move of (req.session.lastMoved || []).reverse()) {
      if (fsn.existsSync(move.to)) {
        await fs.rename(move.to, move.from);
        req.session.logs.push(`↩️ Undid: ${path.basename(move.to)} moved back`);
      }
    }
    req.session.lastMoved = [];
    res.redirect("/");
  } catch (err) {
    res.status(500).send("❌ Undo failed: " + err.message);
  }
});

export default router;
