# Vicinity Vibe

Vicinity Vibe is a mobile-first React experience for discovering nearby vibes, saving favorites, exploring them on a map, and planning visits with an AI concierge.

## Stack

- React 19 + TypeScript + Vite
- Firebase Authentication + Firestore
- Leaflet / OpenStreetMap
- Gemini AI through a server-side Express endpoint

## Local development

Prerequisites: Node.js 20+.

1. Install dependencies:

   `npm install`

2. Copy the environment template:

   `cp .env.example .env`

3. Put your Gemini key in `.env`.

4. Start the API server:

   `npm run dev:server`

5. In a second terminal, start Vite:

   `npm run dev`

The web app runs on `http://localhost:3000` and proxies `/api/*` to the server on port 3001.

## Production

Build the frontend:

`npm run build`

Start the production server:

`npm start`

The Express server hosts `dist/` and the `/api/chat` endpoint from the same origin. Keep `GEMINI_API_KEY` in your deployment platform's secret/environment configuration; it is never compiled into the browser bundle.

## Firebase

The repository includes Firestore rules and the existing Firebase app configuration. Before a production release, deploy the rules to the intended Firebase project and confirm Google sign-in is enabled for the production domains.

## Current product surface

- Discover/swipe nearby vibe cards
- Save and restore favorites for authenticated users
- Interactive map and location search
- Google sign-in
- AI concierge per saved vibe

The next production milestone is replacing seeded Dallas vibe data with live nearby content, adding real user/event profiles and messaging, and packaging the app for Android/iOS.
