<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

  interface Props {
    /** Whether the dialog is open */
    open: boolean;
    /** Dialog title */
    title: string;
    /** Dialog description / message body */
    description: string;
    /** Label for the confirm button */
    confirmLabel?: string;
    /** Label for the cancel button */
    cancelLabel?: string;
    /** Visual variant controlling confirm button style and icon */
    variant?: 'default' | 'warning' | 'destructive';
    /** Called when the user confirms */
    onConfirm: () => void;
    /** Called when the user cancels or closes the dialog */
    onCancel: () => void;
  }

  let {
    open,
    title,
    description,
    confirmLabel = 'Continue',
    cancelLabel = 'Cancel',
    variant = 'default',
    onConfirm,
    onCancel,
  }: Props = $props();

  function handleOpenChange(value: boolean) {
    if (!value) {
      onCancel();
    }
  }
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      {#if variant === 'warning' || variant === 'destructive'}
        <div class="flex items-center gap-3">
          <div class="flex size-10 items-center justify-center rounded-lg {variant === 'destructive' ? 'bg-red-500/10' : 'bg-amber-500/10'}">
            <TriangleAlert class="size-5 {variant === 'destructive' ? 'text-red-500' : 'text-amber-500'}" />
          </div>
          <Dialog.Title class="text-lg">{title}</Dialog.Title>
        </div>
      {:else}
        <Dialog.Title class="text-lg">{title}</Dialog.Title>
      {/if}
    </Dialog.Header>

    <div class="py-2">
      <p class="text-sm text-muted-foreground">{description}</p>
    </div>

    <Dialog.Footer class="mt-2">
      <Button variant="outline" onclick={onCancel}>{cancelLabel}</Button>
      <Button
        variant={variant === 'destructive' ? 'destructive' : 'default'}
        onclick={onConfirm}
      >
        {confirmLabel}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
