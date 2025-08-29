// ----- Element refs -----
const pathForm = document.getElementById("pathForm");
const organizeForm = document.getElementById("organizeForm");
const hiddenBasepath = document.getElementById("hiddenBasepath");
const previewResult = document.getElementById("preview-result");
const dropZone = document.getElementById("drop-zone");

const progressContainer = document.getElementById("progress-container");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");

const summaryDiv = document.getElementById("organize-summary");
const summaryMoved = document.getElementById("summary-moved");
const summaryCopied = document.getElementById("summary-copied");
const summaryDuplicates = document.getElementById("summary-duplicates");
const summaryBytes = document.getElementById("summary-bytes");

// Optional error area if you add <div id="error-message"></div> in HTML
const errorBox = document.getElementById("error-message");

// ----- Helpers -----
const fmtMB = (bytes) => {
  // If it's not a number, show "0 MB"
  if (!Number.isFinite(bytes)) return "0 MB";

  // Convert raw bytes to MB
  const mb = bytes / (1024 * 1024);

  // If less than 1024 MB, keep it in MB
  if (mb < 1024) return `${mb.toFixed(2)} MB`;

  // Otherwise convert to GB
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
};

/*this helper is for cleaning up whatever the user types into your “Exclude extensions” box before sending it to the backend. */
const normalizeExtList = (raw) => {
  // If nothing typed, return empty list
  if (!raw) return [];

  return raw
    .split(",")                               // split on commas → ["tmp", " .log", " JPG "]
    .map(s => s.trim().toLowerCase()          // remove spaces + lowercase → ["tmp", ".log", "jpg"]
                 .replace(/^\./, ""))         // strip leading dot → ["tmp", "log", "jpg"]
    .filter(Boolean);                         // remove empty strings if user typed ", ,"
};


const parseCustomFolders = (raw) => {
  // Accept "png=Screenshots,  mp3 = Music"
  const out = {};          // final object we'll return

  if (!raw) return out;    // if box is empty, just return {}

  raw.split(",").forEach(pair => {                  // split input on commas → ["png=Screenshots", " mp3 = Music"]
    const [ext, folder] = pair.split("=")           // split each pair on "="
                              .map(s => (s || "").trim());  // trim spaces safely

    if (!ext || !folder) return;                    // skip if either side missing

    const cleanExt = ext.toLowerCase().replace(/^\./, "");  // normalize ext: lowercase, strip leading dot
    if (cleanExt) out[cleanExt] = folder;           // save to output object
  });

  return out;
};


const setBusy = (busy) => {
  // Prevent double submits and accidental navigation
  if (busy) {
    pathForm.querySelector("button[type=submit]").disabled = true;
    const orgBtn = organizeForm.querySelector("button[type=submit]");
    if (orgBtn) orgBtn.disabled = true;
    window.onbeforeunload = () => "Work in progress. Leave this page?";
  } else {
    const pathBtn = pathForm.querySelector("button[type=submit]");
    if (pathBtn) pathBtn.disabled = false;
    const orgBtn = organizeForm.querySelector("button[type=submit]");
    if (orgBtn) orgBtn.disabled = false;
    window.onbeforeunload = null;
  }
};

const showError = (msg) => {
  console.error(msg);
  if (errorBox) {
    errorBox.textContent = msg;
  } else {
    alert(msg);
  }
};

let currentController = null;
const fetchJSON = async (url, options = {}) => {
  // Abort previous fetch if needed for safety
  if (currentController) currentController.abort();
  currentController = new AbortController();
  const res = await fetch(url, { ...options, signal: currentController.signal });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // Keep data null; handle below
  }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
};

