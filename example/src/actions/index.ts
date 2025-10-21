import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

const client = new ConvexHttpClient(
  import.meta.env.PUBLIC_CONVEX_URL as string
);

export const server = {
  updateUsername: defineAction({
    input: z.object({
      name: z.string(),
    }),
    handler: async (input, context) => {
      const token = context.locals.convexToken;
      if (token) {
        client.setAuth(token);
      }
      await client.mutation(api.users.updateUsername, {
        username: input.name,
      });
      return {
        success: true,
      };
    },
  }),
};
