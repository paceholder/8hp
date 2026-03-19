# ZF 8HP Transmission — Interactive 3D Cutaway

Interactive WebGL visualization of the ZF 8HP 8-speed automatic transmission.
Built with Three.js, featuring procedural involute gear geometry and animated
power flow diagrams.

**[Live Demo](https://paceholder.github.io/8hp/)**

![ZF 8HP](https://img.shields.io/badge/gears-R%2C%201--8-c44b1a)

## Features

- **4 planetary gear sets** with mathematically correct involute tooth profiles
  (tooth counts: 48/96, 48/96, 69/111, 23/85)
- **5 shift elements** (Brakes A/B, Clutches C/D/E) — 3 engaged per gear
- **Torque converter** with impeller, turbine, stator, and lock-up clutch
- **Torque drums** — colored cylindrical shells showing physical torque paths
- **Animated power flow arrows** — opaque overlay tracing the torque path per gear
- **Gear switching** (R, 1–8) with smooth speed transitions
- **SAO ambient occlusion** post-processing
- **Layer controls** — toggle housing, shafts, gears, clutches, flow arrows
- **Opacity sliders** for housing and drums
- **Animation speed control**
- Keyboard shortcuts: `1`–`8` for gears, `R` for reverse

## Gear Engagement Chart

| Gear | Brake A | Brake B | Clutch C | Clutch D | Clutch E | Ratio  |
|------|---------|---------|----------|----------|----------|--------|
| R    | ●       | ●       |          | ●        |          | -3.297 |
| 1st  | ●       | ●       | ●        |          |          |  4.696 |
| 2nd  | ●       | ●       |          |          | ●        |  3.130 |
| 3rd  |         | ●       | ●        |          | ●        |  2.104 |
| 4th  |         | ●       | ●        | ●        |          |  1.667 |
| 5th  |         |         | ●        | ●        | ●        |  1.285 |
| 6th  |         | ●       |          | ●        | ●        |  1.000 |
| 7th  | ●       |         |          | ●        | ●        |  0.839 |
| 8th  | ●       |         | ●        | ●        |          |  0.667 |

Gear spread: **7.05:1**

## Running Locally

```bash
# Any static file server works
python3 -m http.server 8080
# Open http://localhost:8080
```

No build step required — pure HTML/CSS/JS with ES module imports from CDN.

## Architecture

- `index.html` — markup + UI structure
- `style.css` — light technical theme (Instrument Sans + DM Mono)
- `main.js` — Three.js scene, procedural geometry, physics-based speed solver, animation

Shaft speeds are derived from the planetary gear equation `(1+k)·Nc = Ns + k·Nr`
with rigid connection propagation between gear sets.

## License

MIT
