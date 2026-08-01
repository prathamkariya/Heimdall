import type { Analyst } from './types'

export const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'OPEN':
      return 'text-down/70 bg-down/5 border-down/20 font-medium'
    case 'IN_REVIEW':
      return 'text-accent bg-accent/5 border-accent/20 font-medium'
    case 'ESCALATED':
      return 'text-down font-bold bg-down/10 border-down/30'
    case 'DISMISSED':
      return 'text-ink-faint bg-raised border-line line-through'
    case 'CLOSED':
      return 'text-up bg-up/5 border-up/20 font-medium'
    default:
      return 'text-ink-dim bg-raised border-line'
  }
}

export const getAssigneeUsername = (id: number | null, analysts?: Analyst[]) => {
  if (!id) return 'Unassigned'
  if (!analysts) return 'Loading...'
  const a = analysts.find(x => x.id === id)
  return a ? a.username : `User ${id}`
}

export const getAllowedTransitions = (status: string) => {
  switch (status) {
    case 'OPEN':
      return ['IN_REVIEW', 'DISMISSED', 'CLOSED']
    case 'IN_REVIEW':
      return ['OPEN', 'ESCALATED', 'DISMISSED', 'CLOSED']
    case 'ESCALATED':
      return ['IN_REVIEW', 'DISMISSED', 'CLOSED']
    case 'DISMISSED':
    case 'CLOSED':
      return ['OPEN']
    default:
      return []
  }
}
