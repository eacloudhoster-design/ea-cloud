# S2tone action buttons

Only S2ToneLayout's Remove, Start/Stop and Symbols buttons opt into the new
S2toneActions.css surface. No Regular or Matrix component, navigation,
background, robot frame, name, font preference or settings persistence changes.

The existing accentColor setting supplies RGB channels through one local CSS
custom property. Gradients, recessed shadows, upper highlights and edge glow use
that property for all three controls. Labels/icons retain their existing colour.
The existing column width, gaps, 58px height and 16px corners are preserved.
Pointer-down depresses the surface and strengthens the inset shadow/glow,
transitioning in and out over 180ms. The highlight does not receive pointer
events. Keyboard focus has a visible outline; reduced motion removes movement.

The icon now follows the existing botRunning state: false = Play + Start,
true = Pause (two vertical bars) + Stop. The three existing onClick handlers
are unchanged. App.tsx still performs the same optimistic PATCH to
/api/app/trading-controls and rolls back rejected changes. Remove still opens
the existing confirmation dialog; Symbols opens the existing sheet. This change
does not alter either dialog's implementation or perform extra trading calls.

## Validation

- All 103 existing Node tests passed: node --test scripts/tests/*.test.mjs.
- Client TypeScript passed: node node_modules/typescript/bin/tsc -p
  artifacts/ea-app/tsconfig.json --noEmit.
- Combined website/client production build and Pages output verification passed:
  pnpm run build:pages. The sandbox used pnpm_config_verify_deps_before_run=false
  to run the already-installed workspace instead of triggering a package-manager
  reinstall. Existing Vite chunk-size/sourcemap warnings remain.
- Actual client UI browser checks passed against both Vite source and production
  output, using isolated local API/account fixtures. Nothing contacted a real
  trading account or production database.
- Chromium tested 360x800 and 390x844 mobile viewports with touch support, plus
  1280x900 desktop. Actual mobile taps exercised Remove, Start/Stop and Symbols.
- Red, blue and green selections updated every control's gradients and shadows.
  All three controls passed actual pointer-down/release animation checks.
- Start/Play, Stop/Pause and rejected-PATCH rollback were verified, as were the
  exact existing copyingEnabled request bodies, Remove dialog and Symbols sheet.
- Existing Regular/Matrix button markup, dimensions and computed styling matched
  the pre-change baseline captured from main commit 519e0c6. S2tone button widths
  and heights also matched that baseline.
- Native iOS Safari and physical Android hardware were not available.

Browser reproduction (requires Playwright and Chromium installed):

    S2TONE_ORIGIN=http://127.0.0.1:5181 node scripts/tests/s2tone-buttons.browser.mjs

Serve the actual built client at /ea-app/. The committed fixture records the
pre-change control baseline. Screenshot/metric output goes to work/s2tone-buttons.
S2TONE_BASELINE=1 captures a new local baseline for intentional future comparisons;
it does not overwrite the committed baseline automatically.

Frontend only. No database migration, account changes, environment variables,
backend deployment or new dependency is required. Deploy the reviewed combined
Pages frontend only after approval. This task does not merge or deploy.
