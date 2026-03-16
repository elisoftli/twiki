<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from "svelte-sonner";

	let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
	theme="dark"
	class="toaster group pointer-events-auto"
	toastOptions={{
		classes: {
			toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:backdrop-blur-md",
			description: "group-[.toast]:text-muted-foreground",
			actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
			cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
			success: "group-[.toaster]:!bg-primary/50 group-[.toaster]:!border-primary/50",
			error: "group-[.toaster]:!bg-destructive/50 group-[.toaster]:!border-destructive/50",
			warning: "group-[.toaster]:!bg-yellow-500/50 group-[.toaster]:!border-yellow-500/50",
			info: "group-[.toaster]:!bg-blue-500/50 group-[.toaster]:!border-blue-500/50",
		},
	}}
  position="bottom-center"
	{...restProps}
/>
