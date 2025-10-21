import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { api } from "../../convex/_generated/api";
import { setupFetchClient } from "$lib/auth-server";

export const server = {
  updateUsername: defineAction({
    input: z.object({
      name: z.string(),
    }),
    handler: async (input, context) => {
      const convex = await setupFetchClient(context, {
        convexUrl: import.meta.env.PUBLIC_CONVEX_URL as string,
      });
      await convex.fetchMutation(api.users.updateUsername, {
        username: input.name,
      });
      return {
        success: true,
      };
    },
  }),
};
