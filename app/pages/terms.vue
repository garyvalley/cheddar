<script setup lang="ts">
// The Terms of Use. Public, so they can be read before signing up; everyone
// agrees to TERMS_VERSION then (POST /api/auth/register), and again on /agree
// after it changes. A change people should agree to again moves
// TERMS_VERSION in shared/legal.ts. Who runs Cheddar and whose law applies
// come from runtime config (nuxt.config.ts), so another operator names
// themselves.
import { legalDate, TERMS_VERSION } from '~~/shared/legal'

definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Terms of Use' })

const { me } = useAuth()
const { operatorName: name, operatorState: state } = useRuntimeConfig().public
</script>

<template>
  <article class="stack legal">
    <h1 class="title-2 center">Terms of Use</h1>
    <p class="center footnote">In effect from {{ legalDate(TERMS_VERSION) }}</p>

    <section class="card card-pad">
      <h2 class="headline">Who we are</h2>
      <p class="footnote">
        Cheddar is run by {{ name }} ("we", "us"). These terms are an agreement between you and us. By creating an account or
        using Cheddar, you agree to them and to the <NuxtLink to="/privacy">Privacy Notice</NuxtLink>, which says what we keep and why.
      </p>
    </section>

    <section class="card card-pad">
      <h2 class="headline">Who can use it</h2>
      <ul class="footnote">
        <li>You must be at least 18, and invited by us.</li>
        <li>One account per person, with true information about yourself.</li>
        <li>Keep your password, authenticator app and recovery codes to yourself. If you think someone else got in, change your password and tell us.</li>
      </ul>
    </section>

    <section class="card card-pad">
      <h2 class="headline">What Cheddar is, and isn't</h2>
      <ul class="footnote">
        <li>Cheddar shows your accounts, spending and plans in one place. It can only read your accounts: it can't move money, and it isn't a bank.</li>
        <li>
          It isn't financial, investment, tax or legal advice. Tax estimates, projections, budgets and ideas are for your own
          education, worked out from what your accounts hold. Check with a qualified professional before acting on them.
        </li>
        <li>
          Figures come from your bank through Plaid, or from files you import. They can be late, missing or wrong, so check
          anything important with your bank.
        </li>
      </ul>
    </section>

    <section class="card card-pad">
      <h2 class="headline">Linking a bank</h2>
      <p class="footnote">
        When you link a bank, you let us get your account information through Plaid, which handles it under its own
        <a href="https://plaid.com/legal/#end-user-privacy-policy" rel="noopener">End User Privacy Policy</a>. Only link accounts you're
        allowed to use. You can unlink a bank at any time in Settings.
      </p>
    </section>

    <section class="card card-pad">
      <h2 class="headline">Sharing with your household</h2>
      <p class="footnote">
        You choose which accounts to share. Members of your household see them and can edit some details of their transactions,
        as Settings explains. You're responsible for whom you invite.
      </p>
    </section>

    <section class="card card-pad">
      <h2 class="headline">Using it fairly</h2>
      <p class="footnote">
        Don't try to get into anyone else's account or data, get past Cheddar's security, overload it, or use it for anything
        unlawful. If you find a security problem, tell us through the <NuxtLink to="/contact?topic=security">contact form</NuxtLink>
        and don't look at anyone else's data.
      </p>
    </section>

    <section class="card card-pad">
      <h2 class="headline">Your data</h2>
      <p class="footnote">
        What you put in Cheddar stays yours. You let us store and process it only to run Cheddar for you, as the Privacy Notice
        describes. You can export it or delete it at any time in Settings.
      </p>
    </section>

    <section class="card card-pad">
      <h2 class="headline">The service</h2>
      <ul class="footnote">
        <li>Cheddar is free. We may change it, pause it, or stop running it. Before stopping for good, we'll try to give you time to export your data.</li>
        <li>You can delete your account at any time. We may suspend or close an account that breaks these terms, or to protect Cheddar or the people who use it.</li>
      </ul>
    </section>

    <section class="card card-pad">
      <h2 class="headline">No warranty, and limits on liability</h2>
      <p class="footnote">
        Cheddar is provided "as is" and "as available", without warranties of any kind, to the fullest extent the law allows.
        To the same extent, we aren't liable for indirect, incidental, special or consequential losses, for decisions you make
        using Cheddar, or for lost data, and our total liability for any claim is limited to $100. Some places don't allow these
        limits, so they may not all apply to you.
      </p>
    </section>

    <section class="card card-pad">
      <h2 class="headline">Changes, and the law that applies</h2>
      <p class="footnote">
        If we change these terms, we'll post the new ones here with a new date. When a change matters, you'll be asked to agree to it
        the next time you use Cheddar; if you don't agree, stop using it and delete your account. These terms follow the laws of
        {{ state }}, and any dispute goes to the state or federal courts in {{ state }}.
      </p>
      <p class="footnote">Questions? Use the <NuxtLink to="/contact">contact form</NuxtLink>.</p>
    </section>

    <p class="center footnote"><NuxtLink :to="me ? '/' : '/login'">{{ me ? 'Back to Cheddar' : 'Sign in' }}</NuxtLink></p>
  </article>
</template>

<style scoped>
.legal h2 { margin: 0 0 0.375rem; }
.legal ul { margin: 0; padding-left: 1.125rem; }
.legal li + li { margin-top: 0.25rem; }
.legal .card-pad > p { margin: 0; }
.legal .card-pad > p + p { margin-top: 0.5rem; }
.legal > .footnote { margin: 0; }
</style>
