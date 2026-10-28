const round = (value: number) => Math.round(value * 1000) / 1000;

/** Explicit allowlist: no account text, storage, cookies, URLs or credentials. */
export function collectClientSizingDiagnostics() {
  const measure = (selector: string) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return { width: round(rect.width), height: round(rect.height), top: round(rect.top),
      fontSize: style.fontSize, fontFamily: style.fontFamily, zoom: style.zoom,
      transform: style.transform, maxWidth: style.maxWidth, computedWidth: style.width,
      clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      textSizeAdjust: style.getPropertyValue("-webkit-text-size-adjust") };
  };
  const vv = window.visualViewport;
  return {
    schema: 1,
    entryPoint: location.pathname.startsWith("/ea-app/") ? "/ea-app/" : "other",
    framed: window.top !== window.self,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia("(display-mode: standalone)").matches,
    standaloneSignals: { navigator: (navigator as Navigator & { standalone?: boolean }).standalone === true, media: matchMedia("(display-mode: standalone)").matches },
    guards: { zoom: document.documentElement.hasAttribute("data-ea-ios-standalone-zoom"), layout: document.documentElement.hasAttribute("data-ea-ios-standalone-layout") },
    orientation: { legacyAngle: (window as Window & { orientation?: number }).orientation ?? null, screenAngle: screen.orientation?.angle ?? null },
    screen: { width: screen.width, height: screen.height, devicePixelRatio },
    window: { innerWidth, innerHeight, outerWidth, outerHeight },
    visualViewport: vv ? { width: round(vv.width), height: round(vv.height), scale: round(vv.scale), offsetLeft: round(vv.offsetLeft), offsetTop: round(vv.offsetTop) } : null,
    viewportMeta: document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content || null,
    html: measure("html"), body: measure("body"), app: measure(".ea-app-viewport"),
    interface: document.querySelector<HTMLElement>("[data-home-interface]")?.dataset.homeInterface || null,
    matrixControls: measure("[data-matrix-functions]"),
    s2toneControl: measure(".s2tone-action-button"),
    dock: measure(".ea-glass-navigation"),
    assets: Array.from(document.scripts).map(script => {
      try { return new URL(script.src).pathname.split("/").pop() || ""; } catch { return ""; }
    }).filter(name => /^index-[\w-]+\.js$/.test(name)),
  };
}

export async function readClientBuildCommit(): Promise<string | null> {
  try {
    const response = await fetch("/build-info.json", { cache: "no-store", credentials: "omit" });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.commit === "string" && /^[a-f0-9]{40}$/i.test(data.commit) ? data.commit : null;
  } catch { return null; }
}
