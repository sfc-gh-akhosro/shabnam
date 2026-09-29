// Lab server: /lab.js is lab.ts bundled per request; / is the lab skeleton;
// everything else is the repo root, so /src/app.css and /icon/ resolve.

const HERE = new URL(".", import.meta.url).pathname;
const ROOT = new URL("../..", import.meta.url).pathname;
const PORT = 3100;

async function bundle(): Promise<Response> {
  const built = await Bun.build({ entrypoints: [`${HERE}lab.ts`], target: "browser", format: "esm" });
  return new Response(built.outputs[0], { headers: { "content-type": "text/javascript" } });
}

Bun.serve({
  port: PORT,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/lab.js") return bundle();
    if (pathname === "/") return new Response(Bun.file(`${HERE}index.html`));
    if (pathname === "/lab.css") return new Response(Bun.file(`${HERE}lab.css`));
    return new Response(Bun.file(`${ROOT}${pathname.slice(1)}`));
  },
});

console.log(`ui lab on http://localhost:${PORT}`);
