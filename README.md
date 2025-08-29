Clear the Clutter

Declutter any folder in seconds. Clear the Clutter scans a selected directory, previews an organization plan, moves files into tidy categories, detects and removes duplicates (via SHA-256), lets you undo the last operation safely, and exports downloadable logs for auditing.

Built with Node.js + Express. Works on Windows, Linux, and macOS.

<p align="center"> <!-- Badges are optional; enable if you add the corresponding config --> <img alt="Node" src="https://img.shields.io/badge/Node-18+-339933?logo=node.js&logoColor=white"> <img alt="Express" src="https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white"> <img alt="License" src="https://img.shields.io/badge/license-MIT-blue"> </p>
✨ Features

Drag-and-drop or folder picker to choose the root directory

Preview first (dry-run) — see what will move where before committing

Smart organization by extension/category (Images, Video, Docs, Code, Archives, etc.)

Duplicate detection with streamed SHA-256 hashing and safe handling

Undo last operation (atomic move log → reverse)

Downloadable logs (JSON/CSV) for each run

Cross-platform paths with robust safety checks (never escapes selected root)

Progress + summary (files scanned, moved, duplicates found, time taken)

🖼️ Screens / Demo

(Optional: add GIFs or screenshots here)
docs/preview.gif – Preview run
docs/organize.gif – Organize + Undo
docs/logs.png – Logs download

🧱 Tech Stack

Backend: Node.js, Express

File Ops: fs, path, crypto (SHA-256 via streamed hashing)

Data: In-memory plan + per-run log files (JSON/CSV). (Optional: SQLite/LevelDB for very large folders.)

Testing: Jest (suggested), mock-fs

CI: GitHub Actions (suggested)

🗂️ Project Structure
clear_clutter_app/
├─ backend/
│  ├─ routes/
│  │  ├─ preview.js        # builds dry-run plan
│  │  ├─ organize.js       # executes plan safely + logs
│  │  ├─ undo.js           # reverses last operation
│  │  └─ logs.js           # lists/serves downloadable logs
│  ├─ services/
│  │  ├─ scanner.js        # walk directory, build catalog
│  │  ├─ hasher.js         # SHA-256 streaming hash
│  │  ├─ planner.js        # decide destinations by rules
│  │  └─ executor.js       # atomic move/copy, progress callbacks
│  ├─ utils/
│  │  ├─ categories.js     # extension → category map
│  │  └─ paths.js          # path safety, normalization
│  └─ index.js             # Express app entrypoint
├─ public/                 # (if you have a frontend)
├─ logs/                   # per-run logs (created at runtime)
├─ .env.example
├─ package.json
└─ README.md

🧭 How It Works (High-Level)
[Scan] → [Hash (optional dedupe)] → [Plan] → (Preview shown)
                                   └── If OK → [Execute] → [Log every move]
                                                        → [Undo uses the log]


Scan: Walks the selected directory, collecting file metadata.

Hash: Streams file contents to compute SHA-256 (skips rehash if size+mtime unchanged).

Plan: Proposes target paths by category and flags duplicates.

Execute: Performs atomic moves/copies, never leaving the selected root.

Undo: Replays the last run’s log in reverse to restore originals.

⚙️ Setup
Prerequisites

Node.js 18+ and npm or pnpm/yarn

Install
git clone https://github.com/Apek3112004/Clear_clutter_App.git
cd Clear_clutter_App
npm install

Configure

Create a .env from the example and adjust as needed:

cp .env.example .env


.env keys (suggested):

PORT=5173
LOG_DIR=./logs
# Optional performance/safety toggles
MAX_CONCURRENCY=8
HASH_BUFFER_SIZE=1048576


If you plan to keep logs outside the repo, set LOG_DIR to an OS-safe path (e.g., %APPDATA%/ClearClutter/logs or ~/Library/Application Support/ClearClutter/logs).

▶️ Run

Development

npm run dev


Production

