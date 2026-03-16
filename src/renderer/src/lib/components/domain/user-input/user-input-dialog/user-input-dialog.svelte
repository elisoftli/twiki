<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Popover from '$lib/components/ui/popover';
  import * as Command from '$lib/components/ui/command';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import { Check, ChevronsUpDown } from 'lucide-svelte';

  interface Props {
    open: boolean;
    title: string;
    message: string;
    options: string[];
    onsubmit: (value: string) => void;
    oncancel: () => void;
  }

  let { open, title, message, options, onsubmit, oncancel }: Props = $props();

  let searchValue = $state('');
  let selectedValue = $state('');
  let popoverOpen = $state(false);

  // Filter options based on search
  let filteredOptions = $derived(
    options.filter((opt) => opt.toLowerCase().includes(searchValue.toLowerCase()))
  );

  // Check if current search matches an existing option exactly (case-insensitive)
  let searchMatchesOption = $derived(
    options.some((o) => o.toLowerCase() === searchValue.toLowerCase())
  );

  // Can confirm if there's a selected value or custom text
  let canConfirm = $derived(selectedValue.trim() !== '' || searchValue.trim() !== '');

  // Display value for the trigger button
  let displayValue = $derived(selectedValue || searchValue || 'Select or type a value...');

  // Reset state when dialog opens
  $effect(() => {
    if (open) {
      searchValue = '';
      selectedValue = '';
      popoverOpen = false;
    }
  });

  function selectOption(option: string) {
    selectedValue = option;
    searchValue = '';
    popoverOpen = false;
  }

  function selectCustomValue() {
    selectedValue = searchValue;
    popoverOpen = false;
  }

  function handleConfirm() {
    const value = selectedValue || searchValue;
    if (value.trim()) {
      onsubmit(value.trim());
    }
  }

  function handleCancel() {
    oncancel();
  }

  function handleDialogOpenChange(isOpen: boolean) {
    if (!isOpen) {
      oncancel();
    }
  }
</script>

<Dialog.Root {open} onOpenChange={handleDialogOpenChange}>
  <Dialog.Content class="sm:max-w-md max-h-[80vh] flex flex-col z-[100]" overlayClass="z-[99]" wrapperClass="z-[100]">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{message}</Dialog.Description>
    </Dialog.Header>

    <div class="py-4 flex-1 overflow-y-auto overflow-x-hidden min-h-0">
      <Popover.Root bind:open={popoverOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="outline"
              role="combobox"
              aria-expanded={popoverOpen}
              class="w-full justify-between"
            >
              <span class="truncate">{displayValue}</span>
              <ChevronsUpDown class="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-[var(--bits-popover-anchor-width)] p-0 z-[110]" align="start">
          <Command.Root shouldFilter={false}>
            <Command.Input placeholder="Search or type custom value..." bind:value={searchValue} />
            <Command.List>
              {#if filteredOptions.length === 0 && !searchValue}
                <Command.Empty class="px-4 py-4">No options available. Type a custom value.</Command.Empty>
              {:else if filteredOptions.length === 0 && searchValue}
                <Command.Group>
                  <Command.Item value={searchValue} onSelect={selectCustomValue}>
                    <Check class="mr-2 size-4 opacity-0" />
                    Use custom: "{searchValue}"
                  </Command.Item>
                </Command.Group>
              {:else}
                <Command.Group>
                  {#if searchValue && !searchMatchesOption}
                    <Command.Item value={`custom-${searchValue}`} onSelect={selectCustomValue}>
                      <Check
                        class={cn(
                          'mr-2 size-4',
                          selectedValue === searchValue ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      Use custom: "{searchValue}"
                    </Command.Item>
                  {/if}
                  {#each filteredOptions as option (option)}
                    <Command.Item value={option} onSelect={() => selectOption(option)}>
                      <Check
                        class={cn(
                          'mr-2 size-4',
                          selectedValue === option ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {option}
                    </Command.Item>
                  {/each}
                </Command.Group>
              {/if}
            </Command.List>
          </Command.Root>
        </Popover.Content>
      </Popover.Root>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={handleCancel}>Cancel</Button>
      <Button onclick={handleConfirm} disabled={!canConfirm}>Confirm</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
