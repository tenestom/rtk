# RTK Tracker

A mobile-first Progressive Web App (PWA) built with **React + Vite** that streams and displays real-time GPS/RTK data from a WebSocket server.

## Features

- 📡 **Live WebSocket connection** to `ws://192.168.4.1:81`
- 🔄 **Auto-reconnect** with exponential back-off (up to 10 s)
- 🌐 **Coordinates display** — latitude & longitude with 7 decimal places, tap to copy
- 🎯 **Fix quality indicator** — colour-coded with NMEA fix type labels (No Fix / GPS / DGPS / RTK Fixed / RTK Float …)
- 🛰️ **Satellite count** with animated dot grid
- ⚡ **Battery indicator** — animated SVG with colour-coded charge level
- 📱 **PWA** — installable, works offline, home-screen icon
- 🌙 **Dark mode** — glassmorphism cards, micro-animations

## JSON payload format

```json
{"lat":55.6647,"lon":13.07736,"fix":4,"sats":31,"bat":87}
```

| Field | Type   | Description                      |
|-------|--------|----------------------------------|
| lat   | float  | Latitude in decimal degrees      |
| lon   | float  | Longitude in decimal degrees     |
| fix   | int    | NMEA GGA fix quality (0–6)       |
| sats  | int    | Number of satellites in view     |
| bat   | int    | Battery percentage (0–100)       |

## Getting started

```bash
npm install
npm run dev        # Dev server on http://localhost:5173
npm run build      # Production build → dist/
npm run preview    # Preview production build
```

## Tech stack

- [React 19](https://react.dev/)
- [Vite 8](https://vite.dev/)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) + Workbox
