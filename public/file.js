const pathForm = document.getElementById("pathForm");
const organizeForm = document.getElementById("organizeForm");
const hiddenBasepath = document.getElementById("hiddenBasepath");
const previewResult = document.getElementById("preview-result");
const dropZone = document.getElementById("drop-zone");

// Handle organize form submit
organizeForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const basepath = hiddenBasepath.value;

  const excludeExt = document.getElementById("excludeExt").value
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  const customFoldersRaw = document.getElementById("customFolders").value;
  const copyInstead = document.getElementById("copyInstead").checked;

  const customFolders = {};
  if (customFoldersRaw) {
    customFoldersRaw.split(",").forEach(pair => {
      const [ext, folder] = pair.split("=").map(s => s.trim());
      if (ext && folder) customFolders[ext.toLowerCase()] = folder;
    });
  }

  try {
    // Fetch preview list first
    const previewRes = await fetch("/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basepath, customFolders }),
    });
    const previewData = await previewRes.json();
    if (!previewRes.ok) throw new Error(previewData.message || "Preview failed");

    const allFiles = previewData.map(f => f.file);
    const batchSize = 10;
    const totalBatches = Math.ceil(allFiles.length / batchSize);

    // Progress UI
    const progressContainer = document.getElementById("progress-container");
    const progressBar = document.getElementById("progress-bar");
    const progressText = document.getElementById("progress-text");
    const summaryDiv = document.getElementById("organize-summary");
    const summaryMoved = document.getElementById("summary-moved");
    const summaryCopied = document.getElementById("summary-copied");
    const summaryDuplicates = document.getElementById("summary-duplicates");
    const summaryBytes = document.getElementById("summary-bytes");

    progressContainer.style.display = "block";
    progressBar.style.width = "0%";
    progressText.textContent = "Starting...";
    summaryDiv.style.display = "none";

    let totalMoved = 0, totalCopied = 0, totalDuplicates = 0, totalBytes = 0;

    for (let batchNumber = 0; batchNumber < totalBatches; batchNumber++) {
      const batchFiles = allFiles.slice(batchNumber * batchSize, (batchNumber + 1) * batchSize);

      progressText.textContent = `Processing batch ${batchNumber + 1} of ${totalBatches}...`;

      const res = await fetch("/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basepath, excludeExt, customFolders, copyInstead, files: batchFiles }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Organize failed");

      if (data.summary) {
        totalMoved += data.summary.filesMovedCount || 0;
        totalCopied += data.summary.filesCopiedCount || 0;
        totalDuplicates += data.summary.duplicatesDeletedCount || 0;
        totalBytes += data.summary.totalBytesProcessed || 0;
      }

      progressBar.style.width = `${Math.round(((batchNumber + 1) / totalBatches) * 100)}%`;
    }

    progressText.textContent = "✅ Organizing complete!";
    summaryMoved.textContent = `Files moved: ${totalMoved}`;
    summaryCopied.textContent = `Files copied: ${totalCopied}`;
    summaryDuplicates.textContent = `Duplicates deleted: ${totalDuplicates}`;
    summaryBytes.textContent = `Total size processed: ${(totalBytes / (1024*1024)).toFixed(2)} MB`;
    summaryDiv.style.display = "block";

    setTimeout(() => { window.location.href = "/done.html"; }, 2000);

  } catch (error) {
    console.error("❌ Organize failed:", error);
    alert("Error: " + error.message);
  }
});

// Handle preview form submit
pathForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const basepath = document.getElementById("basepath").value.trim();
  if (!basepath) return alert("Please enter a folder path.");

  previewResult.innerHTML = "<p>Loading preview...</p>";

  try {
    const response = await fetch("/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basepath }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Preview failed");

    if (!data.length) {
      previewResult.innerHTML = "<p>No files to organize or only js/json files present.</p>";
      organizeForm.style.display = "none";
      return;
    }

    previewResult.innerHTML = "<h3>Preview of files to be organized:</h3>";
    const ul = document.createElement("ul");
    data.forEach(({ file, targetFolder }) => {
      const li = document.createElement("li");
      li.textContent = `${file} → ${targetFolder}/`;
      ul.appendChild(li);
    });
    previewResult.appendChild(ul);

    hiddenBasepath.value = basepath;
    organizeForm.style.display = "block";
  } catch (error) {
    console.error("❌ Error in preview:", error);
    previewResult.innerHTML = `<p style="color:red;">Error: ${error.message}</p>`;
    organizeForm.style.display = "none";
  }
});

// Drag & drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");

  const existingMsg = document.querySelector(".drop-warning");
  if (existingMsg) existingMsg.remove();

  const items = e.dataTransfer.items;
  let folderDetected = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i].webkitGetAsEntry?.();
    if (item && item.isDirectory) {
      folderDetected = true;
      break;
    }
  }

  if (folderDetected) {
    const msg = document.createElement("p");
    msg.className = "drop-warning";
    msg.style.color = "orange";
    msg.style.marginTop = "10px";
    msg.style.fontWeight = "500";
    msg.style.transition = "opacity 0.5s ease";
    msg.style.opacity = "0";
    msg.textContent = "⚠️ Folder drag & drop is limited in browsers. Please copy-paste the folder path instead.";
    dropZone.appendChild(msg);
    requestAnimationFrame(() => { msg.style.opacity = "1"; });
    setTimeout(() => { msg.style.opacity = "0"; setTimeout(() => msg.remove(), 500); }, 5000);
  }
});
