#!/usr/bin/env node

// ------------------------------------------- Imports
const extractZipFile = require("extract-zip");
const fs = require("fs");
const fse = require("fs-extra");
const path = require("path");
const childProcess = require("child_process");
const chalk = require("chalk");
const os = require("os");
const args = require("args");
// ------------------------------------------- Constants
const DEXDUMP_EXECUTABLE = (process.platform == 'win32') ? `dexdump.exe` : `dexdump`;
// ------------------------------------------- Methods
function getUserHomeDirectory() {
    let home = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
    if (home && home.length > 0) return home;

    return os.homedir();
}

function getAndroidSdkPath() {
    if (os.platform() === "win32") {
        return `${getUserHomeDirectory()}\\AppData\\Local\\Android\\Sdk\\build-tools`;
    } else if (os.platform() === "darwin") {
        return path.join(os.homedir(), `Library/Android/sdk/build-tools`);
    } else {
        throw "This operating system is not supported!";
    }
}

function getLastAndroidSdkVersion() {
    // Gets the SDK root path
    let sdkPath = getAndroidSdkPath();
    // Lists all SDK versions installed on the host machine
    let files = fs.readdirSync(sdkPath);

    // Remove non-numeric chars and parse them as an integer
    let sdkList = files.map(x => ({ name: x, version: parseInt(x.replace(/^\d/g, "")) }));
    // Sort them
    sdkList = sdkList.sort((a, b) => a.version - b.version);

    // Return the latest
    let lastSDK = sdkList.find(x => x).name;
    if (!lastSDK) throw new Error("No Android SDK installed!");

    return path.join(sdkPath, lastSDK);
}

function log(tag, message) {
    console.log(`${tag} ${message}`);
}

function apkToZipFile(apkFile) {
    return new Promise((resolve, reject) => {
        log(chalk.magenta(`[ApkToZipFile]`), `transforming ${chalk.green(".apk")} to ${chalk.green(".zip")}`);

        let zipFile = apkFile.substring(0, apkFile.lastIndexOf(".")) + ".zip";
        fs.copyFile(apkFile, zipFile, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve(zipFile);
            }
        });
    });
}

function unzipFile(zipFile) {
    return new Promise((resolve, reject) => {
        log(chalk.magenta(`[UnzipFile]`), `unzipping ${chalk.green(path.basename(zipFile))} file`);

        let outputFolder = zipFile.substring(0, zipFile.lastIndexOf(".")) + " - content";

        try {
            extractZipFile(zipFile, { dir: outputFolder }, (error) => {
                if (error) {
                    reject (error);
                    //resolve(outputFolder);
                } else {
                    resolve(outputFolder);
                }
            });
        } catch (e) {
            resolve(outputFolder);
        }

    });
}

function dumpDexFile(targetDirectory, dexFile, outputFile) {
    return new Promise((resolve, reject) => {
        log(chalk.magenta(`[DumpDexFile]`), `running ${chalk.yellow(DEXDUMP_EXECUTABLE)} for ${chalk.cyan(path.basename(dexFile))}...`);

        const dexdumpTool = path.join(getLastAndroidSdkVersion(), DEXDUMP_EXECUTABLE);
        const command = `"${dexdumpTool}" "${dexFile}" > "${outputFile}"`;

        try {
            childProcess.exec(command, { cwd: targetDirectory }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else if (stderr && stderr.length > 0) {
                    reject(stderr);
                } else {
                    log(chalk.magenta(`[DexdumpFile]`), `reading output log...`);

                    fs.readFile(outputFile, { encoding: "utf-8" }, (error, data) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(data);
                        }
                    });
                }
            });
        } catch (e) {
            console.error(`${chalk.red("[ERROR]")} There was an error while dumping the file!\n`, e);
            reject(e);
        }
    });
}

function extractDexFilesFromDirectory(targetDirectory) {
    return new Promise(async (resolve, reject) => {
        log(chalk.magenta(`[ExtractDexFilesFromDirectory]`), `checking for classes.dex existence...`);

        let buffer = "";

        // We can have multiple dex-files
        for (var i = 1; true; i++) {
            let dexCounterModifier = i == 1 ? "" : `${i}`;
            let dexfilePath = path.join(targetDirectory, `classes${dexCounterModifier}.dex`);
            let outputFile = path.join(targetDirectory, `dexdump${dexCounterModifier}.text`);

            if (fs.existsSync(dexfilePath)) {
                try {
                    let dexDumpResult = await dumpDexFile(targetDirectory, dexfilePath, outputFile);
                    buffer += "\n" + dexDumpResult;
                } catch (e) {
                    console.trace(e);
                }
            } else if (i == 1) {// None classes.dex found
                reject("Dex file not found!");
            } else {
                break;
            }
        }

        if (!buffer || buffer.length <= 0) {
            reject("Invalid dex files!");
        } else {
            resolve({ dexdump: buffer, outputFolder: targetDirectory });
        }
    });
}

