import type { NextConfig } from "next";
import { withEve } from "eve/next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {};

// Compose both framework wrappers: workflow enables the "use workflow" /
// "use step" directives and its run store; eve mounts /eve/v1/* and the agent
// runtime. eve wraps the outer function (it accepts workflow's config fn).
export default withEve(withWorkflow(nextConfig));
