export interface Env {
  AI: Ai;
  ASSETS: Fetcher;
  ROSTER: KVNamespace;
}

async function fetchESPNScoreboard() {
  try {
    const res = await fetch("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard");
    if (!res.ok) throw new Error("Failed to fetch ESPN scoreboard");
    return res.json();
  } catch {
    return { events: [] };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/roster") {
      const body = await request.json().catch(() => null);
      if (!body?.players || !Array.isArray(body.players)) return new Response(JSON.stringify({ error: "Must provide players array" }), { status: 400 });
      await env.ROSTER.put("players", JSON.stringify(body.players));
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    if (request.method === "GET" && url.pathname === "/roster") {
      const roster = await env.ROSTER.get("players");
      const lastAdvice = await env.ROSTER.get("lastAdvice");
      const thursdayReminder = await env.ROSTER.get("thursdayReminder");
      return new Response(JSON.stringify({ roster, lastAdvice, thursdayReminder }), { headers: { "Content-Type": "application/json" } });
    }

    if (request.method === "POST" && url.pathname === "/api") {
      const body = await request.json().catch(() => null);
      const players = body?.players;
      if (!players || !players.length) return new Response(JSON.stringify({ error: "Must provide players array" }), { status: 400 });

      const scoreboard = await fetchESPNScoreboard();
      const matchups: Record<string, any> = {};
      scoreboard.events.forEach((event: any) => {
        const home = event.competitions[0].competitors.find((c: any) => c.homeAway === "home");
        const away = event.competitions[0].competitors.find((c: any) => c.homeAway === "away");
        const spread = event.competitions[0].odds?.[0]?.spread || null;
        const favorite = event.competitions[0].odds?.[0]?.favorite || null;
        matchups[home.team.abbreviation] = { opponent: away.team.abbreviation, spread, favorite };
        matchups[away.team.abbreviation] = { opponent: home.team.abbreviation, spread: spread ? -spread : null, favorite };
      });

      const prompt = `
You are a fantasy football expert.
Roster:
${players.join("\n")}

Matchups:
${JSON.stringify(matchups, null, 2)}

Pick 3-4 key starters I should definitely start this week.
For each player, provide 1-2 sentence rationale.
Respond only as:

Player: [Name] - Position: [Position]
Reason: [1-2 sentence justification]
`;

      const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { prompt, max_output_tokens: 500 });
      await env.ROSTER.put("lastAdvice", aiResponse.response);
      return new Response(JSON.stringify({ advice: aiResponse.response }), { headers: { "Content-Type": "application/json" } });
    }

    if (request.method === "GET" && url.pathname === "/schedule") {
      const scoreboard = await fetchESPNScoreboard();
      const schedule = scoreboard.events.map((event: any) => {
        const home = event.competitions[0].competitors.find((c: any) => c.homeAway === "home");
        const away = event.competitions[0].competitors.find((c: any) => c.homeAway === "away");
        return `${away.team.abbreviation} @ ${home.team.abbreviation} - ${new Date(event.date).toLocaleString()}`;
      });
      return new Response(JSON.stringify({ schedule }), { headers: { "Content-Type": "application/json" } });
    }

    if (request.method === "POST" && url.pathname === "/notify-thursday") {
      await env.ROSTER.put("thursdayReminder", "Time to get your fantasy key starters insights!");
      return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
    }

    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
