<script lang="ts">
    import { setupConvex } from "convex-svelte";

    // Call this once near the root so children can use Convex hooks
    setupConvex(import.meta.env.PUBLIC_CONVEX_URL as string);
</script>
  
<slot />
  