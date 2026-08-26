import agent from "@convex-dev/agent/convex.config";

// convex/convex.config.ts
import { defineApp } from "convex/server";

const app = defineApp();

app.use(agent);

export default app;
