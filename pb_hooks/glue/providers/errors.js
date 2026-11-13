/// <reference path="../../../pb_data/types.d.ts" />

/**
 * A failed call to a bank-link provider: `failure` is { code, status,
 * message }, where status is what the link becomes ("reconnect" when the
 * bank needs the person to sign in again, else "error") and message is
 * fit to show the person.
 */
function ProviderError(failure) {
  this.failure = failure;
}

module.exports = { ProviderError: ProviderError };
