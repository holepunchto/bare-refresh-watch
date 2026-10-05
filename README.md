# bare-refresh-watch

Watch the files of a development build for changes. It watches a given set of files, such as the files a build packed, rather than a directory, so build output never needs to be ignored. A change is reported when the contents of a file change, once changes have stopped for a moment.

```
npm i bare-refresh-watch
```

## Usage

```js
const watch = require('bare-refresh-watch')

const watcher = watch(files, async (changed) => {
  // Rebuild
})

// Once the set of files has changed
watcher.update(files)

watcher.close()
```

## License

Apache-2.0
