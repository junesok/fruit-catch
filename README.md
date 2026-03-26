# Fruit Catch

A hand motion game where you catch falling fruits using your webcam.

## How it works

Move your hand in front of the camera to control the basket. Catch as many fruits as possible before time runs out. Avoid bombs — catching one deducts 3 points.

## Game modes

### 1 Player
Control a single basket with one hand. Catch fruits anywhere on screen.

### 2 Players
Two players stand in front of the same camera. The screen is split in half — each player controls the basket on their side using their hand. Fruits only fall within each player's zone. The player with the higher score at the end wins.

Hand assignment is automatic: the hand with the smaller X coordinate controls Player 1 (left), the other controls Player 2 (right).

## Time options

10s / 30s / 60s

## Difficulty

Fruits fall faster and spawn more frequently as time progresses.

## Tech

- MediaPipe Hands — real-time hand landmark detection via webcam (up to 2 hands)
- HTML5 Canvas — game rendering
- Vanilla JavaScript — game logic

## Run locally

Camera access requires a secure context (HTTPS or localhost).

```bash
npx serve .
```
