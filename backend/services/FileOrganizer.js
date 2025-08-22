import fsn from "fs";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
// used for generating file hashes to detect duplicates


/**
 * Get SHA-256 hash of a file
 * @param {string} filePath 
 * @returns {Promise<string>} hash hex string
 */
export async function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fsn.createReadStream(filePath);
    // Opens a read stream for the file.
    // Reading in chunks avoids loading large files into memory.
    stream.on("data", (data) => hash.update(data));
    //For every chunk of data, update the hash.
    // Ensures the final hash reflects the entire file content.
    stream.on("end", () => resolve(hash.digest("hex")));
    //Once the file finishes reading, finalize the hash and convert to hexadecimal string.
    // Returns the hash to the caller.
    stream.on("error", reject);
  });
}

/**
 * Organize files in the basepath folder.
 * Moves or copies files into target folders by extension.
 * Deletes duplicates based on file hash.
 * 
 * @param {Object} params - Parameters for organizing
 * @param {string} params.basepath
 * @param {string[]} params.excludeExt
 * @param {Object} params.customFolders
 * @param {boolean} params.copyInstead
 * @param {number} params.batchSize
 * @param {number} params.batchNumber
 * @param {Object} session - Express session object for logging and tracking
 * @returns {Object} summary of organizing
 */
export async function organizeFiles({
  basepath,
  excludeExt = [],
  customFolders = {},
  copyInstead = false,
  batchSize,
  batchNumber,
}, session) {
  const seenHashes = new Map();

  const allFiles = await fs.readdir(basepath);
  const size = batchSize || allFiles.length;
  const startIdx = (batchNumber || 0) * size;
  const endIdx = startIdx + size;
  const files = allFiles.slice(startIdx, endIdx);

  let filesMovedCount = 0;
  let filesCopiedCount = 0;
  let duplicatesDeletedCount = 0;
  let totalBytesProcessed = 0;

  for (const item of files) {
    const itemPath = path.join(basepath, item);
    let stat;
    try {
      stat = await fs.lstat(itemPath);
      // lstat gets metadata about file or symlink
    } catch (err) {
      console.error(`Error getting stats for file ${item}:`, err);
      continue;
    }

    if (stat.isDirectory()) continue;
    // Skip directories — only organize files.
    const extension = path.extname(item).slice(1).toLowerCase();
    if (!extension || excludeExt.includes(extension) || extension === "js" || extension === "json") {
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

    let targetFolder = customFolders[extension] || extension;
    const extDir = path.join(basepath, targetFolder);
    try {
      if (!fsn.existsSync(extDir)) {
        await fs.mkdir(extDir);
        session.logs.push(`📁 Created folder: ${targetFolder}`);
      }
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
        session.logs.push(`➡️ Moved: ${item} to → ${targetFolder}/${item}`);
        filesMovedCount++;
        session.lastMoved.push({ from: destPath, to: itemPath });
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
