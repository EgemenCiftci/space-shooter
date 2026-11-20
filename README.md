# Space Shooter

A 3D space shooter game built with Angular and Babylon.js. Fly through a realistic solar system, shoot lasers, and battle enemy spaceships with dynamic explosions and visual effects.

## Features

- Realistic solar system with proportional planet sizes and distances
- Glowing Sun and starfield background
- Player spaceship with WASD + mouse controls and crosshair
- Laser shooting with glowing effect
- Enemies with random spaceship textures
- Explosive enemy destruction with fragment effects
- Collision detection (enemies, planets, fragments, lasers)
- Responsive design, runs in browser

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)
- [Angular CLI](https://angular.io/cli)

### Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/your-username/space-shooter.git
    cd space-shooter
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

### Running the Development Server

Start the local server:
```bash
ng serve
```
Open your browser at [http://localhost:4200/](http://localhost:4200/).

### Building for Production

```bash
ng build
```
Build artifacts will be stored in the `dist/` directory.

## Controls

- **W/A/S/D**: Move forward/left/back/right
- **Space / Shift**: Move up/down
- **Mouse**: Look around
- **Left Click**: Shoot laser

## Assets

- Planet textures: `src/assets/textures/planets/`
- Spaceship textures: `src/assets/textures/spaceships/`
- Starfield and effects generated at runtime

## License

This project uses open-source assets. See individual asset folders for licenses.

---

Made with [Angular](https://angular.io/) and [Babylon.js](https://www.babylonjs.com/).
