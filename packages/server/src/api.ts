/*
 * The server's single entry point: route → validate → use case (manifest A6).
 * Framework-free, so the Edge Function and the tests call exactly the same code.
 */
import { ROUTES, type Route } from "@sjakk/contracts";
import { ApiError } from "./errors.ts";
import type { Deps } from "./ports.ts";
import { getPuzzleProfile, recordPuzzleResult, resetPuzzles, startPuzzles } from "./puzzles.ts";
import { finishBotGame } from "./botgames.ts";
import { deleteAccount, exportAccount, importLocal } from "./account.ts";

export interface ApiReply { status: number; body: unknown }

export async function handleApi(deps: Deps, route: string, userId: string | null, raw: unknown): Promise<ApiReply> {
  try {
    if (!(route in ROUTES)) throw new ApiError("not-found", "Unknown route");
    if (!userId) throw new ApiError("unauthorized");
    const parsed = ROUTES[route as Route].safeParse(raw ?? {});
    if (!parsed.success) throw new ApiError("bad-request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const b = parsed.data as never;
    const body = await (async () => {
      switch (route as Route) {
        case "puzzle/start": return startPuzzles(deps, userId, b);
        case "puzzle/result": return recordPuzzleResult(deps, userId, b);
        case "puzzle/reset": return resetPuzzles(deps, userId);
        case "puzzle/profile": return getPuzzleProfile(deps, userId);
        case "bot-game/finish": return finishBotGame(deps, userId, b);
        case "account/import": return importLocal(deps, userId, b);
        case "account/export": return exportAccount(deps, userId);
        case "account/delete": return deleteAccount(deps, userId);
      }
    })();
    return { status: 200, body };
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, body: { error: e.code, message: e.message } };
    console.error("api error", route, e instanceof Error ? e.message : e);
    return { status: 500, body: { error: "server-error" } };
  }
}
