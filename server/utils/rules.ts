/** The fields a rule's form sends (shared/rules.ts), passed on as they are: the hooks check them. */
export const RULE_KEYS = ['text', 'min_cents', 'max_cents', 'account', 'category', 'rename', 'exclude', 'apply'] as const
