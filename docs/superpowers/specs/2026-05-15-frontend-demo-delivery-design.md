# Frontend Demo Delivery Design

## Purpose

Prepare the gem testing training app for a front-end teaching demo delivery. This phase does not add backend services, accounts, class management, teacher dashboards, cloud scoring, or reporting. It establishes the engineering baseline needed to safely polish and ship the existing browser-only learning experience.

## Current Context

The repository root wraps scripts and stores source assets. The runnable Vite app lives in `gem-lab/`.

The current app already includes:

- A workbench home page with refractometer, polariscope, spectroscope, and sample tray entry points.
- Knowledge pages for the three instruments.
- Interactive demo pages for the three instruments.
- A detection workflow with sample selection, instrument selection, observations, and session summary.
- A naming assessment page fed by the current local detection session.
- Local browser persistence for learning progress.

The current delivery risks are:

- No GitHub Actions workflow exists.
- No automated regression or smoke tests exist.
- TypeScript build cache files are tracked and can dirty the working tree after a build.
- Documentation still describes the project as a half-finished front-end project, but does not define a delivery baseline or CI expectations.

## Delivery Scope

This phase creates a stable "front-end teaching demo delivery" foundation:

- Keep the app front-end only.
- Keep all learning progress local to the browser.
- Validate that the app builds in CI.
- Add route-level browser smoke tests for the core teaching flow.
- Remove generated TypeScript build cache files from version control and ignore them going forward.
- Update README delivery notes so a reviewer can install, build, run, and manually verify the demo.

Out of scope:

- Authentication.
- Backend APIs.
- Database persistence.
- Teacher or admin management.
- Cloud scoring or analytics.
- Major UI redesigns.
- New instrument content beyond what is already present.

## Architecture

The delivery baseline will remain inside the existing React + Vite app. CI will run from the repository root and delegate to the `gem-lab/` scripts, matching the existing root package scripts.

Playwright will be added to `gem-lab/` as a development dependency. Tests will exercise the production app through Vite's local preview/web server flow, then assert that every critical route renders a stable, user-visible page landmark.

GitHub Actions will run on pushes and pull requests to `main`. The workflow will install dependencies with `npm ci --prefix gem-lab`, run the production build from the root script, install Playwright browsers, and run the smoke tests.

## Components And Files

Repository metadata:

- `.github/workflows/frontend-demo.yml`: CI workflow for build and smoke tests.
- `gem-lab/.gitignore`: Ignore TypeScript incremental build cache files.
- `README.md`: Delivery-focused setup, verification, and acceptance notes.

Test infrastructure:

- `gem-lab/playwright.config.ts`: Playwright configuration using Vite preview or a production test server.
- `gem-lab/tests/smoke.spec.ts`: Route smoke coverage for core teaching demo pages.
- `gem-lab/package.json`: Add smoke test scripts and Playwright dev dependency.
- `gem-lab/package-lock.json`: Lock dependency changes.

Version-control cleanup:

- Stop tracking `gem-lab/tsconfig.app.tsbuildinfo`.
- Stop tracking `gem-lab/tsconfig.node.tsbuildinfo`.

## Smoke Test Coverage

The smoke suite should verify that these routes render without runtime failure:

- `/`
- `/knowledge/refractometer`
- `/knowledge/polariscope`
- `/knowledge/spectroscope`
- `/demo/refractometer`
- `/demo/polariscope`
- `/demo/spectroscope`
- `/detection`
- `/assessment`

Each assertion should target meaningful visible text or accessible landmarks that represent the page's intended teaching purpose. Tests should avoid brittle screenshot comparisons in this baseline phase.

## Error Handling And Constraints

If a route redirects because no active detection session exists, the smoke test should assert the intended fallback content rather than forcing a seeded session. This keeps the test aligned with current product behavior.

If Playwright cannot run because browser binaries are missing locally, the local workflow should document `npx playwright install chromium`. CI must install the required browser before running tests.

The workflow should be conservative and fast. It should not run asset preparation unless a later requirement proves it is necessary for CI.

## Manual Acceptance Checklist

After implementation, a reviewer should be able to:

- Install dependencies from a clean checkout.
- Run the production build from the repository root.
- Run route smoke tests.
- Start the development server and open the home page.
- Navigate to all three knowledge pages.
- Open all three interactive demos.
- Start the detection flow at beginner difficulty.
- Visit the assessment route without a detection session and see the intended guidance back to the detection flow.

## Verification Commands

The implementation must pass:

```bash
npm run build
npm run test:smoke --prefix gem-lab
git status --short --branch
```

## Follow-Up Work

After this baseline is complete, the next delivery phase should focus on front-end teaching experience polish:

- Desktop and tablet layout pass for the workbench and demo pages.
- Clearer learning-mode and detection-mode transitions.
- Better empty-state and completion-state copy.
- Optional visual QA screenshots for representative viewports.
