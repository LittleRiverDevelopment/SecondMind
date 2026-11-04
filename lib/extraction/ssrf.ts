import { BlockList, isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { Agent, fetch as undiciFetch } from "undici";

const block = new BlockList();
block.addSubnet("0.0.0.0", 8, "ipv4");
block.addSubnet("10.0.0.0", 8, "ipv4");
block.addSubnet("100.64.0.0", 10, "ipv4");
block.addSubnet("127.0.0.0", 8, "ipv4");
block.addSubnet("169.254.0.0", 16, "ipv4");
block.addSubnet("172.16.0.0", 12, "ipv4");
block.addSubnet("192.0.0.0", 24, "ipv4");
block.addSubnet("192.0.2.0", 24, "ipv4");
block.addSubnet("192.168.0.0", 16, "ipv4");
block.addSubnet("198.18.0.0", 15, "ipv4");
block.addSubnet("198.51.100.0", 24, "ipv4");
block.addSubnet("203.0.113.0", 24, "ipv4");
block.addSubnet("224.0.0.0", 4, "ipv4");
block.addSubnet("240.0.0.0", 4, "ipv4");
block.addAddress("255.255.255.255", "ipv4");
block.addAddress("::1", "ipv6");
block.addSubnet("fc00::", 7, "ipv6");
block.addSubnet("fe80::", 10, "ipv6");
block.addSubnet("ff00::", 8, "ipv6");

const blockedHosts = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.internal",
]);

export function isBlockedAddress(address: string) {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const ip = mapped?.[1] ?? address;
  const family = isIP(ip);
  if (family === 4) return block.check(ip, "ipv4");
  if (family === 6) return block.check(ip, "ipv6");
  return true;
}

export function isUnsupportedSocialUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === "x.com" ||
      host === "www.x.com" ||
      host === "mobile.x.com" ||
      host === "twitter.com" ||
      host === "www.twitter.com" ||
      host === "mobile.twitter.com"
    );
  } catch {
    return false;
  }
}

export type AddressLookup = (hostname: string) => Promise<string[]>;

export async function assessUrl(raw: string, lookup: AddressLookup = defaultLookup) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false as const, code: "invalid", message: "That URL could not be read. Paste the text instead." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false as const, code: "protocol", message: "Only public http and https links can be fetched." };
  }
  if (url.username || url.password) {
    return { ok: false as const, code: "credentials", message: "This URL could not be fetched. Paste the text instead." };
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (blockedHosts.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    return { ok: false as const, code: "blocked", message: "This URL could not be fetched. Paste the text instead." };
  }
  if (isIP(host) && isBlockedAddress(host)) {
    return { ok: false as const, code: "blocked", message: "This URL could not be fetched. Paste the text instead." };
  }
  if (!isIP(host)) {
    let addresses: string[] = [];
    try {
      addresses = await lookup(host);
    } catch {
      return { ok: false as const, code: "dns", message: "This URL could not be fetched. Paste the text instead." };
    }
    if (addresses.length === 0 || addresses.some((address) => isBlockedAddress(address))) {
      return { ok: false as const, code: "blocked", message: "This URL could not be fetched. Paste the text instead." };
    }
  }
  return { ok: true as const, url };
}

async function defaultLookup(hostname: string) {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return addresses.map((entry) => entry.address);
}

export function createGuardedLookup() {
  return (hostname: string, options: unknown, callback: (error: Error | null, address: string, family: number) => void) => {
    void defaultLookup(hostname)
      .then((addresses) => {
        if (addresses.length === 0 || addresses.some((address) => isBlockedAddress(address))) {
          callback(new Error("Blocked address"), "", 0);
          return;
        }
        const family = isIP(addresses[0]!) === 6 ? 6 : 4;
        callback(null, addresses[0]!, family);
      })
      .catch((error: Error) => callback(error, "", 0));
  };
}

const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

export type FetchDeps = {
  lookup?: AddressLookup;
  request?: (url: string, signal: AbortSignal) => Promise<{
    status: number;
    headers: { get(name: string): string | null };
    text: () => Promise<string>;
    bytes?: () => Promise<Uint8Array>;
  }>;
};

export async function fetchPublicHtml(raw: string, deps: FetchDeps = {}) {
  const lookup = deps.lookup ?? defaultLookup;
  let current = raw.trim();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const assessed = await assessUrl(current, lookup);
    if (!assessed.ok) return assessed;
    const signal = AbortSignal.timeout(8000);
    const response = deps.request
      ? await deps.request(assessed.url.toString(), signal)
      : await liveRequest(assessed.url.toString(), signal);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) {
        return { ok: false as const, code: "redirect", message: "This URL could not be fetched. Paste the text instead." };
      }
      current = new URL(location, assessed.url).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      return { ok: false as const, code: "http", message: "This URL could not be fetched. Paste the text instead." };
    }
    const type = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) {
      return { ok: false as const, code: "type", message: "That page is not an HTML article. Paste the text instead." };
    }
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) {
      return { ok: false as const, code: "size", message: "That page is too large to extract. Paste the relevant text instead." };
    }
    const html = "bytes" in response && response.bytes ? await readLimited(response) : await response.text();
    if (typeof html !== "string") {
      return { ok: false as const, code: "size", message: "That page is too large to extract. Paste the relevant text instead." };
    }
    if (html.length > MAX_BYTES) {
      return { ok: false as const, code: "size", message: "That page is too large to extract. Paste the relevant text instead." };
    }
    return { ok: true as const, html, url: assessed.url.toString() };
  }
  return { ok: false as const, code: "redirect", message: "This URL could not be fetched. Paste the text instead." };
}

async function readLimited(response: { bytes?: () => Promise<Uint8Array>; text: () => Promise<string> }) {
  if (!response.bytes) return response.text();
  const bytes = await response.bytes();
  if (bytes.byteLength > MAX_BYTES) return null;
  return new TextDecoder().decode(bytes);
}

async function liveRequest(url: string, signal: AbortSignal) {
  const dispatcher = new Agent({
    connect: { timeout: 8000, lookup: createGuardedLookup() as never },
    headersTimeout: 8000,
    bodyTimeout: 8000,
  });
  const response = await undiciFetch(url, {
    dispatcher,
    redirect: "manual",
    signal,
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "SignalLibrary/0.1 (personal research fetch)",
    },
  });
  return {
    status: response.status,
    headers: response.headers,
    text: async () => {
      const reader = response.body?.getReader();
      if (!reader) return "";
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const step = await reader.read();
        if (step.done) break;
        total += step.value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          return "x".repeat(MAX_BYTES + 1);
        }
        chunks.push(step.value);
      }
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new TextDecoder().decode(merged);
    },
  };
}
