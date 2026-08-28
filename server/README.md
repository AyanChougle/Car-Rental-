# KRUIZLY Media Server

Local file storage backend for user photos/videos/docs (profile photos, license
& Aadhar docs, partner car photos/videos, payment screenshots, return-inspection
photos). Files land on disk here; metadata (who uploaded it, what it's for,
when) lives in a SQLite file — no separate database server to install.

This runs **alongside** Firebase, not instead of it — auth still lives in
Firebase, this just handles the media files.

## Setup

1. `cd server && npm install`
2. Get a Firebase service account key: Firebase Console → Project Settings →
   Service Accounts → **Generate New Private Key**. Save the downloaded file
   as `server/serviceAccountKey.json` (already gitignored — never commit it).
3. `cp .env.example .env` and set `ALLOWED_ORIGIN` to wherever your frontend
   is actually served from.
4. `npm start` — runs on `http://localhost:4001` by default.

The SQLite file and `uploads/` folder are created automatically on first run.

## API

All endpoints except `/api/health` require `Authorization: Bearer <firebaseIdToken>`
— the same ID token `firebase.auth().currentUser.getIdToken()` already gives
you on the frontend.

| Method | Path                    | Who                  | What |
|--------|-------------------------|----------------------|------|
| POST   | `/api/media/upload`     | any signed-in user   | multipart form: `file`, `category`, `relatedId` (optional) |
| GET    | `/api/media`            | any signed-in user   | list your own files. Staff can add `?userId=` to review someone else's |
| GET    | `/api/media/file/:id`   | owner or staff       | streams the actual file back |
| DELETE | `/api/media/:id`        | owner or staff       | soft-deletes the row, removes the file from disk |

Valid `category` values: `profile_photo`, `license_doc`, `aadhar_doc`,
`partner_car_photo`, `partner_car_video`, `payment_screenshot`, `inspection_photo`.

## Frontend usage example

```javascript
const token = await firebase.auth().currentUser.getIdToken();

const formData = new FormData();
formData.append("file", fileInput.files[0]);
formData.append("category", "license_doc");

const res = await fetch("http://localhost:4001/api/media/upload", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: formData,
});
const media = await res.json(); // { id, url, originalName, ... }

// Display it later:
const fileRes = await fetch(`http://localhost:4001${media.url}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const blob = await fileRes.blob();
imgElement.src = URL.createObjectURL(blob);
```

## Deploying

This is a plain Node process — deploy it anywhere that runs Node (Render,
Railway, a VPS, etc.) with a persistent disk for `server/db/` and
`server/uploads/`. Point the frontend's fetch calls at that server's real URL
instead of `localhost:4001`.
