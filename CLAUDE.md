# CVmaker Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-15

## Active Technologies
- TypeScript strict ≥ 5.x (frontend) + Rust edition 2021 (Tauri 2 backend) + React 19, Zustand 5, Tailwind CSS 4, shadcn/ui + Radix UI, tauri-plugin-sql (SQLite), Bun (test runner) (002-job-watch-reliability)
- SQLite via tauri-plugin-sql — migrations versionnées via sqlx dans lib.rs + fallbacks ALTER TABLE dans db.ts (002-job-watch-reliability)

- TypeScript strict ≥ 5.x (frontend) + Rust edition 2021 (Tauri 2 backend) + React 19, Vite 7, Zustand 5, Tailwind CSS 4, shadcn/ui + Radix UI, `react-markdown` ^9.x (new), `remark-gfm` ^4.x (new), `tauri-plugin-sql` (SQLite), `headless_chrome` (Rust — existing) (main)

## Project Structure

```text
src/
tests/
```

## Commands

cargo test; cargo clippy

## Code Style

TypeScript strict ≥ 5.x (frontend) + Rust edition 2021 (Tauri 2 backend): Follow standard conventions

## Recent Changes
- 002-job-watch-reliability: Added TypeScript strict ≥ 5.x (frontend) + Rust edition 2021 (Tauri 2 backend) + React 19, Zustand 5, Tailwind CSS 4, shadcn/ui + Radix UI, tauri-plugin-sql (SQLite), Bun (test runner)

- main: Added TypeScript strict ≥ 5.x (frontend) + Rust edition 2021 (Tauri 2 backend) + React 19, Vite 7, Zustand 5, Tailwind CSS 4, shadcn/ui + Radix UI, `react-markdown` ^9.x (new), `remark-gfm` ^4.x (new), `tauri-plugin-sql` (SQLite), `headless_chrome` (Rust — existing)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
