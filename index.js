const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

module.exports = function watch(files, opts, onchange) {
  if (typeof opts === 'function') {
    onchange = opts
    opts = {}
  }

  const { delay = 100 } = opts

  const watchers = new Map()
  const digests = new Map()
  const changed = new Set()

  let wanted = new Set()
  let timer = null
  let running = false
  let pending = false

  update(files)

  function update(files) {
    const next = new Set()
    const directories = new Set()

    for (const file of files) {
      const resolved = path.resolve(file)

      next.add(resolved)
      directories.add(path.dirname(resolved))
    }

    wanted = next

    // Only new files are digested, so that a change made since the last
    // update is still reported.
    for (const file of next) if (!digests.has(file)) digests.set(file, digest(file))

    for (const file of digests.keys()) if (!next.has(file)) digests.delete(file)

    for (const [directory, watcher] of watchers) {
      if (directories.has(directory)) continue

      watcher.close()

      watchers.delete(directory)
    }

    // A file is watched through its directory, as an editor that saves by
    // renaming a temporary file over it replaces the file.
    for (const directory of directories) {
      if (watchers.has(directory)) continue

      try {
        watchers.set(
          directory,
          fs.watch(directory, (type, filename) => onevent(directory, filename))
        )
      } catch {
        continue
      }
    }
  }

  // Only a change of contents is reported, as a compiler run before each pack
  // rewrites its output whether it changed or not.
  function onevent(directory, filename) {
    if (filename === null) return

    const file = path.join(directory, filename)

    if (!wanted.has(file)) return

    const after = digest(file)

    if (after === digests.get(file)) return

    digests.set(file, after)

    changed.add(file)

    if (timer !== null) clearTimeout(timer)

    timer = setTimeout(settled, delay)
  }

  function settled() {
    timer = null

    if (running) {
      pending = true

      return
    }

    const files = [...changed]

    changed.clear()

    running = true

    new Promise((resolve) => resolve(onchange(files))).finally(done)
  }

  function done() {
    running = false

    if (pending) {
      pending = false

      settled()
    }
  }

  function digest(file) {
    try {
      return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    } catch {
      return null
    }
  }

  return {
    update,

    get files() {
      return [...wanted]
    },

    close() {
      if (timer !== null) clearTimeout(timer)

      for (const watcher of watchers.values()) watcher.close()

      watchers.clear()
    }
  }
}
