# Portrait visibility and upper-half interface swipes

## Causes and targeted changes

`InteractiveBotPortrait` previously animated the shared portrait slot's height and bottom margin to zero when None was selected. Every following sibling therefore moved. Matrix additionally removed its minimum height and detached its branding from the bot-name anchor. The slot now retains each interface's original size/margin; only the portrait visuals fade away. Matrix keeps its existing minimum height and branding anchor in every visibility state. Hidden visuals have no pointer events; the existing capture-based coordinate hit test still recognizes double taps in the original portrait area without placing an overlay above other controls.

The swipe hook previously excluded the portrait's `role=button` and `data-no-interface-swipe` subtree. The portrait also allowed native horizontal panning via `touch-action: manipulation`, which could cancel the app's pointer gesture. The shared portrait now allows vertical pan/pinch while horizontal movement reaches the Home swipe handler. A swipe starts only in the upper half of the viewport, outside the native 16px edge zones and genuine controls. Dialogs, expanded activity panels, inactive Home and the scanner block it. Existing vertical-scroll, multi-touch, cancellation, 60px distance and horizontal-dominance checks remain.

Regular → Matrix → S2tone_ loops in both directions using the existing preference setter. A 300ms transform/opacity transition pairs an inert, pointer-disabled outgoing DOM snapshot with the incoming interface. The snapshot has no React effects or handlers, cannot submit commands, is hidden from accessibility and is removed after its animation. Reduced motion skips the snapshot and disables the incoming animation. No UI, voice, API, trading, authentication or database changes are included.

## Verification

Run the production Pages build and app TypeScript check. Run the focused Node tests for home preferences, shapes, iOS layout and voice announcements. The browser suites use local built assets and isolated API fixtures, never production:

- `scripts/tests/interactive-portrait.browser.mjs`: both shapes hide/restore, exact sibling geometry, persisted visibility, Settings choices, keyboard, mentor image updates, reduced motion and floating-avatar drag across Regular/Matrix/S2tone_ at 320×568, 390×844, 430×932 and 1280×900.
- `scripts/tests/home-interactions.browser.mjs`: actual CDP touch swipes over portraits and surrounding areas, both looping directions, lower-half exclusion, scrolling, controls, cancellation/multi-touch, Settings/sheet/expanded-panel exclusions, background/name geometry, persisted preferences and reduced motion at 360×800, 390×844 and 1280×900.

Screenshots and detailed local test results are written under ignored `work/interactive-portrait` and `work/home-interactions`. Browser emulation does not establish physical iPhone standalone-PWA behavior; that remains an owner acceptance check after approved publication.

## Release scope

Frontend only: publish the normal Cloudflare Pages build after review/approval. No Render deployment, environment changes or PostgreSQL migration is needed for this fix. Publishing the branch/PR does not authorize merging or production deployment.
