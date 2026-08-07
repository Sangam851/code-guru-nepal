// Client-side Python execution via Pyodide (WebAssembly). The runtime is
// loaded from the CDN once and cached for the lifetime of the tab, so repeat
// runs are instant.
const PYODIDE_VERSION = "0.26.4";
const CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

type Pyodide = {
  runPythonAsync: (code: string) => Promise<unknown>;
  setStdout: (o: { batched: (s: string) => void }) => void;
  setStderr: (o: { batched: (s: string) => void }) => void;
};

let pyodidePromise: Promise<Pyodide> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load the Python runtime."));
    document.head.appendChild(s);
  });
}

export function getPyodide(): Promise<Pyodide> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      await loadScript(`${CDN}pyodide.js`);
      const loader = (window as unknown as {
        loadPyodide?: (opts: { indexURL: string }) => Promise<Pyodide>;
      }).loadPyodide;
      if (!loader) throw new Error("Python runtime unavailable.");
      return loader({ indexURL: CDN });
    })().catch((e) => {
      pyodidePromise = null;
      throw e;
    });
  }
  return pyodidePromise;
}

export async function runPython(code: string): Promise<{ stdout: string; stderr: string }> {
  const py = await getPyodide();
  let stdout = "";
  let stderr = "";
  py.setStdout({ batched: (s) => { stdout += s + "\n"; } });
  py.setStderr({ batched: (s) => { stderr += s + "\n"; } });
  try {
    await py.runPythonAsync(code);
  } catch (e) {
    stderr += e instanceof Error ? e.message : String(e);
  }
  return { stdout, stderr };
}
