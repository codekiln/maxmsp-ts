# maxmsp-ts

CLI tool for building TypeScript projects and dependencies for usage in MaxMsp js object

## How to Use

For practical applications, you might want to check out:

- [How to use TypeScript in Max](https://github.com/aptrn/maxmsp-ts-example.git)
- [Write your own TypeScript library](https://github.com/aptrn/maxmsp-ts-library-template)

This repository contains the CLI tool called "maxmsp" used in those projects.

## Installation

The package is hosted on [npm](https://www.npmjs.com/package/@aptrn/maxmsp-ts). You can install it with:

```bash
npm install -D @aptrn/maxmsp-ts
```

## Available Commands

### `build`

Builds your project, copying over files and fixing require paths.

### `dev`

Builds any time a file in `src` changes.

### `rm <package-name>`

Removes the package from the maxmsp.config.json file.

### `add <package-name> [options]`

Adds a package to the maxmsp.config.json file.

Options:

- `--alias`: Optional. Sets the prefix for the copied files. Default is the package name.
- `--path`: Optional. Sets the path to the package. Default is the package name.
- `--files`: Optional. Sets the files to copy. Default is `index.js`.

## Todo

- [ ] Add "rename" command for renaming project and folder
- [ ] Find a way to auto-sanitize Max Project file structure
- [ ] Add a function to create patcher files from JSON, possibly "ui" or "main"
