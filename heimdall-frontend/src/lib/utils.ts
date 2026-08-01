export function formatDate(
  dateString: string, 
  timezone: 'local' | 'utc', 
  options?: Intl.DateTimeFormatOptions
) {
  try {
    const date = new Date(dateString)
    return date.toLocaleString('en-GB', {
      timeZone: timezone === 'utc' ? 'UTC' : undefined,
      ...options
    })
  } catch {
    return dateString // Fallback
  }
}
