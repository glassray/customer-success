import { eveChannel } from "eve/channels/eve";
import { localDev, none, vercelOidc } from "eve/channels/auth";
import { setContinuation } from "../../lib/store";

/**
 * The customer-facing web channel (drives `useEveAgent` in the browser).
 *
 * We capture the current continuation token on every completed message and
 * park, keyed by session id. That token is the resume handle the two-way
 * handoff uses to relay a human's reply back into the customer's live session.
 *
 * `none()` makes this a public demo surface. Replace with real auth (Clerk,
 * Auth.js, your own verifier) before shipping anything real.
 */
export default eveChannel({
  auth: [vercelOidc(), localDev(), none()],
  events: {
    "message.completed"(_eventData, channel, ctx) {
      const token = channel.continuationToken;
      if (token) void setContinuation(ctx.session.id, token);
    },
  },
});
