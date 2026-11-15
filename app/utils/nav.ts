/** The app's sections, in the order the top bar and the phone's tab bar show them; `short` names one in the tab bar, where seven share a phone's width. */
export const NAV = [
  { to: '/', label: 'Overview', icon: 'overview' },
  { to: '/accounts', label: 'Accounts', icon: 'accounts' },
  { to: '/spending', label: 'Spending', icon: 'spending' },
  { to: '/investments', label: 'Investments', icon: 'investments', short: 'Invest' },
  { to: '/goals', label: 'Goals', icon: 'goals' },
  { to: '/projections', label: 'Projections', icon: 'projections' },
  { to: '/taxes', label: 'Taxes', icon: 'taxes' },
] as const
