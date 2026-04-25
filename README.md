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