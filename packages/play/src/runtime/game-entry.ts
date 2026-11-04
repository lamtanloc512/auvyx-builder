/** The script the game's document loads (shared/play.json "document", {runtime}). */
import { startGame } from "./game";

startGame().catch((e: unknown) => console.error("[Auvyx Play]", e));
