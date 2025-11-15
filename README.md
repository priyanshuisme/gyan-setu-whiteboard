# Gyan Setu Whiteboard - Frontend

React-based real-time collaborative whiteboard with integrated audio conferencing.

## Quick Start

```bash
npm install
npm start
```

App opens on: `http://localhost:3000`

## Features

- Real-time collaborative whiteboard
- Audio conferencing with mediasoup
- Recording with MediaRecorder API
- Role-based controls (teacher/student)
- Mute/unmute functionality

## Configuration

Update backend URL in `src/Whiteboard/WhiteboardPage.jsx`:

```javascript
const AUDIO_SERVER_URL = "http://localhost:5001";
```

## Usage

1. Start backend first (`cd ../Audio-backend && node index-media.js`)
2. Start frontend (`npm start`)
3. Join as Teacher or Student
4. Allow microphone access
5. Start collaborating!

## Recording

Teacher's audio is automatically recorded using MediaRecorder API and uploaded as WebM files when class ends.

## Build

```bash
npm run build
```

Output in `build/` directory.
