import { exec, spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import chokidar from "chokidar";

interface Dependency {
  alias: string;
  files: string[];
  path: string;
}

interface Config {
  output_path: string;
  dependencies: Record<string, Dependency>;
}

interface AddOptions {
  alias?: string;
  files?: string;
  path?: string;
}

const [, , command, ...args] = process.argv;

const configFilePath = path.join(process.cwd(), "maxmsp.config.json");

// Function to read or create the config file
async function readOrCreateConfig(): Promise<Config> {
  try {
    await fs.access(configFilePath); // Check if the config file exists
    const configContent = await fs.readFile(configFilePath, "utf-8");
    return JSON.parse(configContent) as Config; // Cast to Config type
  } catch {
    const initialConfig: Config = {
      output_path: "lib",
      dependencies: {},
    };
    await fs.writeFile(configFilePath, JSON.stringify(initialConfig, null, 2));
    console.log("maxmsp.config.json created.");
    return initialConfig;
  }
}

// Function to save the config file
async function saveConfig(config: Config) {
  await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
}

// Function to copy and rename files for dependencies
async function copyAndRenameFiles(
  src: string,
  dest: string,
  alias: string,
  files: string[]
) {
  try {
    // Create the full destination path based on tsconfig output dir and alias path
    const targetDir = path.join(dest, alias); // Create a directory for alias
    await fs.mkdir(targetDir, { recursive: true });

    for (let file of files) {
      const srcPath = path.join(src, file);
      const newName = `${alias}_${file}`; // Prepend alias to the original file name
      const destPath = path.join(targetDir, newName); // Use targetDir

      await fs.copyFile(srcPath, destPath);
      console.log(`Copied ${srcPath} to ${destPath}`);
    }
  } catch (error) {
    console.error(`Error copying files from ${src} to ${dest}:`, error);
  }
}

// Function to replace require statements in a file
async function replaceInFile(
  filePath: string,
  alias: string,
  libraryName: string
) {
  try {
    let content = await fs.readFile(filePath, "utf8");
    // Replace require statements for the specific libraryName
    const newRequirePath = `require("lib/${alias}/${alias}_index.js")`;
    content = content.replace(
      new RegExp(`require\\("${libraryName}"\\)`, "g"),
      newRequirePath
    );

    await fs.writeFile(filePath, content, "utf8");
    console.log(`Updated require statements in ${filePath}`);
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
  }
}

// Function to process all JavaScript files in a directory
async function processDirectory(dir: string, alias: string) {
  try {
    const files = await fs.readdir(dir);
    for (let file of files) {
      if (path.extname(file) === ".js") {
        const filePath = path.join(dir, file);
        await replaceInFile(filePath, alias, path.basename(dir)); // Pass the library name for replacement
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dir}:`, error);
  }
}
// Function to get output directory from tsconfig.json
async function getTsConfigOutputDir(): Promise<string> {
  const tsConfigPath = path.join(process.cwd(), "tsconfig.json");

  try {
    const tsConfigContent = await fs.readFile(tsConfigPath, "utf-8");
    const tsConfig = JSON.parse(tsConfigContent);

    // Return outDir if it exists, otherwise return a default value
    return tsConfig.compilerOptions?.outDir || "dist"; // Default to "dist" if not specified
  } catch (error) {
    console.error(`Error reading tsconfig.json:`, error);
    return "dist"; // Fallback output directory
  }
}

// Post-build command logic
async function postBuild() {
  const config = await readOrCreateConfig();

  // Get the output directory from tsconfig.json
  const tsConfigOutputDir = await getTsConfigOutputDir();

  // Define output directory based on config
  const outputDir = path.join(tsConfigOutputDir, config.output_path); // Full path for output

  for (const [
    packageName,
    { alias, files, path: relativePath },
  ] of Object.entries(config.dependencies)) {
    const sourceDir = path.join(
      process.cwd(),
      "node_modules",
      packageName,
      "dist"
    );

    // Construct target directory based on tsconfig output dir, output_path, and relativePath
    const targetDir = path.join(outputDir, relativePath); // e.g., tsconfigOutputDir/lib/ciaone

    // Copy and rename files for each dependency
    await copyAndRenameFiles(sourceDir, targetDir, alias, files);

    // Process JavaScript files in the source directory (not copied over)
    const processedFiles = await fs.readdir(sourceDir);

    for (let file of processedFiles) {
      if (path.extname(file) === ".js" && !files.includes(file)) {
        // Only process non-copied files
        const filePath = path.join(sourceDir, file);
        await replaceInFile(filePath, alias, packageName); // Pass library name for replacement
      }
    }
  }

  console.log("Post-build completed successfully.");
}

// Init command logic
async function init() {
  await readOrCreateConfig();
}

// Function to check if a library is installed
async function isLibraryInstalled(libraryName: string): Promise<boolean> {
  const packageJsonPath = path.join(process.cwd(), "package.json");

  try {
    const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent);

    // Check both dependencies and devDependencies
    return (
      (packageJson.dependencies && packageJson.dependencies[libraryName]) ||
      (packageJson.devDependencies && packageJson.devDependencies[libraryName])
    );
  } catch (error) {
    console.error(`Error reading package.json:`, error);
    return false;
  }
}

// Add command logic
async function add(libraryName: string, options: AddOptions) {
  const config = await readOrCreateConfig();

  // Check if the library is installed
  const isInstalled = await isLibraryInstalled(libraryName);
  if (!isInstalled) {
    console.error(
      `${libraryName} is not installed. Please install it with pnpm i -D ${libraryName}`
    );
    process.exit(1);
  }

  // Default values for the new dependency
  const alias = options.alias || libraryName;

  // Process the files option if provided
  let files: string[] = [];
  if (typeof options.files === "string") {
    files = options.files.split(",").map((file) => file.trim());
  } else {
    files = ["index.js"];
  }

  const pathValue = options.path || "";

  // Add dependency
  config.dependencies[libraryName] = { alias, files, path: pathValue };

  await saveConfig(config);
  console.log(`Added dependency ${libraryName} with alias ${alias}.`);
}

// Remove command logic
async function remove(libraryName: string) {
  const config = await readOrCreateConfig();

  // Remove dependency if it exists
  if (config.dependencies[libraryName]) {
    delete config.dependencies[libraryName];
    await saveConfig(config);
    console.log(`Removed dependency ${libraryName}.`);
  } else {
    console.error(`Dependency ${libraryName} not found.`);
  }
}

// Build command logic
async function build() {
  return new Promise((resolve, reject) => {
    const tsc = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["tsc"],
      { stdio: "inherit", shell: true }
    );

    tsc.on("close", async (code) => {
      if (code !== 0) {
        reject(new Error(`TypeScript compilation failed with code ${code}`));
        return;
      }

      try {
        await postBuild();
        resolve(true);
      } catch (postBuildError) {
        reject(postBuildError);
      }
    });

    tsc.on("error", (error) => reject(error));
  });
}

// Dev command logic with file watching
async function dev() {
  console.log("Starting watch mode...");

  const srcDir = path.join(process.cwd(), "src");

  // Watch for changes in .ts and .json files within src directory
  const watcher = chokidar.watch([`${srcDir}/**/*.ts`, `${srcDir}/**/*.json`], {
    ignored: /(^|[\/\\])\../,
    persistent: true,
  });

  watcher.on("ready", () => {
    console.log("Initial scan complete. Watching for file changes...");

    // Initial build on start
    build().catch((err) => console.error("Initial build failed:", err.message));
  });

  watcher.on("change", (filePath: string) => {
    console.log(`File ${filePath} has been changed.`);

    // Run build on change
    build().catch((err) => console.error("Build failed:", err.message));
  });

  watcher.on("error", (error: string) =>
    console.error("Watcher error:", error)
  );

  process.on("SIGINT", () => {
    console.log("Watch mode terminated.");
    watcher.close();
    process.exit(0);
  });
}

// Command handling
(async () => {
  switch (command) {
    case "build":
      try {
        await build();
        console.log("Build and post-build completed successfully.");
      } catch (err) {
        console.error("Build failed:", err);
        process.exit(1);
      }
      break;

    case "dev":
      dev(); // Call the new dev function with watching capability.
      break;

    case "init":
      await init();
      break;

    case "add":
      const libraryNameToAdd = args[0];
      const optionsToAdd: AddOptions = {};

      args.forEach((arg, index) => {
        if (arg === "--alias") optionsToAdd.alias = args[index + 1];
        if (arg === "--files") optionsToAdd.files = args[index + 1];
        if (arg === "--path") optionsToAdd.path = args[index + 1];
      });

      if (!libraryNameToAdd) {
        console.error("Please specify a library name to add.");
        process.exit(1);
      }

      await add(libraryNameToAdd, optionsToAdd);
      break;

    case "rm":
      const libraryNameToRemove = args[0];

      if (!libraryNameToRemove) {
        console.error("Please specify a library name to remove.");
        process.exit(1);
      }

      await remove(libraryNameToRemove);
      break;

    default:
      console.log(
        "Unknown command. Use build, dev, init, add <libraryName>, or rm <libraryName>."
      );
  }
})();
