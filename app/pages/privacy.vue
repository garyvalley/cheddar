<script setup lang="ts">
// The privacy notice: what Cheddar keeps, who else sees it, and how it goes
// away. Plaid's Developer Policy wants the people who link a bank to be told
// this, and to be pointed at Plaid's own End User Privacy Policy. Public, so
// it can be read before signing up. Keep it true to the code: a change to
// what's stored, shared or kept belongs here too.
definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Privacy' })

const { me } = useAuth()
</script>

<template>
  <article class="stack privacy">
    <h1 class="title-2 center">Privacy</h1>

    <section class="card card-pad">
      <h2 class="headline">What Cheddar keeps</h2>
      <ul class="footnote">
        <li>Your name, email address and password (stored only as a hash), and your two-step sign-in app's secret, encrypted.</li>
        <li>The accounts you add or link, their balances, transactions and, for brokerage accounts, holdings.</li>
        <li>What you add yourself: categories, notes, budgets, goals, and statements you import (only the transactions read from them, not the file).</li>
        <li>Your signed-in devices and 90 days of security activity, such as sign-ins (the kind of device and the country, not your address).</li>
      </ul>
    </section>

    <section class="card card-pad">
      <h2 class="headline">Linking a bank</h2>
      <p class="footnote">
        Cheddar uses <a href="https://plaid.com/" rel="noopener">Plaid</a> to connect to your bank. You sign in to your bank in Plaid's own window:
        your bank password goes to your bank, never to Cheddar. Plaid gives Cheddar a key that can only read your accounts, never move money,
        and Cheddar keeps it encrypted. Plaid handles your information under its
        <a href="https://plaid.com/legal/#end-user-privacy-policy" rel="noopener">End User Privacy Policy</a>,
        and you can see and remove the apps you've connected at <a href="https://my.plaid.com/" rel="noopener">my.plaid.com</a>.
      </p>
    </section>

    <section class="card card-pad">
      <h2 class="headline">Who else sees it</h2>
      <p class="footnote">
        Nobody, unless you choose to share accounts with your household. Cheddar has no ads and no analytics, and your data is never sold or
        used for anything but showing it to you. Email goes out through Mailjet, which sees only your address and the message.
        Pages travel encrypted through Cloudflare, which is told never to keep a copy.
      </p>
    </section>

    <section class="card card-pad">
      <h2 class="headline">Keeping and deleting it</h2>
      <p class="footnote">
        Your data stays until you delete it. Unlinking a bank stops Cheddar reading it and tells Plaid to forget the link; its accounts and
        transactions stay until you delete them. Deleting your account (Settings) removes everything at once, unlinks every bank the same way,
        and offers you an export first. Encrypted backups are kept 30 days, so a deleted account is gone from them within 30 days.
      </p>
      <p class="footnote">Questions, or a copy of what's kept? Export it in Settings, or ask whoever runs this Cheddar: the person who invited you.</p>
    </section>

    <p class="center footnote"><NuxtLink :to="me ? '/settings' : '/login'">{{ me ? 'Back to Settings' : 'Sign in' }}</NuxtLink></p>
  </article>
</template>

<style scoped>
.privacy h2 { margin: 0 0 0.375rem; }
.privacy ul { margin: 0; padding-left: 1.125rem; }
.privacy li + li { margin-top: 0.25rem; }
.privacy .card-pad > p { margin: 0; }
.privacy .card-pad > p + p { margin-top: 0.5rem; }
</style>
