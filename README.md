# Fruit Catch

A hand motion game where you catch falling fruits using your webcam.

## How it works

Move your hand in front of the camera to control the basket. Catch as many fruits as possible before time runs out. Avoid bombs.

## Tech

- MediaPipe Hands — real-time hand landmark detection via webcam
- HTML5 Canvas — game rendering
- Vanilla JavaScript — game logic

## Game modes

- 10s / 30s / 60s

## Run locally

Open `index.html` with a local HTTPS server. Camera access requires a secure context.

```bash
npx serve .
```
