# Ahmedabad Ambulance Navigator

Build an interactive web application for the Emergency Ambulance Route Optimizer in Ahmedabad, Gujarat, India.

- Interactive map of Ahmedabad with major road junctions, arterial corridors (SG Highway, 132ft Ring Road, Ashram Road, etc.), and emergency hospitals mapped from the provided dataset.
- Real-time/draggable ambulance live location marker.
- Destination hospital selector and nearest hospital auto-ranking by travel time.
- Implementation of Dijkstra's Shortest Path Algorithm (min-heap, relaxation, path reconstruction) and Dynamic Programming Shortest Path (stage-based optimal substructure, recurrence relation) from scratch.
- Real-time traffic congestion simulator (moderate, heavy, severe jam delays).
- Click-to-block road segments with automatic instant route recalculation and visual warning alerts.
- Alternative routes display and turn-by-turn navigation table.
- Algorithm side-by-side benchmark comparison (execution time, operations count, path agreement) and DAA theoretical viva guide.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f44f62c3-8fe7-4418-aebe-4022731ffe86).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
