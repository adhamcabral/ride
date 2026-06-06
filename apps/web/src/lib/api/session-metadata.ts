import type { ClientSessionMetadata } from '$lib/types';

function browserSessionMetadata(): ClientSessionMetadata {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string; mobile?: boolean; brands?: Array<{ brand: string; version: string }> };
    connection?: { effectiveType?: string; type?: string; downlink?: number; rtt?: number };
  };
  const userAgent = navigator.userAgent || null;
  const brands = nav.userAgentData?.brands?.map((brand) => brand.brand).join(', ');
  const network = [
    nav.connection?.type,
    nav.connection?.effectiveType,
    typeof nav.connection?.downlink === 'number' ? `${nav.connection.downlink} Mbps` : null,
    typeof nav.connection?.rtt === 'number' ? `${nav.connection.rtt} ms` : null
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    userAgent,
    browser: brands || null,
    os: nav.userAgentData?.platform || null,
    deviceType: nav.userAgentData?.mobile ? 'mobile' : undefined,
    language: navigator.language || null,
    network: network || null,
    wifiSsid: null
  };
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 2200): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Falha ao consultar IP.');
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function collectClientSessionMetadata(): Promise<ClientSessionMetadata> {
  const base = browserSessionMetadata();
  if (typeof fetch === 'undefined') return base;

  try {
    const info = await fetchJsonWithTimeout('https://ipwho.is/');
    if (info?.success === false) throw new Error('IP indisponível.');
    return {
      ...base,
      ipAddress: info.ip ?? base.ipAddress ?? null,
      country: info.country ?? base.country ?? null,
      region: info.region ?? base.region ?? null,
      city: info.city ?? base.city ?? null,
      latitude: typeof info.latitude === 'number' ? info.latitude : base.latitude ?? null,
      longitude: typeof info.longitude === 'number' ? info.longitude : base.longitude ?? null,
      isp: info.connection?.isp ?? info.connection?.org ?? base.isp ?? null,
      network: info.connection?.org ?? info.connection?.domain ?? base.network ?? null
    };
  } catch {
    try {
      const info = await fetchJsonWithTimeout('https://ipapi.co/json/');
      return {
        ...base,
        ipAddress: info.ip ?? base.ipAddress ?? null,
        country: info.country_name ?? info.country ?? base.country ?? null,
        region: info.region ?? base.region ?? null,
        city: info.city ?? base.city ?? null,
        latitude: typeof info.latitude === 'number' ? info.latitude : base.latitude ?? null,
        longitude: typeof info.longitude === 'number' ? info.longitude : base.longitude ?? null,
        isp: info.org ?? info.asn ?? base.isp ?? null,
        network: info.network ?? info.org ?? base.network ?? null
      };
    } catch {
      return base;
    }
  }
}
