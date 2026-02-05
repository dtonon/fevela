export function formatCount(count?: number) {
  if (count === undefined || count <= 0) return ''
  return count > 999 ? '999+' : count
}
