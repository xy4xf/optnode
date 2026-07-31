// POST /api/convert
// Body: { input: string, fullConfig?: boolean, appendType?: boolean,
//         template?: "acl4ssr"|"minimal" }
// Returns: { output: string, count: number }
//
// Pure conversion of pasted text to a mihomo (clash) YAML config. Mirrors
// subconverter's /sub?target=clash but accepts the raw node list in the body
// instead of fetching a URL.

import { convert, parseSubscription } from "@/lib/proxy";

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = typeof body?.input === "string" ? body.input : "";
  const template = body?.template === "minimal" ? "minimal" : "acl4ssr";

  const count = parseSubscription(input).length;
  const output = convert(input, {
    fullConfig: body?.fullConfig ?? true,
    appendType: body?.appendType ?? false,
    template,
  });

  return Response.json({ output, count });
}