// ----- Organize submit -----
organizeForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const basepath = hiddenBasepath.value;
  if (!basepath) return showError("Base path missing. Please run a preview first.");

  const excludeExt = normalizeExtList(document.getElementById("excludeExt").value);
  const customFolders = parseCustomFolders(document.getElementById("customFolders").value);
  const copyInstead = document.getElementById("copyInstead").checked;

  // Show progress UI
  progressContainer.style.display = "block";
  progressBar.style.width = "0%";
  progressText.textContent = "Starting...";
  summaryDiv.style.display = "none";

  let totalMoved = 0, totalCopied = 0, totalDuplicates = 0, totalBytes = 0;

  try {
    setBusy(true);

    // IMPORTANT: preview again using the same options so batches reflect the UI
    const previewData = await fetchJSON("/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basepath, excludeExt, customFolders, copyInstead })
    });

    if (!Array.isArray(previewData) || previewData.length === 0) {
      progressText.textContent = "Nothing to organize.";
      progressBar.style.width = "100%";
      setBusy(false);
      return;
    }

    const allFiles = previewData.map(f => f.file).filter(Boolean);
    const batchSize = 10; // tweak if needed
    const totalBatches = Math.max(1, Math.ceil(allFiles.length / batchSize));

    for (let batchNumber = 0; batchNumber < totalBatches; batchNumber++) {
      const batchFiles = allFiles.slice(batchNumber * batchSize, (batchNumber + 1) * batchSize);

      progressText.textContent = `Processing batch ${batchNumber + 1} of ${totalBatches}...`;

      const data = await fetchJSON("/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basepath, excludeExt, customFolders, copyInstead, files: batchFiles })
      });

      const s = data && data.summary ? data.summary : {};
      totalMoved += s.filesMovedCount || 0;
      totalCopied += s.filesCopiedCount || 0;
      totalDuplicates += s.duplicatesDeletedCount || 0;
      totalBytes += s.totalBytesProcessed || 0;

      const pct = Math.round(((batchNumber + 1) / totalBatches) * 100);
      progressBar.style.width = `${pct}%`;
    }

    progressText.textContent = "✅ Organizing complete!";
    summaryMoved.textContent = `Files moved: ${totalMoved}`;
    summaryCopied.textContent = `Files copied: ${totalCopied}`;
    summaryDuplicates.textContent = `Duplicates deleted: ${totalDuplicates}`;
    summaryBytes.textContent = `Total size processed: ${fmtMB(totalBytes)}`;
    summaryDiv.style.display = "block";

    // Optional redirect (keep if you like your done page)
    setTimeout(() => { window.location.href = "/done.html"; }, 2000);

  } catch (error) {
    showError("Error: " + error.message);
    progressText.textContent = "❌ Failed.";
  } finally {
    setBusy(false);
  }
});

// ----- Preview submit -----
pathForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const basepath = document.getElementById("basepath").value.trim();
  if (!basepath) return showError("Please enter a folder path.");

  // Also read current customization so preview reflects them
  const excludeExt = normalizeExtList(document.getElementById("excludeExt")?.value || "");
  const customFolders = parseCustomFolders(document.getElementById("customFolders")?.value || "");
  const copyInstead = !!document.getElementById("copyInstead")?.checked;

  previewResult.innerHTML = "<p>Loading preview...</p>";
  organizeForm.style.display = "none";
  summaryDiv.style.display = "none";
  progressContainer.style.display = "none";

  try {
    setBusy(true);
    const data = await fetchJSON("/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basepath, excludeExt, customFolders, copyInstead })
    });

    if (!Array.isArray(data) || data.length === 0) {
      previewResult.innerHTML = "<p>No files to organize (or they’re excluded by your rules).</p>";
      return;
    }

    // Render preview
    previewResult.innerHTML = "<h3>Preview of files to be organized:</h3>";
    const ul = document.createElement("ul");
    const frag = document.createDocumentFragment();
    data.forEach(({ file, targetFolder }) => {
      const li = document.createElement("li");
      li.textContent = `${file} → ${targetFolder || "(no target)"} /`;
      frag.appendChild(li);
    });
    ul.appendChild(frag);
    previewResult.appendChild(ul);

    hiddenBasepath.value = basepath;
    organizeForm.style.display = "block";
  } catch (error) {
    previewResult.innerHTML = `<p style="color:red;">Error: ${error.message}</p>`;
  } finally {
    setBusy(false);
  }
});

// ----- Drag & Drop (directory detection only) -----
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

  const items = e.dataTransfer?.items || [];
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
    msg.textContent = "⚠️ Browser folder drag & drop is limited. Please paste the folder path instead.";
    dropZone.appendChild(msg);
    requestAnimationFrame(() => { msg.style.opacity = "1"; });
    setTimeout(() => { msg.style.opacity = "0"; setTimeout(() => msg.remove(), 500); }, 5000);
  }
});
