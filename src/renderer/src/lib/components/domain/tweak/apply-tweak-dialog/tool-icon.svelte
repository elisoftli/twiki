<script lang="ts">
  import File from '@lucide/svelte/icons/file';
  import FileText from '@lucide/svelte/icons/file-text';
  import Folder from '@lucide/svelte/icons/folder';
  import FolderInput from '@lucide/svelte/icons/folder-input';
  import FolderOutput from '@lucide/svelte/icons/folder-output';
  import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
  import Database from '@lucide/svelte/icons/database';
  import Settings from '@lucide/svelte/icons/settings';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import Download from '@lucide/svelte/icons/download';
  import type { ToolIconType } from '../../../../../../../main/interfaces/tool-display.interface';
  import type { Component } from 'svelte';

  interface Props {
    iconType: ToolIconType;
    class?: string;
  }

  let { iconType, class: className = '' }: Props = $props();

  const iconMap: Record<ToolIconType, Component<{ class?: string }>> = {
    'file': File,
    'file-text': FileText,
    'folder': Folder,
    'folder-input': FolderInput,
    'folder-output': FolderOutput,
    'arrow-right-left': ArrowRightLeft,
    'database': Database,
    'settings': Settings,
    'message-square': MessageSquare,
    'gamepad': Gamepad2,
    'download': Download,
  };

  const IconComponent = $derived(iconMap[iconType] || File);
</script>

<IconComponent class={className} />
