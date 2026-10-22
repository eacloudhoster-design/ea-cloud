# Select Shape functionality fix

## Cause and targeted change

The app already shared shapeStyle/setShapeStyle through AppContext, and Settings compared that value to draw its checkmark. HomeTab computed an unused avatarShape map, while S2ToneLayout, RegularLayout and MatrixLayout hardcoded circles. App also recreated shapeStyle as orbit on every load. There was no persistent shape preference or existing server-side interface-preference column.

The three actual layout components now pass their existing main robot wrapper styles/children to RobotImageFrame. Only that wrapper changes shape. All surrounding markup, controls, backgrounds, titles and decorative Matrix rings remain unchanged. No trading, backend, scanner or activity-monitor file changed.

| Layout | Original main image-frame dimensions/position retained |
| --- | --- |
| S2ToneLayout (`s2tone`) | 230 × 230px, original flex position |
| RegularLayout (`regular`) | 290 × 290px, original flex position/margin |
| MatrixLayout (`matrix`) | 150 × 150px, inset 30px inside the existing 210 × 210px ring area |

Orbit returns the original styled div/content box, preserving each interface's circular border/glow. Cornerstone uses a square; Fortress uses a regular pentagon centred by its visible bounds; Neural uses a distinct rounded square. Non-orbit clipping and border share the same geometry. SVG non-scaling strokes preserve border thickness at each frame size; selected accent colours supply those shape borders. The old glows are retained as matching outline drop-shadows; Matrix's existing ring/ping animations are not redesigned. Shape changes use a 240ms fade without changing frame dimensions. Reduced-motion users get no added fade.

One per-client browser preference (`ea-cloud:client:<id>:robot-shape`) restores the selected shape on reload/reopen, independent of the chosen layout. It uses the existing authenticated client context without storing another raw token or introducing server/schema changes. Invalid values fall back to Orbit. Storage failures do not crash the app, but persistence naturally requires working browser storage. Preferences are per browser/account, not synchronized between devices. No unrelated interface/font/colour persistence was added.

## Exact files

| File | Change |
| --- | --- |
| artifacts/ea-app/src/App.tsx | Replaces the ephemeral shape state with the persistent shape hook; other app state/logic unchanged. |
| artifacts/ea-app/src/pages/HomeTab.tsx | Removes unused radius map and wires only the three existing image wrappers to the shared frame, retaining original sizes/styles/children. |
| artifacts/ea-app/src/pages/SettingsTab.tsx | Extracts the existing unchanged shape-option markup to reusable ShapeChoices; retains checkmark and selection callback and adds aria-pressed. No interface-selector redesign. |
| artifacts/ea-app/src/components/RobotImageFrame.tsx | Shared frame with original Orbit path, SVG clipping/outline and original per-layout content. |
| artifacts/ea-app/src/components/RobotImageFrame.css | Frame-only content clipping, centred cover image, outline and reduced-motion fade. |
| artifacts/ea-app/src/lib/robot-frame-shape.ts | Regular pentagon/rect geometry at the caller's existing dimensions. |
| artifacts/ea-app/src/lib/shape-preference.ts | Validated account-keyed read/write and safe defaults. |
| artifacts/ea-app/src/hooks/use-shape-preference.ts | Immediate shared state update, account-change loading and preference persistence. |
| scripts/tests/robot-shape.test.mjs | Actual layout/option rendering, geometry and persistence regression tests. |
| docs/select-shape-fix.md | This report. |

## Verification and limits

The new tests render the actual HomeTab for all 12 layout/shape combinations, assert one main shaped image frame, original image URL and dimensions/insets, and verify everything outside that frame matches Orbit's markup. They check the regular pentagon's equal side lengths/centred bounds, identical image-clip and border coordinates, accent stroke and distinct square/neural geometry. Actual Settings choices show exactly one matching checkmark/aria-pressed state and invoke the existing shared callback. Saved values are restored across all layouts, with separate-account and invalid/blocked-storage checks.

This is actual React server rendering plus numerical/state-helper validation, **not browser visual inspection**. End-to-end touch/click selection, hook reload in a browser, computed mobile/desktop layout, face crop and SVG clipping/glow appearance still need real browser acceptance. Chromium is blocked in this workspace (setsockopt Operation not permitted / SIGTRAP); no visual/mobile verification or screenshots are claimed. The implementation has responsive inherited dimensions and reduced-motion styling but device rendering is not marked verified.

No database migration, API deployment or MT5 integration is needed for this frontend-only fix. Deploy the reviewed combined Pages build after approval. Nothing was merged or deployed by this task.

Validation completed: all 99 Node tests passed, including the four new shape tests covering all 12 actual layout combinations. Mobile-client TypeScript and combined Pages production build/output verification passed. Current Chromium launch again failed with setsockopt Operation not permitted; browser visual/device acceptance remains outstanding. No backend build or migration is required by this frontend-only change.
