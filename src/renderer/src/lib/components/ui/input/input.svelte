<script lang="ts">
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";
	import type { WithElementRef } from "bits-ui";
	import { onMount, onDestroy } from "svelte";
	import { cn } from "$lib/utils.js";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type"> &
			({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined }) & {
				clearOnEscape?: boolean;
				isPrimary?: boolean;
			}
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		clearOnEscape = false,
		isPrimary = false,
		...restProps
	}: Props = $props();

	function handleKeydown(e: KeyboardEvent): void {
		if (clearOnEscape && e.key === "Escape") {
			value = "";
		}
	}

	function handleGlobalKeydown(e: KeyboardEvent): void {
		// Only handle '/' if this is the primary input and the key is not pressed in another input/textarea
		if (
			isPrimary &&
			e.key === "/" &&
			ref &&
			document.activeElement?.tagName !== "INPUT" &&
			document.activeElement?.tagName !== "TEXTAREA"
		) {
			e.preventDefault();
			ref.focus();
			// Select all text if there is any
			if (value) {
				(ref as HTMLInputElement).select();
			}
		}
	}

	onMount(() => {
		if (isPrimary) {
			window.addEventListener("keydown", handleGlobalKeydown);
		}
	});

	onDestroy(() => {
		if (isPrimary) {
			window.removeEventListener("keydown", handleGlobalKeydown);
		}
	});
</script>

{#if type === "file"}
	<input
		bind:this={ref}
		class={cn(
			"border-input bg-input/30 ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-[color,box-shadow]",
			className
		)}
		type="file"
		bind:files
		bind:value
		onkeydown={handleKeydown}
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		class={cn(
			"border-input bg-input/30 ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm transition-[color,box-shadow]",
			className
		)}
		{type}
		bind:value
		onkeydown={handleKeydown}
		data-gp-primary={isPrimary || undefined}
		{...restProps}
	/>
{/if}
