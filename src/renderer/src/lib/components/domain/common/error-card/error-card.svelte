<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import { cn } from '$lib/utils';

  interface Props {
    title?: string;
    message: string;
    class?: string;
    onRetry?: () => void;
  }

  let { title = 'Error', message, class: className, onRetry }: Props = $props();
</script>

<div class={cn('flex justify-center py-12', className)}>
  <Card class="glass max-w-md border-destructive/20">
    <CardHeader class="text-center">
      <div class="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle class="size-8 text-destructive" />
      </div>
      <CardTitle class="text-xl">{title}</CardTitle>
    </CardHeader>
    <CardContent class="text-center">
      <p class="text-muted-foreground">{message}</p>
      {#if onRetry}
        <Button variant="outline" class="mt-4" onclick={onRetry}>
          <RefreshCw class="size-4" />
          Retry
        </Button>
      {/if}
    </CardContent>
  </Card>
</div>
