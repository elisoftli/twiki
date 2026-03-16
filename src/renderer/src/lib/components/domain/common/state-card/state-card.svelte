<script lang="ts">
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import type { Component, Snippet } from 'svelte';

  interface Props {
    /** Visual variant determining the color scheme */
    variant?: 'error' | 'empty' | 'warning';
    /** Lucide icon component to display */
    icon: Component;
    /** Card title text */
    title: string;
    /** Card description text */
    description?: string;
    /** Optional action button configuration */
    action?: {
      label: string;
      onclick: () => void;
      icon?: Component;
    };
    /** Additional CSS classes */
    class?: string;
    /** Optional slot for custom content after description */
    children?: Snippet;
  }

  let {
    variant = 'empty',
    icon: Icon,
    title,
    description,
    action,
    class: className,
    children,
  }: Props = $props();

  const variantStyles = {
    error: {
      card: 'border-destructive/20',
      iconBg: 'bg-destructive/10',
      iconColor: 'text-destructive',
    },
    warning: {
      card: 'border-yellow-500/20',
      iconBg: 'bg-yellow-500/10',
      iconColor: 'text-yellow-500',
    },
    empty: {
      card: '',
      iconBg: 'bg-muted',
      iconColor: 'text-muted-foreground',
    },
  };

  const styles = $derived(variantStyles[variant]);
</script>

<Card class={cn('border bg-card', styles.card, className)}>
  <CardContent class="py-12">
    <div class="flex flex-col items-center text-center max-w-md mx-auto">
      <!-- Icon -->
      <div class="mb-6">
        <div class={cn('flex size-16 items-center justify-center rounded-full border border-border', styles.iconBg)}>
          <Icon class={cn('size-7', styles.iconColor)} strokeWidth={1.5} />
        </div>
      </div>

      <!-- Message -->
      <h3 class="text-base font-medium text-foreground/90 mb-2">{title}</h3>
      {#if description}
        <p class="text-sm text-muted-foreground/80 leading-relaxed">{description}</p>
      {/if}
      {#if children}
        {@render children()}
      {/if}

      <!-- Action -->
      {#if action}
        <Button variant="outline" onclick={action.onclick} class="mt-6 gap-2">
          <span>{action.label}</span>
          {#if action.icon}
            {@const ActionIcon = action.icon}
            <ActionIcon class="size-3.5" />
          {/if}
        </Button>
      {/if}
    </div>
  </CardContent>
</Card>
