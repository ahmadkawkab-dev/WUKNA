import { brandFaces, brandViewBox } from '../../assets/brand/geometry';

/** Keep the browser icon in step with resolved CSS tokens, including Color Studio. */
export function initializeBrowserBrand() {
  const root = document.documentElement;
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!icon) return () => {};
  const originalIcon = icon.getAttribute('href');
  const originalThemeColor = themeColor?.getAttribute('content') ?? null;
  const onVisibility = () => { root.dataset.brandHidden = String(document.hidden); };
  onVisibility();
  document.addEventListener('visibilitychange', onVisibility);
  // SVG inheritance resolves color-mix and any future semantic token overrides.
  const probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  probe.setAttribute('class', 'wk-brand-mark');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.display = 'none';
  for (const face of brandFaces) {
    const path = document.createElementNS(probe.namespaceURI, 'path');
    path.setAttribute('data-brand-face', face.id);
    path.setAttribute('d', face.path);
    probe.append(path);
  }
  document.body.append(probe);
  let previous = '';
  const update = () => {
    const fills = [...probe.children].map(path => getComputedStyle(path).fill);
    const signature = fills.join('|');
    if (signature === previous) return;
    previous = signature;
    const paths = brandFaces.map((face, index) => `<path d="${face.path}" fill="${fills[index]}"/>`).join('');
    icon.href = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${brandViewBox}">${paths}</svg>`)}`;
    const primary = getComputedStyle(root).getPropertyValue('--primary').trim();
    if (primary) themeColor?.setAttribute('content', primary);
  };
  update();
  const observer = new MutationObserver(update);
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-color-palette', 'style'] });
  return () => {
    observer.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    delete root.dataset.brandHidden;
    probe.remove();
    if (originalIcon === null) icon.removeAttribute('href'); else icon.setAttribute('href', originalIcon);
    if (themeColor && originalThemeColor !== null) themeColor.setAttribute('content', originalThemeColor);
  };
}