function countReferences(regex, input) {
    log(chalk.magenta(`[CountReferences]`), `checking for ocurrences of ${chalk.cyan(decodeURI(regex.source))}...`);

    let occurrenceCount = 0;
    let result = null;

    while (result = regex.exec(input)) {
        occurrenceCount++;
    }

    return occurrenceCount;
}

function checkForFlutterAssets(folder) {
    const fileCheckingList = [
        { path: path.join(folder, "assets", "flutter_assets"), weight: 1 },
        { path: path.join(folder, "assets", "flutter_shared"), weight: 1 },
        { path: path.join(folder, "lib", "armeabi-v7a", "libflutter.so"), weight: 10 }
    ];

    let existingFilesCount = 0;
    for (var entry of fileCheckingList) {
        let file = entry.path;

        if (fs.existsSync(file)) {
            log(chalk.magenta(`[CheckForFlutterAssets]`), `Checking for ${chalk.yellow(path.basename(file))} flutter asset existence...`);
            existingFilesCount += entry.weight;
        } else {
            log(chalk.magenta(`[CheckForFlutterAssets]`), chalk.red(`File ${chalk.yellow(path.basename(file))} doesn't exists`));
        }
    }

    let totalWeight = fileCheckingList.reduce((a, b) => { return a + b["weight"]; }, 0);
    return (existingFilesCount / totalWeight) * 100;
}

function checkForCordovaAssets(folder) {
    const fileCheckingList = [
        { path: path.join(folder, "assets", "www"), weight: 1 },
        { path: path.join(folder, "assets", "www", "cordova.js"), weight: 10 },
        { path: path.join(folder, "assets", "www", "cordova_plugins.js"), weight: 2 },
    ];

    let existingFilesCount = 0;
    for (var entry of fileCheckingList) {
        let file = entry.path;

        if (fs.existsSync(file)) {
            log(chalk.magenta(`[CheckForCordovaAssets]`), `Checking for ${chalk.yellow(path.basename(file))} cordova asset existence...`);
            existingFilesCount += entry.weight;
        } else {
            log(chalk.magenta(`[CheckForCordovaAssets]`), chalk.red(`File ${chalk.yellow(path.basename(file))} doesn't exists`));
        }
    }

    let totalWeight = fileCheckingList.reduce((a, b) => { return a + b["weight"]; }, 0);
    return (existingFilesCount / totalWeight) * 100;
}

function checkForReactAssets(folder) {
    const fileCheckingList = [
        { path: path.join(folder, "lib", "armeabi-v7a", "libreactnativejni.so"), weight: 10 }
    ];

    let existingFilesCount = 0;
    for (var entry of fileCheckingList) {
        let file = entry.path;

        if (fs.existsSync(file)) {
            log(chalk.magenta(`[CheckForReactAssets]`), `Checking for ${chalk.yellow(path.basename(file))} react asset existence...`);
            existingFilesCount += entry.weight;
        } else {
            log(chalk.magenta(`[CheckForReactAssets]`), chalk.red(`File ${chalk.yellow(path.basename(file))} doesn't exists`));
        }
    }

    let totalWeight = fileCheckingList.reduce((a, b) => { return a + b["weight"]; }, 0);
    return (existingFilesCount / totalWeight) * 100;
}

function analyzeDexdumpOutput(dexdump, outputFile) {
    return new Promise((resolve, reject) => {
        log(chalk.magenta(`[AnalyzeDexdumpOutput]`), `Starting platform analysis...`);

        if (!dexdump || dexdump.length <= 0) {
            reject("Invalid dex dump output!");
        } else {
            let reactReferences = countReferences(/com\/facebook\/react/gi, dexdump);
            let reactAssetsCount = checkForReactAssets(outputFile);

            let flutterReferences = countReferences(/\bflutter\b/gi, dexdump);
            let flutterAssetsCount = checkForFlutterAssets(outputFile);

            let cordovaReferences = countReferences(/(\bionic\b)|(\bcordova\b)|(\bphonegap\b)/gi, dexdump);
            let cordovaAssetsCount = checkForCordovaAssets(outputFile);

            resolve({
                react: {
                    references: reactReferences,
                    assets: reactAssetsCount
                },
                flutter: {
                    references: flutterReferences,
                    assets: flutterAssetsCount
                },
                cordova: {
                    references: cordovaReferences,
                    assets: cordovaAssetsCount
                }
            });
        }
    });
}

function deleteUnzippedFolder(folder) {
    return new Promise((resolve, reject) => {
        log(chalk.magenta("[DeleteUnzippedFolder]"), `deleting the previously extracted content...`);

        fs.exists(folder, (folderExists) => {
            if (folderExists) {
                fse.remove(folder, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                })
            } else {
                resolve("Folder doesn't exists!");
            }
        });
    });
}

function deleteZipFile(file) {
    return new Promise((resolve, reject) => {
        log(chalk.magenta("[DeleteZipFile]"), `deleting the previously zipped content...`);

        fs.exists(file, (fileExists) => {
            if (fileExists) {
                fse.remove(file, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                })
            } else {
                resolve("File doesn't exists!");
            }
        });
    });
}

