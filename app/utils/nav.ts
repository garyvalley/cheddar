/** The app's sections, in the order the top bar and the phone's tab bar show them. Accounts are set up in Settings. */
export const NAV = [
  { to: '/', label: 'Overview', icon: 'overview' },
  { to: '/spending', label: 'Spending', icon: 'spending' },
  { to: '/investments', label: 'Investments', icon: 'investments' },
  { to: '/goals', label: 'Goals', icon: 'goals' },
  { to: '/projections', label: 'Projections', icon: 'projections' },
  { to: '/taxes', label: 'Taxes', icon: 'taxes' },
] as const
