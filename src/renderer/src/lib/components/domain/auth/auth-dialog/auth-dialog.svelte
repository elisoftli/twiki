<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Alert from '$lib/components/ui/alert';
  import Info from '@lucide/svelte/icons/info';
  import { authStore } from '$lib/stores';
  import SignInView from './sign-in-view.svelte';
  import SignUpView from './sign-up-view.svelte';
  import VerifyView from './verify-view.svelte';
  import ForgotPasswordView from './forgot-password-view.svelte';
  import ResetPasswordView from './reset-password-view.svelte';

  function handleOpenChange(open: boolean) {
    if (!open) {
      authStore.closeDialog();
    }
  }
</script>

{#snippet infoAlert()}
  <Alert.Root class="py-2 border-primary/50 bg-primary/10 text-primary [&>svg]:text-primary">
    <Info class="size-4" />
    <Alert.Title class="text-sm">Why sign in?</Alert.Title>
    <Alert.Description class="text-xs text-primary/80">
      The Auto Tweaker is free but has hourly rate limits. Signing in helps identify users and prevent abuse.
    </Alert.Description>
  </Alert.Root>
{/snippet}

<Dialog.Root open={authStore.isDialogOpen} onOpenChange={handleOpenChange}>
  <Dialog.Content class="sm:max-w-md select-none!" overlayClass="z-[99]" wrapperClass="z-[100]">
    {#if authStore.dialogView === 'signin'}
      <SignInView {infoAlert} />
    {:else if authStore.dialogView === 'signup'}
      <SignUpView {infoAlert} />
    {:else if authStore.dialogView === 'verify'}
      <VerifyView />
    {:else if authStore.dialogView === 'forgot-password'}
      <ForgotPasswordView />
    {:else if authStore.dialogView === 'reset-password'}
      <ResetPasswordView />
    {/if}
  </Dialog.Content>
</Dialog.Root>
