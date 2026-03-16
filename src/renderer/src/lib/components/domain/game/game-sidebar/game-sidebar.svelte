<script lang="ts">
  import { cn } from '$lib/utils';
  import { AlertTriangle } from 'lucide-svelte';
  import * as Alert from '$lib/components/ui/alert';
  import type { Game } from '../../../../../../../main/interfaces/game-library.interface';
  import type {
    PCGWGameInfo,
    PCGWGroupedResources,
    PCGWConfigPath,
  } from '@twiki/shared';
  import GameInfoCard from './game-info-card.svelte';
  import InstallInfoCard from './install-info-card.svelte';
  import ExternalResourcesCard from './external-resources-card.svelte';

  interface Props {
    game: Game | null;
    configPaths: PCGWConfigPath[];
    gameInfo?: PCGWGameInfo | null;
    externalResources?: PCGWGroupedResources | null;
    /** Whether the game info is currently loading */
    loading?: boolean;
    /** Anchor ID to highlight in the external resources (e.g., "SKSE") */
    highlightedAnchor?: string | null;
    /** Whether to highlight the install info card */
    highlightedInstallInfo?: boolean;
    onOpenPath: (path: string, pathType?: 'file' | 'directory' | 'registry') => void;
    onOpenExternal: (url: string) => void;
    /** Handler for links that may be internal (e.g., links to fixes) */
    onInternalLinkClick?: (url: string, linkText: string) => void;
    /** Handler for adding a custom config path */
    onAddCustomPath?: () => void;
    /** Handler for removing a custom config path */
    onRemoveCustomPath?: (path: string) => void;
    /** Handler for disabling a PCGW config path */
    onDisableConfigPath?: (path: string) => void;
    /** Handler for enabling a disabled config path */
    onEnableConfigPath?: (path: string) => void;
    class?: string;
  }

  let {
    game,
    configPaths,
    gameInfo,
    externalResources,
    loading = false,
    highlightedAnchor,
    highlightedInstallInfo = false,
    onOpenPath,
    onOpenExternal,
    onInternalLinkClick,
    onAddCustomPath,
    onRemoveCustomPath,
    onDisableConfigPath,
    onEnableConfigPath,
    class: className,
  }: Props = $props();

  // Check if any non-registry config paths are missing
  const hasMissingConfigPaths = $derived(
    configPaths.some((cp) => cp.pathType !== 'registry' && !cp.exists)
  );
</script>

<aside data-gp-sidebar-right class={cn('hidden w-1/3 max-w-sm min-w-0 shrink-0 lg:block', className)}>
  <div class="sticky top-8 space-y-6">
    <!-- {#if hasMissingConfigPaths}
      <Alert.Root variant="warning">
        <AlertTriangle class="size-4" />
        <Alert.Title>Missing config files</Alert.Title>
        <Alert.Description class="text-muted-foreground">
          Some configuration files haven't been created yet. Try launching the game once to generate them.
        </Alert.Description>
      </Alert.Root>
    {/if} -->

    <GameInfoCard
      {gameInfo}
      {loading}
      onLinkClick={onInternalLinkClick}
      {onOpenExternal}
    />

    <InstallInfoCard
      installPath={game?.installPath}
      {configPaths}
      extraConfigPaths={game?.extraConfigPaths}
      disabledConfigPaths={game?.disabledConfigPaths}
      {loading}
      {onOpenPath}
      {onAddCustomPath}
      {onRemoveCustomPath}
      {onDisableConfigPath}
      {onEnableConfigPath}
      highlighted={highlightedInstallInfo}
    />

    <ExternalResourcesCard resources={externalResources ?? null} {highlightedAnchor} {onOpenExternal} />
  </div>
</aside>
