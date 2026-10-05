const test = require('brittle')
const tmp = require('test-tmp')
const fs = require('fs')
const path = require('path')

const watch = require('.')

function settle(ms = 300) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Watching a directory on macOS replays what happened to it just before the
// watch began, so the files are left alone for a moment first, and a save can
// arrive as several events.
async function watching(t, files, opts, onchange) {
  await settle()

  const watcher = watch(files, { delay: 200, ...opts }, onchange)

  t.teardown(() => watcher.close())

  await settle()

  return watcher
}

async function app(t, names) {
  const base = await tmp(t)

  const files = []

  for (const name of names) {
    const file = path.join(base, name)

    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'x')

    files.push(file)
  }

  return { base, files }
}

test('a burst of changes is reported once', async (t) => {
  const { files } = await app(t, ['a.js', 'b.js', 'c.js'])

  const runs = []

  await watching(t, files, {}, (changed) => runs.push(changed))

  for (const file of files) fs.writeFileSync(file, 'y')

  await settle()

  t.is(runs.length, 1, 'one run')
  t.is(runs[0].length, 3, 'naming everything that changed')
})

test('a file that is not in the set is not watched', async (t) => {
  const { base, files } = await app(t, ['a.js', 'built.js'])

  const runs = []

  await watching(t, [files[0]], {}, (changed) => runs.push(changed))

  fs.writeFileSync(path.join(base, 'built.js'), 'y')
  fs.writeFileSync(path.join(base, 'out.bin'), 'y')

  await settle()

  t.alike(runs, [], 'which is what a build output is, so nothing is ignored')

  fs.writeFileSync(files[0], 'y')

  await settle()

  t.alike(runs, [[files[0]]])
})

test('a file outside where the loop runs is watched all the same', async (t) => {
  const here = await app(t, ['a.js'])
  const elsewhere = await app(t, ['lib/view.js'])

  const runs = []

  await watching(t, [...here.files, ...elsewhere.files], {}, (changed) => runs.push(changed))

  fs.writeFileSync(elsewhere.files[0], 'y')

  await settle()

  t.alike(runs, [elsewhere.files], 'which is how a library edit reaches the application')
})

test('the set can be replaced', async (t) => {
  const { files } = await app(t, ['a.js', 'b.js'])

  const runs = []

  const watcher = await watching(t, [files[0]], {}, (changed) => runs.push(changed))

  watcher.update([files[1]])

  t.alike(watcher.files, [files[1]])

  await settle()

  fs.writeFileSync(files[0], 'y')

  await settle()

  t.alike(runs, [], 'what left the set is no longer watched')

  fs.writeFileSync(files[1], 'y')

  await settle()

  t.alike(runs, [[files[1]]], 'and what joined it is')
})

test('a file that is deleted is reported', async (t) => {
  const { files } = await app(t, ['a.js'])

  const runs = []

  await watching(t, files, {}, (changed) => runs.push(changed))

  fs.unlinkSync(files[0])

  await settle()

  t.alike(runs, [[files[0]]])
})

test('a file replaced rather than written is reported', async (t) => {
  const { base, files } = await app(t, ['a.js'])

  const runs = []

  await watching(t, files, {}, (changed) => runs.push(changed))

  const temporary = path.join(base, '.a.js.tmp')

  fs.writeFileSync(temporary, 'y')
  fs.renameSync(temporary, files[0])

  await settle()

  t.alike(runs, [[files[0]]], 'so the file is watched through its directory')
})

test('a directory that is not there is skipped rather than thrown at', async (t) => {
  const { files } = await app(t, ['a.js'])

  const runs = []

  await watching(t, [...files, '/nowhere/at/all/b.js'], {}, (changed) => runs.push(changed))

  fs.writeFileSync(files[0], 'y')

  await settle()

  t.alike(runs, [[files[0]]])
})

test('nothing is reported while a run is in flight', async (t) => {
  const { files } = await app(t, ['a.js', 'b.js', 'c.js'])

  const runs = []

  let release = null

  await watching(t, files, {}, (changed) => {
    runs.push(changed)

    return new Promise((resolve) => {
      release = resolve
    })
  })

  fs.writeFileSync(files[0], 'y')

  await settle()

  t.is(runs.length, 1)

  fs.writeFileSync(files[1], 'y')
  fs.writeFileSync(files[2], 'y')

  await settle()

  t.is(runs.length, 1, 'the run is still in flight')

  release()

  await settle()

  t.is(runs.length, 2, 'and what waited is one run, not two')
  t.alike(runs[1].sort(), [files[1], files[2]].sort())
})

test('a run that fails does not wedge the watcher', async (t) => {
  const { files } = await app(t, ['a.js', 'b.js'])

  const runs = []

  await watching(t, files, {}, (changed) => {
    runs.push(changed)

    return Promise.reject(new Error('pack failed')).catch(() => {})
  })

  fs.writeFileSync(files[0], 'y')

  await settle()

  fs.writeFileSync(files[1], 'y')

  await settle()

  t.is(runs.length, 2)
})

test('a file rewritten with what it already held is not reported', async (t) => {
  const { files } = await app(t, ['built.js', 'a.js'])

  const runs = []

  await watching(t, files, {}, (changed) => runs.push(changed))

  fs.writeFileSync(files[0], 'x')

  await settle()

  t.alike(runs, [], 'the same bytes are not a change')

  fs.writeFileSync(files[0], 'y')

  await settle()

  t.alike(runs, [[files[0]]], 'and different ones are')
})
