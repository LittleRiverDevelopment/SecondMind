const WASM_PAGE_BYTES = 64 * 1024;
const PGLITE_DEFAULT_MAX_PAGES = 32768;
const RENDER_MAX_WASM_MB = 160;

const globalState = globalThis as typeof globalThis & { gc?: () => void; __signalWasmCap?: boolean };

function renderHost() {
  return process.env.RENDER === "true" || Boolean(process.env.RENDER_SERVICE_ID);
}

function maxWasmBytes() {
  const configured = Number(process.env.PGLITE_MAX_WASM_MB);
  if (Number.isFinite(configured) && configured >= 128) return configured * 1024 * 1024;
  if (renderHost()) return RENDER_MAX_WASM_MB * 1024 * 1024;
  return 0;
}

// PGlite asks for a 2 GiB WASM heap. On a 512 MB host that startup heap, plus the
// copy left behind by initdb, is what gets the process killed. Cap the heap on Render.
export function installWasmMemoryCap() {
  if (globalState.__signalWasmCap) return;
  const maxBytes = maxWasmBytes();
  if (!maxBytes) return;
  const maxPages = Math.ceil(maxBytes / WASM_PAGE_BYTES);
  const OriginalMemory = WebAssembly.Memory;
  function CappedMemory(descriptor: WebAssembly.MemoryDescriptor) {
    const maximum =
      descriptor.maximum === PGLITE_DEFAULT_MAX_PAGES
        ? Math.max(descriptor.initial ?? 0, maxPages)
        : descriptor.maximum;
    return new OriginalMemory({ ...descriptor, maximum });
  }
  CappedMemory.prototype = OriginalMemory.prototype;
  WebAssembly.Memory = CappedMemory as unknown as typeof WebAssembly.Memory;
  globalState.__signalWasmCap = true;
}

export function releaseStartupMemory() {
  const gc = globalState.gc;
  if (!gc) return;
  gc();
  const timer = setTimeout(gc, 1000);
  timer.unref?.();
}

installWasmMemoryCap();
