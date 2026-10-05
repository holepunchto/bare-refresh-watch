interface Watcher {
  /** The paths of the files being watched. */
  readonly files: string[]

  /** Watch `files` instead, keeping the watches the two sets share. */
  update(files: Iterable<string>): void

  /** Stop watching. */
  close(): void
}

/**
 * Watch `files`, which are absolute or relative to the working directory, and call `onchange` with
 * the paths of the files whose contents changed, once changes have stopped for `delay`
 * milliseconds. `delay` defaults to `100`. Each file is watched through its directory, so a file
 * that an editor replaces when it saves is still watched. While a promise returned by `onchange` is
 * pending, further changes are collected and reported once it settles.
 */
declare function watch(
  files: Iterable<string>,
  opts: { delay?: number },
  onchange: (changed: string[]) => unknown
): Watcher

declare function watch(files: Iterable<string>, onchange: (changed: string[]) => unknown): Watcher

declare namespace watch {
  export { type Watcher }
}

export = watch
