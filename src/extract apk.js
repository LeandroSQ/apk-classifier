// ------------------------------------------- Imports
const childProcess = require ("child_process");
const args = require ("args");
// ------------------------------------------- Definitions
function getUserHomeDirectory () {
    return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

function getAndroidSdkPath () {
    if (os.platform () === "win32") {
        return `${getUserHomeDirectory ()}\\AppData\\Local\\Android\\Sdk`;
    } else if (os.platform () === "darwin") {
        return `~\\Library\\Android\\sdk`;
    } else {
        throw "This operating system is not supported!";
    }
}

const adb = `${getAndroidSdkPath ()}\\platform-tools\\adb.exe`;

function execute (command) {
    return new Promise ((resolve, reject) => {
        childProcess.exec (command, (error, stdout, stderr) => {
            if (error) {
                reject (error);     
            } else if (stderr && stderr.length > 0) {
                reject (stderr);
            } else {
                resolve (stdout);
            }
        });
    });
}
// ------------------------------------------- Function definition
function getApkPathInDevice (package) {
    return new Promise ((resolve, reject) => {
        let command = `${adb} shell pm path "${package}"`;

        execute (command)
            .then (output => {
                output = output.trim ().replace (/^package\:/g, "");
                let paths = output.split ("\n");

                resolve (paths[0].trim ());
            })
            .catch (error => reject (error));;
    });
}

function extractApkToFolder (apkPath, outputFolder) {
    return new Promise ((resolve, reject) => {
        let command = `${adb} pull "${apkPath}" "${outputFolder}"`;

        execute (command)
            .then (output => resolve (output))
            .catch (error => reject (error));;
    });
}

function listAllInstalledPackages () {
    return new Promise ((resolve, reject) => {
        let command = `${adb} shell pm list package -f 3`;
        
        execute (command)
            .then (output => resolve (output))
            .catch (error => reject (error));
    });
}
// ------------------------------------------- Command definition
args
    .command ("list", "List all installed packages", async (name, sub, options) => {
        let output = await listAllInstalledPackages ();
        console.log (output);
    })
    .option ("package", "The package name of the application", [ "p" ])
    .option ("output", "The output path for the file", [ "o" ])
    .command ("extract", "Extract an APK", async (name, sub, options) => {
        if (!options.package && options.package.length < 0) {
            console.error (chalk.red ("Please, provide a Package!"));
        } else if (!options.output && options.output.length < 0) {
            console.error (chalk.red ("Please, provide an Output!"));
        } else {
            let apkPath = await getApkPathInDevice (options.package);
            await extractApkToFolder (apkPath, options.output);
        }
    });

args.parse (process.argv);
// ------------------------------------------- Scripting