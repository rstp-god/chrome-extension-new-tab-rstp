export interface ProductivityDaily {
  /** ISO local date "YYYY-MM-DD" in the target time zone */
  date: string
  /** Tasks completed (completedAt) on this day */
  closed: number
  /** Tasks both created AND completed on this day */
  fullFlow: number
  /** Tasks created on this day */
  planned: number
  /**
   * Tasks open at the end of this day.
   * Approximation: treats the current status as authoritative.
   * Tasks completed-then-reopened across a day boundary may be
   * slightly over- or under-counted for historical days.
   */
  wip: number
  /** Day-of-week: Monday = 0 … Sunday = 6 */
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6
}
