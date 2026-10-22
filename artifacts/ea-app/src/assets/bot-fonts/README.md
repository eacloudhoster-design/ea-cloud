These authentic typefaces are bundled locally, scoped to the bot name and font picker.
Source: @fontsource/inter, @fontsource/roboto, @fontsource/orbitron,
@fontsource/rajdhani and @fontsource/exo-2, pinned to 5.3.0 on registry.npmjs.org.

manifest.json records tarball URLs, verified npm SHA-512 integrity and SHA-256
checksums of every WOFF2 file. CSS uses the upstream Unicode ranges.
Semibold 600 previews the picker; the Home name uses native black 900
or Rajdhani's native maximum bold 700. Latin and Latin Extended are bundled
where available; Orbitron provides Latin only. Unsupported characters retain
the browser's normal fallback.

Each original SIL Open Font License is shipped in public/font-licenses/.
No runtime font service, dependency or global typography override is added.

Select Font now offers Inter, Roboto, Orbitron and Flipside BRK. Rajdhani and
Exo 2 remain bundled for existing unrelated typography but are no longer selector
options. Flipside BRK is the authentic, unchanged Brian Kent / Ænigma TTF from
Ubuntu's fonts-aenigma package. additional-manifest.json records provenance and
hashes; original author notice and the distributor's explicit permission are in
public/font-licenses/flipside-brk/. Its native weight is 400, not synthetic 900.
See docs/font-upgrade/README.md for the requested fonts not yet available.
