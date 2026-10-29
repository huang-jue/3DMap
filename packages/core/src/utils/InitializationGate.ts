/** Coalesces initialization and prevents a disposed resource from being published late. */
export class InitializationGate<T> {
  private generation = 0
  private pending: Promise<T | null> | null = null
  constructor(private readonly release: (value: T) => void) {}
  run(create: () => Promise<T>, commit: (value: T) => void): Promise<T | null> {
    if (this.pending) return this.pending
    const current = this.generation
    const pending = create()
      .then(
        (value) => {
          if (current !== this.generation) {
            this.release(value)
            return null
          }
          try {
            commit(value)
            return value
          } catch (error) {
            this.release(value)
            throw error
          }
        },
        (error) => {
          if (current !== this.generation) return null
          throw error
        }
      )
      .finally(() => {
        if (this.pending === pending) this.pending = null
      })
    this.pending = pending
    return pending
  }
  cancel(): void {
    this.generation++
    this.pending = null
  }
}
