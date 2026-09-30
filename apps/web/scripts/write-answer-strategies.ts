import { writeFileSync } from "node:fs";
import { answerStrategyArtifact } from "../lib/ask/answerStrategies.ts";

const target = new URL("../../api/app/ai/ask/answer_strategies.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(answerStrategyArtifact(), null, 2)}\n`);
