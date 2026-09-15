export type Source = { url: string; label: string; pdf?: boolean };
export type Context = {
  libraryID: number; itemKey: string; title: string;
  selected?: Source; itemURL?: string; doi?: string; attachments: Source[];
};
export type Plan = { direct: Source[]; pages: Source[] };
export type Link = { url: string; updatedAt: string };
export type LinkStore = { schema: 1; entries: Record<string, Link> };

export function webURL(value: string | undefined, base?: string): string | null {
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const u = new URL(value.trim(), base);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null;
    return u.href;
  } catch { return null; }
}

export function normalizeDOI(value = ''): string | null {
  let doi = value.trim().replace(/^doi:\s*/i, '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
  try { doi = decodeURIComponent(doi); } catch { return null; }
  return /^10\.\d{4,9}\/\S+$/i.test(doi) && !/[\u0000-\u001f\u007f]/.test(doi) ? doi : null;
}

export function doiURL(value?: string): string | null {
  const doi = normalizeDOI(value);
  return doi ? 'https://doi.org/' + doi.split('/').map(encodeURIComponent).join('/') : null;
}

export function arxivPDF(value: string): string | null {
  const url = webURL(value);
  if (!url) return null;
  const u = new URL(url);
  let id: string | undefined;
  if (/^(?:www\.|export\.)?arxiv\.org$/i.test(u.hostname)) {
    id = u.pathname.match(/^\/(?:abs|pdf|html)\/(.+?)\/?$/)?.[1]?.replace(/\.pdf$/i, '');
  } else if (/^(?:dx\.)?doi\.org$/i.test(u.hostname)) {
    id = u.pathname.match(/^\/10\.48550\/arxiv\.(.+)$/i)?.[1];
  }
  if (!id || !/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/i.test(id)) return null;
  return 'https://arxiv.org/pdf/' + id;
}

export function looksPDF(url: string): boolean {
  const parsed = webURL(url);
  if (!parsed) return false;
  const u = new URL(parsed);
  return /\.pdf$/i.test(u.pathname) ||
    (/^(?:www\.|export\.)?arxiv\.org$/i.test(u.hostname) && u.pathname.startsWith('/pdf/'));
}

export function uniqueSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter(s => {
    if (seen.has(s.url)) return false;
    seen.add(s.url); return true;
  });
}

export function planSources(context: Context): Plan {
  const direct: Source[] = [], pages: Source[] = [];
  const add = (source: Source) => {
    const url = webURL(source.url);
    if (!url) return;
    // Only a true direct attachment URL precedes the item's own address.
    if (looksPDF(url)) direct.push({ ...source, url, pdf: true });
    else pages.push({ ...source, url });
  };
  if (context.selected) add(context.selected);
  if (direct.length) return {direct, pages};
  if (context.itemURL) add({url: context.itemURL, label: '논문 URL'});
  context.attachments.forEach(add);
  const doi = doiURL(context.doi);
  if (doi) pages.push({url: doi, label: 'DOI'});
  // Predictable source conversions do not require fetching a local attachment.
  const resolved = pages.flatMap(s => {
    const pdf = arxivPDF(s.url);
    return pdf ? [{ ...s, url: pdf, label: s.label + ' · arXiv', pdf: true }] : [];
  });
  return {direct: uniqueSources(direct.length ? direct : resolved), pages: uniqueSources(pages)};
}

export function metadataPDFs(doc: Document, pageURL: string): Source[] {
  // Resolve against the final response URL, honoring the page's first safe base URL.
  const base = webURL(doc.querySelector('base[href]')?.getAttribute('href') || '', pageURL) || pageURL;
  const found: Source[] = [];
  for (const meta of doc.querySelectorAll('meta[name], meta[property]')) {
    const name = (meta.getAttribute('name') || meta.getAttribute('property') || '').toLowerCase();
    if (!['citation_pdf_url', 'wkhealth_pdf_url', 'dc.relation.haspart'].includes(name)) continue;
    const url = webURL(meta.getAttribute('content') || '', base);
    if (url && (name !== 'dc.relation.haspart' || looksPDF(url))) found.push({url, label: '논문 페이지의 PDF', pdf: true});
  }
  for (const link of doc.querySelectorAll('link[href], a[href]')) {
    if ((link.getAttribute('type') || '').toLowerCase() !== 'application/pdf') continue;
    const url = webURL(link.getAttribute('href') || '', base);
    if (url) found.push({url, label: link.textContent?.trim().slice(0, 100) || 'PDF 링크', pdf: true});
  }
  return uniqueSources(found);
}

export async function resolveSources(context: Context,
  inspect: (url: string) => Promise<Source[]>): Promise<{ candidates: Source[]; pages: Source[] }> {
  const plan = planSources(context);
  if (plan.direct.length) return {candidates: plan.direct, pages: plan.pages};
  for (const page of plan.pages.slice(0, 5)) {
    try {
      const found = uniqueSources(await inspect(page.url)).filter(s => webURL(s.url));
      if (found.length) return {candidates: found, pages: plan.pages};
    } catch { /* A failed publisher does not prevent trying the DOI. */ }
  }
  return {candidates: [], pages: plan.pages};
}

export function moonlightURL(value: string): string | null {
  const url = webURL(value);
  if (!url) return null;
  const u = new URL(url);
  if (u.protocol !== 'https:' || !['www.themoonlight.io', 'themoonlight.io'].includes(u.hostname) || u.port) return null;
  return url;
}

export function linkKey(libraryID: number, itemKey: string): string {
  if (!Number.isInteger(libraryID) || libraryID < 0 || !/^[A-Z0-9]{8}$/.test(itemKey)) throw new Error('논문 식별자가 올바르지 않습니다.');
  return `${libraryID}:${itemKey}`;
}

// Observed from Moonlight's own Upload Paper > URL web flow.
export function moonlightReaderURL(source: string): string {
  const existing = moonlightURL(source);
  if (existing) return existing;
  const url = webURL(source);
  if (!url) throw new Error('온라인 논문 주소가 필요합니다. 로컬 파일은 브라우저에서 열어 주세요.');
  return 'https://www.themoonlight.io/file?url=' + encodeURIComponent(url);
}

export function readLinks(raw?: string): LinkStore {
  if (!raw) return {schema: 1, entries: {}};
  const data = JSON.parse(raw);
  if (data.schema !== 1 || !data.entries || Array.isArray(data.entries) || typeof data.entries !== 'object') {
    throw new Error('저장된 Moonlight 연결 형식을 읽을 수 없습니다. 기존 연결 데이터는 보존됩니다.');
  }
  for (const [key, value] of Object.entries(data.entries)) {
    const v = value as Link;
    if (!/^\d+:[A-Z0-9]{8}$/.test(key) || !v || typeof v.url !== 'string' || !moonlightURL(v.url) || typeof v.updatedAt !== 'string') {
      throw new Error('저장된 Moonlight 연결에 오류가 있습니다. 기존 연결 데이터는 보존됩니다.');
    }
  }
  return data;
}

export function browserArgs(url: string, profile = '', allowFile = false): string[] {
  const valid = webURL(url) || (allowFile && /^file:\/\//.test(url) && !/[\r\n\0]/.test(url));
  if (!valid) throw new Error('지원되지 않는 주소입니다.');
  if (profile && !/^(?:Default|Profile \d+)$/.test(profile)) throw new Error('프로필은 Default 또는 Profile 1 형식으로 입력해 주세요.');
  return [...(profile ? [`--profile-directory=${profile}`] : []), '--new-tab', url];
}
