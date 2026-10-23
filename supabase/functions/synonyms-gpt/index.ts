import OpenAI from "https://deno.land/x/openai@v4.69.0/mod.ts";

interface ReqPayload {
  group?: string;
}

console.info("synonyms-gpt started");

Deno.serve(async (req: Request) => {
  try {
      if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    });
  }
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response("Unsupported Media Type: expected application/json", {
        status: 415,
      });
    }

    const body = (await req.json()) as ReqPayload;

    const group = (body.group ?? "").trim();
    if (!group) {
      return new Response("Bad Request: 'group' is required", { status: 400 });
    }

    const client = new OpenAI({
  apiKey: Deno.env.get("OPEN_AI_KEY")
})

try {
    const query = `Provide a list of synonyms for the following group name (in german & english, max. 5): ${group}. Return the synonyms as a comma-separated list without any additional text or formatting.`;
    const response = await client.chat.completions.create({
      model: "gpt-4.1-nano",
      stream: false,
      messages: [{ role: 'user', content: query }]
      // input: query
    });

    const reply = response.choices[0].message.content

        return new Response(reply, {
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      },
    });
} catch(e) {
    console.error("synonyms-gpt error", e);
    return new Response(JSON.stringify(e), { status: 500 });
}

  } catch (err) {
    console.error("synonyms-gpt error", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
