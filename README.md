# Ryan's Surf Report

A Vercel-ready Next.js MVP for a 16-day Popoyo surf forecast using Open-Meteo APIs.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data

- Swell point: `11.363528,-86.161333`
- Wind/tide point: `11.4206,-86.114187`
- Forecast cache: one hour via server-side `fetch` revalidation
- Interval: 3-hour rows for 16 days
- Browser forecast requests go only to internal `/api/forecast`
- `/api/forecast` uses native server-side `fetch` only; no Open-Meteo SDK
- Tide uses `current=sea_level_height_msl`; hourly tide trend is a TODO if needed later
