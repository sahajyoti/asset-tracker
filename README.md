# Biomedical Asset Tracker

Mobile-friendly admin panel and viewer for biomedical department assets.

## Features

- Admin can upload one Excel file (`.xlsx` or `.xls`).
- The backend automatically reads all sheets in the uploaded workbook.
- Asset viewer displays:
  - Equipment Name
  - Model Number
  - Serial Number
  - Company / Manufacturer
  - Source Sheet
- Search and sheet filtering.
- Pagination for large data sets.
- Responsive UI with mobile card view.

## Tech Stack

- Node.js + Express
- Multer (file upload)
- SheetJS (`xlsx`) for Excel parsing
- Vanilla HTML/CSS/JS frontend

## Run Locally

1. Install dependencies:

	npm install

2. Start the server:

	npm start

3. Open in browser:

	http://localhost:3000

## One-Click Local Launch

Use these launcher files if you want to run without typing commands.

### Linux

1. Double-click [start-asset-tracker.sh](start-asset-tracker.sh).
2. Choose "Run" if your file manager asks.
3. A terminal opens, server starts, and browser opens automatically.

### Windows

1. Build the desktop app once with `npm run build:windows`.
2. Double-click [dist/start-asset-tracker.exe](dist/start-asset-tracker.exe).
3. The app starts locally and opens the browser automatically.

If you prefer the terminal version, you can still run the app directly:

1. Open Command Prompt, PowerShell, or Windows Terminal in this folder.
2. Run `npm install` the first time.
3. Run `npm start`.
4. Open `http://localhost:3000` in your browser.

Notes:

- First run may take longer because dependencies are installed automatically.
- Keep the terminal window open while using the app.
- Stop the app with `Ctrl + C` in that terminal window.

## Deploy on Vercel

This project needs a backend connection for the admin login, upload flow, and workbook parsing.
The free hosting path is Vercel, which routes all requests through `server.js` so Express can serve the public pages and backend together.

Publish steps:

1. Push this repo to GitHub.
2. Import the repo into Vercel.
3. Keep the default build settings.
4. Add an optional `ADMIN_PASSWORD` environment variable if you do not want to use the default password.
5. Deploy.

Routes that are included:

- `/` for the Biomedical Assets viewer.
- `/admin` for the Admin panel.
- `/amc-cmc` for the AMC/CMC tracker.
- `/api/*` for the backend endpoints used by all pages.

Important free-hosting limitation:

- Uploaded files and in-memory data are not durable on Vercel free hosting, so they can reset after redeploys or cold starts.
- That means the site is suitable for demo use, but not for permanent storage unless you add external persistence.

## Admin Access

- Public user view: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin`
- Default admin password: `admin123`

Set a custom admin password before starting server:

ADMIN_PASSWORD=YourStrongPassword npm start

## Upload Type Behavior

- In admin panel, choose upload type before uploading:
  - `Asset Sheet`: updates only Biomedical Asset Viewer data.
  - `AMC/CMC Sheet`: updates only AMC/CMC Tracker data.
- Uploaded source files are stored in project folder:
  - `/uploaded-files`
- Admin panel shows uploaded files list from that folder.

## Blank Column Handling

- Viewer and AMC/CMC tracker automatically hide columns that are completely blank for the current filtered dataset.

## Excel Header Mapping

The parser detects common header names automatically. For best results, include columns similar to:

- `Equipment Name` or `Name of Equipment`
- `Model Number`
- `Serial Number`
- `Company` or `Manufacturer`

All workbook sheets are parsed, and matching rows are combined into one asset list.