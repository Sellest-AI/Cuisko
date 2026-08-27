import agent from "@convex-dev/agent/convex.config";
import migrations from "@convex-dev/migrations/convex.config";

// convex/convex.config.ts
import { defineApp } from "convex/server";

const app = defineApp();

app.use(agent);
app.use(migrations);

export default app;
