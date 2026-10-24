"""Generate plain-black iPhone launch PNGs and matching Apple media declarations.
No logo artwork is read or modified. Run from the repository root; requires Pillow.
"""
from pathlib import Path
from PIL import Image

PROFILES = [
    (320, 568, 2), (375, 667, 2), (414, 736, 3), (375, 812, 3),
    (414, 896, 2), (414, 896, 3), (390, 844, 3), (428, 926, 3),
    (393, 852, 3), (430, 932, 3), (402, 874, 3), (440, 956, 3),
]
OUTPUT = Path('artifacts/ea-app/public/launch')
START = '    <!-- EA_BLACK_LAUNCH_IMAGES_START -->'
END = '    <!-- EA_BLACK_LAUNCH_IMAGES_END -->'

if __name__ == '__main__':
    OUTPUT.mkdir(parents=True, exist_ok=True)
    links = []
    for width, height, ratio in PROFILES:
        for orientation in ('portrait', 'landscape'):
            pixels = (width * ratio, height * ratio)
            if orientation == 'landscape':
                pixels = pixels[::-1]
            name = f'black-{pixels[0]}x{pixels[1]}.png'
            target = OUTPUT / name
            Image.new('RGB', pixels, '#000000').save(target, optimize=True)
            # Verify the actual shipped pixels, not only the configured colour.
            with Image.open(target) as image:
                assert image.size == pixels and image.getbbox() is None
            links.append(
                f'    <link rel="apple-touch-startup-image" href="%BASE_URL%launch/{name}" '
                f'media="(device-width: {width}px) and (device-height: {height}px) '
                f'and (-webkit-device-pixel-ratio: {ratio}) and (orientation: {orientation})" />'
            )
    index = Path('artifacts/ea-app/index.html')
    html = index.read_text()
    block = START + '\n' + '\n'.join(links) + '\n' + END
    if START in html:
        begin = html.index(START)
        end = html.index(END, begin) + len(END)
        html = html[:begin] + block + html[end:]
    else:
        anchor = '    <link rel="manifest"'
        position = html.index(anchor)
        html = html[:position] + block + '\n' + html[position:]
    index.write_text(html)
    print(f'Generated and verified {len(links)} black launch images/declarations')
