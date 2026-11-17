<script setup lang="ts">
// The privacy notice: what Cheddar keeps, who else sees it, and how it goes
// away. Plaid's Developer Policy wants the people who link a bank to be told
// this, and to be pointed at Plaid's own End User Privacy Policy. Public, so
// it can be read before signing up. Keep it true to the code: a change to
// what's stored, shared or kept belongs here too, with PRIVACY_UPDATED
// (shared/legal.ts) moved to that day.
import { KEEP_DAYS } from '~~/shared/contact'
import { legalDate, PRIVACY_UPDATED } from '~~/shared/legal'

definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Privacy Notice' })

const { me } = useAuth()
const { operatorName: name } = useRuntimeConfig().public
</script>

<template>
  <article class="stack privacy">
    <h1 class="title-2 center">Privacy Notice</h1>
    <p class="center footnote">Last updated {{ legalDate(PRIVACY_UPDATED) }}</p>

    <section class="card card-pad">
      <h2 class="headline">Who runs Cheddar</h2>
      <p class="footnote">
        Cheddar is run by {{ name }}, on a server we look after ourselves in the United States. It's for people we invite, aged 18
        or over. Reach us through the <NuxtLink to="/contact?topic=privacy">contact form</NuxtLink>.
      </p>
    </section>

    <section class="card card-pad">
      <h2 class="headline">What Cheddar keeps</h2>
      <ul class="footnote">
        <li>Your name, email address and password (stored only as a hash), your two-step sign-in app's secret, encrypted, and for each passkey you add, its name and public key (which can't be used to sign in on its own).</li>
        <li>The accounts you add or link, their balances, transactions and, for brokerage accounts, holdings.</li>
        <li>What you add yourself: categories, rules, notes, tags, budgets, goals, which alerts you want, and statements you import (only the transactions read from them, not the file).</li>
        <li>Your signed-in devices and 90 days of security activity, such as sign-ins: the kind of device and the country, not the IP address.</li>
        <li>Which version of the Terms of Use you agreed to, and when.</li>
        <li>Messages you send through the contact form, for {{ KEEP_DAYS / 365 }} year, then deleted.</li>
        <li>
          Server logs: the IP address, browser and page of each visit, used only to keep Cheddar running and secure. Older entries
          are deleted automatically.
        </li>
      </ul>
    </section>

    <section class="card card-pad">
      <h2 class="headline">Cookies and your browser</h2>
      <p class="footnote">
        Cheddar sets only the cookies that keep you signed in. Your Projections assumptions are kept in your browser, not on the
        server. There are no tracking or advertising cookies, so there's nothing to opt out of.
      </p>
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
        used for anything but showing it to you. Email goes out through Mailjet, which sees only your address and the message. If you turn on alerts, that message says what the alert is about, such as a charge's amount and where it was.
        Pages travel encrypted through Cloudflare, which sees your IP address as any network in between does, and is told never to keep a copy of a page.
      </p>
    </section>

    <section class="card card-pad">
      <h2 class="headline">How it's protected</h2>
      <p class="footnote">
        Every connection is encrypted, every account must use two-step sign-in, bank keys and two-step secrets are encrypted
        with keys kept apart from the data, and backups are encrypted.
      </p>
    </section>

    <section class="card card-pad">
      <h2 class="headline">Your choices</h2>
      <p class="footnote">
        You can see and correct what Cheddar holds about you in the app, export all of it (Settings, Your data), and delete it.
        Your data stays until you delete it. Unlinking a bank stops Cheddar reading it and tells Plaid to forget the link; its accounts and
        transactions stay until you delete them. Deleting your account (Settings) removes everything at once, unlinks every bank the same way,
        and offers you an export first. Encrypted backups are kept 30 days, so a deleted account is gone from them within 30 days.
      </p>
    </section>

    <section class="card card-pad">
      <h2 class="headline">Changes</h2>
      <p class="footnote">
        If this notice changes, the new one goes here with a new date, and a change that matters is shown to you when you next use Cheddar.
        Questions, or something to ask about your data? Use the <NuxtLink to="/contact?topic=privacy">contact form</NuxtLink>.
      </p>
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
.privacy > .footnote { margin: 0; }
</style>
