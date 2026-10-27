# Desktop welcome copy and mobile close buttons

Desktop sign-in now displays **EA Cloud Admin Portal** and **WELCOME — LOGIN TO ACCESS YOUR DASHBOARD**. The subtitle occupies the former heading-to-form gap, preserving every field, button, link and panel position. Desktop close buttons remain visible and functional.

At the existing phone and touch-landscape breakpoints, sign-in's close link and sign-up's absolute topbar use `display: none`. They have no layout/hit box or accessible control, and reserve no space. Logos, panel positioning, backgrounds and animations are unchanged. Desktop signup is unchanged.

- [Desktop sign-in](desktop-signin.png)
- [Mobile sign-in](mobile-signin.png)
- [Mobile sign-up](mobile-signup.png)
- [Before/after measurements](comparison.json)

Full workspace type checking and production build passed. Desktop neon/eye checks passed at three sizes, including the new heading/subtitle and retained close link. The mobile sign-in suite passed six sizes; the mobile sign-up suite passed seven sizes, including removed close controls, fields, scrolling, public navigation, eye/circuit/background motion, reduced motion and mocked registration states. Desktop checks also verified password show/hide, unchanged login payload, loading/error behavior and both desktop close actions with intercepted local API requests.

Twelve before/after viewport comparisons cover desktop 1440×1000, 1920×1080 and 820×1000, plus mobile 390×844, 320×568 and touch landscape 844×390 on both pages. All logo, panel, form and control positions are identical. Desktop signup is pixel-identical; desktop sign-in changes only in the heading/welcome region. Mobile sign-in changes only within the removed close area. Mobile signup changes within the removed close area, plus 2–8 rounded-border pixels differing by one RGB level outside that area. No layout or perceptible visual differences occur elsewhere. Screenshots use reduced motion for deterministic comparison; normal animation is checked separately.

Product changes are limited to desktop heading text in `Login.tsx`, welcome spacing and mobile close visibility in `MentorAuth.css`, and mobile topbar visibility in `MobileRegister.css`. The existing animation rules were preserved byte-for-byte. Authentication/registration handlers, backend, APIs, database, session persistence, approval flow, form validation, navigation and image assets are unchanged. Browser checks use Chromium emulation, not physical devices.

No production deployment or merge performed. The branch is available for review; the existing Cloudflare integration may generate an automatic PR preview.
