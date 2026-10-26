# Support section redesign

Only the final homepage Support scene changed. It now uses the existing default-robot.jpg with cover sizing, a dark overlay, red ambient lighting, centred cloud-only icon/title, the requested description and a white pill button. Existing navigation and all other homepage sections remain unchanged. Scoped staggered reveals respect reduced motion.

Validation: production build, TypeScript, diff check, existing public-scroll browser regression and support-specific browser checks passed. Tested 1440, 820, 390 and 320px widths: full-width scene, centred content, no overflow, white CTA, valid background response, final section ordering and reduced motion. FAQ/Support navigation passed at desktop and touch-mobile widths. Screenshots are included in this directory.

Limitations: The request's reference screenshots were not attached, so no direct Image 1 comparison was possible. The repository's existing Support destination is mailto:eacloudhoster@gmail.com; it is preserved, rather than inventing a Help page. The href was verified without sending email. Physical iOS and Android testing unavailable. No deployment performed.