function analyzeApk(file) {
    return new Promise((resolve, reject) => {
        log(chalk.magenta(`\n[AnalyzeApk]`), `${chalk.yellow(path.basename(file))} analysis starting...`);
        let startTime = Date.now();

        // 1 - Create a .zip file
        // 2 - Unzip the .zip file
        // 3 - Use the dexdump to output a dex-dump.txt file
        // 4 - Search for react native occurrence
        // 5 - Search for flutter occurrence
        apkToZipFile(file)
            .then(zipFile => unzipFile(zipFile))
            .then(outputFolder => extractDexFilesFromDirectory(outputFolder))
            .then(object => analyzeDexdumpOutput(object.dexdump, object.outputFolder))
            .then(result => {
                deleteUnzippedFolder(file.substring(0, file.lastIndexOf(".")) + " - content")
                deleteZipFile(file.substring(0, file.lastIndexOf(".")) + ".zip");

                let elapsedTime = Date.now() - startTime;
                console.log(`${chalk.magenta("[Timer]")} Took ${chalk.gray(elapsedTime + "ms")}`);

                resolve(result)
            })
            .catch(error => {
                deleteUnzippedFolder(file.substring(0, file.lastIndexOf(".")) + " - content");
                deleteZipFile(file.substring(0, file.lastIndexOf(".")) + ".zip");

                console.error(chalk.red("[ERROR]\n" + error));
                //console.trace (error);

                reject(error);
            });
    });
}

function predictPlatform(results) {
    if (!results) return;

    let react = 0, flutter = 0, cordova = 0;


    // Reference checking
    if (results.react.references > results.flutter.references && results.react.references > results.cordova.references) {
        react++;
    } else if (results.flutter.references > results.react.references && results.flutter.references > results.cordova.references) {
        flutter++;
    } else if (results.cordova.references > results.flutter.references && results.cordova.references > results.react.references) {
        cordova++;
    }

    if (results.cordova.assets > results.flutter.assets && results.cordova.assets > results.react.assets) {
        cordova++;
    } else if (results.flutter.assets > results.cordova.assets && results.flutter.assets > results.react.assets) {
        flutter++;
    } else if (results.react.assets > results.flutter.assets && results.react.assets > results.cordova.assets) {
        react++;
    }

    if (react > flutter && react > cordova) {
        return "react";
    } else if (flutter > react && flutter > cordova) {
        return "flutter";
    } else if (cordova > flutter && cordova > react) {
        return "cordova";
    } else {
        return "unknown";
    }
}
// ------------------------------------------- Test rig
async function presentPlatformPrediction(results, file) {
    let prediction = predictPlatform(results);
    let style = {
        "react": "green",
        "flutter": "cyan",
        "cordova": "blue",
        "unknown": "bold"
    }[prediction];

    if (prediction === "unknown") prediction = "Probably native";

    console.log(
        `\nOutput: ${chalk[style](file)}\n` +
        `Estimated to be: ${chalk[style](prediction.toUpperCase())}\n\n` +

        `${chalk.green("React")} references in dex-dump: ${chalk.gray(results.react.references)}\n` +
        `${chalk.green("React asset")} count: ${chalk.gray(results.react.assets + "%")}\n` +

        `${chalk.cyan("Flutter")} references in dex-dump: ${chalk.gray(results.flutter.references)}\n` +
        `${chalk.cyan("Flutter asset")} count: ${chalk.gray(results.flutter.assets + "%")}\n` +

        `${chalk.blue("Cordova-like")} references in dex-dump: ${chalk.gray(results.cordova.references)}\n` +
        `${chalk.blue("Cordova-like asset")} count: ${chalk.gray(results.cordova.assets + "%")}\n`
    );
}

async function main() {
    // Define CLI arguments
    args.option("file", "Provide a single .apk to be classified")
        .option("directory", "Provides a hole directory, containing multiple .apk files to be classified");
    const flags = args.parse(process.argv);

    let filesToProcess = [];

    // Process them
    if (flags.file) {
        filesToProcess = flags.file;
        if (!Array.isArray(filesToProcess)) filesToProcess = [filesToProcess];
    } else if (flags.directory) {
        // Multiple files
        filesToProcess = fs.readdirSync(args.directory)
                           .filter(x => x.endsWith(".apk"))
                           .map(x => path.join(args.directory, x));

    } else {
        console.log("Invalid usage\n\n");
        args.showHelp();

        return;
    }

    try {
        // Analyze every file
        let results = {};
        for (let file of filesToProcess) {
            results[file] = await analyzeApk(path.resolve(file));
        }

        // Show their respective predictions
        for (let fileName in results) {
            if (!results.hasOwnProperty(fileName)) continue;

            await presentPlatformPrediction(results[fileName], fileName);
        }
    } catch (e) {
        console.error(chalk.red(e));
        console.trace(e);
    }
}

main();