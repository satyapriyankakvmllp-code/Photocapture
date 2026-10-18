# Exam ID – Centre: Photo Capture (web + desktop)

One React codebase, three ways to run it.

| | Browser (`npm run dev`) | Netlify (HTTPS) | Desktop (Electron .exe) |
|---|---|---|---|
| Webcam / phone front + rear camera | yes (localhost) | yes (HTTPS) | yes |
| Excel upload, face checks, auto capture | yes | yes | yes |
| Photos survive refresh / closing the app | yes (IndexedDB) | yes (IndexedDB, per browser) | yes (IndexedDB + real files) |
| Saves `ROLL.jpg` into a folder next to the .exe | no | no | **yes** |
| Download ZIP of all photos | yes | yes | yes |
| Photos shared between computers / permanent cloud copy | no | no (needs backend, see below) | no |

## Run the web version
    npm install
    npm run dev            # http://localhost:5173

## Run / build the desktop version
    npm run desktop        # builds the web app and opens it in Electron
    npm run desktop:dist   # creates release/ExamPhotoCapture <version>.exe (Windows portable)

Photos are written to `<folder of the .exe>/ExamPhotos/<EXAMID>/<ROLLNUMBER>.jpg`.
(In `npm run desktop` dev mode this is `<project folder>/ExamPhotos`.)
If that folder is read-only (for example the app is under Program Files) it falls back to the user data folder;
the path is shown on the Select page with an "Open folder" button.
Use the **portable** build so the folder sits next to the .exe.

## Deploy to Netlify
1. Push the project to GitHub (keep `public/models/*` in the repo).
2. Netlify -> Add new site -> Import from Git. `netlify.toml` already sets build command `npm run build` and publish folder `dist`.
3. Open the https:// URL, allow the camera.
Netlify only serves the app. It does not store photos. In the browser, photos stay in that browser's IndexedDB; use Download ZIP to keep a copy.

## Permanent cloud storage (not included)
Needs a backend with login: Netlify Functions + Netlify Blobs, or Supabase Storage / Firebase Storage / AWS S3 with signed upload URLs.
The only place to change is `savePhoto` / `loadPhotos` in `src/utils/photoStore.js`.
