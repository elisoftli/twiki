<script lang="ts">
	import { LinkPreview as HoverCardPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: HoverCardPrimitive.ArrowProps = $props();
</script>

<HoverCardPrimitive.Arrow
	bind:ref
	class={cn("text-border", className)}
	{...restProps}
/>
