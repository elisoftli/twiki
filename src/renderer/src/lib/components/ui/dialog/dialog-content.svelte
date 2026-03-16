<script lang="ts">
	import { Dialog as DialogPrimitive, type WithoutChildrenOrChild } from "bits-ui";
	import X from "@lucide/svelte/icons/x";
	import type { Snippet } from "svelte";
	import * as Dialog from "./index.js";
	import { cn } from "$lib/utils.js";
	import { untrack } from "svelte";
	import { focusManager } from "$lib/gamepad";

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		overlayClass,
		wrapperClass,
		children,
		onInteractOutside,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: DialogPrimitive.PortalProps;
		overlayClass?: string;
		wrapperClass?: string;
		children: Snippet;
	} = $props();

	function handleInteractOutside(e: PointerEvent) {
		if ((e.target as Element | null)?.closest('[data-sonner-toaster]')) {
			e.preventDefault();
			return;
		}
		onInteractOutside?.(e);
	}

	// Register dialog content as a gamepad focus scope.
	// Must use untrack to prevent reactivity loop — pushScope reads/writes $state internally.
	$effect(() => {
		const el = ref;
		if (el) {
			untrack(() => focusManager.pushScope(el));
			return () => {
				untrack(() => focusManager.popScope());
			};
		}
	});
</script>

<Dialog.Portal {...portalProps}>
	<Dialog.Overlay class={overlayClass} />
	<!-- Flex wrapper for centering - prevents blurry content from transform-based positioning -->
	<div class={cn("fixed inset-0 z-50 flex items-center justify-center pointer-events-none", wrapperClass)}>
		<DialogPrimitive.Content
			bind:ref
			class={cn(
				"relative pointer-events-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%] bg-background z-50 grid w-full max-w-lg gap-4 border p-6 shadow-lg duration-200 sm:rounded-lg",
				className
			)}
			onInteractOutside={handleInteractOutside}
			{...restProps}
		>
			{@render children?.()}
			<DialogPrimitive.Close
				class="ring-offset-background focus:ring-ring absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none"
			>
				<X class="size-4" />
				<span class="sr-only">Close</span>
			</DialogPrimitive.Close>
		</DialogPrimitive.Content>
	</div>
</Dialog.Portal>
