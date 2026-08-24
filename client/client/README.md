# Atlas Frontend

Atlas is a distributed job scheduling platform. This is the frontend interface for operational visibility and management.

## Prerequisites
- Node.js 20+
- npm

## Installation
```bash
npm install
```

## Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure the following are set:
- `VITE_API_URL`: Backend API URL (default: `http://localhost:4000/api/v1`)
- `VITE_WS_URL`: WebSocket Server URL (default: `http://localhost:4000`)
- `VITE_USE_MOCK`: Set to `true` to use mock data without a backend. Set to `false` for real API mode.

## Mock Mode vs Real API Mode
The frontend and backend are developed independently. 
- **Mock Mode**: Setting `VITE_USE_MOCK=true` uses static mock data strictly adhering to the API contract.
- **Real API Mode**: Setting `VITE_USE_MOCK=false` uses Axios to fetch data from the actual backend.

## Development
```bash
npm run dev
```

## Production Build
```bash
npm run build
```
Output will be in `dist/`.

## Docker Usage
A multi-stage Dockerfile is provided to build and serve the application using Nginx.
```bash
docker build -t atlas-frontend .
docker run -p 3000:3000 atlas-frontend
```

## API Integration
The API layer is centralized in `src/api/client.ts` using Axios. React Query is used for caching, polling, and invalidation.
