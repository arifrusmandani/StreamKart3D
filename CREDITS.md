# StreamKart 3D — Credits & Asset Guide

## Built-in Procedural Assets & Audio
- **3D Karts, Tracks, Props & Shaders:** Procedural stylized low-poly meshes generated with Three.js (`CC0` / Public Domain).
- **Arcade Sound Engine:** Real-time synthesized sound effects via Web Audio API (`CC0` / Public Domain — zero copyright / Content ID risk for live streamers).
- **Fonts:** `Russo One`, `Orbitron`, and `Plus Jakarta Sans` via Google Fonts (`OFL-1.1`).

## Drop-in Custom 3D Models (Optional)
StreamKart 3D mendukung penggantian model kart atau penambahan properti lintasan menggunakan file `.glb`:
1. Unduh paket gratis berlisensi **CC0** dari:
   - [Kenney Racing Kit](https://kenney.nl/assets/racing-kit)
   - [Kenney Toy Car Kit](https://kenney.nl/assets/toy-car-kit)
   - [Quaternius Arcade Cars](https://quaternius.com)
2. Simpan file `.glb` ke dalam folder `public/models/kart.glb`.
3. Material bernama `Body` atau mesh utama akan di-*tint* otomatis sesuai warna peserta balapan.