npm run build   # if you bundle a frontend
npm start


The server runs on http://localhost:5173 by default (configurable via PORT).

🧪 Quick Start (API)

Replace ROOT with the absolute path you want to organize. These endpoints are examples; adjust paths if your routes differ.

1) Preview (Dry-Run)
curl -X POST http://localhost:5173/api/preview \
  -H "Content-Type: application/json" \
  -d '{"root":"C:/Users/Apeksha/Downloads","dedupe":true}'


Response (truncated):

{
  "summary": { "files": 1207, "moves": 980, "duplicates": 227 },
  "planId": "2025-08-29T08-45-02Z_9b2f",
  "moves": [
    {"from":".../photo001.jpg","to":".../Images/photo001.jpg"},
    {"from":".../report.pdf","to":".../Documents/report.pdf"}
  ],
  "dupes": [
    {"keep":".../photo001.jpg","remove":".../photo001 (1).jpg","hash":"sha256:..."}
  ]
}

2) Organize (Execute Plan)
curl -X POST http://localhost:5173/api/organize \
  -H "Content-Type: application/json" \
  -d '{"planId":"2025-08-29T08-45-02Z_9b2f"}'


Returns progress and a runId for logs/undo.

3) Undo Last Operation
curl -X POST http://localhost:5173/api/undo \
  -H "Content-Type: application/json" \
  -d '{"runId":"2025-08-29T08-47-11Z_5a1c"}'

4) Download Logs (CSV/JSON)
# List logs
curl http://localhost:5173/api/logs

# Download a specific log
curl -L "http://localhost:5173/api/logs/2025-08-29T08-47-11Z_5a1c.csv" -o run.csv

🧠 Categories & Rules

Default mapping (editable in utils/categories.js):

Images: .png .jpg .jpeg .gif .webp .svg .heic

Videos: .mp4 .mov .mkv .avi .webm

Documents: .pdf .docx .doc .pptx .ppt .xlsx .xls .txt .md

Audio: .mp3 .wav .aac .flac .m4a

Archives: .zip .rar .7z .tar .gz

Code: .c .cpp .js .ts .py .java .rb .go .rs .cs

Executables: .exe .msi .apk .dmg .AppImage

Misc: everything else

You can override or extend the map per project.

🔒 Safety

Root-sandboxed: operations never cross outside the selected root.

Preview-first: destructive actions disabled until a plan is confirmed.

Atomic moves: every action is logged with timestamp + op id.

Name collisions: resolves with suffixes (or prompts in UI).

Long paths (Windows): normalized paths and \\?\ handling (where applicable).

🚀 Performance Notes

Streaming SHA-256 (no full file in RAM).

Skip rehash by caching {size, mtime, hash}.

Concurrency with a small worker pool (configurable via env).

Very large sets: consider toggling a persistent store (SQLite/LevelDB) for hashes and resumable runs.

✅ Testing (Suggested)
npm run test


Unit: planner, hasher, executor (atomicity), undo (idempotency)

Integration: end-to-end preview → organize → undo on a temp directory (mock-fs helps)

Windows + Linux in GitHub Actions matrix

📦 Packaging (Optional)

If you later add a desktop wrapper (e.g., Electron):

Use electron-builder for Win/Linux/macOS targets

Keep backend endpoints the same; call via IPC/HTTP from the renderer

Add a strict Content-Security-Policy and disable nodeIntegration in the renderer

🗺️ Roadmap

 Rule editor (custom categories + destination templates)

 Advanced duplicate policy (by folder preference, newest/oldest, size deltas)

 Resume interrupted runs

 Multi-root batch mode

 i18n

🤝 Contributing

PRs welcome!

Open an issue describing the change.

Add tests for new logic.

Run lint + tests before pushing.

📄 License

This project is released under the MIT License. See LICENSE
 for details.

💬 Support

Questions or ideas? Open an issue on GitHub or start a discussion.
Happy decluttering! 🧹✨
