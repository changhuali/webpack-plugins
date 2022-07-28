# @fruits-chain/export-2json-asset-webpack-plugin

A plugin to generate a json asset with your default exported value.

## Install

```shell
# NPM
npm install --save-dev @fruits-chain/export-2json-asset-webpack-plugin
# Yarn
yarn add -D @fruits-chain/export-2json-asset-webpack-plugin
```

## Examples

If you have the following file and webpack configuration

src/user.js

```js
const name = 'Bob'
const age = 21
export default {
  name,
  age,
}
```

webpack.config.js

```js
{
  plugins: [
    new Export2jsonAssetWebpackPlugin({
      entryPath: path.resolve(__dirname, 'src/user.js'),
      outputPath: 'user.json',
    }),
  ]
}
```

After the compilation, you'll get an asset named user.json, which contains the following contents

```json
{
  "name": "Bob",
  "age": 21
}
```

## Options

- `options.entryPath: string`

  An absolute path, the file in this path will be bundled and run in Node.js.

- `options.outputPath: string`

  A path relative to your webpack output dir, the file in this path will contain the value been exported by default in entry file.

## Notice

- Be sure that your code in `entryPath` is runnable in Node.js, if not, you'll get an error in compilation phase.
- Only the value exported by default will appear in the asset file.
