// ------------------------------------------- Imports
const extractZipFile = require ("extract-zip");
const fs = require ("fs");
const fse = require ("fs-extra");
const path = require ("path");
const childProcess = require ("child_process");
const chalk = require ("chalk");
const os = require("os");
// ------------------------------------------- Methods
function getUserHomeDirectory () {
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

function getAndroidSdkPath () {
    if (os.platform () === "win32") {
        return `${getUserHomeDirectory ()}\\AppData\\Local\\Android\\Sdk\\build-tools`;
    } else if (os.platform () === "darwin") {
        return `~\\Library\\Android\\sdk\\build-tools`;
    } else {
        throw "This operating system is not supported!";
    }
}

function log (tag, message) {
    console.log (`${tag} ${message}`);
}  

function apkToZipFile (apkFile) {
    return new Promise ((resolve, reject) => {
        log (chalk.magenta (`[ApkToZipFile]`), `transforming ${chalk.green (".apk")} to ${chalk.green (".zip")}`);

        let zipFile = apkFile.substring (0, apkFile.lastIndexOf (".")) + ".zip";
        fs.copyFile (apkFile, zipFile, (error) => {
            if (error) {
                reject (error);
            } else {
                resolve (zipFile);
            }
        });
    });
}

function unzipFile (zipFile) {
    return new Promise ((resolve, reject) => {
        log (chalk.magenta (`[UnzipFile]`), `unzipping ${chalk.green (path.basename (zipFile))} file`);

        let outputFolder = zipFile.substring (0, zipFile.lastIndexOf (".")) + " - content";
       
        try {
            extractZipFile (zipFile, { dir: outputFolder }, (error) => {
                if (error) {
                    //reject (error);
                    resolve (outputFolder);
                } else {
                    resolve (outputFolder);
                }
            });
        } catch (e) {
            resolve (outputFolder);
        }
        
    });
}

function dumpDexFile (targetDirectory, dexFile, outputFile) {
    return new Promise ((resolve, reject) => {
        log (chalk.magenta (`[DumpDexFile]`), `running ${chalk.yellow ("dexdump.exe")} for ${chalk.cyan (path.basename (dexFile))}...`);

        const dexdumpTool = `${getAndroidSdkPath()}\\28.0.3\\dexdump.exe`;
        const command = `"${dexdumpTool}" "${dexFile}" > "${outputFile}"`;

        try {
            childProcess.exec (command, { cwd: targetDirectory }, (error, stdout, stderr) => {
                if (error) {
                    reject (error);
                } else if (stderr && stderr.length > 0) {
                    reject (stderr);
                } else {
                    log (chalk.magenta (`[DexdumpFile]`), `reading output log...`);
    
                    fs.readFile (outputFile, { encoding: "utf-8" }, (error, data) => {
                        if (error) {
                            reject (error);
                        } else {
                            resolve (data);
                        }
                    });
                }
            });
        } catch (e) {
            console.error (`${chalk.red ("[ERROR]")} There was an error while dumping the file!\n`, e);
            reject (e);
        }  
    });
}

function extractDexFilesFromDirectory (targetDirectory) {
    return new Promise (async (resolve, reject) => {
        log (chalk.magenta (`[ExtractDexFilesFromDirectory]`), `checking for classes.dex existence...`);

        let buffer = "";
        
        // We can have multiple dex-files
        for (var i = 1; true; i ++) {
            let dexCounterModifier = i == 1 ? "" : `${i}`;
            let dexfilePath = path.join (targetDirectory, `classes${dexCounterModifier}.dex`);
            let outputFile = path.join (targetDirectory, `dexdump${dexCounterModifier}.text`);
    
            if (fs.existsSync (dexfilePath)) {
                try {
                    let dexDumpResult = await dumpDexFile (targetDirectory, dexfilePath, outputFile);
                    buffer += "\n" + dexDumpResult;
                } catch (e) {
                    console.trace (e);
                }
            } else if (i == 1) {// None classes.dex found
                reject ("Dex file not found!");
            } else {
                break;
            }
        }
        
        if (!buffer || buffer.length <= 0) {
            reject ("Invalid dex files!");
        } else {
            resolve ({ dexdump: buffer, outputFolder: targetDirectory });
        }
    });    
}

function countReferences (regex, input) {
    log (chalk.magenta (`[CountReferences]`), `checking for ocurrences of ${chalk.cyan (decodeURI (regex.source))}...`);

    let occurrenceCount = 0;
    let result = null;

    while (result = regex.exec (input)) {
        occurrenceCount ++;
    }
    
    return occurrenceCount;
}

function checkForFlutterAssets (folder) {
    const fileCheckingList = [
        { path: path.join (folder, "assets", "flutter_assets"), weight: 1 },
        { path: path.join (folder, "assets", "flutter_shared"), weight: 1 } ,
        { path: path.join (folder, "lib", "armeabi-v7a", "libflutter.so"), weight: 10 } 
    ];
    
    let existingFilesCount = 0;
    for (var entry of fileCheckingList) {
        let file = entry.path;

        if (fs.existsSync (file)) {
            log (chalk.magenta (`[CheckForFlutterAssets]`), `Checking for ${chalk.yellow (path.basename (file))} flutter asset existence...`);
            existingFilesCount += entry.weight;
        } else {
            log (chalk.magenta (`[CheckForFlutterAssets]`), chalk.red (`File ${chalk.yellow (path.basename (file))} doesn't exists`));
        }
    }  
    
    let totalWeight = fileCheckingList.reduce ((a, b) => { return a + b["weight"]; }, 0);
    return (existingFilesCount / totalWeight) * 100;
}

function checkForIonicAssets (folder) {
    const fileCheckingList = [
        { path: path.join (folder, "assets", "www"), weight: 1 },
        { path: path.join (folder, "assets", "www", "cordova.js"), weight: 10 },
        { path: path.join (folder, "assets", "www", "cordova_plugins.js"), weight: 2 },
    ];
    
    let existingFilesCount = 0;
    for (var entry of fileCheckingList) {
        let file = entry.path;

        if (fs.existsSync (file)) {
            log (chalk.magenta (`[CheckForIonicAssets]`), `Checking for ${chalk.yellow (path.basename (file))} ionic asset existence...`);
            existingFilesCount += entry.weight;
        } else {
            log (chalk.magenta (`[CheckForIonicAssets]`), chalk.red (`File ${chalk.yellow (path.basename (file))} doesn't exists`));
        }
    }  
    
    let totalWeight = fileCheckingList.reduce ((a, b) => { return a + b["weight"]; }, 0);
    return (existingFilesCount / totalWeight) * 100;
}

function checkForReactAssets (folder) {
    const fileCheckingList = [
        { path: path.join (folder, "lib", "armeabi-v7a", "libreactnativejni.so"), weight: 10 } 
    ];
    
    let existingFilesCount = 0;
    for (var entry of fileCheckingList) {
        let file = entry.path;

        if (fs.existsSync (file)) {
            log (chalk.magenta (`[CheckForReactAssets]`), `Checking for ${chalk.yellow (path.basename (file))} react asset existence...`);
            existingFilesCount += entry.weight;
        } else {
            log (chalk.magenta (`[CheckForReactAssets]`), chalk.red (`File ${chalk.yellow (path.basename (file))} doesn't exists`));
        }
    }  
    
    let totalWeight = fileCheckingList.reduce ((a, b) => { return a + b["weight"]; }, 0);
    return (existingFilesCount / totalWeight) * 100;
}

function analyzeDexdumpOutput (dexdump, outputFile) {
    return new Promise ((resolve, reject) => {
        log (chalk.magenta (`[AnalyzeDexdumpOutput]`), `Starting platform analysis...`);

        if (!dexdump || dexdump.length <= 0) {
            reject ("Invalid dex dump output!");
        } else {
            let reactReferences = countReferences (/com\/facebook\/react/gi, dexdump);
            let reactAssetsCount = checkForReactAssets (outputFile);

            let flutterReferences = countReferences (/\bflutter\b/gi, dexdump);
            let flutterAssetsCount = checkForFlutterAssets (outputFile);

            let ionicReferences = countReferences (/\bionic\b/gi, dexdump);
            let ionicAssetsCount = checkForIonicAssets (outputFile);

            resolve ({
                react: {
                    references: reactReferences,
                    assets: reactAssetsCount
                },
                flutter: {
                    references: flutterReferences,
                    assets: flutterAssetsCount
                },
                ionic: {
                    references: ionicReferences,
                    assets: ionicAssetsCount
                }
            });
        }
    });
}

function deleteUnzippedFolder (folder) {
    return new Promise ((resolve, reject) => {
        log (chalk.magenta ("[DeleteUnzippedFolder]"), `deleting the previously extracted content...`);

        fs.exists (folder, (folderExists) => {
            if (folderExists) {
                fse.remove (folder, (error) => {
                    if (error) {
                        reject (error);
                    } else {
                        resolve ();
                    }
                })
            } else {
                resolve ("Folder doesn't exists!");
            }
        });
    });
}

function deleteZipFile (file) {
    return new Promise ((resolve, reject) => {
        log (chalk.magenta ("[DeleteZipFile]"), `deleting the previously zipped content...`);

        fs.exists (file, (fileExists) => {
            if (fileExists) {
                fse.remove (file, (error) => {
                    if (error) {
                        reject (error);
                    } else {
                        resolve ();
                    }
                })
            } else {
                resolve ("File doesn't exists!");
            }
        });
    });
}

function analyzeApk (file) {
    return new Promise ((resolve, reject) => {
        log (chalk.magenta (`\n[AnalyzeApk]`), `${chalk.yellow (path.basename (file))} analysis starting...`);
        let startTime = Date.now ();

        // 1 - Create a .zip file
        // 2 - Unzip the .zip file
        // 3 - Use the dexdump to output a dex-dump.txt file
        // 4 - Search for react native occurrence
        // 5 - Search for flutter occurrence
        apkToZipFile (file)
            .then (zipFile => unzipFile (zipFile))
            .then (outputFolder => extractDexFilesFromDirectory (outputFolder))
            .then (object => analyzeDexdumpOutput (object.dexdump, object.outputFolder))
            .then (result => {
                deleteUnzippedFolder (file.substring (0, file.lastIndexOf (".")) + " - content")
                deleteZipFile (file.substring (0, file.lastIndexOf (".")) + ".zip");

                let elapsedTime = Date.now () - startTime;
                console.log (`${chalk.magenta ("[Timer]")} Took ${chalk.gray (elapsedTime + "ms")}`);

                resolve (result)
            })
            .catch (error => {
                deleteUnzippedFolder (file.substring (0, file.lastIndexOf (".")) + " - content");
                deleteZipFile (file.substring (0, file.lastIndexOf (".")) + ".zip");

                console.error (chalk.red ("[ERROR]\n" + error));
                //console.trace (error);

                reject (error);
            });
    });
}

function predictPlatform (results) {
    let react = 0, flutter = 0, ionic = 0;

    // Reference checking
    if (results.react.references > results.flutter.references && results.react.references > results.ionic.references) {
        react ++;
    } else if (results.flutter.references > results.react.references && results.flutter.references > results.ionic.references) {
        flutter ++;
    } else if (results.ionic.references > results.flutter.references && results.ionic.references > results.react.references) {
        ionic ++;
    }

    if (results.ionic.assets > results.flutter.assets && results.ionic.assets > results.react.assets) {
        ionic ++;
    } else if (results.flutter.assets > results.ionic.assets && results.flutter.assets > results.react.assets) {
        flutter ++;
    } else if (results.react.assets > results.flutter.assets && results.react.assets > results.ionic.assets) {
        react ++;
    }

    if (react > flutter && react > ionic) {
        return "react";
    } else if (flutter > react && flutter > ionic) {
        return "flutter";
    } else if (ionic > flutter && ionic > react) {
        return "ionic";
    } else {
        return "unknown";
    }
}
// ------------------------------------------- Test rig
async function main () {
    const exampleDir = path.join (__dirname, "../", "examples");
    const exampleList = fse.readdirSync (exampleDir);
    
    let resultList = {};
    for (var apk of exampleList) {
        if (path.extname (apk) !== ".apk") continue;

        try {
            resultList[apk] = await analyzeApk (path.join (exampleDir, apk))
        } catch (e) {
            console.trace (e);
        }
    }

    for (var apk in resultList) {
        var results = resultList[apk];

        let prediction = predictPlatform (results);
        let style = {
            "react": "green",
            "flutter": "cyan",
            "ionic": "blue",
            "unknown": "bold"
        } [prediction];

        console.log (
            `\nOutput: ${chalk[style] (apk)}\n` +
            `${chalk.green ("React")} references in dex-dump: ${chalk.gray (results.react.references)}\n` +
            `${chalk.green ("React asset")} count: ${chalk.gray (results.react.assets + "%")}\n` +
            `${chalk.cyan ("Flutter")} references in dex-dump: ${chalk.gray (results.flutter.references)}\n` +
            `${chalk.cyan ("Flutter asset")} count: ${chalk.gray (results.flutter.assets + "%")}\n` +
            `${chalk.blue ("Ionic")} references in dex-dump: ${chalk.gray (results.ionic.references)}\n` +
            `${chalk.blue ("Ionic asset")} count: ${chalk.gray (results.ionic.assets + "%")}\n`
        );
    }
}

main ();