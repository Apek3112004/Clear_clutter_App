import fsn from "fs";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// used for generating file hashes to detect duplicates
export async function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fsn.createReadStream(filePath);
    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export async function organizeFiles(
  {
    basepath,
    excludeExt = [],
    customFolders = {},
    copyInstead = false,
    batchSize,
    batchNumber,
  },
  session
) {
  const seenHashes = new Map();

  // Build a clean file list first
  const allFilesRaw = await fs.readdir(basepath, { withFileTypes: true });
  const allFiles = [];

  for (const entry of allFilesRaw) {
    if (entry.isDirectory()) continue;
    const item = entry.name;

    let ext = path.extname(item).slice(1).toLowerCase();
    if (!ext) ext = "others"; // fallback for no-extension files
    if (ext === "jpg") ext = "jpeg"; // normalize jpg → jpeg

    if (excludeExt.includes(ext) || ext === "js" || ext === "json") continue;

    allFiles.push({ name: item, ext });
  }

  const size = batchSize || allFiles.length;
  const startIdx = (batchNumber || 0) * size;
  const files = allFiles.slice(startIdx, startIdx + size);

  let filesMovedCount = 0;
  let filesCopiedCount = 0;
  let duplicatesDeletedCount = 0;
  let totalBytesProcessed = 0;

  for (const { name: item, ext } of files) {
    const itemPath = path.join(basepath, item);

    let stat;
    try {
      stat = await fs.lstat(itemPath);
    } catch (err) {
      console.error(`Error getting stats for file ${item}:`, err);
      continue;
    }

    let hash;
    try {
      hash = await getFileHash(itemPath);
    } catch (err) {
      console.error(`Error hashing file ${item}:`, err);
      continue;
    }

    if (seenHashes.has(hash)) {
      try {
        await fs.unlink(itemPath);
        session.logs.push(`🗑️ Deleted duplicate: ${item}`);
        duplicatesDeletedCount++;
      } catch (err) {
        console.error(`Error deleting duplicate file ${item}:`, err);
      }
      continue;
    }

    seenHashes.set(hash, itemPath);

    // Use normalized extension
    const targetFolder = customFolders[ext] || ext;
    const extDir = path.join(basepath, targetFolder);

    try {
      await fs.mkdir(extDir, { recursive: true });
      session.logs.push(`📁 Ensured folder exists: ${targetFolder}`);
    } catch (err) {
      console.error(`Error creating directory ${extDir}:`, err);
      continue;
    }

    const destPath = path.join(extDir, item);
    try {
      if (copyInstead) {
        await fs.copyFile(itemPath, destPath);
        session.logs.push(`📋 Copied: ${item} → ${targetFolder}/${item}`);
        filesCopiedCount++;
      } else {
        await fs.rename(itemPath, destPath);
        session.logs.push(`➡️ Moved: ${item} → ${targetFolder}/${item}`);
        filesMovedCount++;
        // Correct from → to mapping for undo
        session.lastMoved.push({ from: itemPath, to: destPath });
      }
      totalBytesProcessed += stat.size;
    } catch (err) {
      console.error(`Error processing file ${item}:`, err);
    }
  }

  return {
    filesMovedCount,
    filesCopiedCount,
    duplicatesDeletedCount,
    totalBytesProcessed,
  };
}
