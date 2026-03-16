<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import Globe from '@lucide/svelte/icons/globe';

  interface Props {
    /** Whether the dialog is open */
    isOpen: boolean;
    /** Called when the user acknowledges and closes the dialog */
    onAcknowledge: () => void;
    /** Called when "Don't show again" checkbox changes */
    onDontShowAgainChange: (checked: boolean) => void;
  }

  let { isOpen, onAcknowledge, onDontShowAgainChange }: Props = $props();

  let dontShowAgain = $state(false);

  function handleCheckboxChange(checked: boolean | 'indeterminate') {
    dontShowAgain = checked === true;
    onDontShowAgainChange(dontShowAgain);
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) {
      onAcknowledge();
    }
  }
</script>

<Dialog.Root open={isOpen} onOpenChange={handleDialogOpenChange}>
  <Dialog.Content class="max-w-md z-[110]" overlayClass="z-[109]" wrapperClass="z-[110]">
    <Dialog.Header>
      <div class="flex items-center gap-3">
        <div class="flex size-10 items-center justify-center rounded-lg bg-blue-500/10">
          <Globe class="size-5 text-blue-500" />
        </div>
        <Dialog.Title class="text-lg">
          Manual Download Required
        </Dialog.Title>
      </div>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <p class="text-sm text-muted-foreground">
        The download link could not be resolved automatically. A browser window will open so you can navigate the site and start the download manually.
      </p>

      <p class="text-sm text-muted-foreground">
        Once the download begins, it will be captured by the app automatically.
      </p>

      <label class="flex items-center gap-2 cursor-pointer">
        <Checkbox
          checked={dontShowAgain}
          onCheckedChange={handleCheckboxChange}
        />
        <span class="text-sm text-muted-foreground select-none">Don't show this again</span>
      </label>
    </div>

    <Dialog.Footer class="mt-2">
      <Button onclick={onAcknowledge}>Got it</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
