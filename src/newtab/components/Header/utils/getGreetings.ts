export function getGreetingPeriod(now = new Date()): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = now.getHours();

  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 23) return 'evening';
  return 'night';
}
