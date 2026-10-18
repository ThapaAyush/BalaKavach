# BalaKavach Frontend

Parental Control Platform web dashboard built with React 19, Tailwind CSS v4, and Vite.

## Features

- **Parent Dashboard**: Real-time family management, screen-time summaries, and device controls.
- **Screen Time Tracking**: Visual usage breakdowns, daily limits, and quiet hours configuration.
- **Rule Enforcement**: Instant app blocking and website domain restrictions.
- **Client Downloads**: Direct distribution for the Android Companion App and Chrome Web Extension.

## Getting Started

### Prerequisites

- Node.js `>= 24 < 25`
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The web dashboard runs locally at `http://localhost:5173`.

### Environment Configuration

Copy `.env.example` to `.env`:

```env
VITE_API_BASE_URL=https://balakavach-be.onrender.com/api/v1
```

### Production Build

```bash
npm run build
```

### Testing

```bash
npm test
```
