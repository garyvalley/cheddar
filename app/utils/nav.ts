/** The app's sections, in the order the top bar and the phone's tab bar show them. */
export const NAV = [
  { to: '/', label: 'Overview', icon: 'overview' },
  { to: '/accounts', label: 'Accounts', icon: 'accounts' },
  { to: '/spending', label: 'Spending', icon: 'spending' },
  { to: '/projections', label: 'Projections', icon: 'projections' },
  { to: '/taxes', label: 'Taxes', icon: 'taxes' },
] as const
