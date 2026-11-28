These authentic typefaces are bundled locally, scoped to the bot name and font picker.
Source: @fontsource/inter, @fontsource/roboto, @fontsource/orbitron,
@fontsource/rajdhani and @fontsource/exo-2, pinned to 5.3.0 on registry.npmjs.org.

manifest.json records tarball URLs, verified npm SHA-512 integrity and SHA-256
checksums of those WOFF2 files. CSS uses the upstream Unicode ranges.
Semibold 600 previews the picker; the Home name uses native black 900
or Rajdhani's native maximum bold 700. Latin and Latin Extended are bundled
where available; Orbitron provides Latin only. Unsupported characters retain
the browser's normal fallback.

Each original SIL Open Font License is shipped in public/font-licenses/.
No runtime font service, dependency or global typography override is added.

Exo 2 remains bundled for existing typography. Flipside BRK is the authentic, unchanged Brian Kent / Ænigma TTF from
Ubuntu's fonts-aenigma package. additional-manifest.json records provenance and
hashes; original author notice and the distributor's explicit permission are in
public/font-licenses/flipside-brk/. Its native weight is 400, not synthetic 900.
Select Font also offers Rubik Glitch, Oxanium, Audiowide, Chakra Petch, Rajdhani,
Rubik Iso and Michroma. The added WOFF2 files and their Unicode ranges come from
the [official Google Fonts CSS API](https://fonts.googleapis.com/css2?family=Audiowide&family=Chakra+Petch:wght@700&family=Michroma&family=Oxanium:wght@700&family=Rajdhani:wght@700&family=Rubik+Glitch&family=Rubik+Iso&display=swap).
Rajdhani reuses the existing Latin and Latin Extended assets. Their 700-weight
files match Google's WOFF2 files byte for byte. The new Devanagari subset
ships alongside them under the same Indian Type Foundry SIL Open Font License
1.1 already in public/font-licenses/. The other six SIL Open Font License 1.1
notices in that directory come from the
[Google Fonts repository](https://github.com/google/fonts/tree/5026800714d07231937d92eb4cceabf06e05d74e/ofl).
