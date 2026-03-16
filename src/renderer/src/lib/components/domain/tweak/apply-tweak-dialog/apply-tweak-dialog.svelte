<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Accordion from '$lib/components/ui/accordion';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Switch } from '$lib/components/ui/switch';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import Clock from '@lucide/svelte/icons/clock';
  import Play from '@lucide/svelte/icons/play';
  import Undo2 from '@lucide/svelte/icons/undo-2';
  import Minus from '@lucide/svelte/icons/minus';
  import Bot from '@lucide/svelte/icons/bot';
  import Zap from '@lucide/svelte/icons/zap';
  import Key from '@lucide/svelte/icons/key';
  import { untrack } from 'svelte';
  import type { AgentStatus } from '../../../../../../../main/interfaces/tweak-agent.interface';
  import type { ToolStatus, ToolLifecycleStatus } from '../../../../../../../main/interfaces/tool-status.interface';
  import { focusManager } from '$lib/gamepad';
  import ToolIcon from './tool-icon.svelte';
  import ToolOperationItem from './tool-operation-item.svelte';
  import RenderedMessage from './rendered-message.svelte';

  interface Props {
    /** Whether the dialog is open */
    open: boolean;
    /** Title of the tweak being applied */
    tweakTitle: string;
    /** List of tool calls made during this stream */
    toolCalls: ToolStatus[];
    /** Overall status of the stream */
    agentStatus: AgentStatus;
    /** ID of the first tool awaiting approval (from polling snapshot) */
    firstPendingToolId: string | null;
    /** Whether the revert button should be shown (based on stored applied tweak) */
    canRevert?: boolean;
    /** Called when user approves a tool call */
    onApprove: () => void;
    /** Called when user declines a tool call */
    onDecline: () => void;
    /** Called when user closes the dialog */
    onClose: () => void;
    /** Called when user wants to minimize the dialog (continue running in background) */
    onMinimize?: () => void;
    /** Called when user wants to revert the tweak (only available after completion) */
    onRevert?: () => void;
    /** Called when user clicks on a file/folder path to open it */
    onOpenPath?: (path: string) => void;
    /** Called when user edits operation content (e.g., edit-file content) */
    onOperationContentChange?: (toolId: string, operationIndex: number, content: string) => void;
    /** Whether running with user's own API key (only shown in agent mode) */
    usingUserApiKey?: boolean;
    /** Global auto-approve read-only setting (used as default for per-session toggle) */
    globalAutoApproveReadOnly?: boolean;
  }

  let {
    open = $bindable(),
    tweakTitle,
    toolCalls,
    agentStatus,
    firstPendingToolId,
    canRevert = false,
    onApprove,
    onDecline,
    onClose,
    onMinimize,
    onRevert,
    onOpenPath,
    onOperationContentChange,
    usingUserApiKey = false,
    globalAutoApproveReadOnly = false,
  }: Props = $props();

  // Track open accordion items
  let openAccordionValues = $state<string[]>([]);

  // Reference to scroll area for auto-scrolling
  let scrollViewport: HTMLElement | null = $state(null);

  // Track scroll position outside of reactive system to preserve across re-renders
  let lastKnownScrollTop = 0;

  // Set up scroll listener when viewport is available
  $effect(() => {
    if (!scrollViewport) return;

    const handleScroll = () => {
      lastKnownScrollTop = scrollViewport!.scrollTop;
    };

    scrollViewport.addEventListener('scroll', handleScroll);
    return () => scrollViewport?.removeEventListener('scroll', handleScroll);
  });

  // Track previous toolCalls length to detect new items
  let prevToolCallsLength = $state(0);

  // Track tool statuses to detect when they finish (for auto-collapse)
  // Using a regular variable (not $state) to avoid triggering effects when updated
  let prevToolStatuses: Map<string, ToolLifecycleStatus> = new Map();

  // Track which tools have expanded operations (for collapsible operation groups)
  // Maps toolId to boolean (true = show all operations, false/undefined = show limited)
  let expandedOperations = $state<Map<string, boolean>>(new Map());

  // Threshold for collapsing operations
  const OPERATIONS_COLLAPSE_THRESHOLD = 10;
  const OPERATIONS_PREVIEW_COUNT = 5;

  // Read-only tools that can be auto-approved (mirrors READ_ONLY_TOOLS in tool-status.service.ts)
  const READ_ONLY_TOOLS = new Set([
    'read-file-tool',
    'read-file-around-pattern-tool',
    'list-directory-contents-tool',
  ]);

  // Per-session auto-approve state
  let sessionAutoApproveReadOnly = $state(false);
  let lastAutoApprovedToolId: string | null = null;

  // Derived: show revert button only if canRevert prop is true and onRevert is provided
  let showRevertButton = $derived(canRevert && onRevert);

  // Reset per-session auto-approve toggle when dialog opens
  $effect(() => {
    if (open) {
      sessionAutoApproveReadOnly = untrack(() => globalAutoApproveReadOnly);
      lastAutoApprovedToolId = null;
    }
  });

  // Activate gamepad cooldown when a new pending tool appears
  $effect(() => {
    if (firstPendingToolId) {
      focusManager.activateCooldown('approve-tool', 300);
    }
  });

  // Auto-approve read-only tools when per-session toggle is ON
  $effect(() => {
    if (!sessionAutoApproveReadOnly || !firstPendingToolId) return;
    if (firstPendingToolId === lastAutoApprovedToolId) return;

    const pendingTool = toolCalls.find(t => t.toolId === firstPendingToolId);
    if (!pendingTool || !READ_ONLY_TOOLS.has(pendingTool.toolName)) return;

    lastAutoApprovedToolId = firstPendingToolId;
    onApprove();
  });

  // Auto-expand and scroll when new tool items are added
  $effect(() => {
    const currentLength = toolCalls.length;
    const isNewToolAdded = currentLength > prevToolCallsLength && currentLength > 0;

    // Restore scroll position immediately after any toolCalls change
    // (but before we potentially scroll to a new item)
    if (scrollViewport && lastKnownScrollTop > 0 && !isNewToolAdded) {
      // Capture the value NOW before the scroll listener resets it
      const scrollToRestore = lastKnownScrollTop;
      requestAnimationFrame(() => {
        if (scrollViewport) {
          scrollViewport.scrollTop = scrollToRestore;
        }
      });
    }

    if (isNewToolAdded) {
      const newTool = toolCalls[currentLength - 1];
      const finishedStatuses: ToolLifecycleStatus[] = ['completed', 'declined', 'error'];

      // Only expand if tool is not already finished (e.g., auto-approved tools that completed quickly)
      if (!finishedStatuses.includes(newTool.status)) {
        const newItemValue = `tool-${currentLength - 1}`;
        if (!openAccordionValues.includes(newItemValue)) {
          openAccordionValues = [...openAccordionValues, newItemValue];
        }
      }

      // Scroll to show the 3rd item from last at the top of the viewport
      const itemIndex = Math.max(0, currentLength - 3);
      setTimeout(() => {
        if (!scrollViewport) return;

        const targetElement = document.querySelector(`[data-tool-index="${itemIndex}"]`) as HTMLElement | null;
        if (targetElement) {
          const containerRect = scrollViewport.getBoundingClientRect();
          const itemRect = targetElement.getBoundingClientRect();
          const scrollTarget = scrollViewport.scrollTop + (itemRect.top - containerRect.top);
          scrollViewport.scrollTop = scrollTarget;
        }
      }, 200);
    }
    prevToolCallsLength = currentLength;
  });

  // Auto-collapse tools when they finish executing (completed, declined, or error)
  $effect(() => {
    const finishedStatuses: ToolLifecycleStatus[] = ['completed', 'declined', 'error'];
    const valuesToCollapse: string[] = [];

    // Read prevToolStatuses without tracking to avoid infinite loops
    const previousStatuses = untrack(() => prevToolStatuses);

    for (let i = 0; i < toolCalls.length; i++) {
      const tool = toolCalls[i];
      const prevStatus = previousStatuses.get(tool.toolId);
      const currentStatus = tool.status;

      // If tool just transitioned to a finished state, collapse it
      if (finishedStatuses.includes(currentStatus) && prevStatus && !finishedStatuses.includes(prevStatus)) {
        valuesToCollapse.push(`tool-${i}`);
      }
    }

    // Collapse finished tools
    if (valuesToCollapse.length > 0) {
      openAccordionValues = openAccordionValues.filter(v => !valuesToCollapse.includes(v));
    }

    // Update tracked statuses (not reactive, so won't trigger effect)
    const newStatuses = new Map<string, ToolLifecycleStatus>();
    for (const tool of toolCalls) {
      newStatuses.set(tool.toolId, tool.status);
    }
    prevToolStatuses = newStatuses;
  });

  // Determine if stream is active (for button text)
  const isActive = $derived(agentStatus.isRunning);

  // Handle approve - tool stays expanded until it finishes
  function handleApprove(e: MouseEvent) {
    e.stopPropagation();
    onApprove();
  }

  // Handle decline - tool will auto-collapse when status changes to 'declined'
  function handleDecline(e: MouseEvent) {
    e.stopPropagation();
    onDecline();
  }

  // Get status icon component for a tool call
  function getToolStatusIcon(toolStatus: ToolLifecycleStatus) {
    switch (toolStatus) {
      case 'pending-approval':
        return { icon: Clock, class: 'text-amber-500' };
      case 'approved':
      case 'executing':
        return { icon: LoaderCircle, class: 'text-blue-500 animate-spin' };
      case 'completed':
        return { icon: CircleCheck, class: 'text-green-500' };
      case 'declined':
      case 'error':
        return { icon: CircleX, class: 'text-red-500' };
      default:
        return { icon: Play, class: 'text-gray-500' };
    }
  }

  // Get badge variant for tool status
  function getToolStatusBadge(toolStatus: ToolLifecycleStatus) {
    switch (toolStatus) {
      case 'pending-approval':
        return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
      case 'approved':
      case 'executing':
        return 'border-blue-500/30 bg-blue-500/10 text-blue-400';
      case 'completed':
        return 'border-green-500/30 bg-green-500/10 text-green-400';
      case 'declined':
        return 'border-gray-500/30 bg-gray-500/10 text-gray-400';
      case 'error':
        return 'border-red-500/30 bg-red-500/10 text-red-400';
      default:
        return 'border-gray-500/30 bg-gray-500/10 text-gray-400';
    }
  }

  // Format tool status for display
  function formatToolStatus(toolStatus: ToolLifecycleStatus): string {
    switch (toolStatus) {
      case 'pending-approval':
        return 'Awaiting Approval';
      case 'executing':
        return 'Running';
      default:
        return toolStatus.charAt(0).toUpperCase() + toolStatus.slice(1);
    }
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onClose();
    }
  }

  /**
   * Toggle whether all operations are shown for a tool
   */
  function toggleOperationsExpanded(toolId: string) {
    const newMap = new Map(expandedOperations);
    newMap.set(toolId, !newMap.get(toolId));
    expandedOperations = newMap;
  }
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Content
    onOpenAutoFocus={(e) => e.preventDefault()}
    class="
      max-w-2xl max-h-[80vh] flex flex-col gap-0
      data-[state=open]:!slide-in-from-left-[60%]
      data-[state=open]:!slide-in-from-bottom-[40%]
      data-[state=open]:!zoom-in-50 data-[state=closed]:!slide-out-to-left-[60%]
      data-[state=closed]:!slide-out-to-bottom-[40%] data-[state=closed]:!zoom-out-50"
    interactOutsideBehavior={isActive ? 'ignore' : 'close'}
    escapeKeydownBehavior={isActive ? 'ignore' : 'close'}
  >
    <Dialog.Header class="pb-4">
      <div class="flex items-center justify-between gap-3">
        <Dialog.Title class="text-lg font-semibold flex-1 min-w-0 truncate gap-3 flex">
          {#if agentStatus.executionMode}
          <Badge
          variant="outline"
          class="shrink-0 gap-1.5 {agentStatus.executionMode === 'recipe'
                ? 'border-purple-500/30 bg-purple-500/10 text-purple-400'
                : 'border-blue-500/30 bg-blue-500/10 text-blue-400'}"
            >
            {#if agentStatus.executionMode === 'recipe'}
            <Zap class="size-3" />
            Recipe
            {:else}
            <Bot class="size-3" />
            Agent
            {/if}
          </Badge>
          {/if}
          {#if usingUserApiKey && agentStatus.executionMode === 'agent'}
          <Badge
            variant="outline"
            class="shrink-0 gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            title="Using your API key"
          >
            <Key class="size-3" />
            Your key
          </Badge>
          {/if}
          <span>{tweakTitle}</span>
        </Dialog.Title>
      </div>
    </Dialog.Header>

    <div class="flex-1 overflow-hidden -mx-6 px-6">
      <ScrollArea class="h-[400px]" bind:viewportRef={scrollViewport}>
        {#if toolCalls.length > 0}
          <Accordion.Root type="multiple" bind:value={openAccordionValues} class="w-full space-y-2">
            {#each toolCalls as toolCall, index (toolCall.toolId)}
              {@const statusIcon = getToolStatusIcon(toolCall.status)}
              {@const isPendingFirst = toolCall.status === 'pending-approval' && toolCall.toolId === firstPendingToolId}
              <Accordion.Item value={`tool-${index}`} data-tool-index={index} class="overflow-hidden rounded-lg border bg-card shadow-lg transition-colors hover:border-border">
                {@const StatusIcon = statusIcon.icon}
                <Accordion.Trigger
                  class="
                    flex items-center gap-3 px-4 py-2.5 w-full text-left"
                  >
                  <!-- Status indicator icon -->
                  <StatusIcon class="size-4 shrink-0 {statusIcon.class}" />

                  <!-- Tool icon and info -->
                  <div class="flex items-center gap-2 flex-1 min-w-0">
                    {#if toolCall.displayInfo}
                      <ToolIcon iconType={toolCall.displayInfo.iconType} class="size-4 shrink-0 text-muted-foreground" />
                      <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-medium truncate">{toolCall.displayInfo.displayName}</span>
                          {#if toolCall.displayInfo.operations.length > 1}
                            <span class="op-count-badge">{toolCall.displayInfo.operations.length}</span>
                          {/if}
                        </div>
                        <span class="text-xs text-muted-foreground truncate">{toolCall.displayInfo.summary}</span>
                      </div>
                    {:else}
                      <span class="text-sm font-medium truncate">{toolCall.toolName}</span>
                    {/if}
                  </div>

                  <!-- Approval buttons in header - only show on the FIRST pending tool call -->
                  {#if isPendingFirst}
                    <div class="flex gap-1.5 mr-2">
                      <Button
                        size="icon"
                        variant="default"
                        onclick={handleApprove}
                        class="size-7"
                      >
                        <CircleCheck class="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        onclick={handleDecline}
                        class="size-7"
                      >
                        <CircleX class="size-4" />
                      </Button>
                    </div>
                  {/if}

                  <Badge variant="outline" class="text-xs shrink-0 {getToolStatusBadge(toolCall.status)}">
                    {formatToolStatus(toolCall.status)}
                  </Badge>
                </Accordion.Trigger>

                <Accordion.Content class="space-y-3 bg-background/50 px-6 pt-4">
                  <!-- Operations list -->
                  {#if toolCall.displayInfo && toolCall.displayInfo.operations.length > 0}
                    {@const operations = toolCall.displayInfo.operations}
                    {@const shouldCollapse = operations.length > OPERATIONS_COLLAPSE_THRESHOLD}
                    {@const isExpanded = expandedOperations.get(toolCall.toolId) || false}
                    {@const visibleOperations = shouldCollapse && !isExpanded
                      ? operations.slice(0, OPERATIONS_PREVIEW_COUNT)
                      : operations}
                    {@const hiddenCount = operations.length - OPERATIONS_PREVIEW_COUNT}

                    <div class="space-y-1">
                      {#each visibleOperations as operation, opIndex}
                        <ToolOperationItem
                          {operation}
                          operationIndex={opIndex}
                          isPending={toolCall.status === 'pending-approval'}
                          {onOpenPath}
                          onContentChange={(content, idx) => onOperationContentChange?.(toolCall.toolId, idx, content)}
                        />
                      {/each}

                      {#if shouldCollapse}
                        <button
                          onclick={() => toggleOperationsExpanded(toolCall.toolId)}
                          class="w-full py-2 px-3 text-xs text-center text-primary hover:text-primary/80 hover:bg-primary/5 rounded border border-border/30 hover:border-primary/30 transition-colors"
                        >
                          {isExpanded
                            ? 'Show less'
                            : `Show ${hiddenCount} more operation${hiddenCount > 1 ? 's' : ''}...`}
                        </button>
                      {/if}
                    </div>
                  {:else}
                    <!-- Fallback to plain text description -->
                    <div>
                      <pre class="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{toolCall.formattedDescription}</pre>
                    </div>
                  {/if}

                  <!-- Tool error -->
                  {#if toolCall.error}
                    <div class="text-xs">
                      <span class="text-red-400 font-medium">Error:</span>
                      <p class="mt-1 bg-red-500/10 border border-red-500/20 rounded p-2 text-red-400">{toolCall.error}</p>
                    </div>
                  {/if}
                </Accordion.Content>
              </Accordion.Item>
            {/each}
          </Accordion.Root>

          <!-- Status indicator - shown below tool calls -->
          {#if agentStatus.isRunning && !toolCalls.some(t => t.status === 'pending-approval')}
            <div class="flex items-center justify-center gap-2 px-4 py-3 text-muted-foreground text-sm mt-2">
              <LoaderCircle class="size-4 animate-spin" />
              <span>{agentStatus.agentActivity ? 'Determining next step...' : 'Applying tweaks...'}</span>
            </div>
          {:else if !agentStatus.isRunning && agentStatus?.response?.status === 'success'}
            <div class="flex items-center flex-col justify-center gap-2 px-4 py-3 text-green-500 text-sm mt-2">
              <div class="flex items-center gap-2">
                <CircleCheck class="size-4" />
                <span>All tweaks have been applied successfully:</span>
              </div>
              <RenderedMessage message={agentStatus.response.message} class="mt-2" />
            </div>
          {:else if !agentStatus.isRunning && agentStatus?.response?.status === 'error'}
            <div class="flex items-center flex-col justify-center gap-2 px-4 py-3 text-red-500 text-sm mt-2">
              <div class="flex items-center gap-2">
                <CircleX class="size-4" />
                <span>Error applying tweaks:</span>
              </div>
              <RenderedMessage message={agentStatus.response.message} class="mt-2" />
            </div>
          {:else if !agentStatus.isRunning && agentStatus?.response?.status === 'warning'}
            <div class="flex items-center flex-col justify-center gap-2 px-4 py-3 text-amber-500 text-sm mt-2">
              <div class="flex items-center gap-2">
                <CircleX class="size-4" />
                <span>Warning applying tweaks:</span>
              </div>
              <RenderedMessage message={agentStatus.response.message} class="mt-2" />
            </div>
          {/if}
        {:else if agentStatus.isRunning && !agentStatus.response}
          <div class="flex items-center justify-center h-32 text-muted-foreground">
            <LoaderCircle class="size-5 mr-2 animate-spin" />
            <span>{agentStatus.agentActivity ? 'Analyzing tweak instructions...' : 'Preparing tweaks...'}</span>
          </div>
        {:else if !agentStatus.isRunning && agentStatus.rateLimitInfo}
          <div class="flex flex-col items-center justify-center gap-4 h-full min-h-32 px-4 py-6">
            <div class="flex items-center gap-2 text-red-500">
              <Clock class="size-5" />
              <span class="font-medium">Rate Limit Reached</span>
            </div>
            <p class="text-center text-muted-foreground text-sm whitespace-pre-line">
              You've used {agentStatus.rateLimitInfo.used}/{agentStatus.rateLimitInfo.limit} agent requests this hour.
              Try again in ~{agentStatus.rateLimitInfo.retryAfterMinutes} minutes.
            </p>
            <p class="text-center text-muted-foreground/60 text-xs">
              Tip: Use your own API key in Settings to bypass limits
            </p>
          </div>
        {:else if !agentStatus.isRunning && agentStatus.response?.message}
          <div class="flex flex-col items-center justify-center gap-4 h-full min-h-32 px-4 py-6">
            <div class="flex items-center gap-2 text-amber-500">
              <AlertCircle class="size-5" />
              <span class="font-medium">No tweaks were applied</span>
            </div>
            <RenderedMessage message={agentStatus.response.message} />
          </div>
        {:else}
          <div class="flex items-center justify-center h-32 text-muted-foreground">
            <span>No tool calls yet</span>
          </div>
        {/if}
      </ScrollArea>
    </div>

    <Dialog.Footer class="pt-4 border-t border-border/30">
      {#if isActive}
        <Tooltip.Root>
          <Tooltip.Trigger class="mr-auto">
            <label class="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
              <Switch checked={sessionAutoApproveReadOnly} onCheckedChange={(v) => sessionAutoApproveReadOnly = v} class="scale-75" />
              Auto-approve read-only
            </label>
          </Tooltip.Trigger>
          <Tooltip.Content>
            Skip approval prompts for file reads and directory listings for this session
          </Tooltip.Content>
        </Tooltip.Root>
      {:else if showRevertButton}
        <Button
          variant="outline"
          onclick={onRevert}
          class="mr-auto"
        >
          <Undo2 class="size-4 mr-2" />
          Revert
        </Button>
      {/if}
      {#if isActive && onMinimize}
        <Button
          variant="outline"
          onclick={onMinimize}
        >
          <Minus class="size-4 mr-2" />
          Minimize
        </Button>
      {/if}
      <Button
        variant={isActive ? 'destructive' : 'outline'}
        onclick={onClose}
      >
        {isActive ? 'Cancel' : 'Close'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
